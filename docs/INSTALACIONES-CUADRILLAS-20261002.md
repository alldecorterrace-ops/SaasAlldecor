# Cuadrillas de instalaciones · 2 de octubre de 2026

La selección guarda identidades de trabajadores de la misma empresa, además del
responsable y del texto de equipo anterior. La agenda comprueba a cada integrante,
incluyendo los responsables de instalaciones anteriores sin cuadrilla estructurada.
No se trasladan datos de negocio ni se modifican facturas, pagos o costos.

## Contrato y conservación

- Migración aditiva 066: un guardado conserva la cuadrilla en el documento y en
  su versión auditada. No reescribe filas anteriores ni cambia sus versiones.
- El executor 065 conserva empresa, actor, versión esperada, identificador de
  solicitud, efecto y constancia en una sola transacción. Un reintento idéntico
  devuelve el mismo resultado; un formulario anterior no pisa cambios recientes.
- Omitir la nueva propiedad desde código anterior conserva la cuadrilla guardada.
  Una lista vacía explícita elimina la asignación actual, conservando el historial.
- Hasta 20 colaboradores distintos; los nuevos integrantes requieren permiso de
  consulta de Trabajadores y deben estar activos en la misma empresa. No se
  amplían permisos ni se exponen tarifas a usuarios sin acceso a ese módulo.
- La cancelación libera la agenda. Restaurar una instalación con cruces falla;
  horarios contiguos son compatibles. El control de anticipo permanece vigente.
- El cierre de agenda se serializa por empresa, también con responsables distintos
  y un único colaborador compartido. Las solicitudes fallidas no dejan efecto,
  constancia ni auditoría parcial.

## Evidencia y límites

La sesión autenticada de ADT se volvió a consultar el 2 de octubre. Instalaciones
sigue mostrando la descripción de calendario, equipo, materiales, checklist y
firma, junto a «Módulo del sistema», sin controles operativos ni iframe.
Esto no prueba que existan esas operaciones en el servidor de origen. La cuadrilla
se implementa por el plan aprobado; su contraste completo sigue pendiente de
la referencia del backend y los recorridos con los perfiles restantes.

Nueve pruebas nuevas cubren normalización de identidades, reintento, historial,
conflictos entre integrantes y responsables, entradas inválidas, inactivos,
otra empresa, cancelación/restauración, intervalos contiguos y revocación.
Las huellas de facturas, pagos y gastos se conservan en el ensayo sintético.
El ensayo de PostgreSQL nativo pasó con dos responsables distintos y un
colaborador compartido: dos solicitudes concurrentes dejan un efecto y rechazan
el cruce. El CI 36968793404 del commit exacto pasó sus tres trabajos, incluida
la recuperación aislada. Lint, tipos, 597 pruebas y compilación correctos.

## Publicación y recorrido comprobado

Activa `c7bdaf498409d9d066cf12785605df6fb7267721`, retorno `9de7c8e`, esquema 066.
El archivo exacto de GitHub tiene SHA-256
034af9e94e69792db8b9c11a1545161d84812fd4c3c662f24274bf4d6c1a4353.
La compilación del hosting terminó y el proceso activo, raíz y revisión coinciden.
Salud, login, registro y recuperación de staging responden 200; salud de producción
200 y huella de su configuración conservada. No se publicó esta entrega en producción.

La aplicación aditiva conservó las huellas de **922 filas en 82 tablas**; ninguna
fila se recalculó ni se cargaron datos de ADT. El primer pegado de SQL falló por
sintaxis antes de aplicar cambios. Se reemplazó mediante el editor y se comprobó
el contenido completo contra el archivo antes de ejecutar la transacción correcta.
Los scripts remotos también coincidieron con los originales, incluido el salto
final adicional del heredoc.

Con propietario autenticado y datos sintéticos se comprobó:

- Seleccionar un colaborador, guardar y recargar: reaparece con el responsable,
  horario y texto de equipo originales.
- Otro responsable con el mismo colaborador en horario solapado se rechaza.
  La consulta independiente mostró una sola instalación y 17 constancias,
  sin nueva instalación ni efecto del intento rechazado.
- Quitar el colaborador conflictivo permite guardar la misma solicitud una sola
  vez. El formulario conserva proyecto, responsable, horario y notas del intento.
- Cancelar la instalación original libera al colaborador. Asignarlo a la segunda
  instalación funciona; restaurar la original mientras existe ese cruce se rechaza.
- Tras cancelar el segundo ensayo se restaura la original. Queda Programada en
  revisión 4 con su cuadrilla; la segunda queda Cancelada en revisión 3, conservando
  su cuadrilla y el historial.
- Las 22 constancias finales representan seis efectos nuevos sobre la línea base
  de 16. Las huellas completas de facturas, pagos, gastos y proyectos coinciden
  con la línea base anterior a esta entrega.
- En el navegador a 390 × 844, la pantalla de la segunda instalación conserva la
  cuadrilla, con cuerpo y documento de 375 px sin desbordamiento horizontal.
  Se restauró el tamaño normal. Esto es una prueba de interfaz adaptable, no una
  prueba física de GPS ni de conexión de un dispositivo.

La selección y la agenda tienen persistencia y evidencia operativa en staging.
O07–O09 permanecen Implementada, aún abiertas por contraste del backend de ADT,
perfiles restantes y recorridos completos. Los tres bloques siguen abiertos;
el conteo estricto continúa **1/65 obligaciones agrupadas**, no un porcentaje de
código terminado. La evidencia privada queda fuera de GitHub.

## Retención

Conservar c7bdaf4 activa, 9de7c8e para retorno y c66e4ec/b149bee como dependencias.
42fdad5 es ahora una entrega sobrante, además de las ya inventariadas. No se
eliminó ninguna carpeta ni archivo: la confirmación de la lista exacta de limpieza
sigue pendiente. El historial oficial permanece en GitHub.
