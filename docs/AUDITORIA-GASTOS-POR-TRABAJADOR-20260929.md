# Gastos por trabajador y persistencia de la ficha individual

## Regla y alcance

ADT permite consultar los gastos asociados a un trabajador y distingue esa
asociación de quién pagó. Empresa y efectivo de oficina no generan deuda de
reembolso; bolsillo propio sí. Fuente y límites: [contrato Workforce](PARIDAD-GASTOS-WORKFORCE-20260929.md).

Se detectó una brecha posterior a 044: la acción del formulario individual todavía
borraba `worker_id` al guardar con pagador empresa/efectivo. Los lotes y el RPC ya
conservaban la relación. Se corrige el formulario y se prueba su entrada real
(FormData → parser compartido por la acción → RPC → fila persistida).

La ficha de Trabajadores enlaza a sus gastos. El registro permite seleccionar
trabajador por identificador, incluidos inactivos para consultar historia, y
conserva ese filtro en paginación y CSV. Los nombres iguales no unen fichas.
La búsqueda para nuevas asignaciones continúa limitada a trabajadores activos.

El esquema 046 solo sustituye una función de lectura. Exige permisos de Gastos
y Trabajadores para el filtro; una ficha ausente, ajena o no autorizada se rechaza,
sin convertir la petición en una consulta general. Los totales globales siguen
siendo de empresa; los filtrados corresponden a la selección.

## Validación local

- `npm run check`: lint, tipos, 430 pruebas y compilación correctos.
- Creación/edición individual con empresa y efectivo conserva trabajador,
  importe y ausencia de reembolso; guardar sin cambios no reinicia aprobación.
- Cambiar pagador conserva trabajador y ajusta la condición de reembolso.
- Vaciado explícito de asociación opcional permitido; bolsillo sin trabajador,
  trabajador ajeno, versiones obsoletas, permisos revocados y cambio de un
  gasto reembolsado rechazados.
- Filtro por identidad, nombres iguales, histórico inactivo, cruces de filtros,
  CSV, totales, aislamiento y revocación comprobados. Huella de gastos sin cambios
  durante las consultas.

## Publicación y límites

Pendiente de registrar CI, despliegue y recorrido autenticado de esta entrega.
No implica doble aprobación Workforce, revisión IA/humana, pago, reversión contable
ni labor automática. Tampoco autoriza migración de datos ADT, producción o traspaso.
