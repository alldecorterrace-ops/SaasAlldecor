# Reglas del proyecto

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
