# Invitaciones por empresa

Los propietarios y administradores crean una invitación desde Configuración con
el correo del destinatario. Puede crearse antes de que exista la cuenta. La
persona inicia sesión o se registra y confirma ese correo; en Tus empresas puede
aceptar o rechazar la invitación. El acceso inicial es de miembro sin módulos.
El administrador asigna después los permisos en Miembros y permisos.

La invitación vence a los siete días. Los administradores pueden revocar las
pendientes, consultar sus estados y crear otra cuando la anterior haya vencido,
sido rechazada o revocada. Se conserva el historial. Los reintentos no duplican
invitaciones ni prolongan su vigencia. Un miembro existente se administra en la
lista de permisos, sin utilizar invitaciones para reactivar una suspensión.

El envío automático del aviso por correo sigue pendiente. La interfaz lo indica
expresamente y permite copiar el acceso general al SaaS para compartirlo. SMTP
de Supabase para recuperación no constituye un servicio de envío de avisos de
empresa desde la aplicación. No se utiliza ni se expone una clave administrativa.

## Controles

- La base comprueba al administrador y la empresa, incluso con RPC directo.
- Solo el correo actual y confirmado en Auth puede ver y aceptar su invitación.
- La cuenta que emitió la invitación debe seguir siendo administrador activo.
- No hay token público de acceso, lectura anónima ni escritura directa de tablas.
- La aceptación no modifica permisos existentes ni reactiva miembros suspendidos.
- Crear, aceptar, rechazar y revocar registra eventos de auditoría.

Migración adicional: `202609180015_invitations.sql`. Se aplica una sola vez,
después de 001–014. Para revertir la aplicación se puede volver a la entrega
anterior dejando esta tabla y sus registros; no es necesario borrar información.

`tests/invitations.test.ts` comprueba correo sin confirmar, suplantación de
correo en claims, aislamiento, reintentos, vencimiento, revocación, rechazo,
permisos posteriores y suspensión. `tests/full-audit.test.ts` comprueba los
permisos de todas las tablas y funciones después de aplicar las 15 migraciones.
El recorrido de una segunda cuenta en navegador se registra por separado.
