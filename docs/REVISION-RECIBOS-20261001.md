# Revisión de recibos — staging, 1 de octubre de 2026

## Estado y alcance

Implementación aditiva 060 para gastos Workforce sintéticos. No se declara cerrada
la IA de recibos ni las filas T13–T16. Entrega activa cf8e3d1 / esquema 060,
con retorno compatible 80c0cf2. Ambas versiones están comprobadas contra GitHub.
El esquema se aplicó en una transacción exclusivamente al proyecto de staging;
75 conjuntos y 803 filas anteriores conservaron sus huellas originales.
Producción y ADT conservan su operación. No se importan datos, registran pagos
ni habilitan envíos externos generales.

## Regla de referencia

Copia privada de CrmController.php: SHA-256
cd5ebd45684b313b92baa6be9757975c59bc62fde95b1a3cb8e0a8d3d30db021.
No es una renovación del controlador del servidor actual. Las funciones puras
expenseAiInvoiceFingerprint y expenseAiVerdict se conservaron en un banco aislado
sin Drupal, credenciales, base ni datos de negocio. Fuente congelada SHA-256
cb675701a90ce7ca11502ee8c60a5640f2918f9ac68359b727161277c185db4f.

47 comparaciones independientes pasaron en PHP del hosting. Incluyen total y
tolerancia de $1/1%, fechas, legibilidad, proveedor, número, pagador, tarjeta,
jornada, obra, huella, redondeo y texto Unicode. El banco también se ejecuta en CI.
No añade requisitos de USD ni de suma subtotal/impuesto ausentes del origen.
El recorte conserva caracteres UTF-8 completos; el borde donde PHP substr divide
un carácter sigue siendo una diferencia defensiva explícita pendiente de decisión.

## Contrato implementado

- Extracción independiente de trece campos. El modelo recibe imagen y consigna;
  no recibe importe declarado, obra o instrucciones de aprobación.
- Anthropic y OpenAI usan credenciales y modelos específicos del servidor;
  Anthropic es primario si se configuran ambos. OpenAI usa respuesta estructurada
  y store=false. Errores remotos y claves no llegan al historial.
- Registro privado duradero con empresa, actor, solicitud, versión esperada,
  revisión, archivo, SHA-256, consigna, proveedor/modelo/identificador y resultado.
  Los usuarios autenticados no pueden escribir resultados de IA ni leer claims.
- Solicitudes repetidas no repiten la extracción. Una ejecución perdida vence;
  solo una solicitud nueva puede reclamar otro intento. El error queda conservado.
- Efecto y auditoría en una transacción. La respuesta tardía no modifica un gasto
  cambiado, archivado, con acceso revocado o con jornada modificada.
- Duplicados por SHA o comercio/número dentro de la empresa; se conserva la primera
  evidencia. No se deduce un duplicado entre empresas.
- Una primera discrepancia devuelve el gasto pendiente para corregir. Tras un
  reenvío, una segunda discrepancia permanece pendiente y requiere administración.
  Un gasto ya aprobado no se devuelve automáticamente.
- Confirmación humana separada, con cuenta, fecha, nota y revisión. Exige el
  contexto vigente. Revisar no aprueba, paga ni genera copia administrativa.
- Correcciones y reenvíos invalidan el vínculo activo, incluso si el reenvío
  conserva los mismos datos. El historial y los recibos anteriores permanecen.
- Pantalla con resultado, error, vigencia, revisión anterior y descarga privada.
  La conexión desactivada se muestra expresamente y no produce análisis simulados.

## Pruebas y límites

Lint, tipos, 527 pruebas y compilación locales aprobados; el contrato del historial
que utiliza la pantalla se valida contra resultados SQL reales en las pruebas.
Las pruebas cubren permisos, confirmación, correcciones, revocación, respuesta
perdida, expiración, contexto obsoleto, duplicados y separación financiera.

El ensayo PostgreSQL nativo pasó en [CI del commit cf8e3d1](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36945957614): ocho preparaciones, ocho finalizaciones y ocho confirmaciones simultáneas producen un único efecto por fase. Se comprobaron duplicados por huella/número, corrección simultánea, permisos y ausencia de pagos o copias administrativas. Los tres trabajos de CI pasaron, incluidas 527 pruebas, lint, tipos, compilación y 47 comparaciones PHP.

La sesión real del propietario en una empresa sintética permitió cargar dos
recibos, crear la jornada desde Horas y reabrir el gasto tras publicar. Un caso
sin jornada produjo DUDA y devolución; al incorporar la jornada, su evidencia
anterior dejó de estar vigente. El segundo caso cotejado produjo OK y recibió
confirmación humana desde la pantalla, con actor, fecha y nota persistidos.
Ambos resultados usaron explícitamente **synthetic-reference**, con la etiqueta
«Prueba de reglas; sin proveedor de IA». No acreditan extracción remota real.

La confirmación dejó el gasto pendiente del encargado. Las huellas de los seis
pagos y diez gastos administrativos anteriores permanecieron idénticas. No hubo
transferencias, aprobaciones finales ni copias del costo. La empresa restringida
rechazó el acceso a la ruta del gasto de la otra empresa. Esto no reemplaza la
matriz completa de perfiles.

La entrega corrigió el ancho mínimo del selector de archivos. En móvil emulado
390 × 844, la página midió 375 px de ancho disponible y 375 px de contenido, sin
desbordamiento horizontal; el historial y revisión humana persistieron al reabrir.
Las cuatro rutas públicas de staging y salud de producción respondieron HTTP 200.
La configuración Passenger de producción conservó su huella. No es una prueba
física de dispositivo ni de GPS. Evidencia privada fuera de GitHub.

CI detectó dos pruebas de archivo que usaban current_date del servidor UTC para
corregir gastos de una empresa de Nueva York después de medianoche UTC. Las
pruebas ahora usan la fecha local de la empresa; las nueve pruebas de archivo y
CI completo pasan. La validación del producto contra fechas futuras se conserva.

Pendientes antes del cierre:

1. Credenciales del ejecutor y proveedor existentes, habilitación explícita del
   banco de una empresa sintética, extracción real y prueba de fallo del proveedor.
2. Conversión HEIC/HEIF; hoy devuelve un error conservando el original.
3. Renovación del controlador y disparadores automáticos actuales de ADT.
4. Recorrido de administrador y trabajador con cuentas separadas, revocación
   con formulario abierto y evidencia física pertinente.
5. Coordinación posterior con deuda/reembolso y Labor, sin transferencias.

## Configuración

Variables dedicadas documentadas en .env.example, todas desactivadas por defecto.
En staging se exige APP_ENVIRONMENT=staging, proyecto Supabase distinto de producción,
STAGING_RECEIPT_AI_TEST_ENABLED=true y lista exacta de empresas sintéticas.
INVITATION_MAIL_ENABLED y OPENAI_API_KEY general siguen bloqueados.
RECEIPT_REVIEW_SUPABASE_SERVICE_KEY nunca se envía al navegador.
Configurar un proveedor no constituye comprobación de funcionamiento.

Los secretos se introducen de forma privada por el propietario, fuera de GitHub
y del chat. No hay contratación adicional ni llamada real a un proveedor en esta
entrega comprobada en staging.
