# Gastos por lotes y pagador

Fecha: 29 de septiembre de 2026. Alcance: esquema aditivo 040 y datos sintéticos
en staging. No importa datos ADT ni autoriza producción, pagos o reembolsos reales.

## Contrato contrastado

La interfaz ADT muestra captura por lotes; la copia privada de `CrmController`
confirma `expensePrepareFields` y `expenses`: de 1 a 100 filas, transacción única,
cliente derivado del proyecto, pagador empresa / efectivo de oficina / trabajador.
El trabajador es obligatorio solo para dinero propio; los otros pagadores borran
su asociación. Dinero propio deja reembolso pendiente y el alta administrativa
queda aprobada. Documento y proveedor repetidos en un gasto no anulado se rechazan.
Un reembolso ya pagado impide cambiar importe, trabajador o pagador y anular el
gasto sin reversión contable. La lectura del registro ADT sigue devolviendo 403;
esta evidencia de código e interfaz no equivale a contraste operativo completo.

## Implementación y límites

- `payer` admite desconocido en registros anteriores, sin inventar ni completar
  pagadores históricos. Empresa y caja no conservan trabajador ni reembolso.
- Zelle se incorpora solo a métodos de gastos; los pagos de facturas no cambian.
- Función autenticada para propietario/administrador con permiso de Gastos.
  Cada fila pasa por la validación y auditoría existente. Si alguna falla, se
  revierten todas las filas y el recibo del lote; el error identifica su posición.
- Recibo duradero por empresa, actor, identificador y huella del contenido. Una
  repetición idéntica devuelve los identificadores originales; cambiar el cuerpo
  o el actor usando ese identificador se rechaza. No se reescriben gastos editados
  posteriormente. La URL del lote permite consultar el resultado tras una recarga.
- La interfaz permite añadir, quitar y duplicar filas conservando proyecto y
  trabajador; al duplicar se vacía el número de documento para evitar copiar el
  mismo comprobante. Este detalle se informa en el formulario. Los errores
  conservan los campos para corregir y reintentar.
- Los comprobantes se adjuntan **después** desde cada ficha: queda pendiente la
  carga de recibos dentro del mismo envío del lote que ofrece ADT. También quedan
  pendientes el vínculo automático con Workforce, sus orígenes, filtros por
  pagador/origen, totales mensuales, reversión contable y recorrido del origen.
- No se declara Gastos ni el conjunto de los 21 módulos cerrado.

## Verificación y publicación

Pendiente registrar los resultados finales locales, CI y staging. Las pruebas
incluyen rollback por una fila posterior, relaciones entre empresas, permisos,
reintentos, datos inválidos, documentos repetidos y protección del reembolso
pagado. CI añade PostgreSQL real con ocho solicitudes simultáneas, resultado
perdido, conflicto de contenido, carrera entre documentos y transacción abortada.

Se prepara primero una entrega compatible con pagador y Zelle para retorno;
después se publica la pantalla del lote. No se considera compatible una versión
anterior que no pueda leer un gasto Zelle. La evidencia privada se conserva fuera
de GitHub; el cambio aditivo no altera importes, estados ni relaciones anteriores.
