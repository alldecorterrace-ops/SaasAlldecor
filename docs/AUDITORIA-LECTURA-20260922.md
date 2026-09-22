# Lectura autenticada de los 23 módulos

22 de septiembre de 2026. Sitio publicado: app.alldecorpatio.com. Sesión existente
de propietario, una empresa. Se recorrieron los enlaces reales del menú en navegador
a 1424 × 1272 y 390 × 844. No se crearon datos, enviaron correos, cambiaron permisos,
registraron pagos ni ejecutaron consultas de IA.

Las 23 páginas mostraron su encabezado y contenido principal sin error de aplicación
en ambos tamaños. Todas quedaron sin desbordamiento del documento en escritorio.
En móvil, Clientes presentó un desbordamiento; las otras 22 páginas no lo presentaron.
Una tabla puede tener desplazamiento dentro de su contenedor sin que eso constituya
desbordamiento de toda la página.

| Módulo | Lectura escritorio | Lectura móvil | Incidencia |
| --- | --- | --- | --- |
| Dashboard | Correcta | Correcta | Aviso de avance desactualizado; texto corregido en código |
| Leads | Correcta | Correcta | — |
| Clientes | Correcta | Carga con desbordamiento | Corrección preparada; falta comprobarla desplegada |
| Nuevo estimado 3D | Correcta | Correcta | — |
| Productos | Correcta | Correcta | — |
| Pérgola sin 3D | Correcta | Correcta | — |
| Estimados web | Correcta | Correcta | — |
| Precios | Correcta | Correcta | — |
| Estimados | Correcta | Correcta | — |
| Facturas | Correcta | Correcta | — |
| Proyectos | Correcta | Correcta | — |
| Horas y solicitudes | Correcta | Correcta | — |
| Manual de fabricación | Correcta | Correcta | — |
| Permisos | Correcta | Correcta | — |
| Inventario | Correcta | Correcta | — |
| Gastos | Correcta | Correcta | — |
| Trabajadores | Correcta | Correcta | — |
| Mapa de zonas | Correcta | Correcta | — |
| Instalaciones | Correcta | Correcta | — |
| Portal del cliente | Correcta | Correcta | — |
| IA Assistant | Correcta | Correcta | — |
| Actividad | Correcta | Correcta | — |
| Configuración | Correcta | Correcta | — |

Clientes: el contenedor de tabla ya tenía desplazamiento horizontal interno,
pero sus etiquetas accesibles con posición absoluta no tenían un ancestro
posicionado dentro de ese contenedor. Se añadió `relative` al contenedor para
confinarlas sin ocultarlas a lectores de pantalla ni recortar la tabla.

La reproducción aislada usó datos sintéticos, el CSS compilado de la aplicación
y el mismo patrón de tabla/etiquetas. Con viewport de 390 px, el documento medía
565 px antes y 390 px después; la tabla conservó 590 px dentro de un contenedor
de 348 px con desplazamiento propio. Este ensayo confirma la causa de CSS;
la comprobación de la pantalla real tras publicar sigue pendiente.

La inspección prueba apertura con esa sesión y esos tamaños, no persistencia de
ediciones, paridad con ADT, todos los elementos fuera de pantalla, roles adicionales,
pantallas de detalle o un teléfono físico. La auditoría de acciones completas y
la comprobación visual de la corrección publicada permanecen abiertas.

## Comprobaciones de la entrega de infraestructura

Commit `1c61d7dd7126184da27ad96e019f53cd97b1f5f9`: 239 pruebas, lint, tipos y
compilación local aprobados. [CI remoto aprobado](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/35735049541).
El [primer monitor externo](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/35735049716)
completó correctamente las cuatro comprobaciones públicas. Su calendario está
publicado; falta confirmar ejecución programada y entrega de alertas por fallo.
La aplicación y la migración 026 de esa entrega aún no se desplegaron en el hosting.

La corrección de Clientes y texto de Dashboard se publicó en GitHub como `e6ba2f0`;
su [CI también terminó correctamente](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/35735489253).
