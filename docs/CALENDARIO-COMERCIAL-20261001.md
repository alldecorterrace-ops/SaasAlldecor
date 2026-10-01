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
tipos, pruebas y compilación con la nueva migración. Publicación y prueba UI de
059 todavía pendientes al preparar este commit.

Esta entrega no cierra C16 ni el bloque comercial: restan plantillas completas,
recibo de pago, comunicaciones, impuestos/reglas de catálogo y requisitos de ADT
para ejecución. La IA de recibos, deuda/reembolso, Labor, Campo y operaciones
continúan en la matriz de cierre. Producción y ADT siguen intactos.
