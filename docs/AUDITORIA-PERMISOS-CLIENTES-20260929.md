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

Publicación, comprobación autenticada y archivos reales de prueba: pendientes
de registrar al completar el despliegue.
