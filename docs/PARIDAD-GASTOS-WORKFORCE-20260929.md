# Contrato pendiente: Gastos de Trabajadores / Workforce

Referencia observada el 29 de septiembre de 2026 en la sesión autenticada de ADT.
No implica implementación ni validación del SaaS. Fuente publicada privada:
`adt-modules-v2.jsx`, SHA-256
`ff0058234ef4b418b219903dc63e7f2e501fde36b3c83f390916d31174d90df8`.

| Acción o regla de ADT | Requisito para cerrar equivalencia |
| --- | --- |
| Tarjeta empresa / efectivo oficina / bolsillo propio | Separar quién paga del trabajador asociado. Solamente bolsillo propio genera deuda de reembolso. |
| IA del recibo | Extracción y comparación auditables, estados pendiente/revisando/error/OK/DUDA/MAL, datos de proveedor, fecha, importes, moneda y posible duplicado. La configuración de un proveedor no prueba su funcionamiento. |
| Revisión administrativa | Confirmación humana con actor y fecha; revisar no aprueba ni paga. Revisión vinculada al comprobante y datos vigentes, invalidada por correcciones pertinentes. |
| Aprobar / rechazar | Precondiciones de IA y revisión administrativa; efectos y auditoría transaccionales. Las entradas de Workforce con prefijo wf_ siguen su doble aprobación. No sustituirla por un cambio de estado genérico. |
| Editar | En la interfaz vigente, pendiente/devuelto y sin reembolso; conservar versiones y recibos anteriores. Contrastar además el servidor y roles. |
| Eliminar recuperable / restaurar | Motivo de al menos cinco caracteres, identificador de solicitud y auditoría. Preservar recibo, evidencia e historial de pago. Estado previo recuperable; coordinación con copia contable y deuda. |
| Reclasificar a general | Oficina/administración después del encargado; motivo, versión, auditoría, recibo y aprobaciones conservados. Un nuevo motivo sigue permitido en estado aprobado; reintentar no duplica. Validado en staging según la copia del servicio, ver GASTO-GENERAL-WORKFORCE-20260930.md. |
| Confirmar reembolso | Solo gasto aprobado de bolsillo propio; recibos revisados. Es una constancia de pago ya realizado, no ejecuta transferencia. Controlar cambios concurrentes, versión e idempotencia. |
| Registro unificado de Gastos | Mostrar gastos administrativos, copias aprobadas de trabajadores y labor automática sin duplicar costo ni confundirlo con pago. Gestionar las copias de Workforce en su origen. |
| Labor automática | Costo por jornada y pendientes de revisión separados de pagos. Conservar falta de tarifa/obra/conciliación como incidencias, sin convertirlos en cero ni inventar pagos. |

## Límite de la observación

Se navegaron las vistas y se leyeron sus controles; no se pulsaron acciones de
aprobar, revisar, pagar, editar, eliminar o restaurar. La fuente contiene una
revisión IA automática al abrir Gastos de Trabajadores, por lo que esa vista no
puede asumirse libre de efectos automáticos. Se salió de ella al identificarlo.
No se dispone de un antes/después del origen que permita afirmar que la navegación
no activó esa automatización. Para siguientes contrastes utilizar fuente y sesiones
de prueba o una vista cuya lectura no dispare tareas.

La regla de campos de búsqueda y trabajador asociado se implementa por separado
en esquemas 044/045; no cierra este contrato. Las pruebas financieras se ejecutarán
con registros sintéticos en staging y sin efectuar pagos ni envíos externos.

## Entregas parciales de equipo

El esquema 047 y las pantallas de equipo/asignaciones se documentan en
[AUDITORIA-EQUIPO-WORKFORCE-20260929.md](AUDITORIA-EQUIPO-WORKFORCE-20260929.md).
Es una base previa; no cierra las aprobaciones, revisión ni reembolsos de esta tabla.

## Reclasificación general

La regla de servicio Workforce RECLASSIFY_GENERAL se publica y prueba en los esquemas 049/050;
ver [GASTO-GENERAL-WORKFORCE-20260930.md](GASTO-GENERAL-WORKFORCE-20260930.md).
No cierra los requisitos de IA/reembolso de la interfaz administrativa ni la copia
contable. Las dos aprobaciones y recibos de 048 ya tienen evidencia de staging en
[GASTOS-WORKFORCE-20260930.md](GASTOS-WORKFORCE-20260930.md).

