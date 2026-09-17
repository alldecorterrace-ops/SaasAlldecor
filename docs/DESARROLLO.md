# Desarrollo

Requisitos: Node.js 22 o posterior, npm y un proyecto Supabase.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

En PowerShell usar `Copy-Item .env.example .env.local`. Completar las variables en el archivo local: URL de Supabase, clave publicable y URL de la aplicación (`http://localhost:3000` en desarrollo). Nunca usar service_role como clave pública. `.env.local` está excluido de Git.

## Base de datos

En un proyecto Supabase nuevo y vacío, revisar y ejecutar los archivos de `supabase/migrations/` en orden 001–014, desde SQL Editor con un rol administrativo. Las ampliaciones 005, 006 y 007 agregan facturas/proyectos/pagos, trabajadores/gastos/recibos y la protección de recibos de gastos anulados. No ejecutarlos sobre una base existente sin revisar su estado. En el proyecto del propietario los catorce ya están aplicados manualmente; reconciliar el historial de Supabase CLI antes de usar db push. Los archivos `supabase/verify-*.sql` contienen comprobaciones de solo lectura.

Las migraciones no importan datos de ADT. Las tarifas iniciales se cargaron por separado mediante un archivo privado que no está en el repositorio. Para IA, configurar OPENAI_API_KEY solo en el servidor y revisar el límite por empresa. Las pruebas automatizadas usan datos sintéticos en memoria en PGlite, sin conexión al proyecto remoto. Los ensayos adicionales de despliegue ejecutados en Supabase usaron empresas sintéticas dentro de transacciones terminadas en ROLLBACK, sin conservar registros de prueba.

## Primer acceso

1. Verificar en Supabase Auth la Site URL y las Redirect URLs para el entorno. Permitir la URL exacta `http://localhost:3000/auth/callback` para desarrollo, manteniendo los demás destinos autorizados. Para publicación usar el dominio definitivo con HTTPS.
2. Abrir `/registro`, introducir el correo y una contraseña propia de al menos 12 caracteres y confirmar el correo en el mismo navegador. La raíz también acepta el código de confirmación de la Site URL y lo entrega al callback fijo.
3. Entrar y crear la primera empresa. Agregar usuarios por correo después de que estén registrados y confirmados; asignar sus permisos.
4. Validar el recorrido con un cliente identificado como prueba antes de importar datos reales. Archivar conserva el registro.

Si Supabase limita el envío de confirmaciones, configurar el proveedor SMTP antes de incorporar usuarios externos. No desactivar la confirmación para eludir este requisito.

## Verificación

```sh
npm run check
```

Ejecuta lint, tipos, pruebas PostgreSQL y compilación. Para servir la compilación: `npm start`. El servidor local escucha solo en 127.0.0.1. Sin variables de conexión, la aplicación dirige las rutas protegidas a la pantalla de configuración inicial.

GitHub Actions ejecuta las mismas comprobaciones sin claves ni datos reales. Un resultado verde no sustituye las pruebas autenticadas de navegador ni la conciliación de una migración.

## Acceso remoto temporal

El entorno del propietario ya utiliza [alojamiento permanente](ALOJAMIENTO.md). El túnel anterior está retirado; estas instrucciones se conservan solo para revisiones temporales futuras.

Para una revisión remota se puede exponer exclusivamente el servidor de la aplicación mediante un túnel HTTPS temporal de Cloudflare. El servidor debe seguir escuchando en 127.0.0.1. Configurar `NEXT_PUBLIC_SITE_URL` con el origen HTTPS del túnel y recompilar; añadir en Supabase Auth la URL exacta de ese origen terminada en `/auth/callback`, sin comodines. La confirmación debe abrirse en el mismo navegador utilizado para el registro.

El callback usa el origen configurado para no redirigir a localhost detrás del proxy. El enlace temporal depende de que la computadora, el servidor y el túnel continúen activos; no constituye alojamiento permanente. Al retirar el túnel, quitar su URL de la lista de redirecciones de Supabase y ajustar la variable del entorno al destino vigente. Las herramientas, logs y direcciones temporales locales se guardan bajo `.local/`, fuera de Git.
