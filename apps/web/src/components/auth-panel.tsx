import { Card } from "@app/ui";
import type { ReactNode } from "react";

import { PageTitle } from "./page-title";

/**
 * Envoltorio de las pantallas de identidad.
 *
 * UNA COLUMNA ESTRECHA Y CENTRADA, y nada mas en la pantalla. No es una
 * preferencia estetica: un formulario de credenciales al lado de una parrilla
 * de producto compite con ella por la atencion, y en movil obliga a hacer
 * scroll para encontrarlo. `max-w-[28rem]` es el ancho al que una linea de
 * texto de ayuda sigue siendo comoda de leer.
 *
 * El titulo es `h1` porque estas paginas no tienen otro encabezado: es el
 * primero del documento, y saltarse el nivel dejaria la pagina sin cabecera
 * para quien navega por encabezados.
 */
export function AuthPanel({
  title,
  intro,
  children,
  footer,
}: {
  readonly title: string;
  readonly intro?: string;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
}) {
  return (
    <div className="app-container py-s10 pb-s16">
      <div className="mx-auto w-full max-w-[28rem]">
        <PageTitle>{title}</PageTitle>

        {intro === undefined ? null : (
          <p className="mt-s4 text-body-md text-text-muted">{intro}</p>
        )}

        <Card elevation="raised" padding="lg" className="mt-s6">
          {children}
        </Card>

        {footer === undefined ? null : (
          <div className="mt-s5 text-body-sm text-text-muted">{footer}</div>
        )}
      </div>
    </div>
  );
}
