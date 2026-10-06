# Cierre vigente de los 21 módulos · 6 de octubre de 2026

Este registro sustituye como entrada de seguimiento los conteos históricos de
ESTADO-IMPLEMENTACION, CIERRE-FUNCIONAL y CIERRE-PUNTOS-1-2-3. Sus antecedentes
se conservan. La matriz antigua de 65 obligaciones no se usa para calcular un
porcentaje actual sin reconciliar cada fila con los ensayos del 5 y 6 de octubre.

Alcance: 21 módulos, sin configuradores/3D. GPS físico aplazado por el propietario.
Nuevos imports de negocio y traspaso siguen suspendidos. ADT mantiene la operación.
La implementación y el CI no equivalen al cierre completo de un módulo.

## Avances comprobados por acción

| Recorrido                                                   | Evidencia de entrega                                                                                             | Estado de cierre                                                                                 |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Factura, abonos, saldo, anulación y PDF de Enviar por email | 072 y continuación comercial del 5 de octubre; correo técnico recibido y PDF abierto, confirmado por propietario | Recorrido probado; no queda recibo separado por desarrollar                                      |
| Estimados y expediente con perfil comercial restringido     | Sesiones, revisiones, aprobación restringida, PDFs y repetición del 5 de octubre                                 | Parcial; permisos/escenarios completos aún abiertos                                              |
| Restauración de Precios                                     | 074, historial, cancelar, restaurar, aislamiento y retorno del 5 de octubre                                      | Acción comprobada; no certifica todo el catálogo                                                 |
| Horas administrativas y costos diarios                      | Sesión del 5 de octubre: descansos, solicitudes, cierre/reapertura, Labor sin duplicar por segundo turno         | Parcial; resto de incidencias y consumidores abiertos                                            |
| Resumen de días y horas, propio/equipo                      | Contratos PARIDAD-HORAS-RESUMEN y PARIDAD-HORAS-EQUIPO y actas del 5 de octubre                                  | Acciones comprobadas con límites de perfil                                                       |
| Campo: propuesta, salida declarada y decisiones             | 080 y sesiones del 6 de octubre; historial y registros ficticios anulados                                        | Acciones comprobadas; no es GPS físico                                                           |
| Jornada completa desde Administración                       | 081 y sesión administradora del 6 de octubre: entrada, salida y descanso                                         | Comprobada; no se añade a Trabajador                                                             |
| Encargado: asignar/quitar obra actual                       | 081, sesiones Encargado/Trabajador, retorno y datos conservados                                                  | Acciones comprobadas; no modifica asignación administrativa ni aprueba Labor                     |
| Campo: visitas con cuatro motivos                           | 082, bbaba51, PR 8, CI 856 pruebas; sesión Encargado y RPC con ubicación sintética                               | Publicada en staging; catálogo ampliado por 083                                                  |
| Cliente/dirección/fecha de catálogo                         | 083, 88d209c, PR 9, CI 864 pruebas; SQL nativo y sesión Encargado                                                | Publicada y probada en staging; dirección durante jornada ya abierta queda fuera de esta entrega |

## Pendientes por módulo

