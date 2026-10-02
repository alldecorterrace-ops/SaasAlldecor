# Cierre de los puntos 1, 2 y 3 — 1 de octubre de 2026

## Alcance y criterio

Comercial/finanzas, Trabajadores/Campo y operaciones. Nuevas migraciones de datos,
traspaso, configuradores/3D, Portal e IA Assistant excluidos de esta entrega.
IA de recibos incluida. ADT principal; datos sintéticos en staging.

La meta es terminar hoy con paridad completa; no se reduce el alcance por el plazo.
Un fallo, integración no comprobada o prueba física ausente impide cerrar su acción.

Base GitHub 2536e92; staging documentado 518447a / esquema 057. Renovada la
fuente pública `adt-modules-v2.jsx` el 1 de octubre: SHA-256
ff0058234ef4b418b219903dc63e7f2e501fde36b3c83f390916d31174d90df8,
igual a la referencia previa. Sesión ADT y staging autenticadas al inicio.
Los controladores y las entradas de Campo/Workforce requieren renovación adicional;
no se confunde esta huella del panel con un inventario completo del servidor.

## Matriz única inicial

65 obligaciones conocidas, no porcentaje global ni inventario definitivo de
cada acción del origen. Antes de declarar cierre se incorporarán las acciones
operativas adicionales encontradas. Una obligación agrupada se cierra solo cuando
todas sus acciones y escenarios pasan. Las auditorías anteriores siguen siendo
antecedentes; estas filas exigen contraste del alcance completo actual.

Estados: **Pendiente**, **Implementada**, **Comprobada**, **Bloqueada**.
Comprobada exige regla de origen + prueba automatizada + sesión real + persistencia,
roles y documento/efecto externo cuando corresponda. Solo se cuentan como cerradas
las filas Comprobada; el denominador se declara provisional hasta completar inventario.

## Comercial y finanzas

