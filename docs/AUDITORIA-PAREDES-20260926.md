# Paredes independientes y pérgola opcional

Referencia: ADT `/adt/pergola.php`, leído el 26 de septiembre de 2026, sin guardar
ni enviar. JavaScript de la página conservado privado; SHA-256:
`93b46084c93cd18ca538f419f4f62230f615af7e905f5308e5bb610a4a6be865`.

## Contrato comprobado del origen

- Paredes independientes con largo, alto, modelo y color libre. Pueden existir
  sin pérgola y su altura no está vinculada a la de una estructura.
- Modelos: panel económico, composite imitación madera, aluminio y panel sólido
  3×1. Las tarifas ausentes o cero usan respectivamente 25, 30, 30 y 30 USD/ft²,
  conforme a `tarifaPared`. No se copiaron tarifas privadas del propietario.
- Se suma área por tarifa de cada pared y se redondea el conjunto una vez. El
  documento agrupa las paredes en una partida y conserva el detalle individual.
- El permiso utiliza solamente el área de las estructuras. Sin estructuras su
  área es cero; si está habilitado, corresponde el importe fijo.

## Implementación

La interfaz de Pérgola sin 3D permite agregar y quitar paredes, elegir sus cuatro
modelos, conservar sus colores y activar/desactivar la pérgola. Se extienden las
tarifas para aluminio y sólido 3×1. El editor 3D existente conserva su interfaz y
geometría: las paredes independientes de ese editor todavía no se declaran listas.

La migración aditiva 034 reemplaza `save_design` y `save_price_book`, sin reescribir
filas. El contrato anterior de una pared conserva su cálculo y validación. El
formulario nuevo puede leer esa pared y guardarla como una nueva revisión; los
clientes antiguos no pueden sobrescribir diseños que ya contienen paredes
independientes. Las tarifas nuevas omitidas por un cliente antiguo conservan su
valor guardado. La tarifa efectiva de una pared queda capturada en el diseño.

El cálculo, normalización y autorización se realizan en PostgreSQL. Totales y
campos desconocidos enviados por el navegador se descartan. Se conservan revisión
esperada, idempotencia de conversión y aislamiento entre empresas. El límite de
esta entrega es 10 paredes, dimensiones de 0–200 ft y color de hasta 80 caracteres;
son límites explícitos del SaaS, no límites constatados en ADT.

## Evidencia local

Se extrajeron y ejecutaron aisladamente las funciones de tarifa y suma del origen,
con entradas ficticias y sin red. Los resultados independientes fueron:

| Caso | Resultado |
| --- | --- |
| Cuatro paredes: 24×3 + 6×4 + 6×5 + 1×6 | 132.00 |
| Dos paredes de 0.002 ft² a 3 por ft² | 0.01 (redondeo conjunto) |
| Mismas cuatro paredes con tarifa cero | 990.00 (valores de reserva del origen) |

Pruebas PostgreSQL: ambos tipos de diseño aceptan el contrato nuevo; el flujo de
interfaz de esta entrega es Pérgola sin 3D. Se comprobaron conversión persistida,
reintento, permiso fijo sin estructura, altura independiente, entradas inválidas,
rechazo sin escritura parcial, permisos, otra empresa, cambio explícito de tarifas,
clientes antiguos, revisiones y conservación de filas/privilegios al reaplicar 034.

Lint, tipos, 346 pruebas y compilación aprobados. Los tres trabajos del
[CI del commit exacto](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36269158272)
terminaron correctamente. Los ensayos de backup y cola no acreditan por sí solos
recuperación ni traspaso operativo.

## Publicación y recorrido real en staging

Entrega **2a1e325b24f38452c87bf33018082f189abb5200**, compilada en el hosting
con un trabajador y dependencias compartidas comprobadas. Esquema 034 aplicado
solo a SaasAlldecor-Staging. La transacción comprobó identidad del entorno,
contenido de las 33 migraciones previas, cuerpos de las funciones y huellas de
diseños, tarifas, estimados, facturas, pagos y auditoría. Conservó filas, OID,
propietario, privilegios y configuración de las funciones. Resultado: 34 migraciones.

SHA-256 de 034 normalizado a LF:
f5d2cd759f57f93e5ec9689571743349707c796ff6bca6f557e12b5d2b9d7b04.

Con la sesión del auditor, propietario de una empresa exclusivamente sintética:

- Precios guardó versión 2: tarifas de pared 3, 4, 5 y 6; las otras tarifas
  ficticias permanecieron iguales. Los diseños anteriores conservaron su captura.
- Un formulario nuevo comienza sin pérgola. Se agregaron cuatro paredes con
  medidas, modelos y colores distintos; la primera mide 12 ft de alto.
- Altura 201 ft rechazada por el servidor: cero diseños parciales y los campos
  permanecieron en pantalla. Tras corregirla a 1 ft se guardó revisión 1.
- Guardado, reapertura, conversión y documento: paredes 132 + permiso 100 = 232.
  El documento contiene los cuatro detalles y una sola partida fija de paredes.
- Repetir la conversión abrió el mismo estimado. Activar pérgola de 11 × 1 ft
  produjo revisión 2 y un segundo estimado de 254; el anterior mantuvo 232.
- Quitar la cuarta pared, guardar y reabrir dejó revisión 3, tres paredes y 248.
  La consulta persistida mantuvo ambos estimados como borradores, sin alterarlos.
- El formulario en viewport móvil emulado de 390 × 844 tuvo ancho de documento
  de 390 px y campos de pared de 266 px. No es prueba en teléfono físico.
- El control 3D se reabrió con su interfaz anterior, revisión 1 y total 147.
  Los controles de diseños de 77 y 122 y estimado de otra empresa de 306.95
  conservaron versiones e importes. Solo existen los dos nuevos estimados previstos.

Proceso activo y raíz de staging comprobados; retorno de lectura 7017873 y
dependencias b149bee conservados. Producción sigue en 3c0c412, con el mismo proceso
y huella de configuración. Ocho comprobaciones HTTP de ambos entornos pasaron.
No hubo nuevas importaciones, aprobaciones, facturas, pagos ni envíos.

Capturas, identificadores y resultados detallados permanecen en evidencia privada.
No se eliminó ninguna entrega antigua; el inventario de retención sigue pendiente.

## Retorno y límites de cierre

Si falla el arranque o el recorrido sintético se retorna a la aplicación anterior
y se conservan los datos y el esquema aditivo. No se revierte 034 después de nuevas
escrituras, porque quitar su guarda permitiría que un formulario antiguo perdiera
paredes. El código anterior sirve de contingencia de lectura; para editar los
diseños nuevos es necesario volver a publicar el editor compatible.

Siguen pendientes varias estructuras, modelos/perfiles estructurales, equipos,
costos, márgenes, zona, condiciones, despiece y planos. Esta entrega no acredita
paridad completa del configurador ni autoriza importaciones o cambios en producción.
