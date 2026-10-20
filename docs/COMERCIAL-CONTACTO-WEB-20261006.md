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
CI exacto 269e8cb, run 37540312199: check, cola concurrente y recuperación
aprobados; 891 pruebas, cero fallos y cero omisiones. El ensayo de recuperación
de CI es sintético; no declara una restauración operativa del negocio.

085 aplicada en Supabase staging: 91 tablas y 1.399 filas conservadas por
conteo/huella antes-después; ACL de las dos funciones idénticas. Sin backfill.
La función de revisión conservó su ACL previa (incluido EXECUTE anónimo);
el control interno y RLS rechazaron revisión/lectura anónimas en SQL nativo.
No se afirma una revocación de EXECUTE que esta entrega no realizó.
Contrato nativo aprobado: envío/repetición anónimos, conflicto de payload,
fecha inválida, archivo/conversión/repetición, datos preservados y otra empresa.
Todas las escrituras de ese ensayo se revirtieron. Las identidades ficticias
en SQL no equivalen a sesiones web de perfiles adicionales.

Sesión administradora auditor, empresa QA Mapa Presentacion 20260926:
formulario público ficticio a5bc5137-c4e1-47b6-a93a-84f3388d7443 creado;
solicitud 731b600d-723b-4408-a6f3-2b2a27f3f16b enviada y convertida en Lead
f1e99f09-4a43-4e9d-bd1e-8e15fac0d61c. Pantallas y persistencia acreditan
2026-10-12, Correo por la mañana, dirección/ciudad/código postal y mensaje.
Queda una única solicitud CONVERTIDO y un único Lead NUEVO adicionales.
El formulario se desactivó al finalizar; página pública no disponible y
reintento de esa solicitud rechazado como form_unavailable en SQL nativo.
Se preservan los registros y auditoría ficticios; no se borraron.

Publicación staging 269e8cb, grupo final saas-staging-269e8cb-20261006-final-r1,
PID 3764950 observado con cwd exacto. Retorno real 269e8cb → 8f14054 → 269e8cb
con procesos distintos, health 200 y ficha del Lead legible con ambos campos.
Fila de solicitud y Lead idénticas antes-después del retorno. Ocho archivos
de fuente verificados por SHA-256, rutas compiladas, recibo HEIC con worker y
codecs trazados. Lockfile, entorno y dependencias anteriores conservados.
Las cuatro filas protegidas de recibos permanecen idénticas y los conteos de
pagos (20) y gastos administrativos (11) no cambian.

Producción conserva su configuración verificada y health 200. Solo staging
recibe la entrega. Proveedor de recibos por IA desactivado/sin configurar.
No hay citas reales, correos, pagos, imports ni cambios de ADT.
Evidencia y seguimiento en [PR 15](https://github.com/alldecorterrace-ops/SaasAlldecor/pull/15).

La entrega cubre estos dos campos. Avisos, plantilla/comunicaciones restantes,
productos/precios y los escenarios de Facturas siguen dentro del segundo
bloque solicitado; no se declaran cerrados por esta corrección.
