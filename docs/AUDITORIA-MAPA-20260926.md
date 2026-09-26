# Mapa comercial: presentación y exportación — 26 de septiembre de 2026

La migración de datos sigue suspendida. Esta entrega no cambia producción,
esquema ni registros de negocio. ADT conserva la operación principal.

## Referencia y correcciones

Se contrastó el JSX de ADT capturado el 25 de septiembre, descrito en el
[contrato del mapa](PARIDAD-MAPA-20260925.md). La renovación de esa lectura por
SSH no estuvo disponible el día 26; no se presenta la copia como una nueva
lectura del origen.

- La tabla de ADT usa dólares sin decimales, mientras que sus ventanas de punto
  y el CSV conservan centavos. El SaaS ahora aplica ese formato solo a la tabla:
  100.25 se ve como `$100`, 1234.50 como `$1,235`. El ticket no positivo se
  representa con `-`. Los cálculos, documentos y CSV no se redondean de nuevo.
- Los marcadores de leads recuperan el amarillo `#E8C13B` del origen.
- La exportación usa la misma sesión del solicitante y la función SQL con sus
  permisos. Una excepción de lectura o cálculo produce 503 privado sin archivo;
  nunca una exportación vacía que parezca válida.

## Evidencia local

Lint, tipos, 328 pruebas y compilación pasan. Se añadieron pruebas de respuesta
HTTP para UTF-8, comillas, centavos, cabeceras, identidad ausente, identificador
inválido y fallos de lectura/cálculo. La prueba integrada usa las migraciones
reales en PGlite: lectura válida, rechazo de otra empresa, retiro individual de
cada permiso de origen y suspensión de membresía. PGlite no sustituye Supabase
remoto ni el inicio de sesión del navegador.

Los quince informes contra la referencia PHP anterior siguen coincidiendo.
El contenido CSV sintético incluye `Peña, "Árbol"` y conserva su codificación.

## Evidencia autenticada antes de publicar

Sobre staging `b4377d3`, la sesión real del auditor conserva el perfil de ventas:

| Petición | Resultado |
| --- | --- |
| Página del mapa sin permiso | 404, página no disponible, `private, no-store` |
| CSV con sesión pero sin permisos del mapa | 403, JSON genérico, sin archivo |
| CSV sin credenciales | 401, JSON genérico, sin archivo |
| CSV de otra empresa sintética | 403, JSON genérico, sin archivo |
| CSV con identificador inválido | 404, JSON genérico, sin archivo |

Las respuestas HTTP se leyeron desde el navegador con la sesión del usuario,
sin extraer cookies ni tokens. Las cuatro respuestas de CSV llevan
`private, no-store` y no llevan `Content-Disposition`.
El estimado de control sigue en revisión 3, total 306.95. No se guardó otra revisión.

## Diferencia multibyte pendiente

El origen recorta nombres a 60 bytes y ciudades a 40 mediante `substr`; el SaaS
actual recorta unidades UTF-16. Se reprodujo la operación de PHP en cPanel solo
con cadenas sintéticas, sin cargar Drupal ni consultar tablas:

- 31 letras `é`, límite 60: quedan 30 letras y JSON válido.
- 59 letras `a` y una `é`, límite 60: queda UTF-8 incompleto; `json_encode`
  devuelve false y error de codificación.
- 21 letras `ñ`, límite 40: quedan 20 letras y JSON válido.
- 39 letras `x` y una `ñ`, límite 40: UTF-8 incompleto y error de codificación.

Esto prueba la diferencia de la operación, no que haya un registro real que
dispare el fallo. No se cambió el contrato de truncamiento ni se replicó ese
fallo en el SaaS. Hace falta resolver explícitamente esta diferencia para cerrar
la paridad de texto extenso; no se marca como corregida.

## Pendiente

Publicar esta entrega y repetir presentación/descarga válida autenticadas.
Siguen abiertos el contraste visual con ADT actual, cartografía, el contrato
multibyte y los ensayos operativos del proveedor. No están cerrados los 23 módulos.
