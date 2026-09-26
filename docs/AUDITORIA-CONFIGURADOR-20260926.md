# Referencia actual del configurador de ADT

Fecha: 26 de septiembre de 2026. Inspección autenticada de lectura y prueba local
con datos ficticios. No hubo guardado, envío, cobro ni migración de negocio.

## Interfaz observada

La ruta de Pérgola sin 3D redirige a /adt/pergola.php. La pantalla actual permite
presupuesto sin pérgola o varias estructuras, cocina, varias paredes, catálogo y
líneas libres. Incluye condiciones particulares, cuatro porcentajes de pago,
fecha de entrega, abono, permiso, ZIP, millas, factor de zona opcional, descuento,
impuesto opcional, costo, margen, partidas y lista de materiales. Hay recuperación
de borrador local. Guardar y enviar son acciones diferentes; no se ejecutaron.

El JavaScript cargado es motor-costo.js?v=20260730h, SHA-256:
`04173aecdd46797dd1018a64f33d0e42a5323ccc2f02189811973f6aecd446a4`.
La copia de referencia permanece privada. No se trasladaron las tarifas de la
cuenta: la prueba siguiente sustituye expresamente los parámetros por ficticios.

## Diferencias concretas por resolver

| Acción o regla | Referencia actual | Estado del SaaS inspeccionado |
| --- | --- | --- |
| Estructuras | Ninguna o varias por estimado | DesignSpec conserva una sola estructura obligatoria. |
| Paredes | Varias, cada una con modelo, color y medidas | Una pared por especificación. |
| Cocina y equipos | Módulos con equipos; precio de venta distingue margen de recargo | Longitud lineal; falta el contrato completo de equipos. |
| Condiciones | Texto para estimado/contrato, calendario validado y entrega | No están representados en la especificación del configurador. |
| Zona | Factor opcional separado del precio base; líneas libres no pasan por él | No está representado en DesignSpec. |
| Permiso | Sobre el umbral, máximo entre fijo y área por tarifa | save_design elige tarifa por área sin conservar ese mínimo. |
| Despiece | Motor de costos y lista de materiales | El cálculo básico no acredita despiece ni planos. |

Se inspeccionaron src/lib/designs.ts, src/components/design-fields.tsx,
src/app/app/[companyId]/disenos/actions.ts y la definición vigente de save_design
en la migración 028. Esta tabla no es una auditoría completa de Nuevo estimado 3D.

## Caso sintético del mínimo de permiso

Se ejecutó el motor publicado en un contexto JavaScript aislado sin red y sin
base de datos. Parámetros ficticios: fijo 100, tarifa por ft² 5 y umbral 10.

| Área | Resultado del motor ADT | Fórmula de SQL actual reproducida localmente |
| --- | --- | --- |
| 10 | 100 | 100 |
| 11 | 100 | 55 |
| 20 | 100 | 100 |
| 21 | 105 | 105 |

El caso 11 demuestra una diferencia de fórmula. La columna del SaaS reproduce
la expresión leída en SQL: aún no constituye una ejecución del RPC ni un
documento guardado. No se corrigieron importes existentes. La implementación
debe llevar una migración aditiva y pruebas de frontera, actualización explícita
de tarifas, revisiones y persistencia antes de cerrar esta diferencia.

## Siguiente entrega

Corregir primero el mínimo de permiso con evidencia del RPC en datos sintéticos.
Después registrar y portar el contrato de varias estructuras, paredes, equipos,
condiciones, catálogo, costos y factores de zona. Cada fórmula deberá compararse
con la referencia y con el documento guardado. No sustituir el motor completo por
una aproximación visual ni declarar cerrados los dos configuradores por compilar.
