# Cierre funcional de los 21 módulos del alcance activo

Prioridad del propietario, 25 de septiembre de 2026: comprobar y completar las
funciones de ADT antes de introducir cambios propios del SaaS. Nuevas migraciones
de datos suspendidas hasta petición expresa. Los registros ya incorporados se
conservan. Las pruebas nuevas usan empresas, destinatarios y datos sintéticos.

**Cambio aprobado el 29 de septiembre de 2026:** Pérgola sin 3D y Nuevo
estimado 3D quedan fuera del proyecto. Se excluyen también sus pendientes de
geometría, estructuras, equipos dentro del diseño, despiece y planos automáticos.
Los expedientes, estimados ya guardados y manuales/documentos operativos se
conservan. El catálogo técnico anterior se mantiene por compatibilidad; el menú,
Dashboard y acceso inicial muestran 21 módulos. Los enlaces antiguos y permisos
existentes se conservan, sin ampliar accesos.

«Comprobado» requiere misma acción, rol, entradas, reglas, resultado, persistencia
y documento final cuando corresponda. Cada diferencia queda identificada;
una pantalla, un cálculo aislado o un build no cierran un módulo. Los pilotos de
ADT se distinguen de funciones operativas. La condición multitenant y la seguridad
se conservan, sin copiar accesos globales del sistema anterior.

## Cola de verificación

| Módulo | Evidencia existente / próximo cierre funcional |
| --- | --- |
| Dashboard | Comparar definiciones de indicadores, periodo y navegación con ADT. |
| Actividad | Hay evidencia de restricción de horas; falta matriz de eventos y permisos completa. |
| Configuración | Invitación y roles por fases probados; falta editor visual, cambios y revocaciones desde UI. |
| Leads | Alta/conversión sintéticas probadas; completar estados, origen web/manual y comunicaciones actuales. |
| Clientes | Edición y aislamiento probados; expediente de estimados, facturas y proyectos publicado y comprobado en staging 9598d35. Consulta por identificador, centavos, enlaces, reapertura, móvil emulado y permisos por módulo/empresa verificados; 356 pruebas. Continuación 4c21da6 publicada y auditada: pagos y gastos vinculados a proyectos, totales completos, enlaces, reapertura, móvil emulado y restricciones reales; esquema 035, 364 pruebas y CI aprobado. Historial de cambios unificado publicado y auditado en staging 19eafe1: seis entidades, permisos reales, nota sintética persistida, cursor, enlace al detalle y móvil emulado; esquema 036 y 373 pruebas; [contrato y pruebas](AUDITORIA-HISTORIAL-CLIENTES-20260929.md). Permisos de obra y documentos privados publicados y auditados en staging b89ae31: esquema 037, 380 pruebas, carga/descarga binaria real, archivo/restauración, aislamiento, usuario restringido y móvil emulado; [contrato y límites](AUDITORIA-PERMISOS-CLIENTES-20260929.md). Documentos comerciales nativos publicados y auditados en staging c66e4ec: esquema 038, 387 pruebas, generación/descarga reales, reintento sin duplicado, huellas y saldos preservados; [contrato y límites](AUDITORIA-DOCUMENTOS-COMERCIALES-20260929.md). Se corrigió el pendiente de gasto directo: ADT exige proyecto y deriva de él el cliente; véase el [registro de gastos](AUDITORIA-REGISTRO-GASTOS-20260929.md). Sigue pendiente contraste de plantillas comerciales, fotos del portal, inicio de producción y contraste completo de auditoría del origen. [Evidencia y límites](AUDITORIA-CLIENTES-20260929.md). |
| Productos | Alta, edición y captura de precio probadas; cerrar opciones, especificaciones e integración con estimados comerciales. |
| Precios | Historial y recálculo explícito probados; completar catálogo, costos y márgenes de ADT. |
| Estimados web | Completar formulario, estados, avisos y relación con lead/diseño actuales. |
| Estimados | Tres revisiones comerciales probadas; PDF nativo inmutable publicado y auditado en c66e4ec. Faltan contraste de plantillas/disparadores de ADT, revisiones, aprobación y comunicaciones completas. |
| Pérgola sin 3D | Fuera del alcance por decisión del propietario del 29 de septiembre. Evidencia anterior conservada. |
| Nuevo estimado 3D | Fuera del alcance por decisión del propietario del 29 de septiembre. Registros y código previo conservados. |
| Facturas | Pago/reversión y control de importes probados; PDF nativo inmutable y consulta desde cliente publicados y auditados en c66e4ec. Faltan plantillas de ADT, anulación, recibo y recorrido completo. |
| Proyectos | Relaciones financieras disponibles; completar estados y expediente con acciones actuales. |
| Gastos | Alta, aprobación, corrección, adjuntos y consulta probados. Registro filtrado, totales completos y exportación CSV publicados y comprobados en staging 5290274, esquema 039: 395 pruebas, CI aprobado, filtros reales, descarga binaria, móvil emulado, permisos y ocho huellas de tablas preservadas. [Contrato y límites](AUDITORIA-REGISTRO-GASTOS-20260929.md). Lotes administrativos y pagador publicados y comprobados en staging b8b2861, esquema 040: 403 pruebas, error sin filas parciales, reintento, relaciones, CSV y retorno compatible verificados. [Evidencia](AUDITORIA-LOTES-GASTOS-20260929.md). Comprobantes dentro del lote publicados y comprobados en staging 4a60de4, esquema 041: 413 pruebas, rechazo sin filas parciales, corrección con archivos conservados, carga/descarga de 7 MiB, huellas y retorno comprobados. [Evidencia y límites](AUDITORIA-COMPROBANTES-LOTES-20260929.md). Recibos individuales, indicadores mensuales/globales y pagador publicados y comprobados en 0545710, esquema 043: 423 pruebas, duplicado rechazado, 7 MiB/PDF, reintentos, preservación, CSV, móvil emulado y retorno; [recibos](AUDITORIA-RECIBOS-INDIVIDUALES-20260929.md), [indicadores](AUDITORIA-INDICADORES-GASTOS-20260929.md). Trabajador asociado opcional y búsqueda por fecha/categoría/relaciones publicados y comprobados en 604fbe5, esquema 045: 425 pruebas, lote real sintético, sin reembolso espurio, CSV, móvil, restricciones, once huellas previas y retorno real; [evidencia](AUDITORIA-RELACIONES-GASTOS-20260929.md). Corrección de guardado individual y consulta por trabajador publicadas en 3c567f9, esquema 046: 430 pruebas, CI aprobado, dos guardados con datos de negocio preservados, consulta desde ficha, CSV y móvil; [evidencia](AUDITORIA-GASTOS-POR-TRABAJADOR-20260929.md). Faltan integración y duplicados de Campo/Workforce, origen Labor automática, reversión contable y contraste operativo completo; [reglas vigentes](PARIDAD-GASTOS-WORKFORCE-20260929.md). |
| Trabajadores | Consulta de gastos asociados desde ficha por ID, totales y CSV publicada y probada en 3c567f9; no mezcla nombres iguales ni equipara asociación con deuda. [Evidencia y límites](AUDITORIA-GASTOS-POR-TRABAJADOR-20260929.md). Base de perfiles, encargados y asignaciones publicada en 80adf3d, esquema 047: 440 pruebas, CI con concurrencia, propietario real, guardar/reabrir, solapamiento rechazado, finalización móvil, historial, aislamiento y once huellas preservadas. [Evidencia y límites](AUDITORIA-EQUIPO-WORKFORCE-20260929.md). Faltan sesiones reales de los roles nuevos, integración de acciones y demás recorridos de Workforce. |
| Horas | Privacidad propia, marcación y solicitud probadas; faltan encargados, GPS, cierres y reglas vigentes de Campo/Workforce. |
| Permisos | Fechas, búsqueda, aprobación, anulación y adjunto probados. Expediente de cliente y descarga autenticada publicados en b89ae31, con archivo/restauración sintéticos y límites documentados; completar contraste con acciones actuales de ADT. |
| Inventario | Entradas, salidas, reversos y unidad histórica probados; contrastar movimientos y documentos reales del origen. |
| Instalaciones | Agenda, superposición, estados y revocación probados; completar responsables y recorridos operativos. |
| Manual de fabricación | Revisiones, aprobación, adjuntos e impresión persistida probados; contrastar recorrido operativo y documentos con ADT. Generación automática desde configuradores y planos fuera del alcance. |
| Mapa de zonas | Motor comparado con PHP; informe, centros, capas, descarga y permisos probados. Ubicación automática sintética publicada y probada en staging b4377d3; consulta real del proveedor y caché comprobadas por separado. Presentación monetaria publicada en 50e96d4; descarga autenticada comparada byte por byte, detalle con centavos y rechazos HTTP comprobados (26 septiembre, 328 pruebas). Contraste visual con ADT actual y estilos de tabla comprobados; publicado 7017873. Faltan cartografía externa del SaaS, contrato multibyte y ensayo operativo del proveedor. |
| Portal | Completar documentos, fotos, mensajes, enlaces, revocación y aislamiento de cada cliente. |
| IA Assistant | Completar conversaciones, archivos y acciones realmente operativas en ADT, con permisos y efectos controlados. |

