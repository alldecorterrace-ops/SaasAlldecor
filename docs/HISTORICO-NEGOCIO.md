# Clientes, proyectos, facturas y pagos históricos

La consulta añade cuatro secciones del histórico de ADT. Desde los módulos
Clientes, Proyectos y Facturas se puede abrir el histórico correspondiente; las
secciones históricas comparten navegación. El detalle permite seguir referencias
exactas hacia cliente, proyecto, factura, pagos y estimado según los permisos.

Estos son registros de la copia respaldada, en modo de consulta. No se convierten
en clientes editables ni generan aprobaciones, facturas, cobros, asientos o avisos
actuales. Los estados, fechas e importes originales se conservan. La migración
operativa y el delta posterior al respaldo siguen pendientes.

## Permisos y conservación

- Clientes usa `clientes: read`.
- Proyectos usa `fin-proyectos: read`.
- Facturas y pagos usan `fin-invoices: read`.
- Los enlaces se muestran solo con acceso al módulo destino; cada ruta comprueba
  el permiso en servidor y PostgreSQL aplica RLS también a consultas directas.

La migración aditiva 018 crea `public.historical_business` con una proyección
explícita de campos visibles. Los originales quedan en
`app_private.historical_business_sources`, sin acceso de roles de aplicación.
No se exponen JSON internos, tokens, firmas, coordenadas ni HTML. Los textos se
escapan y las cantidades se muestran desde centavos exactos.

Las referencias usan claves foráneas por empresa y tipo de entidad, incluyendo
el enlace hacia `historical_estimates`. No se puede enlazar un cliente de otra
empresa ni usar un proyecto en lugar de un cliente. Las relaciones ambiguas o
contradictorias detienen la preparación; no se adivinan a partir de nombres.
Las referencias cuyo significado no está confirmado, como `service_external_id`,
se conservan como pendientes y no generan enlaces.

## Comparación de facturas y pagos

El preparador suma exclusivamente pagos `APPLIED`, siguiendo el criterio del
controlador ADT inspeccionado. Los estados `VOID` y `ASSOCIATED_TO_VOID_INVOICE`
se conservan y no se suman como pagos aplicados. Un estado desconocido impide
afirmar una suma completa y queda señalado.

Se muestran separados los valores guardados y los valores calculados para
revisión. La diferencia de pagado es suma aplicada menos pagado guardado; la
diferencia de saldo es total menos suma aplicada menos saldo guardado. Una
diferencia no modifica datos, anula pagos ni determina un nuevo saldo exigible.
La comparación es del respaldo; no acredita una conciliación bancaria.

## Carga administrativa y pruebas

`app_private.import_historical_business` solo se ejecuta por SQL administrativo.
Los roles de aplicación no pueden llamarla ni escribir las tablas históricas.
Valida el formato público, conserva originales, aplica las relaciones y registra
la ejecución. Una repetición idéntica no duplica filas; un conflicto revierte
todo el lote. Las claves diferidas permiten insertar un lote con referencias a
registros que aparecen más adelante en el mismo lote.

El ensayo local verifica originales, proyecciones y referencias contra el respaldo
restaurado. Las pruebas cubren permisos por módulo, revocación, aislamiento,
relaciones de tipo incorrecto, repetición, rollback, exclusión de pagos anulados,
conservación de diferencias y escape de HTML. Los datos reales y sus cantidades
se mantienen en evidencias privadas fuera de GitHub.

La auditoría visual autenticada de escritorio y móvil es independiente de las
pruebas técnicas. Conservar la entrega anterior y su configuración al publicar;
no retirar ADT ni volver a ejecutar migraciones previas.
