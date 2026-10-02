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

## Entrega concentrada: puntos 1, 2 y 3

El plan del 1 de octubre se ejecuta con una [matriz única de obligaciones](CIERRE-PUNTOS-1-2-3-20261001.md).
La meta de hoy mantiene paridad completa; las comprobaciones no terminadas siguen
abiertas. Fuente pública del panel renovada y con huella igual al 29 de septiembre.
Solicitudes financieras 05c1bda / esquema 058 publicadas y comprobadas: 504 pruebas,
CI verde, concurrencia PostgreSQL, recorrido sintético y 50 reenvíos sin duplicados.
[Evidencia y límites](AUDITORIA-SOLICITUDES-FINANCIERAS-20261001.md). C15 cerrada;
1 / 65 obligaciones agrupadas de la matriz provisional. Calendario y condiciones
comerciales del esquema 059 publicados y comprobados en d34c358: 511 pruebas,
revisiones, factura sin pagos, PDF históricos y aislamiento. C16 sigue abierto;
[evidencia y límites](CALENDARIO-COMERCIAL-20261001.md).
Los tres bloques permanecen abiertos.

## Cola de verificación

| Módulo                | Evidencia existente / próximo cierre funcional                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dashboard             | Comparar definiciones de indicadores, periodo y navegación con ADT.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Actividad             | Hay evidencia de restricción de horas; falta matriz de eventos y permisos completa.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Configuración         | Invitación y roles por fases probados; falta editor visual, cambios y revocaciones desde UI.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Leads                 | Alta/conversión sintéticas probadas; completar estados, origen web/manual y comunicaciones actuales.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Clientes              | Edición y aislamiento probados; expediente de estimados, facturas y proyectos publicado y comprobado en staging 9598d35. Consulta por identificador, centavos, enlaces, reapertura, móvil emulado y permisos por módulo/empresa verificados; 356 pruebas. Continuación 4c21da6 publicada y auditada: pagos y gastos vinculados a proyectos, totales completos, enlaces, reapertura, móvil emulado y restricciones reales; esquema 035, 364 pruebas y CI aprobado. Historial de cambios unificado publicado y auditado en staging 19eafe1: seis entidades, permisos reales, nota sintética persistida, cursor, enlace al detalle y móvil emulado; esquema 036 y 373 pruebas; [contrato y pruebas](AUDITORIA-HISTORIAL-CLIENTES-20260929.md). Permisos de obra y documentos privados publicados y auditados en staging b89ae31: esquema 037, 380 pruebas, carga/descarga binaria real, archivo/restauración, aislamiento, usuario restringido y móvil emulado; [contrato y límites](AUDITORIA-PERMISOS-CLIENTES-20260929.md). Documentos comerciales nativos publicados y auditados en staging c66e4ec: esquema 038, 387 pruebas, generación/descarga reales, reintento sin duplicado, huellas y saldos preservados; [contrato y límites](AUDITORIA-DOCUMENTOS-COMERCIALES-20260929.md). Se corrigió el pendiente de gasto directo: ADT exige proyecto y deriva de él el cliente; véase el [registro de gastos](AUDITORIA-REGISTRO-GASTOS-20260929.md). Sigue pendiente contraste de plantillas comerciales, fotos del portal, inicio de producción y contraste completo de auditoría del origen. [Evidencia y límites](AUDITORIA-CLIENTES-20260929.md). |
| Productos             | Alta, edición y captura de precio probadas; cerrar opciones, especificaciones e integración con estimados comerciales.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Precios               | Historial y recálculo explícito probados; completar catálogo, costos y márgenes de ADT.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Estimados web         | Completar formulario, estados, avisos y relación con lead/diseño actuales.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Estimados             | Tres revisiones comerciales probadas; PDF nativo inmutable publicado y auditado en c66e4ec. Faltan contraste de plantillas/disparadores de ADT, revisiones, aprobación y comunicaciones completas.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Pérgola sin 3D        | Fuera del alcance por decisión del propietario del 29 de septiembre. Evidencia anterior conservada.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Nuevo estimado 3D     | Fuera del alcance por decisión del propietario del 29 de septiembre. Registros y código previo conservados.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Facturas              | Pago/reversión y control de importes probados; PDF nativo inmutable y consulta desde cliente publicados y auditados en c66e4ec. Faltan plantillas de ADT, anulación, recibo y recorrido completo.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Proyectos             | Relaciones financieras disponibles; completar estados y expediente con acciones actuales.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Gastos                | Altas, decisiones, correcciones, lotes, recibos, pagador, relaciones, filtros, totales y CSV administrativos probados; [consulta por trabajador](AUDITORIA-GASTOS-POR-TRABAJADOR-20260929.md). Registro unificado de Administración y costos aprobados Workforce publicado y comprobado en 518447a, esquema 057: 496 pruebas, origen/CSV, archivo/restauración/general, permisos, móvil y dieciocho conjuntos preservados. [Evidencia y diferencias](REGISTRO-UNIFICADO-WORKFORCE-20260930.md). IA, confirmación posterior, deuda/reembolso, Labor automática, coordinación contable y otros consumidores del costo siguen pendientes. [Contrato vigente](PARIDAD-GASTOS-WORKFORCE-20260929.md).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Trabajadores          | Perfiles, encargados, asignaciones y consultas por rol probados; [equipo](AUDITORIA-EQUIPO-WORKFORCE-20260929.md), [roles](AUDITORIA-ROLES-WORKFORCE-20260930.md). Workforce: recibos, doble decisión, general, pagador, corrección/reenvío, versiones de fotos y archivo recuperable comprobados por entregas en staging. [Contrato y evidencias](PARIDAD-GASTOS-WORKFORCE-20260929.md). En 518447a se consulta el costo aprobado desde Gastos y se vuelve al registro exacto; archivo/general afectan el total visible sin duplicar. [Límites](REGISTRO-UNIFICADO-WORKFORCE-20260930.md). Faltan IA/confirmación posterior, deuda/reembolso, Labor y restantes recorridos; no se cierra todo el módulo.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Horas                 | Privacidad propia, marcación y solicitud probadas; consulta de equipo/obras por tres perfiles y revocaciones comprobadas en sesión real ([auditoría del 30](AUDITORIA-ROLES-WORKFORCE-20260930.md)). Faltan delegación de horas de encargados, GPS, cierres y demás reglas vigentes de Campo/Workforce.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Permisos              | Fechas, búsqueda, aprobación, anulación y adjunto probados. Expediente de cliente y descarga autenticada publicados en b89ae31, con archivo/restauración sintéticos y límites documentados; completar contraste con acciones actuales de ADT.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Inventario            | Entradas, salidas, reversos y unidad histórica probados; contrastar movimientos y documentos reales del origen.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Instalaciones         | Agenda, superposición, estados y revocación probados; completar responsables y recorridos operativos.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Manual de fabricación | Revisiones, aprobación, adjuntos e impresión persistida probados; contrastar recorrido operativo y documentos con ADT. Generación automática desde configuradores y planos fuera del alcance.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Mapa de zonas         | Motor comparado con PHP; informe, centros, capas, descarga y permisos probados. Ubicación automática sintética publicada y probada en staging b4377d3; consulta real del proveedor y caché comprobadas por separado. Presentación monetaria publicada en 50e96d4; descarga autenticada comparada byte por byte, detalle con centavos y rechazos HTTP comprobados (26 septiembre, 328 pruebas). Contraste visual con ADT actual y estilos de tabla comprobados; publicado 7017873. Faltan cartografía externa del SaaS, contrato multibyte y ensayo operativo del proveedor.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Portal                | Completar documentos, fotos, mensajes, enlaces, revocación y aislamiento de cada cliente.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| IA Assistant          | Completar conversaciones, archivos y acciones realmente operativas en ADT, con permisos y efectos controlados.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

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

