# Operaciones: solicitudes duraderas y pruebas del 1 de octubre

## Alcance

Esquema 065 preparado para staging. No hay importación de ADT ni escritura en
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

Se añadió ensayo PostgreSQL nativo de ocho reintentos por guardado, movimiento,
adjunto y archivo, carreras de saldo/agenda y revocación mientras se espera un
bloqueo real. Sus resultados CI, publicación y sesión real aún están pendientes.
Los tres bloques y O01–O18 permanecen abiertos.
