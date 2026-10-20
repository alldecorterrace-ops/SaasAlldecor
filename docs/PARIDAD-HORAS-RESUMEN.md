# Consulta de horas y días por proyecto

Alcance de esta entrega: escenario T03 de Horas/Trabajadores, en los 21 módulos
activos. Consulta y CSV de solo lectura; nuevas importaciones de ADT y el
traspaso operativo siguen aplazados. La decisión del propietario del 5 de octubre
aplaza el trabajo pendiente de GPS. Esta entrega conserva la captura existente.

## Referencia actual

Contraste de lectura con ADT el 5 de octubre de 2026:
`panel_rango` de CrmController, y `adtWorkDays` / `adtProjectDays` de
adt-modules-v2.jsx. Los archivos completos y la evidencia permanecen privados.
SHA-256 del controlador: `578144f99dd8a57043df03915c27f5e3b962633668b315c13013c7ee9c3d4401`;
del módulo: `ff0058234ef4b418b219903dc63e7f2e501fde36b3c83f390916d31174d90df8`.

| Acción/regla                         | Equivalencia en SaaS                                                                                                            | Verificación                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Consultar desde/hasta                | Entrada dentro del intervalo en la zona de la empresa; rangos invertidos rechazados.                                            | Base sintética: límite nocturno y último segundo fraccionario.          |
| Trabajador activo, marcación vigente | Excluye trabajador inactivo, ANULADO y tiempo neto cero. PENDIENTE/APROBADO incluidos.                                          | Base sintética y huellas antes/después de consultas.                    |
| Horas cerradas                       | Minutos netos persistidos, incluidos descansos; jornada nocturna completa atribuida a su fecha de entrada.                      | Dos turnos con descanso y uno nocturno.                                 |
| Horas abiertas                       | Tiempo transcurrido según reloj del servidor, sin descontar descanso todavía; mostrado como provisional.                        | Comparación de tiempo y ausencia de escritura.                          |
| Días del trabajador                  | Fechas distintas con segundos positivos, aunque haya varias marcaciones o proyectos.                                            | Varias marcaciones y dos proyectos el mismo día.                        |
| Días por proyecto                    | Misma regla por trabajador/proyecto; nombre de proyecto como agrupación, igual a ADT. Los nombres repetidos se agrupan.         | Caso de dos IDs con un nombre.                                          |
| Resumen de proyectos                 | Fechas distintas, días-trabajador, trabajadores distintos y horas de todo el intervalo.                                         | 23 trabajadores en dos páginas; totales/CSV completos.                  |
| Filtro de proyecto                   | Nombre de proyecto; opciones obtenidas antes del filtro, únicamente desde horas visibles. Incluye Sin obra.                     | Selección, ausencia de resultado y restablecimiento.                    |
| CSV                                  | Resumen completo por proyecto con intervalo y zona; codificación UTF-8 y celdas protegidas contra fórmulas.                     | Exportación/API, identidad de bytes, fallo de filtros y permiso.        |
| Períodos                             | Esta semana, semana pasada, 14 días y este mes, en la fecha local de la empresa.                                                | Domingo local cuando UTC ya es lunes.                                   |
| Máximo del rango                     | Hasta 62 días transcurridos, con el cálculo original de ADT.                                                                    | Bordes de 62 días y cambio de horario.                                  |
| Permisos                             | Propietario/admin: horas de trabajadores activos de su empresa. Usuario normal: solo propias, según permiso existente horasfix. | Empresa ajena, módulo denegado, usuario propio, inactivación y anónimo. |

ADT resta 14 fechas e incluye ambos extremos para «14 días»: se conservan las 15
fechas resultantes. El límite y el eje de fechas mantienen el cálculo por segundos
de ADT; el cambio de otoño puede rechazar 62 fechas calendarias o añadir una fecha
vacía al eje de un rango de 61. Las fechas desde/hasta siguen visibles.

La identidad de empresa y trabajador conserva UUID en SaaS. Los nombres de
proyectos se usan como agrupación/filtro para reproducir ADT. El selector se
restringe a registros autorizados: no expone nombres de horas de otra persona.
El filtro adicional de trabajador conserva el mismo alcance autorizado. Las
aprobaciones y la nómina siguen en su recorrido previo y no se ejecutan desde
el resumen.

## Evidencia y cierre

Pruebas automáticas sobre todas las migraciones, más comparación privada con
las funciones puras actuales de ADT. Ese contraste no representa una ejecución
de la ruta real de ADT. La prueba web autenticada, el CSV descargado y la
conservación del staging se registran en el acta privada de esta entrega tras
el despliegue del commit oficial y su CI.

Esta entrega cubre consulta/días/CSV. T03 conserva pendientes los demás escenarios
que requiera la matriz completa, incluido contraste de perfiles independientes
en navegador y aprobación semanal/nómina. No declara terminado el módulo Horas
ni el SaaS.
