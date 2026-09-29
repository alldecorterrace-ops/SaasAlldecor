# Gastos: indicadores de empresa y filtro de pagador

Candidata de staging del 29 de septiembre de 2026. Esquema 043 de lectura:
reemplaza la consulta; no modifica ni importa gastos. Incluye la entrega previa
de recibos individuales e3f5df9, esquema 042.

## Regla de ADT

En la referencia privada `adt-modules-v2.jsx` de Gastos, `activeRows` excluye
anulados. Los indicadores `totalMonth`, `total` y `due` suman respectivamente
los activos del mes, todos los activos y los activos con reembolso pendiente.
Se calculan antes del filtro de la lista; el filtro `payer` distingue empresa,
efectivo oficina y trabajador. Origen y pagador son conceptos distintos.

El SaaS presenta esos tres indicadores separados de los totales filtrados.
El mes se determina en la zona horaria de la empresa. Los importes se suman
como numeric en PostgreSQL y se devuelven con centavos. Los filtros por pagador
se conservan en enlaces, paginación y CSV. Los registros antiguos cuyo pagador
es null siguen identificados como Sin registrar; no se les inventa un pagador.

## Verificación y límites

Comprobaciones locales completas: lint, tipos, 423 pruebas y compilación.
El ensayo nuevo verifica tres estados activos, anulados, meses anterior/actual/
siguiente, cambio de filtros con indicadores constantes, filtro vacío, CSV,
pagador desconocido, otra empresa y revocación. El resumen conserva RLS y el
permiso de lectura en Gastos. Una consulta no convierte gasto en pago.

Pendientes para esta candidata: CI exacto publicado, aplicación del esquema,
publicación en staging, comparación SQL/interfaz/CSV y móvil emulado.

Sigue pendiente integrar Campo/Workforce y labor automática, filtro de origen,
reversión contable, y comparar las acciones reales con la sesión renovada de ADT.
No se presenta esta entrega como cierre de todo Gastos ni de los 21 módulos.
Producción, importaciones y traspaso operativo no se activan.
