# Campo: propuesta de horario y salida declarada

Alcance: `Horas → detalle de una marcación → Propuestas de Campo` y
`Horas → Equipo y obras → Revisar turnos`. Se implementan la solicitud de
horario (`campoSolicitar`), salida declarada (`campoFix`), aprobación de minutos
por Encargado y resolución de horario por Administración.

Referencia: captura del 5 de octubre de 2026 de `CrmController.php`, SHA-256
`578144f99dd8a57043df03915c27f5e3b962633668b315c13013c7ee9c3d4401`.
Se contrastaron las funciones indicadas, `campoHoraATs`, `campoEncargadoAccion`,
`sol_resolver` y `entry_approve`. Es evidencia del código capturado; no acredita
una prueba nueva de la sesión real de ADT ni una aceptación del teléfono físico.

| Acción                   | Regla del origen                                                                                                                               | Equivalencia en SaaS                                                                                                                                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pedir horario            | Solo jornada propia; motivo obligatorio, hasta 240 caracteres; al menos una hora válida; fecha local de entrada                                | Solicitud formal separada con reloj original, minutos originales, horario solicitado y motivo. Mantiene extremos y minutos efectivos; deja revisión pendiente.                                                                             |
| Hora de salida declarada | Solo jornada propia; salida HH:mm; motivo opcional; cierra el turno, mantiene minutos efectivos y primeros minutos originales positivos        | Declaración separada y salida canónica. Un turno abierto sin minutos se mantiene en cero; no crea GPS de salida ni pago.                                                                                                                   |
| Cálculo propuesto        | REQUEST redondea duración bruta, admite cero y turno sin salida; DECLARE exige duración positiva y propone al menos un minuto; máximo 18 horas | Cálculo separado de los minutos efectivos. Cruce de medianoche añade 86400 segundos transcurridos. Hora repetida de Nueva York usa primera ocurrencia, como PHP DateTime.                                                                  |
| Encargado                | Subordinados activos inmediatos; excluye propio turno. Aprueba `minutes_prop` positivo, conserva reloj y no resuelve `req_status`              | RPC mínimo de equipo. Adopta minutos propuestos positivos o conserva efectivos. La solicitud formal continúa pendiente de Administración; declara por separado los minutos revisados. No recibe motivos, GPS ni historial del subordinado. |
| Administración aprueba   | Aplica extremos de solicitud formal pendiente y redondea duración bruta; sin solicitud usa reloj actual                                        | Aplica horario solicitado o confirma salida declarada. Mantiene origen y GPS. Si retima un reloj de Campo cambia a regla de corrección manual, conservando la historia.                                                                    |
| Administración rechaza   | Motivo obligatorio; conserva reloj y minutos vigentes, limpia propuesta y resuelve solicitud                                                   | Resolución con motivo, minutos efectivos conservados y estados anterior/posterior auditados. Una salida declarada no se borra al rechazarla.                                                                                               |
| Solicitudes sucesivas    | El origen sustituye campos propuestos; una declaración no limpia solicitud formal pendiente                                                    | Conserva propuestas anteriores como SUSTITUIDA. DECLARE retiene solicitud formal pendiente; Encargado aprueba propuesta más reciente, Administración resuelve el horario formal.                                                           |

La migración `202610050080` añade cuatro tablas vacías, sin reescribir registros
existentes. Dos tablas públicas conservan propuestas y declaraciones con RLS y
lectura de trabajador propio o administrador. Dos tablas privadas conservan
minutos efectivos y recibos de idempotencia; no admiten lecturas ni escrituras
directas del cliente. Cada decisión vuelve a comprobar el acceso actual antes
de devolver un recibo previo. Reasignar o anular cancela propuestas pendientes y
conserva su auditoría sin exponer motivos del trabajador anterior.

Se mantienen las protecciones previas del SaaS: semanas cerradas, versión,
perfiles activos y habilitados, tenant, turnos anulados, intervalos canónicos
positivos, solapamiento y descanso válido. Son límites explícitos frente a
llamadas forzadas que el código de ADT capturado no impide. Una solicitud de
horas iguales puede guardarse con cero propuesto, pero Administración no puede
convertirla en un intervalo canónico inválido. Una corrección administrativa
previa bloquea Campo; una propuesta de Campo bloquea la aprobación simple y
otra corrección administrativa hasta resolverla.

Labor usa el estado de revisión y solicitud formal. Una solicitud de horario
aún pendiente después de revisar el Encargado no genera otro costo calculado.
Un cero efectivo explícito de Campo es autoritativo: Labor no infiere minutos
de la diferencia del reloj para convertirlo en costo. Se conserva la inferencia
anterior para jornadas legadas sin ese estado. No se crean gastos, nóminas,
pagos ni ajustes históricos; continúa la conciliación existente.

Validación reproducible: `tests/field-time.test.ts`. Usa identidades y turnos
ficticios en PostgreSQL local PGlite, conserva todos los registros al instalar,
prueba permisos y revocación, reintentos sin duplicar auditoría, reloj/minutos,
historia privada, DECLARE/REQUEST combinados, cambios de hora, Labor y los
bloqueos existentes. No representa JWT, entrega de hosting ni sensores físicos.

El código anterior puede convivir con el esquema aditivo: no ofrece las nuevas
acciones y su aprobación simple rechaza propuestas pendientes. Retornar código
no revierte decisiones ni elimina las tablas o auditorías.

La equivalencia de jornada completa administrativa y la asignación de obra
actual se documentan en la actualización siguiente. GPS en teléfono físico
sigue aplazado por el propietario.


Actualización del 6 de octubre: el propietario aclaró que registra la jornada
completa desde Horas del panel administrativo. Su equivalencia existente es
Registrar horas, reservada a Administración. El recorrido se comprobó en
una sesión real administradora con una jornada ficticia de 450 minutos netos,
luego anulada de forma reversible y excluida de Labor, conservando historial. No se añade una jornada completa propia de
Trabajador a partir de esta aclaración. La obra actual del Encargado se trata
en [el paquete de asignación](PARIDAD-ENCARGADO-ASIGNACIONES.md), con sus límites
y verificaciones independientes.
