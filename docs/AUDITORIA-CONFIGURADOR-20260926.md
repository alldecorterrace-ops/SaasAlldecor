# Referencia actual del configurador de ADT

Fecha: 26 de septiembre de 2026. Inspección autenticada de ADT en lectura,
pruebas locales y recorrido guardado en staging con datos ficticios. No hubo
guardado en ADT, envío, cobro ni importación de datos de negocio.

## Interfaz observada

La ruta de Pérgola sin 3D redirige a /adt/pergola.php. La pantalla actual permite
presupuesto sin pérgola o varias estructuras, cocina, varias paredes, catálogo y
líneas libres. Incluye condiciones particulares, cuatro porcentajes de pago,
fecha de entrega, abono, permiso, ZIP, millas, factor de zona opcional, descuento,
impuesto opcional, costo, margen, partidas y lista de materiales. Hay recuperación
de borrador local. Guardar y enviar son acciones diferentes; no se ejecutaron.

El JavaScript cargado es motor-costo.js?v=20260730h, SHA-256:
`04173aecdd46797dd1018a64f33d0e42a5323ccc2f02189811973f6aecd446a4`.
La copia de referencia permanece privada. No se trasladaron las tarifas de la
cuenta: la prueba siguiente sustituye expresamente los parámetros por ficticios.

## Diferencias concretas y estado de comprobación

| Acción o regla | Referencia actual | Estado del SaaS inspeccionado |
| --- | --- | --- |
| Estructuras | Ninguna o varias por estimado | DesignSpec conserva una sola estructura obligatoria. |
| Paredes | Varias, cada una con modelo, color y medidas | Una pared por especificación. |
| Cocina y equipos | Módulos con equipos; precio de venta distingue margen de recargo | Longitud lineal; falta el contrato completo de equipos. |
| Condiciones | Texto para estimado/contrato, calendario validado y entrega | No están representados en la especificación del configurador. |
| Zona | Factor opcional separado del precio base; líneas libres no pasan por él | No está representado en DesignSpec. |
| Permiso | Sobre el umbral, máximo entre fijo y área por tarifa | Corregido en el RPC por esquema 033; mínimo y rama por área comprobados hasta el documento guardado en staging. |
| Despiece | Motor de costos y lista de materiales | El cálculo básico no acredita despiece ni planos. |

Se inspeccionaron src/lib/designs.ts, src/components/design-fields.tsx,
src/app/app/[companyId]/disenos/actions.ts y la definición vigente de save_design
en la migración 028; la corrección posterior está en 033. Esta tabla no es una
auditoría completa de Nuevo estimado 3D.

## Hallazgo inicial del mínimo de permiso (antes de 033)

Se ejecutó el motor publicado en un contexto JavaScript aislado sin red y sin
base de datos. Parámetros ficticios: fijo 100, tarifa por ft² 5 y umbral 10.

| Área | Resultado del motor ADT | Fórmula anterior 028 reproducida localmente |
| --- | --- | --- |
| 10 | 100 | 100 |
| 11 | 100 | 55 |
| 20 | 100 | 100 |
| 21 | 105 | 105 |

El caso 11 demostró la diferencia de fórmula; después se reprodujo también
en la interfaz anterior de staging: permiso 55 y total 77, con techo a 2 por ft².
Ese diseño conserva revisión e importes tras aplicar la corrección.

## Corrección comprobada en staging

Código publicado: `287af2d906cb8a9786c7ec6315055604413d96fd`. La migración
aditiva `202609260033_design_permit_floor.sql` cambia solamente la selección
de base y tarifa del permiso en `save_design`. Mientras aplica el mínimo, la
partida usa precio fijo; al superar ese importe usa área. Así el normalizador del
estimado reproduce el cálculo sin introducir un total manual.

Se conservaron validación de empresa, permisos, revisión esperada, archivo y
captura de tarifas. No se recalcularon diseños existentes. Guardar una revisión
futura aplica la fórmula corregida con sus tarifas guardadas; actualizar la
captura de tarifas sigue requiriendo la acción explícita existente.

La aplicación se hizo únicamente en SaasAlldecor-Staging, después de CI aprobado.
Guardas verificaron identidad de staging, las 32 migraciones anteriores y su
contenido. La transacción comparó huellas de diseños, estimados, facturas, pagos
y auditoría antes/después, además de OID, propietario, permisos y configuración
de la función. Resultado: 33 migraciones, registros previos y privilegios intactos.

El primer intento fue revertido automáticamente por una diferencia CRLF/LF
introducida al pegar en el editor. Se reprodujo localmente y se ajustó la huella
para normalizar exclusivamente saltos de línea; el segundo intento pasó todas
las guardas. SHA-256 de 033 normalizado a LF:
`a2a9591ed3e5cf05e990fd6e8778a9318a851b81601be8a912188c271020baf3`.
MD5 del cuerpo de la función normalizado a LF:
`ddb2beb0997b6b49a501177329ffa358`.

La aplicación web sigue en `7017873`, compatible con 033. No hubo nueva carpeta
de entrega, compilación en hosting ni reinicio. Producción conserva `3c0c412`,
su proceso y configuración comprobados; ambas rutas de salud respondieron 200
con no-store. Esquema 033 no aplicado a producción.

### Evidencia funcional y pruebas

- Motor ADT ejecutado aisladamente, sin red y con tarifas ficticias: áreas 9.999,
  10, 11, 20, 20.01 y 21 producen 100, 100, 100, 100, 100.05 y 105.
- PostgreSQL local ejecuta esos casos en ambos tipos de diseño. Cubre permiso
  desactivado, conversión repetida sin duplicado, captura de tarifas, actualización
  explícita, conflictos, permisos y aislamiento de empresa.
- Ensayo local de actualización aplica 033 dos veces: conserva registros,
  auditoría e identidad/privilegios de la función; los nuevos diseños usan el mínimo.
- Sesión autenticada de staging, propietario de una empresa sintética: crear,
  guardar, reabrir y generar estimado con 11 × 1 ft deja permiso 100 y total 122.
  El documento imprimible refleja precio fijo 100, sin importe manual.
- Nuevo estimado 3D: 21 × 1 ft deja permiso 105 y total 147; el estimado y su
  documento imprimible conservan medidas, tarifa 5 y base por área.
- Repetir la generación de la misma revisión abre el mismo estimado; la empresa
  conserva el anterior y los dos nuevos, sin un cuarto documento duplicado.
- El diseño previo sigue en revisión 1 y total 77; el estimado de control de otra
  empresa sigue en revisión 3 y total 306.95. Los nuevos documentos son borradores.
- Documento de 122 comprobado también en viewport móvil emulado de 390 px: ancho
  de documento 390 px, contenido y total conservados. No es prueba en equipo físico.
- `npm run check`: lint, tipos, 335 pruebas y compilación aprobados.
  [CI del commit exacto](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36268051354):
  check, backup-recovery y queue-concurrency aprobados. Esos jobs no acreditan
  recuperación real del hosting ni traspaso operativo.

Identificadores, capturas y detalle de ejecución se guardan en evidencia privada,
fuera de Git. No se copiaron tarifas ni registros de ADT.

## Próximo cierre funcional

Registrar y portar el contrato de ninguna/varias estructuras, paredes, equipos,
condiciones, catálogo, costos y factores de zona. Cada fórmula debe compararse
con la referencia y con el documento guardado. Falta verificar también la
semántica de tarifas ausentes/cero del motor original: el mínimo corregido se
comprobó con tarifas positivas explícitas. No se declaran cerrados los dos
configuradores, el despiece, los planos ni la matriz completa de roles.
