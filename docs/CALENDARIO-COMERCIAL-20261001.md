# Calendario y condiciones comerciales — esquema 059

## Regla contrastada

ADT Estimados, sesión de lectura del 1 de octubre de 2026: cuatro etapas,
porcentajes editables que suman 100%, entrega prevista y condiciones particulares.
Fuente `pagosDe` del panel actual: redondear las tres primeras etapas y atribuir
el resto a la última. El ejemplo observado de $47,937.34 con 10/50/30/10 produce
$4,793.73 / $23,968.67 / $14,381.20 / $4,793.74.

## Implementación

- El estimado nuevo muestra los valores iniciales de ADT y permite editarlos.
  Un documento anterior sin calendario permanece sin condiciones conocidas;
  incorporarlas requiere seleccionar expresamente esa opción en una nueva revisión.
- PostgreSQL valida y calcula los importes; ignora importes enviados por el cliente.
  Condiciones originales, entrega, porcentajes e importes quedan en la revisión.
- La aprobación copia exactamente las condiciones de la revisión a la factura.
  No crea abonos ni modifica pagos. El texto contractual no se trata como una firma.
- Vista imprimible y PDF privado conservan esos datos. Los archivos y snapshots
  anteriores no se reescriben. Un cliente de la entrega anterior conserva las
  condiciones existentes al guardar y recalcula únicamente la revisión nueva.
- Migración aditiva, sin nuevas importaciones ni actualización de datos de negocio.
  Un calendario que por redondeo produciría una etapa negativa se rechaza; el caso
  extremo sigue identificado para contraste operativo y no justifica cuadrar saldos.

## Validación y límites

Siete pruebas específicas: referencia independiente de centavos, Unicode y texto
multilínea, porcentajes inválidos, revisiones inmutables, clientes antiguos,
calendario aprobado sin pago, PDF y permisos/empresa. `npm run check` pasó lint,
tipos, 511 pruebas y compilación con la nueva migración. La entrega exacta
`d34c3582310005a36fd82599671b3a8d66918568` pasó los tres trabajos de
[CI](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36935809189),
incluyendo concurrencia PostgreSQL y restauración cifrada de una base sintética.
Un ensayo anterior falló con un error genérico; se amplió el diagnóstico privado
de herramientas sintéticas. La causa anterior no está identificada; una ejecución
aprobada no acredita estabilidad de los respaldos de producción.

Esta entrega no cierra C16 ni el bloque comercial: restan plantillas completas,
recibo de pago, comunicaciones, impuestos/reglas de catálogo y requisitos de ADT
para ejecución. La IA de recibos, deuda/reembolso, Labor, Campo y operaciones
continúan en la matriz de cierre. Producción y ADT siguen intactos.

## Publicación y prueba autenticada

- Esquema 059 aplicado únicamente a SaasAlldecor-Staging con exclusión explícita
  de la empresa productiva y comprobación de los 75 conjuntos / 775 filas previas.
  Sus datos originales permanecieron iguales; las dos columnas nuevas quedaron
  nulas en documentos previos. Sin backfill, migración de negocio ni abonos.
- Staging activa d34c358; retorno compatible 05c1bda. Dependencias compartidas
  c66e4ec/b149bee sin modificación. Fuente descargada del commit exacto y SHA-256
  verificado; compilación limitada a una CPU. Proceso con raíz y REVISION comprobados.
  Configuración de producción conservó su huella; salud de producción HTTP 200.
  Salud, login, registro y recuperación de staging: HTTP 200.
- Sesión sintética de propietario: guardar y reabrir cuatro revisiones del
  estimado EST-2026-0007; calendario inicial 10/50/30/10 sobre $47,937.34,
  luego 12.5/37.5/40/10 sobre $100.01. Entrega 2026-10-17 y condiciones multilínea
  con Peña guardadas. La fecha se comprobó después de interacción de teclado,
  guardado y reapertura; el primer llenado automático no la persistió.
- Aprobar revisión 4: factura INV-2026-0003 y un proyecto. Calendario, importes,
  condiciones y entrega idénticos en PostgreSQL. Pagado $0.00, saldo $100.01,
  cero filas de pago. La aprobación deja el estimado en revisión 5, cerrado.
- PDF privados de estimado revisiones 1 y 4 y factura revisión 1 generados,
  descargados y leídos. Texto, cuatro importes, acentos, condiciones, entrega y
  páginas revisados visualmente. El PDF de revisión 1 se volvió a descargar
  después de aprobar: idéntico byte por byte; no se sustituyó por la revisión 4.
- Vista móvil emulada 390 × 844: calendario legible y sin desbordamiento del
  documento. No representa prueba física de un dispositivo. Factura de la empresa
  B denegada desde la empresa A, con auditor autenticado y sin ampliar permisos.
- Después del recorrido: 773 de las 775 filas originales conservan sus huellas,
  excluyendo solamente la columna nueva nula en estimados/facturas. Los únicos
  dos registros previos distintos son los contadores documentales incrementados
  al emitir el estimado y la factura de prueba; no se editaron registros previos
  de negocio. Evidencia individual y binarios permanecen privados fuera de GitHub.

La plantilla completa y sus casos largos continúan abiertos: la revisión 4 generó
una segunda página para la advertencia final; no hubo texto cortado ni solapado,
pero la paginación sigue dentro del contraste de plantilla. Esta entrega comprueba
el calendario, no el cierre de C16 ni un módulo completo.
