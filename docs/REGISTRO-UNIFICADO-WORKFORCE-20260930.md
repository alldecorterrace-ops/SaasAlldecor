# Registro unificado de Gastos y Workforce — 30 de septiembre de 2026

Entrega de aplicación 518447adea3dd4db1be1ccba5e16f2d23a5ac70d, esquema 057,
solo https://staging.alldecorpatio.com. No hay importación, sincronización,
activación de producción, pago, reembolso ni llamadas IA.

## Regla del origen y equivalencia cubierta

La fuente publicada privada de ADT registrada el 29 de septiembre,
`adt-modules-v2.jsx`, SHA-256
`ff0058234ef4b418b219903dc63e7f2e501fde36b3c83f390916d31174d90df8`,
separa Administración, Trabajador (`WORKER_APPROVED`) y Labor automática.
Su registro filtra/exporta por origen y dirige la gestión del costo del
trabajador a Trabajadores. El archivo deja anulada su copia contable y la
restauración recupera el estado previo.

| Acción | Resultado comprobado en esta entrega |
| --- | --- |
| Consultar Gastos | Administración y proyección de costos con estado OFFICE_APPROVED; los pendientes, devueltos o rechazados no se suman como costos aprobados. |
| Filtrar/exportar origen | Dos orígenes operativos, combinación con filtros existentes, centavos y columna Origen en CSV. Labor queda pendiente. |
| Gestionar el trabajador | Enlace al registro exacto de Workforce, con recibo e historial; no hay editor administrativo de una segunda ficha. |
| Archivar/restaurar | Archivado aprobado figura ANULADO en Todos para administradores; se excluye de activos. Restaurar recupera una única entrada con el mismo importe. |
| Reclasificar general | Conserva obra original y decisiones en Workforce; el registro financiero deja de asociar ese costo a proyecto/cliente. |
| Costo y reembolso | Bolsillo propio se muestra separado como SIN_CONFIRMACION. No aumenta los reembolsos administrativos ni acredita deuda conciliada/pago. Los pagadores históricos sin evidencia permanecen sin declarar. |
| Permisos | RPC con seguridad de invocador y RLS de cada origen. Gastos no amplía Horas/Workforce ni acceso a nombres de clientes, proyectos o trabajadores. |

Se utiliza una consulta vinculada, sin materializar otra fila en `expenses`.
Esto evita duplicación de la propia proyección, pero no detecta un gasto
administrativo independiente que una persona registre por segunda vez. No hay
una regla nueva que mezcle gastos por nombre, importe o recibo. La identidad
incluye origen e ID; paginación estable aun si dos orígenes comparten UUID.

## Evidencia operativa

- Nuevo gasto ficticio de $13.45 enviado desde el formulario real del trabajador.
  Su primera decisión se preparó como fixture explícito de base; no certifica
  una actuación real del encargado. La segunda aprobación se registró desde la
  sesión web de oficina/administración. Antes de ella, el costo filtrado era cero.
- Después: una entrada, total y activos $13.45. CSV descargado: encabezado y una
  fila, ID único, origen Workforce y centavos. SIN_CONFIRMACION no se convierte
  en deuda de reembolso ni pago.
- Archivo desde UI: activos vacíos. Todos: una entrada ANULADA, total $13.45 y
  activos cero. Miembro restringido: lista y exportación vacías, incluso con Todos.
- Restauración y reclasificación desde UI: una entrada por $13.45, sin relación
  financiera con la obra original. El filtro por esa obra retorna cero.
- Persistencia final: versión 6, OFFICE_APPROVED, GENERAL; cinco recibos de
  ejecución y seis eventos de auditoría, incluida la preparación sintética de
  la primera decisión. Cero filas administrativas con el ID del gasto.
- Recibo descargado en el recorrido: 23.483 bytes, SHA-256 esperado
  `2cd4e2aaec0e750b732b446dbadf3b8831679b9f2d950944a3ce65d5a1c6a826`.
  La identidad y metadata del recibo siguen conservadas al finalizar.