| ID  | Obligación                                              | Estado de cierre | Evidencia o siguiente comprobación                                                                                                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C01 | Lead manual: alta, edición, estados y archivo           | Implementada | Propietario guardó/reabrió, archivó/restauró y convirtió desde dos formularios; un cliente y campos conservados en PostgreSQL. Contraste completo y perfiles pendientes. [Evidencia](RECORRIDO-COMERCIAL-20261002.md). |
| C02 | Entrada web: campos, validación y persistencia          | Pendiente        | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes.                                                                                                                                                                                                                                                 |
| C03 | Entrada web: revisión, conversión y avisos              | Pendiente        | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes.                                                                                                                                                                                                                                                 |
| C04 | Lead: conversión a cliente y repetición                 | Implementada | Propietario guardó/reabrió, archivó/restauró y convirtió desde dos formularios; un cliente y campos conservados en PostgreSQL. Contraste completo y perfiles pendientes. [Evidencia](RECORRIDO-COMERCIAL-20261002.md). |
| C05 | Cliente: datos originales y fichas separadas            | Pendiente        | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes.                                                                                                                                                                                                                                                 |
| C06 | Cliente: expediente financiero y documentos             | Pendiente        | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes.                                                                                                                                                                                                                                                 |
| C07 | Producto: especificaciones y opciones comerciales       | Pendiente        | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes.                                                                                                                                                                                                                                                 |
| C08 | Producto: opciones aplicadas al estimado                | Pendiente        | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes.                                                                                                                                                                                                                                                 |
| C09 | Precios: costo, margen y reglas de ADT                  | Pendiente        | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes.                                                                                                                                                                                                                                                 |
| C10 | Precios: cambios sin recalcular revisiones históricas   | Pendiente        | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes.                                                                                                                                                                                                                                                 |
| C11 | Estimado: partidas, cantidades, descuentos e impuestos  | Implementada | Recorridos sintéticos de propietario y PostgreSQL, importes y documentos anteriores preservados; bfb8e3a / 067 publicada con CI 612 pruebas. Contraste completo, perfiles y diferencias pendientes. [Evidencia](RECORRIDO-COMERCIAL-20261002.md). |
| C12 | Estimado: revisiones, reapertura y documentos guardados | Implementada | Recorridos sintéticos de propietario y PostgreSQL, importes y documentos anteriores preservados; bfb8e3a / 067 publicada con CI 612 pruebas. Contraste completo, perfiles y diferencias pendientes. [Evidencia](RECORRIDO-COMERCIAL-20261002.md). |
| C13 | Estimado: estados y aprobación vigente                  | Implementada | Recorridos sintéticos de propietario y PostgreSQL, importes y documentos anteriores preservados; bfb8e3a / 067 publicada con CI 612 pruebas. Contraste completo, perfiles y diferencias pendientes. [Evidencia](RECORRIDO-COMERCIAL-20261002.md). |
| C14 | Aprobación: factura y proyecto únicos                   | Implementada | Recorridos sintéticos de propietario y PostgreSQL, importes y documentos anteriores preservados; bfb8e3a / 067 publicada con CI 612 pruebas. Contraste completo, perfiles y diferencias pendientes. [Evidencia](RECORRIDO-COMERCIAL-20261002.md). |
| C15 | Solicitud financiera: reintento y respuesta perdida     | Comprobada       | 05c1bda / 058: 504 pruebas, CI verde, PostgreSQL concurrente, recorrido UI, 50 reenvíos sin duplicados y empresa restringida. [Evidencia y límites](AUDITORIA-SOLICITUDES-FINANCIERAS-20261001.md).                                                                                                                                          |
| C16 | Estimado: plantilla y comunicaciones                    | Pendiente        | ADT actual confirma calendario 10/50/30/10, condiciones particulares y entrega. d34c358 / 059 publicada: 511 pruebas, calendario, revisiones, factura, PDF privado, móvil emulado y aislamiento comprobados. [Evidencia y límites](CALENDARIO-COMERCIAL-20261001.md). Restan plantilla completa y comunicaciones; la fila permanece abierta. |
| C17 | Factura: plantilla, numeración y documentos             | Pendiente        | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes.                                                                                                                                                                                                                                                 |
| C18 | Pago: anticipo, parcial y saldo completo                | Implementada | Recorridos sintéticos de propietario y PostgreSQL, importes y documentos anteriores preservados; bfb8e3a / 067 publicada con CI 612 pruebas. Contraste completo, perfiles y diferencias pendientes. [Evidencia](RECORRIDO-COMERCIAL-20261002.md). |
| C19 | Pago: recibo y consulta del registro                    | Pendiente        | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes.                                                                                                                                                                                                                                                 |
| C20 | Pago: reversión conservando historial                   | Implementada | Recorridos sintéticos de propietario y PostgreSQL, importes y documentos anteriores preservados; bfb8e3a / 067 publicada con CI 612 pruebas. Contraste completo, perfiles y diferencias pendientes. [Evidencia](RECORRIDO-COMERCIAL-20261002.md). |
| C21 | Factura: anulación y requisitos actuales                | Implementada | Recorridos sintéticos de propietario y PostgreSQL, importes y documentos anteriores preservados; bfb8e3a / 067 publicada con CI 612 pruebas. Contraste completo, perfiles y diferencias pendientes. [Evidencia](RECORRIDO-COMERCIAL-20261002.md). |
| C22 | Proyecto: estados, anticipo y fechas                    | Implementada | Recorridos sintéticos de propietario y PostgreSQL, importes y documentos anteriores preservados; bfb8e3a / 067 publicada con CI 612 pruebas. Contraste completo, perfiles y diferencias pendientes. [Evidencia](RECORRIDO-COMERCIAL-20261002.md). |
| C23 | Proyecto: expediente y consumidores de costos           | Pendiente        | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes.                                                                                                                                                                                                                                                 |
| C24 | Recorrido comercial completo con roles restringidos     | Pendiente        | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes.                                                                                                                                                                                                                                                 |

## Trabajadores y Campo

