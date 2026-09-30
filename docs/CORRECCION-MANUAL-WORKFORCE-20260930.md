# Corrección manual de gastos de Workforce

## Contrato de referencia

La copia privada de la interfaz ADT observada el 29 de septiembre y el controlador
local separan extracción IA, confirmación humana y pago. `exp_reviewed` exige
IA final antes de confirmar. `expenseAdminEdit` permite a administración corregir
un gasto pendiente/devuelto, con motivo, y deja una revisión manual independiente
de la IA. Para su copia Workforce reinicia encargado y oficina. No aprueba ni paga.
Esta fuente no acredita por sí sola el PHP actualmente desplegado.

## Alcance de esta entrega

Esquema aditivo 052 y corrección para oficina/administración de gastos SUBMITTED o
FOREMAN_APPROVED. Fecha de empresa (guardada a las 12:00 locales, como ADT), importe,
categoría, descripción, obra/general y pagador. Motivo obligatorio de 5 a 500
caracteres. El límite manual del origen es USD 20.000; se amplía la restricción de
almacenamiento, conservando USD 10.000 para envíos nuevos de trabajadores.

Se conserva el recibo original y se verifica su binario antes del guardado web.
La revisión queda vinculada a sus identificador/huella y a los datos corregidos,
con usuario, fecha y motivo. Los anteriores siguen pendientes de revisión;
no se genera una confirmación retroactiva. Las aprobaciones anteriores quedan en
el historial y se reinician en el registro vigente. Motivo, versión e idempotencia
se verifican transaccionalmente; la autorización se reevalúa después de esperas
por bloqueos. Un reintento no repite efectos. No se escribe un pago ni copia contable.

## Diferencias y pendientes abiertos

Esta entrega no reemplaza la foto, no implementa IA ni su confirmación humana
posterior y no habilita reembolsos. La corrección de DEVUELTO/NEEDS_CORRECTION sigue
pendiente: el estado REJECTED existente no se equipara automáticamente con ellos.
La interfaz conserva las categorías de Workforce; queda el contraste de etiquetas
libres administrativas. Obra general conserva la referencia original para
trazabilidad. La comprobación de versión vigente es estricta; futuras actualizaciones
IA necesitarán separar metadatos de cambios de evidencia antes de introducirlas.
No se declara paridad completa de editar/revisar ni de los 21 módulos.

## Validación

Entrega **6a2d9be34974400dc0a7f04e0ab5f1ef4a48c225**, publicada solo en staging,
esquema 052 aplicado. Activa 6a2d9be; anterior compatible 4174887. Ambas conservan
configuración privada idéntica y dependencias compartidas verificadas. Proceso
activo y raíz Passenger comprobados; configuración de producción intacta.
No se ejecutó retorno real en esta entrega. El inventario se renovó; quedan
entregas sobrantes cuya limpieza requiere comprobar contenido único y las
confirmaciones correspondientes. No se borró ninguna carpeta en esta fase.

- Nueve pruebas específicas correctas: roles, empresa, datos inválidos, fecha,
  recibo, revisión, reset de decisiones, general, límite, versión, reintento y revocación.
- Suite completa: **464 pruebas**, sin fallos ni omitidas. Lint, tipos y
  compilación local/hosting correctos.
- [CI de la entrega](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36762094727):
  check, backup-recovery y queue-concurrency correctos. PostgreSQL 17 comprobó
  ocho solicitudes concurrentes iguales con un solo efecto, dos correcciones
  competidoras con un solo ganador, decisiones reiniciadas y revocación antes del reintento.
  El trabajo de recovery valida código de recuperación; no acredita restauración
  remota ni objetivos RTO/RPO.
- Sesión real sintética: formulario expandido, fecha futura rechazada por servidor
  con todos los campos conservados, fecha corregida y guardado, reapertura con
  importe/categoría/obra/pagador vigentes, revisión y motivo visibles.
- Recibo sintético inspeccionado y descargado después: mismos 23.483 bytes y
  SHA-256. El cambio de importe/categoría fue un ensayo explícito con motivo;
  no representa una conciliación real del recibo ni un pago.
- Historial real: creación y una actualización, autor, versión, antes/después,
  fecha local de empresa y snapshot de datos/recibo. Dos reintentos directos
  devolvieron el mismo resultado; payload modificado y versión antigua rechazados.
  Final: versión 2, una solicitud manual, dos eventos totales.
- Móvil emulado a 390 px: tarjeta y formulario reabiertos sin desbordamiento
  horizontal. No constituye prueba en dispositivo físico ni guardado móvil.
- Permisos y perfil temporales restaurados. Pantalla ya no disponible y
  reintento autenticado rechazado después de revocar. Otros roles/empresa y
  estados finales se verifican mediante pruebas de base, sin atribuirles UI real.
- Dieciséis conjuntos previos conservaron recuentos/huellas: incluye finanzas,
  relaciones, horas, solicitudes, recibos, otros trabajadores y gastos Workforce.
  Los cinco campos aditivos de revisión se excluyeron solo de la huella de
  Workforce previo; los demás campos, incluidos pagador y aprobaciones, coinciden.
  Trabajador intacto y permisos exactos restituidos; versión/historial de perfil
  reflejan las dos transiciones temporales del ensayo.
- Ocho controles públicos correctos en staging/producción: salud, login,
  recuperación y redirección de actualización sin sesión.

Los resultados detallados, SQL, capturas y datos sintéticos identificables se
mantienen fuera del repositorio. No hubo migración ADT, pago, reembolso,
copia contable ni activación de producción.
