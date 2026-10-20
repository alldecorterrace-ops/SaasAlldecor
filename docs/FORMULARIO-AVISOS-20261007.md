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

## Publicación y comprobaciones

Aplicación final 676a6585e9d34c29a684d420212f377ee5154439 en staging, con
087 aplicada. La implementación de avisos es 92584ab; 676a658 añade las
excepciones no-referrer de Estimados y Avisos después de la regla global Next.
La verificación HTTP detectó que la regla general sobrescribía la cabecera
privada; el ajuste conserva el contrato también en respuestas de error.

Local y [CI 37664859382](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/37664859382)
aprobados: lint, tipos, 910 pruebas sin fallos ni omitidas, build, comparadores
ADT, Deno, concurrencia y recuperación. Las 11 pruebas focalizadas cubren
configuración, transacción/repetición, destinatario congelado, recuperación,
MIME seguro, descargas, respuesta perdida, queued/failed/unknown, worker,
estados/archivo/conversión de Lead y permisos actuales. MTA y Storage se simulan
localmente; auth.role reproduce su contrato mínimo, sin acreditar emisión de JWT.

SQL nativo de Supabase, con roles reales y contextos de identidad de prueba:
entrada anónima crea dos eventos privados en la misma transacción; anon no puede
leer ni reclamar. Configuración cambiada rechaza confirmación obsoleta; asignación
explícita recupera el aviso bloqueado. Se verificaron cierre inmutable, actor,
empresa ajena, worker send sin captura, estados finales y repetición. Los datos
transaccionales del contrato terminan en rollback y no invocan el MTA.

## Recorrido de pantalla y conservación

Cuenta ficticia administradora, rol Propietario, empresa QA Mapa Presentacion 20260926. Un formulario nuevo recibió una solicitud ficticia con acentos,
medidas 24 × 6 × 6 y texto con caracteres HTML. Dos avisos: solicitante pendiente
e interno bloqueado por faltar dirección. Se guardó una dirección A ficticia,
se confirmó su asignación y se conservaron ambos MIME. Después se cambió la
configuración a B; el mensaje anterior mantuvo A y sus bytes originales.

La solicitud se convirtió en un Lead. Se guardaron Contactado, Cotizando,
Ganado y Perdido; se archivó y restauró; finalmente se convirtió en un único
cliente. PostgreSQL acredita las ocho entradas de auditoría, Cliente versión 8,
relación única y campos de contacto/fecha/preferencia íntegros. Repetir revisión,
conversión, entrada y finalización devuelve los mismos registros; el ensayo
nativo del caso persistido terminó en rollback, sin otro archivo ni envío.

| Mensaje privado | Bytes | SHA-256                                                          |
| --------------- | ----: | ---------------------------------------------------------------- |
| Solicitante     | 1.764 | 6944c1ba71a75a1922e35be22fcff39e8318d05ef3b7756f7ba7a3b72f7659c3 |
| Interno         | 3.602 | 78fd979abebdd978bd9f6c2b4a72bd4007c1a7b6f948197aa356438b924f1707 |

Ambos tienen texto/HTML seguros, destinatario congelado y cero adjuntos. Los dos
se descargaron en candidato y final con bytes idénticos; el aviso del solicitante
también fue idéntico en el regreso. Cuatro GET anónimos de las rutas Avisos y
Estimados, en namespace propio/ajeno, rechazaron la descarga con private/no-store,
nosniff y no-referrer. Avisos responde 404 genérico y Estimados 401 genérico sin
sesión; no se afirma identidad de contratos entre rutas distintas.

087 conservó las 1.442 filas de 92 tablas y los grants de las funciones anteriores;
sin backfill. Tras el recorrido y desactivar el formulario, 94 tablas y 1.474
filas: todas las filas anteriores mantienen su huella. No se cambiaron facturas,
pagos, gastos, proyectos, horas, trabajadores o membresías. La entrada pública
revocada dejó de admitir solicitudes. El ensayo posterior de catálogo, con un
contador legítimo de numeración, se documenta por separado en
[CATALOGO-CAPTURA-20261007](CATALOGO-CAPTURA-20261007.md).

## Hosting y límites

Regresos reales 92584ab → e25191b → 92584ab y 676a658 → 92584ab → 676a658.
Configuración, grupos, procesos y salud 200 comprobados. El primer regreso
conservó esquema 087 y todas sus filas, aunque e25191b carece de la nueva interfaz.
La comprobación final detectó un proceso anterior rezagado: se retiró únicamente
el proceso de staging de esa raíz y se renovó su configuración; la prueba final
acredita solo el proceso 676a658. No se rebajó el criterio de comprobación.

Fuente exacta, rutas compiladas, entorno privado y lockfile conservados, archivos
del conversor HEIC trazados y cero paquetes nuevos. Producción mantiene su
configuración y salud. Retención: 64 carpetas, diez protegidas por versiones o
dependencias y 54 por revisar; cero eliminaciones. MTA de Avisos/Estimados/Facturas,
credencial del worker y proveedores IA siguen desactivados o sin configurar.

[PR 17](https://github.com/alldecorterrace-ops/SaasAlldecor/pull/17) contiene código
público y acta. Evidencia privada en saas-cierre-gastos-comercial/20261007; código
ADT, originales, SQL/JSON y MIME privados permanecen fuera del repositorio. La
sesión pública de pantalla usó el navegador autenticado; la entrada anónima se
acredita por SQL nativo, no por esa sesión. No se acredita recepción externa,
todos los perfiles web, dispositivo físico, paridad de los 20 módulos o traspaso.
