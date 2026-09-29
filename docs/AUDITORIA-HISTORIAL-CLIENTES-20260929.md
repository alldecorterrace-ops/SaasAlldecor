# Historial del expediente de Clientes

Fecha: 29 de septiembre de 2026. Alcance vigente: 21 módulos, sin configuradores
ni 3D. Nuevas migraciones de datos ADT y traspaso siguen suspendidos.

## Contraste del origen

Se consultó la pestaña Historial de Clientes en una sesión autenticada de ADT.
La ficha inspeccionada muestra estimados, proyectos, facturas (incluida anulada)
y pagos, con fechas e importes/estados. No se modificaron registros de ADT.

La copia privada de referencia de adt-modules-v2.jsx combina esos registros y
gastos con la respuesta financial_audit_list; no se observó una fila de auditoría
financiera en la muestra de pantalla. Esa parte tiene evidencia de código, no
un recorrido positivo verificado en el origen. Operaciones contiene documentos,
permisos y fotos y consulta el portal; ese bloque queda pendiente y no se abrió
para generar un enlace de acceso como efecto de la inspección.

## Implementación

La nueva sección Historial reúne las creaciones y actualizaciones ya registradas
por el SaaS para Clientes, Estimados, Facturas, Proyectos, Pagos y Gastos de
proyectos. Presenta fecha y hora de registro (zona horaria de la empresa), autor,
revisión, estado e importe de esa revisión, fecha del documento y nombres de
campos modificados. Cada entrada enlaza al historial existente del registro.

No mezcla la fecha comercial del documento con la fecha de su auditoría. No
inventa eventos anteriores a la incorporación al SaaS ni importa auditoría ADT.
El orden de registro es descendente por identificador; la continuación de 30
eventos usa un cursor entero representado como texto, sin pérdida de precisión.
Los eventos nuevos se consultan volviendo a Más recientes.

Esquema aditivo 036: índice de auditoría por empresa/ID y función customer_history.
Utiliza el mismo alcance de lectura que el historial por registro ya existente,
con una proyección más limitada. Requiere Clientes y el permiso del módulo de
cada registro; Gastos de proyectos requiere también Proyectos. No modifica las
políticas RLS ni los permisos de roles existentes y no admite ejecución anónima.

La función usa security definer porque las instantáneas de audit_events solo son
consultables directamente por administradores; igual que record_history, verifica
explícitamente membresía activa, empresa y permisos. Devuelve una lista cerrada
de campos, sin instantáneas, contactos completos, rutas privadas ni tokens.
Para cambios de relación exige que ambas instantáneas pertenezcan a la misma
asociación actual: los eventos anteriores y el evento de reasignación se excluyen
del expediente nuevo. Permanecen conservados en la auditoría original.

Los errores no se interpretan como historial vacío. La consulta no agrega ni
modifica eventos, datos de negocio, roles, pagos o documentos.

## Pruebas y publicación

Pruebas locales de PostgreSQL/PGlite: dos empresas y tres fichas con contacto
coincidente, seis entidades, estados de revisiones antiguas, centavos, permisos
por módulo, revocación, usuario inactivo, rechazo anónimo, cliente de otra empresa,
reasignación de estimado, escape de HTML y ausencia de campos privados.
La paginación se ensaya con IDs mayores que Number.MAX_SAFE_INTEGER y un nuevo
evento insertado entre páginas; el cursor evita repeticiones. Se comprueban
huellas antes/después de consultar y reaplicar el esquema.

`npm run check` finalizó correctamente: lint, tipos, 373 pruebas y compilación.

La validación de interfaz desplegada, acceso real de Supabase y versión del
servidor se documentará al terminar la publicación.

## Pendientes preservados

Esta entrega no cierra todo Clientes: faltan documentos, operaciones/fotos,
asociación directa de gastos sin proyecto y contraste completo de los eventos
financieros del origen. La consulta implementada se limita a registros que
actualmente pertenecen a la ficha y que el usuario puede consultar. No acredita
que el historial del SaaS contenga toda la actividad histórica de ADT.
