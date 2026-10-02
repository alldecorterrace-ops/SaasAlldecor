# Cuadrillas de instalaciones · 2 de octubre de 2026

La selección guarda identidades de trabajadores de la misma empresa, además del
responsable y del texto de equipo anterior. La agenda comprueba a cada integrante,
incluyendo los responsables de instalaciones anteriores sin cuadrilla estructurada.
No se trasladan datos de negocio ni se modifican facturas, pagos o costos.

## Contrato y conservación

- Migración aditiva 066: un guardado conserva la cuadrilla en el documento y en
  su versión auditada. No reescribe filas anteriores ni cambia sus versiones.
- El executor 065 conserva empresa, actor, versión esperada, identificador de
  solicitud, efecto y constancia en una sola transacción. Un reintento idéntico
  devuelve el mismo resultado; un formulario anterior no pisa cambios recientes.
- Omitir la nueva propiedad desde código anterior conserva la cuadrilla guardada.
  Una lista vacía explícita elimina la asignación actual, conservando el historial.
- Hasta 20 colaboradores distintos; los nuevos integrantes requieren permiso de
  consulta de Trabajadores y deben estar activos en la misma empresa. No se
  amplían permisos ni se exponen tarifas a usuarios sin acceso a ese módulo.
- La cancelación libera la agenda. Restaurar una instalación con cruces falla;
  horarios contiguos son compatibles. El control de anticipo permanece vigente.
- El cierre de agenda se serializa por empresa, también con responsables distintos
  y un único colaborador compartido. Las solicitudes fallidas no dejan efecto,
  constancia ni auditoría parcial.

## Evidencia y límites

La sesión autenticada de ADT se volvió a consultar el 2 de octubre. Instalaciones
sigue mostrando la descripción de calendario, equipo, materiales, checklist y
firma, junto a «Módulo del sistema», sin controles operativos ni iframe.
Esto no prueba que existan esas operaciones en el servidor de origen. La cuadrilla
se implementa por el plan aprobado; su contraste completo sigue pendiente de
la referencia del backend y los recorridos con los perfiles restantes.

Nueve pruebas nuevas cubren normalización de identidades, reintento, historial,
conflictos entre integrantes y responsables, entradas inválidas, inactivos,
otra empresa, cancelación/restauración, intervalos contiguos y revocación.
Las huellas de facturas, pagos y gastos se conservan en el ensayo sintético.
El ensayo de PostgreSQL nativo se amplía con dos responsables distintos y un
colaborador compartido; su resultado se documentará tras el CI del commit exacto.

Esta entrega no cierra O07–O09 por compilación o pruebas locales. La aplicación
vigente en staging continúa siendo 9de7c8e / esquema 065 hasta verificar CI,
aplicación aditiva, despliegue y recorrido real de esta candidata.
