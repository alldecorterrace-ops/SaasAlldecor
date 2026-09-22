# Cola duradera para el traspaso

Fundación preparada el 22 de septiembre de 2026, **desactivada y no desplegada**.
La migración 026 es aditiva; no modifica rutas, tablas ni escrituras actuales de ADT.
No configura un consumidor y no demuestra todavía ausencia de pérdida/duplicación
en una operación de negocio. ADT conserva la autoridad.

## Interfaces

- `POST /api/operations/{companyId}`: sesión validada, Origin del sitio y JSON
  limitado a 32 KiB. Cuerpo `{id, action, payload}`; no admite empresa, actor o
  autoridad impuestos desde el cuerpo. Devuelve 202 mientras espera, 200 al
  consultar por reintento un resultado terminal, 409 si cambia el contenido del ID.
- `GET /api/operations/{companyId}/{id}`: resultado consultable por el actor o
  gestor autorizado; siempre exige acceso actual al módulo. No revela payload,
  token de ejecución ni existencia de solicitudes ajenas.
- `/app/{companyId}/solicitudes/{id}`: muestra «Procesando» y consulta el estado;
  una consulta fallida no reenvía la operación.
- `GET /api/transition/{companyId}`: estado de autoridad, fase y pendientes,
  limitado a gestores. `POST` pausa nuevas asignaciones a ejecutores. No habilita
  ni cambia la autoridad.

La aplicación necesita `OPERATION_QUEUE_ENABLED=true`, la migración aplicada,
control de empresa habilitado y un adaptador registrado y verificado. Ninguno de
los adaptadores se registra automáticamente. Mantener desactivado en producción.

## Persistencia y ejecución

Las tablas privadas guardan ID único por empresa, actor de sesión, acción, módulo,
contenido, SHA-256, autoridad, época, estado, asignación, resultado y eventos.
Un reintento idéntico devuelve la misma solicitud; cambiar actor, acción o contenido
con el mismo identificador se rechaza. Los roles del navegador no tienen acceso
directo a las tablas ni a las funciones de ejecución. No hay clave administrativa
en el cliente.

El ejecutor interno reclama una sola vez, exige autoridad/época y revalida membresía
y permiso. La respuesta solo se confirma con el token de asignación. Una finalización
repetida idéntica conserva el mismo evento; una contradictoria se rechaza. Al pausar,
se siguen recibiendo solicitudes y se impiden nuevas asignaciones. Las anteriores
pueden terminar. El límite inicial es de mil solicitudes abiertas por empresa.

Una ejecución de más de quince minutos se puede señalar para revisión con el
barrido interno; **no hay reintento automático de efectos ambiguos**. El barrido
también está pendiente de programar. Ninguna función permite cambiar libremente
de revisión a completado o borrar la solicitud.

## Lo que falta antes del traspaso

El registro de solicitudes no es un registro completo de cambios del negocio.
Para cada acción, el adaptador de ADT debe guardar su identificador y efecto en la
misma transacción del origen, exponer su resultado y emitir los cambios conciliables.
El adaptador SaaS debe hacer lo mismo en PostgreSQL. Un HTTP 200 o un acuse de la
cola no demuestra ese compromiso transaccional. No repetir una llamada remota
tras perder su respuesta sin consultar su recibo en el sistema que la ejecutó.

Inventariar e interceptar todas las escrituras: acciones web actuales, formularios
públicos, Storage, webhooks, cron, integraciones, Campo y dispositivos pendientes.
Hoy continúan fuera de esta cola, por lo que **el cambio está bloqueado por diseño**.
No habilitar un botón de cambio hasta cerrar esa cobertura y los otros cinco puntos.

El ensayo debe probar recepción concurrente, drenaje, punto conciliado, reasignación
atómica de pendientes y exclusión de escrituras antiguas mediante fencing en ADT.
Probar respuesta perdida tras commit, revocación, caída de ejecutor, reintentos,
dos empresas y recuperación después de nuevas escrituras SaaS. Las pruebas PGlite
locales validan las invariantes SQL de esta fundación; no prueban concurrencia entre
servidores, dispositivos, efectos remotos ni fidelidad de la migración.

Después del cambio validado: ADT solo consulta durante catorce días, conservar
archivo/recuperación y conciliar cualquier escritura nueva antes de un retorno.
