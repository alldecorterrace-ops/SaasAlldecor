# Ejecución y auditoría de los seis pasos

Fecha de inicio: 18 de septiembre de 2026. Destino: https://app.alldecorpatio.com.

Este documento distingue implementación, pruebas técnicas y recorridos reales.
Ningún paso se cierra solamente porque una página responda o el código compile.

| Paso | Trabajo comprobado | Lo que falta para cerrarlo |
| --- | --- | --- |
| 1. Auditoría de los 23 módulos | Pruebas de negocio existentes; auditoría adicional con todas las migraciones, permisos globales, aislamiento, flujo financiero e historial. Comprobación real de RLS y ensayo financiero en Supabase con ROLLBACK. | Recorridos autenticados de escritorio y móvil, archivos reales de prueba y comparación de acciones con ADT. |
| 2. Paridad funcional | Catálogo completo y primeras implementaciones; diferencias enumeradas en ALCANCE-Y-PARIDAD y ESTADO-IMPLEMENTACION. | Configurador avanzado, catálogo/cálculos, expedientes, mapa/GPS, horas/Workforce, portal, IA e integraciones. Cada diferencia necesita implementación y evidencia. |
| 3. Migración | Inventario actualizado del origen; respaldo privado de base y archivos; restauración de la base en un destino aislado; diagnóstico de relaciones y estados históricos. | Interpretar los detalles JSON, conservar estados adicionales, preparar correspondencias e importación reanudable, ensayar y conciliar antes de trasladar registros al SaaS. |
| 4. Acceso y correo | Recuperación publicada y confirmada por el propietario. Invitaciones internas con aceptación por correo confirmado, vencimiento y revocación; migración 015 aplicada. | Recorrido de invitaciones con una segunda cuenta, envío automático del aviso de invitación y notificaciones de negocio. |
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
[Invitaciones](INVITACIONES.md) para alcance, controles y envío de avisos pendiente.
