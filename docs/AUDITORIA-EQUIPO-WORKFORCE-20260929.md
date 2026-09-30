# Equipo y asignaciones de Workforce — 29 de septiembre de 2026

## Alcance y fuente

Base previa al circuito de gastos enviados por trabajadores. Añade perfiles
explícitos de Trabajador, Encargado y Oficina, equipo directo y asignaciones de
obra con periodo. No implementa todavía doble aprobación, revisión de recibos,
reembolso, contabilidad ni delegación de horas. No cambia los gastos administrativos,
las fichas existentes ni las reglas actuales de Horas.

Referencia local de ADT: `adt-workforce/drupal/adt_workforce/src/Service/ScopeService.php`
(SHA-256 `6a674ca3a98bf9949e5c26a20db8ee8f4d81541f37adefe644bdac780b777087`)
`AdminService.php` (alta/finalización, sin reabrir asignaciones)
y `ExpenseService.php`
(`3fa8194fbfc4ccf430a7f5cbf02200ca771a2cd7c16c08b02a4b907227858c6e`).
El código local distingue trabajador propio, encargado de equipo directo y oficina;
los gastos exigen obra asignada al instante del gasto y doble aprobación.
**Estas huellas son de la referencia local; no certifican la versión PHP desplegada
actualmente en ADT.** El contraste operativo completo sigue pendiente.

No se abrió Gastos de Trabajadores de ADT: esa pantalla puede iniciar revisión IA
automática. No se ejecutaron importaciones, deltas, cambios ni pagos del origen.

## Contrato implementado

- Esquema aditivo 047: `workforce_profiles`, `workforce_assignments` y recibos privados
  de comandos. Ninguna ficha anterior recibe rol, encargado o asignación automáticamente.
- Solo propietario/administrador puede configurar perfiles o asignaciones. Las
  mutaciones registran actor, motivo, fecha de servidor y versión. Repetir exactamente
  una solicitud devuelve su recibo, sin una segunda actualización o evento.
- El encargado debe existir activo en la misma empresa y tener perfil Encargado activo.
  Se rechaza la autoasignación. Retirar un perfil o cambiar su rol modifica el ámbito
  de consulta al instante; no reasigna automáticamente su equipo.
- El ámbito de consulta requiere membresía vigente y permiso Horas, cuenta vinculada,
  trabajador activo y perfil habilitado. Trabajador ve su propio perfil; Encargado,
  su equipo directo y él mismo; Oficina ve los perfiles activos de la empresa.
- La respuesta acotada incluye identificadores, nombres y rol. No entrega correos,
  teléfonos, tarifas, notas laborales, credenciales, facturas ni saldos.
- Una asignación conserva trabajador y obra. Para reasignar, se retira la anterior y
  se crea otra. Una asignación finalizada no se reabre ni reescribe su inicio.
  Al finalizar sin fecha explícita se registra el instante del servidor.
  Un trabajador puede trabajar en varias obras; se rechazan periodos
  superpuestos para el mismo par trabajador/obra. Inicio inclusivo, final exclusivo.
- El formulario usa días completos en la zona horaria de la empresa. La función
  base admite instantes precisos. Las obras COMPLETADO/CANCELADO no admiten nuevas
  operaciones; esa correspondencia con el estado activo de ADT se documenta aquí.
- El encargado no hereda las obras de su equipo para registrar gastos propios.
  Oficina y administradores pueden consultar las obras operativas de su empresa.
- La revocación de una asignación o perfil retira su ámbito al consultar de nuevo.
  Las autorizaciones futuras de escrituras deberán comprobarlo nuevamente al ejecutar;
  esta entrega no conecta todavía las acciones existentes a ese ámbito.
- RLS deniega escritura directa. Historial y tablas de configuración son exclusivos
  de administradores; los otros roles reciben solo la consulta acotada.
- Los permisos de módulos y el vínculo existente de cuenta continúan independientes.
  Configurar Oficina no convierte al usuario en administrador de la empresa.

## Pruebas y límites

`tests/workforce-scope.test.ts` ejecuta todas las migraciones en una base local aislada:
identidades homónimas, dos empresas, perfil ausente, encargado propio/ajeno, oficina,
cuenta revocada, perfil retirado, fechas inclusivas/exclusivas, día de 25 horas por DST,
conflictos de versión, reintentos, permisos SQL y privacidad del historial.
Las fichas laborales se comparan antes y después de la configuración.

`scripts/test-workforce-concurrency.ts` se ejecuta en el PostgreSQL 17 de CI:
ocho reintentos paralelos, versiones competidoras, aborto antes de commit,
respuesta perdida, carrera de periodos solapados y ocho retiradas repetidas.
El resultado debe conservar un efecto y evento por comando aceptado.

