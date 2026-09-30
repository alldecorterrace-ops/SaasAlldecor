# Consulta de equipo: roles reales en staging — 30 de septiembre de 2026

Continuación de la [base de equipo y asignaciones](AUDITORIA-EQUIPO-WORKFORCE-20260929.md).
Se comprobó la interfaz publicada desde `80adf3d`, esquema 047, con una cuenta
ficticia autenticada. La misma cuenta recorrió por fases los perfiles Trabajador,
Encargado y Oficina dentro de una empresa de pruebas. No se crearon credenciales.

## Resultado de la consulta

| Perfil | Equipo mostrado | Obras mostradas |
| --- | --- | --- |
| Trabajador | Solo su propio perfil | Una obra con asignación vigente |
| Encargado | Su perfil y un trabajador de su equipo directo | Solo su obra asignada; no hereda la obra de su subordinado |
| Oficina | Los tres perfiles activos de esa empresa | Las tres obras operativas de esa empresa |

El perfil ajeno al equipo directo quedó fuera de la consulta del encargado.
La consulta de otra empresa sin membresía devolvió «Página no disponible».
Oficina no recibió permisos generales de administración: la ruta Gastos siguió
bloqueada. El trabajador no pudo abrir la configuración de equipo.

Los tres perfiles se comprobaron en escritorio y móvil emulado de 390 × 844 px.
La anchura del documento no superó la ventana en ninguno. Es emulación; no
acredita un ensayo en teléfono físico. Capturas y estados detallados están
conservados fuera del repositorio.

## Revocación y preservación

- Desactivar el perfil y recargar retiró el equipo y las obras. La página mostró
  la indicación de solicitar vinculación a un administrador.
- Finalizar la asignación retiró la obra del trabajador sin conceder la de su
  compañero. Se conservaron las asignaciones y su historial.
- Restituir los permisos originales, sin Horas, bloqueó la misma ruta al recargar.
  No se cerró la sesión ni se renovaron credenciales entre perfiles.
- Al concluir, la membresía conservó su rol, estado y permisos iniciales. Los
  tres perfiles y las dos asignaciones de la prueba quedaron retirados. El único
  trabajador ficticio añadido quedó inactivo; no hubo borrados.
- Catorce conjuntos de registros existentes conservaron recuentos y huellas:
  clientes, estimados, facturas, proyectos, pagos, gastos, trabajadores previos,
  marcaciones, solicitudes, periodos, registros operativos, lotes, cargas de recibos
  y cambios de recibos. La comparación de trabajadores excluye explícitamente
  el nuevo fixture, cuya alta y retirada se verificaron por separado.

Las preparaciones y retiradas usaron funciones públicas auditadas, actor
administrativo ficticio y transacciones con guardas de staging. No se ejecutaron
pagos, comunicaciones externas, importaciones, sincronizaciones ni cambios en ADT
ni en la producción del SaaS.

## Validación y límite de cierre

La prueba específica `tests/workforce-scope.test.ts` volvió a pasar: **10 casos,
cero fallos**. Comprueba roles, aislamiento, fechas, DST, concurrencia lógica de
versiones, reintentos, revocaciones y protecciones de escritura. Las ocho
comprobaciones públicas de producción y staging también pasaron.
La suite completa de 440 casos y CI corresponden a la entrega anterior; no se
presentan como ejecutados nuevamente en esta auditoría.

Se cierra el pendiente de **consulta autenticada de equipo y obras por los tres
perfiles**. No se cierra el módulo Trabajadores ni Horas completo. No se ensayaron
nuevas escrituras desde esos roles, delegación de horas, GPS, recibos de Campo,
revisión humana/IA, doble aprobación, reembolso o incorporación contable. El
contraste de la versión PHP operativa actual de ADT también conserva su límite.

Siguiente bloque: [circuito de recibos y gastos de Workforce](PARIDAD-GASTOS-WORKFORCE-20260929.md),
con datos sintéticos y sus reglas de autorización, revisión y aprobación.
