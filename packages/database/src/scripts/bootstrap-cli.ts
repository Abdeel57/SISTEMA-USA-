/**
 * `pnpm --filter @app/database db:bootstrap`
 *
 * Deja una base de datos gestionada (Railway, DEC-043) lista para servir, en
 * un solo paso y de forma idempotente. Corre en cada despliegue.
 *
 * POR QUE EXISTE ESTE SCRIPT Y NO BASTA `db:migrate`
 * -------------------------------------------------
 * `db:migrate` exige `DATABASE_URL_MIGRATOR`, es decir el rol `app_migrator`.
 * En una base recien creada ese rol **todavia no existe**: lo crea la propia
 * migracion `0000_baseline.sql`. Y aunque existiera, se crea con `LOGIN` pero
 * SIN contrasena a proposito (principios 19 y 20 de `CLAUDE.md`: una
 * contrasena en una migracion es una contrasena versionada), de modo que no
 * puede autenticarse.
 *
 * Es un arranque en frio circular. En una instalacion autogestionada lo
 * resuelve el gestor de secretos antes del primer despliegue. En un proveedor
 * gestionado no hay tal momento: lo unico que existe desde el minuto cero es
 * el superusuario que crea el proveedor.
 *
 * Asi que este script hace, en orden:
 *
 *   1. Aplica las migraciones con el superusuario del proveedor. Es la
 *      desviacion de DEC-003 que DEC-043 documenta: en un Postgres gestionado
 *      no se puede separar `migrator` del propietario del esquema, porque el
 *      proveedor no cede la propiedad de `public`. La separacion que SI se
 *      conserva -y que es la que protege el ledger- es la del rol de la
 *      aplicacion: `app_runtime` nunca recibe UPDATE/DELETE sobre ledger ni
 *      auditoria, y eso lo garantizan los GRANT explicitos de cada migracion,
 *      que se aplican igual sea quien sea el que las ejecute.
 *
 *   2. Asigna contrasena a los tres roles. Las contrasenas llegan por entorno
 *      desde el gestor de variables del proveedor; este archivo no contiene
 *      ninguna, ni de ejemplo.
 *
 *   3. Copia la marca inicial de `@app/brand` a `brand_profile`, solo mientras
 *      nadie la haya editado desde el panel (`updated_by_admin_user_id IS
 *      NULL`). En cuanto el panel guarda, manda el panel.
 *
 *   4. Plantilla: crea (o pone al dia) el administrador del panel a partir de
 *      ADMIN_EMAIL y ADMIN_PASSWORD, con todos los roles de personal. Cambiar
 *      ADMIN_PASSWORD y redesplegar es la forma de cambiar SU contrasena. Si
 *      se configura CLIENT_ADMIN_EMAIL y CLIENT_ADMIN_PASSWORD, crea tambien la
 *      cuenta del cliente, con la misma autoridad; esa contrasena es solo la
 *      INICIAL (el cliente la cambia en "Mi cuenta" y ningun despliegue la
 *      vuelve a tocar).
 *
 * Ejecutarlo dos veces no cambia nada: las migraciones ya aplicadas se saltan
 * y `ALTER ROLE` es idempotente.
 */

import { BRAND, brandProfileProblems } from "@app/brand";
import { hashPassword, MINIMUM_PASSWORD_LENGTH, verifyPassword } from "@app/security";
import { Client } from "pg";

import { runMigrations } from "../migrate.js";

interface RolePassword {
  readonly role: string;
  readonly password: string;
  readonly variable: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];

  if (value === undefined || value.trim() === "") {
    console.error(`[bootstrap] Falta ${name}.`);
    process.exit(1);
  }

  return value;
}

/**
 * Asigna la contrasena sin interpolar nunca el valor en el texto del SQL.
 *
 * `ALTER ROLE ... PASSWORD $1` no es valido en PostgreSQL: la contrasena debe
 * ir como literal. Concatenarla a mano seria una inyeccion esperando a una
 * contrasena con comilla simple. El rodeo es pasarla como parametro a
 * `set_config` y dejar que `format('%L')` la escape dentro del motor.
 *
 * `set_config(..., true)` la limita a la transaccion en curso, de modo que no
 * queda en la sesion despues del `COMMIT`.
 */
