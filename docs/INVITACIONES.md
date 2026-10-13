# Invitaciones por empresa

Los propietarios y administradores crean una invitación desde Configuración con
el correo del destinatario. Puede crearse antes de que exista la cuenta. La
persona inicia sesión o se registra y confirma ese correo; en Tus empresas puede
aceptar o rechazar la invitación. El emisor define el rol y los permisos antes
de enviarla; la aceptación aplica esos permisos sin sustituir accesos existentes.
Un administrador puede invitar empleados, pero no eliminar ni degradar al
propietario que compró la suscripción. Los empleados no pueden crear empresas.

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

La entrega `d6fe007` incluye los avisos automáticos. Un correo técnico enviado
por el mismo transporte llegó a Recibidos, según confirmación del propietario.
Queda comprobar una invitación nueva desde Configuración con sesión real,
incluido su estado de envío. El ensayo técnico no creó invitaciones ficticias.

## Ensayo externo acotado en staging

El envío general sigue desactivado en staging. Para comprobar una invitación
nueva con un destinatario autorizado existe una opción privada y temporal:
`STAGING_INVITATION_TEST_ENABLED=true`, junto con `STAGING_INVITATION_TEST_COMPANY`,
`STAGING_INVITATION_TEST_INVITATION`, `STAGING_INVITATION_TEST_EMAIL` y
`STAGING_INVITATION_TEST_EXPIRES_AT`. La vigencia máxima es de dos horas. Exige
el destino de staging, HTTPS y la captura de Auth previamente verificada; no
permite habilitar los demás envíos, apuntar al backend de producción ni enviar
invitaciones de gerente. Solo admite el primer aviso de la invitación indicada,
al destinatario que devuelve la base. Los reenvíos quedan bloqueados.

El formulario limita esa invitación a miembro con `clientes:read`. El registro
de ese correo sigue exigiendo la invitación vigente y una empresa con pago válido;
no habilita recuperación de contraseñas para direcciones reales en staging.
La cuota del plan sigue contando miembros activos e invitaciones pendientes.

`scripts/ops/staging-invitation-auth-test.sql` es un procedimiento opcional del
operador, exclusivo del proyecto de staging verificado, sin datos de destinatario.
No forma parte de las migraciones de producción. Su tabla privada vacía no
autoriza ningún correo. Antes de activar una fila deben aprobarse el destinatario,
la invitación y los permisos concretos. Solo el operador puede modificar esa
política; los clientes y la clave de servicio no tienen acceso a ella.

La confirmación original de Auth se captura de forma privada durante este ensayo:
solo `signup`, para el usuario aún sin confirmar y la invitación exacta de consulta.
Cambios de correo, recuperaciones, invitaciones revocadas, roles ampliados y
ventanas vencidas se rechazan. Esta prueba puede acreditar la entrega de la
invitación; no acredita entrega SMTP del correo de confirmación de Auth.

Al terminar, desactivar la fila privada y la opción del entorno, reiniciar staging
y comprobar que los envíos vuelven a quedar bloqueados. Conservar los registros
y resultados del ensayo, sin incluir correos reales ni tokens en Git. Las pruebas
`staging-invitation-mail.test.ts` y `staging-invitation-auth.test.ts` comprueban esos
límites, MIME, duplicados y permisos de la captura. La recepción y aceptación
reales se documentan después de realizarlas; el código preparado no las acredita.
