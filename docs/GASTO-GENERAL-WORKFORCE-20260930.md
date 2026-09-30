# Workforce: reclasificación a gasto general

Esquema aditivo 049, sin importaciones de ADT ni cambio de autoridad.
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
el reintento. El gasto general no vuelve a generar una reclasificación con otra
solicitud. Su estado y motivo aparecen en la lista, filtro e historial.

## Verificación y cierre de esta entrega

Pruebas PostgreSQL locales con Auth/Storage mínimos simulados: conservación de
campos, roles, etapa, motivo, reintentos, conflicto, revocación y cero efectos en
gastos administrativos, horas y pagos. La prueba PostgreSQL 17 añade ocho reintentos
paralelos y una carrera entre reclasificación y aprobación de oficina: un ganador,
un conflicto, y continuación sobre la versión nueva conservando ambas operaciones.
Los resultados de CI, publicación y sesión real se registrarán tras verificarlos.

La futura copia contable y los indicadores deberán usar el destino del costo para
no imputar GENERAL a la obra original. No se habilitan esas integraciones con esta
entrega ni se presenta su ausencia actual como paridad completa. Continúan pendientes
revisión IA/humana, pagador, reembolsos, edición, archivo/restauración, copia contable,
notificaciones, labor por jornada y otras acciones de los 21 módulos.
