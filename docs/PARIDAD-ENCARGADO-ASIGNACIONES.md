# Encargado: obra actual del equipo

Paquete del 6 de octubre de 2026, posterior a las propuestas y salidas
declaradas de Campo. La migración `202610060081` añade selección de obra actual
y recibos de reintento. No importa datos de ADT ni modifica asignaciones,
marcaciones, perfiles, membresías, gastos o pagos existentes al instalar.

## Regla observada en ADT

`CrmController::campoEncargadoAccion`, acciones `lista` y `asignar`, y
`campoEsMiObrero`: un Encargado actúa sobre trabajadores activos de su equipo
directo y se excluye a sí mismo. El catálogo contiene identidad y nombre de
las obras. Seleccionar una obra cambia la obra actual del trabajador; enviarla
vacía la quita. Un proyecto inexistente y un trabajador ajeno se rechazan.
Cambiar obra conserva los turnos y sus minutos.

El código de origen se comprobó mediante lectura SSH firmada del 6 de octubre.
SHA-256 de `CrmController.php`:
`578144f99dd8a57043df03915c27f5e3b962633668b315c13013c7ee9c3d4401`.
El archivo de origen y la evidencia operativa permanecen fuera del repositorio.

## Equivalencia y límites

| Acción o regla                   | SaaS                                                                | Verificación reproducible                                               |
| -------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Consultar equipo directo         | RPC con trabajadores activos, perfil habilitado y supervisor actual | Encargado excluye su propio perfil y otras empresas                     |
| Catálogo de obra                 | Identidad y nombre canónicos de proyectos de la misma empresa       | No incluye datos de clientes, tarifas, pagos o credenciales             |
| Asignar obra actual              | `choose_workforce_project`, selección inmutable con versión y actor | Cambio auditado; ningún registro anterior alterado                      |
| Quitar obra actual               | `project_id=null` y una nueva versión                               | Historial conservado y selección previa cerrada para nuevas operaciones |
| Reintentar una respuesta perdida | Recibo por empresa, actor y solicitud                               | Un efecto y una auditoría; datos distintos rechazan el reintento        |
| Conflictos y revocación          | Versión y permiso comprobados bajo el bloqueo de Workforce          | Cambiar supervisor, perfil o permiso invalida la acción y el recibo     |
| Entrada propia                   | La obra actual se ofrece y se preselecciona entre obras disponibles | Las asignaciones administrativas conservan su vigencia independiente    |
| Turnos anteriores y abiertos     | La selección no reescribe proyecto, reloj ni minutos                | Comparación de todos los registros de tiempo antes y después            |

Administración conserva la gestión de periodos de asignación en Trabajadores.
La obra actual del Encargado es una selección operativa separada: quitarla
conserva las asignaciones administrativas existentes y su historial. Una nueva
selección habilita esa obra para las operaciones propias del trabajador en su
periodo de vigencia; la selección histórica se conserva para comprobaciones
de fecha. Se mantienen los permisos de módulos y el aislamiento entre empresas.

El selector incluye obras terminadas como `lista/asignar` de ADT. Continúa la
restricción ya existente en SaaS sobre nuevas marcaciones en obras completadas
o canceladas. La visita a obra terminada es una diferencia previa del catálogo
de Campo y no se declara resuelta por este paquete.

Labor mantiene su comprobación de asignación administrativa y revisión del
turno. Una selección operativa no aprueba horas, gastos ni costes. Un turno
sin esa asignación sigue visible como pendiente de conciliación; no se
convierte su importe en cero ni se registra un pago. Los datos históricos
y la fórmula de Labor permanecen intactos.

## Jornada completa y validación

El propietario aclaró el 6 de octubre que registra la jornada completa desde
Horas del panel administrativo. En SaaS corresponde a `Registrar horas`:
Administración registra entrada, salida y descanso con historial. El permiso
permanece reservado a Administración. Esta aclaración no autoriza crear una
acción de jornada completa para el perfil Trabajador.

`tests/workforce-project-choice.test.ts` contiene 20 casos con PostgreSQL local
PGlite y datos sintéticos: instalación conservadora, alcance, assign/clear,
reintentos, conflictos, revocaciones, historia, permisos directos y registro
manual administrativo. La suite completa pasó 833 pruebas, junto con lint,
tipos y compilación. Estas comprobaciones no prueban la nueva UI en hosting,
JWT emitidos por Supabase, ni un teléfono físico.

El 6 de octubre se comprobó REQUEST/DECLARE en una sesión real de Trabajador:
propuesta propia y salida propia permitidas; registro manual, revisión de
equipo y turno ajeno denegados. Se restauró el perfil ficticio a Encargado.
Desde la sesión real de Administración se registró una jornada ficticia
09:00–17:00 con descanso de 30 minutos (450 minutos netos), se aplicó una
propuesta de horario (120 minutos) y se rechazó una salida declarada
(conservando 0 minutos y su motivo). Los tres registros quedaron anulados de
forma reversible, con decisiones e historial conservados y excluidos de Labor.
La comprobación protegió 1.273 filas originales; el único perfil original
cambiado fue el de la prueba autorizada y quedó en Encargado, versión 6.
Las membresías se conservaron. Esta prueba de la entrega anterior es
independiente de la nueva UI de obra actual. Evidencia e identificadores privados.

## Entrega y retorno

Publicar el commit exacto y verificar CI antes de aplicar `081` o activar el
código en staging. Validar con trabajadores y obras ficticios: asignar, quitar,
consultar la selección desde Trabajador y comprobar que el equipo ajeno se
rechaza. Verificar las huellas de registros anteriores y cerrar las fixtures
de horas mediante anulación reversible.

La entrega anterior ignora `preferred_project_id` y puede convivir con el
esquema aditivo. Un retorno de código conserva las selecciones, su historial
y el permiso operativo que aportan. Si el retorno requiere quitar una obra
actual, registrar el cambio mediante la RPC con su versión vigente; conservar
las asignaciones administrativas, la auditoría y los datos de negocio.

No se ha activado este paquete al redactar esta nota. GPS físico sigue
aplazado y el traspaso operativo desde ADT continúa sin activar.

## Visitas a obras terminadas

El esquema 082 añade un catálogo separado del reloj y motivo obligatorio según las facturas, sin ampliar el alcance de gastos. Ver [reglas y límites](PARIDAD-CAMPO-VISITAS.md). La prueba de GPS físico continúa aplazada.
