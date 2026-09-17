# Leads, Productos y Actividad

## Fuente contrastada

Se leyeron el controlador CRM y el panel vigente de ADT por SSH, sin ejecutar sus operaciones ni consultar registros de negocio. Las copias de referencia permanecen fuera de Git.

Leads conserva nombre, contacto, dirección, servicio, mensaje, origen, fechas y preferencia de contacto. La pantalla legacy maneja seis estados principales; el controlador también contempla Descartado y Fuera de área. Se mantienen esas variantes para no perder clasificación en una futura importación.

Productos conserva las seis bases de precio (área, lineal, volumen, unidad, fijo y manual), precio en USD, especificaciones, grupos de opciones y ajustes por medida, importe fijo o porcentaje. Las opciones se conservan como configuración; su aplicación a un estimado pertenece al siguiente flujo, todavía pendiente.

## Comportamiento implementado

- Crear, consultar, buscar, filtrar, editar, archivar y restaurar leads y productos; paginación de 20 registros.
- Conversión de lead a cliente en una transacción PostgreSQL. Requiere escritura en ambos módulos; bloquea el lead, conserva su relación y devuelve el mismo cliente al reintentar. No intenta deduplicar personas por nombre o correo.
- Conflictos de edición por versión. Los campos de empresa y autor se asignan en servidor, y los vínculos entre empresas son rechazados.
- Los leads convertidos permanecen como Cliente; modificar después su ficha no cambia automáticamente los datos del cliente.
- Importes de producto con dos decimales; se rechaza precisión adicional antes de que PostgreSQL pueda redondearla silenciosamente. Los ajustes admiten descuentos negativos, conservando el contrato legacy.
- Imágenes privadas de producto en Supabase Storage: PNG/JPEG/WebP hasta 1.5 MB, lectura con permiso de Productos y URL firmada de cinco minutos. Las escrituras requieren el producto y empresa correctos. Los reemplazos y la acción de quitar imagen conservan el objeto anterior; no hay borrado automático.
- Actividad con fecha, módulo, acción y referencia. Los miembros ven solo eventos de módulos autorizados; no reciben los snapshots privados de auditoría ni cambios de permisos. Los responsables conservan su acceso administrativo a la auditoría.

## Operación y pruebas

Aplicar `202609170002_commercial.sql` después de la base inicial y `202609170003_product_images.sql` después del comercial. Ambas son aditivas y transaccionales; no volver a ejecutar las ya aplicadas. La tercera requiere los esquemas nativos de Storage de Supabase. Conservar los objetos y volver a la versión anterior de la aplicación si hay que retirar la interfaz: no borrar tablas como rollback.

Las pruebas PGlite cubren permisos, aislamiento, campos conservados, conversión repetida, registros archivados, conflictos y reglas de imágenes. Para Storage usan un catálogo sintético y las políticas reales de la migración; esto no equivale a probar una subida binaria en el servicio de Supabase.

Las migraciones 002 y 003 se aplicaron al proyecto SaaS. La comprobación posterior confirmó RLS, ausencia de lectura anónima, ausencia de UPDATE directo, bucket privado de 1.5 MB y sus dos políticas. Además se probó en PostgreSQL remoto el flujo lead → cliente, reintento de conversión, producto con opciones y actividad, dentro de una empresa sintética creada en la misma transacción. La prueba terminó en ROLLBACK y devolvió `TRANSACTIONAL_COMMERCIAL_PASS_ROLLED_BACK`: se conservaron las dos empresas existentes y cero clientes/leads/productos. Esta prueba utiliza un contexto SQL autenticado de prueba; no equivale a una sesión real de navegador.

Resultado local: 40 comprobaciones aprobadas, lint y tipos sin errores, compilación correcta. El enlace remoto sirve la nueva versión; las tres rutas nuevas sin sesión redirigen al inicio de sesión.

El propietario confirmó previamente el acceso real a la aplicación y creó empresas. El recorrido autenticado de estos módulos nuevos y la subida real de imágenes siguen pendientes de prueba en su sesión. No se crearon leads o productos ficticios en sus empresas.

## Pendientes de paridad y operación

- Importación de leads web y catálogo histórico con sus IDs, archivos y correspondencias.
- Conexión de Productos con los estimadores y reglas actuales de cálculo.
- Comparación de todos los recorridos legacy, incluidas acciones de comunicación y documentos relacionados.
- Política de retención y limpieza de imágenes anteriores o subidas que quedaron sin vincular por un conflicto de edición. No borrar hasta definir retención y referencias.
- Historial detallado legible y auditoría histórica importada. La vista Actividad actual presenta metadata de cambios nuevos.
