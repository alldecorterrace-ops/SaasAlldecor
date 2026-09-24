# Operación y recuperación

Preparación del 22 de septiembre de 2026. Esta entrega incorpora herramientas;
la creación del entorno y los ensayos reales tienen seguimiento independiente en
[los seis puntos](EJECUCION-SEIS-PASOS.md).

## Retención de entregas

`npx tsx scripts/plan-release-retention.ts INVENTARIO.json PLAN.json` genera
un archivo nuevo y nunca borra. Ambos archivos son privados, fuera de GitHub.
El inventario tiene `root`, `active`, `rollback`, `rollbackVerified`,
`processRoots` y `releases`. Cada entrega requiere `name`, `realPath`, SHA completo
`commit`, `published`, `sourceVerified`, `uniqueData`, `bytes`, `entries` y
`dependencies` (nombres de entregas enlazadas).

Esos indicadores deben proceder de comprobaciones, no de suposiciones por nombre
de carpeta. Verificar publicación en GitHub, comparar contenido y datos únicos,
resolver enlaces, procesos y compatibilidad del retorno. Una dependencia desconocida,
un proceso ajeno al inventario o una ruta no canónica detiene el plan. Se conservan
también las dependencias transitivas de carpetas pendientes de revisión.

La suma propuesta es una estimación del inventario: medir espacio real e inodos
antes y después. Repetir el inventario inmediatamente antes de cualquier borrado y
obtener la confirmación correspondiente sobre la lista concreta. No comprimir
permanentemente cada versión eliminada. [Política](VERSIONADO-Y-RETENCION.md).

## Entorno de pruebas

Proyecto Supabase independiente, dominio independiente y datos sintéticos o
anonimizados. No restaurar la producción sobre staging sin anonimización aislada.
El propietario creó SaasAlldecor-Staging el 24 de septiembre. Se comprobó su estado
saludable y se desactivaron registro y proveedor Email durante la preparación;
dominio, esquema, datos sintéticos y recorridos siguen pendientes.
Configuración privada necesaria:

```dotenv
APP_ENVIRONMENT=staging
STAGING_SUPABASE_PROJECT_REF=REFERENCIA_DEL_PROYECTO_DE_PRUEBAS
NEXT_PUBLIC_SUPABASE_URL=https://REFERENCIA_DEL_PROYECTO_DE_PRUEBAS.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=CLAVE_PUBLICABLE_DE_PRUEBAS
NEXT_PUBLIC_SITE_URL=https://DOMINIO_DE_PRUEBAS
INVITATION_MAIL_ENABLED=false
OPENAI_API_KEY=
OPERATION_QUEUE_ENABLED=false
```

El arranque rechaza staging apuntando al proyecto o dominios actuales de producción,
una referencia distinta de la URL, correo habilitado o clave de IA presente.
El servidor bloquea los envíos de invitaciones, registro, recuperación y consultas
externas de IA en staging; la interfaz identifica el entorno. Esto no configura
Supabase Auth: también debe desactivar sus envíos externos o dirigirlos a un receptor
local de pruebas, desactivar proveedores/webhooks reales y preparar cuentas sintéticas
mediante un canal administrativo protegido. La clave de producción nunca se copia.

## Copias

Se preparó una carpeta privada en el Drive indicado por el propietario, sin enlaces
públicos. Hay código de exportación, cifrado, transferencia y recuperación de archivos;
está pendiente configurarlo y ensayarlo contra los servicios reales. El conector
interactivo no configura credenciales persistentes del servidor.
No se han subido allí datos sin cifrar ni una copia de producción en esta entrega.

Un snapshot completo debe contener:

- `database/roles.sql`, `schema.sql`, `data.sql`, `managed-schema.sql`: exportación
  consistente de PostgreSQL, roles y personalizaciones de esquemas gestionados.
- `storage/manifest.json` y cada binario bajo `storage/objects/` con nombre opaco,
  tamaño y SHA-256. Mantener el mapeo de bucket/objeto dentro del archivo cifrado.
- `hosting/private-files.tar.gz`: documentos privados completos.
- `hosting/configuration.tar.gz`: configuración necesaria para reconstruir el
  servicio, incluido correo/tareas y referencias de entrega. Nunca publicarla.
- `manifest.json`: versión 1, projectRef, startedAt, completedAt, fullSnapshot true
  y artifacts con path relativo, bytes, sha256. Registrar incluso un Storage vacío.

