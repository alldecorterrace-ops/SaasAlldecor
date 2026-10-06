# Anulación: proyecto, pagos y documentos del expediente

Continuación de la entrega de [privacidad de documentos, PR 10](https://github.com/alldecorterrace-ops/SaasAlldecor/pull/10).
El código de aplicación consultado es `ca4085d4638750d27c13eb9e947e546aeec3358e`,
esquema 083. Este registro acredita acciones específicas y conserva separados
los niveles de prueba; no declara completos Facturas, Clientes, Proyectos o los
21 módulos.

## Regla del origen vigente

El 6 de octubre se confirmó mediante SSH autenticado, comprobación estricta
de host y comando de lectura la huella de `CrmController.php` de ADT:
`578144f99dd8a57043df03915c27f5e3b962633668b315c13013c7ee9c3d4401`.
Coincide con la captura privada usada en esta revisión; el código de ADT y la
evidencia privada permanecen fuera de Git.

- `invoiceVoid` cambia la factura a VOID y los pagos APPLIED a
  ASSOCIATED_TO_VOID_INVOICE. Conserva importes guardados, fechas, partidas y
  proyecto. Una factura ya anulada devuelve el resultado sin repetir cambios.
- `financialEvent` registra el historial y no cambia el proyecto. La anulación
  no implica automáticamente cancelación ni cierre del proyecto.
- `portalInfo` excluye facturas VOID y pagos no APPLIED de su presentación al
  cliente; `portalDocs` usa las facturas restantes para localizar sus PDF.
  Las referencias a un expediente administrativo del origen que no carga no
  se cuentan como una prueba positiva de interfaz.

## Equivalencia y resultado nativo en staging

Se leen registros ficticios existentes. No se anula ni registra un pago nuevo.
Las comprobaciones nativas usan transacción de solo lectura y, para RLS,
identidades ficticias existentes configuradas únicamente dentro de la transacción.
No son una sesión web de Administración y no cambian miembros ni permisos.

| Acción                             | Resultado comprobado                                                                                                  | Nivel de prueba                                   |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Factura anulada y abonos asociados | VOID v4, total 128.41, pagado guardado 50.01, saldo guardado 78.40; abonos 19.95 y 30.06 asociados a la anulación, v2 | SQL nativo y referencia ADT vigente               |
| Proyecto vinculado                 | NUEVO v1; no se aplica cancelación automática                                                                         | SQL nativo; pruebas locales antes/después         |
| Revisiones privadas                | Dos PDF ready, de la revisión anterior y de la anulada, conservados                                                   | SQL nativo; descarga con Administración pendiente |
| Expediente comercial del cliente   | Excluye ambas revisiones de la factura VOID; conserva una factura vigente del mismo cliente y documentos de estimados | RPC nativo con RLS y controles positivos          |
| Cliente de control                 | Su factura vigente conserva el PDF visible en el RPC                                                                  | RPC nativo con RLS                                |
| Movimientos de pagos               | Los asociados a anulación siguen visibles como ANULADO y no se suman; total aplicado 0.00 en ese cliente ficticio     | RPC nativo con RLS                                |
| Cliente incorrecto                 | RPC rechazado, sin documentos de otra ficha                                                                           | RPC nativo con RLS                                |
| Módulo de Facturas restringido     | Documentos de facturas invisibles, estimado permitido visible                                                         | RLS nativo y HTTP de sesión real                  |

El pagado/saldo guardado de la factura anulada y el total aplicado del expediente
representan datos distintos de ADT. No se reemplaza el importe guardado por cero,
ni se presenta un pago asociado a anulación como APPLIED.

## Pruebas y evidencia disponible

- 22 pruebas focalizadas aprobadas: `invoice-void`, `commercial-documents` y
  `customer-ledger`. Cubren facturas sin pagos, parciales, pagadas, repetición,
  conflictos, permisos, conservación del proyecto, revisiones y filtrado.
- Cuatro GET reales aprobados con la cuenta restringida existente: estimado
  permitido 200 con bytes originales; PDF anterior, PDF de factura anulada y
  factura vigente del módulo restringido 404 con el mismo error genérico.
  Conservan private/no-store, nosniff y no-referrer. La sesión temporal privada
  se elimina al finalizar y no se guarda en resultados ni en Git.
- Se preparó la prueba complementaria con Administración: descargas internas
  de revisiones anterior/anulada, rechazo de ambas con contexto de cliente,
  dos facturas vigentes como controles positivos, anonimato, empresa/cliente
  incorrectos y entrada malformada. Falta ejecutarla con esa sesión real.

- Comparación final: las 91 tablas y 1.380 filas del ámbito de aplicación
  conservan sus conteos y huellas; máximo de auditoría 761 sin cambios,
  esquema 083, definición y permisos del RPC iguales. No incluye tablas
  internas de autenticación.

No se atribuye el rechazo HTTP de la cuenta restringida al estado VOID: esa
cuenta carece de permiso de Facturas. La regla específica de exclusión de VOID
tiene evidencia nativa y local; su comprobación HTTP autorizada y la revisión
en pantalla siguen pendientes del acceso a la cuenta administradora ficticia.

## Límites

La revisión no modifica reglas de negocio ni requiere una nueva entrega de
aplicación. No envía emails, cobra, reembolsa, anula registros, crea PDFs,
modifica permisos o ejecuta imports. ADT conserva la operación; GPS físico
aplazado y configuradores/3D excluidos. Los demás estados, perfiles, documentos,
Portal/IA, recibos y preparación operativa siguen en el cierre vigente.
