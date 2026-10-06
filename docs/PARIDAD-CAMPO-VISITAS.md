# Campo: visitas a proyectos terminados

Esquema aditivo 082, contrastado por SSH de solo lectura con ADT actual el 6 de octubre de 2026.

| Acción             | Regla de ADT                                                                             | SaaS y comprobación                                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Catálogo del reloj | Obras con abonos, obra asignada y terminadas; canceladas no marcables                    | RPC independiente con identidad, nombre y estado. No entrega importes ni amplía permisos de gastos o consultas de Proyectos/Facturas.          |
| Clasificación      | Terminada si hay facturas no anuladas, abonos y ninguna factura con saldo mayor de 0.009 | Mismo criterio sobre las facturas operativas enlazadas al proyecto. El estado administrativo COMPLETADO por sí solo no sustituye este cálculo. |
| Entrada terminada  | Limpieza/terminación, garantía, reparación o remodelación obligatorios                   | Selector y validación PostgreSQL; motivo y estado observado quedan en jornada y auditoría.                                                     |
| Salida             | Conserva obra de la entrada, sin pedir de nuevo el motivo                                | Mismo comportamiento, aun si la obra pasa a cancelada o deja de estar asignada después de entrar.                                              |
| Reintento          | No crear otra jornada abierta                                                            | Identidad y motivo de visita se comprueban; salida repetida no altera GPS ni minutos.                                                          |
| Correcciones       | Conservar evidencia del reloj                                                            | Motivo inicial y estado observado inmutables; ajustes posteriores siguen usando historial.                                                     |

El catálogo de ADT incluye búsqueda por cliente/dirección y fechas. Esta entrega expone solo el nombre de la obra y búsqueda por ese nombre. Es una diferencia visible pendiente; no afirma cerrar todos los campos del catálogo. Las facturas operativas del SaaS tienen proyecto obligatorio; el caso ADT de una factura sin proyecto y un cliente con una sola obra no puede existir en este esquema. No se importan nuevos datos del origen para cubrirlo.

Se conserva la disponibilidad administrativa previa para una cuenta con lectura de Proyectos aunque no haya abonos. Para cuentas de Campo sin ese permiso, la obra sin abonos necesita elección actual o asignación vigente. Esta compatibilidad administrativa está documentada y no se presenta como regla financiera del origen.

GPS de entrada/salida y cálculo de minutos 078 se conservan. La prueba de GPS en Android continúa aplazada por decisión del propietario. Pruebas sintéticas no acreditan una lectura física del teléfono.

## Retorno

Los campos anteriores reciben null sin reescribir filas. Se conservan firmas RPC de cuatro y cinco argumentos: siguen exigiendo GPS y no permiten entrar en una obra terminada sin motivo. El código anterior no ofrece el catálogo nuevo ni el motivo; una salida de visita ya abierta sigue siendo posible. Volver al código no revierte el esquema ni borra datos.

La implementación y las pruebas locales deben verificarse antes de declarar publicación, CI o prueba de usuario real. La paridad completa de los 21 módulos sigue abierta.
