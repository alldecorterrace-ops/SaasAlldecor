# Avisos del formulario por empresa · 7 de octubre

## Regla y alcance confirmado

Lectura SSH de ADT contact_us el 7 de octubre: al completed hay dos handlers
email habilitados. Message received confirma al email del solicitante; el aviso
interno usa una dirección configurada y los valores enviados, HTML sin adjuntos.
Hay un remote_post legacy para completed; no se copia su URL privada ni se
configura Make en el SaaS. La revisión/conversión propia del SaaS conserva el
contacto dentro de su empresa. El controlador ADT vigente admite los estados
NUEVO, CONTACTADO, COTIZANDO, GANADO, PERDIDO y CLIENTE. Su código permanece privado.

El propietario confirmó una dirección interna configurable por empresa.
Configuración gestionada por Propietario/Administración con versión y auditoría;
no adopta la dirección privada de ADT ni comparte destinos entre empresas.

## Implementación

087 crea dos eventos durables en la transacción de una solicitud nueva. No hay
backfill de contactos, migración de ADT ni cambios a funciones existentes de
formulario, Lead, catálogo, precios, Facturas o Gastos. El reintento del mismo
id no genera otros avisos. Revisión/archivo/conversión no vuelven a notificarlos.
Cada aviso conserva empresa, solicitud, contenido y destinatario. Cambiar la
dirección aplica a futuras solicitudes. Un aviso interno recibido sin dirección
queda blocked: Administración puede asignar la configuración vigente con una
confirmación específica y auditoría, sin alterar el contacto capturado. El RPC
rechaza una confirmación si la dirección vigente ya no coincide con la mostrada.

Staging solo conserva MIME con direcciones ficticias, sin MTA. Su descarga
requiere el permiso vigente de Estimados web, bucket privado, SHA/bytes originales
y cabeceras private/no-store/nosniff. Producción requiere WEB_NOTICE_MAIL_ENABLED,
WEB_NOTICE_MAIL_COMPANY_IDS, MAIL_FROM_ADDRESS y la credencial privada dedicada
WEB_NOTICE_SUPABASE_SERVICE_KEY para el worker automático. Esta entrega no crea
ni configura credenciales, cron, env real, destinatarios reales o un envío externo.

El worker after-response intenta los dos avisos después de guardar la consulta;
un fallo de correo no revierte el contacto ni expone rutas internas al público.
La cola también permite revisar avisos todavía pendientes desde el panel. El
claim se vuelve a comprobar con permisos actuales, resultados finales inmutables
y processing/unknown nunca se reenvían automáticamente. Queued significa MTA
aceptado, no recibido. El contenido usa estructura inglesa y texto libre exacto;
no se añade traducción automática al haber excluido IA.

## Verificación actual

npm run check completo aprobado: lint, tipos, 910 pruebas sin fallos ni saltos y
build Next. Dentro de ellas, 11 pruebas focalizadas locales aprobadas: modo/configuración por empresa,
transacción y repetición de entrada anónima, destinatario congelado, recuperación
explícita, MIME/HTML seguro y descarga privada, respuesta perdida, queued/failed/
unknown, actor del worker, estados de Lead/archivo/restauración/conversión repetida,
roles/revocación/empresa ajena. MTA y Storage se simulan localmente. Sin venta,
factura, proyecto ni pago. La función auth.role del doble de pruebas reproduce
solo el contrato mínimo; no acredita emisión de JWT o Auth real.

CI completo, SQL nativo, publicación, sesión web y regreso quedan abiertos hasta
su acta. No presentar la implementación local como recepción o función publicada.
