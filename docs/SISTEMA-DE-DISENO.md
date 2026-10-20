# Corporate Trust · Aplicación

La solicitud del 20 de octubre amplía el diseño de la portada a las pantallas
operativas. Se conservan los flujos, permisos, catálogos, datos y acciones del
servidor. No requiere migraciones ni configuración de Stripe.

## Base compartida

- Plus Jakarta Sans variable, servida localmente desde el layout raíz.
- Fondo slate 50, texto slate 900, superficies blancas y bordes slate 200.
- Primario índigo 600 y degradado a violeta 600 en acciones principales.
- Tarjetas de 12 px, controles de 8 px, sombras suaves y cifras tabulares.
- Los estilos base y componentes usan capas CSS; las utilidades de cada pantalla
  conservan prioridad, incluidas tablas sin relleno y documentos de impresión.
- Verde para confirmación, ámbar para advertencia y rojo para errores; los estados
  siempre incluyen texto. Los colores funcionales del mapa comercial se conservan.

## Cobertura

El layout y los componentes compartidos cubren todos los módulos autorizados:
clientes, leads, productos, precios, estimados, solicitudes web, proyectos, horas,
trabajadores, permisos, inventario, instalaciones, manuales, gastos, facturas,
actividad, configuración y portal. Los módulos excluidos no se activan.

Navegación, acceso, recuperación, empresas, administración global, planes,
confirmación de suscripción, acceso del cliente, solicitudes públicas y estados
de error comparten la misma identidad. Los documentos imprimibles mantienen
fondo blanco y carecen de sombras y navegación.

## Interacción y accesibilidad

- Botones de al menos 44 px; campos de 16 px en móvil para evitar zoom al enfocar.
- Foco visible, etiquetas existentes, mensajes con `alert`/`status`.
- Menú móvil en diálogo nativo: foco contenido, Escape, restitución del foco,
  cierre al navegar y al pasar a escritorio; fondo sin desplazamiento mientras abre.
- Tablas conservan desplazamiento horizontal local; Facturas y Estimados tienen
  regiones de resultados enfocables por teclado, títulos y estados legibles.
- Movimiento breve en botones y tarjetas enlazadas. `prefers-reduced-motion`
  elimina el movimiento decorativo; las filas y formularios no se inclinan.

## Mantenimiento y validación

Los tokens viven en `src/app/globals.css`; `Brand`, `Button`, `Input`,
`StatusBadge` y `AppShell` son los componentes comunes. No duplicar la carga de
fuentes ni usar colores de marca particulares en formularios nuevos.

Validar escritorio y móvil: navegación/teclado, tablas y filtros, ficha y edición,
configuración, acceso, planes y landing. No enviar pagos, invitaciones ni cambios
de datos para comprobar únicamente una presentación.

Después de publicar en staging, sustituir las imágenes de Facturas y Estimados
de la landing por capturas reales del nuevo diseño con datos ficticios. Usar
nombres nuevos para evitar servir imágenes antiguas desde caché. Registrar la
revisión capturada y el resultado del despliegue en la evidencia privada.

La entrega inicial `2a74394` se revisó en los 20 módulos de staging a 1280 px.
Clientes y Facturas se comprobaron a 390 px; Estimados, Configuración, Horas y
Dashboard también a 320 px. Los campos móviles conservan 16 px y los resultados
anchos no desbordan la página. Se comprobó apertura del menú, cierre con Escape,
restitución del foco y cierre al navegar. Esta revisión visual no sustituye las
pruebas de los procesos de negocio. Las capturas renovadas de la landing proceden
de esa entrega y de datos ficticios.
