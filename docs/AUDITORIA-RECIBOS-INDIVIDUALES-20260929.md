# Recibos individuales y duplicados entre cargas — 29 septiembre 2026

Entrega candidata para staging; producción permanece sin cambios. Esquema aditivo
042, sin importar datos de ADT. Configuradores y 3D continúan fuera del alcance.

## Contrato

El origen ADT `CrmController::expenseReceipt` verifica formato, tamaño 400–8.388.608
bytes y SHA-256; impide repetir una imagen de otro gasto activo y consulta también
Workforce. La sesión de ADT requiere renovar Google Authenticator: la lectura del
código no certifica todas sus acciones en pantalla.

El flujo individual del SaaS utiliza ahora el mismo transporte por archivo de los
lotes, hasta 8 MiB, y la misma huella SHA-256. Conserva la compatibilidad de PDF
existente en la ficha individual; los lotes siguen admitiendo imágenes. La lectura
posterior desde Storage comprueba contenido, tamaño, MIME y huella antes de vincular.
La carga no sobrescribe ni elimina objetos. Una preparación fallida no cambia el gasto.

Cada cambio vincula empresa, actor, gasto, versión esperada, comprobante e identificador
de solicitud. La confirmación conserva un resultado duradero: repetir la misma
solicitud devuelve la versión original sin otro cambio ni evento. Un contenido distinto
con el mismo identificador se rechaza. Un archivo idéntico al actual no cambia aprobación
ni versión. Un reemplazo distinto conserva importes y la regla existente de nueva revisión.

Las cargas individuales y los lotes comparten la exclusión de huellas de gastos activos.
Los permisos vigentes se comprueban en preparación y confirmación; un usuario con escritura
puede adjuntar, pero no obtiene aprobación administrativa ni acceso a otra empresa.
Los conflictos de edición usan PT409, no el código transitorio 40001.

## Validación y límites

Pruebas de archivo ausente/alterado, PDF, límite del flujo, origen, otra empresa/actor,
revocación, versión desactualizada, sustitución, desvinculación y conservación de objetos.
Se amplía la prueba PostgreSQL real para competir dos cambios individuales y un cambio
individual frente a un lote, además de ocho reintentos concurrentes del ganador.

Pendientes de esta candidata: CI del commit publicado, aplicación en staging, pruebas
binarias de interfaz y retorno comprobado. No se declara publicada por compilar.

Los archivos históricos no se recalculan ni se importan. El índice solo cubre huellas
registradas; los clientes antiguos de retorno aún pueden crear adjuntos sin huella.
La futura integración de Campo/Workforce requiere comparar su circuito completo y
registrar los documentos en el mismo control; esta entrega no la declara terminada.
El SQL valida metadatos y referencias; la comprobación binaria ocurre en la aplicación.
Los candidatos abandonados quedan identificados y conservados, sin purga automática.