| ID  | Obligación                                              | Estado de cierre | Evidencia o siguiente comprobación                                                                                                                                                                                                                            |
| --- | ------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T01 | Perfiles: trabajador, encargado, oficina y asignaciones | Pendiente        | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes.                                                                                                                                                                  |
| T02 | Horas: marcación propia, descansos y salida             | Pendiente        | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes.                                                                                                                                                                  |
| T03 | Horas: consulta y días por proyecto                     | Pendiente        | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes.                                                                                                                                                                  |
| T04 | Horas: registro delegado del encargado                  | Pendiente        | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes.                                                                                                                                                                  |
| T05 | Horas: solicitudes, correcciones y decisiones           | Pendiente        | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes.                                                                                                                                                                  |
| T06 | Horas: cierre y reapertura de periodos                  | Pendiente        | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes.                                                                                                                                                                  |
| T07 | GPS: jornada, permiso y precisión                       | Pendiente        | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes.                                                                                                                                                                  |
| T08 | GPS: reglas de geocerca e incidencias operativas        | Pendiente        | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes.                                                                                                                                                                  |
| T09 | Dispositivos: desconexión y reenvío sin duplicados      | Pendiente        | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes.                                                                                                                                                                  |
| T10 | Dispositivos: comportamiento físico operativo           | Pendiente        | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes.                                                                                                                                                                  |
| T11 | Gasto: recibos, datos, pagador y revisiones             | Pendiente        | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes.                                                                                                                                                                  |
| T12 | Gasto: doble aprobación Workforce                       | Pendiente        | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes.                                                                                                                                                                  |
| T13 | IA: extracción de recibo y comparación                  | Implementada     | cf8e3d1 / 060 activa, 47 comparaciones PHP y dos casos de referencia sintéticos en sesión; extracción remota real, HEIC y disparadores pendientes. [Contrato y límites](REVISION-RECIBOS-20261001.md).                                                        |
| T14 | IA: estados, errores, reintentos y duplicados           | Implementada     | Registro duradero y PostgreSQL nativo comprobados: ocho reintentos por fase, duplicados y corrección simultánea. Publicado en staging; proveedor y perfiles completos pendientes. [Pruebas y límites](REVISION-RECIBOS-20261001.md).                          |
| T15 | Revisión humana: actor, fecha e invalidación            | Implementada     | Confirmación desde sesión de propietario y reapertura en staging, actor/fecha y gasto pendiente conservados; sin pagos ni copias. Falta matriz completa de perfiles. [Contrato](REVISION-RECIBOS-20261001.md).                                                |
| T16 | Decisión: precondiciones IA y revisión según origen     | Pendiente        | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes.                                                                                                                                                                  |
| T17 | Deuda: únicamente bolsillo propio elegible              | Implementada     | 061 aplicada; b312b40 activa, 540 pruebas y CI nativo; deuda $100→$0 y costo $100 comprobados en sesión. Contraste final y matriz completa pendientes. [Contrato](REEMBOLSOS-WORKFORCE-20261001.md).                                                          |
| T18 | Reembolso: constancia de pago, versión e idempotencia   | Implementada     | Constancia individual, reapertura y móvil comprobados; CI nativo 8 reintentos/un efecto y tres carreras/un efecto. Lote y perfiles separados en UI pendientes. [Contrato](REEMBOLSOS-WORKFORCE-20261001.md).                                                  |
| T19 | Gasto: coordinación de archivo/restauración con deuda   | Implementada     | Archivo/restauración reales en staging conservaron una constancia y deuda $0; costo activo $100→$0→$100. Huellas de Pagos/Gastos iguales; consumidores restantes pendientes. [Pruebas y límites](REEMBOLSOS-WORKFORCE-20261001.md).                           |
| T20 | Labor: costo por jornada/proyecto y tarifas vigentes    | Implementada     | f84c5de / 062 activa; 563 pruebas y CI nativo. Propietario guardó tarifa, proyecto, asignación y jornada; reapertura $250, móvil y empresa restringida comprobados. Matriz completa y consumidores en preparación. [Contrato](LABOR-POR-JORNADA-20261001.md). |
| T21 | Labor: incidencias y nómina sin doble contabilización   | Implementada     | 062 conserva correspondencia de nómina y bloquea fuentes cambiadas; CI nativo y jornada sintética comprobados sin cambios en Pagos/Gastos. 064 añade UI de correspondencias: rechazo de un centavo, guardado/reapertura, actor/fecha y original preservado comprobados. Perfiles, corrección y consumidores completos pendientes. [Contrato](LABOR-POR-JORNADA-20261001.md).             |
| T22 | Costos: registro unificado, expediente y exportación    | Implementada     | 1e2735a / 064 activa, 576 pruebas y CI nativo. Proyecto/Gastos $350 y CSV de tres filas tras correspondencia comprobados; móvil y empresa restringida comprobados. Matriz completa y corrección por UI pendientes. [Contrato](LABOR-POR-JORNADA-20261001.md).       |
| T23 | Autorización: equipo, revocación y dos empresas         | Pendiente        | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes.                                                                                                                                                                  |

## Operaciones

