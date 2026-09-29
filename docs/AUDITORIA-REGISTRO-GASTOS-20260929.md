# Registro de gastos: filtros, totales y CSV

Fecha: 29 de septiembre de 2026. Alcance: código y pruebas sintéticas; la
verificación publicada se añadirá después del despliegue. Producción y migración
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
