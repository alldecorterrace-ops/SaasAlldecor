# Zelle en Facturas · 2 de octubre de 2026

## Regla de origen y alcance

La fuente vigente de ADT `adt-modules-v2.jsx`, SHA-256
ff0058234ef4b418b219903dc63e7f2e501fde36b3c83f390916d31174d90df8,
incluye ZELLE en METHODS y envía el método seleccionado al crear el pago.
El SaaS ya admitía Zelle en Gastos, pero lo omitía en Facturas y en su RPC.
Se añade ZELLE al contrato del formulario, CHECK de pagos y record_payment.
Los cinco códigos anteriores conservan sus valores; ningún pago histórico se
reclasifica. Registrar el pago es una anotación administrativa, no una transferencia.

Quedan por confirmar las reglas del backend vigente de ADT para «Not charged.»
y «sin método». No se atribuyen a esas opciones efectos financieros sin evidencia.
Esta entrega no acredita todavía paridad completa de métodos ni recibo separado.

## Pruebas y publicación

Commit exacto b064fa3ccbc7d9c361415153c105de50a432bc4a, publicado en GitHub.
Lint, tipos, 634 pruebas y compilación aprobados localmente y en CI
[36991191538](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36991191538).
Los tres jobs completos pasaron, incluida concurrencia real en PostgreSQL.

La prueba carga el esquema anterior, crea pagos/documentos anteriores y aplica
069: sus filas, constancias y snapshots permanecen idénticos. Los seis códigos
persisten; reintentar una solicitud conserva método, centavos, versión y auditoría.
Cambiar el método con el mismo identificador es un conflicto. Empresa ajena,
lector y acceso revocado no pueden registrar/repetir el efecto. El PDF recoge
Zelle; el reverso afecta solo a revisiones posteriores y no borra pagos anteriores.
Estas pruebas de permisos son contratos de base; los perfiles reales completos
siguen pendientes de la matriz.

PostgreSQL nativo ejecutó ocho reintentos simultáneos del mismo pago Zelle,
con un solo pago y una constancia duradera. Rechazó un escritor obsoleto y un
reintento con importe cambiado, preservando centavos, método y auditoría.
También pasaron las carreras entre pago y generación de PDF en ambos órdenes.

## Staging y recorrido autenticado

Esquema aditivo 069 aplicado exclusivamente a SaasAlldecor-Staging con guardas
de empresa/esquema y comparación dentro de la transacción: **1.060 filas de
82 tablas anteriores intactas**. Huella del archivo de migración:
5e700c1f22576c4cf2fc24929be227ca4a47573d4b6d8baf42879668d4d187aa.
Código activo b064fa3; entrega anterior e12b272 conservada. Dependencias y entorno
privado idénticos, raíz/proceso y cuatro rutas de staging comprobados. Salud y
huella de configuración de producción permanecen correctas.

El propietario en la empresa sintética registró $10.43 por Zelle en una factura
de $104.34, guardó/reabrió, generó y descargó PDF r6. Saldo parcial $93.91.
Después registró el reverso y generó PDF r7: pagado $0.00, saldo $104.34.
Un solo nuevo pago, ahora VOID v2, mantiene método, referencia, motivo y actor.
La factura permanece OPEN v7; el proyecto y el estimado no se modificaron.

Tres páginas reales de los dos PDF renderizadas e inspeccionadas. r6 contiene
fecha, Zelle, referencia, notas y cantidades correctas; r7 excluye el pago revertido.
r6 volvió a descargarse tras el reverso y conservó SHA-256
eb1c5ec1ebdbd1b8af0bd7628ecebec467dac04cf6620122b21b95a67792660f.
La primera revisión anterior a 069 también volvió a descargarse byte por byte
idéntica. r7: e84cb1e2588a33002c1e9c831263afa452ec08acebf96759b8bb32bf26a3a91b.

Consulta independiente posterior: las otras ocho facturas, los diez pagos
anteriores y los dieciocho documentos originales conservaron sus huellas.
Proyectos, gastos, estimados y sus revisiones permanecieron intactos. Solo se
añadieron el pago sintético y dos documentos, con los dos cambios de versión
esperados de esta factura. Sin cobro, transferencia ni envío externo real.
Escritorio 1280 px y móvil emulado 390 px sin desbordamiento de página; la tabla
conserva su desplazamiento horizontal en móvil. No acredita dispositivo físico.

## Límites y recuperación

e12b272 se conserva como retorno del código anterior y es compatible con el
esquema aditivo, sin pérdida ni recálculo de datos. Su interfaz anterior no
ofrece ni etiqueta Zelle en la tabla de Facturas; no se declara retorno con
paridad de esa capacidad nueva. La recuperación de esa capacidad requiere
republicar b064fa3 desde GitHub. No hubo retorno real después del cambio.

C19 sigue Implementada: recibo separado, opciones pendientes del origen,
perfiles y comunicaciones siguen abiertos. Los tres bloques siguen abiertos;
conteo estricto 1/65 obligaciones agrupadas de la matriz provisional. ADT
principal, migración de negocio y traspaso aplazados. Evidencia privada fuera
de GitHub. Sin borrados de hosting; la petición concreta de 52 elementos sigue
pendiente, con dependencias y aaf268c protegidos.