| ID  | Obligación                                        | Estado de cierre | Evidencia o siguiente comprobación                                                           |
| --- | ------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------- |
| O01 | Permiso: campos, fechas, estado y número          | Implementada | 42fdad5 / 065 publicada: 584 pruebas, CI y concurrencia nativa; propietario, persistencia, documentos y empresa restringida comprobados parcialmente. Contraste completo y perfiles restantes pendientes. [Evidencia y límites](OPERACIONES-TRANSACCIONALES-20261001.md). |
| O02 | Permiso: documentos, archivo y restauración       | Implementada | 42fdad5 / 065 publicada: 584 pruebas, CI y concurrencia nativa; propietario, persistencia, documentos y empresa restringida comprobados parcialmente. Contraste completo y perfiles restantes pendientes. [Evidencia y límites](OPERACIONES-TRANSACCIONALES-20261001.md). |
| O03 | Inventario: artículos, unidades y existencias     | Implementada | 42fdad5 / 065 publicada: 584 pruebas, CI y concurrencia nativa; propietario, persistencia, documentos y empresa restringida comprobados parcialmente. Contraste completo y perfiles restantes pendientes. [Evidencia y límites](OPERACIONES-TRANSACCIONALES-20261001.md). |
| O04 | Inventario: entradas y salidas por proyecto       | Implementada | 42fdad5 / 065 publicada: 584 pruebas, CI y concurrencia nativa; propietario, persistencia, documentos y empresa restringida comprobados parcialmente. Contraste completo y perfiles restantes pendientes. [Evidencia y límites](OPERACIONES-TRANSACCIONALES-20261001.md). |
| O05 | Inventario: reversos y unidad histórica           | Implementada | 42fdad5 / 065 publicada: 584 pruebas, CI y concurrencia nativa; propietario, persistencia, documentos y empresa restringida comprobados parcialmente. Contraste completo y perfiles restantes pendientes. [Evidencia y límites](OPERACIONES-TRANSACCIONALES-20261001.md). |
| O06 | Inventario: movimientos simultáneos               | Implementada | 42fdad5 / 065 publicada: 584 pruebas, CI y concurrencia nativa; propietario, persistencia, documentos y empresa restringida comprobados parcialmente. Contraste completo y perfiles restantes pendientes. [Evidencia y límites](OPERACIONES-TRANSACCIONALES-20261001.md). |
| O07 | Instalación: proyecto, responsable y cuadrilla    | Implementada | 065: agenda, responsable, persistencia y rechazo sin anticipo comprobados por propietario; carrera de superposición nativa comprobada. 066 publicada: cuadrilla estructurada, guardado/reapertura, cruces y cancelación/restauración comprobados con propietario y PostgreSQL nativo. Contraste y perfiles restantes pendientes. [Evidencia y límites](OPERACIONES-TRANSACCIONALES-20261001.md). |
| O08 | Instalación: agenda, zona horaria y superposición | Implementada | 065: agenda, responsable, persistencia y rechazo sin anticipo comprobados por propietario; carrera de superposición nativa comprobada. 066 publicada: cuadrilla estructurada, guardado/reapertura, cruces y cancelación/restauración comprobados con propietario y PostgreSQL nativo. Contraste y perfiles restantes pendientes. [Evidencia y límites](OPERACIONES-TRANSACCIONALES-20261001.md). |
| O09 | Instalación: estados, requisitos y concurrencia   | Implementada | 065: agenda, responsable, persistencia y rechazo sin anticipo comprobados por propietario; carrera de superposición nativa comprobada. 066 publicada: cuadrilla estructurada, guardado/reapertura, cruces y cancelación/restauración comprobados con propietario y PostgreSQL nativo. Contraste y perfiles restantes pendientes. [Evidencia y límites](OPERACIONES-TRANSACCIONALES-20261001.md). |
| O10 | Manual: instrucciones, materiales y revisión      | Implementada | 42fdad5 / 065 publicada: 584 pruebas, CI y concurrencia nativa; propietario, persistencia, documentos y empresa restringida comprobados parcialmente. Contraste completo y perfiles restantes pendientes. [Evidencia y límites](OPERACIONES-TRANSACCIONALES-20261001.md). |
| O11 | Manual: aprobación e invalidación por cambios     | Implementada | 42fdad5 / 065 publicada: 584 pruebas, CI y concurrencia nativa; propietario, persistencia, documentos y empresa restringida comprobados parcialmente. Contraste completo y perfiles restantes pendientes. [Evidencia y límites](OPERACIONES-TRANSACCIONALES-20261001.md). |
| O12 | Manual: documentos, archivo y restauración        | Implementada | 42fdad5 / 065 publicada: 584 pruebas, CI y concurrencia nativa; propietario, persistencia, documentos y empresa restringida comprobados parcialmente. Contraste completo y perfiles restantes pendientes. [Evidencia y límites](OPERACIONES-TRANSACCIONALES-20261001.md). |
| O13 | Manual: impresión persistida y documentos largos  | Implementada | 42fdad5 / 065 publicada: 584 pruebas, CI y concurrencia nativa; propietario, persistencia, documentos y empresa restringida comprobados parcialmente. Contraste completo y perfiles restantes pendientes. [Evidencia y límites](OPERACIONES-TRANSACCIONALES-20261001.md). |
| O14 | Mapa: categorías, filtros, centros y sumas        | Pendiente        | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| O15 | Mapa: cartografía externa y errores | Implementada | ab2307f publicado, 603 pruebas, proveedor real 10/10, caché 10/10, fallo local y reintento conservan vista/CSV; abierto por contraste y perfiles completos. [Evidencia](CARTOGRAFIA-AISLADA-20261002.md). |
| O16 | Mapa: nombres multibyte y exportación             | Pendiente        | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| O17 | Mapa: proveedor, caché y fallos reales            | Pendiente        | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| O18 | Operaciones: permisos, revocación y dos empresas  | Implementada | 42fdad5 / 065 publicada: 584 pruebas, CI y concurrencia nativa; propietario, persistencia, documentos y empresa restringida comprobados parcialmente. Contraste completo y perfiles restantes pendientes. [Evidencia y límites](OPERACIONES-TRANSACCIONALES-20261001.md). |

