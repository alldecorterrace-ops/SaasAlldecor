# Administración global y alta de empresas

Solicitud del propietario del 7 de octubre de 2026: un administrador global invita
gerentes; cada gerente crea sus empresas y añade su equipo con roles definidos.
No trasladar datos de ADT. IA, prueba física de GPS y configuradores/3D siguen excluidos.
La identidad de la cuenta inicial permanece en el canal privado del propietario.

## Comportamiento implementado

- `/administracion-saas` exige administrador global activo y cuenta confirmada.
  Invita gerentes por correo, consulta invitaciones y su intento de envío,
  revoca las pendientes y puede suspender/reactivar gerentes con confirmación
  y control de versión. La vista global muestra empresas y cantidad de miembros;
  no concede acceso a sus datos operativos por el solo rol global.
- El destinatario entra o se registra con el mismo correo, confirma su cuenta
  y acepta la invitación en `/empresas`. La invitación vence a los siete días;
  su aceptación repetida no reactiva una cuenta suspendida.
- Solo un gerente invitado, confirmado y activo puede crear empresas. Puede crear
  más de una. Cada empresa conserva propietario, miembros y datos aislados.
  Los propietarios actuales conservan sus empresas; no se promueven automáticamente
  a gerentes de plataforma ni se modifica su membresía.
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

## Validación y publicación

Comprobación local: lint, tipos, 930 pruebas y compilación correctos. Tras cerrar
la edición antigua de permisos para cuentas suspendidas, las 12 pruebas del nuevo
flujo volvieron a pasar. El ensayo SQL nativo de producción 026–090 terminó con
ROLLBACK_OK y las 34 tablas públicas originales; no persistió platform_accounts.
La consulta incluye comparación de todas las filas/columnas originales de public,
app_private, auth.users y storage.objects, y controla cambios de buckets aparte.

Pendiente antes de declarar operativo: CI del commit publicado, respaldo privado
previo a la aplicación persistente, publicación de la candidata, asignación de la
cuenta global solicitada y recorrido con sesión auténtica. No se han enviado
invitaciones reales ni se acredita recepción de un nuevo correo en estas pruebas.

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
