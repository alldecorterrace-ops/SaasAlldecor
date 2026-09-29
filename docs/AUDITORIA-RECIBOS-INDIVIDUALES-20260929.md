# Recibos individuales y duplicados entre cargas — 29 septiembre 2026

Publicada y comprobada en staging `0545710`; producción permanece sin cambios. Esquema aditivo
042, sin importar datos de ADT. Configuradores y 3D continúan fuera del alcance.

## Contrato

El origen ADT `CrmController::expenseReceipt` verifica formato, tamaño 400–8.388.608
bytes y SHA-256; impide repetir una imagen de otro gasto activo y consulta también
Workforce. La sesión de ADT se renovó y se comprobó la pantalla de Gastos cargada.
La lectura del código y esa pantalla no certifican por sí solas todas sus acciones.

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

## Evidencia publicada

Commit exacto `05457104d4a179f266f88f7bbe981a7e92d760e6`, esquema 042 y consulta 043.
[CI completo](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36616436001):
lint, tipos, 423 pruebas, compilación, concurrencia PostgreSQL y ensayo de recuperación
sintética aprobados. El primer ensayo de recuperación del candidato aaf268c falló sin
causa identificada; su repetición y las dos revisiones posteriores pasaron. No se
presenta como recuperación de Drive ni como RPO/RTO de producción.

En la sesión real del auditor, sobre una ficha ficticia de $1.37:

- Recibo usado por un lote rechazado desde el formulario individual.
- PNG de 7.300.245 bytes guardado y descargado con SHA-256 idéntico.
- El reemplazo devolvió el gasto aprobado a pendiente sin cambiar el importe.
- Repetir la misma imagen conservó versión 2 y el archivo vigente; el nuevo intento
  quedó registrado sin otra modificación financiera.
- PDF de 1.018 bytes guardado y descargado con SHA-256 idéntico.
- Desvinculación en versión 4 conservó los tres objetos anteriores; PDF repuesto
  después y reabierto. Los archivos, importes e identificadores se registran solo
  en evidencia privada.
- Pantalla inaccesible con la membresía restringida de otra empresa. La revocación
  durante ejecución y los cruces de actor se verifican además en pruebas SQL.
- Ficha y registro a 390 píxeles sin desbordamiento; emulación, no dispositivo físico.
- Retorno efectivo a 4a60de4, apertura/descarga del PDF nuevo y reactivación de 0545710.
- Diez huellas de tablas previas iguales al terminar, excluyendo únicamente la ficha
  sintética creada para este ensayo. No se cargaron registros de ADT.

El cambio inicial de raíz detectó que faltaba `tmp/restart.txt`; se creó su carpeta y
se completó el reinicio. Ambos cambios posteriores de retorno funcionaron. Configuración
privada y huella de configuración de producción conservadas; proceso de staging comprobado.
La candidata aaf268c nunca se activó y queda identificada para eliminación confirmada.

Los archivos históricos no se recalculan ni se importan. El índice solo cubre huellas
registradas; los clientes antiguos de retorno aún pueden crear adjuntos sin huella.
La futura integración de Campo/Workforce requiere comparar su circuito completo y
registrar los documentos en el mismo control; esta entrega no la declara terminada.
El SQL valida metadatos y referencias; la comprobación binaria ocurre en la aplicación.
Los candidatos abandonados quedan identificados y conservados, sin purga automática.
