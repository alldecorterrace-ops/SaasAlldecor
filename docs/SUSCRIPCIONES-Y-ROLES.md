# Suscripciones y roles

Decisión del propietario, 7 de octubre de 2026: autoservicio por suscripción para
dueños, e invitación por correo para su equipo. Implementación candidata;
el cobro permanece desactivado por defecto. No existe una cuenta Stripe
configurada ni evidencia de una transacción en su sandbox. No activar producción
con pruebas locales como sustituto de esa verificación.

## Planes por empresa

| Plan        | USD por mes | Usuarios, incluido el dueño |
| ----------- | ----------: | --------------------------: |
| Inicial     |          29 |                           3 |
| Equipo      |          59 |                           5 |
| Profesional |          99 |                          10 |
| Crecimiento |         179 |                          25 |

Precios de lanzamiento propuestos por el desarrollador a petición del propietario.
Todos incluyen los módulos activos del SaaS; no añaden IA, GPS ni configuradores.
Cada empresa adicional requiere otro plan. No se prometen contabilidad fiscal,
integraciones bancarias, recepción de pagos de clientes ni prestaciones de terceros
por semejanza visual con QuickBooks. Las tarifas no son un cálculo de rentabilidad.

Comparación consultada el 7 de octubre de 2026:

- [QuickBooks](https://quickbooks.intuit.com/pricing/): cuatro niveles pagados,
  1/3/5/25 usuarios; precio normal mensual 38/85/140/340 USD, distinto de la
  oferta de tres meses mostrada en la captura del propietario.
- [Jobber](https://www.getjobber.com/pricing/): Core sin compromiso 49 USD/mes
  para un usuario; Connect para cinco usuarios 199 USD/mes sin compromiso.
- [Housecall Pro](https://www.housecallpro.com/pricing/): Basic 59 USD/mes
  facturado anualmente y 79 USD mensual; un usuario.

Estos productos cubren prestaciones y soporte diferentes. Los planes del SaaS
se diferencian por capacidad de equipo para preservar el alcance funcional existente.

## Roles y límites

| Rol                                     | Empresa                                               | Equipo                                                      | Suscripción                                | Crear otra empresa              |
| --------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------ | ------------------------------- |
| Dueño principal / gerente comprador     | Acceso total a su empresa                             | Invita y administra roles                                   | Portal del pagador                         | Con una nueva compra verificada |
| Administrador de empresa / acceso total | Acceso total a esa empresa                            | Invita miembros y administradores; cambia o suspende equipo | Consulta estado; el pagador gestiona pagos | No por ser administrador        |
| Empleado                                | Módulos y acciones asignados                          | Sin invitaciones                                            | Sin datos del pagador                      | No por ser empleado             |
| Solo consulta                           | Acciones de lectura asignadas                         | Sin invitaciones                                            | Sin datos del pagador                      | No por ser lector               |
| Administrador global del SaaS           | Administración de plataforma, sin membresía operativa | Conserva gestión de gerentes existente                      | Sin portal de pagadores ajenos             | No                              |

Un empleado que compra su propio plan puede convertirse en dueño de otra empresa;
no obtiene derechos nuevos en la empresa donde era empleado. Una identidad de Auth
puede pertenecer a varias empresas con permisos independientes.

Las cuentas/empresas actuales y los gerentes invitados existentes se conservan.
El origen `invitation` mantiene su alta manual previa; nuevos compradores tienen
origen `subscription` y no pueden usar `create_company` para crear empresas gratis.
Las pruebas históricas de reglas anteriores están fijadas a la migración 092.
La nueva matriz se prueba con la migración 093.

El dueño principal no se puede quitar, suspender, degradar ni cambiar por estas
pantallas/RPC, y un disparador protege su membresía. No se implementa transferencia
de titularidad; requeriría un proceso separado, con aceptación de ambos titulares.
Suspender un empleado conserva sus datos e historial y libera su plaza; no borra
su identidad de otras empresas. Las invitaciones duran siete días y reservan plazas.
Una reducción de plan no elimina empleados: bloquea nuevas altas cuando no hay cupo.

## Compra y activación

1. `/planes` recoge plan, correo del dueño y nombre de empresa. Importe y Stripe
   Price se resuelven en el servidor, sin aceptar importes del navegador.
2. El servidor guarda una orden y abre Stripe Checkout en modo suscripción.
   El mismo request UUID conserva la clave de idempotencia.
3. El webhook usa el cuerpo sin modificar, firma v1 y tolerancia de cinco minutos.
   Consulta Checkout/subscription vigentes en Stripe y verifica modo, cliente,
   metadatos, correo, moneda USD, cantidad uno, importe e intervalo mensual.
4. Solo el servicio de facturación registra el evento verificado. La base rechaza
   cambios de orden/cliente, reenvíos con hash distinto y estados antiguos.
5. El comprador crea su contraseña y confirma su correo; una orden pagada vigente
   permite su alta en Auth. Un retorno a la URL de éxito no concede derechos.
6. Al volver de Checkout con sesión confirmada o entrar en Tus empresas, una RPC
   idempotente crea su empresa y membresía owner en una transacción. El dueño
   invita a su equipo, que crea su contraseña, confirma correo y acepta el acceso.

No almacenar tarjetas. No enviar contraseñas ni enlaces de recuperación desde
el administrador. Las notificaciones de invitación existentes siguen sus controles
de entorno e idempotencia; staging conserva captura privada y correo externo apagado.

Las empresas con suscripción vencida, impaga o cancelada conservan lectura.
La autorización común y disparadores de escritura cubren los escritores antiguos;
las escrituras y nuevas invitaciones se rechazan. Cancelación al final del período
mantiene acceso mientras el estado siga activo y el período pagado esté vigente.
Una renovación impaga no prolonga el período previamente pagado.

## Preparar sandbox de Stripe

Mantener `SAAS_BILLING_MODE=disabled` hasta configurar una cuenta sandbox.
Usar exclusivamente proyecto Supabase y dominio de staging separados.
Crear cuatro productos/precios USD recurrentes mensuales que coincidan con la tabla.
La aplicación verifica precio y cantidad; no basta asignar un identificador arbitrario.
Configurar el portal de cliente en Stripe y revisar cancelación, cambios de plan,
prorrateo, impuestos y recibos antes de una futura apertura comercial.

Variables solo de servidor: `SAAS_STRIPE_SECRET_KEY`, `SAAS_STRIPE_WEBHOOK_SECRET`,
`SAAS_BILLING_SUPABASE_SERVICE_KEY`, y los cuatro `SAAS_STRIPE_PRICE_*`.
Nunca introducir valores privados en GitHub, Next public env, capturas o chat.
Modo `test` exige APP_ENVIRONMENT staging y clave sk_test. Modo live exige producción
y clave sk_live. No copiar claves de producción a staging.

Endpoint: `/api/subscriptions/webhook`. Eventos snapshot soportados:
`checkout.session.completed`, `checkout.session.async_payment_succeeded`,
`customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`,
`invoice.payment_failed`. Registrar la entrega fallida en Stripe y reintentar tras
resolver la causa; la persistencia se completa antes de responder 200.

Aplicar migraciones 092 y 093 con respaldo/verificación en staging antes del código.
Configurar Authentication > Hooks > Before User Created -> Postgres
`public.require_signup_invitation`. La función 093 conserva el hook y permite
invitación vigente o compra verificada; editar el formulario no sustituye este hook.

## Límites de prueba

Las pruebas locales usan contratos mínimos de Auth y PGlite, y respuestas Stripe
sintéticas. Verifican permisos, aislamiento, reservas, firma, pago y transacciones;
no acreditan emisión real de JWT, correo, tarjeta, entrega de webhook de Stripe,
prorrateo, recuperación de conexión ni impuestos. Antes de publicar, verificar
esas partes en los servicios reales, con datos y tarjetas de prueba.

Referencias oficiales:
[Roles de Intuit](https://quickbooks.intuit.com/learn-support/en-global/help-article/access-permissions/user-roles-access-rights-quickbooks-online/L66POfRrI_ROW_en),
[Invitaciones de Intuit](https://quickbooks.intuit.com/learn-support/en-us/help-article/manage-users/add-manage-users-quickbooks-online/L1welhiJZ_US_en_US),
[Stripe Checkout](https://docs.stripe.com/api/checkout/sessions/create),
[Verificación y reintentos de eventos](https://docs.stripe.com/events/manage-webhook-endpoints).
