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
| Gastos | Altas, decisiones, correcciones, lotes, recibos, pagador, relaciones, filtros, totales y CSV administrativos probados; [consulta por trabajador](AUDITORIA-GASTOS-POR-TRABAJADOR-20260929.md). Registro unificado de Administración y costos aprobados Workforce publicado y comprobado en 518447a, esquema 057: 496 pruebas, origen/CSV, archivo/restauración/general, permisos, móvil y dieciocho conjuntos preservados. [Evidencia y diferencias](REGISTRO-UNIFICADO-WORKFORCE-20260930.md). IA, confirmación posterior, deuda/reembolso, Labor automática, coordinación contable y otros consumidores del costo siguen pendientes. [Contrato vigente](PARIDAD-GASTOS-WORKFORCE-20260929.md). |
| Trabajadores | Perfiles, encargados, asignaciones y consultas por rol probados; [equipo](AUDITORIA-EQUIPO-WORKFORCE-20260929.md), [roles](AUDITORIA-ROLES-WORKFORCE-20260930.md). Workforce: recibos, doble decisión, general, pagador, corrección/reenvío, versiones de fotos y archivo recuperable comprobados por entregas en staging. [Contrato y evidencias](PARIDAD-GASTOS-WORKFORCE-20260929.md). En 518447a se consulta el costo aprobado desde Gastos y se vuelve al registro exacto; archivo/general afectan el total visible sin duplicar. [Límites](REGISTRO-UNIFICADO-WORKFORCE-20260930.md). Faltan IA/confirmación posterior, deuda/reembolso, Labor y restantes recorridos; no se cierra todo el módulo. |
| Horas | Privacidad propia, marcación y solicitud probadas; consulta de equipo/obras por tres perfiles y revocaciones comprobadas en sesión real ([auditoría del 30](AUDITORIA-ROLES-WORKFORCE-20260930.md)). Faltan delegación de horas de encargados, GPS, cierres y demás reglas vigentes de Campo/Workforce. |
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