Comprobación local: lint, tipos, 440 pruebas y compilación completos sin errores.
Publicado en staging desde `80adf3d942d9fb51ae890a710dcd7ceefc30e59d`, esquema 047.
[CI 36626056153](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36626056153)
completó los tres trabajos: comprobación de aplicación, concurrencia PostgreSQL 17
(incluido `test-workforce-concurrency.ts`) y recuperación sintética de CI.
Esta última prueba no acredita la recuperación operativa de producción.

## Evidencia de staging

- Esquema 047 aplicado únicamente a SaasAlldecor-Staging, con comprobación de empresa
  sintética y rechazo de la empresa de producción en la transacción. Se verificaron
  RLS en las dos tablas públicas, denegación de lectura anónima y ausencia de permisos
  INSERT/UPDATE/DELETE directos del rol authenticated. Los recibos privados carecen
  de esos privilegios; la aplicación los usa exclusivamente mediante funciones.
- Sesión real del auditor, propietario de una empresa sintética: navegación desde
  Trabajadores, configuración de un perfil Trabajador sin cuenta vinculada,
  creación de asignación, recarga, rechazo de un periodo superpuesto conservando
  campos, finalización sin fecha explícita e historial con autor/motivo/revisiones.
- Finalización desde móvil emulado de 390 px; anchura de documento y ventana de
  390 px, sin desbordamiento horizontal. No equivale a un ensayo en teléfono físico.
- Consulta de equipo y obras como propietario comprobada. Las rutas de configuración
  ajena y consulta de equipo en la empresa donde el auditor está restringido devuelven
  «Página no disponible». No se cambiaron membresías ni se vinculó una cuenta nueva.
- Estado conciliado: un perfil, una asignación finalizada, tres recibos de comandos,
  un evento de perfil y dos de asignación. El intento superpuesto no creó efectos.
- Once tablas anteriores conservaron exactamente recuentos y huellas antes del
  esquema y después de las pruebas/retorno: clientes, estimados, facturas, proyectos,
  pagos, gastos, trabajadores, registros y adjuntos operativos, lotes y recibos.
- Compilación independiente con dependencias compartidas sin reinstalarlas, paquete
  exacto de GitHub verificado y proceso activo apuntando a `80adf3d`.
- Retorno real `80adf3d → 3c567f9 → 80adf3d`: consulta autenticada de gastos y totales
  existente, cuatro controles públicos y reapertura de la asignación finalizada.
  El ensayo de retorno fue de lectura; no afirma cobertura de cada escritura antigua.
  `3c567f9` queda como retorno para los recorridos comprobados. El esquema 047 permanece.
- La configuración de producción conservó su huella en cada cambio de staging.
  No se publicaron cambios en SaaS producción ni se ejecutaron acciones en ADT.

Las sesiones reales de Trabajador, Encargado y Oficina para esta nueva consulta
siguen pendientes. Sus reglas, revocación e aislamiento están probados en SQL local;
no se presentan como recorridos de navegador completados.

## Retención autorizada

Se eliminaron únicamente `b69a5c5` y `source-b69a5c5.tar.gz` de
`/home/alldeco1/saas-staging-releases`, tras la confirmación expresa del propietario.
Los 449 archivos de código coincidían con GitHub; sin procesos, enlaces entrantes
ni archivos únicos. Configuración privada idéntica a la activa y diagnósticos vacíos.
Se liberaron 296.699.792 bytes (283 MiB) y 1.464 entradas: inventario del home
597.920 → 596.456 antes de construir la nueva entrega. No se creó otro archivo
permanente por la versión eliminada. Se conservaron `aaf268c`, su comprimido,
las dependencias `c66e4ec`/`b149bee`, versiones necesarias, datos y producción.
Después de construir la candidata, el inventario independiente fue de 597.955
entradas; no es una lectura nueva del contador de cuota de cPanel. No se autorizó
ni realizó ninguna eliminación adicional. La retención general sigue pendiente.

Capturas, huellas, consultas y resultados detallados permanecen en el archivo
privado; no se incorporan al repositorio registros privados ni credenciales.

## Próximo cierre

Completar las sesiones de Trabajador, Encargado y Oficina y continuar con
recibos privados de Campo, revisión humana/IA,
doble aprobación, reembolso e incorporación contable sin duplicados. Todo ello
permanece pendiente; esta base no cierra la paridad de Trabajadores.
## Continuación del 30 de septiembre

La consulta de equipo y obras de los tres perfiles se repitió por fases con una
cuenta autenticada en escritorio y móvil emulado; se verificaron revocaciones y
preservación de registros. El pendiente de sesiones de consulta descrito arriba
queda resuelto en [la auditoría nueva](AUDITORIA-ROLES-WORKFORCE-20260930.md).
Las escrituras de esos roles, recibos, revisión, doble aprobación, reembolsos y
contabilidad siguen pendientes. Esta continuación no publicó otra aplicación.
