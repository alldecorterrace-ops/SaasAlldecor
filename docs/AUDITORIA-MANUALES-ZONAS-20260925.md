# Manuales de fabricación y Zonas — 25 de septiembre de 2026

Auditoría en staging con empresas ficticias y la cuenta de auditoría autenticada.
Los perfiles operativo, administrador y consulta se prepararon por fases mediante
el RPC del propietario; esto no acredita el editor visual de permisos. ADT
conserva la operación principal.

## Manual de fabricación

- Alta sin proyecto rechazada, conservando campos. Con proyecto, el perfil
  operativo pudo crear un borrador; intentar aprobarlo fue rechazado.
- El administrador tampoco pudo aprobarlo con instrucciones vacías. Reponerlas
  permitió guardar y reabrir el manual aprobado.
- Cambiar los materiales de dos a tres piezas ficticias devolvió el manual a
  revisión y registró el motivo automático. La versión inicial conserva los
  materiales originales en el historial.
- Tras aprobar de nuevo, adjuntar un PDF sintético devolvió el manual a revisión.
  Se repitió la aprobación y se archivó el adjunto: volvió a revisión. Restaurar
  el documento conservó archivo y referencia; no creó otro adjunto.
- El administrador archivó el manual. El usuario operativo no pudo reabrirlo ni
  archivar su documento; ambos intentos fueron rechazados sin cambiar versiones.
- Estado final comprobado en base: manual archivado, revisión 9; un adjunto
  activo, versión 3. Las ocho primeras revisiones se consultaron en la interfaz,
  incluida la creación con contenido original. No se enviaron órdenes al taller.

## Corrección de impresión

El botón anterior imprimía directamente el formulario. Tras una edición
rechazada, el selector podía mostrar Borrador mientras el registro seguía
archivado. La nueva vista imprimible consulta exclusivamente la ficha guardada,
con revisión, estado, proyecto sujeto a permisos y fecha en la zona de empresa.
Los textos se presentan como párrafos completos, con saltos de línea, sin
controles de edición ni alturas fijas. La lista identifica los documentos activos
y aclara que sus páginas no están incluidas en la copia.

Una prueba de renderizado comprueba 120 líneas de instrucciones, contenido
escapado, revisión y estado, y ausencia de formularios/scripts. No equivale a
un ensayo de todas las impresoras, documentos extensos paginados o PDF recibido.

## Zonas circulares

- Latitud 91 rechazada, conservando los demás campos. Corregir solo la latitud
  a cero permitió crear la zona sin proyecto, que es opcional en este módulo.
- Se guardaron y reabrieron coordenadas ficticias 0,001 / 0,002 y radio de 250 m.
  El listado y esquema mostraron el registro actualizado.
- Marcarla inactiva la retiró del filtro Activa y del esquema correspondiente.
  El filtro Inactiva volvió a mostrar una fila y su punto. Quedó en revisión 4;
  una interacción inicial de automatización guardó la revisión 3 sin cambiar el
  estado. Se verificó la navegación y se repitió la selección en la ficha cargada;
  no se atribuye ese intento a un fallo del SaaS.
- Se retiró escritura con un borrador abierto. Guardar fue denegado; al reabrir,
  la referencia original estaba intacta, con campos deshabilitados y sin guardar.
- El mensaje «Invalid input» se sustituyó por indicaciones en español para
  latitud, longitud y radio, conservando los límites existentes.

## Aislamiento y diferencias pendientes

Las rutas del manual y de la zona bajo la segunda empresa fueron denegadas.
La consulta posterior en base conservó estados, versiones y referencia;
los rechazos no produjeron escrituras. No se probaron aquí GPS, dispositivos
físicos, concurrencia de documentos ni comunicaciones externas.

La fuente preservada de ADT muestra un Mapa de zonas comercial con categorías
de proyectos terminados/activos, estimados y leads; agregados por código postal,
porcentaje de cierre, ingresos, ticket y CSV, además de cartografía y ubicación
de códigos postales. Las zonas circulares del SaaS no acreditan esa paridad.
Falta contrastar las acciones actuales en ADT vivo y completar su equivalente.
El código preservado también contiene enlaces del taller a plan de corte y
manual de pérgola por estimado; diseño, generación y entrega siguen pendientes.
Esta auditoría no envió mensajes ni ejecutó esas acciones de ADT.

## Comprobaciones y publicación

Código `a8e1dd97d297244a900b787ceaa13de67e775f7a`: lint, tipos, 288 pruebas y
compilación aprobados; los tres trabajos de
[CI](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36152968748)
pasaron. Se compiló y activó exclusivamente staging desde ese commit publicado.
No añade migraciones: permanecen las 31 existentes. La entrega activa es
`a8e1dd9`, anterior `4293666`, dependencias compartidas `b149bee/node_modules`.

Las cuatro comprobaciones públicas pasaron en staging y producción. El proceso
de producción conservó `3c0c412`. En la interfaz publicada se reprodujo un
borrador rechazado con 99 piezas y estado Borrador: abrir la vista imprimible
mostró las 3 piezas guardadas y Archivado · Revisión 9, sin el texto rechazado.
El acceso de consulta pudo leerla; sin permiso de Proyectos mostró solo
«Proyecto vinculado». La misma ruta bajo la segunda empresa fue denegada.

La emulación de impresión confirmó el contenido visible sin formularios ni
controles editables. A 390 × 844 píxeles, documento y cuerpo midieron 390 px,
sin desbordamiento horizontal; se cerró el menú y se retiraron las emulaciones.
Esto no acredita un dispositivo físico ni un archivo PDF entregado.

Los rechazos de latitud 91 y longitud 181 se repitieron después de publicar:
mostraron sus límites en español, conservaron campos y no alteraron la zona.
La comprobación final en base conservó manual en revisión 9 y zona en 4.
El auditor volvió a su perfil habitual de ventas al terminar la auditoría.
La vista imprimible quedó denegada con ese perfil y se reabrió el estimado
comercial anterior, que conserva revisión 3 e importe de 306,95 USD.

No hubo borrados. Quedan identificadas como sobrantes `7472d42`, `685b5da`,
`6866a73` y `f29072d`, con sus archivos fuente. Requieren inventario final,
preservación de contenido único y confirmación exacta antes de eliminarlas.
La medición de esos ocho elementos suma aproximadamente 940,7 MiB; no se
considera espacio liberado. La aplicación activa, anterior y dependencias
compartidas quedan fuera de esa lista.

Los seis puntos siguen abiertos: paridad completa, conciliación, recuperación
real desde Drive, carga, retención y traspaso requieren sus pruebas restantes.
