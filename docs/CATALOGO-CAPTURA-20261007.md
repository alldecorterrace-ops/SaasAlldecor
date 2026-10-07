# Captura de catálogo y revisión conservada · 7 de octubre

## Regla contrastada

El editor general de ADT copia el precio base y la descripción. Las medidas
físicas y opciones de la ficha se conservan como configuración; no agregan
costos automáticamente al insertar en este editor. El comparador de catálogo
contrasta las seis bases y tres clases de ajuste con la función de referencia
congelada, cuyo SHA está fijado en la prueba. Los comparadores de detalles y
Precios también pasaron en CI 37664859382. No se incluye configurador/3D.

## Ensayo real de staging

Desde Productos se creó QA-CIERRE-CATALOGO-20261007 Peña: Por unidad USD 123.45,
descripción con acentos y caracteres HTML, dimensiones físicas 24 × 6 × 6 ft,
una opción de importe fijo USD 999.00. La ficha quedó guardada con su opción.
Desde Nuevo estimado se buscó el cliente ficticio recién convertido del formulario
y se insertó el producto: cantidad 1, precio 123.45, medidas de cálculo 0 y
especificaciones descriptivas conservadas. El ajuste de la opción no se aplicó
fuera del configurador, conforme a la referencia.

EST-2026-0017: cantidad 2, subtotal 246.90, descuento 23.45, impuesto 7% de la
base posterior al descuento 15.64 y total 239.09. Calendario 10/50/30/10:
23.91, 119.55, 71.73 y 23.90; la última etapa absorbe el redondeo y suma 239.09.
Se guardó Borrador revisión 1. Solo la ficha nueva de prueba se cambió a precio
200.00, descripción distinta y Archivado. Reabrir el estimado conservó 123.45,
descripción original, total y revisión. Guardar Pendiente revisión 2 también
conservó esa partida; archivar el catálogo no impidió mantener el vínculo previo.

Probar Enviar por email guardó un único MIME con un único PDF de la revisión 2,
sin MTA. Se descargaron el mensaje y el PDF servido por la aplicación. El adjunto
coincide byte por byte con ese PDF; SHA/bytes coinciden con PostgreSQL. Extracción
independiente y renderizado de su página comprobaron importes, acentos, caracteres
literales, descripción anterior, notas y calendario. Sin aprobación de venta,
factura, proyecto, pago o correo externo.

| Archivo |  Bytes | SHA-256                                                          |
| ------- | -----: | ---------------------------------------------------------------- |
| MIME    | 21.614 | 944a5cee6facb562eab0f465deea9a9e07ee984040ca578405199225650bf740 |
| PDF     | 13.163 | 5d0881157596652b0ed9f8077d4e3e15759ba5253fdc9d6b02b8e6ce61374c00 |

## Conservación y límites

Baseline posterior a Avisos: 1.474 filas. Resultado: 1.490 filas en 94 tablas.
1.473 filas de baseline conservan exactamente su huella. La única fila anterior
cambiada es el contador EST de esta empresa/año, de 16 a 17, necesario para
asignar el número del ensayo; su contenido anterior reconstruido coincide con
el hash inicial. Ninguna fila fue borrada. Facturas, pagos, gastos, proyectos,
trabajadores, horas y membresías mantienen sus conjuntos completos de huellas.
La solicitud, ambos avisos, Lead, cliente y configuración anteriores quedaron
exactamente iguales. El formulario continúa desactivado.

Un producto nuevo, un estimado con dos revisiones, un documento y una captura;
PostgreSQL verifica sus relaciones y snapshots. La regla y sus seis bases tienen
comparación automatizada; esta sesión visual prueba Por unidad y no representa
sesiones de todas las bases/perfiles. Las funciones existentes de catálogo y
Precios no requirieron cambios de código para este ensayo. Las acciones de
restauración de Precios tienen su acta previa del 5 de octubre.

Entrega de aplicación 676a658, contrato 087 y CI de 910 pruebas aprobados,
regreso real y privacidad HTTP en [FORMULARIO-AVISOS-20261007](FORMULARIO-AVISOS-20261007.md).
Los archivos, SQL/JSON y pantalla se conservan en evidencia privada, fuera de
GitHub. Este ensayo acredita este recorrido; no certifica todo Comercial o
los otros módulos, y no autoriza activar producción o importar ADT.
