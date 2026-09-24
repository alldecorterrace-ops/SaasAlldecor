# Auditoría autenticada de staging: 24 de septiembre de 2026

Entorno: https://staging.alldecorpatio.com. Primera sesión de propietario creada
e iniciada por el titular; su contraseña no se recibió ni se guardó en el proyecto.
Todas las escrituras siguientes usan empresas y contactos ficticios. Los identificadores,
consultas y evidencias detalladas se conservan fuera de GitHub.

## Recorridos comprobados en la aplicación publicada

- Crear dos empresas desde Tus empresas, entrar en sus paneles y cambiar entre ellas.
- Crear un cliente por empresa; editar y reabrir su ficha. Nombre, dirección,
  notas, correo y teléfono ficticios aparecen de nuevo en ficha/listado.
- El listado de A estaba vacío tras crear el cliente B; después muestra solo su
  cliente A. El propietario tiene acceso a ambas: esto no demuestra todavía
  aislamiento frente a un usuario sin membresía. Abrir la ficha A bajo la ruta
  de empresa B devuelve «Página no disponible», sin mostrar sus datos.
- Clientes con nombre largo: a 390 × 844, ancho de documento y cuerpo de 390 px;
  tabla de 514 px dentro de un contenedor de 348 px con desplazamiento interno.
  Las capturas del navegador integrado no conservaron una escala visual útil;
  la evidencia de tamaño es del DOM renderizado. Falta la comprobación en teléfono real.
- Cambiar la zona horaria de A y recargar: conserva America/Chicago.
- Crear una invitación desde Configuración y revocarla: pasa de Pendiente a
  Revocada y conserva «Sin intentos de correo registrados». Los envíos externos
  permanecen desactivados. No demuestra entrega ni aceptación por otro perfil.
- Actividad muestra las altas, ediciones, cambio de empresa y la invitación
  creada/revocada, con la zona horaria correspondiente.

## Recorrido comercial y financiero sintético

Desde la sesión de propietario se creó un estimado para el cliente A con una
partida de tres unidades a 33,35 USD: subtotal 100,05, descuento 0,10, impuestos
2,05 y total 102,00. Guardado y reapertura conservaron datos e importes.

Una aprobación explícitamente marcada como simulación creó una factura y un
proyecto enlazados, sin registrar pagos automáticamente. La factura mostró el
total de 102,00 y saldo de 102,00. El intento de registrar 103,00 fue rechazado
por superar el saldo, sin crear un pago. Un registro ficticio posterior de 30,00,
método Otro y referencia de simulación, dejó estado Pago parcial y saldo 72,00.
No hubo cobro, transferencia, envío comercial ni autorización de un cliente real.

El proyecto enlazado muestra los mismos importes; pasó a Planificación con fechas
de prueba y conservó estado, fechas y notas después de recargar. La vista imprimible
del estimado muestra estado Aprobado, revisión 2 y los importes correctos. No se
exportó un PDF ni se comprobó impresión física en este recorrido.

