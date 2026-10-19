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
- Aclaración posterior: toda cuenta nueva requiere una invitación vigente.
  El administrador global invita gerentes; solo gerentes invitados, confirmados y
  activos invitan a usuarios de sus empresas. El equipo, incluido su administrador
  de empresa, no crea empresas ni invita gerentes. Bloquear también el alta directa
  en Supabase Auth; no basta ocultar el formulario. Preservar cuentas existentes.
- Mantener IA, GPS físico y configuradores/3D excluidos.

## Suscripciones solicitadas el 7 de octubre

- Nuevo modelo: quien paga un plan y confirma su correo obtiene una empresa y
  queda como gerente/propietario principal. El pago se verifica en el servidor.
- Empleados entran por invitación a su correo, crean su contraseña y confirman
  el correo. Administradores de empresa con acceso total también invitan y
  gestionan equipo, sin quitar, suspender ni degradar al propietario principal.
- Preparar únicamente pruebas: el propietario aún no tiene cuenta Stripe.
  Conservar cuentas, empresas e invitaciones previas. No efectuar cobros reales.
- Cuatro planes por empresa, USD mensuales, todos los módulos activos incluidos:
  Inicial 29/3 usuarios, Equipo 59/5, Profesional 99/10, Crecimiento 179/25.
  El propietario cuenta y las invitaciones pendientes reservan plazas.
- Esta decisión sustituye la restricción anterior que impedía invitar a los
  administradores de empresa. No introduce IA, GPS ni importaciones de ADT.

## Prioridad de cierre del registro, 14 de octubre

- Completar, en orden: entrega real y recorrido de confirmación del registro;
  entrega real y cambio de contraseña por el usuario; publicación del acceso
  verificado en producción. Conservar contraseñas, datos y membresías existentes.
- Después de cerrar esos tres puntos, trabajar la diferenciación entre planes
  mediante capacidades y límites reales, además del precio y las plazas.
  No modificar esa diferenciación durante el cierre del registro.
- La cuenta definitiva de Stripe y los cobros reales siguen aplazados.

## Diferenciación de planes, 16 de octubre

- Sustituye los precios y límites propuestos el 7 de octubre para nuevas compras:
  Inicial 29.99 USD, 1 usuario dueño, 1 empresa, 10 facturas/mes; Equipo 99.99 USD,
  dueño + 4 usuarios, hasta 3 empresas, 100 facturas/mes; Profesional 299.99 USD,
  dueño + 20 usuarios, empresas y facturas ilimitadas, soporte por email;
  Crecimiento 499.99 USD, usuarios/empresas/facturas ilimitados, email y teléfono,
  creación de sitio web personalizado y cambios personalizados en módulos.
- El propietario confirmó expresamente: cupo de facturas compartido por
  suscripción. Las personas y empresas también se cuentan por suscripción;
  la misma persona en varias empresas ocupa una plaza. Cada empresa conserva
  datos y permisos independientes. Solo el dueño crea empresas con su plan.
- Contar facturas al crearlas, por mes natural UTC; anulación, eliminación o
  fecha retroactiva no restituyen cupo. Reintentos no duplican el consumo.
- Conservar las condiciones del catálogo anterior en suscripciones existentes.
  Los servicios personalizados se coordinan con personas; no simular su entrega.
- La cuenta permanente de Stripe y los cobros reales siguen aplazados. Preparar
  y comprobar primero en local/staging. No trasladar esta entrega a producción
  ni enviar correos reales por una instrucción genérica de continuar.

## Conexión del sandbox permanente, 16 de octubre

- El propietario autoriza conectar su sandbox existente de Stripe a staging,
  instalar sus claves de prueba de forma privada en el hosting y crear el webhook
  de los seis eventos de pago. Esto sustituye el aplazamiento de esa conexión.
- Usar los precios y límites del catálogo 20261016. Probar pagos ficticios;
  mantener producción, cobros reales, correo externo y datos anteriores intactos.
- Conservar el historial del sandbox temporal. Sus identificadores de cliente y
  suscripción pertenecen a otra cuenta Stripe; no reasignarlos al sandbox nuevo
  ni presentar su portal antiguo como operativo con las claves nuevas.

## Publicación de suscripciones, 19 de octubre

- El propietario pide expresamente pasar esta entrega a producción. Preparar y
  publicar catálogo, esquema y cobro por suscripción conservando datos y acceso.
  Esta autorización sustituye el aplazamiento de la entrega, no autoriza compras
  ni cargos reales de prueba ni nuevos mensajes a destinatarios externos.
- Respaldar antes de aplicar el esquema y conservar un retorno de código
  compatible. Separar los eventos del SaaS del flujo de ADT en Stripe/Make.
- Las credenciales se instalan de forma privada; no publicar claves ni pedirlas
  por chat. Preferir una clave Stripe restringida al uso del SaaS.
- Apple Pay y Amazon Pay conservan su comprobación de cartera pendiente.

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
