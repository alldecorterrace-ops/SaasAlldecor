# Auditoría de ubicación automática — 25 de septiembre de 2026

Entrega de aplicación: `b4377d3a4e26a5ea9ad864b3db8a7723605828c4`, publicada
solo en staging. Esquema permanece en 032: no se necesitó una nueva migración.
No se incorporaron datos de ADT. La operación principal continúa en ADT.

## Regla contrastada e implementación

El código actual de ADT, registrado en el [contrato del mapa](PARIDAD-MAPA-20260925.md),
consulta los ZIP pendientes mediante búsqueda de Nominatim, país US y primer
resultado; conserva la ciudad del informe y actualiza el mapa al terminar.
`mapa_zip_set` guarda las coordenadas por ZIP. La nueva acción hace ese recorrido
por empresa y aplica los permisos de lectura de sus fuentes y escritura del mapa.

La [configuración del proveedor](GEOCODIFICACION.md) documenta límites, caché,
atribución y diferencias expresas. La espera se coordina entre procesos del
único servidor autorizado. Una ubicación manual concurrente se conserva. La
conexión real permanece desactivada por defecto y en producción.

## Evidencia

| Comprobación | Resultado observado |
| --- | --- |
| Código y base aislada | Lint, tipos y compilación aprobados; 324 pruebas, cero fallos en [GitHub Actions](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36160960652). Los jobs de concurrencia y recuperación sintética también aprobaron. |
| Concurrencia del proveedor | Tres procesos independientes disputaron la misma reserva SQLite: uno la obtuvo, dos esperaron. Probados caché, límites, vencimiento tras caída y rechazo de un resultado antiguo. |
| Fallos | Timeout/error, HTTP 429, respuesta grande o coordenadas inválidas devuelven no disponible, sin guardar un falso resultado vacío. Se aplica espera antes de reintentar. |
| Proveedor real, prueba independiente | Una consulta local del ZIP público 33101 devolvió HTTP 200 y coordenadas válidas; repetirla usó la caché. Dos búsquedas lógicas, una sola solicitud externa. No se enviaron registros ni direcciones de clientes, ni se escribieron esas coordenadas en Supabase. |
| Interfaz de staging | Auditor autenticado, perfil de mapa con escritura y las cinco lecturas. Dos clientes ficticios: 33198 con resultado simulado, 33199 sin resultado. El botón mostró progreso y «1 ubicado, 1 sin resultado, 0 con error». |
| Persistencia | Recarga mostró cuatro puntos frente a tres y un solo ZIP pendiente. PostgreSQL confirmó 33198 con coordenadas ficticias 25.81/-80.31, ciudad original del ensayo, versión 1 y autor auditor. No creó fila para 33199. |
| Reintento | Volver a ubicar el pendiente mostró «0 ubicados, 1 sin resultado». La base conservó una única fila de los ZIP del ensayo y versión 1. |
| Revocación | Se retiró escritura con la pantalla abierta y se intentó el botón anterior. La actualización retiró las acciones de escritura; la base mantuvo la fila original. El RPC real con ese rol rechazó la escritura con 42501; la transacción de prueba terminó en ROLLBACK. |
| Móvil | Vista emulada 390×844: ancho de documento y cuerpo 390, mapa 350. El lote se ejecutó en esa vista. No equivale a prueba en un teléfono físico. |
| Publicación | Compilación del hosting con Node 22.23.2, un CPU y dependencias verificadas. Se confirmaron REVISION, PassengerAppRoot y proceso de staging. Cuatro rutas públicas correctas en staging y cuatro en producción. |

El auditor quedó con su perfil habitual de ventas. La página anterior de estimado
se reabrió para continuidad. No hubo cobros ni envíos, no se modificó producción
y no se aplicaron migraciones de datos.

## Retención y límites

Activa `b4377d3`, anterior compatible `8d936f0`, dependencias `b149bee`. Inventario
actual identifica como adicionales `a8e1dd9`, `4293666`, `7472d42`, `685b5da`,
`f29072d` y `6866a73`, junto con sus archivos fuente cuando existan. No se borró
ningún elemento. Su retirada requiere revisar contenido único, dependencias y
confirmar la lista exacta; la aprobación de otra limpieza no se reutiliza.

Esta entrega cierra el recorrido automático con respuestas sintéticas en staging
y prueba por separado una consulta real del proveedor. No acredita una operación
completa de producción ni la paridad total del mapa. Continúan pendientes:

- Cartografía real y contraste visual con ADT en los roles correspondientes.
- Casos multibyte y diferencia de presentación monetaria: ADT muestra dólares
  redondeados sin decimales en la tabla; el SaaS muestra dos. Los cálculos/CSV
  mantienen los importes; no se modificaron para resolver esta presentación.
- Leer los bytes de la descarga CSV autenticada y comprobar el rechazo HTTP,
  además de la evidencia de descarga, serializador y RLS existente.
- Ensayo completo del proveedor real desde el entorno operativo autorizado,
  incluyendo interrupción del lote y recuperación de una solicitud real fallida.

La consulta pública independiente no autoriza activar servicios externos en
staging ni en producción. La configuración, la conexión verificada y el recorrido
operativo siguen siendo estados distintos. Recuperación real, migración y
traspaso conservan sus pendientes separados.
