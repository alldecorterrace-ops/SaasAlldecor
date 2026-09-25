# Mapa comercial: conexión y auditoría del 25 de septiembre de 2026

La migración de datos reales permanece suspendida. Esta entrega conecta el
motor comparado con ADT a las fuentes del SaaS y verifica ensayos sintéticos.
No acredita todavía el cierre completo de Mapa de zonas ni de los 23 módulos.

## Alcance implementado

- Consulta consistente por empresa de clientes, facturas, solicitudes web,
  estado del lead asociado y centros postales. Las solicitudes conservan su
  ubicación original; los leads manuales no se convierten en entradas web por
  compartir una etiqueta de origen.
- La consulta exige lectura de Mapa, Clientes, Facturas, Estimados web y Leads.
  Si falta una autorización, se bloquea el informe completo, evitando mostrar
  sumas parciales como si fueran totales.
- Tabla, CSV, categorías, capas y puntos usan el mismo motor. Los filtros de
  capas solo afectan los puntos, como ADT. «Facturado» conserva su definición
  de pagos recibidos de facturas no anuladas.
- Centros postales privados por empresa, guardado auditado, repetición sin
  duplicados y conflicto entre ediciones. La ubicación no representa viviendas.
- El formulario público admite dirección, ciudad y ZIP opcionales y conserva
  esos datos al convertirse en lead. Los reintentos antiguos sin esos campos
  mantienen su compatibilidad.
- Leaflet 1.9.4 se sirve desde el mismo dominio, con licencia y huellas
  verificadas. En staging se bloquean las teselas externas; se ensayan puntos
  ficticios sobre el fondo de prueba.

## Evidencia automatizada

Lint, tipos, 315 pruebas y compilación pasaron localmente. Los casos nuevos
verifican más de 1.000 clientes sin truncamiento, fuentes web/manuales,
ubicación original frente a cambios del lead, revocaciones, cinco permisos
obligatorios, dos empresas, escritura directa denegada, validación de
coordenadas, idempotencia, auditoría y conflicto de versiones.

Se conservan los quince conjuntos contrastados contra PHP actual de ADT,
incluidos redondeos, pagos, facturas anuladas y fichas separadas. La evidencia
del contrato está en [PARIDAD-MAPA-20260925.md](PARIDAD-MAPA-20260925.md).

## Publicación y recorrido autenticado

Staging ejecuta `8d936f02633dc64d6f96dd306aee42de0099869c`, publicado después de
[CI 36158619198](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36158619198)
completo: aplicación, concurrencia y recuperación sintética aprobadas. Esquema
032 aplicado con `COMMIT`, 32 versiones y comprobación de las 31 huellas previas.
La primera preparación tenía huellas incorrectas y se rechazó antes de aplicar
cambios; se hizo rollback y se regeneró desde UTF-8 del repositorio. Las dos
definiciones de funciones anteriores quedaron conservadas en privado.

| Recorrido | Evidencia observada |
| --- | --- |
| Agregados financieros | Dos clientes ficticios del ZIP 33101, uno con pago parcial de 40.25 sobre 100 y otro con 60 sobre 60: dos contactos/cerrados, 100% de cierre, 100.25 recibidos y ticket 50.13. Los demás casos QA sin ZIP no entraron en esa fila. |
| Centros y formulario | Latitud cero rechazada conservando ciudad/longitud. Corregirla guardó versión 1; reapertura mostró los valores persistidos. Dos centros interiores guardados desde UI y uno exterior preparado por RPC. |
| Capas y puntos | Tres puntos interiores dibujados. Ocultar Activos redujo los puntos; incluir fuera del área añadió el cliente exterior sin cambiar la tabla. Ventana del punto web mostró nombre, categoría, ciudad y ZIP. |
| Solicitud pública | Envío ficticio confirmado; conversión desde la interfaz creó un lead. PostgreSQL confirmó conservación de correo, dirección, ciudad y ZIP; el mapa mostró una única entrada web en 33102. Formulario desactivado al terminar. |
| Exportación | Clic autenticado produjo descarga HTTP 200, text/csv, nombre zonas-saas.csv y private, no-store. El navegador no permitió recuperar el cuerpo del archivo descargado; estructura y valores del serializador están cubiertos por las pruebas locales, no por lectura de ese archivo descargado. |
| Escritura revocada | Con editor abierto, retirar escritura y enviar mostró «Página no disponible». El centro mantuvo ciudad/coordenadas y versión 1. Perfil de lectura mostró el informe sin enlaces de edición. |
| Autorización e aislamiento | Retirar lectura de Facturas bloqueó el informe completo. Navegar al mapa de la segunda empresa mostró recurso no disponible. RPC real con rol autenticado denegó lectura sin Facturas, otra empresa y escritura postal revocada con 42501. |
| Reintento y edición antigua | RPC real repitió el mismo centro sin subir de versión; contenido distinto con versión antigua devolvió PT409. |
| Móvil | Viewport emulado 390×844, ancho de documento y cuerpo 390, mapa 348; sin desbordamiento horizontal de página. No equivale a un dispositivo físico. |

No se obtuvo respuesta HTTP verificable de los intentos de CSV denegado: la
navegación fue bloqueada por el navegador. No se confunde esa limitación con
evidencia HTTP 403; el rechazo de datos sí quedó probado en PostgreSQL y en UI.

El auditor terminó con su perfil de ventas original y su estimado anterior
reabierto: revisión 3, total 306.95, sin cambios. Los cuatro controles públicos
pasaron tanto en staging como en producción. Se verificaron proceso y ruta
activos de staging; producción continúa en `3c0c412` y no fue modificada.

Retención: activa `8d936f0`, anterior `a8e1dd9`, dependencias compartidas
`b149bee`. Las entregas `4293666`, `7472d42`, `685b5da`, `f29072d` y `6866a73`
quedan identificadas para revisar contenido único y confirmar su retirada.
No se eliminó ninguna carpeta ni se creó un respaldo por cada entrega antigua.

El job de recuperación anterior falló con diagnóstico genérico de herramienta.
Se añadió diagnóstico restringido al ensayo de base vacía en loopback y la
nueva ejecución pasó; no se pudo establecer la causa del fallo anterior. Esto
no acredita respaldos reales en Drive, restauración de la aplicación ni RPO/RTO.

## Pendientes expresos

Actualización posterior: el botón automático se implementó y se probó con
respuestas ficticias en staging `b4377d3`; una consulta real y la caché se
verificaron por separado. Véase la [auditoría de geocodificación](AUDITORIA-GEOCODIFICACION-20260925.md)
para el estado vigente y las limitaciones. El resto de esta nota describe la
entrega `8d936f0` y no se interpreta como una repetición de todos sus ensayos.

- Geocodificación: el recorrido operativo del proveedor real sigue pendiente,
  separado del botón sintético y la conexión independiente ya comprobados.
- Proveedor cartográfico activo y contraste visual con la interfaz actual de
  ADT. Los ensayos de staging sin llamadas externas no acreditan ese proveedor.
- Truncamiento de nombres/ciudades multibyte: PHP corta bytes y JavaScript
  unidades de texto. No se declara equivalencia de esos casos extremos.
- Lectura de los bytes de una descarga CSV autenticada y respuesta HTTP de
  rechazo, además de los controles de base y serializador ya comprobados.

Referencias de la dependencia: [distribución oficial de Leaflet](https://leafletjs.com/download.html),
[API de Leaflet](https://leafletjs.com/reference.html) y
[política de teselas de OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/).
