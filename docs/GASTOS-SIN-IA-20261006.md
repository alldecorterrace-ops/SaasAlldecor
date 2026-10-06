# Gastos sin IA y prioridad comercial · 6 de octubre de 2026

## Alcance y regla

El propietario excluyó IA y limitó la continuación a los puntos 1 Gastos y
costos y 2 Comercial de la lista anterior. Portal, Operaciones, Administración
y preparación integral quedan fuera. Los cambios de Portal preparados antes de
esa instrucción están guardados localmente y no se publican ni se aplican.

El menú y las rutas del asistente quedan fuera de la aplicación activa. La
ejecución del análisis de recibos rechaza antes de preparar un trabajo o llamar
al proveedor, incluso si existen variables del proveedor. Las revisiones,
archivos, tablas y permisos históricos no se eliminan. Los modelos aislados y
sus pruebas anteriores se conservan; no activan llamadas externas.

## Revisión humana independiente

ADT vigente, copia privada del controlador SHA-256
578144f99dd8a57043df03915c27f5e3b962633668b315c13013c7ee9c3d4401,
separa revisión, aprobación y constancia de reembolso. Su acción exp_reviewed
exige un resultado de IA terminado. Por decisión expresa del propietario, el
SaaS sustituye ese requisito por revisión visual con casilla y nota; es una
diferencia deliberada, no una equivalencia exacta con aquel requisito de ADT.

La nueva RPC 084 permite únicamente Administración (propietario/administrador
activo con escritura en Horas). Comprueba versión, estado, original registrado
y ausencia de constancia de reembolso. El servidor verifica los bytes y su
SHA-256 antes de solicitar el efecto. Guarda actor, fecha, nota y fotografía
lógica del recibo, trabajador, obra, fecha exacta, importe, pagador y distribución.
Cambiar esos datos invalida la revisión. Un reintento conserva un único efecto;
permisos revocados se rechazan antes de recuperar el resultado anterior.

La acción mantiene importe, estado y las aprobaciones de Encargado/Oficina.
Revisar no aprueba ni paga. El reembolso sigue siendo constancia separada de un
pago ya realizado, con recibo vigente y selección exacta; no genera un movimiento
bancario, otro pago ni una copia de gasto/costo.

La vista privada de revisión convierte HEIC/HEIF a JPG usando el conversor
local publicado. Mantiene la descarga original y sus huellas. Recomprueba el
acceso después de leer/convertir; no entrega URLs públicas ni manda imágenes a
terceros. Los formatos JPG/PNG/WebP conservan los bytes. Errores son genéricos.

## Pruebas y límites

30 pruebas focalizadas locales aprobadas: permisos, dos empresas, revocación,
reintentos, original ausente/corrupto, versión vieja, invalidación de revisión,
aprobaciones conservadas, reembolso sin duplicar costo y conversión HEIC.
No se enviaron correos, pagos, reembolsos reales ni datos de negocio de ADT.
La publicación, SQL nativo y sesión web se registran después de verificarlos;
estas pruebas locales todavía no acreditan esos niveles.

Comercial sigue en el alcance: Leads/formulario, productos/precios,
plantillas/comunicaciones y escenarios de Facturas. No se declara cerrado por
esta entrega de Gastos. La comprobación operacional integral no es una tarea
pendiente de esta continuación; se mantienen los chequeos necesarios de cada cambio.
