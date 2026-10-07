# Identidad comercial por empresa y cierre de correo restringido

## Diferencia concreta y equivalencia

La referencia privada de `adt-invmail-current.js`, capturada el 2 de octubre,
incluye nombre comercial, descripción, contacto, sitio/licencia, instrucciones
de pago y pie del PDF/correo de Facturas. Esa referencia no se presenta como
una nueva lectura del origen del 7 de octubre. Los controladores CRM y costos
sí tienen lectura privada renovada, documentada en las actas anteriores.

El SaaS conservaba únicamente nombre y zona horaria de la empresa en sus
documentos. El contrato 088 incorpora nueve textos opcionales por empresa,
editables exclusivamente por Administración (owner/admin). No se copian los
datos de All Decor a otras empresas ni se rellenan campos sin confirmación.
La adaptación también aplica contacto/pie a Estimados; las instrucciones de
pago se usan solo en Facturas. No altera reglas, estados o importes de ADT.

## Contrato

- `commercial_profiles` es aditiva, con RLS, auditoría y revisión optimista.
  Lectura según permisos existentes de Estimados/Facturas. Sin escritura
  directa para authenticated; la RPC exige manager y confirmación explícita.
- Cada nuevo PDF captura empresa y versión del perfil. Cambiar el perfil
  después no reemplaza documentos conservados de ninguna revisión. Sin
  perfil, el snapshot mantiene su forma anterior y el renderizado anterior.
- Solo texto, campos limitados, correo válido y HTTPS sin credenciales.
  HTML escapado en MIME. No descarga de contenido remoto ni URL privilegiada.
- El correo comercial es contacto visible. No cambia destinatarios ni
  remitente técnico/envelope del hosting, permisos, abonos o precios.
- Mantiene confirmación de identidad/acreditación, conflicto PT409,
  borrador del formulario tras errores y bloqueo de perfiles restringidos.

## Prueba local

Siete casos pertinentes pasan: validación, confirmación/error/conflicto,
permisos y aislamiento, captura por revisión e inmutabilidad, ambos PDF/MIME,
cabeceras extensas y paginación. Los textos ficticios con `& <script>` se
conservan como texto, sin ejecución; los totales siguen siendo 100.10.
Se inspeccionaron PDF reales con pypdf/pypdfium2, incluido espaciado del
contacto/título y bloque final de Facturas. La comprobación local completa
pasa lint, tipos, 917 pruebas y compilación. El CI correspondiente al commit
2f73ee07565dbb64bab999c05d6d93cd972f25d0 pasa los tres jobs del run
[37672019313](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/37672019313),
con 917 pruebas. Entrega en [PR 18](https://github.com/alldecorterrace-ops/SaasAlldecor/pull/18).

## Correo de Estimados con perfil restringido comprobado

En la sesión existente de `auditor@saasalldecor.invalid`, miembro limitado de
la empresa ficticia QA SaaS A - 20260924, se capturó Enviar por email de
EST-2026-0007 revisión 2. Sin cambios de roles, permisos o credenciales.
El PDF es byte por byte el conservado el 5 de octubre. MIME: 22.887 bytes;
PDF: 13.808 bytes; total 357.90. Un destinatario ficticio, un adjunto PDF,
sin Bcc ni entrega al MTA. No se crea Factura ni Proyecto.

SQL nativo con identidad de sesión: siete rechazos de revisión/destinatario
incorrecto, empresa ajena, aprobación financiera, aviso/configuración web y
escritura de precios. Doce repeticiones devuelven la captura existente.
La sesión real muestra revisión histórica de solo lectura y sin correo ni
aprobación. No se presenta el GUC nativo como token JWT emitido.
Las 1.490 filas previas quedaron iguales; cuatro nuevas corresponden a
captura/auditoría/archivo privado. Evidencia y MIME permanecen fuera de GitHub.

## Límite vigente

Solo Gastos/costos y Comercial, staging ficticio. ADT continúa operativo.
IA, configuradores/3D, otros cuatro bloques, GPS físico, importaciones y
traspaso siguen fuera del trabajo. No activar proveedores de correo ni enviar
mensajes externos como parte de esta prueba.

## Publicación, sesión real y retorno comprobados

088 aplicada de forma aditiva: 94 tablas y 1.494 filas originales conservadas
exactamente, perfil inicialmente vacío. Ensayo nativo antes y después de
publicar: ocho rechazos, dos versiones, documentos anteriores y nuevos
congelados. El ensayo completo se revirtió; la primera ejecución también
dejó el esquema anterior intacto, comprobado por las 94 huellas completas.

En la sesión owner existente de la empresa ficticia QA Mapa Presentacion:

- Formulario rechaza HTTP y conserva los nueve campos al fallar. Guarda el
  perfil 1 con confirmación; una modificación posterior produce perfil 2.
- EST-2026-0018: Pendiente, revisión 1, total 100.10; calendario conservado
  10.01 / 50.05 / 30.03 / 10.01. No aprobación, Factura o Proyecto nuevos.
- INV-2026-0005 existente: total/saldo 416.20, pagado 0.00, sin cambiar sus
  campos financieros. Solo se genera su PDF y mensaje de prueba.
- Ambos PDF capturan perfil 1 y sus dos MIME contienen exactamente el mismo
  archivo, un destinatario ficticio, sin Cc/Bcc ni envío externo. Contacto,
  licencia ficticia, pie y HTML escapado comprobados; instrucciones solo en
  Facturas. Renderizado e inspección de ambas páginas de los documentos.
- Cambiar el perfil a versión 2 conserva los bytes de ambos PDF y el PDF
  anterior EST-2026-0017. El PDF de la empresa restringida EST-2026-0007
  sigue idéntico y sin los datos de la empresa administradora.
- La sesión member de la segunda empresa no ofrece configuración, Facturas
  ni aprobación financiera. Acceso directo a documentos/empresa responde
  Página no disponible. Sin cambios de roles, permisos o credenciales.

Preservación posterior: 1.493 de las 1.494 filas anteriores exactamente
iguales; única modificación esperada, contador QA EST 2026 de 17 a 18.
Veintidós filas nuevas de ensayo (perfil/auditoría/estimado/revisión/2 PDF/
2 capturas/4 archivos privados); 95 tablas, 1.516 filas. Facturas existentes,
pagos, proyectos, costos, clientes, fichas, precios y membresías idénticos.
Las descargas y el retorno tampoco cambian esas 1.516 filas.

Hosting: archivo exacto 2f73ee0 verificado contra 16 hashes de fuente,
compilación del hosting y ruta de identidad presentes. Retorno real
2f73ee0 → 676a658 → 2f73ee0, proceso/grupo correspondiente comprobado en
cada fase; ambos PDF nuevos idénticos en regreso y entrega final. Grupo final
saas-staging-2f73ee0-20261007-final-r1; health staging y producción 200.
Entorno/lockfile/dependencias compartidas y configuración de producción
conservados. Correo externo y proveedores IA siguen desactivados.
Inventario: 65 entregas, 11 protegidas por la entrega/retorno/dependencias y
54 a revisar; cero eliminaciones. Evidencia privada fuera del repositorio.

No hay un faltante de implementación identificado en esta acción. Configurar
identidad real, activar operación o importar negocio requiere la decisión
separada del propietario y queda fuera de esta prueba ficticia.
