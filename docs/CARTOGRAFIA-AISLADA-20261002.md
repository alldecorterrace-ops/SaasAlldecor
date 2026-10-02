# Cartografía aislada · 2 de octubre de 2026

## Cambio

La capa de Leaflet 1.9.4 ya está alojada en el SaaS. Esta entrega añade un
banco de cartografía para una empresa sintética exacta de staging, con tres
variables privadas de habilitación. La configuración valida de nuevo la base y
el dominio separados. Una segunda empresa, una lista, un comodín o una
configuración incompatible no habilitan calles externas. Los permisos del mapa
y de sus cuatro fuentes siguen siendo necesarios antes de mostrar el banco.

Los envíos generales, Auth y Assistant conservan sus restricciones. Ningún
nombre, factura, identificador de empresa, dirección de cliente ni coordenada
GPS se incorpora a la URL de las imágenes: únicamente z/x/y públicos. El
navegador utiliza su caché HTTP normal y envía solo el origen como Referer.

La capa comunica carga, disponibilidad parcial y un plazo de 15 segundos.
Un error permanece visible aunque Leaflet termine de cargar las otras imágenes.
El reintento es manual y conserva vista, filtros, puntos, lista y exportación.
No hay consultas automáticas, precarga masiva, descarga offline ni parámetros
para eludir caché. Los eventos tardíos se descartan al desmontar la capa.

El banco incluye un fallo **simulado local** mediante imágenes inexistentes,
identificado en pantalla. Ese modo no consulta OpenStreetMap y no constituye
prueba de una caída real del proveedor. Producción ignora ese selector y
conserva su comportamiento anterior; esta entrega se publica solo en staging.

## Referencias revisadas

- [Política oficial de tiles de OSM](https://operations.osmfoundation.org/policies/tiles/),
  revisada el 2 de octubre: URL HTTPS, atribución visible, Referer, caché del
  navegador y uso de una vista interactiva. Servicio sin garantía de disponibilidad.
- [API oficial de Leaflet 1.9.4](https://leafletjs.com/reference.html#tilelayer-tileerror):
  loading, tileerror, load y redraw. Biblioteca local sin cambio de dependencias.

## Verificación de código

Lint, tipos, las 603 pruebas y compilación locales completados. Se añaden seis
casos: alcance de empresa, bloqueo de configuración insegura, comportamiento
anterior de producción, error parcial, timeout y eventos después de desmontar.
No se cambia esquema ni se escriben registros de negocio para esta corrección.

Antes del despliegue se capturó en sesión la tabla sintética y el CSV privado:
205 bytes, SHA-256 7dbabd1c7c578b9220014cb2276478dbd993d5367e7dfa644784734c7daf0012.
Dos puntos; ZIP 33101, ciudad Peña, "Árbol", dos contactos, un cerrado, 50 % y
$100 en la tabla. Esta es evidencia anterior a la nueva capa, no prueba de la
nueva entrega. Capturas y bytes quedan fuera de GitHub.

## Estado

Publicada en staging desde `ab2307fa91b86a830e09fdaef2cd1266d35454da`,
con [CI 36971655443](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36971655443)
completo aprobado: check, concurrencia PostgreSQL y recuperación. Las 603
pruebas pasaron, junto con lint, tipos, compilación y los harness PHP.
Retorno `c7bdaf498409d9d066cf12785605df6fb7267721`; esquema 066 sin cambios.
El hosting compiló con una CPU y las dependencias compartidas anteriores.
Paquete exacto SHA-256 c344e7e595a379b3fc5f3afd44ed7f102185ca00077e0e02300ac3fc9cbc0558.

La raíz activa, proceso Node, cuatro rutas públicas de staging y salud de
producción se comprobaron. La configuración de producción conserva su huella.
La única diferencia privada de entorno son las tres variables del banco;
la configuración previa permanece byte por byte como prefijo. Ninguna
credencial, documento real o copia de base se incorpora al repositorio.

### Recorrido real comprobado

- Propietario sintético: diez imágenes OSM, diez respuestas HTTP 200, atribución
  visible y Referer limitado a `https://staging.alldecorpatio.com/`.
- El navegador recibió Cache-Control del proveedor. Después del fallo local,
  la vuelta normal a la vista cargó las diez imágenes desde caché, conservando
  la política HTTP del navegador. No se forzó zoom ni precarga de otras zonas.
- Desactivar Activos dejó un punto, conservó la tabla y el CSV.
- Fallo local: veinte respuestas 404 entre carga y reintento, ninguna nueva
  petición a OSM. Al reintentar se conservaron la vista, filtro, punto y tabla.
  Al volver al proveedor se recuperaron las calles; se restituyeron ambos puntos.
- CSV privado: idénticos 205 bytes antes, después y durante el fallo; misma
  huella indicada arriba. No se confunde una tabla redondeada con su CSV.
- Segunda empresa sin permisos: página no disponible, sin renderizar el banco.
- Móvil emulado 390 x 844: documento y cuerpo 375 px, tabla intacta, dos puntos,
  aviso y reintento visibles. Se restauró la dimensión original al terminar.
- Lectura SQL protegida por identidad de staging: mismas huellas de facturas,
  pagos, gastos y proyectos; 22 constancias operativas e instalaciones idénticas
  a la referencia posterior a las cuadrillas. El mapa no escribió registros.
- ADT autenticado actual: diez imágenes de cartografía cargadas y las siete
  columnas correspondientes. Esto renueva evidencia de interfaz; el backend
  actual sigue pendiente del acceso al servidor original.

Capturas, cabeceras públicas, bytes y huellas se conservan en el directorio
privado de evidencia. Un primer intento de captura de página completa falló;
se conservó después la captura de la vista publicada. No se usó una imagen
incompleta como evidencia ni se ocultó el fallo del banco local.

O15 tiene implementación y recorrido de proveedor real/errores, pero continúa
abierta por el contraste y perfiles completos. O14, O16 y O17 conservan sus diferencias:
contraste completo del backend actual, decisión multibyte y ensayo integrado
real de geocodificación/caché. No se declara paridad por mostrar calles.

Los tres bloques siguen abiertos, con 1/65 obligaciones agrupadas cerradas.
No se reduce el alcance ni se reanuda migración o traspaso.
