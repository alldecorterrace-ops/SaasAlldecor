# Recuperación de binarios de Storage en un proyecto aislado

Implementación del 24 de septiembre de 2026. No se ha ejecutado contra Supabase
real ni se ha restaurado una aplicación. El ensayo de cifrado y las pruebas de
HTTP simulado son evidencias independientes de una recuperación operativa.

## Alcance

`scripts/recover-storage.ts` recupera los archivos de un snapshot ya descifrado
y verificado. Conserva bucket, ruta, contenido y tipo MIME. Solo admite buckets
privados estándar, sin versionado, con su límite y tipos permitidos originales.
Rechaza formatos no soportados antes de escribir. No borra ni sobrescribe objetos,
no actualiza permisos y no ejecuta SQL.

La API genera nuevos identificadores y fechas de Storage. Los valores originales
siguen en el manifiesto cifrado; el recibo declara que IDs, fechas y metadatos
personalizados no se restauraron. Las políticas actuales del SaaS relacionan
documentos por bucket y ruta, pero esa inspección no reemplaza probar RLS, Auth,
las referencias y la interfaz en el destino. **No importar ciegamente las filas
de `storage.objects` del origen antes o después de subir estos binarios.** El
procedimiento de restauración PostgreSQL debe separar metadatos administrados y
reconciliarlos con los objetos creados por la API.

Se exige otro proyecto distinto del origen y del SaaS de producción. El destino
es exclusivamente de recuperación, sin aplicación operativa, usuarios externos
ni emisores de correo, proveedores, webhooks o cron activos. Un ensayo con datos
reales necesita un entorno aislado dedicado: no cargarlos en staging de uso
normal. La evidencia del aislamiento debe comprobarse antes de preparar el registro
privado que autoriza el ensayo; el script no configura Supabase Auth por sí solo.

## Preparación y ejecución

1. Recuperar la copia y su recibo cifrado usando el procedimiento de
   [operación y recuperación](OPERACION-Y-RECUPERACION.md). Obtener
   `manifestSha256` del recibo de confianza, no recalcularlo para aceptar una copia
   alterada. Conservar intactos los originales.
2. Crear el destino aislado y documentar sus controles, cuotas y bloqueo de
   emisores. Preparar una credencial administrativa **del destino**, fuera de
   GitHub y de argumentos de consola. El script solo usa HTTPS con el dominio
   exacto del proyecto y rechaza redirecciones.
3. Preparar un JSON privado con `snapshot`, `clearanceFile` y `receiptRoot`.
   `snapshot` contiene `directory`, `sourceProjectRef`, `targetProjectRef`,
   `manifestSha256` y `maxObjectBytes`. El límite debe cubrir los documentos del
   inventario y no puede exceder 256 MiB por objeto. No reducir controles para
   omitir archivos grandes: requieren otro mecanismo de recuperación validado.
4. Ejecutar `npx tsx scripts/recover-storage.ts CONFIG_PRIVADA.json`.
   Este modo predeterminado solo valida archivos locales y presenta cantidades;
   no consulta ni cambia el destino.
5. Preparar el registro privado de aislamiento: `targetProjectRef`,
   `manifestSha256`, `isolationEvidenceSha256`, `applicationStopped: true`,
   `externalEffectsDisabled: true`, `accessRestricted: true`, `sourceKind`
   (`synthetic`, `anonymized` o `production`), `verifiedAt` y `expiresAt` en UTC.
   Debe referirse a este snapshot/destino y durar como máximo dos horas. Los
   booleanos son una atestación del operador, no una comprobación remota.
6. En el proceso privado, configurar `RECOVERY_ENVIRONMENT=isolated`,
   `RECOVERY_TARGET_PROJECT_REF` y `RECOVERY_STORAGE_SERVICE_KEY`. Ejecutar
   `npx tsx scripts/recover-storage.ts CONFIG_PRIVADA.json --apply` únicamente
   después de verificar el aislamiento.

Antes de la primera escritura, el ejecutor comprueba todos los buckets existentes
y descarga todos los objetos ya presentes en las rutas esperadas. Una diferencia
de contenido, MIME o configuración detiene el recorrido sin modificar esos datos.
Solo una respuesta HTTP 404 confirma ausencia; errores de autorización, respuestas
inciertas o formatos distintos detienen el ensayo. El comportamiento concreto de
errores/ETag del Supabase real sigue pendiente de validación.

Las subidas usan `x-upsert: false`, conforme al
[contrato de subida de Supabase](https://supabase.com/docs/reference/javascript/file-buckets-upload).
La creación conserva buckets privados y sus límites según el
[contrato de buckets](https://supabase.com/docs/reference/javascript/file-buckets-createbucket).
Se comprueba de nuevo el destino antes de subir y se descarga todo al final para
comparar SHA-256, longitud y MIME. La lectura limita el tamaño de la respuesta.

## Interrupciones y prueba de recuperación

Si se pierde una respuesta, conservar los archivos y el mismo snapshot/configuración.
El script no elimina ni revierte lo que se haya confirmado en destino. Repetirlo
verifica los archivos existentes y continúa los ausentes. Un conflicto requiere
revisión; no se transforma automáticamente en una sustitución.

El recibo privado registra cantidades, huellas del snapshot/aislamiento y cuántos
archivos se subieron o reutilizaron. `storageBytesVerified: true` solo acredita los
binarios del inventario esperado en esa ejecución; no inventaría objetos extra,
no acredita descarga desde Drive, restauración PostgreSQL, permisos ni disponibilidad
de la aplicación. `applicationRestored` y `authorizationVerified` permanecen false.

Pruebas automatizadas: reanudación sin duplicados, respuesta perdida, conflictos,
bucket público/incompatible, corrupción, límites de lectura, rechazo de producción,
vencimiento de evidencia y cambios concurrentes de archivos locales/remotos. El
ensayo de age/rclone local conserva nueve archivos, incluido el mapeo de Storage,
y valida que el paquete descifrado produce el plan esperado. No usa datos reales.

Quedan pendientes el recorrido real de exportación/restauración en Supabase,
recuperación y conciliación de base/Auth, recuperación de documentos/configuración
del hosting y prueba integral por roles antes de medir RPO/RTO.
