# Ejecución y auditoría de los seis pasos

Fecha de inicio: 18 de septiembre de 2026. Destino: https://app.alldecorpatio.com.

Este documento distingue implementación, pruebas técnicas y recorridos reales.
Ningún paso se cierra solamente porque una página responda o el código compile.

| Paso | Trabajo comprobado | Lo que falta para cerrarlo |
| --- | --- | --- |
| 1. Auditoría de los 23 módulos | Pruebas de negocio existentes; auditoría adicional con todas las migraciones, permisos globales, aislamiento, flujo financiero e historial. Comprobación real de RLS y ensayo financiero en Supabase con ROLLBACK. | Recorridos autenticados de escritorio y móvil, archivos reales de prueba y comparación de acciones con ADT. |
| 2. Paridad funcional | Catálogo completo y primeras implementaciones; diferencias enumeradas en ALCANCE-Y-PARIDAD y ESTADO-IMPLEMENTACION. | Configurador avanzado, catálogo/cálculos, expedientes, mapa/GPS, horas/Workforce, portal, IA e integraciones. Cada diferencia necesita implementación y evidencia. |
| 3. Migración | Respaldo privado y restauración aislada. Consulta histórica de estimados, clientes, proyectos, facturas, pagos, documentos y contratos publicada; originales y relaciones verificados en Supabase. PDF disponibles conservados en almacenamiento privado con descarga protegida. Casos con referencias pendientes separados para administradores. Se conservaron los registros actuales. | Revisar pantallas y descargas con sesión real; resolver referencias y archivos faltantes; completar migración operativa y demás entidades; conciliar el delta desde el respaldo. |
| 4. Acceso y correo | Recuperación publicada y confirmada por el propietario. Invitaciones internas con aceptación por correo confirmado, vencimiento y revocación; aceptación con segunda cuenta confirmada por el propietario y en Supabase. Migraciones 015–016 aplicadas; aviso automático publicado y correo técnico recibido en Recibidos, confirmado por el propietario. | Crear una invitación nueva desde la pantalla autenticada y comprobar su aviso e historial; notificaciones de negocio. |
| 5. Operación estable | Compilaciones fuera de la carpeta activa; respaldo del origen y ensayo de restauración de 208 tablas. Endpoint de salud con consulta anónima de solo lectura y sin información privada. | Monitoreo externo activo, respaldos programados de Supabase y sus objetos, restauración del destino, staging completo y prueba de carga controlada. |
| 6. Retirar instalación anterior | No se ha retirado; la compilación auxiliar detenida no era el sitio activo. | Completar los cinco pasos anteriores, definir el corte de escrituras, conciliar el delta y conservar una recuperación probada. |

## Pruebas reproducibles

- `npm run check`: lint, tipos, pruebas PostgreSQL/validación y build.
- `tests/full-audit.test.ts`: aplica automáticamente todas las migraciones en una base desechable; verifica que ampliaciones posteriores no reabran escrituras, lectura anónima ni permisos financieros.
- `supabase/verify-release.sql`: controles de solo lectura en el proyecto remoto.
- `GET /api/health`: 200 con `{"status":"ok"}` cuando la aplicación puede consultar PostgreSQL; 503 en fallo. No usa una clave administrativa, no lee registros de negocio, no devuelve secretos ni detalles de errores. Agrupa consultas simultáneas y conserva el resultado como máximo 15 segundos (5 si falla).

Las pruebas locales simulan únicamente los contratos mínimos de Auth y Storage.
No prueban emisión de JWT, entrega de correo, subida binaria ni interacción autenticada.
El ensayo SQL remoto tampoco acredita esos recorridos de navegador.

## Recuperación de contraseña

El enlace «Olvidé mi contraseña» abre `/recuperar-contrasena`. La solicitud usa
Supabase Auth y el callback del dominio configurado, con el destino fijo
`/actualizar-contrasena`. Autorizar en Supabase URL Configuration el callback exacto:

`https://app.alldecorpatio.com/auth/callback?next=%2Factualizar-contrasena`

El callback debe intercambiar correctamente el código antes de redirigir. La
página y la acción de actualización comprueban el usuario en servidor. Cualquier
otro destino solicitado se ignora. La respuesta a la solicitud no revela si
existe la cuenta; un mensaje genérico no acredita recepción del correo.

