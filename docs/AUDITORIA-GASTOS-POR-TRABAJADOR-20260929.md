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

Publicado en staging el 29 de septiembre de 2026:
`3c567f99fee135e289be3f9f740d33b4f603f964`, esquema 046.
[CI 36622311416](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36622311416):
`check`, `queue-concurrency` y `backup-recovery` correctos. Compilación del hosting
con Node 22, webpack y una CPU terminada; REVISION y proceso activo comprobados.
Dependencias compartidas c66e4ec/b149bee sin copiar ni actualizar.

Sesión autenticada de pruebas:

- Dos gastos sintéticos previos (empresa 1,11 USD y efectivo 2,22 USD) guardados
  nuevamente desde sus fichas. Conservan trabajador, aprobación, importe,
  reembolso NO_APLICA y todos los campos de negocio. Cada versión pasó de 1 a 2.
- Desde la ficha del trabajador se abre su registro por ID: tres gastos,
  13,34 USD y 10,01 USD pendientes de reembolso. El resumen general conserva
  93,19 USD activos y 10,01 USD de reembolsos.
- CSV real descargado: 1.082 bytes, cabecera y tres filas; incluye las tres
  modalidades de pagador y mantiene la asociación.
- Móvil emulado a 390 px sin desbordamiento; combinar trabajador y bolsillo
  propio devuelve un gasto por 10,01 USD. Emulación retirada al finalizar.
- Sesión restringida en la segunda empresa: recurso no disponible, sin gastos
  expuestos. Separación de nombres iguales, trabajador inactivo y revocación
  específica de Trabajadores probadas localmente, no mediante cambio de roles vivo.
- Once huellas idénticas tras aplicar 046. Tras las dos ediciones: diez tablas
  completas iguales; los otros ocho gastos conservan su huella anterior y las
  dos fichas de prueba conservan su huella sin campos de versión/actualización.
- Cuatro rutas públicas de staging y salud de producción: HTTP 200 antes/después.
  La configuración de producción conserva su SHA-256 anterior.

La entrega anterior 604fbe5 queda disponible. **No se ensayó un retorno nuevo:**
contiene el fallo de edición individual corregido aquí; no se considera válida
para reabrir ese recorrido de escritura. Las consultas sin el nuevo filtro siguen
cubiertas por las pruebas de compatibilidad. Esto no acredita recuperación completa.

cPanel informó 596.549/600.000 archivos antes de compilar. El recuento del árbol
sin seguir enlaces pasó de 596.451 en la guarda de construcción a 597.920 al final;
son mediciones distintas del contador de cuota de cPanel. Margen limitado para
las siguientes entregas. No se eliminó ninguna carpeta. aaf268c y su archivo
comprimido permanecen por decisión expresa; versiones sobrantes pendientes de
retención, sin usar esta nota como autorización de borrado.

Capturas, CSV, huellas y registros de comprobación se conservan fuera de Git.
No implica doble aprobación Workforce, revisión IA/humana, pago, reversión contable
ni labor automática. No se importaron datos ADT ni se publicó en producción.
