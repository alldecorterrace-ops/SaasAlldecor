# Documentos privados: acceso HTTP y política de referencia

La comprobación del 6 de octubre usa GET al endpoint publicado en staging y la
sesión existente de la cuenta ficticia, sin añadir permisos ni crear credenciales.
El PDF permitido devuelve 200 y conserva exactamente los bytes de la revisión
guardada. Sin sesión devuelve 401; con empresa incorrecta o sin permiso de
Facturas devuelve 404 y el mismo error genérico, sin contenido del PDF.
Esto completa la comprobación HTTP que la navegación integrada había bloqueado.

## Defecto encontrado y corrección

La respuesta pública tenía `Referrer-Policy: strict-origin-when-cross-origin`
aunque los handlers de descarga declaran `no-referrer`. La regla general de
`next.config.mjs` se aplicaba al final y también sobrescribía las reglas privadas
de `/cliente` y `/acceso`. [Next documenta que prevalece la última regla coincidente](https://nextjs.org/docs/app/api-reference/config/next-config-js/headers#header-overriding-behavior).

La regla general se aplica primero. Las páginas de acceso privado y las familias
de descargas comerciales, factura por email, clientes, documentos operativos,
históricos, gastos y Workforce conservan `no-referrer` al final. Se conserva la
política general del resto del sitio, junto con nosniff, DENY y Permissions-Policy.
Los handlers mantienen su autorización, cache privada/no-store y verificación
de tamaño, firma y SHA-256. No se cambia la matriz RLS ni el acceso a documentos.

## Verificación y límites

Tres regresiones usan el matcher real de Next instalado, sin reconstruir sus
reglas en una imitación. Antes de corregir fallaban las rutas de descarga y
las páginas de acceso privado; después pasan, incluyendo las rutas generales.
La entrega exige además CI del commit exacto, lectura HTTP publicada, conservación
de datos y regreso comprobado; la evidencia final se registra en el PR de entrega.

El ensayo no envía emails, cobra, anula, importa datos o solicita GPS. La sesión
temporal privada del comprobador se elimina al finalizar y no se guarda en el
resultado ni en Git. Se conserva solo el PDF ficticio, estados HTTP, encabezados
seleccionados y su huella. No se afirma un incidente de exposición ni se declara
cerrada toda la matriz comercial o el SaaS completo.