## Entregas y protección

- Esquema 058: recibos privados de solicitudes financieras, resultado persistido
  en la misma transacción que efecto y auditoría. Las rutas públicas se conservan.
- Reintentos vuelven a exigir los permisos actuales. La misma solicitud con datos
  distintos devuelve conflicto; las respuestas originales no recalculan documentos.
- Migración aditiva; RPC anteriores conservados para retorno de código compatible.
  La aplicación nueva requiere 058 antes de activarse. Ninguna clave administrativa
  llega al navegador ni se habilita una escritura en ADT.
- Comprobaciones locales: lint, tipos, 504 pruebas (ocho nuevas) y compilación aprobadas. Los resultados de CI,
  hosting y sesión real se incorporarán al obtenerlos, sin anticipar evidencias.
- Estados generales: **los tres bloques siguen abiertos**. No hay contratación,
  cargo, transferencia, envío comercial ni traslado de información de negocio.

## Avance verificado del 1 de octubre

**1 / 65 obligaciones agrupadas comprobadas** (C15); inventario aún provisional.
Los tres bloques siguen abiertos. Este conteo no mide el porcentaje del código
ya construido ni constituye una estimación de tiempo.

La nueva diferencia comercial se verificó en la sesión de ADT y en `pagosDe`:
$47,937.34 produce $4,793.73 / $23,968.67 / $14,381.20 / $4,793.74.
El esquema 059 conserva calendario, condiciones y entrega en revisión/factura;
no asigna condiciones desconocidas a documentos anteriores ni recrea abonos.
No se declara cerrado C16 ni el requisito completo de inicio de producción.

## Calendario comercial publicado

Entrega d34c358 / esquema 059, CI completo aprobado, activa en staging y con
retorno 05c1bda compatible. Cuatro revisiones sintéticas, calendarios inicial y
personalizado, copia exacta a factura sin pagos, PDF históricos preservados,
escritorio/móvil emulado y empresa restringida comprobados. Datos privados fuera
de GitHub. [Evidencia y límites](CALENDARIO-COMERCIAL-20261001.md).

El conteo permanece **1 / 65 obligaciones agrupadas comprobadas**. C16 incluye
plantilla y comunicaciones pendientes; estos subresultados no cierran su fila.
Ninguno de los tres bloques se considera terminado.

## Recibos publicados y comprobación humana

cf8e3d1 / 060 activa; retorno 80c0cf2 compatible. CI exacto aprobado, 527 pruebas,
47 comparaciones independientes y concurrencia nativa. Migración aditiva con
803 filas originales preservadas, carga de dos recibos sintéticos, contexto de
jornada, invalidación, confirmación humana y reapertura comprobados. Móvil emulado
sin desbordamiento. Las huellas de pagos y gastos administrativos permanecen
idénticas; el gasto confirmado sigue pendiente del encargado. El proveedor de IA
continúa desactivado y la pantalla distingue las pruebas de referencia.
[Evidencia y pendientes](REVISION-RECIBOS-20261001.md).

