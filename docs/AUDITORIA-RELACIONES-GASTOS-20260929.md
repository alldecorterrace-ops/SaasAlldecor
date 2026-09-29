# Gastos: trabajador asociado y búsqueda equivalente a ADT

Candidata en desarrollo, 29 de septiembre de 2026. No publicada todavía.
Producción permanece intacta; sin importación de datos ni traspaso.

## Regla contrastada

ADT autenticado y su fuente publicada se revisaron el 29 de septiembre.
SHA-256 de la fuente privada: ff0058234ef4b418b219903dc63e7f2e501fde36b3c83f390916d31174d90df8.
El trabajador es opcional si paga la empresa o efectivo de oficina y obligatorio
si paga el trabajador. Cambiar de pagador conserva la selección. Asociar a un
trabajador no significa que haya pagado ni que corresponda un reembolso.

La búsqueda de ADT concatena fecha ISO, categoría, proveedor, descripción,
documento, trabajador, cliente y proyecto. El SaaS debe buscar esos campos
solo cuando el usuario puede consultarlos. Los indicadores de empresa siguen
independientes de los filtros y los totales filtrados acompañan a los resultados.

## Implementación y pruebas

El esquema 044 permite trabajador asociado en gastos pagados por empresa,
conservando NO_APLICA como estado de reembolso. Mantiene aislamiento por empresa,
validación de trabajador activo, permisos, control de versión y bloqueo de
reembolsos pagados. No cambia registros existentes.

Pruebas de regresión: selección opcional en lote, pago propio obligatorio,
reintento sin duplicados, rechazo atómico de trabajador de otra empresa,
trabajador inactivo, falta de permisos y conservación de bloqueos financieros.
El esquema 045 amplía la búsqueda sobre una proyección con permisos; nombres
ocultos no intervienen en coincidencias, conteos ni exportación. Nueve pruebas
focalizadas aprobadas: campos y espacios entre campos, búsquedas literales,
indicadores constantes, permisos parciales, revocación inmediata y otra empresa.
Comprobaciones locales completas aprobadas: lint, tipos, 425 pruebas y compilación.

## Pendientes y retención

La validación en interfaz y publicación se documentarán después de ejecutar
el recorrido real en staging. No confundir pruebas locales con publicación.
Siguen abiertos origen Labor automática, integración Campo/Workforce y reversión
contable, además del contraste de los demás módulos.

El propietario decidió conservar por ahora aaf268c y source-aaf268c.tar.gz.
No se borró ninguno de esos dos elementos. La decisión no cambia las dependencias
ni la versión activa y su retorno validado.
