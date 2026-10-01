# Revisión de recibos — entrega de código, 1 de octubre de 2026

## Estado y alcance

Implementación aditiva 060 para gastos Workforce sintéticos. No se declara cerrada
la IA de recibos ni las filas T13–T16. La aplicación activa sigue d34c358 / 059
hasta aplicar el esquema, aprobar CI del commit exacto y comprobar la sesión.
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

Se añadió un ensayo PostgreSQL nativo de ocho preparaciones, ocho finalizaciones
y ocho confirmaciones simultáneas, duplicados por huella/número y carrera con
corrección. El ensayo pasó en PostgreSQL nativo en CI 36942598398: un solo efecto por ocho reintentos, un único ganador por duplicado y corrección simultánea preservada. La comprobación general del mismo run falló al faltar la carpeta temporal de casos; el generador la crea ahora y se repetirá CI antes del despliegue.

Pendientes antes del cierre:
1. CI del commit exacto y despliegue/esquema 060 comprobados en staging.
2. Credenciales del ejecutor y proveedor existentes, habilitación explícita del
   banco de una empresa sintética, extracción real y prueba de fallo del proveedor.
3. Conversión HEIC/HEIF; hoy devuelve un error conservando el original.
4. Renovación del controlador y disparadores automáticos actuales de ADT.
5. Sesión de propietario/administrador y trabajador, reapertura, móvil y revocación.
6. Coordinación posterior con deuda/reembolso y Labor, sin transferencias.

## Configuración

Variables dedicadas documentadas en .env.example, todas desactivadas por defecto.
En staging se exige APP_ENVIRONMENT=staging, proyecto Supabase distinto de producción,
STAGING_RECEIPT_AI_TEST_ENABLED=true y lista exacta de empresas sintéticas.
INVITATION_MAIL_ENABLED y OPENAI_API_KEY general siguen bloqueados.
RECEIPT_REVIEW_SUPABASE_SERVICE_KEY nunca se envía al navegador.
Configurar un proveedor no constituye comprobación de funcionamiento.

Los secretos se introducen de forma privada por el propietario, fuera de GitHub
y del chat. No hay contratación adicional ni llamada real a un proveedor en esta
entrega de código.