`npx tsx scripts/verify-backup.ts DIRECTORIO PROJECT_REF` verifica componentes,
tamaños, SHA-256 y correspondencia de objetos; rechaza rutas escapadas y enlaces.
El resultado indica explícitamente `remoteVerified:false` y `restoreVerified:false`.
No exporta, cifra ni prueba que PostgreSQL pueda restaurar esos bytes. `fullSnapshot`
necesita evidencia del exportador; no se deduce de la existencia de archivos.

### Exportación y transferencia implementadas

`npx tsx scripts/run-backup.ts CONFIGURACION_PRIVADA.json` coordina el recorrido.
No lo programar antes de completar el inventario del origen, claves, cuotas y ensayo.
El archivo se mantiene fuera del repositorio, con permisos restringidos; contiene:

- `projectRef`, `spoolRoot`, `receiptRoot`, `recipientFile` (solo clave pública age),
  `sourceInventorySha256` (huella del inventario privado revisado).
- `tools`: rutas de `age`, `tar`, `rclone`, `pgDump`, `pgDumpAll` verificados.
- `hosting.documents` y `hosting.configuration`: cada uno tiene `root` y una lista
  `paths` relativa y explícita. Resolver previamente enlaces al destino real. No
  incluir el directorio de trabajo, dependencias, cachés ni la clave privada age.
- `drive`: `rcloneConfig` privado, `remote` de tipo Drive y `folderId` privado
  comprobado en la cuenta acordada. La autorización OAuth sigue pendiente.

La conexión usa `PGHOST`, `PGPORT=5432`, `PGDATABASE=postgres`, `PGUSER`,
`PGSSLMODE=verify-full` y el canal privado de contraseña de PostgreSQL. Rechaza el
pooler transaccional y referencias ajenas. Storage usa `BACKUP_STORAGE_SERVICE_KEY`
solo en el proceso de respaldo. Ninguna credencial aparece en argumentos, recibos
públicos ni código del navegador.

El exportador mantiene abierto un snapshot `REPEATABLE READ READ ONLY` e importa
ese mismo punto en todos los `pg_dump`. Añade `full.dump` y `snapshot.json` con
recuentos por tabla. Los roles se exportan sin contraseñas y se comparan antes y
después: `pg_dumpall` no comparte el snapshot de filas; evitar cambios administrativos
durante la captura. `managed-schema.sql` documenta esquemas gestionados completos:
**no aplicarlo ciegamente sobre otro Supabase**. Revisar sus diferencias y seguir el
procedimiento oficial de restauración, incluidas las claves de Vault si se utilizan.

Storage se inventaría desde ese snapshot, conserva el mapeo privado de objetos y
descarga los binarios. Exige tamaño y ETag fuerte coincidentes con los metadatos;
una versión ausente/cambiada detiene la copia. La compatibilidad de los ETag con el
proyecto real está pendiente de comprobar; no degradar ese control para obtener un
recibo verde. Los archivos del hosting se comparan antes y después de comprimirlos.
La captura entre servicios exige conservar objetos inmutables y controlar los cambios
de configuración; el código no demuestra por sí solo que no exista un escritor externo.

El paquete se comprime directamente hacia age, sin un TAR sin cifrar intermedio.
Rclone sube únicamente el paquete y su recibo cifrados, descarga ambos y compara
SHA-256. Los recibos privados sobreviven fuera del spool. Solo tras verificar el
destino se elimina el directorio temporal creado por ese trabajo; si falla, conserva
un único trabajo y su bloqueo para revisión, evitando acumular nuevas copias fallidas.
No borra datos del origen, versiones del SaaS ni respaldos remotos.

`retentionFits` calcula 42 copias de cuatro horas, cuatro semanales y una candidata,
con 20 % de margen. Una subida individual puede caber sin que quepa toda la retención:
en ese caso no activar el calendario. El espacio de filesystem no sustituye la cuota
de la cuenta cPanel; verificar también esta última. La eliminación remota aún requiere
aplicar el plan de retención a los dos objetos de cada copia y confirmar su inventario.

También pueden ejecutarse por separado `export-postgres-snapshot.ts`,
`package-backup.ts` y `recover-backup-files.ts` con configuración privada validada
por sus esquemas. Recuperar primero el recibo cifrado usando age y la clave del
propietario, después el paquete. La recuperación crea un directorio nuevo, verifica
la huella del cifrado, rechaza rutas escapadas/enlaces y comprueba todos los archivos.
No ejecuta SQL ni arranca aplicaciones por sí sola.

