# Estimados ADT en el módulo principal

La migración 025 añade copias de consulta de estimados históricos revisados al
módulo de Estimados. Conserva número, fecha, estado original, cliente guardado,
partidas, importes, notas y condiciones. La ficha enlaza al original, al cliente
actual y a sus proyectos históricos ya incorporados, según los permisos del lector.

Se admite esta etapa solo para documentos APROBADO o ENVIADO con partidas JSON
propias que coinciden con la selección del histórico, una instantánea de cliente,
importes exactos y correspondencia de cliente en la misma empresa. Documentos
sin partidas, con diferencias, datos ambiguos o cambios recientes en ADT quedan
pendientes. No se convierten estados, inventan partidas ni corrigen importes.

`app_private.import_operational_estimate` es administrativa y está revocada para
los roles de la aplicación. Exige actor gestor autenticado, huella original y
cliente esperado. Repetir un plan conserva la misma copia y revisión; otro plan
para ese original se rechaza. El lote se ejecuta dentro de una transacción.

Las copias se protegen contra edición mediante un trigger, también frente a
llamadas directas de las funciones públicas. No son nuevas propuestas editables:
no generan aprobaciones, proyectos, facturas, pagos, correos ni cambios de
numeración. Los estimados nuevos mantienen su flujo normal. La impresión de
copias muestra los importes guardados sin atribuir cantidades o medidas que no
estén representadas en su detalle original.

Los términos publicados usan una lista explícita de campos de negocio. El JSON
original, metadatos del motor y campos arbitrarios siguen en el archivo privado.
Los porcentajes e importes consignados se presentan como datos del documento;
no acreditan cobro o verificación bancaria.

Antes de cada lote: conservar un respaldo privado, comparar estimados y filas
de partidas con ADT vivo, ensayar en PostgreSQL aislado y en Supabase con
ROLLBACK; después comparar copias, revisiones y registros preexistentes. Usar
una exportación que preserve Unicode y decimales, sin registrar los datos reales
en este repositorio público. Una diferencia en origen requiere conciliar la
versión nueva, no sustituir silenciosamente el histórico ya conservado.

Las pruebas sintéticas cubren importes y condiciones, escape de texto,
metadatos privados, acceso entre empresas y sin módulos, importador privado,
rechazo de fuentes/correspondencias incorrectas, bloqueo de edición/aprobación,
repetición y ausencia de efectos financieros. El ensayo privado incluye la
reversión completa del lote ante un error tardío. Las comprobaciones SQL con
identidad de propietario no sustituyen una sesión real del navegador.

Aplicar solo la migración nueva y publicar la vista compatible antes de cargar
copias. Conservar la aplicación anterior y su configuración para recuperar el
servicio; nunca borrar copias ni volver a estados editables para revertir una
pantalla. Una reversión de código debe mantener la presentación y protección
de los documentos importados, especialmente el estado ENVIADO.
