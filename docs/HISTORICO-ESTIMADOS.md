# Consulta de estimados históricos

La ruta `Estimados → Histórico ADT` permite buscar por número y consultar el
cliente, fecha, estado, importes y partidas originales. Cuando falta el desglose,
la pantalla lo indica y conserva el total sin inventar partidas de ajuste. Las
diferencias se muestran sin corregirlas. No tiene acciones para editar, aprobar,
facturar, cobrar o enviar documentos.

La consulta usa el permiso existente `fin-estimados: read`. La pertenencia activa
a la empresa se comprueba en servidor y PostgreSQL aplica RLS a cada lectura,
incluidas consultas directas. La revocación del módulo o de la membresía revoca
también el acceso al histórico. El número y la fecha originales son textos:
no se renumeran documentos ni se corrigen fechas históricas silenciosamente.

## Conservación y exposición

La migración aditiva `202609180017_historical_estimates.sql` crea un modelo de
lectura separado de los estimados actuales. La tabla pública solo contiene los
campos permitidos para la pantalla; los originales completos quedan en
`app_private.historical_estimate_sources`, sin lectura para roles de aplicación.
No se publican JSON internos, tokens, firmas, URLs ni HTML guardado. React escapa
los textos y los centavos se formatean sin convertirlos a números de coma flotante.

El preparador `historicalEstimatePayload` exige una referencia de cliente resuelta
y rechaza relaciones ausentes, inválidas o contradictorias del estimado. Las
referencias fuera de alcance se conservan como motivo de revisión. No importa ni
adjunta contratos o documentos con inconsistencias de cliente.

## Carga administrativa

`app_private.import_historical_estimates` está fuera del esquema expuesto por la
API y los roles de aplicación no pueden ejecutarla. La carga administrativa
valida la estructura de la proyección, guarda los originales y registra cada lote.
No llama funciones de aprobación, facturación, pagos, correo o contadores actuales.

Repetir una carga idéntica no duplica registros. Un cambio en identidad, original,
proyección o hash detiene y revierte el lote completo. Los hashes son trazabilidad,
no una autenticación de la fuente: se compara también el contenido original y
la proyección. Los archivos SQL con datos reales son privados y no se versionan.

Aplicar solamente la migración nueva, comprobar permisos y conteos, y publicar
la aplicación después. No volver a ejecutar migraciones anteriores. Mantener
la entrega anterior y su configuración para reversión del código, conservando
el histórico cargado. No retirar el sistema ADT original.

## Validación

Las pruebas locales cubren lectura por empresa/módulo, revocación, denegación de
lectura anónima, originales privados, ausencia de escrituras de aplicación,
rechazo de campos inesperados, reversión de lote, repetición y formato monetario
exacto. La prueba de render comprueba escape de HTML, avisos y ausencia de
formularios o botones de modificación. El ensayo local del respaldo comprueba
igualdad de originales y proyecciones sin crear operaciones financieras actuales.

La prueba autenticada en el navegador del propietario es una verificación distinta
de esas pruebas locales y debe registrarse por separado.

## Publicación del 18 de septiembre de 2026

La migración 017 está aplicada y la consulta está publicada en la entrega
`d246f17`. [GitHub Actions](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/35371287489)
aprobó lint, tipos, pruebas y compilación. La compilación del hosting se realizó
en una carpeta nueva; se conservó `d6fe007` y su configuración para reversión.
Se verificó que el proceso activo utiliza la nueva raíz.

Se cargaron los estimados del respaldo para la empresa indicada por el propietario.
La repetición verificó igualdad y no insertó duplicados. Los conteos de documentos
actuales y membresías permanecieron iguales. RLS está activo en las tablas nuevas;
la aplicación no puede modificar el histórico, ejecutar la carga ni leer originales
privados. La simulación SQL del propietario leyó el histórico; una consulta sin
identidad no leyó filas. Esto no sustituye una prueba de navegador autenticado.

Salud y recuperación respondieron correctamente, las rutas históricas sin sesión
redirigieron al login y los archivos privados del hosting permanecieron bloqueados.
El navegador disponible al agente mostró el login. La revisión visual con sesión
del propietario y en móvil queda pendiente. Las cantidades y evidencias privadas
no se publican en este repositorio.

Esta carga corresponde a la copia restaurada: no es sincronización continua con
ADT. Faltan la conciliación del delta y las demás entidades de negocio; la consulta
histórica no cierra la migración completa ni permite retirar ADT.
