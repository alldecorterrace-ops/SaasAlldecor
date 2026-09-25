# Permisos e Instalaciones — auditoría del 25 de septiembre de 2026

Datos ficticios, sesión autenticada del auditor y permisos de empresa preparados
por fases. ADT conserva la operación principal. El recorrido empezó en staging
`7472d42`, con 30 migraciones; no hubo trámites, tasas pagadas, avisos a trabajadores
ni modificaciones de producción.

## Permisos de obra

- Alta sin proyecto rechazada, conservando campos. Seleccionar el proyecto
  sintético permitió guardar el permiso con tasa de referencia de 125,40 USD.
- Aprobación sin número y fecha rechazada. Aprobación anterior a la presentación
  rechazada. Corregir únicamente la fecha permitió guardar y reabrir el estado
  aprobado, sin perder número, autoridad, vencimiento o notas.
- PDF sintético adjuntado, con una referencia activa. El archivo es de prueba;
  no representa un permiso emitido por una autoridad.
- Motivo vacío rechazado para el estado anulado. La anulación y la corrección
  posterior del motivo se conservaron; ficha final en versión 5. Historial
  visible con las cinco versiones, incluido el adjunto y la aprobación anterior.

La primera prueba de vaciado del textarea mediante automatización conservó el
texto anterior. Se comprobó el valor real y se repitió con selección y borrado
por teclado: se obtuvo el rechazo esperado. No se atribuye ese comportamiento
de la herramienta a un defecto de validación del SaaS.

## Búsqueda y fechas

El número del permiso existente no devolvía resultados en el listado anterior,
que solo buscaba por nombre. La fuente de ADT conservada incluye búsqueda por
tipo, autoridad, número, notas y nombre de proyecto, además de fechas inclusivas.
Se implementó esa consulta con permisos de quien la ejecuta: buscar el nombre
de un proyecto no debe revelar coincidencias si el usuario no puede consultarlo.

La migración aditiva 031 crea una función exclusivamente de lectura. Consulta
por empresa, módulo, texto literal y estado; usa la fecha de presentación o,
si está vacía, el día de creación en la zona horaria de la empresa. Los filtros
se conservan al paginar y pueden limpiarse; un rango invertido muestra un error.
No interpreta los caracteres del texto como comodines ni instrucciones de filtro.

Las pruebas locales comprueban los campos de búsqueda, caracteres especiales,
límites inclusivos, fecha de creación cerca de medianoche, acceso a proyectos,
revocación del módulo y rechazo anónimo. Los registros conservan su contenido
y versión tras las consultas. La revisión de ADT es de código preservado;
no acredita un recorrido actual completo del origen.

En la interfaz publicada se repitieron las búsquedas por número, autoridad y
proyecto. La fecha de presentación fue encontrada usando ese mismo día como
ambos límites; el día siguiente no devolvió resultados. El rango invertido
mostró el error en español y conservó los filtros. «Limpiar filtros» restauró
el listado sin restricciones.

Retirar al auditor el acceso a Proyectos hizo desaparecer la coincidencia por
nombre de proyecto, manteniendo la búsqueda por número de permiso. La ficha
mostró «Proyecto vinculado», sin revelar el nombre; sus campos estaban
bloqueados y no ofrecía guardar. El listado se inspeccionó a 390 × 844 píxeles:
documento y cuerpo de 390, formulario de 350, sin desbordamiento horizontal.
Se comprobó el cierre del menú y se retiró la emulación. No es una prueba en
un teléfono físico ni acredita todas las interacciones móviles.

## Instalaciones

- Se asignaron proyecto y responsable sintéticos. Fin anterior al inicio
  rechazado; corregirlo permitió guardar la primera instalación.
- Primera franja: 28 de septiembre, 10:00–12:00 en el dispositivo, persistida
  como 14:00–16:00 UTC y mostrada como 09:00–11:00 en America/Chicago.
- Una segunda franja 11:00–13:00 para el mismo responsable fue rechazada por
  superposición, conservando los datos. Corregir solo el inicio a 12:00 permitió
  guardar una franja contigua: 16:00–17:00 UTC.
- La primera pasó de programada a en curso y completada; versión final 3.
  Se utilizó el anticipo ficticio ya existente del proyecto, sin nuevos pagos.
  La segunda se canceló con motivo, versión 2; un motivo vacío fue rechazado.
- La agenda mostraba la hora de empresa sin identificar la zona. La nueva
  entrega añade esa identificación; el editor mantiene la indicación de hora
  local del dispositivo. No se cambió ningún instante almacenado.

El rechazo sin anticipo tiene cobertura automatizada previa, pero no se repitió
en esta sesión del navegador. Tampoco se acredita todavía concurrencia real de
agenda, asignación múltiple de cuadrillas, avisos ni ejecución en dispositivos.

## Autorización y límites

Se retiró escritura mientras una instalación estaba abierta con un borrador.
Guardar devolvió «Página no disponible»; al recargar, el registro original
seguía intacto y los campos quedaron bloqueados. Las fichas de permiso e
instalación bajo otra empresa fueron rechazadas. Una prueba separada del RPC,
bajo `authenticated` y la identidad del auditor en consulta, rechazó las tres
escrituras con `42501` y terminó en `ROLLBACK`.

La evidencia amplía los recorridos del SaaS. No cierra la paridad integral de
estos módulos, la recuperación desde Drive, conciliación, carga ni traspaso.
Los seis puntos del plan continúan abiertos.

## Publicación

Código `42936665a0f27949d4f3502ad21ebf826778aa7b`: lint, tipos, **287 pruebas y
compilación** aprobados. También aprobaron los tres trabajos de
[CI](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36150779413).
Se comprobó el SHA publicado antes de compilar y activar exclusivamente staging.
La aplicación ejecuta `4293666`, con `7472d42` anterior y `b149bee/node_modules`
compartido. La migración 031 terminó en `COMMIT`, tras validar las 30 huellas
anteriores, y su huella coincide con el código. Staging tiene 31 migraciones.
Es una función de consulta nueva; no reescribió registros de negocio.

Las cuatro comprobaciones públicas pasaron en ambos entornos después de activar.
La sesión del auditor repitió búsquedas, fechas, consulta restringida y agenda;
esta última muestra explícitamente America/Chicago. La comprobación final en
base conservó el permiso en versión 5 y las instalaciones en versiones 3 y 2,
con sus motivos originales. Producción conservó su proceso y entrega `3c0c412`.

No hubo borrados. `685b5da`, `6866a73` y `f29072d`, con sus archivos fuente,
quedan como entregas sobrantes para el inventario y confirmación de retención.
La anterior `7472d42` no se declara todavía ensayada como retorno desde 4293666.
