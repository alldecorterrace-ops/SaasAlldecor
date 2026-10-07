# Cierre vigente: Gastos y Comercial · 6 de octubre de 2026

Este registro sustituye como entrada de seguimiento los conteos históricos de
ESTADO-IMPLEMENTACION, CIERRE-FUNCIONAL y CIERRE-PUNTOS-1-2-3. Sus antecedentes
se conservan. La matriz antigua de 65 obligaciones no se usa para calcular un
porcentaje actual sin reconciliar cada fila con los ensayos del 5 y 6 de octubre.

Decisión vigente del propietario: IA queda excluida. Continuar únicamente los
dos primeros bloques de la lista de seis: **Gastos y costos** y **Comercial**.
Operaciones, Administración, Portal y preparación integral quedan fuera de esta
continuación, sin retirar sus funciones ni modificar sus datos. El catálogo
histórico se conserva; el menú de trabajo tiene 20 módulos, sin IA ni 3D.
GPS físico continúa aplazado.
Nuevos imports de negocio y traspaso siguen suspendidos. ADT mantiene la operación.
La implementación y el CI no equivalen al cierre completo de un módulo.

## Matriz vigente de los dos bloques: cierre del 7 de octubre

Esta matriz sustituye los pendientes genéricos de las notas anteriores para
el alcance solicitado. Los inventarios restantes se mantienen como historia,
sin ampliar el trabajo a los otros cuatro bloques.

| Acción acordada | Estado y nivel de evidencia | Acta |
| --- | --- | --- |
| Recibos/manual sin IA, HEIC, lote y reembolso sin duplicar costo | Publicado; CI, SQL nativo y sesión administradora. Registro ficticio, sin pago real | [Gastos sin IA](GASTOS-SIN-IA-20261006.md), [Lote y consumidores](GASTOS-LOTE-CONSUMIDORES-20261007.md) |
| Labor/gastos por proyecto, cliente, exportación y periodo | 630.33 reconciliado por consumidores; periodos 350 / 250 / 30.33 y filas originales conservadas | [Lote y consumidores](GASTOS-LOTE-CONSUMIDORES-20261007.md) |
| Formulario web, fecha/preferencia, seis estados de Lead, archivo/restauración y cliente único | Publicado; referencia del CRM renovada, SQL nativo, sesión y dos MIME privados | [Contacto web](COMERCIAL-CONTACTO-WEB-20261006.md), [Avisos](FORMULARIO-AVISOS-20261007.md) |
| Aviso interno configurable por empresa, destinatario congelado y repetición | 087; CI, denegaciones y capturas privadas. Entrega externa desactivada | [Avisos](FORMULARIO-AVISOS-20261007.md) |
| Productos/precios, seis bases, ajuste descriptivo, captura y ficha archivada | 18 combinaciones contrastadas, sesión del catálogo, revisión/PDF/MIME 239.09 conservados tras cambio de ficha | [Catálogo](CATALOGO-CAPTURA-20261007.md), restauración 074 acreditada el 5 de octubre |
| Estimados: revisión, estados, condiciones, correo y perfil restringido | 086; CI, SQL nativo, sesión owner y member, MIME/PDF exactos e históricos de solo lectura | [Correo](ESTIMADOS-CORREO-20261007.md), [Identidad y perfil restringido](IDENTIDAD-COMERCIAL-20261007.md) |
| Factura, pagos/saldo, métodos de ADT, anulación y vínculos del expediente | Fuente actual, CI, SQL nativo, sesiones y documentos privados; sin cancelar Proyecto automáticamente | [Anulación/expediente](COMERCIAL-ANULACION-EXPEDIENTE-20261006.md), [Métodos](EXPEDIENTE-PAGOS-METODOS-20261006.md) |
| PDF de Enviar por email e identidad/contacto/pie por empresa | 088, 917 pruebas CI, SQL nativo, owner/member, PDF/MIME, versiones y retorno real. Recibo solicitado ya aclarado; no recibo independiente pendiente | [Identidad](IDENTIDAD-COMERCIAL-20261007.md) |

