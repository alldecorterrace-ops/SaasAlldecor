# Registro de gastos: filtros, totales y CSV

Fecha: 29 de septiembre de 2026. Alcance: código y comprobación con datos
sintéticos en staging, versión 5290274 y esquema 039. Producción y migración
de datos ADT quedan fuera de esta entrega.

## Regla del origen y corrección del inventario

La sesión ADT muestra el registro con búsqueda, fechas, cliente, proyecto,
categoría, origen, pagador, estado y exportación CSV. El formulario indica que
el cliente se completa desde el proyecto. La copia privada del controlador
`expensePrepareFields` confirma que un cliente sin proyecto se rechaza con
`proyecto_requerido_para_cliente`, y que una combinación distinta se rechaza con
`proyecto_cliente_no_coincide`. No corresponde crear un alta directa cliente-gasto
para supuesta paridad. Se corrige el inventario anterior; no se modifica dato alguno.

La lectura del registro ADT devuelve HTTP 403 y el expediente no carga sus gastos.
Sus ceros no prueban ausencia de información. La interfaz y el código permiten
contrastar estas reglas, pero no demuestran equivalencia operativa completa.

## Comportamiento implementado

- Búsqueda literal en proveedor, descripción o documento, fechas inclusivas,
  categoría exacta, estado, proyecto y cliente por identificador.
- Activos excluye anulados. Se conservan los estados nativos pendiente, aprobado,
  rechazado y anulado; activo no significa aprobado ni pagado.
- Total filtrado, total activo y reembolsos pendientes del filtro, calculados en
  PostgreSQL sobre todos los resultados; paginación de 20 registros ordenados por
  fecha e identificador. Resumen y filas comparten una consulta/snapshot.
- CSV completo de la selección, decimales de dos posiciones, UTF-8 con BOM,
  comillas/saltos escapados y protección ante fórmulas de hoja de cálculo. Hasta
  5.000 filas; si se supera, error explícito y petición de refinar el filtro.
- Lectura con la sesión normal y RLS. Gastos exige su permiso; proyecto exige
  Proyectos; cliente exige Clientes y Proyectos. Sin esos permisos se omiten las
  relaciones y se rechazan filtros que pretendan usarlas. No hay credencial
  administrativa, enlace a Storage ni ruta privada de comprobante en el CSV.
- La descarga se autentica en cada petición, sin caché privada reutilizable.
  Error de consulta, filtros inválidos o esquema inesperado nunca se representan
  como una exportación financiera vacía y exitosa.

El esquema 039 es aditivo y solo añade una función de lectura. Los flujos de alta,
aprobación, corrección y comprobantes conservan sus contratos anteriores.

## Pruebas y límites

La base local sintética prueba más de una página, centavos, estados anulados,
fechas inclusivas, búsquedas con `%`, `_`, barra y Unicode, clientes separados
con igual contacto, gastos generales, empresas distintas, permisos parciales y
revocación. Verifica que la lectura no cambie los registros. Un lote local de
5.001 gastos comprueba la negativa de exportación sin truncar. La prueba HTTP
cubre autenticación, validación, falta de acceso, capacidad, fallo de lectura,
esquema inesperado, BOM y cabeceras de privacidad.

Quedan pendientes: carga por lotes atómica, pagador/responsables, orígenes de
Campo/Workforce/labor automática, filtros correspondientes, presentación exacta
de categorías, totales mensuales de ADT y comprobación operativa del origen cuando
su lectura funcione. No se declara el módulo Gastos ni los 21 módulos terminados.

## Publicación y comprobación en staging

Código `52902747df3a3859428f1acfdc15f8a09ecb55a7`, publicado tras
[CI aprobado](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36604122371).
Pasan lint, TypeScript, 395 pruebas y compilación. También pasan las tareas CI de
concurrencia de PostgreSQL y recuperación sintética; esto no sustituye el ensayo
de restauración operativo ni demuestra el objetivo de recuperación de cuatro horas.

El esquema 039 se aplicó con un guard que exige la empresa sintética conocida y
rechaza la empresa de producción. La consulta con el rol `authenticated` del
auditor devuelve una fila y 25.10 al filtrar cliente/fechas; deniega la empresa
donde falta Gastos y una empresa ajena. No se amplió ningún permiso.

En la sesión web del auditor se comprobó:

- Búsqueda de cliente y proyecto desde sus selectores, combinación con documento,
  categoría, estado y fechas; una fila sintética de **$25.10**.
- Filtro de aprobados sin coincidencias y vuelta a pendientes recuperando esa
  misma fila. Un intervalo invertido muestra error, no un total cero válido.
- Reapertura con los filtros conservados en URL y sus valores seleccionados.
- CSV descargado realmente: una fila, ID del gasto correcto, cliente con `ñ`,
  BOM UTF-8 e importe decimal `25.10`, sin rutas privadas de comprobantes.
- Acceso por URL a Gastos en la empresa restringida: página no disponible.
  Descarga sin autenticación: HTTP 401 y `private, no-store`.
- Escritorio y móvil emulado de 390 px; sin desbordamiento horizontal. No es una
  prueba en un teléfono físico.

Las ocho huellas completas comparadas antes y después coinciden: clientes,
estimados, facturas, proyectos, pagos, gastos, registros operativos y adjuntos.
No se crearon gastos ni pagos en staging durante esta entrega. Las ocho
comprobaciones públicas (cuatro por sitio) pasan en staging y producción.

La evidencia binaria, las capturas y las huellas detalladas permanecen en el
archivo privado `.local/closure-20260929/`; no se publican datos del usuario.

## Retorno y retención

Staging queda en `5290274`; retorno comprobado disponible `c66e4ec`. La nueva
entrega enlaza sus dependencias a `c66e4ec/node_modules`, cuyo overlay requiere
también `b149bee`. Se comparó el lockfile antes de compartirlas. El esquema de
lectura es compatible con la entrega de retorno.

Producción conserva `3c0c412`, su proceso y la misma huella de configuración.
Se reutilizaron las dependencias sin instalar otras. El inventario del home pasó
de 584.936 a 586.326 entradas (archivos/directorios), frente a la referencia de
cuota de 600.000; es un recuento del sistema de archivos, no una medición de la
facturación del proveedor. La candidata aporta 927 archivos regulares sin recorrer
los enlaces de dependencias.

No se borraron entregas. `b89ae31` dejó de ser la versión de retorno; junto con
las entregas anteriores fuera de activa/retorno/dependencias requiere revisión
de contenido único y lista exacta antes de eliminación. La retención del hosting
sigue pendiente; no se declara cerrada con este despliegue.
