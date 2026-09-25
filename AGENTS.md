# Reglas del proyecto

## Prioridad vigente: paridad funcional

- Decisión del propietario del 25 de septiembre de 2026: suspender toda nueva
  migración de datos de ADT hasta que la solicite expresamente. No ejecutar
  importaciones, deltas, sincronizaciones ni cargas de archivos reales por una
  instrucción genérica de continuar. Conservar intactos los datos ya incorporados.
- Centrar el trabajo en verificar y completar las funciones de los 23 módulos
  contra ADT actual. Usar lectura del origen y datos sintéticos en staging.
  Las migraciones aditivas de esquema para implementar funciones no son una
  autorización para trasladar datos de negocio.
- Registrar por acción la regla del origen, equivalencia, prueba y diferencia.
  No introducir mejoras que cambien las reglas de ADT como parte de la paridad;
  los cambios propios de esta app se tratarán después con el propietario.
- El traspaso operativo sigue aplazado. ADT conserva la operación principal.

## Versionado y despliegues

- GitHub es la fuente oficial del código y de su historial. Antes de desplegar,
  confirmar que el commit exacto está publicado en el repositorio y ha pasado
  las comprobaciones correspondientes. No mantener cambios exclusivos del servidor.
- El hosting es un entorno de ejecución, no un archivo de versiones. Conservar
  una entrega activa y una entrega anterior validada para retorno. Se permite
  una candidata temporal mientras se prepara y verifica el siguiente despliegue.
- Conservar también cualquier carpeta de dependencias compartidas que necesiten
  esas entregas. Verificar los destinos reales de los enlaces simbólicos y los
  procesos activos antes de proponer o ejecutar una limpieza.
- Al terminar un despliegue verificado, identificar las entregas sobrantes y
  aplicar la política de retención sin borrar datos, secretos ni respaldos de negocio.
  Esta regla no autoriza por sí sola una eliminación permanente ni sustituye
  las confirmaciones aplicables.
- Seguir [la política de versionado y retención](docs/VERSIONADO-Y-RETENCION.md).
  Las notas históricas de despliegue no justifican conservar entregas indefinidamente.

## Datos privados

- No subir a GitHub credenciales, archivos de entorno reales, bases de datos,
  documentos de clientes, respaldos ni evidencia con datos privados. Mantener
  estos materiales fuera del repositorio; `.local/` está ignorado por Git.
- Un retorno de código no revierte los datos de Supabase. Revisar compatibilidad
  antes de cambiar de entrega y preservar los registros actuales.