- Otro espacio de QA: la misma búsqueda no encuentra el registro. Al restituir
  los permisos originales, el RPC se deniega, expense/receipt RLS retornan cero
  y la página muestra Página no disponible. Se volvió a Empresas.
- Móvil emulado a 390 px: anchura interior, cliente, visual y scroll iguales a
  390; sin desbordamiento. No es prueba en un dispositivo físico.
- Dieciocho conjuntos protegidos conservaron recuentos y huellas exactos, incluidos
  gastos Workforce anteriores, campos de archivo, versiones de recibo y fichas
  empresariales. Perfil temporal desactivado, versión auditada 28; asignación
  temporal finalizada, versión 2; membresía original exacta.

Capturas, CSV, consultas, resultados privados y hashes completos están fuera del
repositorio. No se suben registros de negocio, recibos privados ni credenciales.

## Pruebas y publicación

`npm run check`: lint, tipos, 496 pruebas y compilación correctos. Cinco pruebas
nuevas cubren mezcla de orígenes, sumas, archivo/restauración, general, CSV,
revocación, nombres ocultos, ámbito del trabajador/empresa, fechas de empresa,
identidad estable y ausencia de escrituras al consultar.

Los dobles locales de Auth/Storage no prueban JWT ni descarga binaria; esas
observaciones se registran por separado arriba. CI de la entrega exacta:
[run 36780362691](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36780362691),
check, queue-concurrency y backup-recovery aprobados. Estas pruebas de recuperación
no cierran la recuperación real ni los objetivos RPO/RTO.

Fuente desplegada obtenida de GitHub, SHA-256 del archivo
`04cc0b5d82f2887b0fe6849ca7704b13d20799f08fb020122a452ea8ae60efe2`.
Compilación aislada con Node 22 y dependencias sin cambios. Proceso y raíz 518447a,
grupo Passenger `saas-staging-518447a`, configuración privada idéntica a be3b23d.
Configuración de producción intacta. Once controles HTTP correctos, incluidos
salud, autenticación pública y denegación anónima de recibos/exportación.

## Retorno y pendientes

Conservar be3b23d como código anterior. **No basta cambiar Passenger a esa raíz:**
la UI anterior carece de enlaces de origen Workforce. Antes de volver, restituir
el cuerpo exacto del RPC `expense_register` de la migración 046, publicado en ese
commit; luego cambiar raíz y grupo, reiniciar solo staging y verificar el recorrido.
Ese cambio es únicamente de consulta y no revierte registros, versiones, recibos,
autorizaciones ni auditoría. El contrato antiguo se ensayó en una base local
independiente: recuperó la vista administrativa y todas las filas/auditorías
permanecieron iguales. No se realizó retorno en el hosting. El estado efectivo
del RPC debe quedar anotado si se ejecuta, sin borrar el historial de migraciones.

Inventario final: 21 carpetas de entregas y 105.457 entradas en la cuenta.
Retención limitada sin cerrar; ninguna eliminación. Mantener c66e4ec/b149bee y
`aaf268c`, cuya conservación pidió el propietario, hasta nueva decisión aplicable.

No se declara cerrada la paridad contable de ADT: faltan extracción IA y su
confirmación humana, deuda/reembolso, Labor automática, documentos/medios
extraídos del recibo, coordinación de copia contable y demás consumidores de
costos (proyectos, expediente e indicadores). La lista respeta los ámbitos
existentes de Workforce; los accesos globales de ADT no se replican. No se realizó
un recorrido simultáneo con cinco cuentas/dispositivos ni concurrencia nueva en
un RPC de escritura: esta entrega incorpora una consulta. Los 21 módulos siguen
con sus pendientes en CIERRE-FUNCIONAL.md. ADT continúa principal y los datos
reales ya incorporados se conservan; no se trasladó información nueva.

