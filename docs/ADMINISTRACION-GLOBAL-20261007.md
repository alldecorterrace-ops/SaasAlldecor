# Administración global y alta de empresas

Solicitud del propietario del 7 de octubre de 2026: un administrador global invita
gerentes; cada gerente crea sus empresas y añade su equipo con roles definidos.
No trasladar datos de ADT. IA, prueba física de GPS y configuradores/3D siguen excluidos.
La identidad de la cuenta inicial permanece en el canal privado del propietario.

## Comportamiento implementado

- `/administracion-saas` exige administrador global activo y cuenta confirmada.
  Invita gerentes por correo, consulta invitaciones y su intento de envío,
  revoca las pendientes y puede suspender/reactivar gerentes con confirmación
  y control de versión. La vista global se centra en gerentes e invitaciones;
  cada gerente conserva la administración operativa de sus empresas.
- El destinatario entra o se registra con el mismo correo, confirma su cuenta
  y acepta la invitación en `/empresas`. La invitación vence a los siete días;
  su aceptación repetida no reactiva una cuenta suspendida.
- Solo un gerente invitado, confirmado y activo puede crear empresas. Puede crear
  más de una. Cada empresa conserva propietario, miembros y datos aislados.
  No se promueven automáticamente propietarios a gerentes de plataforma.
  El administrador global no puede aceptar invitaciones del equipo ni operar
  empresas, incluso con una membresía antigua.
- El propietario invita un administrador de empresa o un miembro con permisos
  de lectura/escritura por módulo. Un administrador de empresa solo invita miembros.
  La aceptación aplica el rol y los permisos elegidos. Repetirla no sobrescribe
  cambios posteriores ni reactiva miembros suspendidos. No se invita un propietario
  ni se concede administración global mediante invitaciones del equipo.
- Avisos de gerente utilizan el envío local existente, con intento duradero,
  límites de reenvío y resultado incierto explícito. Staging conserva correo externo
  desactivado. La aceptación se vincula al correo confirmado, no a un enlace portador.

## Esquema y preservación

089 crea cuentas e invitaciones de plataforma, intentos de correo y auditoría;
090 añade rol y permisos a invitaciones de empresa existentes. Son cambios de
esquema del SaaS; no contienen importación o backfill de ADT. El alta del primer
administrador solo se permite mediante una función privada de operador, revocada
para `anon`, `authenticated` y `service_role`; no existe promoción desde el navegador.

La suspensión bloquea los controles comunes de autorización y la edición de
miembros, conserva filas de empresa y equipo y exige una versión vigente.
Los procesos privilegiados históricos y funciones públicas con enlaces ya emitidos
no quedan certificados como una revocación integral de todos los servicios externos.
La app conserva la exclusión de IA y no activa sus credenciales en la candidata.

## Historial de validación y publicación

Comprobación local: lint, tipos, 930 pruebas y compilación correctos. Tras cerrar
la edición antigua de permisos para cuentas suspendidas, las 12 pruebas del nuevo
flujo volvieron a pasar. El ensayo SQL nativo de producción 026–090 terminó con
ROLLBACK_OK y las 34 tablas públicas originales; no persistió platform_accounts.
La consulta incluye comparación de todas las filas/columnas originales de public,
app_private, auth.users y storage.objects, y controla cambios de buckets aparte.

Versión funcional publicada en staging y producción:
`e797ee7178fb56534166ccd09af0f577756d92fc`. CI 37684772239 terminó con success
(check, concurrencia nativa y recuperación). El hosting compiló separadamente
ambos entornos y comprobó 722 archivos contra el archivo oficial de esa revisión;
`next-env.d.ts` se excluye de esa comparación porque lo genera Next durante el build.
Ambas rutas de salud e inicio de sesión devolvieron 200 y el proceso real ejecuta
la revisión esperada. Staging conserva envíos externos desactivados; producción
conserva IA y cola operativa desactivadas, sin credenciales de IA en su entorno activo.

La aplicación persistente terminó con UPGRADE_OK en ambos proyectos. Los controles
compararon las columnas originales de 90 tablas/1.446 filas de staging y 48 tablas/
2.621 filas de producción; permiten solo cambios normales de fechas de login de
Auth y el límite revisado de expense-receipts. Son los conjuntos protegidos de esta
entrega, no una afirmación de inmovilidad de todas las tablas gestionadas por Supabase.
La comparación posterior se ejecuta además en una transacción de solo lectura.
Los dos esquemas terminan en 090 y conservan puntos privados previos.

El historial registra 90 identificadores de versión. Producción no tenía registro:
001–025 se anotan como metadatos de la base manual existente, con hashes de los
archivos que coinciden con su revisión 3c0c412; no se vuelven a ejecutar.
Staging conservó sus 83 entradas originales y registra cinco versiones históricas
035–039 cuyos objetos ya existían, además de 089–090. Esto es historial de esquema,
no traslado de información de ADT. Todo ocurre dentro de la transacción del upgrade.

