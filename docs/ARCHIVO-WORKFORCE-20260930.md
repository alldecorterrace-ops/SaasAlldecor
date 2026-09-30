# Archivo recuperable de gastos de Workforce

## Referencia y alcance

La copia privada de CrmController, acciones exp_archive/exp_restore, permite al
administrador archivar con motivo de cinco caracteres, conservar recibo/rastro y
recuperar el estado anterior. ADT coordina también su copia contable y la capa
Workforce. La copia local no certifica el PHP desplegado actualmente.

Esquema aditivo 056: archivo y restauración autenticados, administrador de la
empresa, permiso de escritura, versión y solicitud idempotente. La auditoría y
el recibo de ejecución se guardan en la misma transacción. El estado ARCHIVED
impide correcciones y decisiones nuevas. El archivo no es rechazo ni borrado
físico. Las vistas activas lo excluyen; solo administración puede consultar el
archivo, fotos usadas, metadatos e historial mientras esté archivado.

Restaurar recupera cualquiera de los cinco estados anteriores y conserva datos,
revisión, decisiones, pagador, recibos y reenvíos. Un motivo cambiado con la misma
solicitud produce conflicto. Una sesión revocada no puede repetir su petición
privilegiada. Se conserva evidencia de cada ciclo en el historial.

La detección de recibos preparados se ejecuta fuera del filtro RLS del gasto:
un gasto archivado oculto no puede confundirse con uno todavía no enviado.
No se crean enlaces públicos ni privilegios administrativos en el navegador.

## Límite contable

Los gastos Workforce actuales aún no generan la copia contable y deuda de ADT.
Este bloque conserva el gasto y sus decisiones, sin alterar tablas de pagos ni
gastos contables. No certifica la coordinación futura con esas copias ni el
reembolso. Su integración transaccional sigue pendiente; no se declara paridad
completa de Gastos/Workforce ni se habilita producción.

## Comprobación

Pruebas de cinco estados, identidad, importes, revisión y aprobaciones reales del
contrato SQL; ámbitos, metadatos, Storage e historial; versiones, motivos,
reintentos, revocación y ausencia de efectos financieros. El ensayo PostgreSQL
17 incluye ocho reintentos por operación y carrera archivo/corrección. Los
contratos locales de Auth/Storage no prueban por sí solos sesión web o binarios.
La publicación y evidencia de interfaz se registrarán después de comprobarlas.

Migración de ADT aplazada. Configuradores y 3D fuera de los 21 módulos activos.
