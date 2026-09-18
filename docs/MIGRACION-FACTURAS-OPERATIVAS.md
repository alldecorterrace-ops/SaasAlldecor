# Incorporación de facturas históricas a la operación

La migración `202609180022` permite copiar una factura revisada y sus pagos
desde el archivo ADT al módulo de Facturas. Mantiene referencias explícitas al
original por empresa. No crea estimados, aprobaciones, proyectos, correos ni
transacciones bancarias. No modifica el sistema de origen.

## Criterios de esta etapa

- Factura abierta, con número original único y cliente/proyecto ya vinculados
  a registros operativos de la misma empresa.
- Partidas guardadas en la propia factura: descripción, especificación e
  importe. La suma debe coincidir exactamente con su subtotal, descuento,
  impuestos y total. No se sustituyen con precios actuales o partidas del estimado.
- Instantánea del cliente guardada en la factura. Los datos actuales de contacto
  no reemplazan esa instantánea.
- Todos sus pagos deben estar aplicados, tener fechas/importes válidos, método
  reconocido y referencias compatibles. Su suma debe coincidir con el pagado,
  saldo y estado originales. No se admite redondear ni corregir diferencias.
- Se revisa el conjunto completo de pagos y sus huellas, además de la huella de
  la factura y los vínculos esperados en destino.

Se excluyen de este procedimiento las facturas anuladas, los pagos anulados o
asociados a anulación, los métodos desconocidos y las referencias duplicadas.
Permanecen en el histórico para revisión. La ausencia de advertencias en la
conciliación no sustituye estas validaciones de la factura propia.

## Ejecución y acceso

`app_private.import_operational_invoice` está revocada para usuarios de la
aplicación, incluso propietarios. Se ejecuta administrativamente con un plan
privado revisado y un actor que sea propietario o administrador activo. No hay
un botón público de importación ni credenciales administrativas en el navegador.

La operación inserta factura, pagos y constancia privada en una transacción.
Los originales permanecen intactos. La repetición del mismo plan devuelve la
copia existente; nunca restablece saldos ni sobrescribe cambios posteriores.
Un plan diferente para el mismo original se rechaza. Se conservan las políticas
de acceso de Facturas y las claves de origen tienen límites por empresa y tipo.

Antes de aplicar un plan real, guardar privadamente el estado previo, comparar
la factura y sus pagos con ADT vivo y ensayar con el respaldo. Los datos reales,
identificadores, importes y archivos de ejecución no pertenecen a GitHub.

## Presentación y seguimiento

La factura copiada se identifica como incorporada de ADT, con enlaces al original
y a sus pagos históricos. No presenta una aprobación nueva ni un estimado ficticio.
Las partidas muestran sus importes guardados, sin inventar cantidades o medidas.
Los metadatos internos del motor permanecen en el archivo privado de origen.

Los registros operativos siguen usando los controles habituales de edición,
versiones y pagos. No existe sincronización automática con cambios posteriores
en ADT; deben conciliarse antes del cierre de la migración general. Copiar un pago
administrativo no acredita una verificación bancaria.

## Verificación y reversión

Las pruebas sintéticas cubren copias exactas, rechazo por datos incompletos o
inconsistentes, aislamiento, permisos, ausencia de aprobaciones, conservación de
clientes/proyectos/originales y repetición después de registrar otro pago.
El ensayo privado valida las partidas y los importes reales sin publicarlos.

El despliegue conserva la aplicación anterior y su configuración. Revertir la
aplicación no elimina la factura ni sus pagos. El esquema es aditivo: no se deben
eliminar registros importados ni columnas de procedencia para revertir una pantalla,
especialmente después de nuevas operaciones. Cualquier incidencia contable se
resuelve con una revisión específica, preservando el historial.
