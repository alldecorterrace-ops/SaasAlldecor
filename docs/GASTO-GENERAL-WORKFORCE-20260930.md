# Workforce: reclasificación a gasto general

Esquemas aditivos 049/050, sin importaciones de ADT ni cambio de autoridad.
Referencia: `ExpenseService::decide(RECLASSIFY_GENERAL)` de la copia local de
Workforce. La copia PHP no prueba la versión del servicio desplegada hoy.

## Contrato e implementación

Oficina o administración puede reclasificar un gasto después de la aprobación
del encargado, en estado FOREMAN_APPROVED u OFFICE_APPROVED. Requiere motivo
de cinco a mil caracteres, versión vigente e identificador de solicitud.
Trabajador y encargado no pueden hacerlo; tampoco un gasto enviado sin primera
aprobación o rechazado. La revisión IA/humana administrativa sigue siendo un
circuito separado, aún pendiente.

Se mantiene la obra original del envío y se añade un destino explícito del costo,
PROJECT o GENERAL. GENERAL equivale al destino GENERAL del servicio de referencia;
no crea una obra artificial ni elimina la relación original. Cambian solo destino,
evidencia de reclasificación, versión y fecha de modificación. Permanecen importe,
fecha del gasto, trabajador, recibo, categoría y ambas decisiones. Reclasificar
no sustituye la aprobación pendiente de oficina, ni registra pago o reembolso.

Los reintentos idénticos recuperan el resultado guardado; otros datos con la misma
solicitud y otras operaciones con versiones antiguas se rechazan. La autoridad se
comprueba antes de recuperar un resultado: perder el rol de oficina bloquea incluso
el reintento. Una solicitud nueva con versión vigente puede actualizar el motivo general, como
en el servicio de referencia; el historial conserva ambos motivos. Su estado y motivo aparecen en la lista, filtro e historial.

## Verificación y cierre de esta entrega

Pruebas PostgreSQL locales con Auth/Storage mínimos simulados: conservación de
campos, roles, etapa, motivo, reintentos, conflicto, revocación y cero efectos en
gastos administrativos, horas y pagos. La prueba PostgreSQL 17 añade ocho reintentos
paralelos y una carrera entre reclasificación y aprobación de oficina: un ganador,
un conflicto, y continuación sobre la versión nueva conservando ambas operaciones.
[CI de la aplicación final](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36751496380)
aprobado en los tres trabajos: comprobaciones, concurrencia PostgreSQL 17 y
recuperación sintética. La carrera entre dos correcciones del motivo general
produce un ganador y un conflicto, conservando importe, recibo y aprobación.

La futura copia contable y los indicadores deberán usar el destino del costo para
no imputar GENERAL a la obra original. No se habilitan esas integraciones con esta
entrega ni se presenta su ausencia actual como paridad completa. Continúan pendientes
revisión IA/humana, pagador, reembolsos, edición, archivo/restauración, copia contable,
notificaciones, labor por jornada y otras acciones de los 21 módulos.

## Publicación y sesión real

Aplicación `9e8b2c702cdb3ac471ef77a9f2eb3ea9506a3a37` publicada solo en staging,
esquemas 049 y 050 aplicados con guardas de proyecto/empresa de ensayo. Lint,
tipos, 452 pruebas y compilación local correctos; webpack del hosting y proceso
activo comprobados. Configuración privada, dependencias compartidas y configuración
de producción preservadas. Ocho controles públicos correctos entre las dos apps.

- Sesión real del auditor en empresa sintética, por fases Trabajador y Oficina.
  Trabajador consulta su gasto y no tiene la acción; la RPC real rechaza su intento.
  Oficina reclasifica, reabre y filtra Obra/General, sin alterar las aprobaciones.
- Motivo corto rechazado por validación de servidor. Reclasificación única y nuevo
  motivo explícito después: cinco eventos del gasto en total (envío, dos decisiones,
  reclasificación y actualización del motivo), cinco recibos de ejecución. Dos
  reintentos idénticos de cada operación no duplican efectos. Versiones antiguas y
  contenido distinto con la misma solicitud se rechazan.
- Se corrigió antes del cierre una diferencia con la referencia: ADT permite un
  nuevo motivo sobre el destino general mientras conserva el estado aprobado.
  El esquema 050 mantiene esa regla; no confunde una solicitud nueva con un reintento.
- Historial antes/después conserva ambos motivos, fecha y autor. Escritorio y móvil
  emulado a 390 px, con documento también de 390 px incluso al desplegar el historial.
  No acredita un dispositivo físico ni varias personas concurrentes en Supabase.
- Descarga del recibo original de 23.483 bytes idéntica, y correspondencia exacta
  de todos los campos previos del gasto salvo destino, motivo/evidencia, versión
  y fecha de modificación. Sin nuevo gasto administrativo, pago o comprobante.
- Dieciséis conjuntos previos conservan recuentos y huellas exactas; los campos
  nuevos de 049 se excluyen únicamente para comparar registros no tocados de
  Workforce. La ficha del trabajador permanece íntegra. Perfil y permisos originales
  restaurados; sus eventos/versiones registran el ensayo. Pantalla y reintento
  privilegiado denegados después de retirar el permiso del módulo.

Los resultados privados permanecen fuera del repositorio. No hubo importación,
sincronización o cambio de autoridad de ADT. Esta entrega valida la implementación
contra la copia del servicio de referencia, no acredita por sí sola la paridad de
la versión PHP actualmente desplegada. Continúa pendiente el retorno operativo
completo y la depuración de entregas sobrantes mediante sus confirmaciones exactas.
