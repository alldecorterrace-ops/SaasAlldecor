# Operaciones: solicitudes duraderas y pruebas del 1 de octubre

## Alcance

Esquema 065 aplicado exclusivamente en staging el 2 de octubre. No hay importación de ADT ni escritura en
producción. Permisos, inventario, instalaciones, manuales y zonas conservan
sus reglas y firmas anteriores. Los configuradores y planos automáticos siguen
fuera del alcance; esta entrega no atribuye paridad total a una pantalla existente.

## Contrato de escritura

`execute_work_action` recibe empresa, identidad de solicitud, operación, tipo,
registro, versión esperada y contenido. Solo admite guardar ficha, movimiento de
inventario o referencia de documento. El actor procede de la sesión autenticada.
Efecto, resultado duradero y auditoría quedan dentro de la misma transacción.

Todas las escrituras de estos módulos usan el mismo orden de bloqueo por empresa.
Después de esperar se comprueba nuevamente la membresía, que se mantiene bloqueada
hasta terminar el efecto. Un usuario revocado no puede ejecutar ni recuperar su
solicitud a través de una función privada. La recuperación pública exige permisos
actuales del módulo y solo devuelve solicitudes de ese actor y empresa.

Un reintento con el mismo contenido devuelve el resultado original sin crear una
segunda versión, movimiento o referencia. Cambiar el contenido de una solicitud
ya realizada produce conflicto. Una solicitud nueva con revisión antigua también
produce conflicto. Un fallo de regla no deja un resultado exitoso ni auditoría.

Las firmas públicas anteriores se conservan y pasan por el mismo contrato para
permitir retorno del código. Sus implementaciones no pueden ejecutarse directamente
por usuarios autenticados. La anulación y recuperación de un permiso anulado
requieren administrador, conforme al control de anulación observado en ADT.

## Archivos y respuesta incierta

La carga usa una ruta privada e inmutable derivada de la solicitud. Si ya existe
tras una respuesta perdida, se reutiliza únicamente si sus bytes coinciden con
la huella del archivo presentado. Un error no sustituye el contenido existente.
La carga de objeto y la transacción SQL son dos pasos distintos: un objeto aún
sin referencia puede quedar pendiente después de un fallo; no se acredita como
adjunto guardado. No se purga ningún archivo como parte de esta entrega.

Archivar lleva el estado de destino explícito en el formulario. Reintentar conserva
ese estado y no lo invierte accidentalmente. Aprobación del manual se invalida al
cambiar contenido o adjuntos; impresión y originales se conservan según las reglas
existentes. La respuesta debe coincidir con operación, tipo y ambas identidades
antes de presentar éxito.

## Referencia actual de ADT

Se renovó la lectura autenticada de Permisos: listado y formulario de proyecto,
tipo, autoridad, número, tasas, fechas, estado y notas. El formulario se abrió y
se canceló sin guardar. Se preservó la fuente del componente para contrastar
búsqueda y control de anulación; falta renovar el controlador de persistencia.

Inventario mostró un componente inline cuyo botón Añadir material no ejecuta
ninguna acción, confirmado al pulsarlo. La búsqueda visible tampoco tiene un
controlador conectado en esa fuente. Esto describe esa pantalla observada y no
prueba ausencia de otras operaciones del backend. Instalaciones mostró solo una
descripción, sin controles operativos en la vista observada.

Manual carga una guía de pérgola con cálculos y planos del configurador. Esas
salidas continúan excluidas. Las instrucciones y documentos operativos del plan
mantienen su alcance; requieren contraste de fuente y pruebas de persistencia.

## Pruebas y límites

Ocho pruebas dirigidas pasan: cinco tipos, recuperación sin duplicados, errores
sin efectos, centésimas de cantidad, reversos, unidades históricas, documentos,
archivo/restauración, firmas antiguas, permisos y separación entre empresas.
Pagos, facturas y gastos conservaron su contenido durante estas operaciones.
Storage de estas pruebas usa su contrato mínimo; no acredita una carga binaria real.

CI [36962519122](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36962519122)
aprobado: 584 pruebas, lint, tipos, compilación y PostgreSQL nativo. Ocho reintentos
por guardado, movimiento, adjunto y archivo produjeron un efecto por operación.
Dos salidas con versión antigua y dos agendas superpuestas produjeron un efecto
por carrera. La revocación durante la espera produjo cero efectos. Los datos
de pagos, facturas y gastos conservaron sus huellas.

`42fdad58b364046925cf7b0b68f6ae41618aa68d` publicada en staging, retorno
`1e2735a` compatible con las firmas conservadas. Se comprobaron el proceso Node
activo, raíz y revisión exactas; salud, login, registro y recuperación respondieron
200. Producción conservó su configuración y respondió 200. Al aplicar 065,
81 tablas y 870 filas anteriores mantuvieron sus huellas; no hubo backfill.

Sesión real de propietario en empresa sintética: artículo con unidad m², ubicación
acentuada, mínimo 2.125 y costo de referencia 12.34 guardado y reabierto. Entrada
10.125, salida -3.125 y reverso +3.125 conservaron los tres movimientos y saldo
10.125. Cambiar la unidad histórica y sacar 99 unidades fueron rechazados.
El documento PDF real de 1508 bytes se descargó con SHA-256 idéntico, se archivó
y se restauró conservando el mismo adjunto; el historial mostró siete revisiones
y el actor. El identificador de la otra empresa fue rechazado en la interfaz.

Manual: materiales, tolerancias e instrucciones guardadas; aprobación seguida
de corrección devolvió En revisión y conservó las anteriores. Impresión de la
revisión 3 mostró el contenido guardado y advertencia de falta de aprobación.
Una nueva aprobación seguida de adjunto real volvió a invalidarla. Vista móvil
emulada comprobada por separado; no acredita comportamiento físico de Campo.
Las huellas de pagos, facturas, gastos y proyectos permanecieron idénticas durante
las primeras doce solicitudes de estas pruebas. Evidencia privada fuera de GitHub.

Los tres bloques y O01–O18 permanecen abiertos por contraste del backend actual,
matriz completa de perfiles y recorridos restantes. No se declara la meta del
1 de octubre cumplida después de cambiar la fecha.


## Descarga con autorización en cada apertura

Se reemplazaron los enlaces firmados de cinco minutos de las fichas operativas
por `/api/work-documents/<empresa>/<tipo>/<registro>/<adjunto>`. La ruta exige
sesión actual y las políticas RLS del registro, adjunto y Storage; comprueba cada
identidad, ruta privada, tipo, tamaño y firma binaria. Devuelve los bytes originales
sin URL reutilizable ni caché compartida. Los archivos archivados siguen disponibles
para consulta autorizada y restauración. No se cambian objetos ni relaciones.

Cuatro pruebas nuevas verifican descarga, errores y revocación, incluida una que
ocurre entre leer la ficha y descargar el objeto bajo RLS SQL real. Esta prueba
usa el contrato mínimo de Storage, no una sesión Supabase real. Lint, tipos,
588 pruebas y compilación locales aprobados; CI y publicación de esta corrección
de descarga aún pendientes. No necesita una migración de esquema.