## Continuación de recibos del 1 de octubre

Registro duradero de IA y confirmación humana publicados en cf8e3d1 / esquema 060.
CI aprobado: 527 pruebas, 47 comparaciones PHP independientes y concurrencia nativa.
Migración con 803 filas anteriores preservadas. Dos recibos y jornada sintéticos,
invalidez de revisión anterior, confirmación humana, reapertura, móvil emulado y
rechazo de empresa restringida comprobados en sesión. Resultados etiquetados como
pruebas de referencia, sin extracción real de proveedor. Pagos y gastos
administrativos conservan sus huellas; confirmar no aprobó ni pagó.
Proveedor real, HEIC, disparadores y matriz completa de perfiles siguen pendientes.
Las filas T13–T15 son Implementada, no Comprobada; el conteo permanece 1 / 65. [Contrato y límites](REVISION-RECIBOS-20261001.md).

## Continuación de reembolsos del 1 de octubre

b312b40 / esquema 061 activa en staging; retorno fb640bd compatible. CI exacto
con 540 pruebas y concurrencia PostgreSQL nativa aprobado. Migración aditiva:
76 conjuntos y 831 registros originales preservados. Sesión real de propietario:
constancia individual, reapertura, archivo/restauración y empresa restringida.
Costo activo $100→$0→$100, deuda $0 y una sola constancia conservada; Pagos y Gastos
administrativos idénticos. Móvil emulado sin desbordamiento; producción sin cambios.
Las aprobaciones de preparación por RPC son evidencia distinta de las pantallas
pendientes de encargado/oficina. Lote en UI, controlador vigente y consumidores
de Labor pendientes. T17–T19 Implementada, conteo **1 / 65**, tres bloques abiertos.
[Contrato, evidencia y límites](REEMBOLSOS-WORKFORCE-20261001.md).

