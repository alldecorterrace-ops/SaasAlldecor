# Encargado: revisión y aprobación de turnos

Alcance: aprobación del tiempo vigente de un turno cerrado del equipo directo,
sin una solicitud de corrección pendiente. La acción está en
`Horas → Equipo y obras → Revisar turnos`.

Referencia de origen: captura de `CrmController.php` del 5 de octubre de 2026,
SHA-256 `578144f99dd8a57043df03915c27f5e3b962633668b315c13013c7ee9c3d4401`.
Se contrastaron `campoEsMiObrero` y `campoEncargadoAccion` (`lista` y
`aprobar`). Es evidencia de código capturado; no demuestra una prueba nueva en
la sesión real de ADT.

| Acción o regla                 | ADT capturado                                                                         | Equivalencia y límite en SaaS                                                                                                                                                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Alcance del Encargado          | Trabajador activo, supervisor directo; excluye al propio Encargado                    | Perfil activo FOREMAN y subordinado directo activo con perfil habilitado de la misma empresa. No incluye nietos, compañeros sin supervisor ni turnos propios.                                                                                                      |
| Lista de turnos                | Fecha de entrada en zona local; excluye anulados; muestra horas, cierre y revisión    | RPC mínimo `workforce_time_review`, fechas en zona de la empresa y paginación de 20 turnos. No amplía la lectura de fichas, GPS ni auditorías. Se conserva el límite de consulta de 62 días transcurridos usado en Horas.                                          |
| Aprobar tiempo vigente         | Si no hay `minutes_prop > 0`, conserva `minutes`, marca APPROVED y registra auditoría | `approve_workforce_time` marca APROBADO, conserva minutos, descanso, reloj, regla de cálculo, GPS, trabajador, obra, notas y motivo. Auditoría con actor y estados anterior/posterior.                                                                             |
| Turno abierto o semana cerrada | Rechaza aprobación                                                                    | Rechaza turno abierto y cualquier semana cerrada que solape el turno.                                                                                                                                                                                              |
| Anulado                        | La lista no lo ofrece; la rama forzada `aprobar` no comprueba `void`                  | Se mantiene la protección existente del SaaS: un turno ANULADO no puede aprobarse ni reaparecer. Diferencia explícita frente a la llamada forzada del origen.                                                                                                      |
| Corrección propuesta           | Aprobar puede adoptar `minutes_prop` sin cambiar los extremos originales              | Pendiente de paridad. Las `time_requests` actuales tienen otra semántica y siguen siendo revisadas por administrador. Este paquete bloquea una aprobación simple mientras hay solicitud pendiente; no la interpreta como `minutes_prop`.                           |
| Repetición o turno modificado  | El origen no recibe versión ni identificador de solicitud                             | Se mantienen las protecciones de concurrencia del SaaS: versión, bloqueo y recibo privado por empresa/actor/solicitud. Repetición exacta devuelve el resultado sin otro cambio o auditoría. Antes del recibo se vuelve a comprobar el acceso y el equipo vigentes. |
| Administrador                  | La entrada Campo exige rol Encargado; la administración de Horas es separada          | La administración conserva su autoridad existente para aprobar trabajadores activos. Oficina y Trabajador no reciben aprobación de equipo.                                                                                                                         |

La migración `202610050079` añade una tabla vacía de recibos privados y tres
funciones. No modifica registros previos, políticas de lectura existentes,
perfiles, membresías, archivos ni finanzas. Las funciones públicas requieren
sesión autenticada, permiso de Horas y alcance actual. La de aprobación requiere
escritura; una cuenta de solo lectura puede consultar, pero no aprobar.

Validación reproducible: `tests/workforce-time-approval.test.ts`, con identidades,
turnos y coordenadas ficticios en PGlite. Comprueba conservación al instalar la
migración, alcance, privacidad, aprobación con auditoría, minutos de reloj y
manuales, reintentos, conflictos, revocación de acceso, semanas cerradas y
solicitudes pendientes. Estos tests no prueban JWT, hosting ni sensores físicos.

Retorno: el código anterior puede ejecutar con este esquema aditivo. Retornar
el código no elimina aprobaciones, recibos ni auditorías ya guardados.

Pendiente fuera de este paquete: `campoSolicitar` / `campoFix` con minutos
propuestos separados de minutos vigentes, aprobación de esas propuestas,
declaración diaria y las restantes acciones delegadas de Campo. GPS en teléfono
físico continúa aplazado por el propietario.