Incidencia descubierta de interfaz: al devolver el error de sobrepago, `FinanceForm`
restablece sus campos (incluidos importe, método y referencia) a los valores
iniciales. No altera el saldo, pero obliga a reintroducir los datos. Debe conservar
la entrada ante un rechazo y limpiar únicamente tras el éxito. La corrección de
código cancela el restablecimiento automático salvo cuando la acción confirma un
guardado; [React documenta ese restablecimiento de campos no controlados](https://react.dev/reference/react-dom/components/form).
La entrega `e1187ec1549a09b0a2f001aa128e7410a8f53f28` pasó 274 pruebas, lint,
tipos, compilación y los tres jobs de [CI](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36044709994).
Se publicó únicamente en staging. El proceso activo y sus dependencias se
verificaron; conserva cinco hilos. Producción conserva su proceso y ambas rutas
de salud responden 200 con `Cache-Control: no-store`.

Con la segunda cuenta en perfil administrador, un intento de 73,00 sobre saldo
72,00 fue rechazado conservando importe, fecha, método, referencia y notas.
Cambiar solo el importe a 1,00 creó un único pago ficticio y dejó saldo 71,00;
el formulario se limpió después del éxito. La reversión administrativa de ese
registro conservó importe, referencia y motivo, y devolvió el saldo a 72,00.
La base confirma el pago anterior de 30,00 aplicado y el de 1,00 revertido.
Queda cerrada esta incidencia de restablecimiento de campos en el caso ensayado.
Faltan anulación de factura y concurrencia financiera completa por navegador.

El titular creó e inició sesión con la segunda cuenta sintética. Esta aceptó la
invitación desde Tus empresas y entró sin módulos. No hubo intentos de correo.

## Segunda cuenta: perfiles, revocación y horas

Se utilizó la misma cuenta autenticada por fases, con permisos preparados mediante
`set_member_access` en una transacción SQL con identidad del propietario y guardas
del entorno sintético. Esto comprueba las restricciones desde una sesión real,
pero no equivale a cinco cuentas simultáneas ni a completar el editor visual de
permisos del propietario.

- **Sin módulos:** menú vacío; Clientes, Configuración y una ruta de la segunda
  empresa rechazados como «Página no disponible».
- **Administrador:** Configuración muestra la invitación aceptada y protege la
  cuenta del propietario. Pago, reversión, alta de trabajador y vinculación a la
  cuenta completados desde la interfaz. No se modificó otra empresa.
- **Trabajador:** miembro con escritura solo en Horas; únicamente ese módulo en
  el menú. Marcó entrada y salida, reabrió la marcación y solicitó una corrección.
  No dispone de aprobación ni registro administrativo; acceso directo a
  `/horas/nuevo` y Facturas rechazado. Un administrador aplicó después la corrección
  ficticia de cinco minutos; solicitud Aprobada y marcación en revisión 3,
  cinco minutos, todavía Pendiente de aprobación de horas. No hubo nómina real.
- **Ventas:** miembro con escritura en Clientes, Leads y Estimados, y lectura en
  Productos y Precios. Se comprobó el menú y una edición de cliente con reapertura;
  no se ejecutaron todavía todos los recorridos de esos cinco módulos.
- **Consulta y revocación:** se retiró escritura mientras una ficha seguía abierta.
  El envío desde ese formulario fue rechazado y la base conservó versión 5 y las
  notas autorizadas. Reabrir mostró la ficha sin botón de guardar. Suspender la
  membresía bloqueó la ruta y retiró la empresa del listado sin cerrar Auth.
  Al terminar se reactivó exclusivamente la lectura de Clientes en la empresa A.

La primera solicitud de horas conserva las fechas originales: el llenado automático
de `datetime-local` no actualizó el estado del campo. Se rechazó con motivo y se
conservó como evidencia. Repetir con teclas de incremento/decremento sí actualizó
las fechas: 10:00–10:05 del dispositivo se muestra 09:00–09:05 en America/Chicago
y queda 14:00–14:05 UTC en la base. No se cambió código para ocultar esa diferencia
de la herramienta. Tampoco se solicitó ubicación ni se acreditó GPS.

En consulta, Clientes a 390 × 844 conserva ancho de documento/cuerpo de 390 px,
con tabla de 514 px dentro de 348 px. Se ejercitaron los controles de navegación;
la dimensión se restableció al terminar. Sigue pendiente teléfono físico, el resto
de módulos en móvil y la lectura de horas entre trabajadores distintos.

Retención actual de staging: `e1187ec` activo, `f1fbf02` anterior y dependencia
compartida `b149bee/node_modules`. `9ccf77f` y `d530c33` son candidatos para revisar
contenido único antes de eliminar: aproximadamente 465 MiB entre ambos. No hubo
borrado ni se ha ensayado todavía un retorno completo.

## Defecto descubierto al editar desde dos pestañas

Una pestaña conservó una versión anterior mientras la otra guardó una actualización.
La edición obsoleta quedó en «Guardando» durante varios minutos. PostgreSQL conservó
la edición ganadora en versión 3; la segunda no la sobrescribió. Salud de staging
y producción respondió 200, pero el recorrido de conflicto falló.

El entorno usa PostgREST 14.5. Las funciones usaban deliberadamente SQLSTATE `40001`
para conflictos de negocio. [Supabase documenta el reintento indefinido de ese código
en PostgREST 14](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b).
Se canceló únicamente la consulta identificada de esta prueba en staging.

La migración aditiva `202609240028_business_conflicts.sql` cambia los conflictos
deliberados a `PT409`, sin modificar firmas, permisos ni reglas de negocio. Incluye
28 funciones de edición, finanzas, operaciones y transición. El ejecutor reconoce
también ese rechazo sin registrar un efecto. La aplicación mantiene mensajes
comprensibles y compatibilidad con el código anterior durante la publicación.

Las 274 pruebas, lint, tipos y compilación pasaron, junto con los tres jobs de
[CI del commit f1fbf02](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36042644319).
Comprueban conflicto terminal, conservación del registro y auditoría,
reaplicación sin cambios de acceso, traducción de errores y rechazo sin efecto en
la cola.

La migración terminó con `COMMIT` exclusivamente en staging y el historial registra
28 entradas. La comparación de funciones conservó ACL, modo de seguridad y
`search_path`; no quedan funciones de negocio que eleven deliberadamente `40001`.
El contenido registrado de 028 coincide con el archivo publicado. La preparación
local tuvo dos intentos detenidos por el control de huellas, ambos revertidos antes
de cambiar funciones; corregir la lectura UTF-8 en Windows permitió comprobar las
27 entradas existentes sin excepciones ni modificaciones del historial.

Se publicó `f1fbf02` después de comprobar CI y build del hosting. El proceso activo
resuelve a esa entrega; producción mantiene su raíz y proceso anteriores. Ambas
rutas de salud responden 200. La nueva prueba de dos pestañas devuelve el aviso
de versión obsoleta, conserva el texto no guardado y habilita de nuevo el botón.
Repetir el intento devuelve el mismo rechazo; la base conserva la edición ganadora
en versión 4. Tras la prueba no había RPC activas reintentando. El historial visible
muestra las escrituras aceptadas y la creación/revocación de la invitación.

La entrega anterior `d530c33` se conserva como retorno de código, junto con la
dependencia compartida `b149bee/node_modules`. Su mensaje para `PT409` es genérico:
volver al código anterior no debe deshacer la protección de la base ni reintroducir
el reintento. No se ha ensayado todavía un retorno completo.

## Alcance de lectura de Horas entre trabajadores

Se añadió un segundo trabajador ficticio con una marcación de 15 minutos.
La sesión del auditor, como miembro con Horas y Actividad, podía listar esa
marcación, abrir sus notas y consultar su historial. Es un defecto de alcance:
la regla anterior filtraba empresa y módulo, pero no trabajador. La copia local
del controlador operativo de Campo de ADT distingue la consulta propia y el
equipo asignado de un encargado; esa comparación no acredita todavía la paridad
completa de Campo.

La migración aditiva `202609240029_time_read_scope.sql` restringe marcaciones
a la ficha activa vinculada al usuario y solicitudes a las propias sobre esa
ficha. Propietario y administrador mantienen gestión general. El cierre semanal
queda reservado a esos perfiles. Historial y Actividad aplican el mismo alcance,
incluido el control de ambas imágenes de auditoría cuando se reasigna una
marcación. No se eliminan ni reescriben registros o eventos anteriores.

La prueba de regresión cubre lectura directa por identificador, otra empresa,
historial, actividad, administrador/propietario, lectura sin escritura, revocación,
membresía o trabajador inactivo, reasignación y acceso anónimo. Se limitaron a dos
los archivos de pruebas concurrentes: una ejecución sin límite terminó un proceso
de pruebas sin diagnóstico; ese archivo pasó aislado y la suite completa limitada
pasó sus 281 pruebas. La ejecución limitada no elimina casos.

La entrega `6866a73ef6172b120eb30f52c77cf4ea5e38b785` pasó lint, tipos, build,
281 pruebas y los tres trabajos de [CI](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36047579817).
La migración terminó con COMMIT en staging tras conciliar las 28 anteriores;
quedan 29 entradas de migración. Su contenido registrado coincide con GitHub.
Las dos funciones y tres políticas previas quedaron respaldadas de forma privada.

Después de aplicar, la misma sesión real ve una marcación propia y sus dos
solicitudes. La ficha ajena devuelve Página no disponible; su historial no
devuelve eventos. Actividad solo muestra los eventos propios. La base conserva
las dos marcaciones y sus 20 minutos totales. Con el perfil administrador, la
interfaz vuelve a mostrar ambas marcaciones y los controles de gestión.

La aplicación publicada oculta el cierre de semanas al trabajador y explica el
alcance propio. Se comprobó el proceso activo, cinco hilos y dependencia compartida;
staging y producción responden salud 200 sin caché. La entrega anterior es
`e1187ec`; `b149bee/node_modules` sigue siendo indispensable. Las carpetas
`9ccf77f`, `d530c33` y `f1fbf02` no tienen procesos activos en el inventario nuevo,
pero siguen pendientes de revisión de contenido único y confirmación de borrado.

No hay aún un perfil de encargado con delegación por equipo;
no se debe sustituir esa función concediendo acceso general de administrador.
La protección no se ha aplicado en producción.

## Lead, conversión y revisiones con perfil de ventas

Con la segunda cuenta en perfil miembro y permisos comerciales se creó un lead
ficticio, se reabrió y se convirtió a cliente desde la interfaz. La base confirmó
un único cliente vinculado y conservación de correo, teléfono, dirección y notas.
El lead queda en estado Cliente, con enlace al cliente y sin repetir el botón de
conversión. Esto acredita la conversión observada; el ensayo de dos conversiones
concurrentes sigue siendo una prueba técnica, no una prueba simultánea de navegador.

Ventas buscó al cliente convertido y creó `EST-2026-0002` en Borrador: dos unidades
a 19,95 USD, descuento 0,90 e impuestos 1,00 dieron 40,00 USD. Guardar una segunda
revisión con tres unidades dejó 59,95 USD. La reapertura y la base confirmaron
ambos importes. El historial permite consultar la primera revisión sin editarla;
su vista imprimible mantiene cantidad dos, datos del cliente y total 40,00.
La revisión actual conserva cantidad tres y total 59,95. No se exportó PDF.
En viewport emulado de 390 × 844, documento y cuerpo miden 390 px; se abrió y
cerró el menú móvil y se restauró el tamaño normal. No acredita teléfono físico
ni guardado con teclado móvil.

Este perfil no muestra aprobación/facturación y la ruta de Facturas devuelve
Página no disponible. Quedó activo únicamente el conjunto comercial de prueba;
no es administrador y no tiene membresía en la otra empresa. No se hicieron
cobros, envíos comerciales ni aprobación de un cliente real. Catálogo, precios,
envío, aprobación y recorrido financiero con este perfil siguen pendientes.

## Catálogo y conservación del formulario de Precios

Se creó desde la interfaz administrativa un producto sintético por área a 12,35
USD/ft², con especificación y acabado de 1,25 por medida. La reapertura conservó
los datos. El perfil de ventas puede consultarlo con campos deshabilitados, sin
guardar ni subir imágenes. Desde su estimado buscó el producto y agregó dos
unidades de 2,5 × 4 ft: la línea calculó 247,00 USD y el total 306,95 USD.
Las opciones de acabado todavía deben incorporarse como líneas separadas; no se
ha demostrado selección automática de variantes ni paridad del catálogo de ADT.

La primera prueba de Precios, aún sin tarifas en la empresa sintética, rechazó
una tarifa de techo cero. La base conservó cero registros, pero React reinició
los diez campos del formulario, incluidas las tarifas válidas. `ActionForm`
ahora permite el reinicio únicamente después de éxito confirmado sin error;
los rechazos conservan la entrada para corregirla. Lint, tipos, 281 pruebas y
compilación local pasaron. Los tres trabajos de
[CI](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36050044247)
pasaron antes de compilar y activar `f29072da3322c86c02949d0d89bc57afef785870`
en staging. No requiere migración de base.

En la aplicación publicada, repetir el techo cero conservó los diez campos.
Cambiar únicamente esa tarifa a 20,25 permitió guardar la versión 1 con los
otros nueve valores intactos. Una modificación posterior guardó la versión 2;
el historial de tarifas muestra ambas. La sesión de ventas ve las tarifas
deshabilitadas y sin botón Guardar. Una transacción de comprobación con el rol
autenticado y el sujeto del auditor confirmó rechazo `42501` de ambas RPC de
escritura, Productos y Precios, y terminó en ROLLBACK. No se trata de una petición
forjada desde el navegador ni de una prueba simultánea de dos usuarios.

El producto se actualizó a 15,75, versión 2. La revisión 3 del estimado conservó
precio 12,35, partida 247,00 y total 306,95, comprobados en reapertura y base.
Agregar otra línea del catálogo tomó 15,75 mientras la existente mantuvo 12,35;
esa línea de comprobación se retiró del formulario sin guardarla.
La ruta del producto bajo la segunda empresa devolvió Página no disponible.

## Tarifas, diseño básico y generación de estimados

Con perfil administrador se guardó un diseño sintético de 10 × 12 × 9 ft,
pared de 4 × 6 ft, cocina de 3 ft, dos refuerzos y permiso. Las cinco partidas
sumaron 3.176,00 USD: 2.430 + 246 + 300 + 50 + 150. La generación creó
`EST-2026-0003`; repetirla desde la misma revisión abrió el mismo documento.

Cambiar la tarifa de techo de 20,25 a 21,25 no alteró el diseño. Editar su nombre
y guardar dejó revisión 2, tarifas 1 y total 3.176. Marcar explícitamente
Recalcular produjo revisión 3, tarifas 2 y total 3.296. Su generación creó
`EST-2026-0004`. La base confirmó dos estimados diferentes; el primero mantiene
3.176 también en su vista imprimible y el segundo 3.296. No se exportó PDF,
aprobó, facturó ni envió ninguno. Al terminar se devolvió al auditor el perfil
comercial sin permisos administrativos ni de diseño.

Esta evidencia cubre el cálculo básico observado. No acredita geometría avanzada,
equipos, despiece, planos de fabricación, umbrales de permiso completos ni paridad
de diseño con ADT. Las partidas generadas todavía muestran el nombre técnico
del techo (`white`); su presentación en español queda pendiente.

## Inventario de retención después de publicar

Staging ejecuta `f29072d`; `6866a73` queda como retorno de código y
`b149bee/node_modules` como dependencia compartida. Producción conserva su raíz
y proceso anteriores. Ambas rutas de salud respondieron 200 con `no-store`.
La comprobación del recorrido corregido no equivale a ensayo completo de retorno.

Se compararon `9ccf77f`, `d530c33`, `f1fbf02` y `e1187ec` con sus archivos fuente:
no hay código cambiado o ausente ni diferencias de configuración respecto a la
entrega anterior conservada. Los únicos archivos adicionales son diagnósticos,
conservados juntos en un archivo privado de 493 bytes. No hay procesos de esas
entregas ni enlaces simbólicos entrantes desde la cuenta. Sus dependencias apuntan
a la carpeta compartida protegida.

Las cuatro carpetas suman 951.504 KiB y 3.120 archivos; sus cuatro archivos fuente
comprimidos añaden 1.634.926 bytes. Se solicitó confirmación para esos ocho
elementos exactos y el propietario autorizó eliminarlos. Antes de ejecutar se
repitieron los controles de contenido, configuración, procesos y enlaces; se
comprobó también la copia consolidada de diagnósticos. Se eliminaron solo los
ocho elementos, liberando **953.124 KiB (930,8 MiB)** y 4.644 entradas del sistema
de archivos, incluidas 3.124 correspondientes a archivos. Los objetivos pasan
a cero bytes; permanecen aplicación activa, retorno y dependencias.

Después de la limpieza, la sesión autenticada abrió el estimado y buscó/agregó
un producto; staging y producción respondieron salud 200 sin caché. No cambió
la configuración de producción. Las cifras generales de `df` corresponden al
disco compartido del servidor, no a la cuota de esta cuenta. El resto del hosting
y el ensayo completo de retorno siguen pendientes; no se cierra el punto 1.

## Continuación: validación de gastos y conservación del formulario

En la entrega `f29072d`, un miembro con escritura en Gastos completó categoría,
proveedor, referencia, descripción y método Otro, dejando importe cero. El
servidor rechazó el gasto, pero React reinició los campos sin guardar. El mensaje
era `Invalid input`. Se reprodujo con una sesión real sobre datos sintéticos.

La corrección reutiliza una protección común: un resultado de error conserva
los campos y archivos seleccionados; solo un éxito confirmado permite el
reinicio. Los guardados con redirección abren el registro persistido. Se aplica
a Gastos/Trabajadores, Horas, fichas operativas, movimientos y adjuntos, imágenes,
además de los formularios generales y financieros ya protegidos. El importe
cero recibe ahora una explicación en español. No cambia reglas financieras,
permisos, migraciones ni datos. La entrega `685b5da` pasó lint, tipos, 281 pruebas,
compilación y los tres trabajos de
[CI](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36052658348)
antes de publicarse en staging. El proceso activo se verificó dentro de esa
entrega; `f29072d` queda como anterior y `b149bee/node_modules` como dependencia
compartida. Producción conserva su configuración. Ambas rutas de salud pasaron
con HTTP 200 y `no-store`; no hubo nuevas migraciones.

### Gasto sintético, recibos y permisos

Se creó desde la interfaz un gasto ficticio de 12,34 USD, sin proyecto ni
trabajador asignados, con método Otro, proveedor y referencia de prueba. Se
subió un PDF sintético y se abrió su contenido desde el enlace privado. Un
administrador lo aprobó; al reabrir persistió el estado.

En la nueva entrega, enviar importe cero devolvió el mensaje en español y
conservó categoría, proveedor, referencia, método y descripción. Corregir solo
el importe a 15,67 USD guardó los cambios y devolvió el gasto aprobado a revisión.
La validación rechazada no generó una versión persistida.

Un archivo de texto renombrado como PDF fue rechazado por su contenido: conservó
el archivo seleccionado y el recibo válido anterior. Tras otra aprobación,
subir el segundo PDF volvió a dejar el gasto pendiente, con la explicación
«Recibo corregido; requiere nueva revisión». El nuevo enlace abrió el PDF de
15,67 USD. La base conserva exactamente dos objetos privados de 617 bytes, y
el historial de la interfaz muestra seis versiones: creación, primer recibo,
aprobación, corrección de importe, segunda aprobación y segundo recibo. El primer
archivo permanece conservado. No hubo compra, desembolso ni envío real.

Con escritura de Gastos, los controles de aprobación y reembolso estuvieron
deshabilitados. Una llamada transaccional con el rol autenticado y sujeto del
auditor confirmó el rechazo de aprobación con `42501`; terminó en `ROLLBACK`.
Con lectura únicamente, no aparecen acciones de guardado, carga o eliminación
del recibo, mientras su lectura privada sigue disponible. También se confirmó
el rechazo transaccional `42501` al intentar cambiar la descripción con ese perfil.
Al retirar Gastos y restablecer Ventas, recargar la ficha devolvió «Página no
disponible». La cuenta terminó sin acceso administrativo. La ficha bajo la
empresa B devolvió «Página no disponible». El intento de obtener el objeto por
la ruta pública respondió HTTP 400, con error de bucket no encontrado, sin PDF.
Esto no sustituye una prueba de revocación de todos los enlaces firmados ya emitidos.

La ficha completa se inspeccionó a 390 × 844: encabezado, campos, revisión y
recibo permanecen legibles sin desbordamiento horizontal (contenido de 375 px
dentro del viewport de 390 px, con barra vertical). Se restableció el tamaño
normal. Es emulación de navegador y lectura; no acredita un teléfono físico ni
la captura de fotos o GPS. Los demás formularios que comparten la protección
requieren sus recorridos propios; no se declaran auditados por esta reutilización.

El contraste de catálogo revisó el editor de partidas de ADT conservado y el
archivo público actual de Pérgola: ambos incorporan el precio base, sin ejecutar
las opciones `addType`. Esto no demuestra el comportamiento de otros editores
de ADT. No se introduce una fórmula nueva de adicionales como supuesta paridad;
queda pendiente localizar y comprobar ese recorrido si está operativo allí.

### Ensayo de retorno de código y retención

Se cambió staging temporalmente de `685b5da` a `f29072d`, con verificación de
commits, compilaciones, entorno idéntico y dependencias compartidas. Se comprobó
el nuevo proceso sirviendo desde la entrega anterior, salud HTTP 200 y la sesión
de Ventas reabriendo el estimado sintético en revisión 3 con 306,95 USD. Después
se recuperó `685b5da`; se comprobaron nuevamente proceso, salud y el mismo
estimado sin cambios. La configuración y el proceso de producción permanecieron
intactos. El cambio de raíz no ejecutó SQL ni restauró datos.

Este ensayo acredita arranque y lectura autenticada del retorno entre estas dos
entregas, con 29 migraciones. No acredita restauración desde copias, continuidad
de escrituras concurrentes, retorno de producción ni recuperación de los 23 módulos.

La entrega sobrante `6866a73` y su archivo fuente suman 238.472 KiB (232,9 MiB),
785 archivos y 1.165 entradas. Se renovó el inventario: código original sin
cambios ni ausencias, configuración sin diferencias, ningún proceso ni enlace
entrante dependiente. El único diagnóstico adicional se conservó junto con los
anteriores en un archivo privado consolidado de 520 bytes. Se solicitaron los
dos destinos exactos para confirmación; siguen conservados mientras esté pendiente.

## Límites de esta evidencia

No cierra ninguno de los seis puntos. Faltan completar la matriz de perfiles y
recuperación de cuenta, recorridos comerciales/financieros/operativos completos,
restauración desde Drive, carga y traspaso. ADT sigue siendo el sistema principal.
La migración 028 requiere las anteriores; producción todavía no tiene 026–027.
No aplicar aisladamente 028 ni volver a ejecutar el bootstrap de base vacía.
