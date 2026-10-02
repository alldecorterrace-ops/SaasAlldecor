# Labor por jornada y proyecto — continuación del 1 de octubre

## Estado

Activa en staging `d28b19f` / esquema 063, con retorno `f84c5de`. CI
36956532483 aprobado: lint, tipos, **569 pruebas**, compilación, 50 comparaciones
PHP del modelo puro y PostgreSQL nativo. La jornada de $250 reaparece en Labor,
Gastos, proyecto y expediente; el CSV privado conserva su estado Calculado.
No se registra una nómina, pago o copia de gasto por calcular Labor.

T20/T21/T22 y los tres bloques siguen abiertos: faltan perfiles completos,
interfaz de correspondencias y escenarios adicionales de acuerdos, tarifas y
reaperturas. Estas comprobaciones no sustituyen la prueba física de Campo.

## Referencia

Se conservó el modelo puro LaborCostModel de la entrega de ADT del 27 de septiembre,
separado de Drupal, HTTP y datos. Huella del archivo congelado:
847ea58cedf5bb8f85069df8176824ab342a0a4ddd0e833eb79e5ed9f12bfbb6.
La fuente del modelo y el banco sintético se ejecutan por separado del SaaS.
Esto no acredita renovación del controlador ni de los datos actuales de ADT.
Los identificadores, tarifas y proyectos particulares del adaptador histórico
no se trasladan al código ni a la base del SaaS.

## Reglas portadas

- Una jornada local de trabajador/proyecto usa una tarifa diaria efectiva en su
  fecha. Las horas netas no multiplican una tarifa diaria ni se reemplaza esta
  tarifa con el precio de venta o la tarifa horaria actual de la ficha.
- Varios turnos del mismo día conservan sus orígenes y generan un único costo.
  Repetir un turno idéntico no duplica; una repetición conflictiva devuelve error.
- Jornada abierta, corrección pendiente, tarifa ausente/superpuesta y modo de
  proyecto desconocido generan incidencias fechadas. Costo conocido cero no se
  presenta como conciliación completa.
- El día compartido exige una decisión explícita. Si se autoriza reparto por
  minutos netos, la asignación racional conserva todos los centavos, con desempate
  determinista. La política por defecto sigue siendo revisión.
- Un ajuste exige responsable, importe, estimado y revisión capturados. Incluye
  la cuadrilla completa; no añade tarifas diarias de los trabajadores incluidos.
  Su reutilización en dos proyectos devuelve conflicto.
- El costo de nómina anterior permanece en su origen y se descuenta del
  suplemento de la jornada conciliada. Cobertura completa no genera suplemento;
  exceso, procedencia conflictiva o jornada sin correspondencia son incidencias.
- Labor previa en un proyecto por ajuste bloquea un segundo ajuste hasta
  conciliarlo. El cálculo no registra ni confirma ningún pago.
- Zona horaria de empresa y cambios de hora se aplican a la fecha de inicio.

## Siguiente entrega necesaria

1. Confirmar adaptador de tiempos/asignaciones y controlador operativo actual.
2. Añadir configuración autenticada y auditada por empresa: tarifas por vigencia,
   modo/acuerdo capturado del proyecto y decisión sobre días compartidos.
3. Mantener todo costo previo con su correspondencia; filas sin conciliación
   impedirán calcular un suplemento inventado.
4. Consultar un único registro persistente en Gastos, Proyectos, expediente y CSV,
   con origen, incidencias y pago separados del costo calculado.
5. Probar permisos, revocaciones, concurrencia PostgreSQL real y recorridos de
   pantalla en staging. No importar nómina ni información real de ADT.

## Configuración y consulta persistente preparadas

- Tarifas por trabajador y vigencia, acuerdos por proyecto con revisión de
  estimado capturada, regla explícita para días compartidos y correspondencias
  de costos históricos. Tablas nuevas, sin relleno de valores ni importación.
- Escrituras por propietario/administrador con permisos de Horas y consulta
  financiera/equipo; actor, versión esperada, solicitud y auditoría en la misma
  transacción. Reenvío igual no duplica; datos cambiados o tarifa superpuesta
  devuelven conflicto. La identidad del trabajador en una tarifa queda fija.
- Lectura de Labor exige todos los permisos y rol financiero de administración.
  Los trabajadores no pueden consultar tarifas ni sus fotografías de auditoría.
- Jornada aprobada, sin solicitud pendiente y dentro de una asignación histórica
  fechada. Cerrar la asignación después del turno conserva el costo; excluir el
  turno por sus fechas genera incidencia. Una asignación cerrada no se reabre.
