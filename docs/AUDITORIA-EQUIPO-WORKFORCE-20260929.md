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
Estado de publicación: pendiente de CI y capacidad del hosting.
No considerar el esquema aplicado ni las pantallas verificadas en staging por este documento.
La versión activa comprobada sigue siendo `3c567f9`, esquema 046.

## Próximo cierre

Verificar las pantallas con perfiles reales de prueba, publicar sin agotar la cuota
de archivos, y continuar con recibos privados de Campo, revisión humana/IA,
doble aprobación, reembolso e incorporación contable sin duplicados. Todo ello
permanece pendiente; esta base no cierra la paridad de Trabajadores.
