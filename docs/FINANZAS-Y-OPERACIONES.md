# Finanzas y operaciones: comportamiento y auditoría

## Flujo disponible

1. Guardar un estimado con cliente y total positivo. Su aprobación administrativa requiere escritura en Estimados, Facturas y Proyectos. La acción usa la última revisión guardada, crea una factura y un proyecto y bloquea la edición del estimado aprobado. Un reintento devuelve la misma factura.
2. La factura conserva las líneas y los datos del cliente aprobados. Permite corregir fechas y notas, imprimir y registrar pagos externos. El importe del documento no se modifica mediante esos formularios.
3. Registrar un pago exige versión vigente, importe positivo y saldo suficiente. Reintentar el mismo identificador no duplica el pago. Una referencia no vacía no puede repetirse en la misma factura y método, incluso después de revertirla.
4. Revertir un pago exige motivo y conserva su registro. Esta acción corrige el libro de pagos; no envía dinero ni solicita un reembolso bancario. Una factura solo puede anularse si no conserva pagos aplicados.
5. El proyecto permite fechas, nombre, notas y estado. Para empezar producción, instalación o completado necesita una factura abierta con pago aplicado. Revertir un pago no retrocede automáticamente el estado del proyecto.
6. La ficha de trabajador permite datos de contacto, puesto, equipo, tarifa, objetivo semanal y archivo. No concede acceso al SaaS ni registra asistencia por sí sola.
7. Los gastos conservan proyecto/trabajador opcionales, fecha, proveedor, documento, categoría, descripción, importe, método, reembolso y revisión. Solo administradores/propietarios aprueban, rechazan, anulan o marcan un reembolso como pagado. Los cambios financieros en un gasto aprobado o rechazado requieren nueva revisión; corregir uno reembolsado devuelve su reembolso a pendiente.
8. Los recibos admiten PDF, PNG, JPEG y WebP de hasta 5 MB. Se valida su cabecera, se guardan en un bucket privado y se muestran mediante enlaces breves. Reemplazar o quitar la referencia conserva el archivo anterior. Cambiar un recibo aprobado exige nueva revisión. Un miembro no puede modificar el recibo de un gasto anulado.

## Auditoría propuesta para el propietario

Utilizar registros identificados como prueba, sin registrar pagos reales ni notificar clientes:

- Seleccionar una empresa de prueba y guardar cliente y estimado. Confirmar totales, revisión e impresión.
- Aprobar y abrir la factura/proyecto resultantes. Repetir la acción y comprobar que no aparecen duplicados.
- Registrar un anticipo, verificar saldo e historial y comprobar que se habilita el avance de producción.
- Intentar un pago superior al saldo y una edición con versión antigua: deben rechazarse.
- Revertir el pago con motivo y anular la factura. El historial debe conservar ambas operaciones.
- Crear trabajador y gasto, adjuntar recibo, aprobar, cambiar fecha/importe/recibo y comprobar que vuelve a revisión.
- Revisar los mismos recorridos como miembro con permisos restringidos y desde otra empresa.
- Verificar impresión en escritorio y móvil y acceso al recibo; una persona sin sesión no debe acceder a los registros ni al archivo privado.

## Evidencia técnica

`tests/finance.test.ts` y `tests/operations.test.ts` ejecutan PostgreSQL en PGlite con usuarios sintéticos. `supabase/verify-finance-operations.sql` consulta privilegios sin modificar registros. Las migraciones 005–007 se aplicaron en Supabase y el ensayo transaccional financiero/operativo terminó en ROLLBACK.

Estos resultados no acreditan todavía la prueba de navegador autenticada ni conciliación de información histórica.

## Límites pendientes

No hay aceptación electrónica del cliente, firma, facturas independientes de estimados, notas de crédito, ajustes de importes posteriores a la aprobación, envío por correo, cobro automático, conexión bancaria, nómina, cálculo fiscal especializado ni portal del trabajador. El campo de reembolso es un registro administrativo. Los proyectos nuevos nacen de la aprobación; la importación de proyectos históricos necesita un proceso separado.

Conservar las tablas, auditoría y archivos al retirar una versión. Una versión anterior a la aprobación no conoce todos los estados actuales: no volver a ella sin verificar compatibilidad o deshabilitar temporalmente las mutaciones afectadas.