- La correspondencia de nómina conserva la fila de gasto original. Su reparto
  por trabajador/fecha suma el importe exacto. Cambios en importe, proyecto,
  trabajador, categoría o estado invalidan el vínculo y bloquean un suplemento
  nuevo hasta revisar. Archivo y restauración conservan la correspondencia.
- La consulta devuelve un contexto de datos consistente; no recorta una empresa
  con más de 20.000 marcaciones para presentar un total aparentemente completo.
- Pantalla preparada en Horas → Labor por jornada: importes conocidos,
  suplemento, costos anteriores, incidencias y configuración con motivo/revisión.
  Todavía no se ha publicado ni comprobado en sesión real.

Nueve pruebas del contrato de base aprobadas localmente, además de las catorce
del modelo puro. Incluyen tarifas y reintentos, dos empresas, ausencia de mutación
directa, reapertura, jornadas/solicitudes/asignaciones, auditoría reservada,
revision de ajuste, revocación y nómina previa sin duplicación. Banco nativo
preparado: ocho solicitudes iguales, tarifas concurrentes superpuestas, ediciones
obsoletas y revocación mientras la solicitud espera el bloqueo.

## Entrega 062 publicada y comprobada en sesión

Staging activa `f84c5de13985083fd38addb8cc9515854eef3353`; retorno compatible
`b312b40`. CI 36954738947 aprobado: lint, tipos, 563 pruebas y compilación,
50 comparaciones con el modelo PHP fechado y PostgreSQL nativo. Ocho reintentos
produjeron un efecto; tarifas superpuestas y ediciones simultáneas produjeron
un efecto por carrera. Una revocación mientras la solicitud esperaba el bloqueo
rechazó el guardado, con permisos comprobados nuevamente.

Esquema 062 aplicado sin carga de negocio: 76 tablas y 856 filas anteriores
conservaron su huella. Fuente SHA-256
`7f299ffcc0cb8ee77df5674165896afbf64f379c7ed667744b2a7f3592d2c78e`.
Las cuatro rutas públicas de staging respondieron 200, proceso activo confirmado,
configuración y salud de producción conservadas.

Un propietario creó por interfaz tarifa diaria, modo de proyecto y asignación,
y aprobó una jornada sintética. Reabrir mostró un costo de $250, sin incidencias,
sin nómina ni pago. Móvil emulado 390 px: área útil y ancho de documento 375 px,
sin desbordamiento. El mismo usuario en su empresa restringida recibió Página
no disponible. Pagos y gastos administrativos globales conservaron las huellas
anteriores; solo se guardaron dos solicitudes de configuración y su auditoría.

Esto acredita esa jornada y ese propietario, no toda la matriz de roles ni
comportamiento físico de Campo. Los ajustes, tarifas históricas, correspondencias
y consumidores restantes aún requieren evidencia de interfaz completa.

## Registro unificado 063 publicado y comprobado

Consulta STABLE con permisos del actor captura gastos originales y contexto de
Labor en una sola sentencia. La aplicación concilia toda la empresa antes de
filtrar, conserva los gastos originales y añade solo el suplemento. Gastos,
proyectos, expediente del cliente y CSV usan esa misma proyección. Labor lleva
estado Calculado y no acredita pago. Incidencias también se conservan en CSV,
sin inventar importes. Una fuente incompleta o superior al límite de consulta
falla explícitamente; no devuelve un total parcial.

En sesión del propietario, Gastos, proyecto y expediente del cliente mostraron
$350: $250 de Labor calculada y $100 de Workforce aprobado, con deuda $0.
El CSV descargado contiene exactamente ambas filas y conserva COSTO_CALCULADO.
Móvil emulado de 390 px mantiene ancho útil y documento 375 px. La empresa sin
Gastos devuelve Página no disponible. Se comprobó también en pantalla el rechazo
de una tarifa superpuesta, conservando $250 y la revisión original.

Esquema 063: consulta aditiva sin mutaciones de negocio. 81 tablas y 865 filas
anteriores conservaron su huella. Fuente SHA-256
`5783daadb6e890bb0bf60e2ba0d901b856539491af70ad4edbb0354d31961449`.
Ocho lecturas concurrentes nativas devolvieron la misma proyección sin efectos;
el usuario revocado no pudo consultarla. La función STABLE de permisos del
actor conserva una instantánea por sentencia antes del filtro y la paginación.

Límite operativo actual: el registro original filtrado debe caber en 5.000 filas
y el contexto de horas en 20.000. Si excede el límite no se muestra un total
parcial. El CSV conserva las incidencias con importe vacío, sin inventar cero.
Los reembolsos conservan sus constancias originales; el costo de Labor calculado
no crea deuda de bolsillo propio ni acredita pago.
