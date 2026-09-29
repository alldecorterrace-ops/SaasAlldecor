# Expediente de Clientes y alcance vigente

Fecha: 29 de septiembre de 2026.

## Decisión del propietario

El alcance activo queda en **21 módulos**. Pérgola sin 3D y Nuevo estimado 3D,
incluidos sus cálculos geométricos, despiece y planos automáticos, quedan fuera.
Se retiran de la navegación y del destino inicial; el catálogo técnico, los
permisos y enlaces existentes se conservan para no alterar registros históricos.
Productos, Precios, Estimados y Manual de fabricación siguen incluidos.
La migración de datos y el traspaso operativo siguen pausados.

## Acción comercial implementada

La ficha de cliente incorpora secciones de Estimados, Facturas y Proyectos,
con enlaces al documento original, fecha y estado. Los importes y saldos se
leen de las facturas; no se recalculan ni agregan partidas o pagos.

Cada sección exige su permiso propio además del permiso de Clientes. Sin
autorización no se consulta esa tabla, ni su cantidad de registros. La consulta
usa empresa e identificador de cliente; nunca une fichas por nombre, correo
o teléfono. Se incluyen documentos anulados con su estado. Hay paginación de
20 registros y un orden estable; los errores no se presentan como una lista vacía.

## Contraste con ADT y límite de paridad

Referencia: copia privada de adt-modules-v2.jsx, módulo Clientes, pestañas
de estimados, facturas y proyectos. Huella SHA-256 de la copia inspeccionada:

482eebd09a798ffe234eea96e8481e4776771e8f8d63552d4e96b867e9bda989.

Esta es evidencia de código previamente obtenido, no una nueva comprobación de
ADT en ejecución: en esa fase el acceso solicitaba segundo factor del propietario. La continuación
de pagos/gastos de más abajo sí consulta una sesión ADT autenticada.
Pagos, gastos, documentos, operaciones e historial unificado del expediente
siguen pendientes de comparación e implementación completa. No se declara
cerrado todo Clientes ni los 21 módulos.

## Validación

Pruebas de lectura sobre PostgreSQL local/PGlite con las 34 migraciones y RLS:
dos empresas, clientes distintos con los mismos datos de contacto, paginación,
revocación, suspensión, módulos restringidos, documentos vinculados y decimales.
Prueba de HTML para enlaces autorizados, escape de nombres y centavos.
Todo usa datos sintéticos; no requiere una migración nueva de esquema. `npm run check` completo: lint, TypeScript, 356 pruebas y compilación aprobados en local.

Entrega inicial 1ad4cbb publicada y recorrida en staging. CI de aplicación, concurrencia y recuperación sintética aprobados. Se comprobaron cinco estimados, una factura de USD 200.50 con saldo USD 100.25 y su proyecto, apertura desde el expediente y reapertura. En ancho emulado de 390 px, la página no desborda; la tabla permite desplazar las columnas hasta Saldo. El usuario restringido solo ve Estimados incluso solicitando la sección Facturas por URL. Un cliente de otra empresa devuelve HTTP 404. No se cambiaron roles ni registros en estas verificaciones.

El rótulo fijo de Dashboard se corrigió y volvió a verificarse tras publicar la entrega final **9598d35fa781f18b8f981fc5e3113c5b388059ef**: 21 enlaces de menú, 21 módulos en alcance y cero enlaces a los dos configuradores. La factura conserva total y saldo después de la segunda publicación. [CI final aprobado](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36588919593): aplicación (356 pruebas y build), concurrencia y recuperación sintética.
Producción y datos de negocio no forman parte de esta publicación.


## Publicación inicial y límites operativos

- Entorno verificado: staging.alldecorpatio.com. Compilación Webpack en carpeta
  independiente, con un CPU y dependencias compartidas sin modificarlas.
- Aplicación activa: 9598d35; retorno comprobado: 1ad4cbb; dependencias: b149bee.
  Mismo esquema 034, sin nuevas migraciones ni escrituras de negocio.
- Se verificaron proceso activo, SHA publicado, configuración privada preservada,
  permisos del documento web y cuatro rutas públicas de staging con HTTP 200.
- Producción conserva 3c0c412, el mismo proceso y la misma huella de configuración.
  Sus cuatro comprobaciones públicas pasaron antes; su salud volvió a pasar después.
- No se eliminaron carpetas. 2a1e325 y 7017873 quedan identificadas como candidatas
  de retención fuera de activa/retorno; su retirada exige comprobar contenido único,
  dependencias y confirmación de la lista exacta. Esto no certifica la limpieza total
  del hosting ni recuperación RPO/RTO.
- Capturas y resultados detallados permanecen privados. No se registraron pagos ni se enviaron correos, cambiaron permisos o importaron
  datos durante esa auditoría.

Pendiente tras la primera entrega: pagos/gastos, documentos, operaciones e
historial unificado del expediente. Los demás pendientes permanecen en CIERRE-FUNCIONAL.md.


## Continuación: pagos y gastos del expediente

El 29 de septiembre se pudo consultar Clientes en una sesión autenticada de ADT.
Se comprobó su pestaña Pagos: total, método, importe, fecha y factura relacionada.
La pestaña Gastos del cliente consultado devuelve «No se pudieron cargar los
gastos»; el cero que presenta después no demuestra ausencia de gastos. No se
ejecutaron altas, cambios financieros, envíos ni operaciones del portal en ADT.

La copia de referencia de Clientes relaciona pagos por identificador de cliente
y gastos por client_external_id, excluyendo los anulados. En el modelo SaaS,
pagos pertenecen a facturas y gastos a proyectos. Se implementa la consulta de
esas relaciones existentes, sin inferir vínculos por contacto y sin importaciones.

