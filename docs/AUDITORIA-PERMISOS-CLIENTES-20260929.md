# Permisos y documentos privados en Clientes

Fecha: 29 de septiembre de 2026. Alcance activo: 21 módulos. Nuevas cargas ADT y
traspaso suspendidos; configuradores y 3D fuera del alcance.

## Contrato y límites del origen

Se abrió Operaciones de un cliente en ADT autenticado. La pantalla devolvió
«No se pudo cargar el expediente operativo». Se conserva evidencia privada;
no se interpreta como inexistencia de documentos o proyectos ni como paridad
operativa acreditada. No se modificaron registros del origen.

El código de referencia de Clientes y portalInfo asocia permisos por los
identificadores de proyectos del cliente, excluye anulados y muestra tipo,
estado y número. También recoge documentos comerciales PDF, fotografías y el
inicio de producción. Estos últimos recorridos siguen pendientes en el SaaS.

## Entrega

El expediente añade Permisos de obra y Documentos de permisos. La primera
sección muestra tipo/nombre, proyecto, estado, número, autoridad, fechas y
cantidad de adjuntos activos. La segunda reúne los documentos y fotografías
que ya están adjuntos a esos permisos; no se presenta como archivo completo
del cliente ni como galería de fotos del portal.

Los listados requieren Clientes, Proyectos y Permisos, en la misma empresa y
con membresía activa. Cruzan identificadores, nunca nombre/correo/teléfono.
El paginado de 20 elementos y el total comparten la misma instantánea SQL.
Los anulados y adjuntos archivados se conservan en sus módulos, fuera de este
listado. Un fallo de lectura no se convierte en una lista vacía.

Esquema aditivo 037: índices y consultas security invoker, stable, con RLS y
permisos actuales. No cambia roles, políticas, Storage ni datos de negocio.
El listado no devuelve rutas de Storage ni enlaces portadores.

Abrir documento usa una ruta autenticada del SaaS. En cada petición valida
usuario, empresa, cliente, proyecto, permiso y adjunto activo; después descarga
el objeto con la sesión del usuario y devuelve sus bytes sin redirección pública.
Aplica private/no-store, nosniff, MIME limitado, límite de 5 MB y nombre UTF-8
escapado. Archivar el adjunto, anular el permiso o reasignarlo a otro proyecto
retira el acceso desde ese expediente. No revoca archivos ya descargados ni
los accesos históricos autorizados en la ficha original.

## Validación

Pruebas aisladas PostgreSQL/PGlite: dos empresas, tres clientes con contacto
coincidente, 25 permisos y 25 referencias a objetos sintéticos; dos páginas,
documentos archivados, permiso anulado, proyecto reasignado, revocación de cada
permiso, membresía inactiva y anonimato. Lectura y reaplicación de esquema
conservan huellas de auditoría y adjuntos. Los contratos de Storage simulados
no acreditan una carga binaria real; esa comprobación se realizará en staging.

Pruebas del manejador HTTP: bytes idénticos, MIME, cabeceras, nombres con acentos
y apóstrofos, falta de sesión, denegación, documento ausente, ruta inconsistente,
archivo vacío/sobredimensionado y fallos de servicio. No firma URLs de acceso.

## Publicación y prueba autenticada

Entrega de código `b89ae31837c292dd1462ab10dc3fdfcaf03622a7` publicada
exclusivamente en staging. `npm run check` pasó: lint, tipos, 380 pruebas y
compilación. [CI 36597196581](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36597196581)
aprobó check, queue-concurrency y backup-recovery. Estos ensayos de CI no
sustituyen la recuperación real en Drive ni el traspaso pendiente.

Esquema 037 aplicado a SaasAlldecor-Staging con guardia de empresa sintética.
Las huellas y cantidades de ocho tablas se mantuvieron idénticas antes y
después de aplicar el esquema. Dos intentos previos fallaron por el texto
transferido al editor SQL; no aplicaron cambios. La ejecución correcta y las
huellas quedaron registradas de forma privada.

Se creó mediante la interfaz un permiso pendiente sin tasa, asociado a un
proyecto sintético ya existente, y se cargó un PDF ficticio en work-files.
Con sesión de propietario se comprobó el expediente, vínculo al permiso,
proyecto correcto, nombre del archivo y fecha en la zona de la empresa.
La descarga autenticada produjo exactamente los bytes originales (SHA-256
comparado). Después de archivar por la interfaz: lista vacía y resolución SQL
del archivo con cero filas autorizadas. Después de restaurar: un documento
visible y segunda descarga idéntica al original.

La respuesta HTTP sin sesión fue 401. La navegación directa al archivo
archivado desde el navegador integrado quedó bloqueada por el propio navegador;
no se atribuye un código HTTP a ese intento. El rechazo de archivo archivado
queda demostrado por la consulta autenticada real y el contrato probado del
manejador, separado de la descarga real comprobada para archivos activos.

Con el mismo auditor como miembro restringido de otra empresa, la ficha solo
muestra sus secciones autorizadas incluso al pedir documentos por URL; no hay
pestañas ni conteos de permisos. Un cliente ajeno dentro de otra empresa
devuelve Página no disponible. Consultas con rol authenticated verificaron
propietario, miembro restringido y cliente ajeno; anon fue rechazado. La
revocación individual de módulos y de membresía se ensayó en PostgreSQL aislado.

Escritorio y móvil emulado de 390 x 844 comprobados: las dos tarjetas, enlaces,
textos y navegación caben sin desplazamiento horizontal (375 px de documento,
390 px de viewport). No equivale a prueba en teléfono físico. Se restableció
la vista de escritorio al terminar.

Al terminar, clientes, estimados, facturas, proyectos, pagos y gastos conservan
sus huellas iniciales. Los cambios del ensayo se limitan al permiso sintético,
su adjunto y su auditoría: la operación de adjuntar/archivar/restaurar incrementa
también la revisión del permiso. El PDF termina activo, sin cobros ni envíos.

## Ejecución y retención

Proceso de staging comprobado con raíz b89ae31, revisión completa y dependencias
compartidas b149bee. Retorno 19eafe1, probado con el esquema 037 antes del cambio.
Las cuatro rutas públicas de staging y salud de producción devolvieron 200.
La raíz/proceso de producción permaneció en 3c0c412 y la huella de su
configuración web quedó intacta. No se publicó esta entrega en producción.

Inventario actualizado: b89ae31 activa, 19eafe1 retorno y b149bee dependencias.
Las entregas 1ad4cbb, 2a1e325, 301dcdb, 4293666, 4c21da6, 50e96d4, 685b5da,
6866a73, 7017873, 7472d42, 8d936f0, 9598d35, a8e1dd9, b4377d3 y f29072d
son candidatas a depuración. No se eliminaron: falta cerrar la comprobación
de contenido único y la confirmación específica correspondiente. La cuota de
cPanel antes de esta compilación fue 580139 de 600000 archivos (96,69 %);
la candidata añadió 891 archivos regulares sin duplicar node_modules.
La retención del hosting sigue pendiente, no se declara cerrada.

Capturas, huellas y registros están fuera de GitHub en la evidencia privada
closure-20260929. Los pendientes funcionales continúan en CIERRE-FUNCIONAL.md:
documentos comerciales, fotografías del portal, inicio de producción, gasto
directo de cliente y contraste completo de la auditoría y Operaciones de ADT.
