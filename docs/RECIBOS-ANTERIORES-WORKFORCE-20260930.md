# Sustitución e historial de recibos de Workforce

## Regla de referencia

La copia privada de CrmController, expenseAdminEdit/campoExpense y
expenseSyncEditedReceipt, permite foto opcional JPG/PNG/WebP hasta 8 MiB.
Al sustituir conserva el archivo anterior y registra EXPENSE_RECEIPT_REPLACED;
la corrección y el recibo privado se vinculan dentro de la transacción. La copia
local no certifica por sí sola el PHP actualmente desplegado. No se modificó ADT.

## Implementación

Esquema aditivo 055. La foto nueva se prepara y verifica antes de corregir; el
cambio de recibo, datos, revisión, decisiones e historial queda en la misma
transacción del gasto. Se conserva ID, trabajador, creación y archivos previos.
Recibo opcional: sin foto nueva permanece el actual. Una solicitud idéntica no
repite cambios; la foto forma parte del payload idempotente. Contratos anteriores
siguen disponibles y conservan el formato de solicitudes sin sustitución.

Oficina/administración corrige pendientes/devueltos; trabajador activo únicamente
su gasto devuelto y una vez. No abre aprobados finales ni rechazados. Preparar
una foto no habilita por sí solo una corrección; el guardado reevalúa actor,
empresa, estado, versión, recibo original y metadata/objeto de la candidata.
La web verifica bytes, formato, tamaño y SHA antes de guardar y descargar.

El histórico muestra solo recibos usados, nunca borradores preparados. Consulta
actual y anterior autenticada, autorizada en la empresa y ámbito del trabajador;
no contiene enlaces públicos ni credenciales administrativas. Storage conserva
objetos inmutables y carece de políticas de actualización/borrado. La revisión
manual apunta al recibo vigente y su huella; el reenvío deja revisión pendiente.

## Evidencia

Pendiente de completar con comprobaciones reales de staging. Pruebas SQL emplean
metadata/objetos sintéticos; no acreditan el contenido binario de Storage.

## Pendientes

IA, productor de devoluciones, confirmación posterior a IA, etiquetas libres,
reembolso y copia contable siguen abiertos. Esta entrega no migra datos ADT,
no ejecuta pagos/envíos y no cierra Campo/Workforce ni los 21 módulos.

Validación local de esta entrega: lint, tipos, 482 pruebas y compilación pasan.
La publicación, PostgreSQL concurrente y el recorrido real de staging siguen
pendientes de sus comprobaciones; no se consideran satisfechos por esas pruebas.