| Acción | Implementación y condición |
| --- | --- |
| Consultar pagos | Fecha, método, referencia, notas, importe, estado y enlace a su factura. Total de pagos aplicados; anulados conservados sin sumarlos. |
| Consultar gastos de proyectos | Categoría, descripción, proveedor, documento, importe, método, estado, reembolso y enlace al gasto/proyecto. La ficha de gasto conserva el acceso autorizado a su comprobante privado. |
| Distinguir totales | Total registrado sin anulados, desglosado en aprobado/pendiente/rechazado; no equivale a pago, reembolso ni costo laboral calculado. |
| Paginar | 20 filas, fecha descendente e ID estable. Total, cantidad y página limitada se obtienen en la misma consulta y abarcan todas las páginas. |
| Autorizar | Clientes + Facturas para pagos; Clientes + Gastos + Proyectos para los gastos asociados. RLS continúa activa y la función no eleva privilegios. Una revocación rechaza la consulta. |
| Vincular gasto directamente a cliente | Pendiente. El SaaS no tiene esa relación sin proyecto; el nombre «Gastos de proyectos» evita afirmar cobertura completa. |

Esquema aditivo 035: función de lectura customer_ledger, security invoker,
sin acceso anónimo, sin escritura de negocio y sin cambios de tablas/permisos
existentes. La entrega anterior sigue siendo compatible. Errores de consulta
o respuesta inválida no se presentan como cero ni como histórico vacío.

Pruebas nuevas con PostgreSQL/PGlite: dos empresas, contactos coincidentes,
24 pagos, 26 gastos (incluidos anulados, pendientes, rechazados, cliente distinto,
empresa distinta y gasto sin proyecto), centavos, dos páginas, revocación,
permiso incompleto, ausencia de lectura anónima, escape de HTML, inmutabilidad
de registros al consultar y reaplicación del esquema. No sustituyen la prueba
de Supabase/PostgREST y pantalla desplegada, que se registrará al publicar.

Persisten pendientes en Clientes: asociación directa de gastos, documentos,
operaciones e historial completo; no se declara cerrado el módulo.

Validación local de la ampliación: lint, TypeScript, 364 pruebas y build aprobados.


## Resultado publicado de la ampliación

Entrega activa de staging: **4c21da6516b7aae5e8979aa5f096368c10c9e4f0**,
esquema **035**. Retorno compatible y previamente comprobado: 9598d35;
dependencias compartidas conservadas en b149bee. No se desplegó a producción.
[CI exacto aprobado](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36591240764):
lint, tipos, 364 pruebas, build, concurrencia de cola y recuperación sintética.
Estos dos últimos trabajos no certifican el traspaso ni RPO/RTO reales.

Evidencia operativa obtenida:

- La función quedó instalada en SaasAlldecor-Staging. Bajo el rol authenticated
  del auditor devolvió pagos y gastos de la empresa autorizada. Rechazó pagos y
  gastos de la empresa donde carece de esos permisos, y un cliente de otra
  empresa. Se comprobó security invoker, stable y ausencia de ejecución anónima.
- Las huellas completas de los cinco pagos y del gasto anteriores coincidieron
  antes/después de aplicar el esquema. Después se creó desde la interfaz un único
  gasto ficticio de USD 25.10, pendiente y sin reembolso, en la empresa QA. Al
  terminar, las huellas de los registros anteriores seguían iguales.
- El expediente muestra el pago sintético existente de USD 100.25 y abre su
  factura. La factura conserva total USD 200.50, pagado USD 100.25 y saldo USD
  100.25. No se registraron pagos nuevos ni se ejecutaron cobros o reembolsos.
- El gasto nuevo aparece en su cliente mediante el proyecto correcto. Se abrió
  su ficha y se reabrió el expediente, conservando importe, estado, proveedor,
  documento y descripción. Aprobados/rechazados: USD 0.00; pendientes: USD 25.10.
- El usuario restringido solicitó Pagos por URL y solo recibió Estimados; las
  pestañas financieras, sus cantidades y sus importes no se mostraron.
- En ancho emulado de 390 px, la página ocupa 375 px más barra de desplazamiento;
  no desborda horizontalmente. La tabla de gastos se desplaza dentro de su
  contenedor hasta mostrar método, estado, documento y reembolso. Pagos también
  mantiene su total y ancho de página. Se retiró la emulación al terminar.
- Se confirmó la revisión exacta y el proceso activo de staging; cuatro rutas
  públicas respondieron HTTP 200. Producción conserva 3c0c412, el mismo proceso y
  la misma huella de configuración, con salud HTTP 200.

El primer intento de compilación no inició por finales de línea Windows en el
script de ejecución. Se normalizó a LF y se recompiló antes de activar; ese
intento no alteró la entrega activa. Los scripts corregidos y diagnósticos están
en el archivo privado de auditoría.

No se eliminaron entregas durante este bloque. 1ad4cbb queda ahora fuera de
activa/retorno; su eliminación y la de candidatos anteriores requieren inventario
de contenido único, dependencias y la confirmación de una lista exacta. No se
declara completada la retención del hosting.

La comprobación móvil fue emulada, no en un teléfono físico. La consulta de
gastos de ADT falló en el cliente inspeccionado, y la asociación directa de gasto
a cliente sigue pendiente. Documentos, operaciones e historial unificado también
siguen abiertos. Ninguna de estas pruebas cierra por sí sola los 21 módulos.