Se probó el retorno de código de staging a 2f73ee0 y la vuelta a la candidata, con
salud 200, revisión del proceso y sesión auténtica. Fue necesario retirar un proceso
rezagado de Passenger tras el cambio de grupo; la verificación no confundió la
configuración escrita con el proceso que realmente atiende. La lista de empresas
funcionó en ambas versiones. El retorno de código conserva el nuevo esquema; no
se acredita un downgrade de base ni un ensayo de retorno de producción.

El propietario confirmó la ampliación de acceso de la cuenta inicial. El alta
global se aplicó por la función privada de operador y quedó registrada en auditoría.
La sesión auténtica de esa cuenta abrió `/administracion-saas`, mostró la vista de
empresas existentes y el formulario para invitar gerentes. No se modificaron las
membresías de esas empresas ni se promovieron sus propietarios automáticamente.
La evidencia con identidad y asignación de la cuenta permanece fuera del repositorio.
Tras el alta global, la comparación de solo lectura volvió a confirmar las 48
tablas y 2.621 filas protegidas, con una cuenta de plataforma y ninguna invitación.

El propietario introdujo directamente la clave de servicio de producción en el
terminal con entrada oculta. El configurador la validó contra el proyecto correcto,
conservó la configuración privada previa y habilitó los avisos web. El archivo de
entorno mantiene permisos 0600; la credencial no figura en código ni en evidencia.
Después del reinicio se comprobó el proceso de la revisión e797ee7, salud/login 200
y la configuración habilitada. Cada empresa sigue eligiendo su destinatario interno
y la activación del formulario; esta comprobación no envió avisos web externos.

Se creó la primera invitación real de gerente, para el destinatario indicado por
el propietario, y el transporte local aceptó el aviso. La identidad permanece en
evidencia privada. El destinatario confirmó la recepción y posteriormente accedió
a su cuenta. El restablecimiento solicitado después por el propietario retiró
las empresas, usuarios e invitaciones anteriores y conservó únicamente la cuenta
global y los respaldos privados. La recepción de un correo por sí sola no concede
el rol ni demuestra la creación de empresas.

El ensayo transaccional adicional en la base nativa de staging pasó 45
comprobaciones: alta privada, invitación ligada al correo, aceptación confirmada,
varias empresas aisladas, permisos del equipo, suspensión, repetición y límites de
intentos de correo. El rollback dejó cero cuentas de plataforma y cero usuarios
ficticios persistentes. La comparación posterior confirmó las 90 tablas y 1.446
filas protegidas de staging. El ensayo no envió correo ni modificó producción.

El hosting puede elegir explícitamente `*_MAIL_COMPANY_SCOPE=all` para empresas
creadas por gerentes. La omisión conserva la lista previa de empresas. Esto no
concede permisos de envío: los RPC siguen comprobando empresa, módulo, destinatario
y acción confirmada; avisos web requieren además la preferencia de cada empresa.
Staging conserva sus bloqueos y captura sintética.

Se conserva además un punto privado previo dentro de cada proyecto de Supabase,
con filas de public/app_private, auth.users, metadatos de buckets/objetos y las
definiciones de funciones existentes. Tiene RLS y ningún permiso para anon,
authenticated o service_role. Es una copia para esta entrega, no un respaldo
externo completo ni prueba de recuperación de todos los binarios de Storage.
Los controles de aplicación preservan columnas originales y permiten únicamente
los cambios normales de fecha de inicio de sesión de Auth ajenos al esquema.

## Separación de administrador global y gerente

Aclaración del propietario: el administrador del SaaS invita y administra el acceso
de los gerentes. Cada gerente invitado crea sus empresas y gestiona sus equipos,
roles y permisos. La cuenta global no crea empresas ni opera como miembro de una.

La entrada `/empresas` redirige al administrador activo a `/administracion-saas`,
cuyo panel se centra en gerentes e invitaciones. Los gerentes y sus equipos
mantienen su entrada empresarial. El formulario y el RPC de creación exigen un
gerente invitado, confirmado y activo; el administrador global queda excluido.

La migración 091 restringe los controles comunes de autorización empresarial
para cuentas globales, incluso si conservaran una membresía antigua. También
unifica la consulta antigua de invitaciones y el acceso a preferencias de avisos
con los controles actuales. No elimina ni reescribe cuentas, empresas o membresías.
Validación local de la corrección: lint, tipos, 931 pruebas y compilación
correctos. Las 13 comprobaciones del flujo de plataforma incluyen la denegación
de creación al administrador global, la creación por gerente aceptado y el
bloqueo de invitación empresarial, lectura y edición con membresía global antigua.
La publicación exige CI de la revisión exacta, ensayo SQL nativo con rollback,
aplicación de 091 con preservación de filas y verificación de la sesión global.
