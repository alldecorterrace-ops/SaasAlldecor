# Proyectos editables desde ADT

La migración 021 permite incorporar expedientes históricos al módulo Proyectos
con un vínculo permanente al original. No registra una aprobación actual, no
crea estimados ni facturas y no vuelve a contabilizar pagos históricos.

Un proyecto incorporado conserva nombre y fecha. El estado original `Nuevo`
corresponde a `NUEVO`. La migración 024 permite conservar `PENDIENTE` como
`PENDIENTE`, sin convertirlo en nuevo, aprobado o en producción. Otros estados
necesitan una equivalencia revisada. El
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

## Resolución posterior de pendientes

La incorporación de un estado ya revisado se realiza mediante un plan privado
separado. No se modifica ni se vuelve a ejecutar el plan inicial de la migración
021. La resolución comprueba el original, el motivo pendiente esperado y la
correspondencia del cliente, y deja constancia en la auditoría.

`PENDIENTE` aparece en el listado, el filtro y el editor. Conserva los mismos
permisos, control de versión y requisito de pago para programar el inicio o
avanzar a producción, instalación o completado. El cambio de catálogo no mueve
por sí solo ningún proyecto ni crea facturas, cobros o aprobaciones.

Aplicar la migración 024 y publicar el código compatible antes de incorporar
proyectos con este estado. La reversión del código debe conservar su etiqueta
y editor compatibles mientras existan proyectos pendientes; no cambiar sus
estados únicamente para volver a una versión anterior.

## Publicación y evidencia

El 18 de septiembre de 2026 se aplicó la migración 021 y se publicó `a989e11`
en el hosting de destino. Se conservaron la entrega anterior y un respaldo de
su configuración. Pasaron 189 pruebas, lint, tipos y compilación local, además
de [GitHub Actions](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/35378511022)
y la compilación del hosting.

La verificación en Supabase comprobó los campos y relaciones incorporados,
la conservación de clientes y originales mediante comparaciones antes/después,
y los permisos de las tablas y del importador. Las empresas y membresías
permanecieron iguales y no se crearon estimados actuales, facturas ni pagos.

Se verificó la revisión del proceso activo y pasaron las comprobaciones HTTP
de salud, recuperación, clientes, proyectos y protección de documentos. La
pantalla nueva redirige al login en el navegador controlado; su auditoría visual
autenticada continúa pendiente.