No quedan funciones pendientes de implementación identificadas en estos
recorridos contrastados de Gastos/costos y Comercial. Se conservan los límites
de prueba por acción; no se certifican todas las combinaciones imaginables
de perfiles ni el conjunto de 20 módulos por esta matriz o por el CI.
Correos actuales se probaron como captura privada; el único correo técnico
real previo tiene recepción y apertura del PDF confirmadas por el propietario.
Identidad y operación reales, IA, GPS, los otros cuatro bloques, imports y
traspaso no se convierten en pendientes de esta continuación.

Entrega activa de aplicación: 2f73ee0, esquema 088. Retorno validado: 676a658.
Documentación posterior no requiere volver a compilar la aplicación si el
diff respecto de ese commit se limita a docs.

## Avances comprobados por acción

| Recorrido                                                   | Evidencia de entrega                                                                                             | Estado de cierre                                                                                 |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Factura, abonos, saldo, anulación y PDF de Enviar por email | 072 y continuación comercial del 5 de octubre; correo técnico recibido y PDF abierto, confirmado por propietario | Recorrido probado; no queda recibo separado por desarrollar                                      |
| Estimados y expediente con perfil comercial restringido     | Sesiones, revisiones, aprobación restringida, PDFs y repetición del 5 de octubre                                 | Recorridos específicos acreditados; ver matriz vigente y límites de prueba                                              |
| Restauración de Precios                                     | 074, historial, cancelar, restaurar, aislamiento y retorno del 5 de octubre                                      | Acción comprobada; no certifica todo el catálogo                                                 |
| Horas administrativas y costos diarios                      | Sesión del 5 de octubre: descansos, solicitudes, cierre/reapertura, Labor sin duplicar por segundo turno         | Parcial; resto de incidencias y consumidores abiertos                                            |
| Resumen de días y horas, propio/equipo                      | Contratos PARIDAD-HORAS-RESUMEN y PARIDAD-HORAS-EQUIPO y actas del 5 de octubre                                  | Acciones comprobadas con límites de perfil                                                       |
| Campo: propuesta, salida declarada y decisiones             | 080 y sesiones del 6 de octubre; historial y registros ficticios anulados                                        | Acciones comprobadas; no es GPS físico                                                           |
| Jornada completa desde Administración                       | 081 y sesión administradora del 6 de octubre: entrada, salida y descanso                                         | Comprobada; no se añade a Trabajador                                                             |
| Encargado: asignar/quitar obra actual                       | 081, sesiones Encargado/Trabajador, retorno y datos conservados                                                  | Acciones comprobadas; no modifica asignación administrativa ni aprueba Labor                     |
| Campo: visitas con cuatro motivos                           | 082, bbaba51, PR 8, CI 856 pruebas; sesión Encargado y RPC con ubicación sintética                               | Publicada en staging; catálogo ampliado por 083                                                  |
| Cliente/dirección/fecha de catálogo                         | 083, 88d209c, PR 9, CI 864 pruebas; SQL nativo y sesión Encargado                                                | Publicada y probada en staging; dirección durante jornada ya abierta queda fuera de esta entrega |

## Inventario histórico por módulo (no amplía el alcance vigente)

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
| Gastos                | Revisión visual sin IA publicada; reembolso/conciliación y consumidores restantes sin duplicación                                 |
| Trabajadores          | Escenarios restantes de perfiles, asignaciones y costos; no repetir acciones ya comprobadas arriba                                |
| Horas y solicitudes   | Escenarios restantes de jornadas, permisos, costos y periodos; catálogo ampliado por 083 y GPS físico aplazado                    |
| Permisos              | Contraste de acciones vigentes y perfiles restantes                                                                               |
| Inventario            | Movimientos/documentos frente al origen y perfiles restantes                                                                      |
| Instalaciones         | Recorridos operativos y perfiles restantes; agenda/cuadrilla/superposiciones ya implementadas y parcialmente probadas             |
| Manual de fabricación | Recorrido y documentos operativos; generación desde 3D excluida                                                                   |
| Mapa de zonas         | Filtros/categorías/centros, contrato multibyte, exportación y perfiles; cartografía real/caché ya probadas parcialmente           |
| Portal del cliente    | Contrastar/completar documentos, fotos, mensajes, enlaces, revocación y aislamiento                                               |
| IA Assistant          | Excluido por decisión del propietario; conservar historial, sin activación                                                        |

