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

| ID | Obligación | Estado de cierre | Evidencia o siguiente comprobación |
| --- | --- | --- | --- |
| C01 | Lead manual: alta, edición, estados y archivo | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| C02 | Entrada web: campos, validación y persistencia | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| C03 | Entrada web: revisión, conversión y avisos | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| C04 | Lead: conversión a cliente y repetición | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| C05 | Cliente: datos originales y fichas separadas | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| C06 | Cliente: expediente financiero y documentos | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| C07 | Producto: especificaciones y opciones comerciales | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| C08 | Producto: opciones aplicadas al estimado | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| C09 | Precios: costo, margen y reglas de ADT | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| C10 | Precios: cambios sin recalcular revisiones históricas | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| C11 | Estimado: partidas, cantidades, descuentos e impuestos | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| C12 | Estimado: revisiones, reapertura y documentos guardados | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| C13 | Estimado: estados y aprobación vigente | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| C14 | Aprobación: factura y proyecto únicos | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| C15 | Solicitud financiera: reintento y respuesta perdida | Implementada | Esquema 058 y ocho pruebas locales aprobadas; CI, PostgreSQL concurrente y sesión publicada pendientes. |
| C16 | Estimado: plantilla y comunicaciones | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| C17 | Factura: plantilla, numeración y documentos | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| C18 | Pago: anticipo, parcial y saldo completo | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| C19 | Pago: recibo y consulta del registro | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| C20 | Pago: reversión conservando historial | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| C21 | Factura: anulación y requisitos actuales | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| C22 | Proyecto: estados, anticipo y fechas | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| C23 | Proyecto: expediente y consumidores de costos | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| C24 | Recorrido comercial completo con roles restringidos | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |

## Trabajadores y Campo

| ID | Obligación | Estado de cierre | Evidencia o siguiente comprobación |
| --- | --- | --- | --- |
| T01 | Perfiles: trabajador, encargado, oficina y asignaciones | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| T02 | Horas: marcación propia, descansos y salida | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| T03 | Horas: consulta y días por proyecto | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| T04 | Horas: registro delegado del encargado | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| T05 | Horas: solicitudes, correcciones y decisiones | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| T06 | Horas: cierre y reapertura de periodos | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| T07 | GPS: jornada, permiso y precisión | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| T08 | GPS: reglas de geocerca e incidencias operativas | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| T09 | Dispositivos: desconexión y reenvío sin duplicados | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| T10 | Dispositivos: comportamiento físico operativo | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| T11 | Gasto: recibos, datos, pagador y revisiones | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| T12 | Gasto: doble aprobación Workforce | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| T13 | IA: extracción de recibo y comparación | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| T14 | IA: estados, errores, reintentos y duplicados | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| T15 | Revisión humana: actor, fecha e invalidación | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| T16 | Decisión: precondiciones IA y revisión según origen | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| T17 | Deuda: únicamente bolsillo propio elegible | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| T18 | Reembolso: constancia de pago, versión e idempotencia | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| T19 | Gasto: coordinación de archivo/restauración con deuda | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| T20 | Labor: costo por jornada/proyecto y tarifas vigentes | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| T21 | Labor: incidencias y nómina sin doble contabilización | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| T22 | Costos: registro unificado, expediente y exportación | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| T23 | Autorización: equipo, revocación y dos empresas | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |

## Operaciones

| ID | Obligación | Estado de cierre | Evidencia o siguiente comprobación |
| --- | --- | --- | --- |
| O01 | Permiso: campos, fechas, estado y número | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| O02 | Permiso: documentos, archivo y restauración | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| O03 | Inventario: artículos, unidades y existencias | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| O04 | Inventario: entradas y salidas por proyecto | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| O05 | Inventario: reversos y unidad histórica | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| O06 | Inventario: movimientos simultáneos | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| O07 | Instalación: proyecto, responsable y cuadrilla | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| O08 | Instalación: agenda, zona horaria y superposición | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| O09 | Instalación: estados, requisitos y concurrencia | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| O10 | Manual: instrucciones, materiales y revisión | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| O11 | Manual: aprobación e invalidación por cambios | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| O12 | Manual: documentos, archivo y restauración | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| O13 | Manual: impresión persistida y documentos largos | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| O14 | Mapa: categorías, filtros, centros y sumas | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| O15 | Mapa: cartografía externa y errores | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| O16 | Mapa: nombres multibyte y exportación | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| O17 | Mapa: proveedor, caché y fallos reales | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |
| O18 | Operaciones: permisos, revocación y dos empresas | Pendiente | Contrastar ADT actual y completar/pruebas según CIERRE-FUNCIONAL.md; conservar antecedentes. |

## Entregas y protección

- Esquema 058: recibos privados de solicitudes financieras, resultado persistido
  en la misma transacción que efecto y auditoría. Las rutas públicas se conservan.
- Reintentos vuelven a exigir los permisos actuales. La misma solicitud con datos
  distintos devuelve conflicto; las respuestas originales no recalculan documentos.
- Migración aditiva; RPC anteriores conservados para retorno de código compatible.
  La aplicación nueva requiere 058 antes de activarse. Ninguna clave administrativa
  llega al navegador ni se habilita una escritura en ADT.
- Comprobaciones locales: lint, tipos, 504 pruebas (ocho nuevas) y compilaci�n aprobadas. Los resultados de CI,
  hosting y sesión real se incorporarán al obtenerlos, sin anticipar evidencias.
- Estados generales: **los tres bloques siguen abiertos**. No hay contratación,
  cargo, transferencia, envío comercial ni traslado de información de negocio.
