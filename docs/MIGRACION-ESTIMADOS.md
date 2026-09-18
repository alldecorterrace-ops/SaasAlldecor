# Ensayo de conservación de estimados

El planificador prepara un plan **sin escrituras en bases de datos**. Un segundo
comando permite ensayarlo en PostgreSQL local aislado. Ninguno importa datos al SaaS,
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

## Carga local aislada

Crear una carpeta vacía de ensayo dentro de `.local`, con permisos privados:

```powershell
New-Item -ItemType Directory .local/migracion/ensayo-v1
npx tsx scripts/stage-estimate-migration.ts --input .local/migracion/snapshot.json --database .local/migracion/ensayo-v1 --company-id UUID_DE_LA_EMPRESA_DESTINO
```

El comando usa PGlite (PostgreSQL local), sin credenciales, URL de conexión ni
tablas del SaaS. Comprueba la ruta real de la carpeta y recalcula el plan desde
el respaldo. Una transacción conserva originales y diagnóstico en el esquema
`migration_rehearsal`, fija una única empresa y registra la ejecución.

Repetir el mismo respaldo conserva las filas existentes sin duplicarlas. Una
empresa distinta o un registro cuyo contenido haya cambiado detienen y revierten
toda esa ejecución, incluidos los registros nuevos insertados antes del conflicto.
Los diagnósticos ya guardados tampoco se sustituyen: para ensayar una revisión
del planificador, utilizar otra carpeta vacía y conservar la evidencia anterior.

Esto **no es todavía el importador de producción**. Faltan las correspondencias
con clientes, proyectos y documentos, el tratamiento del histórico en la aplicación
y la conciliación contra el destino. Tampoco acredita RLS remoto, restauración
de Supabase ni un entorno de staging completo. No autoriza sobrescrituras.

## Evidencia de redondeo

El código desplegado de `pergola.html` redondea partidas por separado y calcula
el subtotal del encabezado desde el motor. El diagnóstico señala diferencias de
uno o dos centavos compatibles con ese procedimiento únicamente cuando coinciden
el resumen guardado, las columnas originales y los totales de una única ficha
del motor. La evidencia es consistente con el código inspeccionado; no reproduce
la ejecución de cada versión histórica.

Esta clasificación conserva la marca de revisión. No añade líneas de ajuste,
no cambia importes y no convierte una discrepancia en una conciliación aprobada.

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

En la entrega inicial pasaron 136 pruebas, lint, tipos y build. Dos ejecuciones con el mismo respaldo
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

La ampliación se ejecutó contra el mismo respaldo en una base local persistente.
La primera carga conservó todos los originales; la repetición insertó cero filas.
La lectura posterior verificó originales completos, identidades y hashes contra
el plan anterior. Se rechazaron otra empresa y una ruta fuera de `.local`, sin
cambiar la carga. Los resultados y cantidades están en el anexo privado.
`tests/migration-staging.test.ts` verifica además la reversión completa ante un
conflicto tardío y la incorporación posterior de registros nuevos válidos.
La ampliación pasó localmente las 143 pruebas, lint, tipos y build. Se mantiene
como herramienta offline; no requiere desplegar otra versión de la aplicación.