## Labor 062 — entrega parcial comprobada, 1 de octubre

Publicada `f84c5de` en staging con CI aprobado y 563 pruebas; 50 comparaciones
PHP y concurrencia nativa. Tarifa, proyecto, asignación y jornada sintética
comprobados por propietario: costo $250 al reabrir, sin pagos ni copias de gastos.
Móvil emulado y empresa restringida comprobados. [Detalle de pruebas y límites](LABOR-POR-JORNADA-20261001.md).
El registro unificado 063 se publicó desde d28b19f con CI completo y 569 pruebas.
Gastos, proyecto, expediente y CSV muestran la misma conciliación sintética;
móvil emulado y empresa restringida comprobados. Matriz completa e interfaz de
correspondencias aún pendientes.
Tres bloques abiertos, conteo provisional 1/65 obligaciones agrupadas comprobadas.


### Correspondencias de Labor y referencia de Inventario

La corrección de etiqueta del registro de costos se publicó previamente desde
07b9e96, con esquema 063, las tres tareas CI aprobadas y las cuatro comprobaciones
públicas 200. El proceso usa esa raíz exacta; d28b19f conserva retorno compatible.
La interfaz presenta «Labor calculada» y los dos costos sintéticos suman $350.
La configuración y la salud pública de producción se conservaron.

El esquema 064 y la pantalla de correspondencias de Labor se publicaron en staging:
[reglas, evidencia y límites](LABOR-POR-JORNADA-20261001.md). La entrega actual se identifica abajo.

Inventario de ADT se renovó desde su sesión autenticada: el componente inline
`Inventario()` consultado tiene SHA-256
8896a084d4d07ed1b31a0221607390cd0073d042cb1d8a15c662187a1f4f2e43.
El montaje actual elige ese componente; la tabla lee la colección de la pantalla,
la búsqueda no conecta un controlador y «Añadir material» no tiene `onClick`.
Pulsarlo conservó la pantalla, sin formulario ni efecto operativo observado.
Esta evidencia acota la pantalla, no prueba ausencia de otras entradas en el
servidor. O03–O06 siguen abiertos; las operaciones de inventario del SaaS no se
acreditan como equivalentes operativos por imitar esta tabla.

