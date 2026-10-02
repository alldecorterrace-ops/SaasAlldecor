# Deuda y constancias de reembolso — 1 de octubre de 2026

## Estado de esta entrega

Contrato aditivo 061 aplicado y entrega **b312b40** activa en staging; retorno
**fb640bd** compatible. Lint, tipos, **540/540 pruebas** y compilación aprobados
en CI del commit exacto. Concurrencia PostgreSQL nativa aprobada. Pantalla,
reapertura, archivo/restauración, costos y empresa restringida comprobados en sesión.
Producción y ADT conservan su operación. No hay transferencia ni integración bancaria.

## Referencia y diferencias conocidas

El panel actual de ADT separa gastos aprobados de bolsillo propio, tarjeta y
efectivo de la empresa. Confirmar todos exige revisar cada recibo y confirmar que
el pago ya ocurrió. Archivo/restauración conservan evidencia de pagos anteriores.
Fuente pública renovada el 1 de octubre, huella documentada en la matriz.

La copia privada de CrmController.php, SHA-256
cd5ebd45684b313b92baa6be9757975c59bc62fde95b1a3cb8e0a8d3d30db021,
contiene exp_saldos, exp_pagar_todo y exp_paid. No acredita una renovación del
controlador del servidor actual. El contraste de esta versión sigue pendiente.

ADT interpreta el pagador vacío de registros antiguos como bolsillo propio.
El SaaS conserva sus registros sin pagador como incidencia, sin inventar deuda.
No hay importación o corrección automática de esos registros: su tratamiento
requiere conciliación y una decisión al reanudar la migración.

## Comportamiento implementado

- Deuda: gasto aprobado por oficina, bolsillo propio, activo y sin constancia.
  Los importes sin revisión siguen visibles como deuda, con impedimento para
  confirmar el reembolso. Tarjeta y efectivo de empresa quedan separados.
- Confirmación de un gasto o del conjunto completo de un trabajador, hasta 100
  registros. La selección captura identificadores, versiones e importe esperado.
  Un conjunto cambiado exige recargar; no incluye nuevos gastos silenciosamente.
- Recibo existente y revisión humana vigente obligatorios. Son válidas las
  correcciones administrativas revisadas o la revisión receipt-v4 confirmada.
  Un cambio de jornada que invalida el contexto IA impide registrar la constancia.
- Únicamente propietario/administrador con escritura en Horas. Los permisos
  actuales se vuelven a comprobar antes de aceptar un reintento almacenado.
- Solicitud, efecto, auditoría y resultado en una transacción; bloqueo por
  trabajador y filas ordenadas. Un reenvío no vuelve a marcar ni aumenta el costo.
- Actor, fecha, nota y fotografía lógica del recibo/revisión quedan conservados.
  El gasto mantiene ambas aprobaciones; reembolso y costo son estados separados.
- Archivo elimina deuda activa sin borrar el pago registrado. Restauración
  recupera el estado previo y nunca genera una segunda constancia.
- Registro de Gastos: bolsillo propio aprobado se proyecta PENDIENTE o PAGADO;
  empresa se mantiene NO_APLICA. No se crea una copia en Gastos ni en Pagos.
- Pantalla autenticada en Horas → Reembolsos, detalle por trabajador, enlace al
  recibo y últimas veinte constancias; el historial conserva las anteriores.
  La confirmación pide declarar que el reembolso ya se realizó.

## Comprobaciones

Trece pruebas de comportamiento nuevas: contrato de pantalla frente a SQL real,
confirmación expresa, solo bolsillo propio, lote sin revisión bloqueado, lote
completo, importes/versiones obsoletos, permisos, dos empresas, revocación,
reintentos, archivo/restauración, contexto IA cambiado y ausencia de pagos/copias.
El registro unificado mantiene costo y centavos. El lote completo reduce deuda
sin modificar el costo de proyecto.

El [CI de b312b40](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36950336251)
terminó con sus tres jobs aprobados. PostgreSQL nativo: ocho reenvíos de la misma
solicitud producen un efecto; solicitudes distintas, individual contra lote y
archivo concurrente producen un efecto cada uno. Las huellas de pagos y gastos
administrativos permanecen iguales. El CI también conserva las 47 comparaciones
independientes del recibo con PHP.

La aplicación aditiva de 061 conservó **76 conjuntos / 831 registros originales**
mediante conteos y huellas, excluyendo únicamente las cuatro columnas nuevas de
la comparación de Workforce. No hubo relleno de valores ni importación de negocio.

En sesión real de propietario se registró una constancia sintética individual
por $100, se recargó y se reabrió. La deuda bajó de $100 a $0; el costo activo
permaneció en $100. Archivar retiró el costo activo ($0) y conservó una constancia;
restaurar recuperó $100 de costo activo, deuda $0 y la misma constancia y fecha.
El registro unificado mantuvo PAGADO y no creó copias en Pagos/Gastos administrativos.
Sus huellas globales antes y después son idénticas. El detalle del gasto ya muestra
la fecha y nota guardadas, incluso después de restaurarlo.

Escritorio y móvil emulado a 390 × 844: ancho de contenido y desplazamiento 375 px,
sin desbordamiento. La cuenta restringida de la segunda empresa obtiene Página no
disponible. Cuatro rutas públicas de staging y salud de producción devolvieron 200;
se verificaron revisión, raíz activa, proceso Node y configuración de producción
sin cambios. Evidencia con identificadores sintéticos fuera del repositorio.

Las aprobaciones previas del caso se prepararon mediante las RPC reales con
identidades de prueba y rol autenticado en una transacción de staging; **no**
acreditan el recorrido en pantalla de encargado y oficina. La constancia posterior,
el archivo/restauración y el rechazo entre empresas sí se probaron en la sesión
emitida del propietario. Ninguna constancia de ensayo corresponde a dinero enviado.

## Pendientes de cierre

1. Probar el conjunto completo y los perfiles separados en pantalla, además de
   los contratos y carreras PostgreSQL ya aprobados.
2. Renovar el controlador de origen y sus consumidores contables actuales.
3. Completar coordinación con Labor y demás consumidores del costo.
4. Completar revocación con formulario abierto y comportamiento físico operativo.

T17–T19 quedan Implementada, no Comprobada. Los tres bloques siguen abiertos.
No se registran reembolsos reales durante esta auditoría.
