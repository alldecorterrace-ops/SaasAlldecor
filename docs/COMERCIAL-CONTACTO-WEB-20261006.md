# Formulario web y datos de contacto · 6 de octubre de 2026

## Problema y comportamiento

El formulario público no recogía fecha de cita ni preferencia de contacto y
review_web_request fijaba esos campos como null/vacío al convertir a Lead.
Ahora puede recogerlos de manera opcional, mostrarlos a quien revisa las
solicitudes y conservarlos en la ficha del Lead, con los permisos existentes.
No agenda una cita ni envía una comunicación por guardar esas preferencias.

Referencia de campos: leadsBase del controlador ADT conservado el 2 de octubre,
SHA-256 578144f99dd8a57043df03915c27f5e3b962633668b315c13013c7ee9c3d4401.
Su proyección incluye appointment_date/contact_preference. El modelo de Leads
del SaaS ya los admitía; se completa el trayecto desde su formulario público.
No se ha vuelto a leer en este ensayo el formulario Drupal ni sus avisos; este
contrato no declara equivalencia completa de validaciones o comunicaciones.

## Contrato 085

Solo reemplaza las dos funciones existentes, conservando privilegios; sin
columnas, imports ni backfill. Preferencia: texto de hasta 60 caracteres.
Fecha: ISO YYYY-MM-DD y día gregoriano válido, sin convertir a un instante UTC.
Objetos/arrays en ambos campos se rechazan. Valores vacíos/null se omiten de
la captura, para repetir sin conflicto solicitudes anteriores.

La conversión conserva dirección, ciudad, código postal, servicio y mensaje.
Una solicitud archivada puede convertirse; repetir devuelve el mismo Lead.
Escritura en Estimados web y Leads sigue siendo necesaria para crear el Lead.
Campos ajenos a la lista permitida no asignan empresa, estado ni relación.
Lectura/revisión anónima y solicitudes de otra empresa continúan bloqueadas.

La admisión revalida el formulario después del bloqueo por empresa y toma un
bloqueo compartido de su fila para coordinar con desactivación. Formularios
desactivados/vencidos rechazan también reintentos. Las pruebas locales son
secuenciales; no se acredita una carrera concurrente por esos ensayos.

## Validación

15 pruebas focalizadas aprobadas, incluidos consumidores existentes: valores
anteriores y vacíos, preservación al convertir/archivar, reintentos, cambio de
payload, tipos/fechas inválidos, permisos, dos empresas, anonimato, revocación
y vencimiento. Tipos y lint aprobados. Datos ficticios en PGlite aislado.
CI exacto, SQL nativo, publicación y sesión se registran tras comprobarlos.
No hay citas reales, correos, pagos ni cambios de ADT.

La entrega cubre estos dos campos. Avisos, plantilla/comunicaciones restantes,
productos/precios y los escenarios de Facturas siguen dentro del segundo
bloque solicitado; no se declaran cerrados por esta corrección.
