# Suscripciones compartidas entre empresas

Estado: publicado en staging y verificado con un pago ficticio en el sandbox
permanente el 16 de octubre de 2026. La apertura comercial sigue pendiente.

## Problema y decisión

El modelo anterior asociaba una compra a una empresa. La decisión del propietario
permite hasta tres empresas en Equipo y empresas ilimitadas en Profesional y
Crecimiento, con un cupo mensual de facturas compartido expresamente confirmado.

Se conserva `billing_orders` como contrato y se añade `billing_company_links`.
La empresa principal permanece en `billing_orders.company_id` para compatibilidad
con Checkout, portal, auditoría y reactivación. Las empresas adicionales no generan
otra compra. Solo el dueño confirmado y activo puede crearlas mediante
`create_subscription_company`; miembros y administradores conservan permisos por
empresa y nunca obtienen administración de otras empresas por compartir plan.

No se eligió duplicar la orden por empresa: duplicaría cobros, cupos y estados de
cancelación. Tampoco agrupar empresas por email: el vínculo explícito evita que
un cambio de correo transfiera empresas o derechos de pago.

## Límites y concurrencia

Todas las reservas toman el bloqueo de la fila de la orden antes de leer consumo.
Esto serializa altas de empresas, invitaciones y reactivaciones de miembros entre
empresas distintas. Las funciones de equipo toman primero ese bloqueo y después
los de invitación/membresía para mantener un orden consistente.

Las plazas se calculan por identidad distinta: dueño, miembros activos e invitados
vigentes. Un email de invitación se une a su identidad Auth existente cuando la
hay. Invitar a la misma persona a otra empresa no consume una segunda plaza.

Un disparador de inserción de facturas reserva cuota bajo ese mismo bloqueo y
escribe `billing_invoice_usage`. La transacción de aprobación del estimado y su
proyecto se revierte si no hay cupo. La fecha de consumo procede del reloj del
servidor después de obtener el bloqueo, no de la fecha editable de la factura.
El registro de consumo sobrevive a la anulación/eliminación de la factura y a la
reactivación del plan; usuarios y servicios cliente no pueden editarlo.

## Catálogo y compatibilidad

Los límites ilimitados son `null`, sin cifras arbitrarias. El catálogo versionado
conserva precios, plazas y condiciones de las órdenes anteriores; no se recalculan
contra los nuevos precios. Los webhooks identifican el catálogo por el Price
configurado en el servidor, verifican el importe y deben coincidir con la orden.
Una configuración anterior permite seguir reconciliando su historial pero no
abrir Checkout con un precio distinto al mostrado en la nueva página.

El cambio es aditivo respecto a empresas, usuarios, membresías e invoices. El
único índice de datos existentes es el registro de consumo de facturas SaaS
vinculadas a órdenes previas. No hay importación de ADT ni modificación de facturas.

## Validación y despliegue

- `tests/subscription-portfolios.test.ts`: catálogo, cuotas de los cuatro planes,
  aislamiento, titular protegido, reintentos, retroactividad, anulación, cambio de
  mes y preservación de órdenes anteriores.
- `scripts/test-subscription-portfolio-concurrency.ts`: PostgreSQL real, carreras
  entre empresas para las últimas plazas, empresas e invoices, y aprobación atómica.
- Pruebas históricas 092/094 conservan el contrato original; se sigue ejecutando
  el recorrido de Auth con el esquema vigente.
- Migración primero, código después, commit exacto y CI satisfactorio antes de
  staging. Mantener la entrega anterior, sin revertir ni borrar datos para volver.
- Tras crear una orden del nuevo catálogo, no volver al código anterior para
  facturación: desconoce ese catálogo. Deshabilitar compras, conservar datos y
  corregir hacia delante. Antes de nuevas compras, el código anterior conserva
  acceso básico, pero no muestra la agrupación ni sus límites nuevos.
- Sandbox permanente autorizado el 16 de octubre: cuatro Prices comprobados y
  compra ficticia de Equipo por 99.99 USD con Checkout, eventos firmados y orden
  activa en el SaaS. La sesión del comprador confirmó activación, propietario
  protegido, portal, cancelación al final del período y restauración. La creación
  de tres empresas compartió una plaza del dueño y cerró el alta al llegar al
  cupo. Ver `SUSCRIPCIONES-Y-ROLES.md` para los límites de evidencia. No hubo
  cobros reales.

La atención por email/teléfono, sitio web y cambios de módulos son prestaciones
incluidas en el catálogo. Se deben acordar contactos y alcance con el operador
antes de ofrecer atención comercial; no se inventan canales ni entregas.
