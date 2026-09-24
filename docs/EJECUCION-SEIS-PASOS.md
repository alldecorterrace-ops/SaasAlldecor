# Ejecución y auditoría de los seis pasos

Fecha de inicio: 18 de septiembre de 2026. Seguimiento actualizado: 24 de septiembre de 2026. Destino: https://app.alldecorpatio.com.

Este documento distingue implementación, pruebas técnicas y recorridos reales.
Ningún paso se cierra solamente porque una página responda o el código compile.

La numeración siguiente reemplaza el orden del seguimiento inicial y corresponde
al plan aprobado el 22 de septiembre. **Los seis puntos siguen abiertos.** ADT
conserva la operación principal. Los trabajos locales no equivalen a despliegue.

| Punto | Evidencia disponible | Pendiente de cierre |
| --- | --- | --- |
| 1. Versiones del servidor | Política publicada; planificador conservador probado que protege aplicación activa, retorno, procesos y dependencias transitivas. cPanel renovado e inventario inicial de 16 carpetas el 24 de septiembre. | Completar inventario de procesos y contenido, validar retorno, comprobar archivos únicos, confirmar lista exacta de eliminación y medir antes/después. No se han eliminado entregas en esta ejecución. |
| 2. Migración conciliada | Histórico publicado y lotes operativos de clientes, proyectos, estimados, facturas y pagos documentados por separado. Se conserva procedencia, originales y excepciones. | Delta contra ADT actual, entidades restantes, archivos faltantes y diferencias financieras. Mantener fichas separadas aprobadas y el cliente de correo inválido solo en histórico. Nuevas cargas reales esperan recuperación y staging. |
| 3. Paridad de 23 módulos | Primeras implementaciones y pruebas de persistencia/permisos; inventario actualizado de definiciones de ruta del origen el 22 de septiembre. | Cerrar acciones, cálculos, diseño avanzado, documentos, Workforce, portal e IA contra ADT vivo. Ningún módulo se declara todavía con paridad completa. |
| 4. Auditoría completa | Suite local, controles SQL remotos anteriores, correo/recuperación/aceptación confirmados por el propietario, comprobaciones públicas HTTP actuales. | Recorridos autenticados por cinco perfiles, escritorio/móvil, nueva invitación desde Configuración, concurrencia y dos empresas. La salud HTTP no sustituye esos recorridos. |
| 5. Recuperación y operación | Proyecto staging creado, 27 migraciones aplicadas e historial conciliado; registro y Email desactivados. Carpeta privada de Drive preparada, guardas de entorno, exportador PostgreSQL con snapshot común, captura de Storage/hosting, cifrado age, transferencia rclone con lectura posterior y recuperación aislada de archivos. Ensayos sintéticos y job PostgreSQL aprobados. | Completar aplicación de staging, configurar y probar acceso real/ETag/cuotas/custodia de clave/OAuth, comprobar captura completa, activar calendario y retención, verificar alertas, restaurar y probar carga. No hay todavía respaldo cifrado del destino verificado en Drive ni RPO/RTO acreditados. |
| 6. Traspaso | Migraciones 026–027 y API desactivadas; corte para drenar solicitudes anteriores y retener las nuevas. Primer adaptador transaccional de cliente SaaS y ensayo concurrente PostgreSQL aprobado. Receptor independiente en Supabase preparado. | Desplegar y ensayar en staging; adaptadores ADT y resto de acciones SaaS, integrar todas las entradas con el receptor, fencing real en ADT y cierre de 1–5. Las atestaciones sintéticas no autorizan traspaso; 026–027 no se han aplicado a producción. |

Detalles de esta entrega: [Operación y recuperación](OPERACION-Y-RECUPERACION.md),
[Cola de transición](COLA-DE-TRANSICION.md) y
[lectura autenticada de los 23 módulos](AUDITORIA-LECTURA-20260922.md). La lectura
de propietario pasó en escritorio/móvil salvo desbordamiento de Clientes en móvil,
corregido en código y pendiente de publicación. Los apartados siguientes conservan
la evidencia histórica con sus fechas; no representan comprobaciones repetidas hoy.

