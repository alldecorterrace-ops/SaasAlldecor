# Landing pública

La raíz `/` presenta el producto sin exigir una sesión. Los parámetros de
confirmación y recuperación siguen pasando por `forwardAuthCallback` antes de
renderizar la portada; no se modifica la autorización de las rutas privadas.

## Contenido y mantenimiento

- Beneficios comerciales, gestión de proyectos y equipo, recorrido de pantallas,
  roles, alta del comprador, cuatro planes y preguntas frecuentes.
- Precios, capacidad y servicios se obtienen de `subscription-catalog.ts`.
  Cada CTA enlaza a `/planes?plan=<código>` y selecciona ese plan. Parámetros
  desconocidos o repetidos usan Equipo; el servidor de Checkout sigue validando
  el catálogo y el importe.
- Los servicios personalizados se describen como un trabajo coordinado con el
  equipo, sin prometer una entrega automática, plazos ni disponibilidad 24/7.
- CSS y tipografía encapsulados en `components/marketing`; las pantallas
  operativas mantienen su diseño.
- Solo la portada de producción permite indexación. El entorno de pruebas y las
  páginas privadas conservan sus restricciones.

## Imágenes y fuente

`public/images/landing/{facturas,estimados}.jpg` son capturas reales obtenidas el
20 de octubre de 2026 de una empresa ficticia de staging. No son representaciones
inventadas ni registros de clientes. La página identifica su contenido como
demostración y permite ampliarlo.

Plus Jakarta Sans se sirve localmente con `next/font/local`. La fuente variable y
su licencia OFL provienen del repositorio oficial de Google Fonts:
<https://github.com/google/fonts/tree/main/ofl/plusjakartasans>.

## Validación

- Revisión visual en escritorio y a 390 px; comprobación de ancho a 320 px.
- Pestañas de capturas operables por teclado, ampliación con diálogo y cierre
  mediante Escape; preguntas con `details` nativo.
- Las cuatro elecciones de plan se verificaron en el navegador.
- HTTP 200 anónimo en `/`; enlaces heredados de Auth conservan redirección 307;
  códigos repetidos son rechazados; plan desconocido vuelve a Equipo.
- Lint, tipos y pruebas existentes de Auth/entorno. CI completa antes de publicar.

No se realizan cargos, envíos de correo ni migraciones para esta entrega. El
despliegue debe conservar el entorno activo y una versión compatible para volver
atrás. La evidencia operativa y los respaldos permanecen fuera del repositorio.
