# Cambios de plan

Regla confirmada por el dueño del producto el 19 de octubre de 2026. Aplica al catálogo 20261016: Inicial $29.99, Equipo $99.99, Profesional $299.99 y Crecimiento $499.99, en USD al mes.

- El dueño principal revisa una propuesta calculada por Stripe antes de confirmar. Administradores y empleados no pueden cambiar la suscripción.
- Una subida factura la diferencia proporcional del período actual. El acceso al nuevo plan espera la confirmación del pago. Un pago pendiente conserva el plan anterior y puede completarse en la factura alojada por Stripe.
- Una bajada no cobra inmediatamente y conserva el plan actual hasta la renovación. Se comprueba que todas las empresas, personas e invitaciones pendientes quepan en el nuevo plan al preparar y confirmar la propuesta. Después de confirmar, también se limita el crecimiento del equipo y las empresas a esa capacidad futura.
- Las facturas y las empresas se conservan. El cambio no reinicia el contador mensual de facturas: sigue siendo compartido por suscripción y se renueva el primer día del mes a las 00:00 UTC.
- Una solicitud tiene una propuesta de 15 minutos, claves de idempotencia estables, historial y exclusión de operaciones simultáneas. Los reintentos reconcilian el mismo cambio; no crean otra compra.
- El dueño puede descartar una propuesta, cancelar un pago de subida pendiente o cancelar una bajada programada. Liberar el calendario de bajada conserva la suscripción. Un pago que ya terminó prevalece sobre la cancelación.
- Los precios históricos del catálogo 20261007 y las suscripciones con impuestos, descuentos u otras condiciones especiales no se convierten automáticamente.

## Mecanismo y comprobación

Migración aditiva 096: solicitudes, propuestas, confirmación del dueño, bloqueo por suscripción, reserva de capacidad futura y comprobación de pago antes de aplicar el plan. Los datos de negocio y los cobros anteriores no se reescriben.

La subida usa [`pending_if_incomplete`](https://docs.stripe.com/billing/subscriptions/pending-updates), una [vista previa con la misma fecha de prorrateo](https://docs.stripe.com/api/invoices/create_preview) y una clave de idempotencia por solicitud. La bajada usa dos fases de un [calendario de suscripción](https://docs.stripe.com/billing/subscriptions/subscription-schedules), con `end_behavior=release`. El servidor comprueba la suscripción actual en Stripe antes de reconciliar sus límites.

`tests/subscription-plan-change.test.ts` cubre las doce transiciones, permisos, importes, pago incompleto, reintento, redirecciones, programación y conservación de cuotas. `scripts/test-subscription-plan-change-concurrency.ts` enfrenta confirmación, invitaciones y empresas concurrentes en PostgreSQL nativo, además de las operaciones concurrentes contra Stripe.

Las pruebas automatizadas usan datos sintéticos. Las pruebas del proveedor y la publicación se hacen en staging y en Stripe sandbox; no acreditan cobros reales ni una renovación mensual real hasta que exista evidencia de esas acciones.
