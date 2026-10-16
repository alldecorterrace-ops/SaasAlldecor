# Suscripciones y roles

Decisiones del propietario, 7 y 16 de octubre de 2026: autoservicio por
suscripción para dueños e invitación por correo para su equipo. El catálogo del
16 de octubre permite varias empresas dentro de la misma suscripción. El cobro
permanece desactivado por defecto. El 16 de octubre el propietario autorizó
conectar su sandbox permanente a staging, sin activar cobros reales.

## Planes por suscripción

| Plan        | USD/mes | Usuarios totales | Empresas   | Facturas/mes compartidas | Servicios incluidos                                                                      |
| ----------- | ------: | ---------------- | ---------- | ------------------------ | ---------------------------------------------------------------------------------------- |
| Inicial     |   29.99 | 1: dueño         | 1          | 10                       | Módulos activos                                                                          |
| Equipo      |   99.99 | 5: dueño + 4     | 3          | 100                      | Módulos activos                                                                          |
| Profesional |  299.99 | 21: dueño + 20   | Ilimitadas | Ilimitadas               | Atención por email                                                                       |
| Crecimiento |  499.99 | Ilimitados       | Ilimitadas | Ilimitadas               | Email, teléfono, creación de sitio web personalizado y cambios personalizados en módulos |

Precios y capacidades definidos por el propietario.
Todos incluyen los módulos activos del SaaS; no añaden IA, GPS ni configuradores.
El dueño añade empresas a la suscripción desde Tus empresas, hasta su límite.
Cada empresa conserva permisos, información e historial separados. Los servicios
de web y módulos se coordinan con el equipo; este catálogo registra el derecho
al servicio, no acredita que un sitio o una personalización estén entregados.
No se prometen contabilidad fiscal,
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

La comparación anterior es contexto histórico del primer catálogo. Los importes
y capacidades vigentes son la decisión explícita posterior del propietario.

Las facturas se cuentan al crearlas, sumadas entre todas las empresas del plan,
por mes natural UTC. El contador se renueva a las 00:00 UTC del primer día del
mes. Reenviar, pagar o reintentar una factura existente no consume otra unidad.
Anularla, eliminarla o fecharla retroactivamente no libera cupo. Al alcanzar el
límite se conserva la consulta, cobro y edición de lo existente; una aprobación
que requiere otra factura se rechaza completa, sin aprobar el estimado ni dejar
un proyecto parcial. Las cuotas son restricciones en la base, no solo en pantalla.

## Roles y límites

| Rol                                     | Empresa                                               | Equipo                                                      | Suscripción                                | Crear otra empresa              |
| --------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------ | ------------------------------- |
| Dueño principal / gerente comprador     | Acceso total a sus empresas del plan                  | Invita y administra roles por empresa                       | Portal del pagador                         | Dentro de la capacidad del plan |
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
Las pruebas históricas de reglas anteriores están fijadas a las migraciones
092/094. La matriz de suscripciones compartidas se prueba con la migración 095.

El dueño principal no se puede quitar, suspender, degradar ni cambiar por estas
pantallas/RPC, y un disparador protege su membresía. No se implementa transferencia
de titularidad; requeriría un proceso separado, con aceptación de ambos titulares.
Suspender un empleado conserva sus datos e historial. Su plaza se libera cuando
ya no tiene acceso activo ni otra invitación pendiente en ninguna empresa de esa
suscripción; no borra su identidad de otras empresas. Las invitaciones duran siete
días y reservan plazas. Una persona invitada a varias empresas del mismo plan
cuenta una sola vez; el dueño siempre cuenta.
Una reducción de plan no elimina empleados: bloquea nuevas altas cuando no hay cupo.

## Compra y activación

1. `/planes` recoge plan, correo del dueño y nombre de empresa. Importe y Stripe
   Price se resuelven en el servidor, sin aceptar importes del navegador.
2. El servidor consulta el Price de Stripe y comprueba que esté activo, en el modo
   esperado, con el importe exacto, moneda USD y recurrencia mensual del catálogo.
   Después guarda una orden y abre Stripe Checkout en modo suscripción.
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
Una renovación impaga no prolonga el período previamente pagado. Una suscripción
cancelada o incomplete_expired es terminal y no se reactiva por un evento retrasado,
incluso con la misma marca temporal.

## Reactivación de una suscripción cancelada

El dueño principal confirmado puede iniciar una nueva suscripción desde la
configuración de su empresa cuando la anterior está cancelada o su pago inicial
ha vencido. Una cancelación programada todavía activa se gestiona en el portal;
no permite contratar otra suscripción simultánea.

