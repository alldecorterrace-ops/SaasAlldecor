# Migración y verificación

Estado: procedimiento propuesto; **no se ha exportado ni importado la base real**.

## Invariantes

- All Decor Terrace será la empresa destino de sus registros actuales.
- Conservar identificadores de origen mediante correspondencias, relaciones, fechas, importes, estados, documentos y auditoría.
- No combinar registros por igualdad de nombre ni contar dos veces datos reflejados en CRM y Workforce.
- Los datos reales y archivos privados no se guardan en GitHub.
- ADT sigue siendo el sistema operativo durante el desarrollo. El cambio definitivo se prepara después del ensayo y la reconciliación.

## Preparación

1. Completar catálogo de pantallas/acciones y metadatos de tablas, campos, claves y archivos.
2. Identificar fuentes duplicadas, campos JSON, documentos externos y operaciones pendientes.
3. Obtener un respaldo consistente de base y archivos, y probar su restauración en un entorno aislado.
4. Definir mapeos por entidad y empresa, con preservación de campos aún no modelados.
5. Preparar acceso a Supabase y Storage en un entorno de pruebas identificado.

## Importación

Registrar cada lote con versión, origen, checkpoint, hash, resultados y conflictos. Una correspondencia única por empresa, sistema de origen, entidad e ID permite reintentar sin duplicados.

Importar dependencias en orden: configuración y catálogos, clientes/leads, estimados, proyectos, facturas/pagos, trabajadores y asignaciones, horas/aprobaciones, gastos y otros dominios según relaciones reales. El orden definitivo se obtiene del esquema.

Adjuntos mediante manifiesto de origen/destino, tamaño, MIME, SHA-256 y relación. Resolver correctamente ubicaciones privadas de Drupal. La copia de PostgreSQL no incluye los objetos almacenados en Storage: respaldar también sus archivos, conforme a [Supabase: respaldos](https://supabase.com/docs/guides/platform/backups).

Usuarios: conservar correspondencia con la identidad operativa. El mecanismo de incorporación a Supabase Auth se decide tras revisar el formato de autenticación existente; no prometer compatibilidad automática de contraseñas. Las sesiones y tokens anteriores no forman parte de la importación ordinaria.

Bancos e integraciones tienen procedimiento separado para consentimiento, secretos y reconexión cuando corresponda. No importar una cola histórica como si fueran tareas nuevas por ejecutar.

## Reconciliación

Comparar conteos, claves/relaciones, importes, saldos por factura, pagos/anulaciones, gastos, minutos trabajados, estados y archivos. Igualar el número de filas no basta.

Cada diferencia tendrá causa y resolución documentadas. La importación debe poder detenerse y reanudarse sin perder datos ni sobrescribir cambios posteriores del SaaS.

Comprobar dos empresas ficticias: denegación de lectura/escritura cruzada, acceso a fotos/exportaciones, cambios de permisos, tareas de fondo y cola offline. Los módulos también requieren pruebas de sus operaciones críticas y su interfaz.

## Corte y recuperación

Ensayar primero con un destino aislado. Para el corte real: definir fuente de escritura, ventana controlada, captura del delta, reconciliación final y desactivación de emisores duplicados.

No confiar solo en `updated_at` sin demostrar que cubre correcciones, anulaciones y eliminaciones. Tratar también las acciones offline pendientes.

Antes de nuevas operaciones, una reversión puede consistir en mantener el origen. Después de escribir en el SaaS, conservar y reconciliar esas operaciones antes de volver; restaurar un respaldo anterior puede perder datos recientes.

## Criterio de entrega completa

Los 23 módulos y sus dependencias identificadas deben tener acciones implementadas, permisos probados, datos y archivos reconciliados y evidencia de uso. Una integración que requiera autorización del propietario debe figurar expresamente como pendiente hasta completar una prueba real.

La entrega final exige evidencia de funcionamiento de la nueva aplicación. La documentación inicial, un menú completo o una base vacía no cumplen ese criterio.
