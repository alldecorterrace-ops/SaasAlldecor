# Expediente de Clientes y alcance vigente

Fecha: 29 de septiembre de 2026.

## Decisión del propietario

El alcance activo queda en **21 módulos**. Pérgola sin 3D y Nuevo estimado 3D,
incluidos sus cálculos geométricos, despiece y planos automáticos, quedan fuera.
Se retiran de la navegación y del destino inicial; el catálogo técnico, los
permisos y enlaces existentes se conservan para no alterar registros históricos.
Productos, Precios, Estimados y Manual de fabricación siguen incluidos.
La migración de datos y el traspaso operativo siguen pausados.

## Acción comercial implementada

La ficha de cliente incorpora secciones de Estimados, Facturas y Proyectos,
con enlaces al documento original, fecha y estado. Los importes y saldos se
leen de las facturas; no se recalculan ni agregan partidas o pagos.

Cada sección exige su permiso propio además del permiso de Clientes. Sin
autorización no se consulta esa tabla, ni su cantidad de registros. La consulta
usa empresa e identificador de cliente; nunca une fichas por nombre, correo
o teléfono. Se incluyen documentos anulados con su estado. Hay paginación de
20 registros y un orden estable; los errores no se presentan como una lista vacía.

## Contraste con ADT y límite de paridad

Referencia: copia privada de adt-modules-v2.jsx, módulo Clientes, pestañas
de estimados, facturas y proyectos. Huella SHA-256 de la copia inspeccionada:

482eebd09a798ffe234eea96e8481e4776771e8f8d63552d4e96b867e9bda989.

Esta es evidencia de código previamente obtenido, no una nueva comprobación de
ADT en ejecución: el acceso actual solicita segundo factor del propietario.
Pagos, gastos, documentos, operaciones e historial unificado del expediente
siguen pendientes de comparación e implementación completa. No se declara
cerrado todo Clientes ni los 21 módulos.

## Validación

Pruebas de lectura sobre PostgreSQL local/PGlite con las 34 migraciones y RLS:
dos empresas, clientes distintos con los mismos datos de contacto, paginación,
revocación, suspensión, módulos restringidos, documentos vinculados y decimales.
Prueba de HTML para enlaces autorizados, escape de nombres y centavos.
Todo usa datos sintéticos; no requiere una migración nueva de esquema. `npm run check` completo: lint, TypeScript, 356 pruebas y compilación aprobados en local.

La publicación y el recorrido autenticado en staging están pendientes al preparar
este documento. Los resultados finales se añadirán tras verificar la entrega.
Producción y datos de negocio no forman parte de esta publicación.
