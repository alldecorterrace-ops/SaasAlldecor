# Cola duradera para el traspaso

Fundación y drenaje preparados el 22 de septiembre de 2026, **desactivados y no
desplegados**. Las migraciones 026–027 son aditivas; no modifican rutas, tablas ni
escrituras actuales de ADT. No configuran un consumidor permanente ni demuestran
el traspaso entre los dos sistemas. ADT conserva la autoridad.

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
repetida idéntica conserva el mismo evento; una contradictoria se rechaza. El límite
inicial es de mil solicitudes abiertas por empresa.

La migración 027 corrige el drenaje de 026: al pausar, un bloqueo por empresa fija
un número de corte y una sesión de transición. Las solicitudes anteriores siguen
disponibles para el ejecutor de ADT; las posteriores se reciben sin autoridad ni
época asignada. Repetir la pausa no mueve el corte. No se interrumpe la recepción
duradera mientras se drena el trabajo anterior.

`app_private.finalize_adt_transition` solo permite la dirección ADT → SaaS. Requiere
el corte drenado, ninguna solicitud incierta/en ejecución, adaptadores SaaS verificados
para todas las acciones registradas y evidencia privada reciente de inventario,
conciliación, recuperación, auditoría y bloqueo de escrituras del origen. La evidencia
caduca en un máximo de quince minutos y debe corresponder a un propietario activo.
El cambio asigna las solicitudes retenidas y sube la época en una sola transacción;
los ejecutores de la época anterior quedan excluidos. El navegador no tiene permisos
para ejecutar esta función ni registrar evidencia. **Los hashes son atestaciones
administrativas: no prueban por sí solos que ADT haya bloqueado todas sus escrituras.**

El primer adaptador nativo, `execute_saas_customer_operation`, guarda el cliente,
su versión anterior/posterior y el resultado de la solicitud dentro de la misma
transacción PostgreSQL. Revalida el actor y sus permisos, rechaza versiones obsoletas
y devuelve la solicitud a su estado previo si la transacción falla. Solo procesa
`customer.save`; no habilita esa acción automáticamente ni sustituye los adaptadores
de ADT o de los otros módulos. Los registros de cambios son privados.

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
La recepción HTTP sigue en Next.js y debe separarse del proceso que se reinicia en
los despliegues antes de afirmar continuidad de recepción.

El ensayo debe probar recepción concurrente, drenaje, punto conciliado, reasignación
atómica de pendientes y exclusión de escrituras antiguas mediante fencing en ADT.
Probar respuesta perdida tras commit, revocación, caída de ejecutor, reintentos,
dos empresas y recuperación después de nuevas escrituras SaaS. Las pruebas PGlite
locales validan las invariantes SQL de esta fundación; no prueban concurrencia entre
servidores, dispositivos, efectos remotos ni fidelidad de la migración.

`scripts/test-queue-concurrency.ts` ejecuta un ensayo adicional con conexiones reales
independientes a PostgreSQL 17 en GitHub Actions. Solo admite una base vacía llamada
`saas_queue_test` en loopback. Prueba solicitudes idénticas simultáneas, corte concurrente,
reclamaciones exclusivas, cambio repetido, respuesta perdida y rollback del efecto
del cliente. El acuse del lado ADT y las evidencias son **fixtures sintéticas**, no
efectos ni autorizaciones de producción. `tests/queue-transition.test.ts` cubre además
permisos, caducidad, estado incierto, adaptadores incompletos y fallos del registro.

Después del cambio validado: ADT solo consulta durante catorce días, conservar
archivo/recuperación y conciliar cualquier escritura nueva antes de un retorno.
