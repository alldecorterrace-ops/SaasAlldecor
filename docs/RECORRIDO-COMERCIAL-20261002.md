# Recorrido comercial y reglas del editor — 2 de octubre de 2026

## Recorrido comprobado en staging ab2307f / esquema 066

Datos enteramente sintéticos y una sesión de propietario. No se enviaron mensajes
comerciales, cobraron tarjetas, ejecutaron transferencias ni modificó ADT.

- Alta y edición de un lead, estado Contactado, archivo y restauración guardados y
  reabiertos. Al archivarlo desaparece la conversión. Dos formularios abiertos
  convierten al mismo cliente: PostgreSQL confirma un lead, un cliente, ocho campos
  originales conservados y estado Cliente. No se fusionaron fichas.
- Estimado con partida lineal fraccionaria y partida manual. La cantidad 9 no
  multiplica el importe manual de $100.01. Primera revisión $284.19; cambiar el
  precio lineal deja una nueva revisión $300.59. La anterior sigue $284.19 y es
  de consulta. Condiciones multilínea y entrega quedan guardadas en la nueva.
- Revisión Pendiente con PDF privado. Aprobar desde dos formularios abiertos
  devuelve la misma factura y un proyecto: uno de cada tipo en PostgreSQL. La
  factura captura la revisión 3, sus importes y condiciones; aprobar no crea pagos.
- Intentar Producción sin pago se rechaza sin aumentar la versión del proyecto.
  Registrar anticipo $30.06 permite guardar Producción. Un pago superior al saldo
  por un centavo se rechaza; $270.53 completa $300.59 y saldo cero.
- Revertir el saldo conserva su registro y deja $30.06 aplicado. Intentar anular
  con ese pago se rechaza. Revertir el anticipo permite la anulación: dos registros
  VOID, motivos y versiones 2; factura versión 6, pagado y saldo $0.00.
- Los PDF guardados se descargaron y leyeron en sus dos páginas: partidas,
  importes, acentos, cuatro etapas y entrega presentes. El PDF de factura versión
  2 sigue idéntico byte por byte tras ambos reversos y la anulación.
- Las huellas de cada factura, pago, gasto y proyecto anteriores al ensayo están
  presentes sin cambios. Instalaciones y 22 constancias operativas intactas.
  Evidencia de interfaz, consultas de solo lectura y binarios fuera de GitHub.

La introducción automática de una fecha no disparó el evento del formulario;
se repitió mediante teclado y se comprobó guardado/reapertura. No se considera
correcta por aparecer únicamente en el control antes de guardar.

## Diferencias identificadas y corrección publicada

Referencia del editor general de ADT en `adt-modules-v2.jsx`, renovada el 1 de
octubre y SHA-256 ff0058234ef4b418b219903dc63e7f2e501fde36b3c83f390916d31174d90df8:
`edTaxPct` usa 0 o 7; `edTax` redondea (subtotal menos descuento) por porcentaje.
`dupItem` duplica después de la partida seleccionada y `moveItem` intercambia
partidas adyacentes. El SaaS tenía impuesto por importe y no esos controles.

- Esquema 067 aditivo: tasa explícita nula, 0 o 7 en estimado y factura. Nula
  conserva el importe anterior; no se deduce una tasa a partir de ese importe.
  Sin backfill, pagos, importaciones ni cambios de snapshots anteriores.
- Estimados nuevos parten sin impuesto. Seleccionar 7% calcula después del
  descuento con centavos exactos. PostgreSQL calcula el importe autorizado e
  ignora importes falsificados para una tasa explícita. Cada revisión conserva
  la tasa y la aprobación la copia a la factura y al snapshot del PDF.
- Aplicaciones anteriores que omiten la tasa conservan la capturada. Cambiarla
  requiere una decisión explícita; una edición nueva recalcula solo esa revisión.
- Duplicar, subir y bajar conservan producto, medidas, notas y precio capturado;
  una copia se puede editar sin cambiar la partida original. Límite 100 partidas.
- Nueve pruebas específicas pasan: referencia numérica independiente, copia y
  orden, legado, servidor, versiones, permisos y aprobación sin pagos. Lint,
  tipos, suite completa y compilación local correctos. CI añade una carrera real
  entre tasas 0/7: se exige un único escritor y PDF anterior conservado.

Entrega `bfb8e3a3e8e653d12c269fb39991642682fc72b8`, esquema 067 aplicado y
activa en staging. [CI 36977920109](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36977920109)
completo: lint, tipos, 612 pruebas, compilación, recuperación y concurrencia nativa.
La carrera real entre tasas 0/7 terminó con una revisión, un escritor rechazado y
el PDF original sin cambios. La migración preservó 984 filas de 82 tablas y no
rellenó tasas anteriores. Proceso de la revisión nueva, cuatro rutas públicas y
salud de producción HTTP 200; configuración de producción intacta.

En sesión de propietario, duplicar la partida fraccionaria conserva sus medidas
y permite editar solo la copia. Subirla conserva el orden tras guardar y reabrir.
Dos partidas $219.35 / $202.95 producen subtotal $422.30; descuento $33.33,
impuesto 7% $27.23 y total $416.20. Cinco revisiones conservan por separado:
7% Borrador, 7% Pendiente, 0% Pendiente ($388.97), 7% Pendiente y Aprobado.
La factura captura la revisión 4 y tasa 7%, pagado $0 y saldo $416.20; no hay cobro.
El PDF privado de revisión 2 incluye etiqueta 7%, importes y orden, y sigue
idéntico byte por byte después de las revisiones y aprobación. El documento
anterior conserva impuesto manual $14.56 / total $300.59 y su PDF original.
PostgreSQL confirma revisiones, tasa, importes y factura; las huellas de cada
factura, pago, gasto y proyecto preexistentes permanecen intactas. Se conservan
22 constancias operativas. Móvil emulado 390 × 844 sin desbordamiento y ruta con
otra empresa rechazada. Perfiles restantes y dispositivo físico no acreditados.

Retorno `ab2307fa91b86a830e09fdaef2cd1266d35454da`, comprobado antes del cambio,
compatible con 067: omitir la tasa preserva la capturada. No se ejecutó un retorno
real posterior. Dependencias y configuración privada idénticas; evidencia privada
fuera de GitHub. La paginación detecta encabezados de Notas/Condiciones al final
de página separados de su cuerpo; corrección pendiente, plantilla completa abierta.

## Límites de cierre

Los tres bloques siguen abiertos y el conteo estricto permanece 1/65. Este ensayo
de propietario no sustituye ventas, administrador, usuario restringido, móvil,
dispositivos físicos ni comunicaciones e integraciones externas.

Se conserva toda diferencia: falta el recibo independiente del pago y contraste
completo de plantillas. ADT limita el descuento al subtotal en el editor; el SaaS
rechaza un exceso. ADT añade procedencia de lead a las notas; el SaaS conserva el
mensaje original y la relación; falta completar la visualización de procedencia.
El proyecto sintético queda en Producción después de la anulación; es necesario
contrastar la regla operativa del backend antes de cambiar ese estado por inferencia.
La renovación del cPanel original de ADT sigue pendiente; entrar al cPanel del
nuevo SaaS no renueva la referencia del servidor original.

No se reanuda migración de negocio, traspaso, configuradores/3D, Portal ni Assistant.
IA de recibos y Campo continúan dentro del alcance y mantienen sus comprobaciones
pendientes, incluido proveedor real y dispositivo físico.
