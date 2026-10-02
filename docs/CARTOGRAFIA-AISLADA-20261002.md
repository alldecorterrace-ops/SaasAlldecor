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

Candidata pendiente de CI del commit exacto, publicación y prueba en sesión de
cartografía real, fallo local, filtros y exportación conservada. O15 tiene
implementación, pero continúa abierta. O14, O16 y O17 conservan sus diferencias:
contraste completo del backend actual, decisión multibyte y ensayo integrado
real de geocodificación/caché. No se declara paridad por mostrar calles.

Los tres bloques siguen abiertos, con 1/65 obligaciones agrupadas cerradas.
No se reduce el alcance ni se reanuda migración o traspaso.
