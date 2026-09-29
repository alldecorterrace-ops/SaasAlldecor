# Comprobantes dentro de los lotes de gastos — 29 de septiembre de 2026

Publicado y comprobado exclusivamente en staging: commit
`4a60de49e06c0defe2b6f7968057fec5f0f923ea`, esquema aditivo 041.
[CI del commit exacto](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36611072629)
aprobado en aplicación, concurrencia y recuperación sintética. Producción conserva
`3c0c412`. Las cargas de negocio y el traspaso siguen aplazados; configuradores
y 3D quedan fuera del alcance activo de 21 módulos.

## Regla de origen y alcance

La fuente privada ADT, `CrmController::expenseReceipt`, admite JPG/PNG/WebP de
400 a 8.388.608 bytes, calcula SHA-256 y rechaza una imagen vinculada a otro gasto
activo; también consulta Workforce. `expenseSaveRow` permite adjuntarla en el
alta y el lote revierte sus filas si otra falla. La consulta operativa de Gastos
en ADT seguía devolviendo 403 en la auditoría anterior: este contraste de código
no acredita el recorrido completo del origen.

Ahora cada fila puede llevar una imagen opcional antes de registrar el lote.
Duplicar deja vacíos documento y archivo; retirar un archivo del borrador no
borra objetos preparados. El alta mantiene la aprobación administrativa y no
efectúa pagos ni reembolsos.

Cada imagen viaja en una petición autenticada independiente, con control de
origen público configurado y límite real del flujo de bytes. El lote no tiene
que incluir todas las imágenes en el formulario de Next.js limitado a 6 MB.
La preparación relaciona empresa, lote, fila, actor, tamaño, formato y huella;
usa una ruta inmutable sin sobrescribir. Una respuesta perdida puede resolverse
leyendo y comparando el mismo objeto.

La aplicación vuelve a descargar y verificar bytes antes del guardado.
PostgreSQL valida permisos, propiedad, relación con la fila, presencia del
objeto y duplicados; vincula los archivos y registra el resultado idempotente
en la transacción del lote. El error revierte gastos, enlaces y auditoría.
Los candidatos permanecen identificados para corregir y reintentar.
No se promete transacción distribuida entre archivos y PostgreSQL:
Supabase [almacena archivos y metadatos por separado](https://supabase.com/docs/guides/storage/management/download-objects).

Los candidatos solo los lee su creador con administración y escritura en
Gastos; las fichas guardadas mantienen su permiso habitual de lectura.
No se añadieron permisos de sobrescritura/borrado ni claves administrativas.
La verificación binaria pertenece a la aplicación; el contrato SQL valida
metadatos y referencias, no lee los bytes de Storage.

## Pruebas y recorrido autenticado

- Lint, tipos y compilación correctos; **413 pruebas**. Diez pruebas nuevas:
  archivo ausente/alterado, límites del flujo, origen, permisos, aislamiento,
  revocación, error posterior y reintento.
- PostgreSQL real en CI: dos lotes simultáneos con la misma imagen dejan un solo
  gasto; ocho reintentos del ganador devuelven el identificador original.
- Auditor propietario en empresa sintética: dos filas de **1.11 y 2.22** con la
  misma imagen. Rechazo de la fila 2; SQL confirma cinco gastos previos, cero
  nuevos, cero recibos de este lote y cero eventos de auditoría para esas filas.
  Quedan dos candidatos y dos objetos preparados nuevos, sin gastos parciales.
- Ambos archivos y todos los campos siguen seleccionados. Se cambia únicamente
  la segunda imagen y se reintenta desde móvil emulado de 390 px. Documento y
  cuerpo miden 375 px, sin desbordamiento horizontal. No es dispositivo físico.
- Resultado: dos gastos aprobados por **3.33**, un solo lote, dos comprobantes
  y sin reembolso aplicable. Reabrir la URL conserva el resultado. Se reutiliza
  el primer archivo; hay tres candidatos en total, dos vinculados y uno del
  intento corregido, identificado y conservado.
- Descarga real de **33.672 y 7.374.059 bytes**, comparados byte por byte y por
  SHA-256 con los originales ficticios: idénticos. La carga mayor supera los
  6 MB del formulario anterior.
- Llamadas autenticadas para preparar archivos en empresa restringida y ajena:
  rechazadas. SQL/Storage local también niega reutilizar candidatos de otro actor,
  lote o fila y sobrescribir/borrar archivos.
- Diez huellas previas coinciden tras esquema, recorrido y retorno: clientes,
  estimados, facturas, proyectos, pagos, cinco gastos anteriores, trabajadores,
  registros operativos, adjuntos y lote anterior. La comparación de gastos
  excluye únicamente la nueva columna nullable `receipt_sha256`.

Las únicas altas de negocio son los dos gastos ficticios y su lote, con cuatro
eventos de auditoría: alta y asociación de comprobante por gasto. Los dos objetos
previos permanecen; el bucket privado de recibos pasa a cinco objetos.
No hubo datos ADT importados, cambios de roles, mensajes comerciales ni pagos.

## Publicación, retorno y retención

Retorno real **4a60de4 → b8b2861** después del guardado: la versión anterior
abrió el gasto de 2.22 y descargó los 7 MiB con bytes idénticos. Luego se restituyó
4a60de4. El retorno no revierte el esquema; permite consultar los datos nuevos,
aunque la carga de comprobantes dentro del lote requiere la versión nueva.

Activa: `4a60de49e06c0defe2b6f7968057fec5f0f923ea`.
Retorno: `b8b28610837b81d1da64db44c80f7c136f26e931`.
Dependencias: overlay `c66e4ec/node_modules` y base `b149bee`, sin reinstalar
ni cambiar lockfile. Proceso final en la raíz activa verificado. Producción
conserva raíz, proceso y huella de configuración. Las cuatro comprobaciones
públicas pasan en cada sitio.

La candidata aporta 956 archivos regulares. El home pasa de 589.139 a **590.581
entradas**, frente a la referencia de 600.000; no certifica la cuota del proveedor.
`c2609e9` deja de ser retorno necesario y se suma a los sobrantes anteriores,
incluido `5290274`. No se borraron versiones: pendientes inventario de contenido
único y confirmaciones exactas. Las dependencias compartidas siguen protegidas.

041 quedó registrado con su SQL exacto. Conciliar entradas 035–039 del historial,
ya aplicadas y comprobadas antes, sigue pendiente; no se reaplicaron.
Capturas, recibos ficticios, huellas y scripts: `.local/closure-20260929/`,
fuera de GitHub.

## Diferencias abiertas

1. La detección de duplicados por SHA cubre recibos nuevos de lote con huella.
   No se recalcularon archivos anteriores ni se incorporó ADT. La carga individual
   anterior sigue admitiendo PDF/imágenes hasta 5 MB y no registra esta huella.
   Unificarla y contrastar duplicados con Workforce está pendiente; no se declara
   completo el control global de ADT.
2. El borrador conserva campos y archivos al fallar en la misma página; no se
   acredita recuperarlo tras cerrar el navegador. Los candidatos abandonados
   quedan privados e identificados; su gestión de retención sigue pendiente,
   sin purgas automáticas.
3. Enlace automático con Campo/Workforce, orígenes, filtros por pagador/origen,
   totales mensuales, reversión contable y contraste operativo de ADT pendientes.
   No se ha ensayado un lote de 100 imágenes en el hosting.

Gastos y el conjunto de los 21 módulos no se consideran cerrados por esta entrega.
