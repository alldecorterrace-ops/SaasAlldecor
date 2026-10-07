# Correo de Estimados · 7 de octubre

Faltante comprobado: Facturas tenía correo, pero Estimados no ofrecía la acción.
El controlador ADT actual envía al cliente, utiliza las partidas/notas guardadas
y registra PENDIENTE_ENVIO → ENVIADO o ERROR_ENVIO. Su SHA y copia privada
figuran en GASTOS-LOTE-CONSUMIDORES-20261007; no se publica código privado.

## Implementación

086 añade historial de intentos y un bucket privado de capturas, sin backfill.
El formulario confirma la dirección actual del cliente contra el RPC antes de
reclamar el intento. Se conserva el PDF de la revisión, con validación de bytes
y SHA-256. Un reintento consulta el intento durable antes de generar o enviar.
Nunca reenvía automáticamente un resultado processing/unknown.

En staging, solo direcciones @saasalldecor.invalid: captura MIME descargable,
sin invocar el MTA, sin marcar ENVIADO y sin cambiar el estimado. Producción
requiere ESTIMATE_MAIL_ENABLED=true y lista explícita ESTIMATE_MAIL_COMPANY_IDS,
con remitente válido y confirmación de envío. Esta entrega no activa esas opciones.

Un envío autorizado reclama PENDIENTE_ENVIO y su propia revisión; bloquea edición
y aprobación mientras está pendiente. MTA aceptado → ENVIADO, fallo → ERROR_ENVIO,
resultado incierto → mantiene pendiente. Cada transición conserva una revisión.
ENVIADO puede editarse o aprobarse con versión actual; el PDF anterior queda intacto.
No puede inventarse ENVIADO o ERROR_ENVIO mediante Guardar. Históricos permanecen
inmutables. Queued registra aceptación del MTA, no recepción del cliente.

El mensaje usa la identidad de cada empresa, partidas/notas guardadas, importes,
calendario y condiciones. Incluye el PDF y exige revisar contenido/idioma. Al
excluir IA no se añade traducción automática del texto libre: se conserva el
texto capturado. La estructura inglesa del correo no afirma que las partidas
libres hayan sido traducidas. Para preparar PDF/correo se guarda como Pendiente,
según el contrato vigente de documentos del SaaS; el envío no aprueba la venta.

## Validación y límites de esta versión

Ocho pruebas específicas locales aprobadas: configuración/entorno, MIME con
adjunto idéntico, pérdida de respuesta, revisión/recipiente ajenos u obsoletos,
estados de envío, bloqueo de edición, resultados inciertos, acceso/revocación y
descarga privada. Los resultados de MTA se simulan; no se envía correo real.
Comercial/PDF/Facturas y revisión integral se comprueban antes de publicación.
Publicación, SQL nativo, sesión web y retorno quedan pendientes hasta su acta
de entrega; la implementación local no equivale a prueba alojada ni recepción.