La ampliación del 24 de septiembre añade `scripts/recover-storage.ts` para recuperar
binarios en otro proyecto aislado. Tiene modo de planificación sin red, rechaza
producción, comprueba una atestación temporal de aislamiento y verifica por lectura
posterior los archivos subidos o reutilizados. No sobrescribe ni elimina. Véase
[Recuperación de Storage](RECUPERACION-STORAGE.md) para límites, credenciales privadas,
reanudación y separación respecto a los metadatos administrados de PostgreSQL.
Sus pruebas HTTP son simuladas; no se ha ejecutado una recuperación real de Supabase.

### Evidencia sintética

`scripts/test-backup-recovery.ts` genera una clave desechable, cifra, transfiere con
rclone local y recupera nueve archivos sintéticos, incluido el mapeo de Storage;
detecta corrupción por huella y cifrado autenticado. El ensayo ampliado pasó
localmente en Windows el 24 de septiembre.
No se utilizó la clave real del propietario ni información de clientes.

El job `backup-recovery` en GitHub añade PostgreSQL 17: exporta mientras otra conexión
confirma cambios, cifra y transfiere localmente, descifra y restaura en una base nueva.
Comprueba referencias y decimales anteriores al cambio. Su resultado debe registrarse
en el seguimiento; no acredita Drive, Supabase Auth real, carga ni RPO/RTO de producción.

Antes de activar las copias cada cuatro horas: comprobar cuota de Drive y espacio
temporal, exportación consistente, cifrado local mediante una herramienta mantenida
(age con clave pública del propietario), custodia de la clave privada
fuera del servidor/GitHub, transferencia cifrada, lectura posterior y comparación.
Retener siete días de copias completas de cuatro horas y cuatro puntos semanales.
El planificador conserva además copias sin verificar para revisión y nunca elimina
automáticamente. No eliminar objetos compartidos con un punto de restauración vivo.

`backupFreshness` toma el inicio del snapshot, no la hora de subida. Un recibo solo
cuenta si es completo, cifrado y verificado en destino. `/api/backup-health` comprueba
los recibos privados del proyecto actual con un límite estricto de cuatro horas;
solo devuelve `ok`/`unavailable`, sin nombres, fechas, rutas ni datos privados.
Requiere `BACKUP_MONITOR_ENABLED=true` y `BACKUP_RECEIPT_ROOT` en el servidor.
Está desactivado por defecto. Si la exportación tarda, la periodicidad de cuatro
horas no garantiza por sí sola ese RPO: el monitor debe señalar el atraso real.

Los respaldos de base de Supabase no incluyen los binarios de Storage. La exportación
y la restauración deben seguir sus [instrucciones de respaldo](https://supabase.com/docs/guides/platform/backups)
y [reconstrucción del proyecto](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).

## Monitor externo

`.github/workflows/availability.yml` ejecuta `node scripts/check-availability.mjs`
desde GitHub Actions cada cinco minutos, en ejecución manual y cuando cambia su código.
No necesita secretos. Comprueba salud semántica/no-store, formularios de acceso y
recuperación y redirección de actualización sin sesión. No registra cuerpos ni errores
del proveedor. No sustituye el recorrido autenticado. Cuando se active y publique el
comprobador de recibos, establecer la variable de repositorio
`BACKUP_MONITOR_ENABLED=true` para incorporar su endpoint a la comprobación externa.
La ruta y las pruebas están implementadas, pero el monitor de respaldos y la recepción
de alertas siguen pendientes de activación y evidencia reales.

El horario de Actions puede [retrasarse](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule);
es una primera comprobación externa y no una garantía de detección en cinco minutos.
La recepción de avisos de fallo por el propietario requiere comprobar sus notificaciones
de Actions y un fallo controlado del monitor; no se presume a partir de un run verde.

## Ensayo pendiente

Restaurar una copia descargada de Drive en infraestructura aislada. Desactivar envíos
antes de arrancar la aplicación, validar roles/RLS/Auth, recuentos, huellas, objetos,
documentos y recorridos, y medir tiempos desde la solicitud de recuperación. Calcular
RPO a partir del último punto recuperable y RTO hasta servicio validado. El objetivo
de cuatro horas para ambos queda pendiente de ese ensayo. Medir primero el pico
observado para diseñar una prueba al doble en staging, nunca suponer la carga.
