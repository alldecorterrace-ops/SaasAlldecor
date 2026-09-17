# Diseños, precios, web, portal e IA

Esta entrega agrega operaciones reales para los seis módulos comerciales restantes. Es una primera implementación; no certifica equivalencia completa con ADT Admin.

## Precios y diseños

Precios guarda diez tarifas de venta por empresa, con versiones e historial. Pérgola sin 3D y Nuevo estimado 3D permiten configurar techo, dimensiones, color, pared, cocina, piezas reforzadas y permiso. Los importes se calculan en PostgreSQL: techo/pared por área, cocina por pie lineal, refuerzos por pieza y permiso fijo o por área según umbral. Un diseño conserva la tarifa que utilizó; actualizar precios requiere una acción explícita.

El diseño puede archivarse y convertirse en un borrador de Estimados. Reintentar la conversión de la misma revisión devuelve el documento existente. Una revisión posterior crea otro documento y conserva el anterior. Productos y partidas especiales se completan en Estimados.

El visor 3D utiliza geometría proyectada interactiva, con rotación y zoom. Es una vista conceptual rectangular, no un motor CAD ni un cálculo estructural. Quedan pendientes la geometría avanzada de ADT, equipos integrados en el diseño, cálculos de costos/márgenes, despiece automático, planos y renders fotográficos. No se presenta el visor como equivalente al configurador completo anterior.

## Estimados web

- Formularios públicos por empresa, vigencia de 30 días y desactivación inmediata.
- Solicitudes con contacto, servicio, medidas aproximadas y mensaje; validación en PostgreSQL, reintento idempotente y máximo de 50 solicitudes por empresa en 24 horas.
- Revisión, archivo sin borrar y conversión a Leads. La conversión exige permisos en ambos módulos y no duplica el lead al reintentarse.
- Publicación de una revisión exacta de Estimados mediante enlace privado de 1–30 días, revocable. El enlace se muestra al crearlo y no se envía por correo automáticamente.
- El cliente registra aceptación o solicitud de cambios, nombre y comentario. Es una respuesta del poseedor del enlace, no una verificación de identidad ni una firma electrónica certificada. La aprobación financiera continúa siendo una acción interna.
- Un documento modificado, vencido o anulado no admite nuevas respuestas desde la revisión anterior. Las respuestas y snapshots previos se conservan.

Pendientes: importación de entradas web antiguas, SMTP, protección antispam más avanzada y autenticación reforzada del firmante.

## Portal del cliente

El acceso se limita a los proyectos y saldos de facturas del cliente y empresa seleccionados. No expone notas internas, costos, salarios, contactos de terceros ni acceso general a tablas. Muestra los 100 registros más recientes por categoría.

Los enlaces usan 32 bytes aleatorios; PostgreSQL conserva solo su hash. El navegador recibe el secreto en el fragmento, lo retira de la barra de dirección y lo intercambia por una cookie HttpOnly. Cada consulta valida vencimiento, revocación y permisos del emisor. La revocación corta el acceso incluso si la cookie sigue presente. No se usa service_role.

Quedan pendientes documentos descargables por expediente, fotos de avance, mensajes y cobros en línea. Los pagos mostrados son registros externos; este portal no carga tarjetas.

## IA Assistant

El servidor consulta OpenAI mediante una variable privada; nunca se envía la clave al navegador ni a GitHub. El administrador puede activar o desactivar el módulo por empresa y fijar de 1 a 100 intentos en 24 horas, con máximo adicional de cuatro por minuto por usuario. Los intentos fallidos también consumen el cupo y no se reintentan automáticamente.

El asistente recibe únicamente la pregunta y un resumen agregado de los módulos que el usuario puede leer: clientes, estimados, saldos, proyectos, inventario y horas. No recibe nombres de clientes, salarios, archivos ni registros individuales. La pregunta puede contener lo que escriba el usuario; la interfaz informa del envío al proveedor. Cada consulta es independiente. Las respuestas se muestran como texto, con los datos utilizados disponibles para revisión; no ejecuta escrituras ni envía mensajes.

Referencia del proveedor: [API de Chat Completions](https://developers.openai.com/api/reference/resources/chat). Modelo predeterminado `gpt-4o-mini`; configurar `OPENAI_ASSISTANT_MODEL` solo después de verificar compatibilidad y consumo. Usa la cuenta API existente y puede generar consumo en ella; no implica contratar un plan nuevo de hosting.

Quedan pendientes memoria conversacional, documentos, imágenes y herramientas de acción del asistente antiguo. La comprobación de conectividad del proveedor no sustituye el recorrido autenticado de la interfaz del SaaS.

## Validación

`tests/design-sharing.test.ts` cubre tarifas y snapshots, cálculo, referencias de empresa, permisos, conversión sin duplicados, enlaces secretos, respuestas idempotentes, revisiones obsoletas, revocación, pérdida de permisos del emisor, portal por cliente, recepción web y límites/contexto de IA. Los datos son sintéticos, en PostgreSQL local mediante PGlite.

Auditar en orden: Precios → diseño → Estimado → propuesta web → respuesta del cliente → aprobación interna → Factura/Proyecto → Portal. En otra sesión sin permisos, verificar denegación de lectura y escritura. En una segunda empresa, comprobar que no se muestran ni modifican registros de la primera.