Instalaciones de ADT también se observó autenticado: muestra la descripción
«Calendario, equipo asignado, materiales cargados, checklist de instalación y
firma del cliente» y la etiqueta «Módulo del sistema», sin controles operativos.
No se presupone que esos elementos existan en un servicio por aparecer en la
descripción. Se conserva la agenda del SaaS y O07–O09 permanecen abiertos.

Permisos sí consulta `/permits` y abre un borrador con proyecto, tipo, autoridad,
estado, número, tasa y fechas de envío/aprobación/vencimiento. Se abrió y canceló
el formulario, sin guardar ni quitar registros del origen. El módulo y la
referencia publicada se conservan para el contraste del backend y sus permisos.


### Correspondencias históricas de Labor comprobadas en staging

Activa `1e2735a95bb9b66fd8cf889580cb31189f4d5bce`, retorno `07b9e96`, esquema 064.
CI 36959034936 aprobado con 576 pruebas, compilación y concurrencia nativa.
81 tablas y 867 filas anteriores conservaron sus huellas al aplicar el esquema.
Sesión real del propietario: rechazo de diferencia de un centavo, guardado y
reapertura de correspondencia, actor/fecha/motivo persistidos y costo original
conservado. Proyecto y Gastos muestran tres costos por $350, con CSV privado
coincidente. Móvil emulado y empresa restringida comprobados. No se crearon pagos.
[Evidencia y límites](LABOR-POR-JORNADA-20261001.md).

T21/T22 siguen abiertas por perfiles y recorridos restantes. La evidencia de UI
no sustituye la comprobación física de Campo ni el proveedor real de IA de recibos.
El conteo de obligaciones cerradas sigue 1/65; los tres bloques permanecen abiertos.


### Operaciones duraderas 065 publicadas el 2 de octubre

Activa `42fdad58b364046925cf7b0b68f6ae41618aa68d`, retorno `1e2735a`.
CI 36962519122 aprobado, 584 pruebas y concurrencia nativa; 81 tablas y 870 filas
anteriores preservadas al aplicar la migración aditiva. Inventario, reverso,
descarga binaria, archivo/restauración y revisión de manual comprobados en sesión
de propietario. Empresa ajena rechazada. [Pruebas y límites](OPERACIONES-TRANSACCIONALES-20261001.md).

Los bloques comercial, trabajadores/Campo y operaciones siguen abiertos; el
conteo estricto permanece 1/65 obligaciones agrupadas. La migración de negocio,
traspaso, configuradores, 3D, Portal e IA Assistant siguen fuera de esta entrega.
La IA de recibos continúa incluida y exige comprobación real del proveedor.


### Estado publicado tras proteger descargas operativas

Activa `9de7c8e6ab1a1b19e111b4821ef1812b7dba6fa4`, retorno `42fdad5`, esquema
065. CI 36965028995 completo aprobado, 588 pruebas y compilación. PDF binario
real, petición anónima 401, revocación con formulario abierto, restauración exacta
de membresía/ficha y descarga recuperada comprobados. Permiso recuperado,
instalación programada y rechazo de inicio sin anticipo comprobados. Las huellas
de finanzas y proyectos anteriores se conservaron tras dieciséis solicitudes.
[Evidencia y límites](OPERACIONES-TRANSACCIONALES-20261001.md).

Pendientes explícitos: cuadrilla estructurada y sus superposiciones, matriz de
perfiles y recorridos restantes, contraste completo del backend actual de ADT,
cartografía/proveedor, plantillas/comunicaciones, proveedor real de recibos y
comprobación física de Campo. No se declara ninguno de los tres bloques cerrado.

## Cuadrillas estructuradas · 2 de octubre de 2026

