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

## Publicación y recorrido autenticado

- Código publicado y activo en staging: `c66e4ecb4fab720924d2ab5c208478107c3f6f45`.
  [CI completo aprobado](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36601373006):
  387 pruebas, lint, tipos, compilación, concurrencia PostgreSQL y recuperación
  sintética. Dos pruebas adicionales del instalador pasaron en Linux CI y hosting;
  la prueba de enlaces se omite en Windows por falta de privilegio de symlink.
- Esquema 038 aplicado exclusivamente al proyecto de staging, con guardia de
  empresa sintética y exclusión de la empresa productiva. Bucket privado,
  políticas INSERT/SELECT; ninguna de UPDATE/DELETE para estos archivos.
- Compilación del mismo commit en hosting aprobada. Versión de retorno `b89ae31`;
  base compartida `b149bee` sin modificaciones. Nuevo proceso de staging
  comprobado con raíz y REVISION; producción conservó raíz, proceso y huella de
  configuración. Cuatro rutas públicas de staging y salud de producción: HTTP 200.
- Propietario sintético: generar estimado aprobado, descargarlo, repetir generación,
  generar factura y descargarla desde factura y desde Clientes. Quedaron dos
  registros finalizados y dos archivos, sin duplicado del estimado.
- SHA-256 y tamaño de los dos PDF descargados coinciden con el registro de
  Supabase. Factura descargada desde ambas ubicaciones idéntica. Revisión 2,
  total $200.50, pagado $100.25 y saldo $100.25, con marca de datos ficticios.
  Texto extraído y renderizado revisados, incluidos acentos y centavos.
- Borrador sin botón de generación. Miembro restringido de otra empresa sin
  secciones ni datos de Facturas; expediente comercial vacío correctamente.
  Descarga sin sesión: HTTP 401 y cache privada/no-store.
- Reapertura del expediente y móvil emulado de 390 × 844 comprobados;
  contenido de 375 px, sin desbordamiento horizontal. La prueba de teléfono
  físico no se sustituye por esta emulación.
- Las ocho tablas de negocio verificadas conservaron exactamente sus recuentos
  y huellas: clientes, estimados, facturas, proyectos, pagos, gastos, registros
  operativos y sus adjuntos. Solo se añadieron archivos/documentos y su auditoría.

La navegación directa de una URL de descarga con otra empresa fue bloqueada por
el navegador integrado; no se cuenta como respuesta HTTP del servidor. Aislamiento,
revocaciones, cliente incorrecto y corrupción tienen evidencia automatizada; no se
declara repetida aquí toda la matriz de roles en interfaz.

Capacidad previa: 581 466 de 600 000 archivos. La nueva candidata usa dependencias
aditivas aisladas; no instala otro árbol completo. El inventario de versiones fue
renovado. La depuración de entregas sobrantes conserva su pendiente de revisión
de contenido único y confirmación; no se ejecutó borrado permanente.

Evidencia y PDFs sintéticos privados en `.local/closure-20260929/`.

## Límites de cierre

Este PDF representa los campos comerciales actualmente guardados en el SaaS;
no demuestra igualdad de todas las plantillas, condiciones contractuales, logos,
firmas o calendarios de pago de ADT. También falta contrastar los disparadores
automáticos de generación del origen frente a esta acción manual. Los documentos históricos conservan su
acceso al original; no se regeneran con partidas supuestas. Acceso del portal,
envíos, fotos y comunicación comercial se auditan por separado. Esta entrega
no cierra por sí sola Clientes, Estimados, Facturas ni los 21 módulos.
