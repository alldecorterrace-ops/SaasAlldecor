# Auditoría de Inventario en staging — 25 de septiembre de 2026

Sesión real del auditor, empresa y artículo sintéticos. ADT permanece como
sistema principal. No hubo compras, entregas ni cambios de existencias reales.
El recorrido comienza en la entrega `685b5da`, con 29 migraciones.

## Recorrido comprobado

- Alta de artículo en pies, con código, ubicación, mínimo y costo de referencia.
- Salida con saldo inicial cero rechazada; se conservaron cantidad, fecha,
  referencia y motivo. Corregir solo la cantidad guardó la entrada de 10,125 ft.
- Una nueva solicitud con referencia repetida fue rechazada sin duplicar saldo.
  La repetición transaccional de la solicitud original devolvió su mismo ID,
  aunque su versión de partida ya no era actual; finalizó en `ROLLBACK`.
- Salida de 3,125 ft vinculada al proyecto sintético: saldo 7,000 ft.
- Reversar toda la entrada con ese saldo fue rechazado. Reversar la salida
  recuperó 10,125 ft y conservó el original marcado como revertido. Reversar
  después la entrada dejó saldo cero, cuatro movimientos y suma conciliada.
- Un archivo de texto renombrado como PDF fue rechazado. El PDF sintético válido
  se adjuntó, archivó y restauró, conservando una sola referencia activa.

## Defecto reproducido y corrección

Con existencias positivas, cambiar la unidad se rechazaba. Al volver a cero,
el cambio de pies a unidades se guardó y los cuatro movimientos anteriores
pasaron a mostrarse como unidades. Se restituyó `ft` en el artículo de prueba;
ambas ediciones permanecen en su historial.

La migración aditiva 030 añade una protección en la base: cuando existe cualquier
movimiento del artículo, su unidad no puede cambiar. El saldo cero y los reversos
no eliminan el historial. Antes del primer movimiento sigue siendo editable;
otros datos, como la ubicación, siguen pudiendo corregirse. La protección no
reescribe movimientos ni intenta deducir unidades de registros preexistentes.

Una prueba de regresión verifica saldo cero tras reverso, dos intentos de cambio
rechazados, conservación del registro/movimientos/auditoría, edición de ubicación
y bloqueo de escritura directa. El mensaje del formulario explica el motivo.
Publicación y comprobación posterior de la migración se registrarán al ejecutarse.

## Límites

El recorrido acredita estas operaciones del SaaS; falta contrastarlas con el
Inventario operativo completo de ADT y cerrar sus diferencias. No acredita
todos los módulos, restauración desde Drive, carga, dispositivos reales ni
traspaso. La limpieza de los dos elementos antiguos sigue pendiente de la
confirmación específica solicitada. Los seis puntos permanecen abiertos.