Candidata aditiva 066: selección de colaboradores, agenda por cada integrante,
conservación de revisiones y compatibilidad con formularios anteriores.
[Reglas, referencia y límites](INSTALACIONES-CUADRILLAS-20261002.md).
Las pruebas locales añaden nueve casos; el cierre operativo requiere CI,
publicación en staging y recorridos reales. O07–O09 continúan Implementada,
los tres bloques siguen abiertos y el conteo estricto permanece 1/65.

## Cuadrillas publicadas y comprobadas · 2 de octubre de 2026

Activa `c7bdaf4`, retorno `9de7c8e`, esquema 066; CI 36968793404 completo,
597 pruebas, lint, tipos y compilación correctos. La migración conservó
922 filas de 82 tablas. Propietario guardó y reabrió la cuadrilla; se comprobaron
cruces entre responsables distintos, corrección de la misma solicitud,
cancelación, restauración rechazada por cruce y restauración posterior.
Las seis escrituras nuevas dejaron 22 constancias totales, con huellas de
facturas, pagos, gastos y proyectos intactas. Interfaz móvil a 390 × 844
sin desbordamiento. [Evidencia y límites](INSTALACIONES-CUADRILLAS-20261002.md).

O07–O09 continúan Implementada, abiertas por el contraste del backend y los
perfiles/recorridos restantes. Los tres bloques siguen abiertos, conteo 1/65.
No se reanuda migración de negocio, traspaso, configuradores ni 3D.


## Cartografía aislada · 2 de octubre de 2026

Candidata con banco de empresa sintética, estados de carga/error, timeout y
reintento manual. Lint, tipos, 603 pruebas y compilación locales correctos.
CI, publicación y recorrido del proveedor en sesión pendientes; O15 no cerrada.
[Contrato, referencias y límites](CARTOGRAFIA-AISLADA-20261002.md).
El conteo estricto sigue 1/65 y los tres bloques continúan abiertos.


## Cartografía publicada y comprobada · 2 de octubre de 2026

Activa `ab2307f`, retorno `c7bdaf4`, esquema 066 sin cambio. CI 36971655443
completo, 603 pruebas, lint, tipos y compilación correctos. Diez imágenes reales
OSM y diez recuperadas desde caché; fallo local, reintento, filtros y CSV privado
byte por byte conservados. Móvil 390 x 844 y empresa restringida comprobados;
huellas financieras e instalaciones intactas, 22 constancias operativas.
[Evidencia, referencia y límites](CARTOGRAFIA-AISLADA-20261002.md).
O15 continúa Implementada, abierta por contraste/perfiles completos; O14,
O16 y O17 conservan sus pendientes. Los tres bloques siguen abiertos, 1/65.


## Recorrido comercial y editor · 2 de octubre de 2026

En staging ab2307f / 066: lead guardado, archivo/restauración, conversión repetida
sin duplicar cliente, cuatro revisiones, aprobación repetida con una factura y
proyecto, bloqueo sin anticipo, dos pagos exactos, exceso rechazado, reversos y
anulación conservando documentos. Filas financieras anteriores intactas.
Corrección de impuesto opcional 7% y copia/orden de partidas validada localmente;
067 y su publicación pendientes. [Evidencia y diferencias](RECORRIDO-COMERCIAL-20261002.md).
Conteo estricto 1/65; los tres bloques siguen abiertos por contraste y perfiles.


## Editor comercial publicado · 2 de octubre de 2026

Activa `bfb8e3a`, retorno `ab2307f`, esquema 067; CI 36977920109 completo aprobado,
612 pruebas y carrera nativa de dos tasas con un escritor. Migración aditiva:
984 filas de 82 tablas preservadas, sin rellenar tasa de documentos anteriores.
Propietario guardó y reabrió copia/orden de partidas, cinco revisiones 7%/0%,
factura con 7% capturado y sin pago, PDF anterior byte por byte conservado.
Compatibilidad del documento manual anterior, móvil emulado y empresa ajena
comprobados. Filas financieras y proyectos preexistentes intactos.
[Evidencia y diferencias abiertas](RECORRIDO-COMERCIAL-20261002.md).

