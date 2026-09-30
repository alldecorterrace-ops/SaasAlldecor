# Pagador de gastos de Workforce

## Regla de referencia y alcance

La fuente privada de ADT observada el 29 de septiembre distingue `propio`,
`empresa` y `efectivo_empresa`. `campoExpense` exige escoger un valor y conserva
actor y fecha. La interfaz separa gastos aprobados de bolsillo propio de los
pagados por empresa: estos ultimos no generan reembolso al trabajador.
El contrato se contrasta con esa fuente y la copia local del controlador; no
acredita por si solo la version PHP actualmente desplegada.

Esta entrega implementa declarar el pagador al enviar un gasto, persistir su
procedencia, consultarlo, filtrarlo y conservarlo en el historial. No confirma
revision IA/humana, reembolso, deuda calculada, transferencia ni copia contable.
La doble decision de encargado/oficina sigue separada del pago.

## Esquema y compatibilidad

Esquema aditivo 051: pagador, usuario y fecha de declaracion. Los gastos anteriores
conservan valores nulos. No se aplica el supuesto historico de ADT de que todo
registro sin metodo fue pagado de bolsillo: los registros anteriores del SaaS no
contienen esa evidencia. Se muestran como Sin declarar y se mantienen fuera de
cualquier inferencia de deuda. Esta diferencia queda explicita; su conciliacion
requerira evidencia cuando se autorice la migracion.

El formulario nuevo exige seleccionar una de las tres opciones. No preselecciona
pagador. La validacion de datos ocurre antes de subir el comprobante. La RPC con
pagador incorpora el valor en el recibo idempotente; cambiarlo conservando la misma
solicitud da conflicto. Importe, recibo, obra y trabajador se conservan.

La firma anterior de la RPC solo reproduce solicitudes ya registradas. Rechaza
altas nuevas sin pagador. Una vuelta a una aplicacion anterior conserva lectura,
decisiones y datos, pero sus altas requieren recargar en esta entrega o posterior.
No debe presentarse como retorno funcional completo mientras este contrato cambie.
No se revierte ni elimina el esquema al volver de codigo.

## Validacion local

Lint, tipos, 455 pruebas y compilacion correctos. Pruebas focalizadas: metodos
validos, nulo/invalido, procedencia, cero efecto financiero, idempotencia vinculada
al pagador, firma anterior, permiso vigente y registros sin declarar.
El ensayo de PostgreSQL 17 incluye envios simultaneos y conflicto de pagador;
los resultados de CI y la sesión real están documentados a continuación.
Auth/Storage locales simulados no prueban cookies ni cargas binarias reales.

## Publicación y evidencia comprobada

Entrega final `41748870b16862298c898ee4a67523faa42eb2ad`, esquema 051,
publicada únicamente en staging el 30 de septiembre. Implementación en
`b9c36c2`; el commit final corrige el texto de reembolso sin cambiar las reglas.
Ambos commits están publicados en GitHub. Lint, tipos y compilación final local
correctos; suite de 455 pruebas y los tres trabajos del
[CI final](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36758778635)
correctos, incluido el ensayo de concurrencia en PostgreSQL 17.
El primer trabajo de respaldo del commit inicial falló con un diagnóstico
genérico de herramienta; se conservó el fallo y su repetición sobre el mismo
código pasó. No se saltó la comprobación ni se atribuye una causa no demostrada.
Ese ensayo de CI no acredita la recuperación real desde Drive.

El archivo fuente descargado en hosting coincide con GitHub por SHA-256
`cd08f5e9e69683b6fb09e7a00c35747414ee042f49d87dcb10ba54a3eb129f2a`.
La compilación de hosting terminó correctamente y el proceso activo corresponde
a `4174887`. Configuración privada y dependencias compartidas preservadas;
la huella de la configuración de producción no cambió. Ocho controles públicos
de staging/producción correctos después de publicar. El control inicial de
redirección esperaba una URL absoluta y produjo dos falsos negativos: se corrigió
para resolver también `/login` contra el mismo origen, sin modificar la aplicación.

| Recorrido real de staging | Resultado y límite |
| --- | --- |
| Formulario sin pagador | Sin opción preseleccionada. La validación nativa bloquea el envío, conservando campos y archivo preparado. |
| Tres medios de pago | Sesión real del auditor: tres gastos ficticios de USD 12.34 con recibo, trabajador, obra, pagador, autor y fecha; pendientes del encargado, versión 1. |
| Recibos | Tres cargas binarias reales; 23.483 bytes cada una. Las huellas SHA-256 coinciden con el archivo sintético preparado. La reutilización intencional del recibo no es prueba de detección IA de duplicados. |
| Reapertura y consulta | Tres registros nuevos y uno anterior. Filtros de bolsillo, tarjeta, efectivo y Sin declarar muestran el registro correspondiente. Historial conserva pagador y procedencia. |
| Reintentos | Dos repeticiones por cada solicitud original devuelven su resultado: permanecen tres gastos, tres solicitudes y tres eventos de creación. Cambiar pagador con la misma solicitud produce conflicto. |
| Revocación | Perfil y permisos originales restaurados; asignación temporal finalizada. La misma solicitud se rechaza después de revocar y la pantalla muestra Página no disponible. |
| Conservación | Dieciséis conjuntos previos mantienen recuentos y huellas. Gasto anterior, ficha del trabajador y dos asignaciones anteriores intactos. El perfil registra las versiones de habilitación/retirada del ensayo. |
| Móvil | Emulación de 390 px, listado e historial; sin desbordamiento global. No acredita un dispositivo físico. |

No hubo nuevo pago, reembolso, copia contable ni datos de ADT incorporados.
Los resultados detallados, identificadores sintéticos, consultas y capturas se
conservan fuera de GitHub.

## Retorno y retención

`b9c36c2`, comprobada en esta sesión antes de publicar el ajuste de texto, comparte
el contrato 051 y se conserva como entrega anterior. No se ensayó un cambio de
vuelta tras la publicación final. Las versiones anteriores a 051 mantienen el
límite de altas explicado arriba. No revertir el esquema para volver de código.
Se renovó el inventario de versiones y procesos; permanecen entregas anteriores
pendientes de verificación/confirmación exacta de eliminación. No hubo borrados.
La carpeta `aaf268c` sigue conservada por decisión del propietario. La retención
general no se declara cerrada.

## Pendientes

Revisiones, reembolsos, correccion manual, archivo/restauracion, copia contable,
labor por jornada y las restantes acciones de los 21 modulos siguen abiertas.
No se importa ni sincroniza ADT y no se cambia la autoridad de produccion.
