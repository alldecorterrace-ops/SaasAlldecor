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
rechazada, saldo/desglose exactos y documentos originales intactos. CI [36987975871](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36987975871)
completo aprobado en sus tres jobs: 628 pruebas, compilación y carreras nativas.
Las dos esperas de bloqueo quedaron observadas en PostgreSQL, sin documento ni
pago duplicados.

## Publicación y recorrido de propietario en staging

Commit exacto activo `e12b27253ae69bd6d72e59739b7d238a5abdd6a3`; retorno
`56fcd98963c1d5f54ce768623b23702903676c5d`. Esquema 068 aplicado con transacción
y guardas de entorno/hashes: 1.019 filas de 82 tablas anteriores intactas.
Configuración privada, dependencias y configuración de producción conservadas;
cuatro rutas públicas de staging y salud de producción comprobadas.

Una aprobación sintética produjo una factura/proyecto. El propietario registró
los dos importes ficticios y sus reversos, generando/descargando cada PDF:

| Revisión de factura | Pagado al generar | Saldo al generar | Pagos APPLIED capturados |
| --- | ---: | ---: | ---: |
| 1 | $0.00 | $104.34 | 0 |
| 2 | $10.43 | $93.91 | 1 |
| 3 | $104.34 | $0.00 | 2 |
| 4 | $10.43 | $93.91 | 1 |
| 5 | $0.00 | $104.34 | 0 |

Ocho páginas reales de esas cinco revisiones renderizadas e inspeccionadas:
fecha, método, referencias, notas, impuesto, calendario, importes y saldo correctos.
Los PDF 1/2/3 volvieron a descargarse después de los reversos y conservaron todos
sus bytes; repetir la revisión 5 produjo el mismo archivo y ninguna fila nueva.
Al terminar quedaron dos registros VOID con motivos y cinco documentos ready.
No se ejecutó cobro, transferencia, reembolso o envío externo real.

La consulta de solo lectura confirmó todos los pagos, facturas, proyectos,
gastos y revisiones anteriores; 13 documentos originales conservan sus huellas.
Un PDF anterior a 068 fue descargado y comparado byte por byte con su original.
Móvil emulado de 390 px sin desbordamiento de página y factura bajo empresa
ajena con Página no disponible comprobados. La navegación al archivo privado
bajo empresa ajena fue bloqueada por el navegador: no se acredita respuesta HTTP
de aplicación en ese ensayo. Descarga con permisos reales adicionales/revocación
sigue pendiente de la matriz; los contratos de RLS/revocación sí pasan en pruebas.

C19 está Implementada, no Comprobada: queda contrastar recibo separado, métodos
completos de ADT, perfiles y recorrido de comunicación cuando corresponda.
Los tres bloques siguen abiertos, conteo estricto 1/65 de la matriz provisional.
Pruebas sintéticas y evidencia privada fuera de GitHub; ADT sigue principal.