## Pruebas reproducibles

### Continuación del 24 de septiembre

El propietario completó el acceso al hosting y creó SaasAlldecor-Staging. Se verificó
el nuevo proyecto saludable y la identidad del hosting. En staging se desactivaron
el registro público y el proveedor Email; tras recargar persistieron desactivados,
igual que los demás proveedores. No hay hooks de Auth configurados. Es una medida
inicial: antes de habilitar acceso sintético se necesita un receptor de correo de
prueba y comprobar todos los emisores. Se aplicó después el esquema de staging,
como se detalla más abajo; no hubo cargas reales, limpieza ni despliegue web.

El inventario inicial del hosting conserva dieciséis carpetas de entregas. Se observó
una dependencia compartida y una utilización del límite de archivos que requiere
revisar la retención antes de instalar más copias. Cifras e identidades del entorno
se conservan en evidencia privada. Falta seleccionar y validar retorno, inventariar
contenido único y verificar procesos antes de proponer una eliminación concreta.

Se añadió [recuperación aislada de binarios de Storage](RECUPERACION-STORAGE.md):
plan local por defecto, bloqueo del origen y producción, buckets privados, subidas
sin sobrescritura, comprobación de contenido/MIME y reanudación tras respuesta perdida.
Las once pruebas nuevas usan HTTP simulado; el ensayo age/rclone local recuperó
nueve archivos y validó el mapeo descifrado. No acredita restauración real de Supabase,
Auth, Drive ni RPO/RTO. La suite local pasó **265 pruebas, lint, tipos y build**.

El monitor ya tiene evidencia de ejecución programada, incluida la del
[24 de septiembre](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36020079574).
Las cuatro rutas públicas también pasaron la comprobación directa. Los intervalos
observados de Actions superan los cinco minutos configurados: no se declara garantizada
esa frecuencia. Siguen pendientes recepción de alertas y monitor de respaldos reales.
Los seis puntos permanecen abiertos.

También se preparó el [bootstrap transaccional de staging](PREPARAR-STAGING.md),
con historial de las 27 migraciones y rechazo de destinos con datos. Dos pruebas
adicionales comprueban aplicación/repetición y reversión ante fallos; la suite
local pasó 267 pruebas, lint, tipos y compilación. Se generó un SQL y se transfirió
al directorio privado del hosting; su SHA-256 coincide.

El commit `996cf07` pasó los tres jobs de
[GitHub Actions](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36031597901),
incluida concurrencia PostgreSQL 17 usando el bootstrap nuevo. El primer acceso
desde hosting falló por la CA de TLS; el certificado oficial de Supabase corrigió
la verificación de cadena y nombre, comprobada con TLS 1.3. El propietario completó
la autenticación privada y se verificó el destino vacío antes de ejecutar el SQL.
Terminó con `COMMIT`, 27 migraciones e historial cuya huella coincide con GitHub.
Los controles reales comprobaron 23 módulos, RLS en las 34 tablas públicas, cero
lectura anónima/escritura directa, tres buckets privados sin objetos y cola apagada.
No hay usuarios ni empresas. La excepción interna `document_counters` conserva
solo permisos de `postgres` y queda detallada en [staging](PREPARAR-STAGING.md).
Se creó el subdominio de staging con raíz independiente, DNS y certificado HTTPS
válidos. Aún responde 404; la redirección HTTP configurada tampoco quedó verificada.
Staging todavía necesita publicar la aplicación, correo aislado y cuentas sintéticas.
Producción no recibió las migraciones 026–027 ni cambios de autoridad.

Se midieron 457.595 entradas en las 16 carpetas de entregas y se identificó un
proceso en la raíz configurada. No es una lista de borrado: falta verificar contenido
único y un retorno compatible. La dependencia compartida de la aplicación se conserva.

### Comprobaciones y evidencia previa

