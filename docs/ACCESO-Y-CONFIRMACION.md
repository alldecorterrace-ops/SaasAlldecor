# Registro y confirmación del acceso

El registro sigue exigiendo una invitación vigente o una compra verificada.
La contraseña la establece el usuario y la confirmación la verifica Supabase;
esta corrección no activa correo externo ni cobros y no altera roles existentes.

El SDK instalado conserva verificadores PKCE separados para varios intentos.
Sin correlación en el enlace, la devolución puede elegir el último verificador,
aunque el código pertenezca a un intento anterior. El cliente del servidor activa
`experimental.appendPkceFlowIdToRedirects`; `/auth/callback` valida y pasa
`sb_flow_id` a `exchangeCodeForSession`. La entrada por Site URL conserva también
ese parámetro y el destino de recuperación. Los enlaces anteriores sin identificador
siguen siendo compatibles mediante el intercambio legado del SDK.

Site URL debe corresponder al origen configurado de la aplicación del entorno.
Supabase admite ese origen sin ampliar la lista de redirecciones a otros dominios.
Si se usan destinos de otro origen, revisar la lista exacta antes de activar este
flujo: el SDK añade un parámetro a la URL. No añadir comodines entre dominios.

Solo `/empresas` y `/actualizar-contrasena` son destinos finales permitidos.
Parámetros ambiguos o identificadores mal formados se rechazan antes de construir
el cliente. Fallos del proveedor se traducen a mensajes limitados; no se imprimen
códigos de acceso, cookies, cuerpos de error ni verificadores. La respuesta de
confirmación lleva `private, no-store` y `no-referrer`.
La excepción de cabeceras para las páginas de Auth y la entrada por Site URL se
aplica después de la regla general de Next; de lo contrario esa regla reemplaza
la política declarada en el handler. Una regresión usa el matcher real de Next.

El formulario distingue correo pendiente de confirmación, límite de intentos,
contraseña débil y servicio no disponible. Un correo inexistente y una contraseña
incorrecta conservan el mismo mensaje. Después de un registro procesado deja de
mostrar el formulario, indica el siguiente paso y permite ir al inicio de sesión.
En staging describe la captura privada sin prometer entrega externa.

Las pruebas usan el SDK SSR/Auth instalado, cookies en memoria y un endpoint
sintético que compara el desafío criptográfico. Reproducen la selección incorrecta
sin identificador y verifican dos devoluciones con identificadores distintos,
persistencia de sesión, destinos limitados, entradas inválidas y mensajes seguros.
Esto no sustituye una prueba de enlace y cookies contra Auth nativo en el hosting,
ni prueba entrega SMTP de confirmación o recuperación a un destinatario real.

## Ensayo dirigido de entrega real

El ensayo SMTP de staging queda apagado por defecto. Su configuración privada
autoriza una dirección exacta durante un máximo de dos horas; permite registro
y recuperación para esa dirección y mantiene el filtro de invitación o compra.
No activa los correos de negocio ni permite las cuentas ficticias mientras usa
SMTP. Confirmación y recuperación indican revisar el buzón únicamente en ese modo.

Las variables `STAGING_AUTH_SMTP_TEST_*` describen el alcance; la marca
`STAGING_AUTH_SMTP_CONFIG_VERIFIED` registra una verificación del operador y no
configura Supabase. La captura privada y SMTP deben ser modos excluyentes.
El límite de la aplicación no se debe presentar como un filtro de destinatarios
del SMTP: revisar también las cuentas existentes y las invitaciones de Auth,
mantener Before User Created activo, conservar la cuota original y restaurar el
hook de captura y el entorno al terminar o al vencer el ensayo. La configuración
no constituye evidencia de entrega: comprobar correo original, enlace nativo,
sesión, rol y empresa; el usuario crea y cambia la contraseña en el navegador.

Referencias: [intercambio de código de Supabase](https://supabase.com/docs/reference/javascript/auth-exchangecodeforsession)
y [redirecciones de Auth](https://supabase.com/docs/guides/auth/redirect-urls).
