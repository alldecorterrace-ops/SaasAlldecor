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

## Publicación y recorrido autenticado

Código publicado y activo en staging: **50e96d49225d7794ae754a1bb6c590a2ffc5a55e**.
[CI de esta entrega](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36265401457):
aplicación, concurrencia PostgreSQL y recuperación sintética aprobados.
Compilación local y en hosting completadas. La candidata reutiliza las mismas
dependencias y configuración de staging; no se aplicó ninguna migración SQL.

Se creó desde la interfaz una tercera empresa sintética, con el auditor como
propietario únicamente de ese nuevo espacio. Sus accesos anteriores se conservaron.
Se recorrió cliente → estimado de 200.50 → aprobación ficticia → factura/proyecto
→ registro administrativo simulado de 100.25. Todos los registros llevan notas de
prueba; no hubo dinero recibido, cobros, transferencias ni mensajes a clientes.

| Comprobación publicada | Resultado |
| --- | --- |
| Clasificación | Un cliente activo por pago parcial; un contacto, un cerrado, cierre 100%. |
| Tabla | Facturado y ticket muestran `$100`. |
| Detalle del punto | Conserva `$100.25`, nombre y ciudad acentuados. |
| Persistencia | Centro ficticio del ZIP guardado desde UI; al volver al mapa aparece un punto. |
| Descarga real | Archivo guardado mediante el enlace autenticado; sus 206 bytes coinciden exactamente con el caso esperado, especificado independientemente del serializador. |
| CSV | Once columnas; ciudad `Peña, "Árbol"`; valores `100.25` en ingresos y ticket; UTF-8 válido y comillas escapadas. |
| Cabeceras | 200, `text/csv; charset=utf-8`, attachment, `private, no-store`, nosniff y CSP sandbox. |
| Capas | Ocultar activos retira el punto; tabla y CSV siguen iguales. Capa restaurada al terminar. |
| Roles y empresas | El mismo usuario recibe 403 en la empresa anterior sin permisos del mapa y 403 en la empresa a la que no pertenece. Sin sesión: 401. |
| Móvil | Emulación CDP 390×844: viewport/cuerpo 390, mapa 350; tabla en contenedor desplazable. Se restableció el tamaño normal. No es prueba en teléfono físico. |
| Salud | Login, recuperación, salud de base y redirección de empresas pasan en staging y producción, ocho comprobaciones públicas. |

Huella SHA-256 del CSV ficticio descargado:
`8998ec6ca34f2fe1c88e648fa098aa1abcaa378a233b42a16489e6aeaabccea2`.
Capturas, archivo descargado, identificadores de prueba y resultados HTTP quedan
en la evidencia privada. La descarga previa a la publicación no se confunde con
estas nuevas comprobaciones de `50e96d4`.

## Hosting y límites

Activa `50e96d4`, anterior compatible `b4377d3`, dependencias compartidas
`b149bee`. El nuevo proceso de staging se comprobó. Producción conserva
`3c0c412`, su proceso y la huella de su configuración web. El cambio de staging
no tocó ese archivo ni requirió cerrar acceso. La compilación añadió 858 archivos
a la candidata, sin copiar las dependencias compartidas.

Quedaron identificadas como entregas adicionales `8d936f0`, `a8e1dd9`,
`4293666`, `7472d42`, `685b5da`, `f29072d` y `6866a73`.
No se borraron. Retirarlas requiere revisar contenido único y confirmar la lista
exacta; esta publicación no equivale a completar la limpieza del hosting.

Siguen abiertos el contraste visual con ADT actual, cartografía, el contrato
multibyte y los ensayos operativos del proveedor. La decisión sobre recorte de
etiquetas sin partir letras está consultada al propietario, pendiente de respuesta.
También se observó texto desactualizado en Dashboard («migración en curso»);
queda identificado para corregirlo según la suspensión vigente.
No están cerrados los 23 módulos ni los seis puntos.


## Contraste visual con ADT actual y entrega 7017873

El 26 de septiembre se recuperó una sesión autenticada del ADT original y se
abrió su Mapa de zonas en modo de lectura. Se observaron cinco indicadores,
cuatro capas, el filtro de fuera de área, exportación y tabla de siete columnas.
El mapa original cargó 20 de 20 teselas observadas de OpenStreetMap; esto acredita
la cartografía del origen, no la integración externa del SaaS.

El segmento JavaScript desde la definición de AdtMapaZonasModule hasta antes de
su asignación a window conserva el mismo contenido que la copia del 25 de
septiembre. SHA-256 de ese segmento:
`7eff387f2d13a3444a7276bb74d82149bd23b22c2fc4c33cd29b58e05c9540d9`.
Las cifras y fichas reales vistas no se copiaron al SaaS ni al repositorio.

La inspección de estilos efectivos confirmó tres colores del porcentaje de
cierre: verde desde 50%, ocre por encima de cero y por debajo de 50%, gris en cero.
Se copiaron las reglas exactas de la tabla, incluido número a la derecha, ZIP
en negrita, facturado con peso 800 y ticket gris. El Dashboard ahora indica que
la importación de nuevos datos está pausada, conforme a la decisión vigente.

Entrega publicada en staging: **7017873abcd804e5ddcd18125273145e36bdc98b**.
[CI](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36266425597)
aprobó aplicación, concurrencia y recuperación. Localmente pasaron lint, tipos,
328 pruebas y compilación; el hosting también compiló. No hubo cambios SQL.

La sesión real del auditor reabrió el mismo caso ficticio: las cinco columnas
numéricas quedaron alineadas a la derecha, cierre 100% verde/peso 700, importe
`$100`/peso 800 y ticket gris. La prueba publicada cubre el caso verde; las ramas
ocre y gris se contrastaron en ADT y en código, sin crear registros adicionales.
Se comprobó también el texto nuevo del Dashboard. No se repitió la descarga del
CSV ni toda la matriz de permisos de 50e96d4, cuyos componentes no cambiaron.

Durante la primera activación, el archivo de configuración web quedó con modo
0600 por la creación atómica bajo umask 077. LiteSpeed respondió 404. Se restauró
la entrega anterior y el modo original 0644, y se confirmó que volvió a servir.
La segunda activación preservó explícitamente ese modo antes del reemplazo y
funcionó. Los secretos continuaron con 0600 fuera de la raíz pública. El proceso
activo corresponde a 7017873; producción conservó proceso, entrega y huella de
configuración. La interrupción fue de staging; no acredita despliegue sin pausa.

Pasaron doce comprobaciones posteriores: login, recuperación, salud, redirección
de empresas y rechazo de dos rutas privadas, en staging y producción. Se
conservaron 50e96d4 para retorno y b149bee para dependencias. La revisión de
retención identificó además b4377d3 junto con las siete carpetas ya enumeradas;
no se borró ninguna. Continúan pendientes su revisión de contenido único y
confirmación exacta para retirar las que correspondan.

Este contraste cierra la ausencia de referencia visual actual de controles y
tabla. Siguen pendientes cartografía externa del SaaS, prueba operativa completa
del geocodificador y decisión sobre truncamiento multibyte. No se declara el
módulo completo. La revisión del siguiente bloque está en
[Configurador y motor](AUDITORIA-CONFIGURADOR-20260926.md).
