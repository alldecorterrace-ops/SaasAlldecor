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
El propietario ha pospuesto crear el proyecto preparado en su organización.
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
públicos. Está pendiente instalar/configurar el exportador, cifrado y transferencia
periódica. El conector interactivo no configura credenciales persistentes del servidor.
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

Antes de activar las copias cada cuatro horas: comprobar cuota de Drive y espacio
temporal, exportación consistente, cifrado local mediante una herramienta mantenida
(por ejemplo age con clave pública del propietario), custodia de la clave privada
fuera del servidor/GitHub, transferencia cifrada, lectura posterior y comparación.
Retener siete días de copias completas de cuatro horas y cuatro puntos semanales.
El planificador conserva además copias sin verificar para revisión y nunca elimina
automáticamente. No eliminar objetos compartidos con un punto de restauración vivo.

`backupFreshness` toma el inicio del snapshot, no la hora de subida. Un recibo solo
cuenta si es completo, cifrado y verificado en destino. Falta conectar los recibos
reales al monitor de atrasos; esa alerta no se declara activa todavía.

Los respaldos de base de Supabase no incluyen los binarios de Storage. La exportación
y la restauración deben seguir sus [instrucciones de respaldo](https://supabase.com/docs/guides/platform/backups)
y [reconstrucción del proyecto](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).

## Monitor externo

`.github/workflows/availability.yml` ejecuta `node scripts/check-availability.mjs`
desde GitHub Actions cada cinco minutos, en ejecución manual y cuando cambia su código.
No necesita secretos. Comprueba salud semántica/no-store, formularios de acceso y
recuperación y redirección de actualización sin sesión. No registra cuerpos ni errores
del proveedor. No sustituye el recorrido autenticado ni supervisa aún los respaldos.

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
