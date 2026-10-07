# Reglas del proyecto

## Prioridad vigente: paridad funcional

- Decisión del propietario del 25 de septiembre de 2026: suspender toda nueva
  migración de datos de ADT hasta que la solicite expresamente. No ejecutar
  importaciones, deltas, sincronizaciones ni cargas de archivos reales por una
  instrucción genérica de continuar. Conservar intactos los datos ya incorporados.
- Decisión del propietario del 29 de septiembre de 2026: configuradores y 3D
  quedan fuera del proyecto. El alcance activo pasa a 21 módulos: excluye
  Pérgola sin 3D y Nuevo estimado 3D, junto con geometría, despiece y planos
  automáticos dependientes del configurador. Conservar datos, documentos, código
  histórico y permisos existentes; no implica borrar registros ni módulos operativos.
- Decisión del propietario del 6 de octubre de 2026: IA queda fuera del alcance.
  El cierre activo comprende 20 módulos; no activar el asistente ni análisis de
  recibos por IA. Conservar código histórico, recibos y revisiones existentes.
- Prioridad del propietario del 6 de octubre: trabajar únicamente los bloques
  1 Gastos y costos y 2 Comercial de la lista de seis. No continuar Operaciones,
  Administración, Portal ni preparación integral. Conservar lo ya existente.
- Centrar el trabajo autorizado en estos dos bloques contra
  ADT actual. Usar lectura del origen y datos sintéticos en staging.
  Las migraciones aditivas de esquema para implementar funciones no son una
  autorización para trasladar datos de negocio.
- Registrar por acción la regla del origen, equivalencia, prueba y diferencia.
  No introducir mejoras que cambien las reglas de ADT como parte de la paridad;
  los cambios propios de esta app se tratarán después con el propietario.
- El traspaso operativo sigue aplazado. ADT conserva la operación principal.

## Puesta en marcha solicitada el 7 de octubre

- El propietario descarta migrar datos de ADT. No realizar imports, sincronización,
  backfill de negocio ni eliminación de datos ya existentes.
- Autoriza preparar y activar producción y el correo del SaaS. El alta de empresas
  la realizan gerentes invitados por un administrador global, no el operador.
- Cuenta global designada por el propietario en el canal privado. La contraseña
  se introduce directamente en el navegador; no publicar identidad, credenciales
  ni asignaciones privadas en GitHub.
- Implementar y probar administrador global -> invitación de gerente -> creación
  de empresas -> invitaciones de equipo con rol y permisos; conservar aislamiento.
- Aclaración del propietario: el administrador global solo gestiona gerentes;
  no crea ni opera empresas. Solo los gerentes invitados, confirmados y activos
  crean empresas y gestionan sus equipos y permisos.
- Mantener IA, GPS físico y configuradores/3D excluidos.

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
