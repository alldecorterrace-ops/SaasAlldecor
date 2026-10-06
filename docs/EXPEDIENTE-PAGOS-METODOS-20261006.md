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
CI del commit de aplicación `74bdafb438bb05376b5706b1af24cde78efce408`
aprobado: [37524882277](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/37524882277),
867 pruebas, cero fallos, lint, tipos, build, recuperación sintética y concurrencia.

## Publicación y regreso comprobados

Archivo oficial de ese commit contrastado por SHA-256 y seis archivos modificados
respecto de ca4085d comprobados en el hosting. Compilación propia terminada y
procesos observados en sus directorios efectivos, además de la configuración.
Recorrido 74bdafb → ca4085d → 74bdafb completado con sesión administradora.
El primer regreso conservó un proceso del candidato; se detectó la discrepancia
y se usó un segundo grupo de staging antes de contar el regreso como aprobado.
La versión anterior reprodujo el fallo de Pagos y mantuvo los diez controles de
PDF; candidato y versión final representaron los once movimientos, incluidas
las dos etiquetas y los abonos anulados de 19.95 y 30.06. Total aplicado 0.00.
Diez GET de PDFs aprobaron también en candidato y versión final.

Entrega activa: 74bdafb; retorno conservado: ca4085d; grupo final-r2.
Esquema 083 sin migración. Las 91 tablas y 1.380 filas comparadas conservan
conteos y huellas, máximo de auditoría 761 y RPC idénticos; Auth interno queda
fuera de esta comparación. Entorno, lockfile y dependencias compartidas iguales;
salud de staging/producción 200 y configuración de producción sin cambios.
Inventario de hosting: 58 carpetas, seis protegidas y 52 a revisar; cero borradas.
Evidencia privada fuera de Git. Los cambios de documentación posteriores
registran estos resultados; no cambian la aplicación servida del commit citado.

## Anulación y documentos ya comprobados con Administración

Diez GET reales sobre la entrega ca4085d aprobaron: PDF interno anterior y
anulado con bytes y huellas originales; rechazo de ambas revisiones con contexto
de cliente; facturas vigentes del mismo y de otro cliente como controles
positivos; anonimato, empresa/cliente incorrectos y entrada malformada.
Encabezados privados comprobados y sesión temporal eliminada.

En pantalla se comprobaron importes históricos 128.41/50.01/78.40, los dos abonos
asociados a anulación, proyecto Nuevo revisión 1 y documentos del cliente con
la factura vigente y estimados, sin los PDF de la anulada. La pantalla Pagos quedó aprobada después de publicar esta corrección, con
los registros y el total aplicado conservados.

Evidencia privada fuera de Git. ADT sigue primario, imports y traspaso suspendidos,
GPS físico aplazado y configuradores/3D excluidos. Estos ensayos no cierran los
otros recorridos comerciales ni los 21 módulos.
