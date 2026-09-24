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

Es evidencia del esquema en Supabase real, **no de los recorridos de aplicación**.
La publicación y el receptor comprobados posteriormente se documentan debajo.
Producción no recibió migraciones.

Se creó `staging.alldecorpatio.com` con raíz independiente; DNS resuelve al hosting
y HTTPS valida su certificado. Antes de publicar, la raíz respondía 404 y Force
HTTPS de cPanel no producía la redirección efectiva. Se corrigió al configurar
la aplicación; dominio y esquema por sí solos no se contaron como staging operativo.

## Receptor privado de correo Auth

`supabase/staging/auth-mail-sink.sql` es una instalación **exclusiva de staging**,
fuera de las migraciones compartidas. Requiere verificar la conexión oficial y
ejecutar `SET saas.install_staging_mail_sink = 'verified-empty-staging';` antes
de cargarlo con `ON_ERROR_STOP`. Esa declaración no detecta el destino: la
verificación de conexión sigue siendo obligatoria. Rechaza bases con usuarios,
empresas u objetos, y no reemplaza una instalación existente. Ante error ejecutar
`ROLLBACK` y revisar la causa.

Configurar **Authentication → Hooks → Send Email → Postgres function** con
`public.staging_capture_auth_email` antes de habilitar el proveedor Email.
Conservar desactivado el registro público. El hook reemplaza el envío de correo;
no usa SMTP, HTTP ni credenciales de producción. Acepta únicamente destinatarios
de `saasalldecor.invalid`, incluso ambas direcciones de un cambio de correo.
Un destinatario distinto genera error. Nunca quitar el hook mientras Email esté
habilitado; desactivar primero el proveedor si se necesita retirar el receptor.
Contrato oficial: [Send Email hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook).

Los mensajes quedan en `staging_private.auth_mail`. Contienen tokens activos:
no consultarlos en resultados públicos, logs, capturas o GitHub. Solo el operador
de la base puede leerlos. `supabase_auth_admin` solo puede invocar el hook e
insertar; los roles de la aplicación no pueden leer ni invocar. El esquema no
debe añadirse a la lista de esquemas expuestos por la API. Usar únicamente
cuentas sintéticas y revisar/purgar las capturas tras el ensayo según su retención;
no trasladarlas a producción.

Las pruebas PostgreSQL aisladas comprueban captura y permisos, rechazo de bases
con datos, reinstalación, destinatarios externos y mensajes inválidos. Esto no
acredita la configuración real del hook ni un recorrido de recuperación: después
de instalar se debe comprobar una solicitud sintética real y su captura privada,
sin publicar el token ni marcar como verificado un correo externo.

## Publicación web y límite de procesos

La primera entrega web `b149bee` respondió 200 en salud, login y recuperación;
HTTP redirigió a HTTPS y las rutas privadas exigieron sesión. Se observaron login
y recuperación a 390 × 844, con aviso visible de entorno de pruebas. Esto prueba
las pantallas públicas, no los recorridos autenticados.

Al coexistir con producción, su proceso abrió 32 hilos y el usuario alcanzó 74
en total. cPanel informó `cagefs_enter: Unable to fork` y la terminal confirmó
`Resource temporarily unavailable`. Se detuvo únicamente el proceso identificado
por la carpeta de staging; no se reinició producción. Los límites de UV, Rayon,
V8 y Tokio por entorno no redujeron el grupo nativo observado.

La comprobación local aisló la carga de `next.config.ts`: el arranque de Next
precargaba SWC nativo aunque la aplicación estuviera compilada. La corrección
`9ccf77f` conserva las mismas opciones en `next.config.mjs`; la misma sonda de
arranque pasa de `nativeSwcLoaded: true` a `false`. Pasan 270 pruebas, lint, tipos
y build, y [CI](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36038605924).
La compilación inicial falló con `EAGAIN` al coexistir con un proceso antiguo de
staging que reapareció. Se aisló temporalmente solo staging con respuesta 503,
se detuvo su proceso y se compiló con Node directo, un CPU y dependencias de staging
sin modificaciones. La compilación terminó y se activó `9ccf77f`.

Después de publicar, el proceso identificado por su raíz nueva usa **5 hilos**;
producción conserva su proceso anterior con 40. Ambas rutas de salud responden
200 y cPanel Resource Usage vuelve a abrir. La pantalla de recuperación muestra
el aviso de entorno de pruebas. Esto resuelve el fallo observado de arranque;
no acredita carga al doble del pico ni capacidad de recuperación.

## Auth aislado comprobado

El SQL del receptor terminó con `COMMIT` en staging. El hook Send Email está
habilitado con `public.staging_capture_auth_email`, configurado antes de activar
Email. El registro público, acceso anónimo y otros proveedores siguen desactivados.
Site URL usa `https://staging.alldecorpatio.com`, con los callbacks exactos
`/auth/callback` y `/auth/callback?next=%2Factualizar-contrasena`.

Una invitación sintética desde Supabase creó un usuario y una captura privada
de tipo `invite`. El intento posterior con un dominio ficticio distinto no creó
usuario ni captura; los conteos permanecieron en uno. Solo se consultaron metadatos,
sin mostrar tokens. No prueba aceptación ni recuperación completa.

La aplicación bloquea por defecto la recuperación en staging. Para ensayar ese
recorrido después de verificar el hook, configurar exclusivamente en el servidor
`STAGING_AUTH_EMAIL_CAPTURE_VERIFIED=true`. Permite solo destinatarios
`@saasalldecor.invalid` y vuelve a comprobar que el entorno apunta a una base y
origen separados. No habilita correo externo, invitaciones SMTP ni IA. Retirar
esta marca y desactivar Email antes de cambiar o quitar el hook. Las pruebas
comprueban que destinos externos, configuración de producción y falta de la marca
no llaman al proveedor de Auth.

Quedan pendientes la creación privada de contraseña de la primera cuenta de
auditoría, sus recorridos autenticados y la recuperación de datos real desde Drive.

La entrega `d530c33d38f0e76bf620aa91f3004ceda4dc9244` pasó **272 pruebas, lint,
tipos y build**, además de los tres jobs de
[CI](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36040044187).
Está publicada en staging con la marca del receptor verificado. Se comprobó la
raíz del proceso nuevo y conserva cinco hilos; producción conserva su proceso
anterior. Las dos rutas de salud respondieron 200.

Desde la pantalla publicada, una dirección ajena al dominio sintético fue
bloqueada por la aplicación. La solicitud de recuperación sintética llegó al
proveedor y recibió **429**; la interfaz mostró el límite temporal sin declarar
envío correcto. La tabla privada sigue con una captura `invite` y ninguna
`recovery`. El recorrido de recuperación sigue pendiente hasta disponer de
capacidad del proveedor; no se relajaron sus límites ni se repitieron solicitudes.
La API pública rechazó el esquema `staging_private` con `PGRST106`, exponiendo
únicamente `public` y `graphql_public`.

Retención de esta publicación: `d530c33` activo, `9ccf77f` anterior comprobado
en las pantallas públicas y `b149bee/node_modules` como dependencia compartida
indispensable. No eliminar esta dependencia ni declarar el retorno completamente
auditado sin el recorrido autenticado. La limpieza histórica sigue pendiente.
