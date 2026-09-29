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

Entrega inicial 1ad4cbb publicada y recorrida en staging. CI de aplicación, concurrencia y recuperación sintética aprobados. Se comprobaron cinco estimados, una factura de USD 200.50 con saldo USD 100.25 y su proyecto, apertura desde el expediente y reapertura. En ancho emulado de 390 px, la página no desborda; la tabla permite desplazar las columnas hasta Saldo. El usuario restringido solo ve Estimados incluso solicitando la sección Facturas por URL. Un cliente de otra empresa devuelve HTTP 404. No se cambiaron roles ni registros en estas verificaciones.

El rótulo fijo de Dashboard se corrigió y volvió a verificarse tras publicar la entrega final **9598d35fa781f18b8f981fc5e3113c5b388059ef**: 21 enlaces de menú, 21 módulos en alcance y cero enlaces a los dos configuradores. La factura conserva total y saldo después de la segunda publicación. [CI final aprobado](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36588919593): aplicación (356 pruebas y build), concurrencia y recuperación sintética.
Producción y datos de negocio no forman parte de esta publicación.


## Publicación y límites operativos

- Entorno verificado: staging.alldecorpatio.com. Compilación Webpack en carpeta
  independiente, con un CPU y dependencias compartidas sin modificarlas.
- Aplicación activa: 9598d35; retorno comprobado: 1ad4cbb; dependencias: b149bee.
  Mismo esquema 034, sin nuevas migraciones ni escrituras de negocio.
- Se verificaron proceso activo, SHA publicado, configuración privada preservada,
  permisos del documento web y cuatro rutas públicas de staging con HTTP 200.
- Producción conserva 3c0c412, el mismo proceso y la misma huella de configuración.
  Sus cuatro comprobaciones públicas pasaron antes; su salud volvió a pasar después.
- No se eliminaron carpetas. 2a1e325 y 7017873 quedan identificadas como candidatas
  de retención fuera de activa/retorno; su retirada exige comprobar contenido único,
  dependencias y confirmación de la lista exacta. Esto no certifica la limpieza total
  del hosting ni recuperación RPO/RTO.
- Capturas y resultados detallados permanecen privados. No se registraron pagos,
  se enviaron correos, se cambiaron permisos ni se importaron datos durante la auditoría.

Pendiente para continuar: contraste de Clientes con la sesión actual de ADT
(solicita segundo factor), pagos/gastos, documentos, operaciones e historial
unificado del expediente. Los demás pendientes permanecen en CIERRE-FUNCIONAL.md.
