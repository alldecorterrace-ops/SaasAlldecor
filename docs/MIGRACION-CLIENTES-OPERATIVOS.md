# Clientes editables desde el histórico

La migración 020 incorpora copias editables de clientes históricos activos y
válidos. Conserva los originales y enlaza ambas fichas dentro de la misma empresa.
Los clientes que ya existen no se reemplazan ni se fusionan automáticamente.

El plan compara nombre, correo y teléfono tanto entre los registros de origen
como con los clientes actuales. Normaliza espacios y mayúsculas para comparar;
en teléfonos elimina puntuación y el prefijo estadounidense cuando corresponde.
Una coincidencia no demuestra que sean la misma persona: requiere revisión.
Los datos inválidos y estados no activos también quedan pendientes.

Los administradores encuentran **Revisar migración** en Clientes. La pantalla
separa pendientes e incorporados, explica los motivos y permite abrir el original
y, cuando existe, su ficha editable. La revisión no modifica ni fusiona registros.
Resolver un pendiente exige contrastar los originales antes de definir la acción.

## Controles

- Plan privado con huellas del respaldo y de cada registro original.
- Importación administrativa atómica, sin RPC accesible desde la aplicación.
- Comparación exacta de los clientes actuales y bloqueo breve de escrituras durante
  la carga; cualquier cambio concurrente obliga a preparar de nuevo el plan.
- Segunda validación de duplicados y fidelidad de campos en PostgreSQL.
- Repetir el mismo plan no añade registros ni sobrescribe ediciones posteriores.
- Enlaces limitados por empresa, lectura por permiso de Clientes y originales
  privados fuera del alcance de usuarios de la aplicación.
- Proyectos, facturas y pagos no se activan mediante esta importación.

Las cantidades, identificadores y resultados privados no pertenecen al repositorio
público. Las pruebas sintéticas están en `tests/operational-customers.test.ts`.
La verificación local y de base no sustituye una prueba autenticada de pantalla.

La instalación anterior continúa operativa. Todavía hace falta conciliar cambios
posteriores al respaldo y resolver los pendientes antes de acordar el corte.

## Evidencia de publicación

El 18 de septiembre se aplicó la migración 020 y se publicó `3199cfe` en el
hosting de destino, con la entrega anterior y su configuración conservadas.
Pasaron 183 pruebas, lint, tipos y compilación local; también
[GitHub Actions](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/35377204542)
y la compilación del hosting.

El ensayo privado comprobó fidelidad de todos los campos, preservación de los
clientes existentes y repetición sin duplicados. En producción se comprobaron
los campos incorporados, los registros existentes, los permisos y el proceso
activo. Las comprobaciones HTTP de salud, acceso a clientes y protección de
documentos pasaron. No se ha probado todavía la nueva pantalla con sesión real:
el navegador controlado redirige al login.
