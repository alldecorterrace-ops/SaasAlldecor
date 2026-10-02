# Versionado en GitHub y retención en el hosting

Regla acordada el 19 de septiembre de 2026: **GitHub conserva el historial;
el servidor conserva lo necesario para ejecutar el SaaS y volver a una entrega
anterior validada.**

## Qué se conserva en GitHub

- Código, migraciones SQL, documentación, pruebas y `package-lock.json`.
- Commits publicados que permitan identificar y reconstruir cada entrega.
- Para cada publicación, registrar el SHA completo desplegado y el resultado
  de sus comprobaciones. Una etiqueta de entrega, si se utiliza, debe apuntar
  al commit publicado y no moverse para representar otro contenido.

No subir `node_modules`, `.next`, cachés, archivos de entorno reales, claves,
bases de datos, documentos de clientes ni respaldos privados. GitHub guarda
el historial del código; los respaldos de datos tienen una retención separada.

## Qué se conserva en el servidor

En estado estable, mantener **dos entregas de aplicación**: la activa y una
anterior validada y compatible para retorno. Durante una actualización puede
existir una tercera carpeta candidata, que deja de ser necesaria si se descarta.

Las dependencias compartidas son una excepción al número de carpetas: si la
entrega activa o la de retorno enlaza a `node_modules` de otra carpeta, esa
carpeta sigue siendo necesaria. No eliminarla por antigüedad ni modificar sus
dependencias mientras las utilice un proceso activo. A futuro pueden trasladarse
a un directorio dedicado, pero ese cambio requiere una entrega y validación propias.

Los datos persistentes, archivos importados, configuración privada, correo,
certificados y respaldos de negocio quedan fuera de la limpieza de entregas.

## Procedimiento de cada entrega

1. Publicar el commit en GitHub y comprobar los resultados de CI. Preparar la
   candidata desde ese SHA, sin compilar sobre la aplicación activa.
2. Registrar de forma privada la raíz activa, el ejecutable de Node, los destinos
   reales de los enlaces simbólicos y la configuración necesaria para retorno.
3. Verificar la candidata, cambiar la raíz de aplicación y comprobar el proceso
   que realmente sirve usuarios, HTTPS, salud y el recorrido autenticado afectado.
4. Si la entrega falla, utilizar el retorno compatible. No revertir ni borrar
   datos de Supabase para deshacer un cambio de interfaz.
5. Tras validar la publicación, inventariar las carpetas sobrantes. Confirmar que
   su código está publicado, que no contienen datos únicos y que no las necesitan
   la entrega activa, la de retorno, sus dependencias o algún proceso en ejecución.
6. Retirar las entregas sobrantes conforme a las autorizaciones aplicables y
   registrar los destinos eliminados y el espacio liberado. No crear un archivo
   comprimido permanente por cada entrega en el mismo hosting: reproduciría la
   acumulación que esta política busca evitar.

Esta política es operativa y está incluida en `AGENTS.md`; no instala un cron
ni activa un borrado automático. Antes de preparar cada candidata, comprobar
espacio y cantidad de archivos disponibles; registrar y retirar las entregas
sobrantes tras la validación y la autorización aplicable.

GitHub sigue siendo la ubicación del historial; no volver a acumular archivos
comprimidos o carpetas por cada versión publicada.

Los inventarios del hosting, rutas privadas, diagnósticos y resultados operativos
se conservan fuera del repositorio. En GitHub registrar el código, su SHA y las
reglas de retención sin publicar información privada de la cuenta.


## Comprobar la entrega servida en staging

