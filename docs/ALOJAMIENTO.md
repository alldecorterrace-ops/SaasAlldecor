# Alojamiento permanente

## Política vigente de versiones

GitHub conserva el código y su historial. El hosting mantiene una entrega activa,
una anterior validada para retorno y las dependencias compartidas que ambas
necesiten. Las carpetas candidatas son temporales; no acumular una copia permanente
por cada despliegue. Aplicar la [política de versionado y retención](VERSIONADO-Y-RETENCION.md)
al cerrar cada entrega. Los apartados históricos siguientes describen despliegues
pasados y no amplían esa retención.

El 18 de septiembre de 2026 se instaló la versión `b82fbde` en https://app.alldecorpatio.com/login, en el segundo hosting del propietario. Utiliza cPanel/LiteSpeed, Node.js 22 y una entrada compatible con Passenger (`server.cjs`). No se contrató un plan adicional. Vercel no participa en este despliegue. La dirección anterior, https://saas.alldecorterrace.com/login, se conserva como opción de retorno.

## Traslado a app.alldecorpatio.com

La nueva raíz de aplicación es `saas-releases/b82fbde`, fuera del directorio público. El subdominio utiliza un directorio público independiente, `public_html/saas-public`. Se conservaron los archivos y las dos bases de datos que ya existían en esa cuenta. GitHub sigue siendo el origen del código; se mantiene el mismo proyecto de Supabase, con sus empresas, usuarios, reglas y archivos. No se ejecutaron migraciones de base de datos durante este traslado.

La compilación normal en el servidor nuevo falló con `spawn node EAGAIN`. La compilación completa, incluida TypeScript y la generación de páginas, pasó al limitar la afinidad a un CPU permitido. En esta cuenta se verificó el CPU 0; en otro servidor debe consultarse primero `Cpus_allowed_list` en `/proc/self/status`.

```sh
export PATH=/opt/alt/alt-nodejs22/root/usr/bin:$PATH
export NEXT_TELEMETRY_DISABLED=1
export NODE_OPTIONS='--max-old-space-size=1536 --v8-pool-size=1'
export RAYON_NUM_THREADS=1 UV_THREADPOOL_SIZE=1
taskset -c 0 npm run build -- --webpack
```

Supabase Auth Site URL y `NEXT_PUBLIC_SITE_URL` apuntan a `https://app.alldecorpatio.com`. Se añadió únicamente su callback exacto `/auth/callback`; se conserva el callback anterior para permitir el retorno. Las claves se transfirieron de forma privada y `.env.local` tiene permisos 0600. El proceso activo de LiteSpeed se verificó apuntando a la raíz nueva. Supabase Auth respondió HTTP 200 desde el nuevo servidor. La clave de IA está presente; no se probó una conversación de IA con una sesión de usuario en este dominio.

El certificado AutoSSL cubre el nuevo subdominio, con vencimiento el 17 de diciembre de 2026. Los resolutores públicos 1.1.1.1 y 8.8.8.8 devolvieron el destino nuevo. Las comprobaciones HTTPS con resolución fijada al servidor, manteniendo la validación del certificado, pasaron: login, registro, acceso del cliente, CSS, rechazo de archivos privados, callback sin código y redirecciones de rutas privadas. El resolutor predeterminado del equipo de despliegue todavía devolvía NXDOMAIN; por ello quedan pendientes la comprobación visual por DNS normal y el recorrido con una sesión real. Esto no constituye una auditoría funcional de los 23 módulos.

Para volver temporalmente al alojamiento anterior, utilizar su enlace y restaurar la Site URL de Supabase a ese origen. No revertir datos: ambos alojamientos utilizan el mismo proyecto de Supabase. No eliminar la versión anterior hasta completar el recorrido autenticado del destino.

El subdominio tiene certificado HTTPS y redirige HTTP a HTTPS. La aplicación y `.env.local` residen fuera de su directorio público; este solo contiene la configuración del servidor y archivos de validación de certificado. `.env.local` tiene permisos 0600. El repositorio no almacena claves, credenciales ni datos reales.

## Compilación en el servidor anterior

Su glibc 2.28 no carga el compilador nativo SWC de esta versión de Next. La alternativa verificada es Webpack con SWC WASM, dos trabajadores de Next y un hilo de Rayon. Node.js procede de la distribución oficial y su archivo se verificó contra SHA256SUMS antes de instalarlo en una carpeta propia; no se reemplazó el Node del sistema ni el de otras aplicaciones.

