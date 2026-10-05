# Campo: marcaje con ubicación actual

Cambio aditivo 075, contrastado con ADT vigente el 5 de octubre de 2026.
El alcance de esta entrega es la ubicación de entrada y salida. Los demás
recorridos de Campo conservan sus pendientes de paridad.

| Acción | Regla comprobada en ADT | Implementación del SaaS | Prueba |
|---|---|---|---|
| Entrada y salida | GPS obligatorio antes de guardar cualquiera de las dos acciones | Validación en navegador, acción de servidor y RPC PostgreSQL | Límites sintéticos del navegador y base; RPC anterior sin GPS rechazado |
| Precisión y coordenadas | Precisión mayor de 0 y hasta 100 m; latitud/longitud válidas; excluir pareja cercana a cero | Mismos límites, normalización numérica y muestras separadas | 31 casos compartidos, contrastados con métodos puros del PHP vigente |
| Antigüedad | Hasta 60 s; reloj adelantado hasta 10 s | Reloj del servidor como referencia; el cliente además rechaza muestras anteriores a la solicitud por más de 1 s | Límites exactos, muestra almacenada y nueva solicitud |
| Lectura del teléfono | Alta precisión, sin caché, 15 s por intento; repetir una vez salvo permiso denegado | Solicitud nueva al pulsar entrada o salida; mensaje de progreso y bloqueo mientras se verifica | Doble intento de baja precisión y rechazo inmediato de permiso denegado |
| Reintentos | Una jornada abierta propia | Identidad existente, bloqueo por empresa, mismo proyecto al reintentar entrada, sin repetir auditoría | Base local y concurrencia en PostgreSQL del CI |
| Corrección administrativa | Conservar trazabilidad del marcaje | Mantener ambas muestras, aprobar/corregir horas sin sustituir ubicación | Corrección con GPS manipulado en el formulario no cambia la muestra |
| Confidencialidad | Adaptación multiempresa y usuario autenticado | Horas propias por RLS; GPS ligado al trabajador original | Usuario ajeno no ve fila ni historial; no se permite reasignar una fila con GPS |

La entrada exige un proyecto. El selector usa el alcance de Workforce ya
configurado; no concede acceso general a Proyectos. La salida conserva el
proyecto de la jornada, aunque la asignación haya terminado. Esta selección
es una adaptación de permisos y **no cierra** la equivalencia del catálogo
financiero de Campo en ADT.

Las columnas nuevas son nulas para las filas anteriores. No se recalculan
horas, pagos, costos, revisiones ni auditorías existentes. Los registros
administrativos continúan sin exigir GPS. El cálculo histórico de minutos
del SaaS permanece con truncamiento y descanso; ADT redondea el reloj al
minuto con mínimo uno. Esa diferencia sigue abierta.

## Validación y límites

- El contraste de PHP ejecuta únicamente dos métodos puros aislados del
  controlador, comprobando su SHA-256. No llama rutas de Drupal ni escribe
  en ADT. Código de origen y evidencia permanecen privados.
- Las pruebas sintéticas no acreditan un teléfono físico, el estado del
  interruptor GPS ni la procedencia de una ubicación enviada por un cliente.
- Falta el recorrido físico en Android con sus permisos, ubicación precisa,
  conexión interrumpida y recuperación de la respuesta.
- Siguen pendientes geocerca/distancia/incidencias, catálogo según pagos y
  visitas a proyectos terminados con motivo, delegación de encargado,
  seguimiento durante el turno y demás escenarios de Campo.

## Retorno de código

El esquema 075 es compatible con las consultas y correcciones de la entrega
anterior. Su RPC sin ubicación se conserva como firma y rechaza el marcaje
sin GPS; por tanto, volver al código anterior deja el reloj bloqueado hasta
restaurar una entrega que capture GPS. El retorno no revierte ni borra datos
de Supabase. Se debe comprobar esta limitación antes de cambiar de entrega.
