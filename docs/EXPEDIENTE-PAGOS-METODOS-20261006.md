# Expediente de pagos: métodos admitidos en Facturas

Al abrir Pagos en una ficha ficticia con registros «Not charged.» o «(sin método)»,
la entrega ca4085d mostraba el error de página. El RPC devolvía los registros
correctamente, pero el contrato del expediente rechazaba esos dos valores.
Su tabla también usaba las etiquetas limitadas a métodos de gastos.

La corrección reutiliza el contrato y las etiquetas vigentes de Facturas para
leer los movimientos del expediente. Conserva registros anulados, estados e
importes del RPC y el total aplicado. Crear gastos mantiene su contrato propio;
no incorpora estas opciones de factura al formulario ni a sus escrituras.
No hay cambios de esquema, permisos ni datos.

## Prueba

La regresión usa el RPC nativo y el cargador real con un registro sin método
anulado y otro Not charged registrado, en un conjunto paginado.
Antes de corregirlo, el cargador falla; después, se representa cada etiqueta,
se conservan los estados y el total exacto 210.21, y la paginación no duplica
registros. Una respuesta con método desconocido sigue siendo rechazada.
Se comprueba además que el contrato de creación de gastos rechaza ambos valores.

32 pruebas focalizadas aprobadas: expediente financiero, fichas de cliente,
anulación y documentos comerciales; tipos y lint de los archivos correctos.
Falta el CI del commit publicado y la comprobación de la corrección en staging.

## Anulación y documentos ya comprobados con Administración

Diez GET reales sobre la entrega ca4085d aprobaron: PDF interno anterior y
anulado con bytes y huellas originales; rechazo de ambas revisiones con contexto
de cliente; facturas vigentes del mismo y de otro cliente como controles
positivos; anonimato, empresa/cliente incorrectos y entrada malformada.
Encabezados privados comprobados y sesión temporal eliminada.

En pantalla se comprobaron importes históricos 128.41/50.01/78.40, los dos abonos
asociados a anulación, proyecto Nuevo revisión 1 y documentos del cliente con
la factura vigente y estimados, sin los PDF de la anulada. El fallo de Pagos
impide contar su pantalla como aprobada hasta publicar esta corrección.

Evidencia privada fuera de Git. ADT sigue primario, imports y traspaso suspendidos,
GPS físico aplazado y configuradores/3D excluidos. Estos ensayos no cierran los
otros recorridos comerciales ni los 21 módulos.
