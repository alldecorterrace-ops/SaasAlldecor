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
La revisión completa local y GitHub aprobó 899 pruebas, sin fallos ni omitidas,
lint, tipos y build. CI 37644852948 (run 227), aplicación e25191b4876a7f1923efe60d00517cab2780419f.

## Publicación y sesión comprobadas

086 aplicada solo en SaasAlldecor-Staging: 91 tablas y 1.433 filas preexistentes
conservadas, sin backfill; grants existentes de Guardar/Aprobar iguales y bucket
nuevo privado. Ensayo nativo con rollback: capture no cambia el estimado;
queued/failed/unknown son distintos; pendiente bloquea edición; repetición no
reclama otro intento. No se subieron binarios ni se ejecutó MTA en ese ensayo.

Sesión ficticia de Administración: EST-2026-0016, revisión 1 Pendiente, USD 300.00.
La ficha de catálogo copió nombre, precio por unidad y descripción; medidas
24 × 6 × 6 ft descriptivas no multiplican el precio. PDF y correo conservan esa
partida y el calendario 30/150/90/30. Una acción Probar Enviar por email generó
un único intento captured y PDF ready. El PDF descargado y su adjunto MIME son
idénticos; archivos verificados contra bytes/SHA guardados. Las dos páginas del PDF de
esta revisión fueron renderizadas y revisadas visualmente: texto legible sin recortes.

| Archivo        |  Bytes | SHA-256                                                          |
| -------------- | -----: | ---------------------------------------------------------------- |
| Mensaje .eml   | 21.676 | 79c4e676b6ca3f6689150f449253b4fd49f0aa77213cde8567e9eed1a7074d57 |
| PDF conservado | 12.893 | b5bdd81476060f8a95f7113f5f4c7f0de687d1e8dd12d04b3a66bbd6ad4a3142 |

Las 1.434 filas anteriores a la captura, en 92 tablas, conservaron sus huellas;
solo ocho filas nuevas de archivo/intento/auditoría. El estimado completo quedó
exactamente igual. Facturas, pagos, proyectos, catálogo, perfiles y reembolsos
no cambiaron. Repetición nativa del intento real devuelve el mismo captured;
empresa ajena denegada, sin escritura persistida ni otro intento.

Regreso real e25191b → 269e8cb → e25191b: procesos y salud 200 comprobados en
cada fase. La versión anterior abrió estimado/PDF/reembolsos con esquema 086;
el PDF conserva los mismos bytes en candidato, regreso y final, y el mensaje
es idéntico en candidato/final. La aplicación anterior carece de la acción
nueva de correo. Una fecha antigua en el verificador privado del proceso se
corrigió antes de completar su prueba; no requirió cambio en la aplicación.

Final: 16 archivos fuente exactos, ruta compilada, runtime e25191b, dependencias
y entorno privado iguales a 269e8cb. Hosting productivo intacto; recibos/IA y
MTA de Estimados/Facturas desactivados. Retención: 62 carpetas, ocho protegidas
y 54 por revisar; cero eliminaciones. Evidencia privada:
saas-cierre-gastos-comercial/20261007 (SQL/JSON, MIME, PDF, renderizados y pantallas).
Código/acta revisables en PR 16. No se acredita recepción de este correo por un
cliente; la prueba alojada fue una captura privada sin envío externo.
