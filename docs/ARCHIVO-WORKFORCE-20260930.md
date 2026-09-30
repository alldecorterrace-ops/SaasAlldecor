# Archivo recuperable de gastos de Workforce

## Referencia y alcance

La copia privada de CrmController, acciones exp_archive/exp_restore, permite al
administrador archivar con motivo de cinco caracteres, conservar recibo/rastro y
recuperar el estado anterior. ADT coordina también su copia contable y la capa
Workforce. La copia local no certifica el PHP desplegado actualmente.

Esquema aditivo 056: archivo y restauración autenticados, administrador de la
empresa, permiso de escritura, versión y solicitud idempotente. La auditoría y
el recibo de ejecución se guardan en la misma transacción. El estado ARCHIVED
impide correcciones y decisiones nuevas. El archivo no es rechazo ni borrado
físico. Las vistas activas lo excluyen; solo administración puede consultar el
archivo, fotos usadas, metadatos e historial mientras esté archivado.

Restaurar recupera cualquiera de los cinco estados anteriores y conserva datos,
revisión, decisiones, pagador, recibos y reenvíos. Un motivo cambiado con la misma
solicitud produce conflicto. Una sesión revocada no puede repetir su petición
privilegiada. Se conserva evidencia de cada ciclo en el historial.

La detección de recibos preparados se ejecuta fuera del filtro RLS del gasto:
un gasto archivado oculto no puede confundirse con uno todavía no enviado.
No se crean enlaces públicos ni privilegios administrativos en el navegador.

## Límite contable

Los gastos Workforce actuales aún no generan la copia contable y deuda de ADT.
Este bloque conserva el gasto y sus decisiones, sin alterar tablas de pagos ni
gastos contables. No certifica la coordinación futura con esas copias ni el
reembolso. Su integración transaccional sigue pendiente; no se declara paridad
completa de Gastos/Workforce ni se habilita producción.

## Comprobación

Pruebas de cinco estados, identidad, importes, revisión y aprobaciones reales del
contrato SQL; ámbitos, metadatos, Storage e historial; versiones, motivos,
reintentos, revocación y ausencia de efectos financieros. El ensayo PostgreSQL
17 incluye ocho reintentos por operación y carrera archivo/corrección. Los
contratos locales de Auth/Storage no prueban por sí solos sesión web o binarios.
La evidencia operativa se registra a continuación.

Migración de ADT aplazada. Configuradores y 3D fuera de los 21 módulos activos.

## Evidencia operativa de staging del 30 de septiembre

Entrega funcional 32f31af2cd6b087a920ffbd38d6939b4129e4ee7 y revisión final
**be3b23d89d590181d6991d02b4d0322507ea899d**, con esquema 056 aplicado solo a
staging y guardas de empresa ficticia/ausencia de la empresa de producción.
Los tres trabajos de CI de ambas entregas pasan: check, queue-concurrency y
backup-recovery. La suite completa contiene 491 pruebas; el primer check local
pasa lint, tipos, suite y compilación. El ajuste de etiquetas repite lint, tipos,
nueve pruebas enfocadas y compilación local; CI ejecuta la suite completa.
[CI funcional](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36775477798)
y [CI final](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36776670131).

- Sesión web real de auditor, por fases Trabajador/Administrador, dentro de QA.
  Envío por formulario de un gasto ficticio; corrección manual con segunda foto
  deja revisión REVIEWED y versión 2. Archivo por formulario guarda ARCHIVED,
  versión 3, motivo, administrador, fecha y estado previo SUBMITTED.
- El administrador abre historial y descarga actual/anterior durante el archivo:
  13.787 y 23.483 bytes, con SHA idénticos a las imágenes preparadas. Ambos se
  descargan de nuevo después de restaurar y de publicar la revisión final.
  La sustitución anterior queda conservada; ningún binario se sobrescribe.
- Dos reintentos idénticos del archivo conservan su resultado; misma solicitud
  con motivo cambiado y petición nueva sobre versión antigua producen conflicto.
  Dos reintentos de restauración conservan también el resultado y los efectos.
- Al revocar el rol administrativo y conservar al trabajador activo con Horas,
  los RPC rechazan archivo previo, restauración y recibos actual/anterior.
  RLS devuelve cero gastos, metadata, cambios de foto y objetos Storage; el RPC
  de historial devuelve cero eventos. La sesión web muestra historial y archivo
  vacíos. Las pruebas de RPC/RLS usan el UID del auditor bajo rol authenticated;
  no representan por sí solas una descarga HTTP autenticada denegada.
- Restauración desde formulario en emulación de 390 px guarda versión 4 y
  SUBMITTED. Todos los campos operativos, revisión y metadata de las dos fotos
  coinciden con la versión 2. Cuatro eventos: envío, corrección, archivo y
  restauración. El ancho client/scroll/inner/visual es 390, sin desbordamiento;
  no es prueba en teléfono físico. Emulación retirada después del ensayo.
- Historial final en español probado en la revisión final: fecha, administrador,
  motivo y estado de restauración. Las aprobaciones de ambos actores y cinco
  estados previos se verifican en SQL; la sesión de staging no intenta cobrar ni
  reembolsar, y no se certifica IA mediante estos fixtures.
- Asignación de ensayo cerrada; membresía original restituida exactamente;
  perfil WORKER deshabilitado con versión/auditoría conservadas. La ficha
  empresarial del trabajador permanece idéntica. Reintentos anteriores y
  consulta de recibo de otra empresa quedan rechazados en RPC; no se atribuye
  esa comprobación a una navegación HTTP de otra empresa.
- Dieciséis conjuntos anteriores mantienen conteos y huellas. Para comparar la
  ampliación del esquema se omiten únicamente los siete campos de archivo recién
  añadidos al hash de los gastos anteriores. No cambian sus campos originales.
  Incluye el lote anterior de tres fotos y demás casos de QA.
- Diez controles HTTP pasan: ocho rutas públicas de staging/producción y recibos
  actual/anterior anónimos, con 401 y no-store. Proceso real, raíz, grupo,
  revisión, configuración privada y dependencia compartida verificados; el hash
  de configuración de producción permanece igual. Inventarios y resultados
  privados quedan fuera de GitHub; no se imprimen secretos.

Activa final be3b23d, grupo de ejecución propio de esa revisión; retorno previsto
32f31af, cuyo recorrido de archivo/restauración fue comprobado antes de publicar
las etiquetas finales. Esta entrega no ensaya un regreso posterior desde be3b23d.
Dependencias c66e4ec/b149bee conservadas. Veinte carpetas de entregas presentes:
la depuración de sobrantes sigue pendiente de inventario y autorización aplicable.
No se elimina ningún elemento en este bloque ni se archiva otra copia por versión
retirada. No se declara completada la retención ni la recuperación de cuatro horas.
