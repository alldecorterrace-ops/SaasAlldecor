# Preparación inicial de staging

El 24 de septiembre el propietario creó SaasAlldecor-Staging en su organización
gratuita y renovó cPanel. Se verificó el proyecto saludable y vacío: cero tablas
públicas, usuarios de Auth y objetos de Storage. Sus identificadores y evidencia de
acceso se conservan fuera del repositorio.

Se desactivaron registro público y proveedor Email, manteniendo desactivados los
demás proveedores y el acceso anónimo. La persistencia se comprobó tras recargar.
No hay hooks de Auth. Esta pausa inicial evita usar correo durante la preparación;
antes de habilitar cuentas sintéticas debe instalarse un receptor de pruebas y
validarse que ningún emisor llegue a destinatarios externos.

## Esquema e historial

`npx tsx scripts/prepare-staging-bootstrap.ts ARCHIVO_NUEVO.sql` genera un archivo
con las migraciones de GitHub y su historial. No conecta ni modifica bases. El
archivo se genera desde el commit revisado y sus bytes se comparan después de
transferirlo fuera del directorio público. No contiene credenciales ni datos de
clientes. La versión concreta y huellas se registran en evidencia privada.

La ejecución exige confirmar el proyecto de destino mediante su conexión oficial.
El SQL rechaza tablas de negocio, esquema `app_private`, usuarios, buckets, objetos
o historial preexistentes. Nunca limpia una base para superar esa comprobación.
Aplica esquema e historial en una sola transacción; cualquier error requiere
`ROLLBACK` antes de inspeccionar o repetir. No omitir ni marcar como aplicadas
migraciones fallidas. El generador solo admite las envolturas `begin;` / `commit;`
revisadas en el repositorio; formatos distintos requieren revisión explícita.

Se registra cada versión, nombre y SQL original en
`supabase_migrations.schema_migrations`, sin acceso de anon/authenticated. Esto
evita repetir el desajuste de historial manual de producción. **No ejecutar este
bootstrap en producción ni usarlo para reconciliar su historial existente.**

Para conectarse desde el hosting IPv4 se usa el Session pooler indicado en el
diálogo Connect de ese proyecto, puerto 5432, TLS `verify-full` y CA del sistema.
`psql -X -W` solicita la contraseña en privado; no ponerla en argumentos, URLs,
archivos públicos ni chat. El propietario introduce la credencial existente de
staging; su contraseña de cPanel corresponde a otro servicio.

Después de aplicar: comprobar 27 versiones, catálogo de 23 módulos, RLS, grants,
ausencia de datos reales y cola desactivada. Después preparar datos sintéticos,
dominio, variables independientes, receptor de correo y recorridos por roles.
La aplicación de esquema por sí sola no acredita staging operativo.

La prueba aislada comprueba el bootstrap completo, rechazo de repetición y
reversión de esquema/historial ante fallo. El ensayo nativo de concurrencia de CI
usa el mismo bootstrap antes de sus operaciones sintéticas.