## Orden de trabajo

1. Completar expediente de clientes y recorridos comerciales con catálogo,
   estimados, documentos, aprobación, facturas y proyectos, sin configuradores.
2. Cerrar cartografía, contrato multibyte y ensayo operativo del proveedor del mapa.
3. Cerrar recorridos financieros y operativos de extremo a extremo.
4. Completar Campo/Workforce, portal, comunicaciones e IA contra ADT actual.
5. Repetir matriz de roles, dos empresas, escritorio/móvil, errores y concurrencia.

Este orden no autoriza cobros, mensajes comerciales, nuevas cargas de datos ni
un cambio de autoridad. Recuperación, hosting y traspaso conservan sus pendientes
en el seguimiento general, pero no se confunden con cierre funcional.

Evidencia: [Paredes independientes](AUDITORIA-PAREDES-20260926.md),
[Configurador y motor](AUDITORIA-CONFIGURADOR-20260926.md),
[Presentación y exportación del mapa](AUDITORIA-MAPA-20260926.md),
[Auditoría de geocodificación](AUDITORIA-GEOCODIFICACION-20260925.md),
[Auditoría del mapa comercial](AUDITORIA-MAPA-COMERCIAL-20260925.md),
[contrato del mapa](PARIDAD-MAPA-20260925.md),
[Manuales y Zonas](AUDITORIA-MANUALES-ZONAS-20260925.md),
[Permisos e Instalaciones](AUDITORIA-PERMISOS-INSTALACIONES-20260925.md),
[auditoría de staging](AUDITORIA-STAGING-20260924.md),
[alcance](ALCANCE-Y-PARIDAD.md).