El flujo PKCE requiere abrir el enlace en el mismo navegador que lo solicitó.
El propietario introduce la nueva contraseña: las pruebas automáticas no cambian
credenciales reales. Guía oficial: [recuperación con Supabase](https://supabase.com/docs/guides/auth/passwords).

## Respaldo e importación

Los respaldos y resultados con información de negocio están fuera del repositorio
público y del directorio web, con permisos restringidos. La copia local tiene una
ACL limitada al usuario y SYSTEM. El SHA-256 del respaldo de base coincide con el
del servidor. La base restaurada no está conectada a ninguna aplicación ni cron.

La inspección detectó detalles de estimados que no están en las filas normalizadas
y estados históricos que el modelo nuevo aún no representa. No se convertirán
automáticamente documentos históricos en aprobaciones, facturas o pagos nuevos.
Los totales, estados originales y relaciones deben conservarse y reconciliarse.

El respaldo MySQL del origen no sustituye un respaldo PostgreSQL del SaaS. Los
archivos de Supabase Storage requieren una copia independiente, como documenta
[Supabase sobre respaldos](https://supabase.com/docs/guides/platform/backups).

La confirmación del propietario de que abre el dominio nuevo se registra como
evidencia de acceso. La resolución DNS del equipo de trabajo se recuperó y se verificó el formulario público en navegador; las comprobaciones dirigidas a la IP también mantuvieron la validación TLS.

## Publicación de recuperación y salud

El 18 de septiembre se publicó `c328de8` en el hosting de destino, conservando
la entrega anterior y un respaldo privado de su configuración. Las 108 pruebas,
lint, tipos y build pasaron localmente y en
[GitHub Actions](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/35359909505).

Después de activar el nuevo proceso: login y recuperación respondieron 200,
actualización de contraseña sin sesión redirigió al login, y `/api/health`
respondió 200 con `{"status":"ok"}` y `Cache-Control: no-store`. El navegador
mostró el enlace y el formulario publicados. Se añadió el callback exacto de
recuperación a Supabase, manteniendo los anteriores.

El propietario creó `notificacione@alldecorpatio.com` y eligió `SaasAlldecor`
como nombre visible. Tras abrir inicialmente el correo en otro navegador,
solicitó un enlace nuevo y confirmó que la recuperación funciona. Es evidencia
aportada por el propietario; el agente no introdujo ni cambió su contraseña.

## Invitaciones internas

La migración 015 añade invitaciones sin modificar las dos empresas ni sus dos
membresías existentes. Los nuevos miembros empiezan sin módulos asignados.
Las 118 pruebas, lint, tipos y compilación local pasaron. Véase
[Invitaciones](INVITACIONES.md) para alcance, controles y envío de avisos.

Entrega publicada: `623b273`. [GitHub Actions](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/35362218349)
aprobó las mismas comprobaciones. Se verificó la raíz del proceso activo en el
hosting y pasaron las 24 comprobaciones HTTP de salud, recuperación, rutas
públicas/privadas y recursos protegidos. La tabla nueva tiene RLS, sin lectura
anónima ni escrituras directas. Se creó la invitación pendiente que autorizó el
propietario para una segunda cuenta, mediante SQL administrativo con el rol
autenticado limitado a la empresa. No se aceptó en nombre del destinatario ni
se envió un aviso automático. El propietario confirmó posteriormente la aceptación; Supabase muestra la
invitación aceptada y tres membresías, frente a las dos anteriores. Las demás
pantallas con sesión real mantienen sus pruebas pendientes.

## Avisos de invitación

La ampliación de correo pasa 127 pruebas, lint, tipos y build locales. La
migración 016 se aplicó en el destino: RLS activo, sin lectura anónima ni
escritura directa, y se conservaron las dos empresas y tres membresías.
Entrega `d6fe007` publicada y [GitHub Actions](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/35364352066)
aprobado. La compilación del hosting se completó con un trabajador. Se conservó
`623b273` y su configuración para reversión. Se verificaron la raíz del proceso
activo, el entorno del correo y 24 comprobaciones HTTP sin fallos.

Un único mensaje técnico, claramente identificado como prueba, fue aceptado por
el MTA y por el relay del proveedor; el propietario confirmó su llegada a
Recibidos. No se creó ni se reenvió una invitación ya aceptada. Esta evidencia
valida el transporte de correo, no reemplaza crear una nueva invitación desde
Configuración con una sesión real y revisar su historial de envío.

## Ensayo de migración de estimados

Se preparó y ejecutó un plan offline contra la copia restaurada. Se verificó
la prioridad entre JSON, proyecciones sembradas y ediciones manuales consultando
el controlador desplegado de ADT. Los registros originales se conservaron y
las diferencias quedaron señaladas sin corregirlas automáticamente. No hubo
escrituras en bases de negocio. Véase [Ensayo de estimados](MIGRACION-ESTIMADOS.md).

La carga posterior en PostgreSQL local aislado conservó originales y hashes;
repetirla no duplicó registros. Las pruebas comprueban aislamiento de empresa,
rechazo de cambios del origen y reversión del lote ante conflictos. El diagnóstico
de redondeo conserva las marcas de revisión y los importes históricos. Ese ensayo
no escribió en Supabase. La carga posterior de estimados se documenta debajo;
el paso completo de migración permanece abierto.

El [ensayo de relaciones del histórico](MIGRACION-HISTORICO.md) incorpora ocho
entidades en una transacción local con claves foráneas por empresa. Conserva
referencias ausentes sin inventar destinos y bloquea relaciones que contradicen
el cliente de un documento. El plan distingue datos históricos de consulta de
operaciones actuales. La [consulta de estimados históricos](HISTORICO-ESTIMADOS.md)
ya está publicada y su carga se aplicó a la empresa elegida. También se publicó
la [consulta de clientes, proyectos, facturas y pagos](HISTORICO-NEGOCIO.md), con
integridad y permisos verificados en Supabase. El [archivo de documentos y
contratos](HISTORICO-DOCUMENTOS.md) también está publicado, con originales
privados, PDF conservados y casos pendientes separados. Se conservan los
originales y no se generaron operaciones actuales a partir del histórico.

La sesión de la aplicación accesible al agente sigue cerrada. El propietario
confirmó que trabaja desde otra PC y pidió continuar con tareas independientes;
la auditoría de pantallas autenticadas continúa pendiente.
