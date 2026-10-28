import type { ReactNode } from "react";

import type { AdminNavKey } from "@/lib/admin/navigation";

/**
 * Iconos del menu del panel.
 *
 * Un icono por seccion para que el menu se pueda LEER DE UN VISTAZO -sobre
 * todo la barra inferior del telefono, donde la etiqueta es corta-. Son trazos
 * propios de 24x24 en `currentColor`: siguen el color del estado (activo, hover)
 * sin una hoja aparte, y no traen una libreria de iconos entera por quince
 * dibujos.
 *
 * Siempre decorativos: el nombre accesible es la etiqueta de texto que va al
 * lado, por eso `aria-hidden` y sin `<title>`.
 */
const PATHS: Readonly<Record<AdminNavKey | "account" | "more" | "store" | "signOut", ReactNode>> = {
  dashboard: <path d="M3.5 10.5 12 3.5l8.5 7V20a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1z" />,
  orders: (
    <>
      <path d="M5.5 7.5h13l-1 13h-11z" />
      <path d="M9 7.5a3 3 0 0 1 6 0" />
    </>
  ),
  dailyCut: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 9.5v.01M18 14.5v.01" />
    </>
  ),
  catalog: (
    <>
      <path d="M20.5 7.5 12 3 3.5 7.5v9L12 21l8.5-4.5z" />
      <path d="M3.5 7.5 12 12l8.5-4.5M12 12v9" />
    </>
  ),
  shipping: (
    <>
      <path d="M2.5 6h11v10.5h-11zM13.5 10h4l3 3.2v3.3h-7" />
      <circle cx="6.5" cy="17.5" r="1.75" />
      <circle cx="17" cy="17.5" r="1.75" />
    </>
  ),
  // 0041: una tarjeta con su banda, para "Pagos".
  payments: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="M3 9.5h18M6.5 14.5h4" />
    </>
  ),
  promotions: (
    <>
      <path d="M8 3.5h8V9a4 4 0 0 1-8 0z" />
      <path d="M8 5.5H5a3 3 0 0 0 3 4M16 5.5h3a3 3 0 0 1-3 4M12 13v4M8.5 20.5h7M9.5 17h5v3.5h-5z" />
    </>
  ),
  participants: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6 6 0 0 1 3.5 5.5" />
    </>
  ),
  amoe: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </>
  ),
  adjustments: (
    <>
      <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" />
      <circle cx="15" cy="6" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="17" cy="18" r="2" />
    </>
  ),
  draw: (
    <>
      <path d="M3.5 6.5h17V10a2 2 0 0 0 0 4v3.5h-17V14a2 2 0 0 0 0-4z" />
      <path d="M14.5 7v2M14.5 11v2M14.5 15v2" />
    </>
  ),
  exports: <path d="M12 3.5v11M7 10l5 5 5-5M4.5 20.5h15" />,
  brand: (
    <>
      <path d="M12 3a9 9 0 1 0 0 18c1 0 1.6-.8 1.6-1.6 0-.9-.7-1.4-.7-2.3 0-.9.8-1.6 1.7-1.6H17a4 4 0 0 0 4-4C21 6.8 17 3 12 3z" />
      <circle cx="7.5" cy="11" r="1" />
      <circle cx="10" cy="7" r="1" />
      <circle cx="15" cy="7.5" r="1" />
    </>
  ),
  flags: (
    <>
      <rect x="2.5" y="7" width="19" height="10" rx="5" />
      <circle cx="16.5" cy="12" r="2.75" />
    </>
  ),
  audit: (
    <>
      <path d="M9 3.5h6v3H9z" />
      <path d="M7 5H5v16h14V5h-2M9 14l2 2 4-4.5" />
    </>
  ),
  account: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="10" r="3" />
      <path d="M6.2 18.5a6.5 6.5 0 0 1 11.6 0" />
    </>
  ),
  more: <path d="M4 7h16M4 12h16M4 17h16" />,
  store: (
    <>
      <path d="M4 9.5 5.5 4h13L20 9.5M4 9.5h16M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0" />
      <path d="M5.5 12v8.5h13V12M10 20.5v-5h4v5" />
    </>
  ),
  signOut: <path d="M14 4.5h4.5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H14M10 8l-4 4 4 4M6 12h10" />,
};

export type AdminIconName = keyof typeof PATHS;

export function AdminIcon({
  name,
  className,
}: {
  readonly name: AdminIconName;
  readonly className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className ?? "h-5 w-5 shrink-0"}
    >
      {PATHS[name]}
    </svg>
  );
}
