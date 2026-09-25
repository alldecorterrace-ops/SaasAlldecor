# Operaciones y horas

Esta entrega implementa seis módulos adicionales. Las funciones descritas son la cobertura disponible; todavía no acreditan paridad completa con todos los recorridos de ADT.

## Permisos de obra

Ficha por proyecto con tipo/nombre, autoridad, número, tasa, presentación, aprobación, vencimiento y notas. Estados pendiente, en revisión, aprobado, rechazado, vencido y anulado. Se comprueba el orden de fechas y se exige número/fecha para marcar aprobado. Rechazo y anulación requieren motivo. Documentos privados, archivo/restauración de adjuntos e historial de versiones. El estado vencido se registra manualmente; no hay comunicación automática con autoridades.

## Inventario

Artículos con SKU único por empresa, unidad, ubicación, mínimo y costo unitario de referencia. Existencias calculadas desde entradas/salidas de hasta tres decimales; no se editan directamente. Los movimientos llevan fecha, referencia, motivo y proyecto opcional. Se rechazan salidas sin existencias, solicitudes repetidas con contenido distinto y referencias duplicadas. Un reverso conserva el movimiento original y tampoco puede producir existencias negativas. No permite cambiar la unidad después de registrar movimientos, aunque el saldo vuelva a cero. No incluye todavía órdenes de compra, transferencia automática entre almacenes ni valuación contable.

## Instalaciones

Agenda con inicio/fin, proyecto, responsable, equipo descrito, dirección y notas. Las fechas se introducen en el horario del dispositivo, se almacenan con zona y se consultan en el horario de la empresa. Se rechazan solapamientos del mismo responsable. Entrar en curso o completada requiere anticipo registrado en la factura del proyecto. Cancelar exige motivo. Documentos e historial. La validación de disponibilidad solo cubre al responsable seleccionado; los colaboradores escritos en texto no son asignaciones individuales.

## Fabricación

Manual por proyecto con medidas, tolerancias, materiales, pasos, controles, notas y archivos privados. Historial de snapshots de cada versión; vista imprimible de la revisión guardada, sin borradores del editor. Solo un administrador aprueba. Cambiar contenido o adjuntos de un manual aprobado devuelve el registro a revisión. No sustituye cálculos estructurales ni crea automáticamente planos del configurador 3D.

## Zonas

Zonas circulares con latitud, longitud, radio, dirección, proyecto opcional y estado. Vista esquemática de las zonas filtradas en la página, sin enviar coordenadas a un proveedor de mapas. No incluye calles, rutas, seguimiento GPS en vivo ni validación geográfica de marcaciones. El historial conserva cambios de coordenadas y radios.

## Horas y solicitudes

Un administrador puede vincular una ficha de trabajador a un usuario activo de la misma empresa. No crea cuentas ni concede permisos; el usuario necesita escritura en Horas. La vinculación tiene versión y auditoría.

El reloj usa la hora del servidor. Impide más de una jornada abierta y reintentos duplicados. El administrador registra/corrige horas con un motivo, asigna proyecto/trabajador y aprueba o anula conservando historia. El tiempo neto descuenta el descanso y usa minutos completos; no calcula nómina, impuestos ni horas extras.

Un trabajador vinculado puede solicitar correcciones de sus propias marcaciones. La solicitud conserva la revisión sobre la que se hizo; un administrador la aplica o rechaza con motivo. Si la marcación cambió, se impide aplicar una solicitud obsoleta. No se puede acumular más de una solicitud pendiente por marcación. Aplicar una corrección deja las horas pendientes de aprobación.

Los administradores cierran semanas que comienzan en lunes, según el horario de la empresa. Cerrar exige todas las horas aprobadas, sin marcaciones abiertas ni solicitudes pendientes. El cierre bloquea cambios que atraviesen esa semana. Reabrir exige motivo y conserva auditoría. El reloj no incluye geolocalización, descansos en tiempo real, auto-cierre o recordatorios; esos flujos de Workforce siguen pendientes de paridad.

## Verificación y despliegue

`tests/workspaces.test.ts` ejecuta las migraciones 008–009 junto con sus dependencias en PostgreSQL/PGlite. Cubre referencias de empresa, RLS, permisos por módulo, stock, reintentos/reversos, horarios, revisiones, documentos privados, solicitudes, semanas cerradas y reloj. La entrega de este grupo pasó 82 comprobaciones; la entrega posterior de los 23 módulos amplió el conjunto a 97. Lint, tipos y compilación local pasaron.

Las migraciones 008–009 se aplicaron. La carpeta a472306 se preparó, pero LiteSpeed conservó el proceso anterior; la primera publicación comprobada de estos módulos corresponde a 72267e8, tras reiniciar la raíz activa. El ensayo remoto de inventario, horas y cierre semanal terminó con ROLLBACK; se verificaron seis tablas con RLS, sin lectura anónima ni escritura directa. Esa publicación inicial no acreditaba navegador autenticado. Las auditorías posteriores de septiembre de 2026 documentan recorridos concretos y sus límites; las pruebas de PostgreSQL no los sustituyen. No se importaron datos ni se modificaron registros de ADT.

La [auditoría de Manuales y Zonas](AUDITORIA-MANUALES-ZONAS-20260925.md) distingue las zonas circulares disponibles del mapa comercial de ADT, cuyas capas, agregados por código postal y exportación siguen pendientes de paridad.
