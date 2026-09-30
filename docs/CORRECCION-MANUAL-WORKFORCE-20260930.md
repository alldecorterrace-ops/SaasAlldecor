# Corrección manual de gastos de Workforce

## Contrato de referencia

La copia privada de la interfaz ADT observada el 29 de septiembre y el controlador
local separan extracción IA, confirmación humana y pago. `exp_reviewed` exige
IA final antes de confirmar. `expenseAdminEdit` permite a administración corregir
un gasto pendiente/devuelto, con motivo, y deja una revisión manual independiente
de la IA. Para su copia Workforce reinicia encargado y oficina. No aprueba ni paga.
Esta fuente no acredita por sí sola el PHP actualmente desplegado.

## Alcance de esta entrega

Esquema aditivo 052 y corrección para oficina/administración de gastos SUBMITTED o
FOREMAN_APPROVED. Fecha de empresa (guardada a las 12:00 locales, como ADT), importe,
categoría, descripción, obra/general y pagador. Motivo obligatorio de 5 a 500
caracteres. El límite manual del origen es USD 20.000; se amplía la restricción de
almacenamiento, conservando USD 10.000 para envíos nuevos de trabajadores.

Se conserva el recibo original y se verifica su binario antes del guardado web.
La revisión queda vinculada a sus identificador/huella y a los datos corregidos,
con usuario, fecha y motivo. Los anteriores siguen pendientes de revisión;
no se genera una confirmación retroactiva. Las aprobaciones anteriores quedan en
el historial y se reinician en el registro vigente. Motivo, versión e idempotencia
se verifican transaccionalmente; la autorización se reevalúa después de esperas
por bloqueos. Un reintento no repite efectos. No se escribe un pago ni copia contable.

## Diferencias y pendientes abiertos

Esta entrega no reemplaza la foto, no implementa IA ni su confirmación humana
posterior y no habilita reembolsos. La corrección de DEVUELTO/NEEDS_CORRECTION sigue
pendiente: el estado REJECTED existente no se equipara automáticamente con ellos.
La interfaz conserva las categorías de Workforce; queda el contraste de etiquetas
libres administrativas. Obra general conserva la referencia original para
trazabilidad. La comprobación de versión vigente es estricta; futuras actualizaciones
IA necesitarán separar metadatos de cambios de evidencia antes de introducirlas.
No se declara paridad completa de editar/revisar ni de los 21 módulos.

## Validación

Resultados de código, concurrencia y sesión real pendientes de documentar tras
verificarlos. Datos y evidencia detallada se mantienen fuera de GitHub.
