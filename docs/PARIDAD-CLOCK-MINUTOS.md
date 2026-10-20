# Minutos de las nuevas marcaciones del reloj

La referencia de Campo CRM es `CrmController::campoClock`: al cerrar un turno
calcula `max(1, round((salida - entrada) / 60))` con marcas de tiempo enteras de
PHP. El controlador capturado el 5 de octubre de 2026 tiene SHA-256
`578144f99dd8a57043df03915c27f5e3b962633668b315c13013c7ee9c3d4401`.
Esta captura permite comprobar la regla; no acredita una lectura nueva del
servidor de ADT durante esta entrega.

El esquema 078 marca únicamente las nuevas entradas de `punch_time` con
`minute_rule=CAMPO_CLOCK_V1`. Su salida usa segundos enteros en cada extremo,
redondeo al minuto más cercano y mínimo un minuto. Por ejemplo, 29 segundos
registran un minuto y 90 segundos registran dos. No cambia el reloj del servidor,
los controles GPS, los permisos, el proyecto disponible ni la idempotencia.

`minutes` conserva su nombre, tipo y valores históricos. Pasa de expresión
generada almacenada a cálculo por un disparador en la misma transacción.
`DROP EXPRESSION` conserva los valores almacenados; no se elimina la columna.
El disparador calcula el valor antes de la auditoría y descarta cualquier intento
de suministrar minutos por una escritura autorizada. El cliente sigue sin tener
INSERT/UPDATE/DELETE directo ni acceso a las funciones privadas del cálculo.

Todos los registros anteriores mantienen `minute_rule=NULL` y su fórmula
original de minutos completos menos descanso, incluidos los turnos que estaban
abiertos al aplicar el esquema. Los registros manuales nuevos mantienen esa
misma fórmula. Una corrección administrativa de entrada, salida o descanso de
un turno nuevo pasa a `LEGACY_FLOOR_V1`; aprobar, anular o cambiar una nota sin
cambiar esas horas conserva el cómputo del reloj. El cierre administrativo de
un turno abierto también conserva la fórmula manual. Las funciones públicas
no aceptan elegir la regla ni suministrar los minutos.

Esta entrega cierra la diferencia del cierre automático de nuevas marcaciones.
La paridad de propuestas/correcciones de Campo CRM, la aprobación del encargado
y la delegación siguen pendientes de su propia verificación. No se equipara
esa superficie con `TimeService` de ADT Workforce.

Los resúmenes personal y de equipo, CSV y fuente de mano de obra siguen leyendo
el mismo campo persistido. La entrega anterior puede leer el esquema nuevo;
volver al código anterior no revierte el esquema ni convierte el historial.

`tests/clock-minutes.test.ts` carga el esquema anterior con registros sintéticos,
comprueba que la migración conserva todas las filas originales, valida los
límites y segundos fraccionarios, el cierre nuevo con GPS ficticio, el cierre
de un turno anterior, los reintentos, las correcciones, la imposibilidad de
elegir la regla desde el cliente y la coherencia del resumen/exportación.
La prueba física GPS permanece aplazada por decisión del propietario.
