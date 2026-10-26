import { Alert, Card } from "@app/ui";
import { useTranslations } from "next-intl";

import { formatEntryCount } from "@/i18n/formatters";
import type { Locale } from "@/i18n/locales";
import type { EntryNumberBatch } from "@/lib/api";

/**
 * Lotes de numeros de participacion (`GET /account/entry-numbers`, DEC-080).
 *
 * POR QUE PRIMERO Y ULTIMO Y NO UNA FILA POR NUMERO
 * -------------------------------------------------
 * Un solo pedido de este producto puede generar once mil participaciones.
 * Pintarlas de una en una produce una pagina de once mil filas que ningun
 * navegador de telefono termina de renderizar, y que ademas no dice nada: nadie
 * lee once mil numeros. Cada lote -lo que dio UNA compra, una ficha o un
 * ajuste- se resume en su primer y su ultimo numero, cuantas participaciones
 * trajo y cuantas siguen activas.
 *
 * NO ES UN RANGO. Los numeros salen de una permutacion con clave de la
 * promocion, asi que entre el primero y el ultimo de un lote no estan todos los
 * intermedios. Por eso el texto dice "primero" y "ultimo", y no "del X al Y".
 *
 * La pagina se pide por NUMEROS: un lote largo sigue en la pagina siguiente con
 * el mismo `batch_id`, y entonces el "ultimo" es el ultimo de esta pagina.
 *
 * TODA ESTA PANTALLA VIVE DETRAS DE `visible_entry_numbers_enabled`
 * ----------------------------------------------------------------
 * El flag esta apagado por defecto y con el apagado el backend responde 404: los
 * numeros se asignan igual pero no se muestran. Quien llame a este componente
 * tiene que haber comprobado el flag antes; aqui no se vuelve a comprobar,
 * porque un componente que decide si una funcion legalmente material esta
 * encendida es un segundo sitio donde ese flag puede estar mal leido.
 *
 * EL AVISO DEL FINAL NO ES DECORACION. El contrato lo dice con todas las letras
 * y aqui se repite en la pantalla: los numeros NO son el algoritmo del sorteo.
 * Que existan numeros no autoriza a sortear sobre ellos (DEC-017, principio
 * #11), y un participante que ve numeros asignados asume lo contrario si nadie
 * se lo dice.
 */
export function EntryBatchList({
  batches,
  locale,
}: {
  readonly batches: readonly EntryNumberBatch[];
  readonly locale: Locale;
}) {
  const t = useTranslations("account.entries");

  if (batches.length === 0) {
    return <Alert tone="info">{t("batchesEmpty")}</Alert>;
  }

  return (
    <div>
      <p className="text-body-sm text-text-muted">{t("batchesIntro")}</p>

      <ul className="mt-s4 flex list-none flex-col gap-s3">
        {batches.map((batch) => {
          const first = batch.numbers.at(0)?.number ?? null;
          const last = batch.numbers.at(-1)?.number ?? null;

          return (
            <li key={batch.batch_id}>
              <Card elevation="raised" padding="md">
                <p className="font-display text-heading-sm font-bold tabular-nums text-brand">
                  {t("batchQuantity", { entries: formatEntryCount(batch.quantity, locale) })}
                </p>

                <p className="mt-s1 text-body-sm text-text-muted">
                  {t("batchActive", {
                    active: formatEntryCount(batch.active_quantity, locale),
                  })}
                </p>

                {/*
                 * Los numeros son CADENAS y se pintan tal cual (DEC-010). No se
                 * formatean con separador de miles: `04669096` no es una cifra,
                 * es un identificador, y agruparlo lo destruiria.
                 *
                 * `break-words` porque en 360px los dos identificadores
                 * completos no siempre caben en una linea, y sin el la pagina
                 * crece a lo ancho.
                 */}
                {first === null || last === null ? null : (
                  <p className="mt-s2 break-words font-mono text-body-sm tabular-nums text-text-muted">
                    {t("batchFirstLast", { first, last })}
                  </p>
                )}
              </Card>
            </li>
          );
        })}
      </ul>

      <p className="mt-s4 text-caption text-text-subtle">{t("batchesNote")}</p>
    </div>
  );
}
