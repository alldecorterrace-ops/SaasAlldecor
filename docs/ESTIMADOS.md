# Estimados: primera implementación

## Funciones

- Crear estimados asociados a clientes activos, buscar y seleccionar productos o añadir líneas libres.
- Bases de precio conservadas del controlador CRM de ADT: área (ft²), longitud (ft), volumen (ft³), unidad, fijo y manual. El importe manual es el total de la línea y no se multiplica por cantidad.
- Cantidades y medidas con hasta tres decimales. Precios, descuento e impuestos con hasta dos. Descuento e impuestos son importes, no porcentajes.
- Totales calculados en PostgreSQL con numeric; vista previa con enteros BigInt. Redondeo por línea, seguido de subtotal menos descuento más impuestos. Los totales recibidos del navegador se ignoran.
- Numeración por empresa y año, con contador transaccional y restricción única. Un intento fallido no consume un número.
- Guardado de cada revisión completa, incluidas líneas y datos del cliente. Los cambios posteriores en Clientes o Productos no reescriben estimados anteriores.
- Listado con filtros de número, estado y fechas; historial paginado, consulta de revisiones y vista de impresión que permite guardar un PDF mediante el navegador.
- Estados habilitados: Borrador, Pendiente, Rechazado y Anulado. La anulación conserva el documento y bloquea futuras ediciones.

## Permisos

Leer o escribir depende del permiso Estimados de la empresa. Para seleccionar un nuevo cliente se necesita lectura de Clientes; para añadir una referencia nueva del catálogo, lectura de Productos. Es posible conservar las referencias históricas de un documento aunque posteriormente se retire el acceso a su catálogo. Las claves compuestas y validaciones impiden referencias entre empresas.

Las tablas no admiten escrituras directas de usuarios autenticados; las mutaciones pasan por `save_estimate`. Las revisiones no pueden borrarse ni actualizarse desde la aplicación. Actividad muestra metadata del documento únicamente a usuarios con permiso de lectura de Estimados.

## Estado y validación

Código preparado y probado. La migración `202609170004_estimates.sql` requiere las migraciones 001 y 002; en el proyecto SaaS la 003 también debe conservarse. **Pendiente aplicar la 004 al proyecto remoto y publicar esta versión de la aplicación**: la conexión del navegador con Supabase dejó de responder durante la preparación.

55 comprobaciones automatizadas aprobaron en conjunto, incluidas fórmulas, redondeo, totales manipulados, numeración, duplicados, aislamiento, permisos, versiones, fechas y anulación. La primera validación de tipos detectó caché incremental obsoleta tras cambiar el target a ES2020; una comprobación limpia pasó. Las pruebas no acreditan todavía el recorrido autenticado de Estimados en el navegador remoto.

## Pendientes

- Aprobación del cliente y su efecto en facturas/proyectos. No se expone aún el estado Aprobado para evitar una aprobación incompleta frente al flujo de ADT, que también genera cuentas por cobrar.
- Envío de correo, firma, enlaces públicos, calendario de anticipos y pagos.
- Configuradores 3D y de pérgola y sus cálculos específicos.
- Aplicación automática de opciones de catálogo. Por ahora se añade el precio base y los ajustes se expresan como líneas separadas.
- Importación histórica, conciliación de numeración y correspondencias de entidades. Antes de importar, resolver colisiones de números entre documentos nuevos e históricos, preservando los números originales y registrando la procedencia.
- Generación PDF en servidor y revisión visual completa de impresión en varios tamaños y navegadores.

No se han importado registros de ADT ni enviado propuestas a clientes. La vista impresa no equivale a factura ni evidencia de pago.