En cada cambio de revisión actualizar también PassengerAppGroupName a un nombre
propio de la revisión de staging, registrar el grupo que se usará para el retorno
y comprobar el proceso y el HTML realmente servido. Cambiar PassengerAppRoot
o tocar restart.txt por sí solos no acredita que el proceso nuevo atienda las
solicitudes. Passenger conserva configuración de inicio por grupo; véase la
[referencia oficial](https://www.phusionpassenger.com/docs/references/config_reference/apache/#passengerappgroupname).

Detectar procesos por su directorio y nombre real (incluidos lsnode/next), sin
terminar procesos de producción ni otras aplicaciones. Verificar raíz, grupo,
revisión, dependencia compartida, configuración privada conservada y una marca
del HTML de la entrega. Registrar el resultado fuera de GitHub; el ajuste de
configuración debe quedar descrito en el procedimiento versionado.


## Entrega anterior de archivo de Workforce del 30 de septiembre

Activa be3b23d89d590181d6991d02b4d0322507ea899d, esquema aditivo 056 solo en staging.
Retorno previsto 32f31af2cd6b087a920ffbd38d6939b4129e4ee7, con el mismo esquema y
recorrido funcional comprobado antes del ajuste de etiquetas. No se ejecutó una
vuelta posterior desde la revisión final. Dependencias c66e4ec/b149bee conservadas.
Raíz, grupo propio por revisión, proceso real y HTML comprobados; configuración
privada idéntica y producción sin cambios de configuración.

Inventario privado final: veinte carpetas de entregas y 103.889 entradas en la
cuenta. No se eliminó ningún elemento. La depuración de versiones anteriores
permanece pendiente; este inventario no cumple todavía el límite de dos entregas
estables. Mantener código en GitHub, comprobar contenido único y dependencias y
obtener la confirmación aplicable antes de cualquier borrado permanente.
[Evidencia de publicación](ARCHIVO-WORKFORCE-20260930.md).


## Entrega vigente de registro unificado, 30 de septiembre

Activa 518447adea3dd4db1be1ccba5e16f2d23a5ac70d, esquema 057 solo staging.
Retorno be3b23d requiere restituir antes el RPC de consulta 046; no cambiar solo
la raíz. Conservación de datos al restituir el contrato ensayada localmente,
sin retorno real del hosting. Dependencias c66e4ec/b149bee, entorno privado y
producción conservados; proceso, grupo y recorrido de la activa comprobados.

Inventario: 21 carpetas de entregas, 105.457 entradas. Sin eliminaciones; retención
limitada todavía pendiente. Las entregas distintas de activa/retorno/dependencias
son candidatas de revisión, no autorización de borrado. Conservar aaf268c por
la decisión explícita vigente del propietario. Eliminar sobrantes exige inventario
de contenido único, enlaces/procesos y la confirmación aplicable.
[Evidencia y procedimiento de retorno](REGISTRO-UNIFICADO-WORKFORCE-20260930.md).


## Estado de cartografía · 2 de octubre de 2026

Staging activa `ab2307fa91b86a830e09fdaef2cd1266d35454da`, retorno compatible
`c7bdaf498409d9d066cf12785605df6fb7267721`, dependencias c66e4ec/b149bee.
Esquema 066 conservado. Publicación desde CI exacto aprobado y recorrido en sesión.
Configuración privada anterior preservada, con tres variables exclusivas del banco
sintético. La configuración de producción conserva su huella verificada.

La petición de 52 eliminaciones permanece sin respuesta; no se ejecutó ningún
borrado en esta entrega. `9de7c8e` deja de ser retorno y se añade al próximo
inventario de sobrantes, junto con los adicionales ya identificados. Su retirada
requiere comprobar contenido único/enlaces/procesos y la confirmación aplicable;
no está incluida en la petición anterior. Se conserva aaf268c por decisión del
propietario. GitHub conserva el historial; estas notas no justifican retención
indefinida de entregas en el servidor.


## Estado del editor comercial · 2 de octubre de 2026

Staging activa `bfb8e3a3e8e653d12c269fb39991642682fc72b8`, retorno compatible
`ab2307fa91b86a830e09fdaef2cd1266d35454da`, dependencias c66e4ec/b149bee.
Esquema aditivo 067; configuración privada idéntica a la entrega anterior.
Commit exacto con CI completo, proceso activo y recorridos comprobados. Retorno
anterior probado antes del cambio, sin ensayo de regreso posterior. No se revierte
el esquema al regresar; la tasa explícita se conserva con clientes anteriores.
Producción mantiene salud y huella de configuración.

Ningún borrado realizado; petición concreta de 52 elementos pendiente. c7bdaf4
deja de ser retorno y requiere inventario/confirmación antes de retirarlo; tampoco
está incluido en esa petición. aaf268c permanece protegido por decisión del dueño.
GitHub conserva el historial, no las carpetas sobrantes del hosting. Evidencia
privada y datos sintéticos se mantienen fuera del repositorio.


## Estado de paginación comercial · 2 de octubre de 2026

Staging activa `2aae1ad2122bb856bb52ae5562d225e3e2805a60`, retorno
`bfb8e3a3e8e653d12c269fb39991642682fc72b8`, esquema 067 conservado.
CI aprobado, proceso/raíz/rutas y PDF reales de revisión guardada comprobados.
Dependencias c66e4ec/b149bee y entorno privado idénticos; producción conservada.
Retorno comprobado antes del cambio, sin vuelta real posterior.

Sin borrados; los 52 elementos pendientes requieren respuesta específica.
ab2307f deja de ser retorno y se suma al inventario de sobrantes, fuera de esa
petición. No retirar dependencias ni aaf268c. Las versiones adicionales no
sustituyen GitHub y no se consideran necesarias por ser anteriores; su retirada
exige comprobar contenido único, enlaces y procesos y obtener la confirmación.


## Estado del descuento comercial · 2 de octubre de 2026

Staging activa `56fcd98963c1d5f54ce768623b23702903676c5d`, retorno
`2aae1ad2122bb856bb52ae5562d225e3e2805a60`, esquema 067 conservado.
CI exacto aprobado, compilación del candidato, proceso activo y recorrido
sintético autenticado comprobados. Dependencias c66e4ec/b149bee y entorno
privado idénticos; producción conserva disponibilidad y configuración.
Retorno comprobado antes del cambio, sin vuelta real posterior.

Sin borrados; los 52 elementos consultados siguen pendientes de confirmación.
bfb8e3a deja de ser retorno y se suma al inventario de sobrantes, fuera de esa
petición. Se preservan dependencias y aaf268c. El historial oficial permanece
en GitHub; retirar una carpeta adicional requiere verificar contenido único,
enlaces, procesos y obtener la confirmación aplicable.


## Estado de pagos en documentos · 2 de octubre de 2026

Staging activa `e12b27253ae69bd6d72e59739b7d238a5abdd6a3`, retorno
`56fcd98963c1d5f54ce768623b23702903676c5d`, esquema 068 conservado.
CI exacto aprobado, compilación, raíz/proceso/rutas y cinco PDF sintéticos
comprobados. Dependencias c66e4ec/b149bee y entorno privado idénticos.
Producción conserva salud y huella de configuración. El retorno mantiene
compatibilidad con el campo aditivo en snapshots; no revierte el esquema ni
los pagos. Versión anterior comprobada antes del cambio, sin vuelta real posterior.

Ningún borrado; petición concreta de 52 elementos pendiente. 2aae1ad deja de
ser retorno y se añade al inventario de sobrantes, fuera de esa petición.
Conservar aaf268c y dependencias. GitHub conserva el historial oficial; retirar
sobrantes exige comprobación de contenido único/enlaces/procesos y confirmación
aplicable. No usar estas notas históricas para acumular entregas en el hosting.

## Estado de Zelle en Facturas · 2 de octubre de 2026

Activa b064fa3ccbc7d9c361415153c105de50a432bc4a, esquema 069. CI exacto
aprobado y compilación/raíz/proceso/rutas/recorrido de propietario comprobados.
Entrega anterior e12b27253ae69bd6d72e59739b7d238a5abdd6a3 conservada,
comprobada antes del cambio. Compatibilidad aditiva de datos; su UI anterior
no ofrece/etiqueta Zelle en Facturas, por lo que no acredita retorno con esa
capacidad nueva. [Evidencia](ZELLE-FACTURAS-20261002.md). Dependencias c66e4ec/b149bee
y entorno privado idénticos; producción conserva salud y huella de configuración.

Sin borrados. Los 52 elementos consultados siguen pendientes de confirmación.
56fcd98 deja de ser retorno y pasa al inventario de sobrantes, fuera de esa
petición. Conservar aaf268c y dependencias. GitHub conserva el historial; retirar
sobrantes requiere comprobar contenido único, enlaces, procesos y confirmación
aplicable. Estas notas históricas no autorizan acumular entregas indefinidamente.
