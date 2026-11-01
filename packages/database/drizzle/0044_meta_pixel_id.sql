-- 0044_meta_pixel_id
--
-- EL PIXEL DE META SE CONFIGURA DESDE EL PANEL
--
--   Hasta ahora el identificador del pixel de Meta (DEC-086) llegaba por la
--   variable de entorno `NEXT_PUBLIC_META_PIXEL_ID`: cambiarlo exigia tocar el
--   despliegue. Desde esta migracion vive en la marca del sitio, junto al
--   dominio, y se edita en Panel -> Marca. Cada sitio tiene su propia base de
--   datos, asi que cada sitio tiene su propio pixel.
--
--   `NULL` es "sin pixel": la tienda no carga el codigo de Meta.
--
--   La CHECK es la misma forma que validan la API y el formulario: solo
--   cifras, de 8 a 20. El valor acaba dentro de un `<script>`, de una URL
--   (`/tr?id=`) y de la CSP de la pagina; una cadena con otra forma no puede
--   llegar a ninguno de los tres.
--
--   Aditiva y sin valor por defecto: los sitios existentes quedan sin pixel
--   hasta que alguien lo escriba en el panel, que es exactamente como estaban.

ALTER TABLE brand_profile
  ADD COLUMN meta_pixel_id text NULL;

ALTER TABLE brand_profile
  ADD CONSTRAINT brand_profile_meta_pixel_id_shape
  CHECK (meta_pixel_id IS NULL OR meta_pixel_id ~ '^[0-9]{8,20}$');

-- La 0040 concede UPDATE columna a columna: una columna nueva no entra sola.
-- Sin esto, guardar la marca desde el panel fallaria con "permission denied".
GRANT UPDATE (meta_pixel_id) ON brand_profile TO app_runtime;

COMMENT ON COLUMN brand_profile.meta_pixel_id IS
  'Identificador del pixel de Meta del sitio (solo cifras), o NULL si no hay pixel. Lo edita el panel (Marca).';
