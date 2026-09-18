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

El aviso automático usa el servicio local de correo del hosting. Se habilita en
el entorno privado con `INVITATION_MAIL_ENABLED=true`, `MAIL_FROM_ADDRESS` y
`MAIL_FROM_NAME`, y necesita `NEXT_PUBLIC_SITE_URL` con HTTPS. No reutiliza la
contraseña SMTP de Supabase ni requiere una clave administrativa.

La pantalla muestra cada resultado: aceptado por el servidor de correo, fallo
o resultado sin confirmar. Aceptado no acredita recepción en la bandeja. Hay
reenvío manual, con cinco minutos de espera, tres intentos por invitación y 50
por empresa en 24 horas. Los resultados inciertos no se reintentan solos. El
aviso enlaza a Tus empresas, sin tokens de acceso; la aceptación sigue exigiendo
el correo confirmado. No se envían avisos retroactivos a invitaciones aceptadas.

## Controles

- La base comprueba al administrador y la empresa, incluso con RPC directo.
- Solo el correo actual y confirmado en Auth puede ver y aceptar su invitación.
- La cuenta que emitió la invitación debe seguir siendo administrador activo.
- No hay token público de acceso, lectura anónima ni escritura directa de tablas.
- La aceptación no modifica permisos existentes ni reactiva miembros suspendidos.
- Crear, aceptar, rechazar y revocar registra eventos de auditoría.

Migraciones adicionales: `202609180015_invitations.sql` y
`202609180016_invitation_email.sql`, aplicadas una sola vez y en orden.
Para deshabilitar avisos basta con `INVITATION_MAIL_ENABLED=false` y reiniciar. Para revertir la aplicación se puede volver a la entrega
anterior dejando esta tabla y sus registros; no es necesario borrar información.

`tests/invitations.test.ts` comprueba correo sin confirmar, suplantación de
correo en claims, aislamiento, reintentos, vencimiento, revocación, rechazo,
permisos posteriores y suspensión. `tests/full-audit.test.ts` comprueba los
permisos de todas las tablas y funciones después de aplicar las 16 migraciones.
El recorrido de una segunda cuenta en navegador se registra por separado.

`tests/invitation-mail.test.ts` cubre MIME, destinatarios, aislamiento, cuotas,
reintentos y resultados inciertos. La aceptación con una segunda cuenta fue
confirmada por el propietario y corroborada en la base remota. La entrega real
del aviso se documenta separadamente de las pruebas locales.