El conteo permanece **1 / 65**. Las filas T13–T15 siguen Implementada; no se
confunde comprobación parcial de una acción con cierre completo del bloque.

## Reembolsos publicados y archivo recuperable

b312b40 / 061 activa; retorno fb640bd compatible. CI exacto aprobado, 540 pruebas,
cuatro carreras de reembolso en PostgreSQL nativo y esquema aditivo con 831 filas
anteriores preservadas. Constancia individual, reapertura, archivo/restauración,
proyección de costo y rechazo de empresa restringida comprobados en sesión real.
Preparación de las dos aprobaciones por RPC sintéticas identificada por separado.
La IA externa permanece desactivada; no se realizaron pagos ni transferencias.
[Evidencia y límites](REEMBOLSOS-WORKFORCE-20261001.md).

El conteo permanece **1 / 65**. T17–T19 siguen Implementada porque aún requieren
contraste del controlador actual, lote/perfiles reales y consumidores de Labor.
Los tres bloques siguen abiertos; estos resultados no se declaran cierre total.

## Labor publicada en staging

`f84c5de` / 062: CI aprobado, 563 pruebas, ocho reintentos y carreras nativas;
jornada de $250 guardada/reabierta, móvil emulado y empresa restringida comprobados.
Pagos y gastos administrativos conservaron huellas. [Pruebas y límites](LABOR-POR-JORNADA-20261001.md).
T20/T21 permanecen abiertas: esta evidencia no cubre todos los perfiles ni
consumidores. El conteo sigue **1 / 65**, con los tres bloques abiertos.

## Registro unificado de costos 063

`d28b19f` publicada: 569 pruebas y CI completo, lectura concurrente y revocación
nativas. Propietario comprobó los mismos $350 en Gastos, proyecto y expediente;
CSV privado descargado con $250 calculados y $100 de Workforce, sin pago de Labor.
Móvil y empresa restringida comprobados. T22 implementada, aún abierta por
matriz completa y UI de correspondencias. Conteo de cierre permanece **1 / 65**.


## Correspondencias de Labor 064 publicadas

`1e2735a` activa, retorno `07b9e96`, CI 36959034936 completo aprobado.
576 pruebas y carreras nativas: ocho reintentos con un efecto, dos ediciones
simultáneas con un efecto y ocho lecturas sin mutación. Original/pagos preservados.
El propietario comprobó rechazo de un centavo, correspondencia guardada/reabierta,
$100.01 histórico + $149.99 de suplemento y $100 de Workforce: total $350.
CSV privado de tres filas, móvil emulado y denegación en la empresa restringida.
[Evidencia y pendientes](LABOR-POR-JORNADA-20261001.md).

T21/T22 continúan abiertas por la matriz de perfiles y correcciones por UI.
El conteo sigue **1/65**. No hay traslado de negocio ni traspaso operativo.


## Operaciones 065 publicadas el 2 de octubre

`42fdad5` activa con retorno `1e2735a`, CI completo aprobado y esquema 065
aditivo con datos anteriores preservados. Inventario, documentos y manuales
comprobados por propietario con datos sintéticos; concurrencia y revocación
comprobadas en PostgreSQL nativo. [Resultados y límites](OPERACIONES-TRANSACCIONALES-20261001.md).

O01–O06, O10–O13 y O18 se distinguen como Implementada, todavía abiertas.
El conteo de cierre sigue **1/65 obligaciones agrupadas**, que no es un
porcentaje de código construido. La fecha objetivo del 1 de octubre pasó sin
cierre de los tres bloques; no se reduce el alcance para modificar el conteo.
IA de recibos externa y prueba física siguen pendientes de sus dependencias.


## Descargas operativas publicadas

Activa `9de7c8e`, retorno `42fdad5`, esquema 065. CI 36965028995 completo,
588 pruebas y compilación aprobados. Descarga autenticada real y rechazo 401
sin sesión; revocación de la membresía sintética con formulario abierto, ficha
intacta y restauración exacta comprobados. Permiso recuperado y agenda guardada;
ejecución sin anticipo rechazada. Dieciséis solicitudes, finanzas originales
preservadas y móvil emulado comprobados. [Evidencia](OPERACIONES-TRANSACCIONALES-20261001.md).

