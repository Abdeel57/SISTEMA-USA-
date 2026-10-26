# Fotografías de premio (solo para el modo de datos simulados)

En el sitio real, la imagen del premio **se sube desde el panel**, en la ficha
de la promoción, y se guarda en la base de datos. Esta carpeta no interviene.

Solo la usa la API simulada de desarrollo (`WEB_ENABLE_API_MOCKS=true`): si aquí
existe `premio-hero.jpg` (hero de la portada) o `premio-square.jpg` (tarjetas),
la promoción de ejemplo la muestra; si no, usa una ilustración de relleno. Tras
añadir o quitar una foto hay que reiniciar el servidor de desarrollo, porque la
API simulada comprueba qué archivos existen una sola vez, al arrancar.

## Qué foto funciona mejor

El hero la pinta **a sangre**, ocupando la mitad derecha en escritorio y todo el
ancho en móvil, con un degradado hacia el fondo por la izquierda (escritorio) o
por abajo (móvil), donde se apoya el titular.

- Ancho de 1920 px o más, apaisada.
- El premio ligeramente a la derecha del centro.
- Aire por arriba y nada escrito encima (rótulos, carteles).
- Fondo oscuro o de estudio.

## Lo que esta carpeta **no** decide

Ni qué es el premio, ni cuánto vale, ni las condiciones de la promoción. Todo
eso son datos de la promoción y de las Reglas Oficiales.