El servidor conserva todas las empresas, dueño, cliente de Stripe, equipo, permisos e
historial. Cada intento se registra en `billing_reactivations`, con un único
intento pendiente por orden. Solicitudes simultáneas y reintentos reutilizan el
mismo Checkout. Una sesión completada o pagada permanece en verificación; no
crea otro pago. Solo una sesión que Stripe confirma vencida e impaga permite
reservar otro intento. El plan debe cubrir las empresas y personas distintas
activas o invitadas antes de abrir el pago y de activar la nueva suscripción.
La reactivación desde cualquier empresa conserva la orden principal y no reinicia
el uso mensual de facturas.

Checkout y la suscripción incluyen la misma orden e identificador de intento
en sus metadatos. Tras verificar un pago vigente, la base promueve la nueva
suscripción en la orden existente y conserva una copia inmutable del estado
anterior. Los eventos de suscripciones retiradas quedan registrados, pero no
pueden alterar la suscripción actual ni resucitar una cancelación. El dueño
principal sigue protegido frente a eliminación, suspensión o degradación.

## Preparar sandbox de Stripe

Mantener `SAAS_BILLING_MODE=disabled` hasta configurar una cuenta sandbox.
Usar exclusivamente proyecto Supabase y dominio de staging separados.
Crear cuatro productos/precios USD recurrentes mensuales que coincidan con la tabla.
La aplicación verifica precio y cantidad; no basta asignar un identificador arbitrario.
Configurar el portal de cliente en Stripe y revisar cancelación, cambios de plan,
prorrateo, impuestos y recibos antes de una futura apertura comercial.

Variables solo de servidor: `SAAS_STRIPE_SECRET_KEY`, `SAAS_STRIPE_WEBHOOK_SECRET`,
`SAAS_BILLING_SUPABASE_SERVICE_KEY`, y los cuatro `SAAS_STRIPE_PRICE_*`.
El catálogo nuevo exige `SAAS_BILLING_CATALOG_VERSION=20261016` y cuatro Prices
nuevos con 2999/9999/29999/49999 centavos. Conservar los identificadores anteriores
en `SAAS_STRIPE_LEGACY_PRICE_*` mientras existan suscripciones de prueba del catálogo 20261007. No cambiar su precio ni vincularlo al nuevo catálogo. Si no se configura
la versión nueva, se bloquean las compras nuevas y se conservan los webhooks y el
portal del catálogo anterior. Una configuración sin versión se interpreta como
20261007 por compatibilidad. Crear Prices nuevos no es cambiar cobros existentes.
Nunca introducir valores privados en GitHub, Next public env, capturas o chat.
Modo `test` exige APP_ENVIRONMENT staging y clave sk_test o la clave temporal restringida rkcs_test de Stripe CLI.
Esta última nunca es válida en modo live. REST y endpoint de webhook deben usar
la misma versión 2026-09-30.endive. Modo live exige producción
y clave sk_live. No copiar claves de producción a staging.

Endpoint: `/api/subscriptions/webhook`. Eventos snapshot soportados:
`checkout.session.completed`, `checkout.session.async_payment_succeeded`,
`customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`,
`invoice.payment_failed`. Registrar la entrega fallida en Stripe y reintentar tras
resolver la causa; la persistencia se completa antes de responder 200.

Aplicar hasta la migración 095 con respaldo/verificación en staging antes del código.
La 095 agrega vínculos y un registro de consumo; indexa facturas SaaS ya existentes
sin modificarlas ni importar información de ADT. Las órdenes previas mantienen
el catálogo 20261007 y sus condiciones originales. Una reactivación elegida por el
dueño puede pasar al catálogo nuevo, conservando el consumo del mes.
Configurar Authentication > Hooks > Before User Created -> Postgres
`public.require_signup_invitation`. La función 093 conserva el hook y permite
invitación vigente o compra verificada; editar el formulario no sustituye este hook.

## Límites de prueba

Las pruebas locales usan contratos mínimos de Auth y PGlite, y respuestas Stripe
sintéticas. Verifican permisos, aislamiento, reservas, firma, pago y transacciones;
no acreditan emisión real de JWT, correo, tarjeta, entrega de webhook de Stripe,
prorrateo, recuperación de conexión ni impuestos. Antes de publicar, verificar
esas partes en los servicios reales, con datos y tarjetas de prueba.

