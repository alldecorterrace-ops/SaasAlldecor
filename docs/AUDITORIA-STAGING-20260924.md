# Auditoría autenticada de staging: 24 de septiembre de 2026

Entorno: https://staging.alldecorpatio.com. Primera sesión de propietario creada
e iniciada por el titular; su contraseña no se recibió ni se guardó en el proyecto.
Todas las escrituras siguientes usan empresas y contactos ficticios. Los identificadores,
consultas y evidencias detalladas se conservan fuera de GitHub.

## Recorridos comprobados en la aplicación publicada

- Crear dos empresas desde Tus empresas, entrar en sus paneles y cambiar entre ellas.
- Crear un cliente por empresa; editar y reabrir su ficha. Nombre, dirección,
  notas, correo y teléfono ficticios aparecen de nuevo en ficha/listado.
- El listado de A estaba vacío tras crear el cliente B; después muestra solo su
  cliente A. El propietario tiene acceso a ambas: esto no demuestra todavía
  aislamiento frente a un usuario sin membresía. Abrir la ficha A bajo la ruta
  de empresa B devuelve «Página no disponible», sin mostrar sus datos.
- Clientes con nombre largo: a 390 × 844, ancho de documento y cuerpo de 390 px;
  tabla de 514 px dentro de un contenedor de 348 px con desplazamiento interno.
  Las capturas del navegador integrado no conservaron una escala visual útil;
  la evidencia de tamaño es del DOM renderizado. Falta la comprobación en teléfono real.
- Cambiar la zona horaria de A y recargar: conserva America/Chicago.
- Crear una invitación desde Configuración y revocarla: pasa de Pendiente a
  Revocada y conserva «Sin intentos de correo registrados». Los envíos externos
  permanecen desactivados. No demuestra entrega ni aceptación por otro perfil.
- Actividad muestra las altas, ediciones, cambio de empresa y la invitación
  creada/revocada, con la zona horaria correspondiente.

## Recorrido comercial y financiero sintético

Desde la sesión de propietario se creó un estimado para el cliente A con una
partida de tres unidades a 33,35 USD: subtotal 100,05, descuento 0,10, impuestos
2,05 y total 102,00. Guardado y reapertura conservaron datos e importes.

Una aprobación explícitamente marcada como simulación creó una factura y un
proyecto enlazados, sin registrar pagos automáticamente. La factura mostró el
total de 102,00 y saldo de 102,00. El intento de registrar 103,00 fue rechazado
por superar el saldo, sin crear un pago. Un registro ficticio posterior de 30,00,
método Otro y referencia de simulación, dejó estado Pago parcial y saldo 72,00.
No hubo cobro, transferencia, envío comercial ni autorización de un cliente real.

El proyecto enlazado muestra los mismos importes; pasó a Planificación con fechas
de prueba y conservó estado, fechas y notas después de recargar. La vista imprimible
del estimado muestra estado Aprobado, revisión 2 y los importes correctos. No se
exportó un PDF ni se comprobó impresión física en este recorrido.

Incidencia descubierta de interfaz: al devolver el error de sobrepago, `FinanceForm`
restablece sus campos (incluidos importe, método y referencia) a los valores
iniciales. No altera el saldo, pero obliga a reintroducir los datos. Debe conservar
la entrada ante un rechazo y limpiar únicamente tras el éxito. La corrección de
código cancela el restablecimiento automático salvo cuando la acción confirma un
guardado; [React documenta ese restablecimiento de campos no controlados](https://react.dev/reference/react-dom/components/form).
Falta publicar y repetir el rechazo y el guardado válido para cerrar la incidencia.
Tampoco se ensayaron aún reversión, anulación, otros perfiles ni
concurrencia financiera por navegador.

El titular creó la segunda cuenta sintética en Supabase. Se verificó su existencia
y se creó su invitación desde Configuración, sin intentos de correo. Queda pendiente
su inicio de sesión privado, aceptación y recorrido con permisos restringidos.

## Defecto descubierto al editar desde dos pestañas

Una pestaña conservó una versión anterior mientras la otra guardó una actualización.
La edición obsoleta quedó en «Guardando» durante varios minutos. PostgreSQL conservó
la edición ganadora en versión 3; la segunda no la sobrescribió. Salud de staging
y producción respondió 200, pero el recorrido de conflicto falló.

El entorno usa PostgREST 14.5. Las funciones usaban deliberadamente SQLSTATE `40001`
para conflictos de negocio. [Supabase documenta el reintento indefinido de ese código
en PostgREST 14](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b).
Se canceló únicamente la consulta identificada de esta prueba en staging.

La migración aditiva `202609240028_business_conflicts.sql` cambia los conflictos
deliberados a `PT409`, sin modificar firmas, permisos ni reglas de negocio. Incluye
28 funciones de edición, finanzas, operaciones y transición. El ejecutor reconoce
también ese rechazo sin registrar un efecto. La aplicación mantiene mensajes
comprensibles y compatibilidad con el código anterior durante la publicación.

Las 274 pruebas, lint, tipos y compilación pasaron, junto con los tres jobs de
[CI del commit f1fbf02](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36042644319).
Comprueban conflicto terminal, conservación del registro y auditoría,
reaplicación sin cambios de acceso, traducción de errores y rechazo sin efecto en
la cola.

La migración terminó con `COMMIT` exclusivamente en staging y el historial registra
28 entradas. La comparación de funciones conservó ACL, modo de seguridad y
`search_path`; no quedan funciones de negocio que eleven deliberadamente `40001`.
El contenido registrado de 028 coincide con el archivo publicado. La preparación
local tuvo dos intentos detenidos por el control de huellas, ambos revertidos antes
de cambiar funciones; corregir la lectura UTF-8 en Windows permitió comprobar las
27 entradas existentes sin excepciones ni modificaciones del historial.

Se publicó `f1fbf02` después de comprobar CI y build del hosting. El proceso activo
resuelve a esa entrega; producción mantiene su raíz y proceso anteriores. Ambas
rutas de salud responden 200. La nueva prueba de dos pestañas devuelve el aviso
de versión obsoleta, conserva el texto no guardado y habilita de nuevo el botón.
Repetir el intento devuelve el mismo rechazo; la base conserva la edición ganadora
en versión 4. Tras la prueba no había RPC activas reintentando. El historial visible
muestra las escrituras aceptadas y la creación/revocación de la invitación.

La entrega anterior `d530c33` se conserva como retorno de código, junto con la
dependencia compartida `b149bee/node_modules`. Su mensaje para `PT409` es genérico:
volver al código anterior no debe deshacer la protección de la base ni reintroducir
el reintento. No se ha ensayado todavía un retorno completo.

## Límites de esta evidencia

No cierra ninguno de los seis puntos. Faltan los otros perfiles, aceptación y
recuperación de cuenta, recorridos comerciales/financieros/operativos completos,
restauración desde Drive, carga y traspaso. ADT sigue siendo el sistema principal.
La migración 028 requiere las anteriores; producción todavía no tiene 026–027.
No aplicar aisladamente 028 ni volver a ejecutar el bootstrap de base vacía.
