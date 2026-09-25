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

## Publicación y comprobación posterior

La entrega `7472d42f9db7b5c0e3366c75e4835e781df4a500` pasó lint, tipos,
**282 pruebas y compilación**, además de los tres trabajos de
[CI](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36148761866).
Se compiló en una carpeta candidata, con un solo procesador y las dependencias
compartidas existentes; el proceso activo se comprobó después de cambiar la raíz.

La migración 030 se aplicó exclusivamente a staging, en una transacción con
guardas de identidad, datos sintéticos e historial. Se comprobaron las huellas
de las 29 migraciones anteriores y se conservó fuera del directorio público una
copia privada de los registros de Inventario antes de modificar el esquema.
Terminó con `COMMIT`, 30 migraciones y la huella esperada del SQL nuevo. Esta
copia parcial de prueba no sustituye el respaldo integral ni acredita recuperación.

Con la misma sesión autenticada se repitió el cambio de unidad con saldo cero:
el formulario lo rechazó con el nuevo mensaje y conservó sus campos. La base
mantuvo versión 10, unidad `ft`, saldo cero y los mismos cuatro movimientos.
Después se corrigió solamente la ubicación, se guardó y reabrió: versión 11,
misma unidad, saldo y movimientos. El archivo de prueba continuó disponible.

## Autorización, aislamiento y presentación

- El perfil de consulta mostró campos bloqueados, sin botones para guardar,
  registrar movimientos, adjuntar o archivar. Una llamada SQL bajo el rol
  `authenticated` y la identidad del auditor rechazó la escritura con `42501`;
  la transacción terminó en `ROLLBACK`. Esta última prueba no fue una petición
  del navegador.
- La ficha bajo otra empresa devolvió «Página no disponible». Al retirar
  Inventario y restituir el perfil de ventas original, recargar la ficha volvió
  a denegar acceso. La sesión pudo abrir su estimado previo, revisión 3.
- Se inspeccionaron cabecera y campos a 390 × 844 en emulación. El documento
  mantuvo el ancho de 390 píxeles; la tabla tiene desplazamiento local. No se
  acredita aquí el recorrido móvil completo ni un dispositivo físico.

Los perfiles se prepararon mediante el RPC autorizado del propietario, sobre
las cuentas ficticias. No se acredita el editor visual de permisos con ello.
Las cuatro rutas públicas de staging y producción pasaron después. Producción
conservó su proceso y entrega anteriores; no recibió código ni la migración 030.

La activa de staging queda en `7472d42`, la anterior en `685b5da` y la dependencia
compartida en `b149bee/node_modules`. `6866a73` y `f29072d` quedan identificadas
para retención; no se eliminaron carpetas en esta continuación.

## Límites

El recorrido acredita estas operaciones del SaaS; falta contrastarlas con el
Inventario operativo completo de ADT y cerrar sus diferencias. No acredita
todos los módulos, restauración desde Drive, carga, dispositivos reales ni
traspaso. La limpieza de los dos elementos antiguos sigue pendiente de la
confirmación específica solicitada. Los seis puntos permanecen abiertos.