- `npm run check`: lint, tipos, pruebas PostgreSQL/validación y build.
- `tests/full-audit.test.ts`: aplica automáticamente todas las migraciones en una base desechable; verifica que ampliaciones posteriores no reabran escrituras, lectura anónima ni permisos financieros.
- `supabase/verify-release.sql`: controles de solo lectura en el proyecto remoto.
- `GET /api/health`: 200 con `{"status":"ok"}` cuando la aplicación puede consultar PostgreSQL; 503 en fallo. No usa una clave administrativa, no lee registros de negocio, no devuelve secretos ni detalles de errores. Agrupa consultas simultáneas y conserva el resultado como máximo 15 segundos (5 si falla).

Las pruebas locales simulan únicamente los contratos mínimos de Auth y Storage.
No prueban emisión de JWT, entrega de correo, subida binaria ni interacción autenticada.
El ensayo SQL remoto tampoco acredita esos recorridos de navegador.

El cambio `edaa154` pasó 244 pruebas, lint, tipos y build local. Su
[ejecución en GitHub](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/35741223991)
también pasó, incluido el ensayo de cola con conexiones concurrentes en PostgreSQL 17.
Es evidencia sintética del mecanismo y del adaptador de clientes, no del traspaso real.

La entrega de respaldos y monitor `8c77c45` pasó los tres jobs de
[GitHub Actions](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/35743327176):
250 pruebas/lint/tipos/build, concurrencia PostgreSQL y recuperación cifrada sintética.
El último ensayo exportó mientras otra conexión confirmaba cambios, cifró con age,
transfirió con rclone local y restauró en una base nueva, conservando relaciones e
importes del snapshot. No utilizó Drive ni datos de clientes; no acredita RPO/RTO reales.
Se corrigió la instalación del cliente PostgreSQL 17 del runner usando el repositorio
oficial antes de obtener ese resultado. Las cuatro comprobaciones públicas volvieron
a pasar, también en el [monitor por evento push](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/35743327273).
La ejecución programada y la recepción de alertas aún necesitan evidencia.

La preparación del receptor independiente `34e57b9` pasó 254 pruebas, lint, tipos,
build y comprobación del runtime Deno, además de repetir con éxito concurrencia y
restauración sintética en [GitHub Actions](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/35744039536).
Las migraciones 026–027, la función Edge y los cambios web de esta jornada continúan
sin desplegar. La cola permanece desactivada. Se revisó la cuota de Drive en la cuenta
acordada; cifras y observación están en evidencia privada. Falta medir el volumen real
del respaldo y la cuota del hosting antes de afirmar que cabe la retención.

Al terminar esta comprobación, cPanel seguía en su pantalla de acceso y el formulario
de creación de staging seguía pendiente de contraseña/envío por el propietario. Esas
dependencias impiden publicar, verificar el proceso activo y realizar restauración y
recorridos reales. También faltan la autorización persistente de rclone y la custodia
comprobada de la clave de recuperación. No se han cerrado paridad, delta de migración,
limpieza de entregas, carga al doble del pico ni traspaso/observación de catorce días.

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
originales. Las copias operativas de clientes y proyectos se documentan por separado; no se generaron nuevas aprobaciones, facturas ni pagos.

En aquella ejecución la sesión de la aplicación accesible al agente estaba
cerrada. Esa limitación histórica no demuestra el estado actual de la sesión;
los recorridos completos por perfiles continúan pendientes.

La [conciliación de facturas y pagos](CONCILIACION-FINANCIERA-ADT.md) añade una
consulta administrativa de importes guardados frente a calculados, con estados
de anulación, datos por confirmar y dependencias operativas separados. Esta
consulta no incorpora por sí sola facturas ni pagos actuales ni cierra la migración financiera.
Posteriormente se incorporaron lotes operativos documentados en
[Migración de facturas](MIGRACION-FACTURAS-OPERATIVAS.md) y
[Migración de estimados](MIGRACION-ESTIMADOS-OPERATIVOS.md).
