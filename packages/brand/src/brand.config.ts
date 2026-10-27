/**
 * ===========================================================================
 * CONFIGURACION DE MARCA DEL CLIENTE
 * ===========================================================================
 *
 * Este es el archivo que se edita para montar la plataforma a un cliente
 * nuevo. Todo lo que el publico ve con el nombre del negocio -cabecera, pie,
 * titulos, textos legales, contacto, numeros de pedido- sale de aqui.
 *
 * Lo que NO vive aqui (ver el README de la raiz, seccion "Cliente nuevo"):
 *   - Los COLORES: `packages/design-system/src/styles/tokens.css`, bloque
 *     "MARCA".
 *   - El LOGO: se sube desde el panel. Sin logotipo subido se usa
 *     `apps/web/public/brand/brand-mark.png`. El icono de la pestana lo dibuja
 *     la web a partir de ese logotipo (`/brand-icon.png`).
 *   - Las llaves de Stripe y el Meta Pixel: variables de entorno en Railway.
 *
 * Los textos legales (Terminos, Privacidad, Aviso de California) usan estos
 * datos, pero su contenido lo redacto el abogado de otro negocio: cada
 * cliente debe revisarlos con el suyo antes de publicar una promocion.
 */

export const BRAND = {
  /** Nombre comercial, tal como se muestra en la web y en los titulos. */
  name: "Mi Marca",

  /**
   * Logotipo de texto en dos partes. La segunda se pinta en el color de
   * marca. Juntas deben formar el nombre comercial.
   */
  wordmark: {
    lead: "Mi",
    tail: "Marca",
  },

  /** Datos legales del negocio, los que aparecen en Terminos y Privacidad. */
  legal: {
    /** Razon social completa. */
    name: "Mi Marca LLC",
    /** Como se describe la sociedad en los Terminos ("a ... company"). */
    entityDescription: "a Texas limited liability company",
    /** Estado cuyas leyes rigen los Terminos. */
    governingLawState: "Texas",
    /** Tribunales competentes que nombran los Terminos ("state courts located in ..."). */
    venue: "Travis County, Texas",
    /** Direccion postal, en lineas. */
    address: {
      street: "123 Main St, Suite 100",
      cityStateZip: "Austin, TX 78701",
    },
  },

  /** Contacto publico (pie de pagina, privacidad, ayuda). */
  contact: {
    email: "contacto@mimarca.com",
  },

  /** Dominio publico de la web, sin protocolo ni barra final. */
  domain: "mimarca.com",

  /**
   * Prefijos de los numeros visibles. Mayusculas y cifras, de 2 a 8
   * caracteres. Se aplican en el siguiente despliegue de la API:
   *   - pedidos: `ORD-00000001`
   *   - participaciones: `NUM26-00000001` (solo en promociones nuevas; una
   *     promocion que ya repartio numeros conserva su prefijo)
   */
  numbering: {
    orderPrefix: "ORD",
    entryPrefix: "NUM",
  },

  /**
   * Zona horaria del negocio (IANA). Decide en que momento empieza y acaba
   * el "dia" del corte de caja diario. La zona LEGAL de cada promocion se
   * declara aparte, en la propia promocion.
   */
  timeZone: "America/Chicago",
} as const;