## Declaración de pagador

La entrega 4174887 y esquema 051 cubren declarar al enviar, persistir procedencia,
consultar, filtrar, historial y reintentos vinculados al pagador. Tres medios
comprobados con sesión real, sin efecto de pago/reembolso/copia contable.
Los gastos anteriores sin evidencia siguen Sin declarar, diferencia explícita
respecto al supuesto de bolsillo propio del origen. Corrección manual parcial cubierta en 052; revisión
IA y confirmación posterior, deuda y reembolso siguen pendientes.
Ver [PAGADOR-WORKFORCE-20260930.md](PAGADOR-WORKFORCE-20260930.md).

## Corrección y revisión manual

6a2d9be y esquema 052 cubren oficina/administración en SUBMITTED/FOREMAN_APPROVED,
con motivo, versión e idempotencia, conservación del recibo y snapshot manual.
Reinicia decisiones vigentes; conserva las anteriores en historial. Sesión real,
concurrencia PostgreSQL, revocación y conservación de datos comprobadas.
Reemplazo e historial de fotos se cubren en 055 con evidencia separada. Etiquetas
administrativas libres y revisión posterior a IA siguen abiertos.
DEVUELTO/NEEDS_CORRECTION y un reenvío propio se cubren parcialmente
en 053/054; no implementan la IA ni el productor automático de devoluciones. No se declara cerrada la fila Editar ni
la confirmación humana posterior a IA. [Evidencia y límites](CORRECCION-MANUAL-WORKFORCE-20260930.md).

## Reenvío del trabajador y oficina en devueltos

28efb2a, esquemas 053/054, cubre un reenvío propio con recibo original, versión,
autorización e idempotencia. Obra existente de la misma empresa, incluso después
de terminar asignación. Segundo devuelto requiere oficina; no se sustituye
REJECTED por DEVUELTO. Oficina corrige y revisa conservando el contador. Sesión
real por fases con fixtures sintéticos, concurrencia PostgreSQL, revocación y
conservación comprobadas. La ampliación 055 cubre fotos nuevas/anteriores. IA,
segundo resultado IA y copia contable siguen abiertos. [Evidencia y límites](REENVIO-WORKFORCE-20260930.md).


## Sustitución e historial de recibos

6b72cfe y esquema 055 cubren foto opcional en corrección/reenvío, histórico privado,
inmutabilidad de los originales y revisión ligada al actual. Preparar no sustituye
ni publica un borrador. Sesión real, binarios, reintentos, concurrencia, móvil
emulado, revocación y conservación comprobados. No cierra IA, la fila Editar,
reembolso ni copia contable. [Evidencia y límites](RECIBOS-ANTERIORES-WORKFORCE-20260930.md).


## Archivo recuperable de Workforce

be3b23d, esquema 056, cubre el archivo/restauración del registro Workforce con
motivo, cinco estados recuperables, solicitudes idempotentes, versión, revisión
conservada e historial privado. Solo administrador; trabajadores/oficina no
pueden ver recibos, metadata o historial de archivados. Sesión web, binarios,
concurrencia, móvil emulado y revocación comprobados. La fila Eliminar/restaurar
no queda completamente cerrada: la copia contable, deuda y reembolso del origen
siguen sin adaptador coordinado. [Evidencia y límites](ARCHIVO-WORKFORCE-20260930.md).


## Registro unificado parcial

518447a, esquema 057, suma Administración y proyecciones de Workforce con ambas
aprobaciones en el registro de Gastos. Archivo/restauración y general coordinan
la consulta mediante el estado actual del origen, sin otra fila administrativa.
Origen, CSV, UI, móvil, restricciones y dieciocho conjuntos protegidos comprobados.
No cierra la copia contable, deuda/reembolso ni Labor; el bolsillo propio queda
SIN_CONFIRMACION. Los otros consumidores de costos siguen pendientes.
[Evidencia, diferencias y retorno](REGISTRO-UNIFICADO-WORKFORCE-20260930.md).
