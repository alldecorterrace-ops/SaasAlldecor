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

Entrega final publicada en staging: **19eafe1c72bd8d2c9b0fbb0c127c73f98376d9dd**,
esquema aditivo **036**. [CI exacto aprobado](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36594550833).
La entrega funcional anterior 301dcdb también pasó CI y la auditoría descrita;
19eafe1 únicamente unifica el texto del enlace al historial de cada registro.
Se comprobó de nuevo ese enlace después de la publicación final.

Evidencia obtenida:

- Supabase staging: antes/después de aplicar 036 coincidieron los recuentos y
  huellas completas de clientes (9), estimados (11), facturas (4), proyectos (4),
  pagos (5), gastos (2) y auditoría (202). El esquema no alteró datos de negocio.
- Bajo rol authenticated y el identificador del auditor, la proyección devolvió
  las seis entidades autorizadas, 12 eventos iniciales sin duplicados. Rechazó
  empresa ajena y cliente de otra empresa. No admite ejecución anónima.
  En la empresa restringida no devolvió entidades financieras sin permiso.
  Estas pruebas SQL se complementaron con la sesión real de la aplicación.
- En la pantalla de propietario se abrió el historial del expediente y el
  historial individual de un gasto ficticio. Aparecen revisiones anteriores
  (estimado borrador/aprobado y factura antes/después del pago), con centavos.
- Se editó únicamente la nota de revisión del gasto sintético existente desde
  su formulario. Guardado y reapertura mostraron revisión 2, pendiente y USD
  25.10, con reembolso No aplica. El nuevo evento conserva el anterior. La
  comparación de instantáneas confirmó solo nota y metadatos de revisión;
  apareció exactamente un evento nuevo. Pagos y los demás gastos conservaron
  sus huellas. No hubo cobros, nuevos pagos ni reembolsos reales.
- El usuario restringido abrió el historial de su empresa: solo Clientes y
  Estimados, con su zona horaria. No aparecieron pestañas ni eventos de Facturas,
  Pagos, Proyectos o Gastos. Una URL que mezcla empresa y ficha ajena mostró
  Página no disponible sin datos del cliente.
- El cursor anterior al evento nuevo lo excluyó; Más recientes recuperó la
  nueva revisión. La prueba de más de 30 eventos, precisión bigint y escritura
  entre páginas está cubierta en PostgreSQL/PGlite; no se generaron decenas de
  cambios artificiales en staging solo para llenar páginas.
- En móvil emulado de 390 px, ancho de documento 375 px más barra y tarjetas
  de 335 px, sin desbordamiento horizontal. Nota, fecha, importe y enlaces se
  pueden leer. No equivale a ensayo en teléfono físico; se retiró la emulación.
- La revisión del proceso activo coincidió con la entrega final. Las cuatro
  rutas públicas de staging respondieron HTTP 200. Producción conserva 3c0c412,
  el mismo proceso y huella de configuración, y salud HTTP 200.

Se conservan 301dcdb como retorno compatible y las dependencias compartidas
b149bee. Las versiones anteriores quedan identificadas como candidatas a la
limpieza pendiente: se requiere revisar contenido único y confirmar destinos
exactos antes de borrar. No se eliminaron entregas ni se declara cerrada la
retención del hosting. La cuota observada antes de esta publicación era 577551
de 600000 archivos; se reutilizaron dependencias para limitar el incremento.

Capturas, consultas, huellas, scripts y comprobaciones HTTP quedan en el archivo
privado de auditoría, fuera de GitHub. Las pruebas de recuperación y concurrencia
de CI siguen siendo sintéticas; no certifican restauración operativa ni traspaso.

## Pendientes preservados

Esta entrega no cierra todo Clientes: faltan documentos, operaciones/fotos,
asociación directa de gastos sin proyecto y contraste completo de los eventos
financieros del origen. La consulta implementada se limita a registros que
actualmente pertenecen a la ficha y que el usuario puede consultar. No acredita
que el historial del SaaS contenga toda la actividad histórica de ADT.
