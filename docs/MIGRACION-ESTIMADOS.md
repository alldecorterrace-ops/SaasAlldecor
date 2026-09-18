# Ensayo de conservación de estimados

Esta herramienta prepara un plan **sin escrituras**. No importa datos al SaaS,
no aprueba estimados ni genera facturas, proyectos, pagos o correos. Los archivos
resultantes contienen datos privados y deben permanecer fuera de GitHub y del
directorio web.

## Fuente y selección de partidas

El formato `adt-estimates-snapshot-v1` contiene `origin: restored_snapshot`,
`estimates` con las filas completas de `adt_crm_estimate` e `items` con las de
`adt_crm_estimate_item`. Las columnas monetarias se exportan como cadenas, sin
pasarlas por números de coma flotante. `source_json` se conserva como texto
original, incluidos campos que todavía no representa el SaaS.

Se inspeccionó el controlador desplegado de ADT, especialmente
`estimateItemsEffective` y `estimateItemsFromSource`. El plan respeta sus reglas:

- Una marca explícita `_adt_items_source` selecciona JSON o tabla.
- Sin filas normalizadas se usa el JSON.
- Las filas sembradas con identificadores deterministas y sin cambios son
  proyecciones; si existe JSON con partidas, prevalece esa revisión.
- Las ediciones manuales de tabla conservan prioridad cuando no existe marca.

Se guardan ambas representaciones, aunque solo una sea la vigente. Los importes
de cada línea son los guardados (`price`/`line_total`); no se recalculan a partir
de medidas, cantidades o tarifas actuales. La conciliación compara la suma de
líneas menos descuento más impuestos con el total registrado, en centavos
exactos. Una diferencia se marca para revisión, nunca se corrige sola.

## Ejecución

Exportar desde una copia restaurada, en una transacción de solo lectura. La
exportación privada de producción no forma parte del repositorio público.

```powershell
npx tsx scripts/plan-estimate-migration.ts --input .local/migracion/snapshot.json --output .local/migracion/plan-nuevo.json --company-id UUID_DE_LA_EMPRESA_DESTINO
```

La carpeta de salida debe existir dentro de `.local`. Se comprueba su ruta real,
se rechaza un archivo ya existente y solo se imprimen contadores. El plan
incluye la empresa destino explícita, identificadores candidatos reproducibles
por empresa, hashes del contenido, filas originales, partidas elegidas y motivos
de revisión. No utiliza credenciales ni conexiones de red.

Los identificadores estables **no constituyen todavía un importador reanudable**.
El proceso posterior tendrá que comprobar empresa, hashes, correspondencias y
conflictos dentro de transacciones; registrar cada importación y detenerse si un
registro de origen cambia. La aceptación de un plan no autoriza sobrescrituras.

## Resultado del ensayo del 18 de septiembre de 2026

Se ejecutó el plan sobre el respaldo restaurado destinado a la empresa
indicada por el propietario. Se detectaron documentos sin partidas en tabla
ni JSON y documentos con diferencias de total. Los volúmenes, identificadores,
importes y archivos completos permanecen en el anexo privado de migración.

La falta de partidas en esas dos representaciones no demuestra pérdida de
datos en ADT: faltan por revisar documentos, archivos de origen y otras
referencias antes de decidir cómo presentar sus detalles históricos en el SaaS.

No se cambió ningún importe, estado ni registro del origen o del destino. El
resultado no acredita que estos documentos estén importados ni listos para una
edición normal en el SaaS. El informe privado conserva los registros que
explican cada diferencia. `tests/migration-estimates.test.ts` usa ejemplos
sintéticos y cubre conservación, identidad, aislamiento, selección de partidas,
conciliación y rechazo de datos ambiguos.

Pasaron 136 pruebas, lint, tipos y build. Dos ejecuciones con el mismo respaldo
generaron planes idénticos. Se verificó que el archivo descargado coincide con
el SHA-256 del servidor, que no se sobrescribe un plan existente y que se
rechaza una salida fuera de `.local`. La copia local hereda una ACL limitada
al propietario y SYSTEM.

También se localizaron y respaldaron los archivos privados de importaciones
anteriores referenciados por el controlador. Aportan datos de origen, fechas y
referencias que no deben descartarse, pero no contienen el desglose de partidas
que falta en el respaldo revisado. Se detectaron asimismo referencias de
adjuntos a estimados ausentes; no se reasignarán automáticamente a otro registro.
Las correspondencias y sus cantidades se conservan en el informe privado.

[GitHub Actions](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/35365560017)
aprobó las 136 pruebas y las comprobaciones de lint, tipos y build. Esta entrega
es una herramienta de ensayo offline: no requiere cambiar la aplicación pública.
