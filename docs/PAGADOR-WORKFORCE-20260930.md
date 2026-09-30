# Pagador de gastos de Workforce

## Regla de referencia y alcance

La fuente privada de ADT observada el 29 de septiembre distingue `propio`,
`empresa` y `efectivo_empresa`. `campoExpense` exige escoger un valor y conserva
actor y fecha. La interfaz separa gastos aprobados de bolsillo propio de los
pagados por empresa: estos ultimos no generan reembolso al trabajador.
El contrato se contrasta con esa fuente y la copia local del controlador; no
acredita por si solo la version PHP actualmente desplegada.

Esta entrega implementa declarar el pagador al enviar un gasto, persistir su
proveniencia, consultarlo, filtrarlo y conservarlo en el historial. No confirma
revision IA/humana, reembolso, deuda calculada, transferencia ni copia contable.
La doble decision de encargado/oficina sigue separada del pago.

## Esquema y compatibilidad

Esquema aditivo 051: pagador, usuario y fecha de declaracion. Los gastos anteriores
conservan valores nulos. No se aplica el supuesto historico de ADT de que todo
registro sin metodo fue pagado de bolsillo: los registros anteriores del SaaS no
contienen esa evidencia. Se muestran como Sin declarar y se mantienen fuera de
cualquier inferencia de deuda. Esta diferencia queda explicita; su conciliacion
requerira evidencia cuando se autorice la migracion.

El formulario nuevo exige seleccionar una de las tres opciones. No preselecciona
pagador. La validacion de datos ocurre antes de subir el comprobante. La RPC con
pagador incorpora el valor en el recibo idempotente; cambiarlo conservando la misma
solicitud da conflicto. Importe, recibo, obra y trabajador se conservan.

La firma anterior de la RPC solo reproduce solicitudes ya registradas. Rechaza
altas nuevas sin pagador. Una vuelta a una aplicacion anterior conserva lectura,
decisiones y datos, pero sus altas requieren recargar en esta entrega o posterior.
No debe presentarse como retorno funcional completo mientras este contrato cambie.
No se revierte ni elimina el esquema al volver de codigo.

## Validacion local

Lint, tipos, 455 pruebas y compilacion correctos. Pruebas focalizadas: metodos
validos, nulo/invalido, procedencia, cero efecto financiero, idempotencia vinculada
al pagador, firma anterior, permiso vigente y registros sin declarar.
El ensayo de PostgreSQL 17 incluye envios simultaneos y conflicto de pagador;
los resultados de CI y la sesion real se documentaran tras verificarlos.
Auth/Storage locales simulados no prueban cookies ni cargas binarias reales.

## Pendientes

Revisiones, reembolsos, correccion manual, archivo/restauracion, copia contable,
labor por jornada y las restantes acciones de los 21 modulos siguen abiertas.
No se importa ni sincroniza ADT y no se cambia la autoridad de produccion.
