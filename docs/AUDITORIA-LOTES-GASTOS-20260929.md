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

Pasan lint, tipos, compilación y 403 pruebas locales. CI de la versión compatible
[c2609e9](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36607230150)
y del formulario [b8b2861](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36607232939)
aprobados en sus tres tareas: aplicación, concurrencia y recuperación sintética.
Esto no acredita restauración operativa ni los objetivos de cuatro horas.

El esquema 040 se aplicó únicamente en staging con guardas de empresa y esquema.
Los dos gastos anteriores conservan todos sus campos y pagador desconocido;
coinciden las ocho huellas previas, excluyendo solo la nueva columna nullable.
Se rechazan llamadas del auditor a la empresa restringida y a la empresa ajena.
El historial de migraciones de staging solo registraba hasta 034 aunque las
funciones 035–039 ya estaban aplicadas y comprobadas; se registra 040 con su SQL
exacto. Conciliar esas entradas anteriores sigue pendiente, sin reaplicarlas.

Las pruebas
incluyen rollback por una fila posterior, relaciones entre empresas, permisos,
reintentos, datos inválidos, documentos repetidos y protección del reembolso
pagado. CI añade PostgreSQL real con ocho solicitudes simultáneas, resultado
perdido, conflicto de contenido, carrera entre documentos y transacción abortada.

Se publicó primero una entrega compatible con pagador y Zelle para retorno;
después se publicó la pantalla del lote. No se considera compatible una versión
anterior que no pueda leer un gasto Zelle. La evidencia privada se conserva fuera
de GitHub; el cambio aditivo no altera importes, estados ni relaciones anteriores.


## Recorrido autenticado y resultado publicado

Staging queda en `b8b28610837b81d1da64db44c80f7c136f26e931`, con esquema 040.
En la sesión del auditor como propietario de la empresa sintética se comprobó:

1. Creación de un trabajador ficticio sin cuenta vinculada, correo saliente ni
   remuneración real. Búsqueda y selección desde la fila del lote.
2. Duplicar una fila conserva proyecto, trabajador, importe, método y descripción;
   deja vacío el documento. Cambiar a efectivo de oficina o empresa retira el
   trabajador. Los tres proyectos se conservan en los registros resultantes.
3. Documento ya existente en la fila 2: mensaje específico y cero inserciones.
   La base conserva dos gastos anteriores y cero lotes; los campos del formulario
   permanecen disponibles para corregirlos.
4. Corregir solo ese documento: tres gastos aprobados, **60.06** en total,
   **10.01** con pagador trabajador y reembolso pendiente; **20.02** de efectivo
   oficina y **30.03** de empresa, ambos sin trabajador ni reembolso aplicable.
   Se registró un solo recibo de lote con los tres identificadores.
5. Recarga de la URL del lote: muestra el resultado guardado sin crear nuevas
   filas. El registro filtrado y CSV real muestran exactamente esos tres gastos,
   sus pagadores, un solo nombre de trabajador y los mismos centavos. Descarga
   UTF-8 con BOM comprobada por contenido; no se confunde con enlace disponible.
6. Ruta del lote en una empresa donde el auditor no tiene Gastos: página no
   disponible. Las comprobaciones SQL autenticadas también rechazan esa empresa
   y una ajena; no se ampliaron roles ni permisos.
7. Formulario en escritorio y móvil emulado de 390 px, sin desbordamiento
   horizontal. No se acredita ensayo en un dispositivo físico.

Se conservan las ocho huellas de los registros previos: clientes, estimados,
facturas, proyectos, pagos, los dos gastos originales, registros operativos y
adjuntos. En gastos se compara todo el contenido anterior excluyendo únicamente
la columna aditiva `payer`; ambas filas anteriores siguen con pagador nulo.
Las únicas altas de negocio de esta prueba son el trabajador sintético y los
tres gastos del lote, junto con sus registros de auditoría y recibo. No se
crearon pagos ni reembolsos y no se importó ningún dato ADT.

## Retorno probado y retención pendiente

Se ensayó el retorno real `b8b2861 → c2609e9` después de guardar el lote: la ficha
del trabajador muestra correctamente Zelle, 10.01, aprobado y reembolso pendiente.
El expediente del cliente carga los cuatro gastos, total **85.16**, con 60.06
aprobados y los 25.10 anteriores pendientes. Después se restituyó `b8b2861`.
El retorno disponible queda en `c2609e901724315a1f9913521b49d938ca262eb5`.

Las dos entregas comparten `c66e4ec/node_modules`, cuyo overlay depende de `b149bee`;
se conservaron esos directorios y se verificó el lockfile sin instalar dependencias.
Las candidatas aportan 932 y 946 archivos regulares. El home pasa de 586.326 a
589.139 entradas frente a la referencia de cuota de 600.000. Es recuento de
archivos/directorios, no certificación de cuota del proveedor. `5290274` deja de
ser necesaria como activa o retorno, pero no se borra sin inventario de contenido
único y confirmación exacta. La limpieza acumulada sigue pendiente.

Producción conserva `3c0c412`, su proceso y la huella de configuración original.
Pasan las cuatro comprobaciones públicas de cada sitio. Evidencia de navegador,
CSV, consultas, huellas y scripts de retorno: archivo privado `.local/closure-20260929/`.
