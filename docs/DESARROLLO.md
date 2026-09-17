# Desarrollo

Requisitos: Node.js 22 o posterior, npm y un proyecto Supabase.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

En PowerShell usar `Copy-Item .env.example .env.local`. Completar las variables en el archivo local: URL de Supabase, clave publicable y URL de la aplicación (`http://localhost:3000` en desarrollo). Nunca usar service_role como clave pública. `.env.local` está excluido de Git.

## Base de datos

En un proyecto nuevo y vacío, revisar y ejecutar `supabase/migrations/202609170001_foundation.sql` desde SQL Editor con un rol administrativo. No ejecutarlo sobre una base existente sin revisar su estado. En el proyecto del propietario ya está aplicado. `supabase/verify-foundation.sql` contiene una comprobación de solo lectura.

La migración no importa datos de ADT. Los datos sintéticos de las pruebas quedan en memoria en PGlite, sin conexión al proyecto remoto.

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