| Módulo                | Cierre restante                                                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard             | Definiciones de indicadores, periodos, totales y navegación frente a ADT                                                          |
| Actividad             | Matriz completa de eventos y visibilidad por permisos                                                                             |
| Configuración         | Editor visual, cambios y revocaciones, invitaciones y escenarios restantes                                                        |
| Leads                 | Estados, origen web/manual y comunicaciones actuales                                                                              |
| Clientes              | Contraste restante de expediente/documentos y auditoría del origen; rechazo HTTP de descarga ajena comprobado el 6 de octubre     |
| Productos             | Opciones/especificaciones y escenarios restantes de captura en estimados                                                          |
| Precios               | Catálogo/costos/márgenes operativos y perfiles restantes                                                                          |
| Estimados web         | Formulario, estados, avisos y relación con Leads frente al origen vigente                                                         |
| Estimados             | Plantillas/disparadores, revisiones y comunicaciones restantes                                                                    |
| Facturas              | Escenarios/perfiles restantes, documentos privados y estados vinculados tras anulación; el PDF de correo requerido ya se comprobó |
| Proyectos             | Estados y acciones actuales; ausencia de cancelación automática por anulación contrastada con ADT vigente                         |
| Gastos                | Proveedor real de recibos, HEIC, reembolso/conciliación y demás consumidores sin duplicación                                      |
| Trabajadores          | Escenarios restantes de perfiles, asignaciones y costos; no repetir acciones ya comprobadas arriba                                |
| Horas y solicitudes   | Escenarios restantes de jornadas, permisos, costos y periodos; catálogo ampliado por 083 y GPS físico aplazado                    |
| Permisos              | Contraste de acciones vigentes y perfiles restantes                                                                               |
| Inventario            | Movimientos/documentos frente al origen y perfiles restantes                                                                      |
| Instalaciones         | Recorridos operativos y perfiles restantes; agenda/cuadrilla/superposiciones ya implementadas y parcialmente probadas             |
| Manual de fabricación | Recorrido y documentos operativos; generación desde 3D excluida                                                                   |
| Mapa de zonas         | Filtros/categorías/centros, contrato multibyte, exportación y perfiles; cartografía real/caché ya probadas parcialmente           |
| Portal del cliente    | Contrastar/completar documentos, fotos, mensajes, enlaces, revocación y aislamiento                                               |
| IA Assistant          | Contrastar/completar conversación, archivos y acciones operativas con permisos y efectos controlados                              |

Estos pendientes mezclan diferencias de implementación y comprobaciones faltantes.
No se afirma que cada función esté ausente: hay que contrastar el origen y el
recorrido completo antes de cambiar código o marcarla cerrada.

## Preparación operativa y publicación final

- Recorrer la matriz de roles y dos empresas, escritorio/Android, errores,
  desconexión, reenvíos y aislamiento. Cada prueba debe identificar su nivel:
  local, SQL nativo, sesión web, dispositivo o destinatario.
- Ensayar respaldo/restauración reales de base/Auth, archivos privados y hosting;
  recepción de alertas y carga observada. El CI de recuperación no sustituye
  una restauración operativa.
- Hosting: entrega 083 registra 56 carpetas, seis protegidas y 50 a revisar.
  No se ha aplicado toda la retención; inventario y autorización específica
  antes de cualquier eliminación permanente.
- Consolidar una entrega final publicada, CI y retorno compatible.
- Solo tras petición expresa: imports y conciliación de negocio; después,
  aprobación separada del traspaso operativo. No son acciones autorizadas por
  este registro ni por una petición genérica de continuar.

## Orden de esta continuación

1. Catálogo 083 completado y probado en staging: búsqueda por cliente, nombre,
   UUID, fecha y dirección; selección por cliente y enlace de indicaciones.
   La fecha sirve para buscar, sin añadir un filtro nuevo. Publicación y regreso
   88d209c → bbaba51 → 88d209c comprobados con la sesión del Encargado.
   Se conservan las otras 1.378 filas originales; solo se añadió dirección al
   cliente ficticio del ensayo y su evento de auditoría. Sin marcación nueva,
   GPS físico, imports ni traspaso. Evidencia de entrega en el
   [PR 9](https://github.com/alldecorterrace-ops/SaasAlldecor/pull/9).
2. Privacidad de documentos publicada y comprobada en staging: 867 pruebas, nueve GET, regreso compatible y 1.380 filas conservadas; evidencia en [PR 10](https://github.com/alldecorterrace-ops/SaasAlldecor/pull/10). Anulación y expediente: reglas del controlador ADT vigente contrastadas, 22 pruebas focalizadas, RLS/RPC nativos y cuatro GET con cuenta restringida aprobados; contrato y límites en [COMERCIAL-ANULACION-EXPEDIENTE-20261006](COMERCIAL-ANULACION-EXPEDIENTE-20261006.md). Diez GET con Administración y pantallas de factura, proyecto y documentos aprobados. La pantalla Pagos detectó un contrato desactualizado de métodos: reproducción y corrección local en [EXPEDIENTE-PAGOS-METODOS-20261006](EXPEDIENTE-PAGOS-METODOS-20261006.md), pendiente de publicar y comprobar en staging. Continúan los demás escenarios comerciales y perfiles.
3. Cerrar proveedor de recibos, Portal/IA y los demás recorridos operativos.
4. Verificación integral de los 21 módulos y preparación operativa.
