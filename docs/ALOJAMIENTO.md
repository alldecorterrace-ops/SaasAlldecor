# Alojamiento permanente

La aplicación está disponible en https://saas.alldecorterrace.com/login desde el 17 de septiembre de 2026. Utiliza el hosting existente del propietario, con cPanel/LiteSpeed, Node.js 22 y una entrada compatible con Passenger (`server.cjs`). No se contrató un plan adicional. Vercel no participa en este despliegue.

El subdominio tiene certificado HTTPS y redirige HTTP a HTTPS. La aplicación y `.env.local` residen fuera de su directorio público; este solo contiene la configuración del servidor y archivos de validación de certificado. `.env.local` tiene permisos 0600. El repositorio no almacena claves, credenciales ni datos reales.

## Compilación en este servidor

Su glibc 2.28 no carga el compilador nativo SWC de esta versión de Next. La alternativa verificada es Webpack con SWC WASM, dos trabajadores de Next y un hilo de Rayon. Node.js procede de la distribución oficial y su archivo se verificó contra SHA256SUMS antes de instalarlo en una carpeta propia; no se reemplazó el Node del sistema ni el de otras aplicaciones.

Con el ejecutable Node 22 al principio de PATH:

```sh
npm ci --no-audit --no-fund
NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=1536 RAYON_NUM_THREADS=1 UV_THREADPOOL_SIZE=1 npm run build -- --webpack
```

No recompilar sobre una carpeta que esté sirviendo usuarios. Para futuras entregas, preparar una carpeta de versión nueva con el commit revisado, su entorno privado y sus dependencias; compilar y verificar antes de cambiar PassengerAppRoot. Conservar la carpeta anterior y su configuración como punto de retorno. Reiniciar solo la aplicación del SaaS mediante su archivo `tmp/restart.txt`.

La entrada pública configura PassengerAppRoot, PassengerAppType=node, PassengerStartupFile=server.cjs, PassengerNodejs con la ruta absoluta a Node 22 y PassengerAppEnv=production. Desactiva los listados de directorio y las páginas de error detalladas. No modificar la configuración de ADT ni de otras aplicaciones del hosting.

## Autenticación y comprobaciones

- `NEXT_PUBLIC_SITE_URL=https://saas.alldecorterrace.com` en el entorno de compilación y ejecución.
- Supabase Auth Site URL apunta al mismo origen y autoriza únicamente el callback exacto `/auth/callback` de este dominio. Se retiró el callback del túnel anterior.
- Login y registro: HTTP 200. Empresas, facturas y gastos sin sesión: redirección al login del dominio permanente.
- `.env.local` y `.git/config`: HTTP 403; `package.json`: 404. No se publican los archivos del proyecto como contenido estático.
- Callback sin código: redirección al login con mensaje de enlace inválido. No se ha enviado un nuevo correo real como prueba del despliegue.
- Pantalla de login revisada visualmente en navegador con estilos cargados. Pendiente recorrido autenticado de los módulos nuevos.

El alojamiento compartido tiene límites de recursos y no se ha sometido a una prueba de carga. Quedan pendientes monitoreo, alertas, copias programadas, ensayo de restauración y un entorno de staging independiente. No interpretar una respuesta HTTP correcta como prueba de capacidad o de todos los flujos de negocio.

## Retorno

Conservar la versión anterior antes de cada actualización y restaurar su PassengerAppRoot si una comprobación falla. No revertir datos ni eliminar tablas para retirar una versión de interfaz. Revisar compatibilidad de estados y funciones SQL antes de usar código anterior. Durante la primera publicación solo existía el túnel temporal, que ya no está disponible; no constituye un destino de respaldo.
