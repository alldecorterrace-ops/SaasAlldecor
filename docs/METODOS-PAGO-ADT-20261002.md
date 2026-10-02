# Métodos de pago de ADT en Facturas · 2 de octubre de 2026

## Regla contrastada y entrega

Staging ejecuta `7aee726bb05787f15e2a8c2d84133920ed8f5827`, esquema aditivo 070.
El commit exacto está publicado en GitHub y aprobó los tres trabajos del CI
[36994573829](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36994573829):
636 pruebas, lint, tipos, compilación, concurrencia PostgreSQL y recuperación.
El job de comprobaciones también ejecutó la comparación independiente con PHP.

La copia de `CrmController.php` obtenida de ADT el 2 de octubre tiene SHA-256
578144f99dd8a57043df03915c27f5e3b962633668b315c13013c7ee9c3d4401.
`paymentCreate` conserva el método como metadato y `recomputeInvoice` suma todos
los registros APPLIED, sin excluir «Not charged.» ni el método vacío.
La referencia PHP ejecutada en CI contrasta importes, estados y saldo con el SaaS.
Es una prueba del código de origen leído, no un pago real en ADT.

El formulario incorpora las seis opciones manuales de ADT: Efectivo, Cheque,
Transferencia, Zelle, Not charged. y (sin método). El código `SIN_METODO` expresa
la opción vacía del origen; `NOT_CHARGED` conserva su etiqueta. Tarjeta (cobro
externo) y Otro mantienen compatibilidad con los métodos ya admitidos por el SaaS.
Los ocho códigos persisten sin reclasificar registros históricos. El PDF conserva
el estado de pago de la revisión, además del desglose, pagado y saldo.

070 ya estaba aplicada antes de la interrupción de la sesión anterior. Su evidencia
registra 1.075 filas anteriores de 82 tablas intactas dentro de la transacción,
con SHA-256 de migración
00856b7d92e89913d3f286d5bcd3be0bddff1843182e3926a84307f5e5bae1bf.
Esta continuación publicó el candidato existente; no repitió la migración.

## Recorrido autenticado y documentos

El propietario de una empresa sintética utilizó una factura existente de $104.34.
Registró los dos métodos nuevos desde el formulario y luego revirtió ambos,
conservando sus referencias, notas, motivos y actores. La anotación de los pagos
es administrativa; el ensayo no ejecutó una transferencia, cobro ni reembolso.

| Revisión | Acción | Pagado | Saldo | Métodos capturados en el PDF |
| --- | --- | ---: | ---: | --- |
| 8 | Registrar Not charged. por $10.43 | $10.43 | $93.91 | NOT_CHARGED |
| 9 | Registrar (sin método) por $93.91 | $104.34 | $0.00 | NOT_CHARGED, SIN_METODO |
| 10 | Revertir el registro sin método | $10.43 | $93.91 | NOT_CHARGED |
| 11 | Revertir el registro Not charged. | $0.00 | $104.34 | Ninguno |

Los cuatro PDF se descargaron y compararon con el SHA-256 y tamaño registrados
por Supabase. Un lector independiente comprobó su texto; se renderizaron e
inspeccionaron sus ocho páginas. Fecha, métodos, referencias, notas, impuesto,
calendario, estado y cantidades resultaron correctos y legibles. La plantilla
completa sigue abierta; el aviso de la revisión 11 ocupa una segunda página.

Los PDF 1 y 6 anteriores a 070 y los PDF 8 y 9 volvieron a descargarse tras los
reversos y mantuvieron todos sus bytes. Repetir la generación de la revisión 11
conservó un solo documento, su identificador y los mismos bytes:
f312fdf41ec603bcebbcc0645941bbc20fadd08ea94ccc3fb9c8711dc2d24097.

La factura terminó OPEN / UNPAID v11, pagado $0.00 y saldo $104.34. Los dos pagos
nuevos quedaron VOID v2 con motivos y actores; se conserva el historial completo.

## Comparación independiente de registros

Consulta en transacción de solo lectura contra SaasAlldecor-Staging, con guardas
de entorno y comparación contra la evidencia previa a 070:

- Las otras ocho facturas y los once pagos anteriores conservan sus huellas.
- Los veinte documentos originales conservan filas y snapshots íntegros.
- Los nueve proyectos, once gastos, dieciséis estimados y treinta y nueve
  revisiones de estimado permanecen idénticos. También sus documentos anteriores.
- Solo se añadieron dos pagos sintéticos y cuatro documentos. La factura de
  ensayo cambió únicamente su versión y fecha de actualización respecto al
  estado inicial. La aprobación sigue vinculada a una factura y un proyecto.

Los ocho métodos aparecen en la sesión web. Escritorio sin desbordamiento de
página ni errores de consola; ancho móvil emulado de 390 px comprobado, con
desplazamiento local de tablas. No acredita uso de un dispositivo físico.
La misma factura bajo la ruta de la otra empresa devuelve Página no disponible.
Los contratos de permisos, lector y revocación pasan en pruebas; faltan los
recorridos completos de esos perfiles reales y la descarga bajo acceso revocado.

## Publicación, recuperación y pendientes

Raíz y proceso activos, revisión de salud, y cuatro rutas públicas de staging
comprobados después de la publicación. Salud y huella de configuración de
producción conservadas. Entorno privado y dependencias compartidas c66e4ec/b149bee
idénticos a la entrega anterior.

`b064fa3ccbc7d9c361415153c105de50a432bc4a` se conserva como retorno del código,
comprobado antes del cambio y compatible con el esquema aditivo. Su interfaz no
ofrece ni etiqueta los dos métodos nuevos; no acredita recuperación de esa
capacidad. Restaurarla exige republicar 7aee726 desde GitHub. No se ensayó un
retorno después de esta activación y el retorno del código no revierte los pagos.
Sin borrados de hosting; los 52 elementos consultados siguen pendientes de la
confirmación concreta y aaf268c/dependencias permanecen protegidos.

C19 continúa Implementada: recibo separado, perfiles y comunicaciones pendientes.
Los tres bloques siguen abiertos, conteo estricto 1/65 obligaciones agrupadas de
la matriz provisional. La entrega reduce diferencias de métodos y documentos;
no acredita paridad completa ni autoriza el traspaso operativo. ADT sigue principal
y la migración de datos de negocio continúa suspendida. Evidencia privada fuera
del repositorio.

Diferencia adicional C21 confirmada en el mismo controlador: ADT permite anular
una factura con pagos APPLIED, conserva los importes de la factura y cambia los
pagos a ASSOCIATED_TO_VOID_INVOICE con motivo y actor. El SaaS actual exige
revertirlos primero. Esta entrega no modifica la anulación; su equivalencia
sigue pendiente y debe conservar historial y documentos sin simular reembolsos.
