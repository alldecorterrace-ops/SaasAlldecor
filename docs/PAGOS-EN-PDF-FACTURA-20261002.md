# Pagos aplicados en PDF de factura · 2 de octubre de 2026

## Referencia del origen y alcance

Script público observado en ADT Invoices: `/adt/adt_invmail.js?v=9`, renovado
el 2 de octubre, SHA-256
2365d80ca82769d97e1e5a15663abdeb51064e02eee68528989b4c9ebd9d9939.
`paysOf` incluye solo APPLIED; `payRows` imprime fecha, método, notas, monto y
Total payments. El PDF además incluye Paid y Balance Due. Lectura del origen,
sin creación de registros ni envío de facturas reales.

El SaaS incorpora ese desglose en los nuevos documentos conservados de factura.
Esta entrega no acredita paridad de identidad visual, correo, firma electrónica,
recibo separado, todos los perfiles ni controles del servidor actual de ADT.

## Contrato persistente

La migración aditiva 068 reemplaza la preparación del PDF sin modificar tablas,
filas financieras, snapshots anteriores, archivos, permisos o Storage.

- Captura todos los pagos APPLIED de la empresa/factura: identificador, versión,
  fecha, método, importe, referencia y notas. No vuelve a consultar pagos al
  imprimir el PDF; utiliza el snapshot guardado junto a su revisión.
- Usa el bloqueo compartido de la factura frente al bloqueo de sus escritores.
  Un pago anterior termina antes de capturar y cambia la versión; si el PDF se
  prepara primero, el pago espera. Saldo y desglose pertenecen al mismo estado.
- El total de pagos debe coincidir con paid_amount y total menos pagos con
  balance_due. Una diferencia bloquea la preparación; no ajusta importes.
- Preparar/generar no crea ni revierte pagos. El reintento conserva un único
  documento por versión. Un reverso posterior aparece al generar una nueva
  revisión y no reemplaza la constancia anterior.
- Una factura sin pagos captura un arreglo vacío, con aviso explícito. Los
  documentos anteriores sin este campo siguen compatibles y no se regeneran.
- Se mantienen autorización autenticada por empresa, escritura para generar,
  lectura para descargar, Storage privado y comprobación SHA de los archivos.

## Evidencia local y pendientes

Pruebas específicas: cero pagos, parcial $30.06/saldo $70.04, pago completo
$100.10, reverso con $70.04 aplicados, reintento, snapshots íntegros anteriores,
empresa ajena, lector, revocación y discrepancia de un centavo rechazada sin
insertar documento. Lector independiente del PDF comprueba texto y coordenadas;
seis páginas renderizadas inspeccionadas, incluida una factura de 25 pagos con
notas extensas, sin pérdida de referencias ni solapamientos.

Carreras PostgreSQL añadidas al CI: ocho preparaciones producen un documento,
espera de bloqueo observada en el servidor en ambos órdenes, versión obsoleta
rechazada, saldo/desglose exactos y documentos originales intactos. CI y sesión
publicada todavía pendientes en esta nota; staging activa 56fcd98 / esquema 067.

C19 pasa a Implementada cuando se publique esta entrega; no está Comprobada.
Los tres bloques siguen abiertos, conteo estricto 1/65 de la matriz provisional.
Pruebas sintéticas y evidencia privada fuera de GitHub; ADT sigue principal.
