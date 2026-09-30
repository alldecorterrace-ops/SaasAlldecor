# Reenvío de gastos devueltos de Workforce

## Regla y fuente

El controlador ADT privado distingue DEVUELTO/NEEDS_CORRECTION de REJECTED.
La devolución automática procede de resultados IA DUDA/MAL sobre pendientes;
una segunda incidencia después del reenvío corresponde a administración.
Campo permite corregir el gasto propio devuelto, conservando el recibo si no
se reemplaza. Reinicia decisiones y revisión, conserva identidad/creación y
audita EXPENSE_RESUBMITTED. Administración puede corregir NEEDS_CORRECTION.
Esta copia local no certifica por sí sola el PHP actualmente desplegado.

## Alcance del esquema 053

Estado Devuelto para corregir, motivo/fecha de devolución, contador y actor/fecha
del único reenvío. El trabajador activo corrige exclusivamente su gasto propio,
con versión, recibo original verificado, fecha de empresa, importe, categoría,
pagador y obra/general. Fecha no futura y límite de corrección Campo USD 20.000;
el envío nuevo Workforce conserva USD 10.000. Obra requiere asignación en la
fecha corregida. General conserva referencia original y procedencia.

Un reintento idéntico devuelve el resultado registrado; no incrementa nuevamente
el contador. Otro payload/versión se rechaza. Reenvío vuelve a SUBMITTED, elimina
la revisión vigente y las decisiones actuales; todas quedan en historial.
Un segundo devuelto requiere administración. La corrección administrativa 052
se amplía al estado devuelto, sin habilitar rechazados ni aprobados finales.

## Límites abiertos

No se crea un botón administrativo para devolver sin la regla del origen.
La IA y su productor de devoluciones siguen pendientes; los estados usados en
pruebas se preparan explícitamente como fixtures sintéticos, sin atribuirlos a
un proveedor real. No se generan pagos, reembolsos, copias contables ni envíos.
Sustituir foto, conservación y apertura de fotos anteriores, etiquetas libres
administrativas y segundo resultado IA/NEEDS_EDIT siguen pendientes.
No cierra paridad de Campo/Workforce ni los 21 módulos.

## Evidencia

Pendiente de completar con los resultados comprobados de esta entrega.
Los datos, SQL e imágenes de pruebas permanecen fuera de GitHub.
