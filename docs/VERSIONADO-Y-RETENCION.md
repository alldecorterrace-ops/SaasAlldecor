# Versionado en GitHub y retención en el hosting

Regla acordada el 19 de septiembre de 2026: **GitHub conserva el historial;
el servidor conserva lo necesario para ejecutar el SaaS y volver a una entrega
anterior validada.**

## Qué se conserva en GitHub

- Código, migraciones SQL, documentación, pruebas y `package-lock.json`.
- Commits publicados que permitan identificar y reconstruir cada entrega.
- Para cada publicación, registrar el SHA completo desplegado y el resultado
  de sus comprobaciones. Una etiqueta de entrega, si se utiliza, debe apuntar
  al commit publicado y no moverse para representar otro contenido.

No subir `node_modules`, `.next`, cachés, archivos de entorno reales, claves,
bases de datos, documentos de clientes ni respaldos privados. GitHub guarda
el historial del código; los respaldos de datos tienen una retención separada.

## Qué se conserva en el servidor

En estado estable, mantener **dos entregas de aplicación**: la activa y una
anterior validada y compatible para retorno. Durante una actualización puede
existir una tercera carpeta candidata, que deja de ser necesaria si se descarta.

Las dependencias compartidas son una excepción al número de carpetas: si la
entrega activa o la de retorno enlaza a `node_modules` de otra carpeta, esa
carpeta sigue siendo necesaria. No eliminarla por antigüedad ni modificar sus
dependencias mientras las utilice un proceso activo. A futuro pueden trasladarse
a un directorio dedicado, pero ese cambio requiere una entrega y validación propias.

Los datos persistentes, archivos importados, configuración privada, correo,
certificados y respaldos de negocio quedan fuera de la limpieza de entregas.

## Procedimiento de cada entrega

1. Publicar el commit en GitHub y comprobar los resultados de CI. Preparar la
   candidata desde ese SHA, sin compilar sobre la aplicación activa.
2. Registrar de forma privada la raíz activa, el ejecutable de Node, los destinos
   reales de los enlaces simbólicos y la configuración necesaria para retorno.
3. Verificar la candidata, cambiar la raíz de aplicación y comprobar el proceso
   que realmente sirve usuarios, HTTPS, salud y el recorrido autenticado afectado.
4. Si la entrega falla, utilizar el retorno compatible. No revertir ni borrar
   datos de Supabase para deshacer un cambio de interfaz.
5. Tras validar la publicación, inventariar las carpetas sobrantes. Confirmar que
   su código está publicado, que no contienen datos únicos y que no las necesitan
   la entrega activa, la de retorno, sus dependencias o algún proceso en ejecución.
6. Retirar las entregas sobrantes conforme a las autorizaciones aplicables y
   registrar los destinos eliminados y el espacio liberado. No crear un archivo
   comprimido permanente por cada entrega en el mismo hosting: reproduciría la
   acumulación que esta política busca evitar.

Esta política es operativa y está incluida en `AGENTS.md`; no instala un cron
ni activa un borrado automático. La acumulación existente requiere su propia
limpieza con inventario y comprobación de dependencias.