Los tres bloques siguen abiertos; conteo estricto 1/65. No se confunde este
recorrido de propietario con la matriz completa, plantillas, comunicaciones,
proveedor de recibos o dispositivo físico. Migración de negocio y traspaso siguen
excluidos; producción y ADT no se modificaron.


## Paginación comercial comprobada · 2 de octubre de 2026

Activa `2aae1ad`, retorno `bfb8e3a`, esquema 067; CI 36981452231 completo,
616 pruebas y compilación correctos. Dos defectos reproducidos antes y corregidos:
Notas y Condiciones no quedan separadas de su cuerpo al cambiar de página.
Propietario generó/descargó dos revisiones aprobadas; cuatro páginas inspeccionadas,
importes y textos completos, originales byte por byte conservados. Finanzas y
proyectos permanecen intactos. [Evidencia y límites](RECORRIDO-COMERCIAL-20261002.md).

C16/C17 y los tres bloques siguen abiertos por plantilla/recibo completo,
comunicaciones, contraste actual y perfiles pendientes. Conteo estricto 1/65.
Se mantiene el trabajo independiente; no se reanuda migración ni traspaso.


## Descuento comercial comprobado · 2 de octubre de 2026

Activa `56fcd98`, retorno `2aae1ad`, esquema 067 conservado. CI 36984639612
completo aprobado: 621 pruebas y carrera real PostgreSQL con un único escritor.
Vista previa y Server Action capturan el descuento al límite del subtotal
observado en ADT. Propietario guardó/reabrió tres revisiones ($107.01, $0.00,
$104.34), consultó originales, verificó móvil emulado y rechazo entre empresas.
15 estimados, 35 revisiones y todos los registros financieros anteriores
preservados. [Evidencia y límites](DESCUENTO-ESTIMADOS-20261002.md).

C11 sigue Implementada; contraste completo y perfiles pendientes. Los tres
bloques permanecen abiertos y el conteo estricto sigue 1/65. El ensayo de total
cero cubre borradores y no acredita aprobación de una factura de total cero.


## Pagos en PDF de factura comprobados · 2 de octubre de 2026

Activa `e12b272`, retorno `56fcd98`, esquema aditivo 068; CI 36987975871
completo aprobado, 628 pruebas y carrera real entre pago y preparación de PDF
con esperas observadas en ambos órdenes. Migración conserva 1.019 filas de 82
tablas. Propietario generó y descargó cinco revisiones (sin pagos, anticipo,
pagada y dos reversos), sin duplicar factura/proyecto/pagos/documentos. Ocho
páginas reales inspeccionadas, recibos/PDF anteriores idénticos byte por byte y
registros financieros anteriores conservados. Móvil emulado y pantalla de
factura ajena rechazados. [Evidencia y límites](PAGOS-EN-PDF-FACTURA-20261002.md).

C19 Implementada; recibo separado, métodos/perfiles y comunicaciones pendientes.
La prueba de URL privada ajena quedó limitada por el navegador, no acredita una
respuesta de la aplicación. Los tres bloques siguen abiertos; conteo estricto
1/65. ADT principal, sin migración de negocio ni traspaso, sin operación financiera
real ni envíos externos de staging.

## Zelle en Facturas · 2 de octubre de 2026

Activa b064fa3 / esquema aditivo 069, CI completo aprobado con 634 pruebas.
Método Zelle conservado en factura, pago y PDF; repetición y concurrencia sin
duplicados. Recorrido de propietario y reverso sintéticos comprobados en staging,
tres páginas PDF y conservación de documentos y registros anteriores verificadas.
Migración conserva 1.060 filas de 82 tablas. [Evidencia y límites](ZELLE-FACTURAS-20261002.md).

C19 continúa Implementada: opciones restantes del origen, recibo separado,
perfiles y comunicaciones pendientes. Los tres bloques siguen abiertos; 1/65
obligaciones agrupadas de la matriz provisional. ADT sigue principal.