La validación de staging del 13 de octubre de 2026 comprobó el alta del comprador,
administrador y empleado, confirmaciones originales capturadas, permisos y cuotas.
La reactivación atravesó Checkout y los eventos firmados de Stripe, conservando
la misma empresa, tres miembros y una ficha de cliente con su historial. Salir y
retomar el pago reutilizó la sesión de Checkout.

Para probar facturas recurrentes en el sandbox temporal se cerró un breve período
de prueba ficticio: Stripe emitió una factura mensual completa pagada. Otro intento
con un método oficial de rechazo produjo `past_due`; el SaaS bloqueó cambios y
conservó el período pagado. Pagar esa misma factura ficticia restauró el acceso.
Esta prueba verifica facturación, entrega firmada, rechazo y recuperación; no
equivale a avanzar un mes con un reloj de Stripe. El sandbox sin reclamar rechaza
el endpoint de relojes. La cuenta permanente estaba aplazada en esa prueba.
La prueba posterior de invitación a un destinatario autorizado confirmó llegada a
Recibidos, registro, confirmación nativa desde la captura privada, inicio de sesión
y aceptación con acceso solo de consulta a Clientes. La ruta de administración
rechazó ese acceso. Se restauraron todos los ajustes temporales; se conservan las
cuatro membresías activas, el propietario y los datos anteriores. Esta evidencia
no acredita entrega SMTP de confirmaciones o recuperación de contraseña.
La evidencia privada permanece fuera de GitHub; producción mantiene facturación
deshabilitada.

La conexión del 16 de octubre verificó los cuatro Prices del catálogo 20261016
en el sandbox permanente: USD mensuales, activos y con importes exactos. Se abrió
Checkout desde `/planes` y se completó una compra ficticia de Equipo por 99.99 USD.
Stripe entregó `checkout.session.completed` y `invoice.paid`; la orden quedó
activa, con pago verificado y catálogo 20261016. El primer `invoice.paid` llegó
antes del evento de Checkout y obtuvo 500; el reintento automático fue aceptado
con 200. Un webhook sin firma se rechazó con 400.
El portal está configurado para consultar facturas, actualizar el medio de pago
y cancelar al final del período; el cambio de plan desde Stripe está desactivado.
La comprobación posterior con la sesión real del comprador confirmó la activación
de una única empresa y su membresía de propietario. La pantalla protege esa
membresía y muestra el plan Equipo con cinco plazas, tres empresas y cien facturas
mensuales compartidas. El portal se abrió desde el botón del SaaS, mostró la factura
pagada y permitió programar la cancelación al final del período. El SaaS recibió
el cambio; después se retiró la cancelación y ambas pantallas volvieron a mostrar
la suscripción activa, sin generar otro cobro.
Se crearon la segunda y la tercera empresa mediante la sesión del dueño. El
resumen mantuvo una sola plaza ocupada y mostró tres empresas de tres; el
formulario de creación dejó de ofrecerse al completar el cupo. Se conservaron
las empresas ficticias como evidencia. Esto completa el recorrido de compra,
activación y gestión del portal en pruebas; no acredita cobros de producción.

El historial del sandbox temporal se conserva. Sus clientes y suscripciones
pertenecen a otra cuenta Stripe: conservar sus Prices permite identificar el
catálogo, pero no hace accesible su portal con la clave de la cuenta nueva.
No sobrescribir esos identificadores ni simular una migración de suscripciones.
Producción conserva facturación deshabilitada y su entorno sin modificaciones.

Referencias oficiales:
[Roles de Intuit](https://quickbooks.intuit.com/learn-support/en-global/help-article/access-permissions/user-roles-access-rights-quickbooks-online/L66POfRrI_ROW_en),
[Invitaciones de Intuit](https://quickbooks.intuit.com/learn-support/en-us/help-article/manage-users/add-manage-users-quickbooks-online/L1welhiJZ_US_en_US),
[Stripe Checkout](https://docs.stripe.com/api/checkout/sessions/create),
[Verificación y reintentos de eventos](https://docs.stripe.com/events/manage-webhook-endpoints).

## Sandbox temporal de desarrollo

Stripe CLI permite provisionar un sandbox temporal sin cuenta comercial, con
credenciales de prueba restringidas. Caduca a los siete días; conservarlo requiere
que el propietario reclame la cuenta directamente en Stripe. No publicar las
claves ni la URL privada de reclamación. Crear productos, precios y endpoints en
ese sandbox no acredita todavía un pago, alta o entrega real de webhook.
[Sandbox de Stripe CLI](https://docs.stripe.com/cli/sandbox).
