# Ubicación automática de códigos postales

ADT consulta Nominatim para cada ZIP sin centro, toma el primer resultado de
Estados Unidos, conserva la ciudad del informe, guarda y actualiza el mapa. El
SaaS añade ese recorrido a Mapa de zonas con progreso, resultados y detención
entre consultas. No se solicita ni se transmite una dirección de cliente.

## Proveedor y operación

Leer la [política oficial de Nominatim](https://operations.osmfoundation.org/policies/nominatim/)
antes de activar el servicio público. Exige identificación, atribución, caché,
límites conjuntos de la aplicación y restricciones para procesos por lotes.
No es un servicio con disponibilidad garantizada. Este uso es una decisión
explícita del operador: no se activa por instalar o compilar la aplicación.

- `ZONE_GEOCODER_PROVIDER=disabled` por defecto. La captura manual sigue disponible.
- `synthetic` solo funciona en staging correctamente separado de producción:
  ZIP 33198 devuelve coordenadas ficticias y 33199 no tiene resultado. Todos los
  demás devuelven no disponible. No realiza solicitudes externas.
- `nominatim` requiere entorno de producción, `ZONE_GEOCODER_POLICY_REVIEWED=true`,
  `ZONE_GEOCODER_SINGLE_HOST` igual al hostname del único servidor ejecutor,
  `ZONE_GEOCODER_DIRECTORY` absoluto, privado y persistente fuera del webroot,
  `ZONE_GEOCODER_CONTACT_URL` público e identificable y un endpoint HTTPS.
- Endpoint público: `https://nominatim.openstreetmap.org/search`. Se puede cambiar
  por otro compatible sin publicar código. No usar credenciales en la URL.
- Node 22.13 o superior con `node:sqlite`. El directorio de caché no puede ser
  una entrega temporal, un directorio web o una ruta distinta en cada proceso.
  Todos los procesos del único servidor comparten el mismo archivo SQLite local.
  No desplegar esta configuración en varias máquinas, réplicas o hosts con el
  mismo nombre. Para esa arquitectura hace falta un ejecutor central separado.

La reserva SQLite es transaccional y global, incluso entre empresas. Una consulta
a la vez, separación mínima de 15,25 segundos, timeout HTTP de 10 segundos y
reserva de 45 segundos. Un fallo impone 60 segundos de espera. Una respuesta
tardía no puede liberar ni reemplazar la reserva de otro proceso. No hay cron,
autocompletado, barrido de códigos ni consultas al cargar la página: cada lote
requiere pulsar el botón. La caché positiva dura siete días; sin resultado, un día.
Las coordenadas ya guardadas en cada empresa no caducan con esa caché.

La solicitud usa los [parámetros oficiales](https://nominatim.org/release-docs/latest/api/Search/)
`format=json`, `limit=1`, `countrycodes=us`, `postalcode=ZIP`, con User-Agent de
SaasAlldecor y enlace de contacto. No envía nombre, correo, ciudad, empresa ni
dirección. Rechaza redirecciones, respuestas grandes y coordenadas inválidas.

## Autorización y concurrencia

Cada código vuelve a comprobar sesión, empresa, escritura de mapa y lectura de
Clientes, Facturas, Estimados web y Leads. Solo acepta ZIP pendientes del informe
autorizado actual. La consulta no concede acceso a otros datos ni usa service role.

El guardado usa `save_postal_center` con versión inicial cero y sus permisos en
PostgreSQL. Si otro usuario guardó una ubicación durante la consulta, conserva
esa ubicación y devuelve conflicto. Si ya estaba guardada antes, no consulta al
proveedor. Los reintentos idénticos mantienen el comportamiento idempotente del
RPC. Al revocar permisos entre consulta y guardado, la base rechaza la escritura.

La caché del proveedor contiene exclusivamente ZIP, coordenadas públicas,
vencimientos y reservas técnicas. No contiene registros de clientes. Directorio
0700 y archivo 0600; preservar al publicar/volver de versión. Si se pierde o falla,
se conserva la configuración manual; no se salta el control global de consultas.

## Diferencias expresas respecto a ADT

La pausa original de 1,15 segundos ocurre en cada navegador; aquí se coordina
entre todos los procesos y se limita más. Los fallos quedan visibles y una
ubicación manual concurrente tiene prioridad. Se conservan el origen de los ZIP,
el primer resultado, la ciudad original y las reglas de cálculo del mapa.

Las pruebas sintéticas acreditan interfaz y persistencia únicamente. La conexión
real y la cartografía se verifican por separado. No se activó el proveedor real
en producción por este cambio y no se migraron datos de ADT.
