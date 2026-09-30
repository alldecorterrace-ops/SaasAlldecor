# Sustitución e historial de recibos de Workforce

## Regla de referencia

La copia privada de CrmController, expenseAdminEdit/campoExpense y
expenseSyncEditedReceipt, permite foto opcional JPG/PNG/WebP de 400 bytes a
8 MiB. Al sustituir conserva el archivo anterior y registra
EXPENSE_RECEIPT_REPLACED; corrección y recibo privado se vinculan en la misma
transacción. La copia local no certifica por sí sola el PHP actualmente
desplegado. No se modificó ADT.

## Implementación

Esquema aditivo 055. La foto nueva se prepara y verifica antes de corregir;
recibo, datos, revisión, decisiones e historial cambian en la misma transacción
del gasto. Se conserva ID, empresa, trabajador, creación y archivos previos.
Sin foto nueva permanece el recibo actual. Una solicitud idéntica no repite
efectos; la foto forma parte de su contenido idempotente. Contratos anteriores
siguen disponibles y conservan las solicitudes sin sustitución.

Oficina/administración corrige pendientes/devueltos; trabajador activo únicamente
su gasto propio devuelto y una vez. No habilita aprobados finales ni rechazados.
Preparar una foto no autoriza por sí solo la corrección: el guardado reevalúa
actor, empresa, estado, versión, recibo original y metadata/objeto de la candidata.
La web verifica bytes, formato, tamaño y SHA al guardar y al descargar.

El histórico muestra únicamente recibos usados, nunca borradores preparados.
Actuales y anteriores requieren autenticación y autorización de empresa/ámbito.
No se crean enlaces públicos ni credenciales administrativas en el navegador.
Los objetos usados permanecen inmutables y Storage carece de políticas de
actualización/borrado. La revisión manual apunta al recibo vigente y su huella;
el reenvío del trabajador deja la revisión pendiente.

## Evidencia de staging del 30 de septiembre

Entrega funcional 50b6eba, ajuste de texto 1abd9bf y entrega final
**6b72cfeccc33d7cf5dfc2380c61816f4501b1ec6**, publicados en GitHub.
Esquema 055 aplicado solo al proyecto independiente de staging, con guardas de
empresa sintética y ausencia de la empresa de producción. Los tres trabajos de
CI de cada revisión pasan: check, queue-concurrency y backup-recovery. Lint,
tipos, 482 pruebas y compilación pasan; los ajustes visuales repiten lint,
tipos y compilación local y las 482 pruebas en CI. El ensayo PostgreSQL 17
incluye ocho solicitudes simultáneas para la misma sustitución, un único cambio,
conservación del objeto anterior y rechazo de versión antigua. Las pruebas SQL
usan metadata/objetos sintéticos; no prueban por sí solas el binario de Storage.

- Sesión real de auditor por fases Trabajador/Oficina, en empresa sintética.
  Un gasto nuevo se envía por formulario con recibo ficticio. Su devolución se
  prepara explícitamente como fixture; no representa un resultado IA real.
- Trabajador elige foto PNG nueva, importe y pagador. Fecha futura rechazada sin
  perder campos ni archivo. El gasto sigue en versión 2 con el recibo original:
  dos fotos preparadas, una visible, cero sustituciones. El borrador no aparece
  en el histórico. Corregir la fecha usa la misma foto y guarda versión 3,
  contador 1, revisión PENDING y un cambio de recibo, con el mismo gasto.
- Oficina sustituye otra vez y guarda versión 4, revisión REVIEWED y snapshot
  vinculado a la tercera foto y SHA. Mantiene contador 1 y reinicia decisiones
  actuales; las previas permanecen en auditoría. Dos sustituciones en total.
- Dos reintentos idénticos por operación conservan resultado y número de eventos;
  cambiar contenido con la misma solicitud provoca conflicto. Solicitud nueva
  sobre versión antigua rechazada. Cuatro eventos del gasto: envío, fixture
  devuelto, reenvío y corrección manual. No hay pago ni copia contable.
- Descargas reales autenticadas: original 23.483 bytes, segunda 13.787 y tercera
  13.809. Bytes/SHA coinciden con las tres imágenes de prueba. El original y la
  segunda siguen accesibles desde Recibos anteriores; no se sobrescriben.
  La descarga actual se repite tras la publicación final.
- Historial y formulario abierto probados en escritorio y emulación de 390 px.
  Se corrige el desbordamiento de la tarjeta/selector de archivo. No representa
  una prueba en un teléfono físico. La emulación se retira al finalizar.
- Se cierra la asignación temporal, restaura exactamente la membresía original y
  devuelve el perfil a WORKER deshabilitado, conservando versión/auditoría.
  Después se rechazan reintentos previos y consulta de recibos por RPC; el acceso
  de interfaz vuelve a estar restringido. La prueba anónima de recibo actual y
  anterior devuelve 401 y no-store. El intento de URL de otra empresa desde el
  navegador fue bloqueado antes de navegar y no certifica un 404 del servidor;
  el aislamiento se acredita por pruebas de RPC/RLS, no por ese intento.
- Dieciséis conjuntos anteriores mantienen conteos y huellas; ficha empresarial
  del trabajador, membresía y metadata del recibo original quedan conservadas.
  Incluye los fixtures de entregas anteriores; solo se añade el lote QA de foto.
- Diez comprobaciones HTTP pasan: ocho públicas de producción/staging y dos de
  recibos anónimos. Proceso activo, revisión, enlaces de dependencias y hash de
  configuración de producción se comprueban. No se leen secretos en los informes.

Se detectó que la ruta de Apache podía cambiar sin que el proceso sirviera aún
la revisión nueva. Se separó el grupo de ejecución de staging por revisión,
se terminó únicamente el proceso antiguo identificado y se comprobó el HTML
con las clases nuevas y el proceso de la entrega final. El inventario muestra
un proceso de staging en la revisión activa y 100.765 entradas en la cuenta.
No se equipara cambiar la ruta con haber publicado el código.

La configuración de cada entrega debe incluir un grupo independiente y
comprobar proceso/HTML después del cambio, conforme a la
[referencia oficial de Passenger](https://www.phusionpassenger.com/docs/references/config_reference/apache/#passengerappgroupname).

La evidencia privada (SQL, resultados, binarios, capturas y huellas) permanece
fuera de GitHub. La revisión final está activa en staging; 1abd9bf se conserva
para retorno y c66e4ec/b149bee como dependencias. Las restantes entregas están
inventariadas y su depuración sigue pendiente; no se realizaron borrados.

## Límites abiertos

IA, productor de devoluciones, confirmación posterior a IA, etiquetas libres,
reembolso, archivo/restauración y copia contable siguen pendientes. Esta entrega
no migra datos de ADT, no ejecuta pagos/envíos y no cierra Campo/Workforce ni los
21 módulos. ADT conserva la operación principal; configuradores y 3D excluidos.
