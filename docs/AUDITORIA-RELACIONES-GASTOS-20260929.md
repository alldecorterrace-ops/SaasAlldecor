# Gastos: trabajador asociado y búsqueda equivalente a ADT

Publicada y comprobada en staging **604fbe5**, 29 de septiembre de 2026. Esquema 045.
Integra b69a5c5 y la corrección del mensaje detectado en su prueba visual.
Producción del SaaS no se ha desplegado ni migrado; sin importaciones ADT ni traspaso.

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

## Evidencia operativa

[CI b69a5c5](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36618976418)
y [CI 604fbe5](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36620021046):
check, queue-concurrency y backup-recovery aprobados. Las 425 pruebas y compilación
se comprobaron localmente para b69a5c5; la corrección de aviso pasó tipos, lint y
nueve pruebas locales, además del CI completo del commit exacto.

- Esquemas 044/045 aplicados únicamente a staging, con guardas de proyecto. Las
  once huellas de tablas anteriores a la aplicación permanecieron iguales.
- Sesión real: cambiar de Empresa a Trabajador y volver conserva la selección.
  Una segunda fila sin trabajador obligatorio rechazó todo el lote; once huellas
  idénticas después del intento. Al corregirlo se guardaron exactamente dos gastos.
- Registros sintéticos de 1.11 y 2.22: EMPRESA / EFECTIVO_EMPRESA, trabajador
  asociado conservado, revisión APROBADO, reembolso NO_APLICA y versión 1.
  Reapertura de ficha y lote comprobadas. No se ejecutaron pagos reales.
- Global mensual/activo 93.19; deuda de reembolsos 10.01 sin incremento.
  Lote filtrado 3.33 con reembolso 0.00. CSV autenticado de 776 bytes, dos filas,
  nombres, pagadores y centavos conservados. Vista de 390 píxeles sin desbordamiento.
- Búsqueda por trabajador: tres filas / 13.34. Por cliente: cuatro / 85.16.
  Fecha y categoría concatenadas: siete / 66.72. Indicadores globales constantes.
- Usuario restringido en la segunda empresa: Página no disponible, sin resultados.
  Permisos parciales por relación, revocación y exportación comprobados en pruebas SQL.
- Once huellas previas intactas al terminar el recorrido, excluyendo únicamente
  el nuevo lote sintético y sus dos filas identificadas. Evidencia privada fuera de Git.

El primer intento de compilación de b69a5c5 se detuvo antes de crear la candidata
por saltos CRLF en el script. Se normalizó a LF, se conservó el diagnóstico y
la compilación posterior finalizó. En la prueba de interfaz se detectó un aviso
con nombre técnico de campo; 604fbe5 lo sustituye por instrucciones en español.
La repetición en la entrega final muestra «revisa el trabajador seleccionado;
es obligatorio si pagó de su bolsillo» y no guarda el intento inválido. Formulario
móvil a 390 píxeles sin desbordamiento.

Retorno real 604fbe5 → 0545710 → 604fbe5 comprobado. La versión anterior abre la
nueva ficha con trabajador, pagador, importe 1.11, estado aprobado y NO_APLICA
conservados; no se revierte el esquema. Versión y proceso activo final verificados.
Las cuatro rutas públicas de staging y salud de producción responden 200 antes y
después. La huella del archivo de publicación de producción se conservó.
Once huellas previas iguales al finalizar el retorno, excluyendo solo los dos
registros sintéticos nuevos y su lote. Datos y evidencia fuera de GitHub.

## Límites pendientes
Siguen abiertos origen Labor automática, integración Campo/Workforce y reversión
contable, además del contraste de los demás módulos.

El propietario decidió conservar por ahora aaf268c y source-aaf268c.tar.gz.
No se borró ninguno de esos dos elementos. La decisión no cambia las dependencias
ni la versión activa y su retorno validado. 604fbe5 queda activa y 0545710
comprobada para retorno; dependencias c66e4ec/b149bee conservadas. b69a5c5 queda
como entrega intermedia pendiente de retención. No se ejecutó ninguna limpieza.
Recuento final observado: 596484 entradas en el home, sin seguir enlaces; este
recuento no certifica la cuota de inodos del proveedor.