Con el ejecutable Node 22 al principio de PATH:

```sh
npm ci --no-audit --no-fund
NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=1536 RAYON_NUM_THREADS=1 UV_THREADPOOL_SIZE=1 npm run build -- --webpack
```

No recompilar sobre una carpeta que esté sirviendo usuarios. Para futuras entregas, preparar una carpeta de versión nueva con el commit revisado, su entorno privado y sus dependencias; compilar y verificar antes de cambiar PassengerAppRoot. Conservar la carpeta anterior y su configuración como punto de retorno. Reiniciar solo la aplicación del SaaS mediante su archivo `tmp/restart.txt`.

En la actualización a `72267e8`, LiteSpeed conservó el proceso de la raíz anterior aunque PassengerAppRoot ya había cambiado. Fue necesario tocar `tmp/restart.txt` en **la raíz del proceso anterior** para que arrancara el de la nueva carpeta. Hubo respuestas 503 durante ese reinicio breve. No basta con verificar `.htaccess`: comprobar la ruta del proceso `lsnode` activo y una ruta que solo exista en la entrega nueva. La raíz activa verificada es la carpeta de versión `saas-releases/72267e8`; la configuración anterior y las carpetas previas se conservaron fuera del directorio público.

La entrada pública configura PassengerAppRoot, PassengerAppType=node, PassengerStartupFile=server.cjs, PassengerNodejs con la ruta absoluta a Node 22 y PassengerAppEnv=production. Desactiva los listados de directorio y las páginas de error detalladas. No modificar la configuración de ADT ni de otras aplicaciones del hosting.

## Autenticación y comprobaciones del servidor anterior (17 de septiembre)

- `NEXT_PUBLIC_SITE_URL=https://saas.alldecorterrace.com` en el entorno de compilación y ejecución.
- Supabase Auth Site URL apunta al mismo origen y autoriza únicamente el callback exacto `/auth/callback` de este dominio. Se retiró el callback del túnel anterior.
- Login y registro: HTTP 200. Empresas, facturas y gastos sin sesión: redirección al login del dominio permanente.
- `.env.local` y `.git/config`: HTTP 403; `package.json`: 404. No se publican los archivos del proyecto como contenido estático.
- Callback sin código: redirección al login con mensaje de enlace inválido. No se ha enviado un nuevo correo real como prueba del despliegue.
- Pantalla de login revisada visualmente en navegador con estilos cargados. Pendiente recorrido autenticado de los módulos nuevos.
- Entrega `72267e8`: login, acceso del cliente y página de cliente sin sesión responden 200; las rutas nuevas de Precios, Diseños, Solicitudes web, Propuestas, Portal e IA redirigen al login sin sesión. Un formulario inexistente responde 404. El navegador confirmó que un código privado inválido muestra el mensaje de rechazo, sin conceder acceso.

El alojamiento compartido tiene límites de recursos y no se ha sometido a una prueba de carga. Quedan pendientes monitoreo, alertas, copias programadas, ensayo de restauración y un entorno de staging independiente. No interpretar una respuesta HTTP correcta como prueba de capacidad o de todos los flujos de negocio.

## Retorno

Conservar la versión anterior antes de cada actualización y restaurar su PassengerAppRoot si una comprobación falla. No revertir datos ni eliminar tablas para retirar una versión de interfaz. Revisar compatibilidad de estados y funciones SQL antes de usar código anterior. Durante la primera publicación solo existía el túnel temporal, que ya no está disponible; no constituye un destino de respaldo.

## Dependencias compartidas entre entregas

Si una instalación nueva alcanza el límite de archivos del hosting, comprobar
que `package-lock.json` es idéntico al de una entrega ya compilada. Una entrega
nueva puede usar un enlace simbólico a esas dependencias, conservando su propio
código, entorno y carpeta `.next`. Compilar con `--webpack` evita depender de la
resolución de enlaces fuera de la raíz de Turbopack.

Registrar el destino del enlace en la evidencia de entrega. La carpeta que
contiene esas dependencias pasa a ser necesaria para el servicio: no retirarla
como parte de la limpieza de versiones anteriores. No ejecutar `npm ci` sobre
las dependencias compartidas ni sobre la aplicación activa. Cuando cambie el
archivo de versiones, preparar una instalación distinta y volver a validar.
