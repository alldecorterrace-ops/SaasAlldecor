# Deuda y constancias de reembolso — 1 de octubre de 2026

## Estado de esta entrega

Contrato aditivo 061 y pantalla implementados. Lint, tipos, **540 pruebas** y
compilación locales aprobados. Concurrencia PostgreSQL nativa incorporada a CI;
aplicación del esquema, despliegue y recorrido real de staging pendientes.
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

El ensayo nativo preparado cubre ocho reenvíos de la misma solicitud, solicitudes
distintas sobre un gasto, constancia individual contra lote y archivo concurrente.
Su resultado se documentará después de CI; una prueba embebida no lo sustituye.

## Pendientes de cierre

1. Aprobar CI exacto, aplicar 061 de forma aditiva y publicar solo en staging.
2. Probar pantalla, reapertura, móvil y perfiles separados con registros sintéticos.
3. Renovar controlador de origen y sus consumidores contables actuales.
4. Completar coordinación con Labor y demás consumidores del costo.

T17–T19 quedan Implementada, no Comprobada. Los tres bloques siguen abiertos.
No se registran reembolsos reales durante esta auditoría.
