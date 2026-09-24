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
diálogo Connect de ese proyecto, puerto 5432 y TLS `verify-full`. Descargar la CA
desde **Database → Settings → SSL configuration → Download certificate** del
proyecto y pasar su ruta como `PGSSLROOTCERT`; la CA general del hosting no basta
para esta conexión. Verificar previamente la cadena y el nombre del pooler con
`openssl s_client -starttls postgres`, `-verify_hostname` y
`-verify_return_error`. No sustituir `verify-full` por un modo que omita validación.
`psql -X -W` solicita la contraseña en privado; no ponerla en argumentos, URLs,
archivos públicos ni chat. El propietario introduce la credencial existente de
staging; su contraseña de cPanel corresponde a otro servicio.

El primer intento falló con `certificate verify failed`. Se corrigió la CA usando
el certificado enlazado por el dashboard y se verificaron TLS 1.3, cadena y nombre
del servidor antes de solicitar otro intento privado. Esa prueba acredita TLS;
no acredita por sí sola autenticación PostgreSQL ni aplicación de las migraciones.
Procedimiento oficial: [conexión psql de Supabase](https://supabase.com/docs/guides/database/psql).

Después de aplicar: comprobar 27 versiones, catálogo de 23 módulos, RLS, grants,
ausencia de datos reales y cola desactivada. Después preparar datos sintéticos,
dominio, variables independientes, receptor de correo y recorridos por roles.
La aplicación de esquema por sí sola no acredita staging operativo.

La prueba aislada comprueba el bootstrap completo, rechazo de repetición y
reversión de esquema/historial ante fallo. El ensayo nativo de concurrencia de CI
usa el mismo bootstrap antes de sus operaciones sintéticas.

## Aplicación real del 24 de septiembre

Tras la entrada privada de la contraseña por el propietario, se verificó la
conexión del proyecto y su estado vacío. El bootstrap de `996cf07` terminó con
`COMMIT` y 27 versiones registradas. La huella agregada de versión y SHA-256 del SQL
de cada migración coincide con el código revisado. No repetir el bootstrap sobre
esta base, que ya no está vacía.

Los controles de [verificación](../supabase/verify-staging-bootstrap.sql) dieron:

- 23 módulos y 34 tablas públicas, todas con RLS; cero tablas con lectura anónima
  o escritura directa del rol `authenticated`.
- 20 tablas internas sin permisos directos para `anon`/`authenticated`.
  `document_counters` no tiene RLS y conserva permisos exclusivos de `postgres`,
  como define la migración 004; se registra expresamente esta diferencia.
- Tres buckets privados: productos, recibos y archivos de trabajo; cero objetos.
- Cero usuarios, empresas, solicitudes, colas activas o adaptadores verificados.

Es evidencia del esquema en Supabase real, **no de la aplicación operativa**.
Siguen pendientes dominio, publicación web, receptor de correo, cuentas sintéticas,
recorridos de interfaz y recuperación completa. Producción no recibió migraciones.