Estos pendientes mezclan diferencias de implementación y comprobaciones faltantes.
No se afirma que cada función esté ausente: hay que contrastar el origen y el
recorrido completo antes de cambiar código o marcarla cerrada.

## Preparación operativa anterior (fuera de esta continuación)

- Recorrer la matriz de roles y dos empresas, escritorio/Android, errores,
  desconexión, reenvíos y aislamiento. Cada prueba debe identificar su nivel:
  local, SQL nativo, sesión web, dispositivo o destinatario.
- Ensayar respaldo/restauración reales de base/Auth, archivos privados y hosting;
  recepción de alertas y carga observada. El CI de recuperación no sustituye
  una restauración operativa.
- Hosting: inventario actualizado el 6 de octubre registra 59 carpetas, seis protegidas y 53 a revisar.
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
2. Privacidad de documentos publicada y comprobada en staging: 867 pruebas, nueve GET, regreso compatible y 1.380 filas conservadas; evidencia en [PR 10](https://github.com/alldecorterrace-ops/SaasAlldecor/pull/10). Anulación y expediente: reglas del controlador ADT vigente contrastadas, 22 pruebas focalizadas, RLS/RPC nativos y cuatro GET con cuenta restringida aprobados; contrato y límites en [COMERCIAL-ANULACION-EXPEDIENTE-20261006](COMERCIAL-ANULACION-EXPEDIENTE-20261006.md). Diez GET con Administración y pantallas de factura, proyecto y documentos aprobados. La pantalla Pagos detectó un contrato desactualizado de métodos: corrección 74bdafb publicada en staging y comprobada con Administración, once movimientos y total aplicado conservados, diez GET de PDFs en candidato/retorno/final, regreso real y 1.380 filas intactas; evidencia en [EXPEDIENTE-PAGOS-METODOS-20261006](EXPEDIENTE-PAGOS-METODOS-20261006.md) y [PR 12](https://github.com/alldecorterrace-ops/SaasAlldecor/pull/12). Continúan los demás escenarios comerciales y perfiles.
3. Conversión HEIC/HEIF para recibos publicada en staging: CI de 873 pruebas, seis pruebas de conversión alojadas, imagen sintética de 12 MP, pantalla administradora y regreso real; originales conservados. El proveedor real sigue desactivado y sin configurar. Contrato en [RECIBOS-HEIC-20261006](RECIBOS-HEIC-20261006.md). IA ya no forma parte del cierre solicitado; Portal y demás recorridos quedan fuera de esta continuación.
4. Prioridad actual: revisión manual de recibos, reembolsos y costos; después, escenarios comerciales. La verificación integral y preparación operativa no forman parte de esta continuación.

## Avance en los dos bloques autorizados

Gastos sin IA publicado y probado en staging: revisión visual independiente,
884 pruebas CI, contrato 084 sin backfill, ensayo nativo de reembolso sin copia
de costo (rollback), original HEIC idéntico y regreso real. Contrato, pruebas de
sesión y límites en [GASTOS-SIN-IA-20261006](GASTOS-SIN-IA-20261006.md) y
[PR 14](https://github.com/alldecorterrace-ops/SaasAlldecor/pull/14).
Esto cierra el bloqueo de revisión por dependencia de IA; no certifica todos
los consumidores de costos ni todo Comercial.

Comercial: fecha de cita y preferencia de contacto publicadas y comprobadas
entre formulario público, revisión y Lead: 891 pruebas CI, 085 sin backfill,
SQL nativo y sesión administradora ficticia, formulario de ensayo revocado,
retorno real 269e8cb → 8f14054 → 269e8cb, pagos/gastos y recibos protegidos
conservados. Contrato y límites en
[COMERCIAL-CONTACTO-WEB-20261006](COMERCIAL-CONTACTO-WEB-20261006.md) y
[PR 15](https://github.com/alldecorterrace-ops/SaasAlldecor/pull/15).
No implica el cierre de todos los avisos o del módulo comercial completo.

### Pendientes registrados antes de la continuación del 7 de octubre

1. Gastos y costos: completar conciliación/reembolsos por los perfiles vigentes
   y comprobar los consumidores de horas/gastos/costos de proyecto y periodos.
   El contrato nativo de un único costo tras reembolso ya pasó; no repetirlo
   como si faltara implementarlo ni presentar ese ensayo como pago real.
2. Comercial: avisos y estados de Leads/formulario, captura restante de
   productos/precios en estimados, plantillas y comunicaciones de estimados,
   y escenarios/perfiles de Facturas que no estén acreditados por entregas
   anteriores. Fecha/preferencia del formulario ya no son pendientes.

Los otros cuatro bloques y la IA no forman parte de esta continuación.

## Continuación del 7 de octubre

Lote sin IA y consumidores/periodos de costos comprobados en staging; referencias
ADT vigentes renovadas y privadas, 33 pruebas pertinentes, 1.405 filas originales
conservadas, sin pagos ni segunda ficha. Acta:
[GASTOS-LOTE-CONSUMIDORES-20261007](GASTOS-LOTE-CONSUMIDORES-20261007.md).
Este recorrido deja de figurar como implementación ausente. Los niveles SQL,
pruebas locales y sesión administradora están distinguidos en el acta.

Correo de Estimados publicado y comprobado: aplicación e25191b, contrato 086,
899 pruebas CI, estados/repetición SQL nativos, captura MIME/PDF en sesión,
regreso real y 1.434 filas pre-captura conservadas. Contrato y límites en
[ESTIMADOS-CORREO-20261007](ESTIMADOS-CORREO-20261007.md), PR 16. Captura desde
catálogo y renderizado del PDF de esta revisión acreditados; no declarar todo
catálogo o todas las plantillas revisadas. Continúa el contraste de avisos y
estados Leads/formulario, sin reabrir funciones ya acreditadas.

## Estado después de Avisos y captura de catálogo

Avisos del formulario por empresa publicados en staging, 087 sin backfill,
910 pruebas CI, permisos/repetición SQL nativos, dos MIME privados y recorrido
visual de los seis estados de Lead, archivo/restauración y conversión única.
Configuración interna elegida por el propietario, destinatario anterior
congelado y formulario ficticio desactivado. Regresos reales y privacidad
no-referrer de Avisos/Estimados comprobados. Acta:
[FORMULARIO-AVISOS-20261007](FORMULARIO-AVISOS-20261007.md), PR 17.

Captura de catálogo, cambio/archivo de ficha y revisión conservada comprobados
en la misma entrega: EST-2026-0017, total 239.09, dos revisiones, PDF y captura
MIME idénticos a sus hashes guardados. El ajuste de opción no se añade fuera
del configurador, según el editor general contrastado. Acta:
[CATALOGO-CAPTURA-20261007](CATALOGO-CAPTURA-20261007.md).

El contraste posterior convirtió el pendiente de plantillas en una diferencia
concreta: identidad comercial por empresa. 088 la resuelve y tiene acta propia,
incluida la sesión comercial restringida. La matriz vigente al principio de
este registro reúne los recorridos comprobados y sus límites. No usar las
listas históricas como una nueva lista de funciones ausentes.

## Solicitud posterior de puesta en marcha, 7 de octubre

El propietario solicita el alta de administrador global -> gerentes invitados ->
empresas propias -> equipo con roles. Es un flujo posterior al cierre de Gastos
y Comercial, con validación y publicación independientes. El traslado de datos
de ADT sigue descartado. Véase [Administración global](ADMINISTRACION-GLOBAL-20261007.md).
