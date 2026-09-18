# Relaciones del histórico de ADT

Este ensayo amplía la conservación de estimados a clientes, partidas, proyectos,
facturas, pagos, documentos y contratos. Trabaja exclusivamente con una copia
restaurada y PostgreSQL local aislado. No carga esas entidades en las tablas del
SaaS ni activa cobros, aprobaciones, firmas, correos o accesos de clientes.
Las cargas posteriores de consulta histórica se documentan por separado en
[Estimados](HISTORICO-ESTIMADOS.md), [Clientes, proyectos, facturas y pagos](HISTORICO-NEGOCIO.md)
y [Documentos y contratos](HISTORICO-DOCUMENTOS.md).

## Fuente privada

El archivo `adt-history-snapshot-v1` contiene `origin: restored_snapshot` y ocho
arreglos de filas originales: `clients`, `estimates`, `items`, `projects`,
`invoices`, `payments`, `documents` y `contracts`. Los importes y los identificadores
se exportan como cadenas. La extracción se realiza en una transacción de solo
lectura contra el respaldo restaurado.

Estos datos incluyen información personal, firmas y posibles tokens históricos.
Los archivos completos, la base de ensayo y el informe detallado permanecen en
`.local`, con acceso restringido al propietario y SYSTEM, fuera del repositorio
público y del directorio web. El comando solo imprime contadores y mensajes
genéricos. No descarga URLs de documentos ni ejecuta HTML guardado.

## Correspondencias

Cada identidad candidata depende de la empresa, tabla original e identificador
original. Los documentos usan su `id`; las otras entidades, `external_id`.
Las identidades de estimados coinciden con las del planificador anterior.
Nunca se enlazan registros por nombre, correo, importe parecido o proximidad.

| Estado de la referencia | Tratamiento en el ensayo |
| --- | --- |
| `resolved` | Coincidencia exacta con un registro de la tabla esperada y sin contradicciones detectadas. Clave foránea dentro de la misma empresa. |
| `absent` | Campo opcional vacío, conservado sin relación. |
| `missing` | Falta una referencia obligatoria o no existe su destino en la copia. No se crea un destino ficticio. |
| `invalid` | Tipo o formato ambiguo. No se convierte ni recorta para obtener una coincidencia. |
| `out_of_scope` | Dominio aún no incorporado o significado pendiente de comprobar. La referencia original queda conservada. |
| `conflict` | El cliente o proyecto contradice el del documento enlazado, o una relación inversa contradice el estimado. No se adjunta al destino candidato. |

Las entidades con incidencias quedan con `relationDisposition: hold_for_review`.
La columna original y el motivo de revisión se conservan. Que dos tablas tengan
el mismo identificador no permite intercambiar sus significados: por ejemplo,
`service_external_id` no se convierte automáticamente en proyecto o estimado.
También queda fuera de este ensayo `web_est_id` y cualquier referencia de producto.

Las comprobaciones de cliente cubren documentos, contratos, proyectos, facturas,
pagos y estimados cuando los dos extremos contienen esa referencia. Para pagos
se compara además el proyecto con el de la factura. Se comprueba la relación
inversa del proyecto indicado por un estimado. Esto es una revisión de las
referencias declaradas, no una conciliación bancaria ni una prueba de que un
adjunto pertenezca físicamente al cliente.

## Estimados históricos sin desglose

El plan conserva el estado y total originales, las partidas disponibles y sus
motivos de revisión. Propone `historical_read_only`, con detalle guardado o con
la indicación `unavailable_in_reviewed_sources`. No inventa una partida para
igualar el total y no permite recalcular o emitir desde este plan.

La [consulta histórica de estimados](HISTORICO-ESTIMADOS.md) implementa esta
presentación y está publicada con permisos de empresa y módulo en servidor.
La carga de estimados usa un modelo de solo lectura separado de las operaciones
actuales. Clientes, proyectos, facturas y pagos también tienen una carga histórica
separada aplicada. Documentos y contratos están conservados en un archivo de
consulta; sus referencias pendientes permanecen sin adjuntar y reservadas a
administradores. La resolución de esas referencias sigue abierta.

## Ejecución reproducible

Crear una carpeta nueva, vacía y privada dentro de `.local`:

```powershell
New-Item -ItemType Directory .local/migracion/historico-v1
npx tsx scripts/stage-history-migration.ts --input .local/migracion/historico.json --database .local/migracion/historico-v1 --company-id UUID_DE_LA_EMPRESA_DESTINO
```

La ruta real debe permanecer dentro de `.local`. El programa recalcula las
correspondencias desde el respaldo. En una sola transacción crea los registros,
las relaciones y la evidencia de ejecución en `history_rehearsal`. Carga todos
los registros antes de añadir las claves foráneas para admitir referencias
circulares entre estimados y proyectos.

Repetir la misma entrada no duplica registros ni relaciones. Cambiar de empresa,
modificar una fila ya conservada o alterar sus relaciones/diagnóstico detiene y
revierte el lote completo. Un destino ausente que aparezca después cambia el plan:
debe ensayarse en una carpeta nueva para revisar esa relación, sin sustituir la
evidencia anterior. No se eliminan filas históricas por omisión en otro archivo.

Los hashes de cada fila y del plan detectan cambios, pero no reemplazan las claves
foráneas, el control de permisos ni la conciliación monetaria de producción.

## Evidencia del ensayo

El respaldo descargado coincide con el SHA-256 del servidor. Se verificó la
igualdad de todas las filas conservadas, sus hashes y las identidades de estimados
contra el ensayo anterior. La repetición insertó cero registros; no hubo destinos
ausentes adjuntos ni tablas de negocio en el esquema `public` de la base local.
Se rechazaron otra empresa y una carpeta fuera de `.local`.

Las referencias ausentes se concentran en documentos y contratos. También se
detectaron contradicciones de cliente y referencias cuyo dominio requiere revisión.
El detalle y las cantidades permanecen en el informe privado. No se reasignaron
adjuntos, no se descartaron firmas y no se modificó el sistema original.

Las pruebas sintéticas de `tests/migration-history.test.ts` cubren ciclos,
aislamiento, conservación, identidades duplicadas, referencias ausentes,
contradicciones, rechazo de destinos inexistentes por PostgreSQL, repetición y
reversión ante un conflicto tardío. La auditoría de pantallas autenticadas y la
resolución de referencias y archivos faltantes siguen pendientes. La publicación y
las cargas posteriores se documentan en [Estimados](HISTORICO-ESTIMADOS.md) y
[Clientes, proyectos, facturas y pagos](HISTORICO-NEGOCIO.md) y
[Documentos y contratos](HISTORICO-DOCUMENTOS.md).

La entrega pasó localmente las 154 pruebas, lint, comprobación de tipos y
compilación. El código de esta entrega es offline y no cambia la aplicación
pública ni requiere aplicar una migración de Supabase.
