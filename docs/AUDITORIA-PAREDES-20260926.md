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

Estado previo a publicación: 346 pruebas, lint y tipos aprobados. La sección de
publicación se completará únicamente después de verificar la interfaz desplegada.

## Retorno y límites de cierre

Si falla el arranque o el recorrido sintético se retorna a la aplicación anterior
y se conservan los datos y el esquema aditivo. No se revierte 034 después de nuevas
escrituras, porque quitar su guarda permitiría que un formulario antiguo perdiera
paredes. El código anterior sirve de contingencia de lectura; para editar los
diseños nuevos es necesario volver a publicar el editor compatible.

Siguen pendientes varias estructuras, modelos/perfiles estructurales, equipos,
costos, márgenes, zona, condiciones, despiece y planos. Esta entrega no acredita
paridad completa del configurador ni autoriza importaciones o cambios en producción.
