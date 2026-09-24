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
  aislamiento frente a un usuario sin membresía.
- Clientes con nombre largo: a 390 × 844, ancho de documento y cuerpo de 390 px;
  tabla de 514 px dentro de un contenedor de 348 px con desplazamiento interno.
  Las capturas del navegador integrado no conservaron una escala visual útil;
  la evidencia de tamaño es del DOM renderizado. Falta la comprobación en teléfono real.
- Cambiar la zona horaria de A y recargar: conserva America/Chicago.
- Crear una invitación desde Configuración y revocarla: pasa de Pendiente a
  Revocada y conserva «Sin intentos de correo registrados». Los envíos externos
  permanecen desactivados. No demuestra entrega ni aceptación por otro perfil.

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

Las pruebas comprueban conflicto terminal, conservación del registro y auditoría,
reaplicación sin cambios de acceso, traducción de errores y rechazo sin efecto en
la cola. El ensayo remoto después de aplicar la corrección se registrará por separado;
las pruebas locales no acreditan el comportamiento de PostgREST real.

## Límites de esta evidencia

No cierra ninguno de los seis puntos. Faltan los otros perfiles, aceptación y
recuperación de cuenta, recorridos comerciales/financieros/operativos completos,
restauración desde Drive, carga y traspaso. ADT sigue siendo el sistema principal.
La migración 028 requiere las anteriores; producción todavía no tiene 026–027.
No aplicar aisladamente 028 ni volver a ejecutar el bootstrap de base vacía.
