# Campo: cliente, dirección y fecha del catálogo

Continuación de visitas a obras terminadas. Referencias capturadas de ADT:
CampoProjectCatalog::build y campo.html (shownProjects y selector de obra).

| Acción                 | Regla del origen                                                                     | Equivalencia                                                               |
| ---------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Cliente                | Nombre del cliente actual enlazado a la obra                                         | customer_name de customers de la misma empresa; sin email ni teléfono      |
| Dirección              | Partes no vacías address, city, postal_code; retirar EE. UU.                         | Unión y limpieza equivalentes; no consulta geográfica ni envío externo     |
| Fecha                  | project_date en ISO, primeros diez caracteres                                        | Fecha de proyecto canónica; no fecha de inicio o factura                   |
| Búsqueda               | Nombre, cliente, identificador, fecha y dirección; sin distinguir acentos/mayúsculas | Mismos cinco campos; vistas activas/terminadas y reset de selección/motivo |
| Selector               | Nombre del cliente; nombre de proyecto si falta cliente                              | Misma prioridad; detalle muestra el nombre de proyecto seleccionado        |
| Dirección seleccionada | Dirección y enlace de navegación                                                     | Dirección y enlace Google Maps de ADT; no se abre durante la prueba        |
| Datos ausentes         | No inventar cliente, fecha ni dirección                                              | Valores vacíos/null conservados; sin dirección no se ofrece enlace         |

083 reemplaza únicamente time_punch_projects. Usa la misma regla privada de
elegibilidad 082, la misma identidad activa y el mismo permiso de Horas. El join
requiere empresa e ID del cliente. No concede lectura directa de Clientes,
Facturas ni Proyectos, ni expone saldos, pagos, contacto o notas. Tampoco amplía
el alcance de Gastos. La respuesta se mantiene en el catálogo del reloj.

La versión anterior ignora campos extra. La versión nueva tolera la respuesta
anterior sin detalle mediante defaults; el despliegue exige instalar 083 antes
de activarla. Un retorno de código conserva las filas y el esquema.

Fecha sirve para búsqueda, como en ADT; no se agrega un filtro de periodo nuevo.
El SaaS usa su identidad canónica de proyecto en la búsqueda, sin nuevas
importaciones de IDs ADT. La dirección durante una jornada abierta sigue fuera
de esta entrega, porque esa pantalla no carga el catálogo de entrada.

Pruebas: datos multibyte, campos ausentes, actualización canónica, empresa
ajena, proyectos no disponibles, revocación y conservación integral de filas.
La entrega debe obtener CI, instalación protegida y recorrido autenticado en
staging antes de acreditarse como publicada. GPS físico continúa aplazado.
