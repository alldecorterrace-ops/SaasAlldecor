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

La regla de servicio Workforce RECLASSIFY_GENERAL se desarrolla en el esquema 049;
ver [GASTO-GENERAL-WORKFORCE-20260930.md](GASTO-GENERAL-WORKFORCE-20260930.md).
No cierra los requisitos de IA/reembolso de la interfaz administrativa ni la copia
contable. Las dos aprobaciones y recibos de 048 ya tienen evidencia de staging en
[GASTOS-WORKFORCE-20260930.md](GASTOS-WORKFORCE-20260930.md).
