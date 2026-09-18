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

## Detalle propio de la factura

La migración 023 incorpora una consulta de solo lectura que suma los precios de
las líneas guardadas en cada factura y los compara con su subtotal. Compara
también subtotal menos descuento más impuestos con el total original, y verifica
que el total del detalle coincida con el de la factura. Incluso una diferencia de
un centavo permanece entre los importes por revisar; no se atribuye automáticamente
a redondeo ni se crea una línea de ajuste.

Los detalles ausentes o inválidos aparecen como datos pendientes. El desglose del
estimado no reemplaza el de la factura. El importador operativo conserva todos
sus controles y continúa rechazando diferencias entre líneas y subtotal.

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
de Facturas. Las consultas a tablas se filtran por empresa y conservan RLS.
La RPC `review_invoice_details` vuelve a comprobar membresía, rol y permiso en
PostgreSQL. Lee los originales dentro de la base y devuelve únicamente cantidades,
estados de validación y comparaciones monetarias permitidas. No devuelve JSON
originales, contactos, metadatos del motor, tokens, firmas ni credenciales.
Los originales privados mantienen sus restricciones de acceso.

Las consultas paginan según el número real de filas recibidas y el total exacto
informado por la API. Un error, un cambio de conteo durante la lectura, una
respuesta incompleta o más de diez mil filas por consulta detienen el informe.
La pantalla no presenta como completo un resultado truncado.
También rechaza un diagnóstico de líneas que no incluya exactamente una entrada
por factura consultada dentro de la misma empresa.

El detalle histórico ajusta únicamente la comparación visual del saldo de las
facturas anuladas a su estado. No reescribe la proyección ni su original.

## Validación

`tests/financial-reconciliation.test.ts` cubre exclusión por estado, facturas
anuladas, centavos por encima del límite seguro de JavaScript, datos inválidos,
dependencias, pagos sin factura, aislamiento, escape de contenido y paginación.
El ensayo privado compara el respaldo con las correspondencias reales del
destino. Sus identificadores, resultados e importes quedan fuera de GitHub.

`tests/invoice-detail-review.test.ts` comprueba diferencias de un centavo en ambos
sentidos, importes exactos, datos malformados y restricciones de acceso. La nueva
consulta no inserta ni modifica clientes, proyectos, facturas o pagos.

Para publicar esta ampliación, aplicar únicamente la migración 023 antes del
código que consume la RPC. Conservar la entrega anterior para reversión; puede
seguir funcionando con la función nueva instalada. No repetir migraciones
anteriores ni cargar de nuevo los planes iniciales de importación.

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

La entrega posterior `543ebf7` añadió la explicación de importes conservados al
anular y su filtro. Pasaron 200 pruebas, lint, tipos, compilación local y
[GitHub Actions](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/35380886795),
además de la compilación en el hosting. Se verificaron la revisión del proceso
activo y nueve comprobaciones HTTP de salud, recuperación y protección de la
conciliación, incluido el filtro nuevo. Se conserva `054ae4e` y una copia de la
configuración para reversión. Una consulta independiente de solo lectura confirmó
las coincidencias del ensayo privado. No hubo migraciones ni cambios financieros.
La prueba visual con sesión real continúa pendiente.

La entrega `228d54c` añade la revisión del detalle propio mediante la migración
023. Pasaron 210 pruebas, lint, tipos, compilación local y
[GitHub Actions](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/35384442144),
además de la compilación del hosting. El ensayo SQL revertido y la consulta
posterior a la instalación devolvieron el mismo diagnóstico. Se comprobó el
rechazo de acceso anónimo por la API y nueve rutas de salud y protección.
El proceso activo corresponde a esta entrega; se conserva `29119c0` con copia
privada de la configuración para reversión. No se modificaron importes ni
registros operativos. La comprobación visual autenticada sigue pendiente.
