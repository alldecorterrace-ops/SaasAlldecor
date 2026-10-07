# Identidad comercial por empresa y cierre de correo restringido

## Diferencia concreta y equivalencia

La referencia privada de `adt-invmail-current.js`, capturada el 2 de octubre,
incluye nombre comercial, descripción, contacto, sitio/licencia, instrucciones
de pago y pie del PDF/correo de Facturas. Esa referencia no se presenta como
una nueva lectura del origen del 7 de octubre. Los controladores CRM y costos
sí tienen lectura privada renovada, documentada en las actas anteriores.

El SaaS conservaba únicamente nombre y zona horaria de la empresa en sus
documentos. El contrato 088 incorpora nueve textos opcionales por empresa,
editables exclusivamente por Administración (owner/admin). No se copian los
datos de All Decor a otras empresas ni se rellenan campos sin confirmación.
La adaptación también aplica contacto/pie a Estimados; las instrucciones de
pago se usan solo en Facturas. No altera reglas, estados o importes de ADT.

## Contrato

- `commercial_profiles` es aditiva, con RLS, auditoría y revisión optimista.
  Lectura según permisos existentes de Estimados/Facturas. Sin escritura
  directa para authenticated; la RPC exige manager y confirmación explícita.
- Cada nuevo PDF captura empresa y versión del perfil. Cambiar el perfil
  después no reemplaza documentos conservados de ninguna revisión. Sin
  perfil, el snapshot mantiene su forma anterior y el renderizado anterior.
- Solo texto, campos limitados, correo válido y HTTPS sin credenciales.
  HTML escapado en MIME. No descarga de contenido remoto ni URL privilegiada.
- El correo comercial es contacto visible. No cambia destinatarios ni
  remitente técnico/envelope del hosting, permisos, abonos o precios.
- Mantiene confirmación de identidad/acreditación, conflicto PT409,
  borrador del formulario tras errores y bloqueo de perfiles restringidos.

## Prueba local

Siete casos pertinentes pasan: validación, confirmación/error/conflicto,
permisos y aislamiento, captura por revisión e inmutabilidad, ambos PDF/MIME,
cabeceras extensas y paginación. Los textos ficticios con `& <script>` se
conservan como texto, sin ejecución; los totales siguen siendo 100.10.
Se inspeccionaron PDF reales con pypdf/pypdfium2, incluido espaciado del
contacto/título y bloque final de Facturas. Publicación, CI exacto y prueba
nativa/de sesión de 088 se registrarán al completar el despliegue.

## Correo de Estimados con perfil restringido comprobado

En la sesión existente de `auditor@saasalldecor.invalid`, miembro limitado de
la empresa ficticia QA SaaS A - 20260924, se capturó Enviar por email de
EST-2026-0007 revisión 2. Sin cambios de roles, permisos o credenciales.
El PDF es byte por byte el conservado el 5 de octubre. MIME: 22.887 bytes;
PDF: 13.808 bytes; total 357.90. Un destinatario ficticio, un adjunto PDF,
sin Bcc ni entrega al MTA. No se crea Factura ni Proyecto.

SQL nativo con identidad de sesión: siete rechazos de revisión/destinatario
incorrecto, empresa ajena, aprobación financiera, aviso/configuración web y
escritura de precios. Doce repeticiones devuelven la captura existente.
La sesión real muestra revisión histórica de solo lectura y sin correo ni
aprobación. No se presenta el GUC nativo como token JWT emitido.
Las 1.490 filas previas quedaron iguales; cuatro nuevas corresponden a
captura/auditoría/archivo privado. Evidencia y MIME permanecen fuera de GitHub.

## Límite vigente

Solo Gastos/costos y Comercial, staging ficticio. ADT continúa operativo.
IA, configuradores/3D, otros cuatro bloques, GPS físico, importaciones y
traspaso siguen fuera del trabajo. No activar proveedores de correo ni enviar
mensajes externos como parte de esta prueba.
