# Recibos HEIC/HEIF · 6 de octubre de 2026

Al revisar un recibo HEIC o HEIF, el SaaS prepara un JPEG para el extractor.
El archivo privado original y sus metadatos permanecen intactos. Esta acción
no aprueba el gasto, no genera un reembolso y no registra un pago.

## Regla del origen y equivalencia

El controlador ADT vigente comprobado el 6 de octubre convierte la primera
imagen mediante Imagick con calidad JPEG 88 y entrega esos bytes al extractor.
Su huella privada de origen es
`578144f99dd8a57043df03915c27f5e3b962633668b315c13013c7ee9c3d4401`.
El SaaS conserva la primera imagen y calidad 0.88 usando heic-convert 2.1.0
([documentación del mantenedor](https://github.com/catdad-experiments/heic-convert)).
Los codificadores son diferentes; no se afirma igualdad binaria con Imagick.
JPEG, PNG y WebP siguen entregándose sin conversión.

## Ejecución y errores

- El original se descarga con los permisos existentes y se verifica por firma,
  tamaño, MIME y SHA-256 antes de convertirlo.
- La conversión se ejecuta en un proceso Node separado, sin heredar el entorno
  de la aplicación ni sus credenciales. Solo recibe NODE_ENV=production y los
  bytes de la imagen por entrada estándar; devuelve el JPEG por salida estándar.
- Se conserva el límite de entrada de 8 MiB. La salida también admite hasta
  8 MiB, el proceso tiene 30 segundos y un límite de heap V8 de 256 MiB.
  Este último no es un límite de memoria total de WASM o del proceso.
- Solo se permite una conversión simultánea por proceso de aplicación.
  Saturación o terminación por tiempo producen review_timeout; una conversión
  dañada produce heic_conversion_required, sin entregar el archivo al proveedor.
  Los detalles internos del decodificador no se guardan en el resultado público.
- El trabajo, confirmación humana, versiones, permisos y errores persistidos
  conservan el contrato de revisión existente. La imagen preparada vive en
  memoria; no se reemplaza ni publica el archivo original.

## Prueba y límite de cierre

Se generaron imágenes sintéticas propias: HEIC de una imagen, HEIC de dos
imágenes y HEIF con marca genérica. Se decodificó el JPEG resultante y se
comprobaron dimensiones, píxeles, elección de la primera imagen y hash del
original. También se comprobó rechazo de imagen dañada antes del proveedor,
reintento, saturación, tamaño y MIME discordante, y entrega de JPEG a un
proveedor simulado. Los archivos y sus huellas están en tests/fixtures/receipt-heic.

Las 22 pruebas focalizadas y los tipos pasan localmente. El commit de aplicación
88dad31096aa2a1c6f29131f2064c09559361385 pasó el
[CI 37532449492](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/37532449492):
873 pruebas, cero fallos/omisiones, lint, tipos, compilación y los tres trabajos.
Publicado en staging desde el archivo oficial verificado por SHA-256, con cinco
paquetes nuevos privados y las dependencias anteriores conservadas. Se verificaron
los 15 archivos modificados y el trazado del conversor y sus paquetes en la ruta
compilada de Gastos de Workforce.

En el hosting pasaron las mismas seis pruebas compiladas a un arnés privado de
JavaScript. El cargador tsx excedió 90 segundos en el ensayo original; esa batería
no se registra como aprobada. El arnés equivalente usa código de este commit,
proveedor simulado y las mismas imágenes. Además, un HEIC sintético de 4032 × 3024
píxeles se convirtió y se decodificó para comprobar dimensiones/píxeles en unos
2,5 segundos; el original conservó su SHA-256. No se usó cámara física.

El regreso real 88dad31 → 74bdafb → 88dad31 pasó por proceso y pantalla
administradora de Gastos, con dos registros de referencia. La entrega final usa
el grupo saas-staging-88dad31-20261006-final-r1 y se verificó el proceso dentro de
su carpeta, salud de staging/producción y configuración privada conservada.
La configuración de producción no cambió.

La comparación de las 91 tablas conserva las 1.380 filas originales y sus huellas,
sin filas previas alteradas o desaparecidas. La actividad concurrente del catálogo
registró un producto nuevo y cuatro eventos de auditoría en la empresa de pruebas;
se conserva y se informa por separado. El total observado pasó a 1.385 filas. Auth
interno no forma parte de esa comparación. Sin migración de esquema: continúa 083.

El inventario de hosting registra 59 carpetas, seis protegidas y 53 a revisar;
ninguna eliminada. Se conservan entrega activa, regreso y bases de dependencias.
Evidencia de entrega en [PR 13](https://github.com/alldecorterrace-ops/SaasAlldecor/pull/13).

El proveedor real permanece desactivado y sin credenciales/modelos configurados.
Estos ensayos no demuestran lectura real de IA, confirmación en pantalla ni cierre
integral de Gastos. No cambian las restricciones de sustitución manual de recibos,
que mantienen el contrato existente de JPEG/PNG/WebP. No hay migración de esquema,
importación de negocio ni traspaso operativo.