async function setRolePassword(client: Client, entry: RolePassword): Promise<void> {
  await client.query("BEGIN");

  try {
    // Ni la contrasena ni el nombre del rol se concatenan al texto del SQL:
    // ambos viajan como parametros y los escapa `format` dentro del motor.
    await client.query("SELECT set_config('app.bootstrap_password', $1, true)", [entry.password]);
    await client.query("SELECT set_config('app.bootstrap_role', $1, true)", [entry.role]);
    await client.query(`
      DO $bootstrap$
      DECLARE
        target text := current_setting('app.bootstrap_role');
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = target) THEN
          RAISE EXCEPTION 'El rol % no existe despues de migrar.', target;
        END IF;

        EXECUTE format(
          'ALTER ROLE %I WITH PASSWORD %L',
          target,
          current_setting('app.bootstrap_password')
        );
      END
      $bootstrap$;
    `);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

/**
 * Paso 3: la marca inicial del archivo, a `brand_profile`.
 *
 * Solo mientras nadie haya guardado desde el panel: un despliegue no puede
 * deshacer lo que el administrador eligio. Los colores y el logotipo no estan
 * en el archivo (viven en el panel), asi que no se tocan.
 */
async function syncBrandProfile(client: Client): Promise<void> {
  const result = await client.query(
    `UPDATE brand_profile
        SET name = $1, wordmark_lead = $2, wordmark_tail = $3,
            legal_name = $4, legal_entity = $5, governing_law_state = $6, venue = $7,
            street = $8, city_state_zip = $9,
            contact_email = $10, domain = $11, time_zone = $12,
            order_number_prefix = $13, entry_number_prefix = $14
      WHERE id = 1 AND updated_by_admin_user_id IS NULL`,
    [
      BRAND.name,
      BRAND.wordmark.lead,
      BRAND.wordmark.tail,
      BRAND.legal.name,
      BRAND.legal.entityDescription,
      BRAND.legal.governingLawState,
      BRAND.legal.venue,
      BRAND.legal.address.street,
      BRAND.legal.address.cityStateZip,
      BRAND.contact.email,
      BRAND.domain.toLowerCase(),
      BRAND.timeZone,
      BRAND.numbering.orderPrefix,
      BRAND.numbering.entryPrefix,
    ],
  );
  console.error(
    (result.rowCount ?? 0) > 0
      ? "[bootstrap]   marca: valores iniciales copiados desde packages/brand"
      : "[bootstrap]   marca: editada desde el panel; el archivo no la toca",
  );
}

/**
 * Una cuenta del panel que se crea desde variables de entorno.
 *
 * `passwordPolicy` decide que pasa con la contrasena cuando la cuenta YA
 * existe:
 *
 *   - `SYNC` (el administrador de la plantilla, ADMIN_*): la variable manda.
 *     Si cambio, se fija la nueva y se cierran sus sesiones. Es la forma de
 *     recuperar el acceso de quien despliega.
 *   - `ON_CREATE` (la cuenta del cliente, CLIENT_ADMIN_*): la variable es solo
 *     la contrasena INICIAL. Despues la cambia el cliente en "Mi cuenta"
 *     (`POST /auth/password`), y un despliegue no puede deshacerlo.
 */
interface StaffAccountSpec {
  /** Prefijo de las variables, para los mensajes: `ADMIN` o `CLIENT_ADMIN`. */
  readonly prefix: string;
  readonly email: string;
  readonly password: string;
  readonly fullName: string;
  readonly passwordPolicy: "SYNC" | "ON_CREATE";
  readonly grantReason: string;
}

/** Lee `<prefijo>_EMAIL`, `_PASSWORD` y `_NAME`; `null` si faltan correo o contrasena. */
function staffAccountFromEnv(
  prefix: string,
  defaults: Pick<StaffAccountSpec, "fullName" | "passwordPolicy" | "grantReason">,
): StaffAccountSpec | null {
  const email = (process.env[`${prefix}_EMAIL`] ?? "").trim().toLowerCase();
  const password = process.env[`${prefix}_PASSWORD`] ?? "";
  const fullName = (process.env[`${prefix}_NAME`] ?? "").trim() || defaults.fullName;

  if (email === "" || password === "") return null;

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(email)) {
    console.error(`[bootstrap] ${prefix}_EMAIL no parece un correo: ${email}`);
    process.exit(1);
  }

  if (password.length < MINIMUM_PASSWORD_LENGTH) {
    console.error(
      `[bootstrap] ${prefix}_PASSWORD debe tener al menos ${String(MINIMUM_PASSWORD_LENGTH)} caracteres.`,
    );
    process.exit(1);
  }

  return {
    prefix,
    email,
    password,
    fullName,
    passwordPolicy: defaults.passwordPolicy,
    grantReason: defaults.grantReason,
  };
}

/**
 * Paso 4: las cuentas del panel.
 *
 * El administrador de la plantilla (ADMIN_*) y, si se configura, la cuenta del
 * cliente (CLIENT_ADMIN_*). Las dos con TODOS los roles de personal, sin
 * segundo factor. Si ya existen, se ponen al dia: vuelven a ACTIVE y reciben
 * los roles que les falten. La contrasena, segun `passwordPolicy`.
 */
async function ensureStaffAccounts(client: Client): Promise<void> {
  const admin = staffAccountFromEnv("ADMIN", {
    fullName: "Administrador",
    passwordPolicy: "SYNC",
    grantReason: "administrador de la plantilla (db:bootstrap)",
  });
  const clientAdmin = staffAccountFromEnv("CLIENT_ADMIN", {
    fullName: "Cliente",
    passwordPolicy: "ON_CREATE",
    grantReason: "cuenta del cliente (db:bootstrap)",
  });

  if (admin === null) {
    console.error(
      "[bootstrap]   sin ADMIN_EMAIL o ADMIN_PASSWORD: no se crea ni se toca el administrador.",
    );
  } else {
    await ensureStaffAccount(client, admin);
  }

  if (clientAdmin === null) return;

  // La misma cuenta con dos politicas de contrasena se pisaria en cada despliegue.
  if (admin !== null && admin.email === clientAdmin.email) {
    console.error(
      "[bootstrap]   CLIENT_ADMIN_EMAIL es el mismo que ADMIN_EMAIL: la cuenta del cliente se ignora.",
    );
    return;
  }

  await ensureStaffAccount(client, clientAdmin);
}

async function ensureStaffAccount(client: Client, account: StaffAccountSpec): Promise<void> {
  const { email, password, fullName } = account;

  await client.query("BEGIN");

  try {
    const found = await client.query<{ id: string }>(
      "SELECT id FROM identities WHERE email_normalized = lower(btrim($1)) LIMIT 1",
      [email],
    );

    let identityId = found.rows[0]?.id;

    if (identityId === undefined) {
      // El correo se da por verificado: lo pone quien despliega.
      const inserted = await client.query<{ id: string }>(
        "INSERT INTO identities (email, status, email_verified_at) VALUES ($1, 'ACTIVE', now()) RETURNING id",
        [email],
      );
      identityId = inserted.rows[0]?.id;
      if (identityId === undefined) {
        throw new Error("identity_insert_returned_no_row");
      }
      console.error(`[bootstrap]   ${account.prefix} ${email}: identidad creada`);
    }

    const credential = await client.query<{ password_hash: string }>(
      "SELECT password_hash FROM identity_credentials WHERE identity_id = $1",
      [identityId],
    );
    const currentHash = credential.rows[0]?.password_hash;

    if (currentHash === undefined) {
      await client.query(
        "INSERT INTO identity_credentials (identity_id, password_hash) VALUES ($1, $2)",
        [identityId, await hashPassword(password)],
      );
      console.error(`[bootstrap]   ${account.prefix} ${email}: contrasena inicial fijada`);
    } else if (
      // Con `ON_CREATE` la cuenta ya tiene contrasena y es SUYA: no se toca.
      account.passwordPolicy === "SYNC" &&
      !(await verifyPassword(password, currentHash))
    ) {
      await client.query(
        `UPDATE identity_credentials
            SET password_hash = $2, password_set_at = now(), failed_attempts = 0,
                locked_until = NULL, updated_at = now()
          WHERE identity_id = $1`,
        [identityId, await hashPassword(password)],
      );
      await client.query(
        `UPDATE sessions SET revoked_at = now(), revocation_reason = 'admin_password_changed'
          WHERE identity_id = $1 AND revoked_at IS NULL`,
        [identityId],
      );
      console.error(`[bootstrap]   ${account.prefix} ${email}: contrasena actualizada`);
    }

    const admin = await client.query<{ id: string }>(
      `INSERT INTO admin_users (identity_id, full_name, status)
       VALUES ($1, $2, 'ACTIVE')
       ON CONFLICT (identity_id) DO UPDATE
         SET status = 'ACTIVE', deactivated_at = NULL, full_name = EXCLUDED.full_name,
             updated_at = now()
       RETURNING id`,
      [identityId, fullName],
    );
    const adminUserId = admin.rows[0]?.id;
    if (adminUserId === undefined) {
      throw new Error("admin_user_upsert_returned_no_row");
    }

    // Todos los roles de personal asignables que aun no tenga. Sin conflictos
    // de separacion de funciones (migracion 0039), el trigger no se opone.
    const granted = await client.query(
      `INSERT INTO admin_user_roles (admin_user_id, role_key, grant_reason)
       SELECT $1, r.key, $2
         FROM admin_roles r
        WHERE r.staff_assignable
          AND NOT EXISTS (
            SELECT 1 FROM admin_user_roles x
             WHERE x.admin_user_id = $1 AND x.role_key = r.key AND x.revoked_at IS NULL
          )`,
      [adminUserId, account.grantReason],
    );

    await client.query("COMMIT");

    console.error(
      `[bootstrap]   ${account.prefix} ${email}: listo (${String(granted.rowCount ?? 0)} roles nuevos)`,
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function main(): Promise<void> {
  const brandProblems = brandProfileProblems(BRAND);
  if (brandProblems.length > 0) {
    console.error("[bootstrap] packages/brand/src/brand.config.ts tiene errores:");
    for (const problem of brandProblems) console.error(`  - ${problem}`);
    process.exit(1);
  }

  const superuserUrl = requireEnv("DATABASE_URL_SUPERUSER");

  /**
   * Sin valor por defecto, y a proposito.
   *
   * Este script es el `preDeployCommand`: corre ANTES de que arranque la api y
   * conecta con el SUPERUSUARIO. Un `?? "disable"` aqui significaba que una
   * variable mal escrita en el gestor de secretos abria la sesion mas
   * privilegiada del sistema en claro, y encima en silencio: la api se negaria
   * a arrancar despues (correcto), pero el bootstrap ya habria conectado. La
   * conexion mas privilegiada no puede ser la que menos se valida.
   */
  const sslMode = requireEnv("DATABASE_SSL_MODE");

  if (!["disable", "require", "verify-ca", "verify-full"].includes(sslMode)) {
    console.error(`[bootstrap] DATABASE_SSL_MODE invalido: ${sslMode}`);
    process.exit(1);
  }

  // Misma razon que en `apps/api/src/config/env.ts`: en `pg` la query de la
  // cadena de conexion SOBRESCRIBE el objeto `ssl`, asi que un `?sslmode=`
  // aqui anularia en silencio lo que se decida abajo.
  const tlsInQuery = [
    "sslmode",
    "ssl",
    "sslrootcert",
    "sslcert",
    "sslkey",
    "sslnegotiation",
  ].filter((parameter) => {
    try {
      return new URL(superuserUrl).searchParams.has(parameter);
    } catch {
      return false;
    }
  });

  if (tlsInQuery.length > 0) {
    console.error(
      `[bootstrap] DATABASE_URL_SUPERUSER trae ${tlsInQuery.join(", ")} en la query, y en \`pg\` eso sobrescribe a DATABASE_SSL_MODE. Quitalo.`,
    );
    process.exit(1);
  }

  const useSsl = sslMode !== "disable";

  const passwords: readonly RolePassword[] = [
    {
      role: "app_migrator",
      password: requireEnv("DB_MIGRATOR_PASSWORD"),
      variable: "DB_MIGRATOR_PASSWORD",
    },
    {
      role: "app_runtime",
      password: requireEnv("DB_APP_PASSWORD"),
      variable: "DB_APP_PASSWORD",
    },
  ];

  const readonlyPassword = process.env.DB_READONLY_PASSWORD;
  const allPasswords =
    readonlyPassword === undefined || readonlyPassword.trim() === ""
      ? passwords
      : [
          ...passwords,
          {
            role: "app_readonly_report",
            password: readonlyPassword,
            variable: "DB_READONLY_PASSWORD",
          },
        ];

  console.error("[bootstrap] 1/4 aplicando migraciones forward-only...");
  await runMigrations({ connectionString: superuserUrl, ssl: useSsl });

  console.error("[bootstrap] 2/4 asignando contrasenas de rol (DEC-003)...");
  const client = new Client({
    connectionString: superuserUrl,
    ssl: useSsl ? { rejectUnauthorized: sslMode === "verify-full" } : false,
    application_name: "app-bootstrap",
  });

  await client.connect();

  try {
    for (const entry of allPasswords) {
      await setRolePassword(client, entry);
      console.error(`[bootstrap]   ${entry.role}: contrasena asignada desde ${entry.variable}`);
    }

    if (readonlyPassword === undefined || readonlyPassword.trim() === "") {
      console.error(
        "[bootstrap]   app_readonly_report: sin contrasena (DB_READONLY_PASSWORD no definida). No podra autenticarse hasta que se le asigne una.",
      );
    }

    console.error("[bootstrap] 3/4 marca inicial...");
    await syncBrandProfile(client);

    console.error("[bootstrap] 4/4 cuentas del panel...");
    await ensureStaffAccounts(client);
  } finally {
    await client.end();
  }

  console.error("[bootstrap] listo.");
}

main().catch((error: unknown) => {
  console.error("[bootstrap] fallo:", error);
  process.exit(1);
});
