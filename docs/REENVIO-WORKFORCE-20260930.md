# Reenvío de gastos devueltos de Workforce

## Regla y fuente

El controlador ADT privado distingue DEVUELTO/NEEDS_CORRECTION de REJECTED.
La devolución automática procede de resultados IA DUDA/MAL sobre pendientes;
una segunda incidencia después del reenvío corresponde a administración.
Campo permite corregir el gasto propio devuelto, conservando el recibo si no
se reemplaza. Reinicia decisiones y revisión, conserva identidad/creación y
audita EXPENSE_RESUBMITTED. Administración puede corregir NEEDS_CORRECTION.
Esta copia local no certifica por sí sola el PHP actualmente desplegado.

## Alcance de los esquemas 053/054

Estado Devuelto para corregir, motivo/fecha de devolución, contador y actor/fecha
del único reenvío. El trabajador activo corrige exclusivamente su gasto propio,
con versión, recibo original verificado, fecha de empresa, importe, categoría,
pagador y obra/general. Fecha no futura y límite de corrección Campo USD 20.000;
el envío nuevo Workforce conserva USD 10.000. Obra se valida por existencia en la misma empresa, como Campo; una asignación
finalizada no bloquea corregir el gasto propio. El selector conserva la obra
original y el ámbito disponible de Workforce. General conserva referencia original
y procedencia. El envío nuevo sigue exigiendo asignación.

Un reintento idéntico devuelve el resultado registrado; no incrementa nuevamente
el contador. Otro payload/versión se rechaza. Reenvío vuelve a SUBMITTED, elimina
la revisión vigente y las decisiones actuales; todas quedan en historial.
Un segundo devuelto requiere administración. La corrección administrativa 052
se amplía al estado devuelto, sin habilitar rechazados ni aprobados finales.

## Límites abiertos

No se crea un botón administrativo para devolver sin la regla del origen.
La IA y su productor de devoluciones siguen pendientes; los estados usados en
pruebas se preparan explícitamente como fixtures sintéticos, sin atribuirlos a
un proveedor real. No se generan pagos, reembolsos, copias contables ni envíos.
Sustituir foto, conservación y apertura de fotos anteriores, etiquetas libres
administrativas y segundo resultado IA/NEEDS_EDIT siguen pendientes.
No cierra paridad de Campo/Workforce ni los 21 módulos.

## Evidencia

Entrega inicial 4ee9424 y ajuste final **28efb2a304ba0d0b9c86837231ed333733765c8e**,
publicados solo en staging. Esquemas 053/054 aplicados con guardas de proyecto,
empresa sintética, esquema previo y registros de prueba. Producción no se activó.

- Suite final: **476 pruebas**, sin fallos ni omitidas; lint, tipos y compilación
  local/hosting correctos. [CI final](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36766607501):
  check, queue-concurrency y backup-recovery correctos. La prueba de recuperación
  de CI no acredita restauración remota ni RTO/RPO operativo.
- PostgreSQL 17 aplica todos los esquemas y ensaya ocho reenvíos concurrentes
  idénticos: un efecto, una solicitud y tres eventos incluyendo la devolución
  preparada como fixture. Conflicto de versión y revisión reiniciada comprobados.
  Pruebas aisladas cubren otros trabajadores, roles, empresa, recibo ausente,
  estado final, general, segundo reenvío y revocación.
- Sesión real de la cuenta sintética por fases Trabajador/Oficina. Dos gastos
  enviados por formulario con sus recibos; DEVUELTO se prepara explícitamente
  como fixture, sin IA ni atribución a una automatización real.
- En la entrega inicial, fecha futura rechazada por servidor con los campos
  conservados y el registro intacto. La regla continúa cubierta en la suite final.
- Asignación temporal finalizada antes del guardado final: el trabajador conserva
  su obra original en el selector y reenvía su gasto con fecha de empresa,
  importe, descripción y pagador corregidos. Versión 2 a 3, SUBMITTED, revisión
  PENDING, contador 1 y recibo original. Historial en pantalla con actor,
  antes/después, fecha y contador.
- Dos reintentos directos idénticos devuelven el resultado original; contenido
  distinto y versión antigua rechazados. Sin efecto adicional: versión 3,
  una solicitud de reenvío y tres eventos, incluido el fixture de devolución.
- Segunda devolución sintética: no aparece formulario del trabajador, se indica
  revisión administrativa y una solicitud nueva se rechaza por límite. Oficina
  corrige/revisa este gasto y el segundo devuelto. Final: versiones 5 y 3,
  SUBMITTED/REVIEWED, contadores 1 y 0. El motivo identifica datos/importe de ensayo;
  no representa una conciliación financiera real del recibo.
- Ambos recibos descargados conservan 23.483 bytes y la misma huella SHA-256.
  ID, empresa, trabajador, creación y recibo permanecen iguales. La revisión
  administrativa queda vinculada al archivo original y al snapshot vigente.
- Consulta móvil emulada: viewport/documento/cuerpo a 390 px sin desbordamiento.
  No acredita guardado móvil ni dispositivo físico.
- Permisos originales restituidos, perfil WORKER deshabilitado y asignación
  temporal finalizada con historial. Pantalla no disponible y replay previo
  rechazado después de revocar. Versión de perfil 18 a 21 corresponde a las
  tres transiciones de prueba; el trabajador de negocio permanece intacto.
- Dieciséis conjuntos anteriores conservan recuentos/huellas: finanzas,
  relaciones, horas, solicitudes, documentos, recibos y gastos anteriores.
  Se excluyen solo los cinco campos aditivos de 053 de la huella Workforce
  previa, y los dos fixtures nuevos identificados por prefijo de ensayo.
- Ocho controles públicos correctos en staging/producción: salud, login,
  recuperación y redirección de actualización sin sesión.

Activa 28efb2a, anterior conservada 4ee9424 y dependencias compartidas c66e4ec/b149bee.
Proceso activo comprobado en la carpeta final, sin proceso Node en la entrega
anterior; configuración privada igual y hash de configuración de producción
intacto. 4ee9424 conserva los contratos del ajuste 054; no se ensayó una
conmutación de retorno en esta entrega. Inventario final: 96.046 entradas en la
cuenta. Otras entregas del inventario requieren revisar contenido único/enlaces
antes de proponer una limpieza con su confirmación aplicable; aaf268c sigue
conservada por decisión del propietario. No hubo borrados en este bloque.

Datos, SQL, huellas detalladas y capturas permanecen fuera de GitHub. No hubo
migración de ADT, pago, reembolso, copia contable ni envío externo. No cierra
Campo/Workforce: IA y productor de devoluciones, segundo resultado IA,
sustitución/fotos anteriores y restantes recorridos siguen abiertos.
