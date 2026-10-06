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

Las 22 pruebas focalizadas de conversión/revisión/recibos y la comprobación de
tipos pasan localmente. La publicación, CI completo y prueba en hosting todavía
no están acreditadas en esta revisión del registro.

El proveedor real permanece desactivado y sin credenciales/modelos configurados.
Estos ensayos no demuestran lectura real de IA, confirmación en pantalla ni cierre
integral de Gastos. No cambian las restricciones de sustitución manual de recibos,
que mantienen el contrato existente de JPEG/PNG/WebP. No hay migración de esquema,
importación de negocio ni traspaso operativo.
