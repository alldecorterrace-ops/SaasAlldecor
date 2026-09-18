# Proyectos editables desde ADT

La migración 021 permite incorporar expedientes históricos al módulo Proyectos
con un vínculo permanente al original. No registra una aprobación actual, no
crea estimados ni facturas y no vuelve a contabilizar pagos históricos.

Un proyecto incorporado conserva nombre y fecha. El estado original `Nuevo`
corresponde a `NUEVO`; otros estados necesitan una equivalencia revisada. El
cliente debe tener una ficha operativa enlazada por la migración de clientes.
El estimado histórico debe estar relacionado de forma consistente. No se
deducen fechas de ejecución ni notas que no estén en la fuente revisada.

Dos proyectos pueden tener el mismo nombre y cliente con estimados distintos.
Se conservan separados por su identidad de origen. Compartir el mismo estimado
histórico, o coincidir con un proyecto previo en el destino, requiere revisión.

## Uso

- Proyectos muestra expedientes actuales e incorporados; cada ficha importada
  enlaza al histórico con su estimado, importes y relaciones originales.
- Los administradores disponen de **Revisar migración**, con vistas de
  incorporados y pendientes y los motivos específicos de cada caso.
- Los permisos existentes de Proyectos controlan la consulta y la edición.
- Nombre y notas se editan con control de versión. El requisito de pago para
  programar un inicio o avanzar a producción continúa vigente. Los pagos y
  facturas históricos requieren conciliación para habilitar ese flujo.

## Integridad

La tabla de proyectos exige un estimado actual o una referencia histórica válida
de la misma empresa. La aplicación no puede insertar directamente expedientes
ni modificar las tablas de correspondencia. Los proyectos nuevos continúan
creándose mediante la aprobación atómica de estimados.

La carga administrativa compara la fotografía del destino y las huellas de los
originales, verifica relaciones y campos y registra la procedencia. El lote es
atómico. Repetir exactamente el plan devuelve los resultados existentes sin
sobrescribir las ediciones posteriores. Un cambio concurrente en el destino
detiene la carga antes de incorporar registros.

Los originales, las cantidades reales y el plan permanecen en evidencias
privadas fuera del repositorio público. `tests/operational-projects.test.ts`
cubre aislamiento, permisos, repetición, cambios concurrentes, manipulación de
datos, conservación de vínculos y controles de pagos.

La auditoría visual con sesión real y la conciliación posterior al respaldo
son pasos independientes. No retirar ADT ni considerar completa la migración
financiera por haber incorporado estos expedientes.
