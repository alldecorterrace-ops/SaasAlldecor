# Conciliación histórica de facturas y pagos

Desde Facturas, los propietarios y administradores pueden abrir **Conciliación
ADT**. La consulta compara el respaldo histórico con las correspondencias
operativas de clientes y proyectos. No importa facturas, registra pagos,
modifica saldos, genera aprobaciones ni envía mensajes.

## Comparación numérica

- Los cálculos usan centavos enteros exactos; no redondean ni utilizan números
  de coma flotante para sumar importes.
- Solo los pagos `APPLIED` participan en la suma. `VOID` y
  `ASSOCIATED_TO_VOID_INVOICE` permanecen visibles y se excluyen.
- En una factura `OPEN`, el saldo esperado es total menos pagos aplicados.
  En una factura `VOID`, el saldo esperado es cero; conservar pagos aplicados
  en una factura anulada requiere revisión.
- Los estados desconocidos o importes inválidos impiden presentar una suma
  completa. Las diferencias se expresan como calculado menos guardado.
- Se comprueba también la correspondencia del estado de pago, y se señalan
  importes aplicados superiores al total.

La etiqueta **Sin diferencias numéricas** se limita a estas comprobaciones.
No confirma recepción bancaria, validez documental ni preparación para importar
la factura al módulo actual.

## Importes conservados al anular

El procedimiento de anulación de ADT cambia el estado de la factura y convierte
sus pagos aplicados en `ASSOCIATED_TO_VOID_INVOICE`, pero conserva el pagado y
saldo anteriores. La conciliación identifica esa coincidencia cuando la factura
y su estado de pago son `VOID`, no quedan pagos aplicados, la suma de los pagos
asociados coincide exactamente con el pagado guardado y el saldo conservado es
total menos ese pagado. Se requieren importes válidos y vínculos compatibles.

La vista **Importes conservados al anular** muestra esos casos y desglosa los
pagos asociados y anulados. La explicación no elimina las diferencias de la
comparación con los pagos aplicados y el saldo esperado cero. No acredita una
devolución, no convierte pagos excluidos en cobros actuales y no modifica los
registros originales. Una coincidencia numérica tampoco sustituye los documentos.

## Datos y dependencias

La vista señala fechas inválidas, métodos de pagos aplicados por confirmar,
referencias repetidas por factura y método, números de factura repetidos y
relaciones contradictorias. Muestra por separado clientes/proyectos pendientes,
desgloses incompletos del estimado original y diferencias entre sus totales y
los de la factura. Un proyecto y una factura pueden representar versiones
distintas: esa diferencia requiere documentos, no una corrección automática.

El detalle propio de cada factura y los cambios posteriores al respaldo deben
comprobarse antes de incorporarla. El desglose de un estimado no se toma como
sustituto automático del detalle de la factura. Los pagos sin factura vinculada
se presentan fuera de las sumas por factura.

Los métodos conocidos solo se reconocen como etiquetas históricas; la pantalla
no establece una conexión bancaria ni interpreta un registro como un cobro nuevo.

## Acceso y consulta completa

La ruta exige una membresía activa con rol propietario o administrador y permiso
de Facturas. Todas las consultas se filtran por empresa y conservan RLS. Solo
se leen proyecciones públicas autorizadas y tablas de correspondencia; no se
leen JSON privados, tokens, firmas o credenciales.

Las consultas paginan según el número real de filas recibidas y el total exacto
informado por la API. Un error, un cambio de conteo durante la lectura, una
respuesta incompleta o más de diez mil filas por consulta detienen el informe.
La pantalla no presenta como completo un resultado truncado.

El detalle histórico ajusta únicamente la comparación visual del saldo de las
facturas anuladas a su estado. No reescribe la proyección ni su original.

## Validación

`tests/financial-reconciliation.test.ts` cubre exclusión por estado, facturas
anuladas, centavos por encima del límite seguro de JavaScript, datos inválidos,
dependencias, pagos sin factura, aislamiento, escape de contenido y paginación.
El ensayo privado compara el respaldo con las correspondencias reales del
destino. Sus identificadores, resultados e importes quedan fuera de GitHub.

La prueba visual con sesión real y la migración financiera operativa son trabajos
pendientes independientes de esta consulta de conciliación.

## Publicación

El 18 de septiembre de 2026 se publicó `054ae4e`, conservando la entrega anterior
y una copia privada de su configuración. Pasaron 198 pruebas, lint, tipos y
compilación local, además de
[GitHub Actions](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/35379735966)
y la compilación del hosting.

Una consulta independiente en Supabase confirmó las diferencias del ensayo.
Se comprobó la lectura de todas las tablas necesarias bajo el rol autenticado
con la identidad existente del propietario, dentro de una transacción revertida.
Esto valida lectura y RLS, pero no sustituye una sesión de navegador ni prueba
de emisión de JWT. No se aplicaron migraciones de esquema ni cambios de saldos.

Se verificó la revisión del proceso activo y pasaron 25 comprobaciones HTTP de
salud, recuperación y protección de conciliación, clientes, proyectos y documentos.
El navegador controlado redirige la nueva ruta al login; la auditoría visual con
sesión real sigue pendiente.
