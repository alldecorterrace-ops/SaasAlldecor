# Solicitudes financieras — evidencia del 1 de octubre de 2026

## Entrega publicada

Código `05c1bdadcecfa03fe88f567336fb43c3fdcc57e8`, esquema aditivo 058,
publicado exclusivamente en staging. [CI 36931459511](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36931459511)
aprobado: check, queue-concurrency y backup-recovery en el intento 2.
El primer intento falló al preparar una herramienta del ensayo sintético de
respaldo; el reintento pasó sin cambios de código. Esto no acredita las copias
reales de Drive ni los objetivos de recuperación del servicio.

`npm run check`: lint, tipos, 504 pruebas y compilación. PostgreSQL 17 en CI:
ocho aprobaciones simultáneas con una solicitud producen una factura y un proyecto;
ocho pagos simultáneos producen un pago; dos ediciones con la misma versión
producen un guardado y un conflicto. Los efectos y las constancias se conservan
en la misma transacción. Se comprueban revocación, empresa, actor y acceso privado.

## Sesión real de staging

Empresa y cuentas sintéticas. Recorrido creado desde la interfaz:
lead → cliente → estimado con revisiones → aprobación → factura/proyecto →
pago parcial → producción → reverso → anulación.

- Revisión pendiente de $100.10 conservada en PDF; revisión posterior $120.10.
  El PDF anterior sigue disponible y no se sustituye.
- Aprobación de la última revisión: una factura y un proyecto, sin pagos creados.
- Producción sin pago: rechazada. Formulario y solicitud permanecen para reintentar.
- Pago $25.10 sobre $120.10: pagado $25.10, saldo $95.00.
- Producción guardada y reabierta después del pago.
- Reverso: un registro original conservado, pagado $0.00 y saldo $120.10.
- Anulación posterior: factura e historial conservados; saldo operativo $0.00.
  Se mantiene el PDF de la factura previo al reverso.
- Cincuenta reenvíos de las cinco solicitudes guardadas: mismo resultado original,
  una factura/proyecto/pago; ninguna alteración de registros ni auditoría por el
  reenvío. Cambio de intención con el mismo identificador rechazado.
- Solicitud contra otra empresa rechazada. La cuenta restringida de la segunda
  empresa recibe «Página no disponible» en el recorrido de factura.

La respuesta perdida se ensaya en el contrato automatizado y se recupera a partir
de la constancia duradera en PostgreSQL. La sesión demuestra efecto, persistencia,
rechazo y reenvío de la solicitud; no se presenta como una prueba de desconexión
física de un dispositivo.

## Protección y publicación

Aplicación de 058: las 74 tablas anteriores conservaron sus conteos y huellas.
Antes del recorrido: 733 registros protegidos en 75 tablas. Después: 775.
731 registros anteriores mantienen sus huellas; los únicos dos registros
anteriores que cambian son los contadores de números de estimado y factura de
la empresa sintética, incrementados por las altas autorizadas del recorrido.
Los documentos comerciales anteriores permanecen intactos.

Proceso activo comprobado en `05c1bda`; `518447a` conserva compatibilidad con 058
como retorno de código. `.htaccess` de producción conserva su SHA-256 anterior.
Las rutas de salud de staging y producción respondieron `ok`. No se ejecutaron
cobros, transferencias, correos comerciales ni cargas de datos reales.
Evidencia de pantalla, PDF, consultas, huellas y diagnósticos privados fuera de GitHub.

## Límites

Cierra C15: recepción/efecto financiero idempotente y recuperación del resultado.
Los demás recorridos comerciales siguen sujetos al contraste completo de ADT:
calendario/condiciones, plantillas, recibos, comunicaciones y requisitos actuales
para producción. No cierra el bloque comercial ni el traspaso: otras entradas de
escritura siguen fuera de este contrato y la cola de transición continúa desactivada.
