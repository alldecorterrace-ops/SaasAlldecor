# Gastos: indicadores de empresa y filtro de pagador

Publicada y comprobada en staging `0545710`, 29 de septiembre de 2026. Esquema 043 de lectura:
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

[CI del commit exacto](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36616436001)
aprobado. Esquema 043 aplicado únicamente en staging con guardas de proyecto.
Comparación SQL/interfaz: indicadores sintéticos $89.86 / $89.86 / $10.01;
filtro Trabajador + búsqueda del lote devuelve $10.01 y un registro, sin cambiar
los indicadores de la empresa. CSV autenticado de 481 bytes con una fila,
centavos y acentos correctos. La búsqueda de la ficha individual muestra $1.37.
Vista a 390 píxeles sin desbordamiento. Diez huellas previas conservadas y retorno
comprobado; véase la [prueba de recibos individuales](AUDITORIA-RECIBOS-INDIVIDUALES-20260929.md).

Se corrigieron textos que contenían caracteres dañados en formulario, CSV y avisos.
La revisión visual detectó un selector de pagador ausente en la primera candidata;
se incorporó antes de activar la entrega final.

## Contraste renovado de ADT

La sesión del propietario ya carga Gastos; se comprobó la lista después de terminar
la carga. La fuente publicada observada el 29 de septiembre tiene SHA-256
`ff0058234ef4b418b219903dc63e7f2e501fde36b3c83f390916d31174d90df8`.
Mantiene las definiciones de indicadores y pagador. Incorpora además Labor automática
como origen, costo pendiente de conciliar separado del pago, elección directa de proyecto
y trabajador opcional cuando paga la empresa. La restricción anterior del SaaS que
borra esa relación es una diferencia abierta que debe corregirse.
No se realizaron escrituras, envíos ni importaciones desde ADT.

Sigue pendiente integrar Campo/Workforce y labor automática, filtro de origen,
reversión contable, trabajador asociado opcional y búsqueda por fecha/categoría/relaciones,
además del contraste completo de acciones operativas de ADT.
No se presenta esta entrega como cierre de todo Gastos ni de los 21 módulos.
Producción, importaciones y traspaso operativo no se activan.
