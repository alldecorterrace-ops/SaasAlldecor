# Descuento del editor general de estimados · 2 de octubre de 2026

## Regla del origen y alcance

Referencia pública renovada desde el script observado en la sesión de ADT:
`/adt/adt-modules-v2.jsx?cb=1790477582`, SHA-256
ff0058234ef4b418b219903dc63e7f2e501fde36b3c83f390916d31174d90df8.
El editor general calcula `edDesc = Math.min(r2(descuento), edSubtotal)` y envía
`discount: edDesc` al guardar. El impuesto opcional 7% se calcula después del
descuento aplicado. Esta referencia es la del panel servido, no un inventario
actualizado de todos los controladores del servidor.

La corrección aplica al estimado que se está editando; no cambia revisiones,
PDF, facturas, pagos o datos históricos. Solo código de SaaS; pruebas sintéticas.
No modifica ADT ni reanuda migración de negocio, traspaso o configuradores.

## Contrato del SaaS

- Vista previa y payload capturan el menor entre descuento solicitado y subtotal
  redondeado por partida. La pantalla informa el descuento que se conservará.
- La Server Action autenticada aplica la misma regla independientemente del
  navegador. Conserva cliente, precios, partidas, tasa, notas y condiciones.
- El RPC mantiene permisos actuales, versión esperada y el límite de subtotal.
  Una solicitud directa con importes inconsistentes se rechaza; no se debilitan
  sus protecciones para aceptar payloads sin captura previa.
- Tasa desconocida sigue siendo importe manual; no se infiere 7% a partir de
  documentos anteriores. Un descuento nuevo no reescribe documentos previos.
- Guardar no aprueba, factura ni registra pagos. El ensayo de descuento total
  cubre borradores; aprobación de documentos con total cero no se acredita aquí.

## Validación local

Seis referencias independientes de importes incluyen límite exacto, exceso de
un centavo, descuento máximo permitido, impuesto posterior y vuelta a descuento
parcial. Pruebas del contrato completo de PostgreSQL comprueban tres revisiones,
snapshot original intacto, descuento aplicado $100.01, impuesto/total cero,
rechazo de RPC inconsistente y repetición obsoleta sin crear una revisión.
Miembro de lectura y empresa ajena no pueden guardar. No aparecen factura,
proyecto o pago por esa operación.

Lint, tipos, 621 pruebas y compilación local aprobados. CI incluye una carrera
real entre descuento total limitado y descuento parcial: exige un único escritor,
una revisión, snapshots/PDF anteriores intactos y ningún efecto financiero.
CI [36984639612](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36984639612)
aprobado en sus tres jobs, con 621 pruebas, compilación y carrera real PostgreSQL.
Commit exacto `56fcd98963c1d5f54ce768623b23702903676c5d` publicado y activo en staging;
esquema 067 conservado, sin migración nueva. Retorno `2aae1ad` y dependencias
c66e4ec/b149bee conservados. Raíz/proceso y cuatro rutas públicas comprobados;
producción mantiene disponibilidad y su configuración anterior.

## Recorrido autenticado en staging

Propietario de empresa sintética guardó y reabrió tres revisiones de una partida
fija de $100.01. Los importes se contrastaron con consulta de solo lectura:

| Revisión | Descuento solicitado | Descuento conservado | Impuesto 7% | Total |
| --- | ---: | ---: | ---: | ---: |
| 1 | $0.00 | $0.00 | $7.00 | $107.01 |
| 2 | $100.02 | $100.01 | $0.00 | $0.00 |
| 3 | $2.50 | $2.50 | $6.83 | $104.34 |

Las revisiones 1 y 2 siguieron consultables después de guardar la tercera.
En móvil emulado de 390 px, el aviso del límite fue visible sin desbordamiento
horizontal; esa edición de prueba no se guardó. El mismo identificador bajo
otra empresa devolvió Página no disponible, sin mostrar el documento.

Las huellas de los 15 estimados y 35 revisiones anteriores siguen presentes.
Gastos, pagos, facturas, proyectos, documentos comerciales y 22 solicitudes
Workforce conservan sus huellas/conteos previos. Guardar estos borradores no
creó factura, proyecto ni pago. Los datos y pantallas sintéticos de esta prueba
permanecen privados fuera de GitHub.

## Cierre pendiente

C11 sigue Implementada, con perfiles/contraste de otras acciones pendientes.
Los tres bloques permanecen abiertos y el conteo estricto es 1/65 obligaciones
agrupadas conocidas; no es porcentaje de código ni inventario final del origen.
Datos de pruebas, binarios, consultas y pantallas quedan fuera de GitHub.
