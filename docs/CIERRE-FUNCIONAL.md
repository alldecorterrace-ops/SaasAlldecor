# Cierre funcional de los 23 módulos

Prioridad del propietario, 25 de septiembre de 2026: comprobar y completar las
funciones de ADT antes de introducir cambios propios del SaaS. Nuevas migraciones
de datos suspendidas hasta petición expresa. Los registros ya incorporados se
conservan. Las pruebas nuevas usan empresas, destinatarios y datos sintéticos.

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
| Clientes | Edición y aislamiento probados; completar expediente y documentos. |
| Productos | Alta, edición y captura de precio probadas; cerrar opciones, especificaciones e integración real con estimadores. |
| Precios | Historial y recálculo explícito probados; completar catálogo, costos y márgenes de ADT. |
| Estimados web | Completar formulario, estados, avisos y relación con lead/diseño actuales. |
| Estimados | Tres revisiones comerciales probadas; cerrar documentos, revisiones, aprobación y comunicaciones. |
| Pérgola sin 3D | Cálculo básico y dos estimados independientes probados; faltan configuraciones, equipos y reglas completas. |
| Nuevo estimado 3D | Faltan geometría avanzada, equipos, despiece y planos; visor rectangular no acredita paridad. |
| Facturas | Pago/reversión y control de importes probados; cerrar documento, anulación, recibo y recorrido completo. |
| Proyectos | Relaciones financieras disponibles; completar estados y expediente con acciones actuales. |
| Gastos | Alta, aprobación, corrección, adjuntos y consulta probados; faltan acciones de Campo y responsables. |
| Trabajadores | Completar identidad operativa, asignaciones, acceso y acciones vigentes de Workforce. |
| Horas | Privacidad propia, marcación y solicitud probadas; faltan encargados, GPS, cierres y reglas vigentes de Campo/Workforce. |
| Permisos | Fechas, búsqueda, aprobación, anulación y adjunto probados; completar contraste con acciones actuales de ADT. |
| Inventario | Entradas, salidas, reversos y unidad histórica probados; contrastar movimientos y documentos reales del origen. |
| Instalaciones | Agenda, superposición, estados y revocación probados; completar responsables y recorridos operativos. |
| Manual de fabricación | Revisiones, aprobación, adjuntos e impresión persistida probados; faltan generación desde diseño y paquete de planos. |
| Mapa de zonas | Motor comparado con PHP; informe, centros, capas, descarga y permisos probados. Ubicación automática sintética publicada y probada en staging b4377d3; consulta real del proveedor y caché comprobadas por separado. Faltan cartografía, contraste visual ADT, casos multibyte y presentación monetaria, bytes CSV/HTTP denegado y ensayo operativo del proveedor. |
| Portal | Completar documentos, fotos, mensajes, enlaces, revocación y aislamiento de cada cliente. |
| IA Assistant | Completar conversaciones, archivos y acciones realmente operativas en ADT, con permisos y efectos controlados. |

## Orden de trabajo

1. Cerrar cartografía, contraste visual, casos restantes del mapa comercial y ensayo operativo del proveedor.
2. Completar configuradores, cálculos, equipos, despiece y planos, siguiendo sus
   dependencias con catálogo, precios, estimados y fabricación.
3. Cerrar recorridos comercial/financiero y operativo de extremo a extremo.
4. Completar Campo/Workforce, portal, comunicaciones e IA contra ADT actual.
5. Repetir matriz de roles, dos empresas, escritorio/móvil, errores y concurrencia.

Este orden no autoriza cobros, mensajes comerciales, nuevas cargas de datos ni
un cambio de autoridad. Recuperación, hosting y traspaso conservan sus pendientes
en el seguimiento general, pero no se confunden con cierre funcional.

Evidencia: [Auditoría de geocodificación](AUDITORIA-GEOCODIFICACION-20260925.md),
[Auditoría del mapa comercial](AUDITORIA-MAPA-COMERCIAL-20260925.md),
[contrato del mapa](PARIDAD-MAPA-20260925.md),
[Manuales y Zonas](AUDITORIA-MANUALES-ZONAS-20260925.md),
[Permisos e Instalaciones](AUDITORIA-PERMISOS-INSTALACIONES-20260925.md),
[auditoría de staging](AUDITORIA-STAGING-20260924.md),
[alcance](ALCANCE-Y-PARIDAD.md).
