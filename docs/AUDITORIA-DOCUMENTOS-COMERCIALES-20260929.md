# Documentos comerciales de estimados y facturas

## Alcance y referencia

Entrega para staging y registros nativos. Nuevas importaciones de ADT siguen
suspendidas; configuradores y 3D fuera del alcance. No envía correos, firma
contratos, ejecuta cobros ni modifica importes del estimado o la factura.

Referencia de ADT inspeccionada el 29 de septiembre: `CrmController::portalDocs`
recoge el PDF más reciente de cada estimado no borrador y factura no anulada.
El expediente operativo del cliente en ADT continúa mostrando un error de carga;
esa pantalla no constituye evidencia positiva de paridad.

## Contrato implementado

- Generar un PDF desde un estimado nativo no borrador/anulado o factura vigente,
  con permiso de escritura del módulo correspondiente.
- Capturar en servidor una revisión consistente, empresa y cliente; rechazar
  una pantalla desactualizada. No recalcular ni corregir el documento comercial.
- Conservar revisiones anteriores y ofrecer descarga autenticada. Una repetición
  de la misma revisión obtiene el mismo registro y archivo, sin reemplazos.
- Bucket privado, PDF de hasta 5 MB, sin permisos de actualización ni borrado.
  Tamaño, firma y SHA-256 se verifican al descargar. Una copia dañada falla
  explícitamente y no se entrega como documento válido.
- Recuperar respuestas perdidas de carga/finalización mediante el mismo registro.
  Un fallo pendiente no aparece como PDF finalizado en el expediente.
- Clientes → Documentos comerciales muestra el último PDF finalizado por
  documento nativo, con paginación, enlace al registro y permisos independientes
  de Estimados y Facturas. Comprueba cliente tanto capturado como vigente.
- Empresas distintas, usuarios anónimos, permisos revocados y clientes con datos
  de contacto iguales no permiten cruzar documentos.
- Esquema aditivo 038. Sin credenciales administrativas en el navegador.

## Verificación

Pruebas con PostgreSQL/PGlite y archivos sintéticos: revisiones, reintentos,
respuestas perdidas, denegación por rol/empresa, descarga exacta, corrupción,
invariantes financieros y paginación del PDF. La prueba de PostgreSQL 17 ejecuta
ocho preparaciones y ocho finalizaciones concurrentes, verificando un registro,
dos eventos de auditoría y rechazo ante edición concurrente del origen.

Los ejemplos de estimado/factura y un PDF largo de 17 páginas se renderizaron
localmente. Revisados importes, acentos, páginas inicial/intermedia/final y pie.
La fuente Noto Sans se distribuye bajo OFL con huella y origen documentados.
Caracteres no soportados producen error explícito; nunca sustitución silenciosa.

Dependencias: seis paquetes nuevos con versiones e integridad fijadas por lock.
El instalador de staging verifica SHA-512, rechaza paquetes con scripts de
instalación y rutas peligrosas, crea copias privadas de las adiciones y enlaza
las dependencias anteriores sin modificarlas. Pruebas del instalador en Linux CI.

Validación de CI, aplicación del esquema, publicación y recorrido real en staging:
pendientes de completar en esta entrega. Evidencia privada en `.local/closure-20260929/`.

## Límites de cierre

Este PDF representa los campos comerciales actualmente guardados en el SaaS;
no demuestra igualdad de todas las plantillas, condiciones contractuales, logos,
firmas o calendarios de pago de ADT. Los documentos históricos conservan su
acceso al original; no se regeneran con partidas supuestas. Acceso del portal,
envíos, fotos y comunicación comercial se auditan por separado. Esta entrega
no cierra por sí sola Clientes, Estimados, Facturas ni los 21 módulos.
