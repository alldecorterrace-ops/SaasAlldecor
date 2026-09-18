# Documentos y contratos históricos

El archivo histórico conserva los registros originales y permite descargar los
PDF disponibles sin regenerarlos. Se abre desde la navegación del histórico:
`/app/{empresa}/archivo/documents` y `/app/{empresa}/archivo/contracts`.

Las referencias exactas y coherentes pueden abrir el cliente, proyecto o
estimado correspondiente. Si falta un destino o los clientes se contradicen,
el registro queda sin adjuntar y aparece en «Pendientes de revisión», visible
solo para propietarios y administradores. El permiso `fin-estimados: read`
controla el archivo; los enlaces a clientes y proyectos respetan también sus
permisos de módulo. PostgreSQL aplica estas restricciones mediante RLS.

## Conservación y archivos

La migración aditiva 019 crea la proyección de consulta en
`public.historical_documents`. Los originales completos están en
`app_private.historical_document_sources`, sin acceso de roles de aplicación.
HTML firmado, imágenes de firma, tokens, IP y datos internos se conservan allí;
no se ejecutan ni se exponen como campos de consulta. No hay flujo para firmar,
reenviar o modificar contratos históricos.

Los metadatos proceden del respaldo restaurado. Los PDF se copian de los archivos
disponibles del origen en una captura separada, conservando su fecha de captura,
tamaño y SHA-256. Esa captura no prueba que cada archivo fuera idéntico en la
fecha del respaldo de base de datos. Los estados de archivo distinguen copia
disponible, archivo ausente, archivo inválido y registro sin URL de PDF.

Los archivos se guardan fuera del directorio web y del repositorio, con permisos
restringidos. `HISTORICAL_FILES_ROOT` apunta al directorio privado de archivos
nombrados por SHA-256. No es una variable `NEXT_PUBLIC_*`. Este directorio se debe
respaldar junto con PostgreSQL; no forma parte de Supabase Storage.

La ruta `/api/history-files/{empresa}/{tipo}/{registro}` verifica la sesión y lee
el registro con RLS antes de acceder al archivo. Comprueba ruta, tamaño, cabecera
PDF y SHA-256 en cada descarga. Devuelve un adjunto sin caché y un error genérico
si no puede entregar la copia. No redirige a URLs originales ni expone rutas
internas. Los archivos pendientes de relaciones siguen reservados a managers
también al solicitar directamente esta ruta.

## Carga y validación

`app_private.import_historical_documents` es administrativo, sin ejecución para
roles de aplicación. Cada lote es transaccional; repetirlo con los mismos datos
no duplica registros. Un cambio del original, proyección, archivo o referencias
revierte el lote. No se reescriben tablas actuales ni se envían avisos.

Las pruebas incluyen relaciones contradictorias sin cliente directo, referencias
de otra empresa, acceso a pendientes, revocación de módulo, originales privados,
repetición, rollback, escape de HTML y archivos alterados o mal identificados.
El ensayo privado usa todos los registros del respaldo y compara originales y
proyecciones. Cantidades, identificadores y resultados de negocio permanecen
fuera del repositorio público.

La revisión visual y la descarga con una sesión real son evidencia adicional;
no se sustituyen por pruebas locales, un build o una respuesta HTTP sin sesión.
La migración operativa, resolución de pendientes y delta posterior al respaldo
siguen siendo trabajos separados. Conservar ADT y la versión previa del SaaS.

## Entrega publicada

El 18 de septiembre de 2026 se aplicó la migración 019 y se cargó el archivo por
lotes administrativos. La comparación remota de originales, proyecciones,
referencias e identidades de archivo coincidió con el ensayo. No se adjuntaron
casos pendientes ni se modificaron los registros actuales. Se comprobaron RLS,
lectura del propietario, denegación sin identidad y restricciones de escritura,
originales privados y ejecución del importador.

Los PDF se transfirieron mediante la terminal autenticada a un directorio privado.
El SHA-256 del paquete coincidió con el origen; cada PDF disponible coincidió en
tamaño y hash con su manifiesto. Los faltantes y registros sin PDF conservaron
sus estados explícitos. No se regeneraron archivos ni se validó jurídicamente
el estado de las firmas.

Entrega `4f77244`: pasaron las 177 pruebas, lint, tipos y build locales y en
[GitHub Actions](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/35375235390).
El servidor compiló fuera de la carpeta activa; se conservó `8993867` y una copia
de su configuración. Tras activar la entrega pasaron las comprobaciones de
salud, login, recuperación, redirección de pantallas privadas, rechazo de
descargas sin sesión y protección de archivos internos.

La revisión visual y una descarga con sesión real siguen pendientes: el navegador
disponible para el agente abre el login. Esto no cierra la auditoría completa de
los módulos ni la migración operativa.