O07–O09 también se distinguen como Implementada. O14–O17 de mapa continúan
Pendiente de su contraste completo; las restantes operaciones siguen abiertas
por perfiles, reglas y recorridos enumerados. El conteo de cierre sigue 1/65.

## Cuadrillas estructuradas · 2 de octubre de 2026

Candidata aditiva 066: selección de colaboradores, agenda por cada integrante,
conservación de revisiones y compatibilidad con formularios anteriores.
[Reglas, referencia y límites](INSTALACIONES-CUADRILLAS-20261002.md).
Las pruebas locales añaden nueve casos; el cierre operativo requiere CI,
publicación en staging y recorridos reales. O07–O09 continúan Implementada,
los tres bloques siguen abiertos y el conteo estricto permanece 1/65.

## Cuadrillas publicadas y comprobadas · 2 de octubre de 2026

Activa `c7bdaf4`, retorno `9de7c8e`, esquema 066; CI 36968793404 completo,
597 pruebas, lint, tipos y compilación correctos. La migración conservó
922 filas de 82 tablas. Propietario guardó y reabrió la cuadrilla; se comprobaron
cruces entre responsables distintos, corrección de la misma solicitud,
cancelación, restauración rechazada por cruce y restauración posterior.
Las seis escrituras nuevas dejaron 22 constancias totales, con huellas de
facturas, pagos, gastos y proyectos intactas. Interfaz móvil a 390 × 844
sin desbordamiento. [Evidencia y límites](INSTALACIONES-CUADRILLAS-20261002.md).

O07–O09 continúan Implementada, abiertas por el contraste del backend y los
perfiles/recorridos restantes. Los tres bloques siguen abiertos, conteo 1/65.
No se reanuda migración de negocio, traspaso, configuradores ni 3D.


## Cartografía publicada y comprobada · 2 de octubre de 2026

Activa `ab2307f`, retorno `c7bdaf4`, esquema 066 sin cambio. CI 36971655443
completo, 603 pruebas, lint, tipos y compilación correctos. Diez imágenes reales
OSM y diez recuperadas desde caché; fallo local, reintento, filtros y CSV privado
byte por byte conservados. Móvil 390 x 844 y empresa restringida comprobados;
huellas financieras e instalaciones intactas, 22 constancias operativas.
[Evidencia, referencia y límites](CARTOGRAFIA-AISLADA-20261002.md).
O15 continúa Implementada, abierta por contraste/perfiles completos; O14,
O16 y O17 conservan sus pendientes. Los tres bloques siguen abiertos, 1/65.


## Recorrido comercial y editor · 2 de octubre de 2026

En staging ab2307f / 066: lead guardado, archivo/restauración, conversión repetida
sin duplicar cliente, cuatro revisiones, aprobación repetida con una factura y
proyecto, bloqueo sin anticipo, dos pagos exactos, exceso rechazado, reversos y
anulación conservando documentos. Filas financieras anteriores intactas.
Corrección de impuesto opcional 7% y copia/orden de partidas validada localmente;
067 y su publicación pendientes. [Evidencia y diferencias](RECORRIDO-COMERCIAL-20261002.md).
Conteo estricto 1/65; los tres bloques siguen abiertos por contraste y perfiles.


## Editor comercial publicado · 2 de octubre de 2026

Activa `bfb8e3a`, retorno `ab2307f`, esquema 067; CI 36977920109 completo aprobado,
612 pruebas y carrera nativa de dos tasas con un escritor. Migración aditiva:
984 filas de 82 tablas preservadas, sin rellenar tasa de documentos anteriores.
Propietario guardó y reabrió copia/orden de partidas, cinco revisiones 7%/0%,
factura con 7% capturado y sin pago, PDF anterior byte por byte conservado.
Compatibilidad del documento manual anterior, móvil emulado y empresa ajena
comprobados. Filas financieras y proyectos preexistentes intactos.
[Evidencia y diferencias abiertas](RECORRIDO-COMERCIAL-20261002.md).

Los tres bloques siguen abiertos; conteo estricto 1/65. No se confunde este
recorrido de propietario con la matriz completa, plantillas, comunicaciones,
proveedor de recibos o dispositivo físico. Migración de negocio y traspaso siguen
excluidos; producción y ADT no se modificaron.
