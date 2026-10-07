# Reembolso por lote y consumidores de costos · 7 de octubre

Alcance: bloques Gastos/costos y Comercial, sin IA. ADT continúa operando;
no se ejecutaron imports, pagos, nóminas, transferencias ni envíos a clientes.

## Regla vigente del origen

El controlador vigente de ADT se recuperó mediante SSH firmado, con las dos
copias privadas expresamente autorizadas por el propietario. Su SHA-256 es
578144f99dd8a57043df03915c27f5e3b962633668b315c13013c7ee9c3d4401;
coincide con la referencia usada el 2 de octubre. ProjectLaborLedger vigente:
dcd404d22744170b0c5f4e6888c2f42d067e5bca50e27061eebc0dcce283d165.
Los archivos completos permanecen fuera del repositorio.

ADT exige Administración para confirmar reembolso individual o todos los
gastos de un trabajador: aprobados, de bolsillo propio, pendientes de
reembolso y revisados. Un lote con un comprobante sin revisar se rechaza.
La constancia no ejecuta transferencia. El vínculo de Workforce conserva
su costo, aunque el origen use dos tablas relacionadas.

La app conserva un único gasto y proyecta su costo; la constancia no inserta
otra ficha administrativa. Pagador no declarado permanece como incidencia,
sin convertirlo en deuda ni inventar su origen. Labor usa tarifas y reglas
auditadas por empresa; no traslada IDs ni tarifas particulares del código ADT.
El costo histórico se descuenta del suplemento y no acredita pago.

## Prueba publicada y de sesión

App activa 269e8cb; esquema 085; cuenta administradora ficticia existente.
Dos JPG privados, enviados en pantalla, por USD 10.11 y 20.22 a la obra QA.
Revisión manual sin IA; aprobación de Encargado por RPC nativa con su identidad
ficticia existente; aprobación de Oficina mediante la sesión administradora.

- Lote USD 30.33 bloqueado mientras el segundo recibo no tenía revisión vigente.
- Ambas revisiones habilitaron el formulario; una acción registró dos constancias.
- Deuda 30.33 → 0.00. Reintento de la misma solicitud devuelve el mismo resultado;
  otra solicitud no puede volver a registrar el lote (RPC nativa, rollback).
- Encargado consulta la deuda de su equipo y no puede registrar la constancia;
  empresa ajena denegada (RPC nativa, rollback). No se cambiaron perfiles.
- Gastos, proyecto, cliente y CSV: USD 630.33 antes/después; seis costos únicos.
  Los únicos cambios del CSV son PENDIENTE → PAGADO en los dos gastos ficticios.
- Periodos en pantalla/CSV: 1 oct = 350.00 (100.01 histórico + 149.99 suplemento
  + 100.00 Workforce); 5 oct = 250.00; 7 oct = 30.33. El resumen mensual conserva
  su alcance de empresa y no adopta el filtro de la lista.
- 33 pruebas locales pertinentes aprobadas: roles, archivos/revisión revocada,
  conjunto y versión obsoletos, reparto por centavos, conflictos de Labor,
  histórico y consumidores/CSV. No sustituyen sesiones web de todos los perfiles.

91 tablas: las 1.405 filas originales conservaron sus fingerprints. Se añadieron
25 filas sintéticas de este recorrido (gastos, recibos, decisiones e historial).
Cuatro gastos anteriores, perfiles/asignaciones, pagos y gastos administrativos
intactos. No hubo copias de costo, borrados ni cambios del hosting productivo.

Evidencia privada: saas-cierre-gastos-comercial/20261007, manifiesto
cost-closure-proof.json, SQL, CSV e imágenes de sesión. Este acta cierra el
lote sin IA, reintentos y consumidores/periodos descritos; no pretende certificar
un dispositivo físico ni todas las combinaciones posibles de negocio.
