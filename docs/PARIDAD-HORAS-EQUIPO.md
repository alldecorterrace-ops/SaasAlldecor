# Consulta de horas del equipo

Extiende el resumen de días con una ruta de consulta de Workforce. Usa los
permisos y el ámbito explícito de Equipo y obras, definido en el esquema 047:
Trabajador propio, Encargado propio y subordinados directos activos, Oficina
perfiles activos de su empresa y administrador trabajadores activos de su empresa.
El permiso Horas, la membresía vigente y la vinculación siguen siendo necesarios
para los perfiles no administrativos. Cambiar supervisor o retirar un perfil
retira su ámbito en la siguiente consulta.

La referencia local de ADT es `adt-workforce/drupal/adt_workforce/src/Service/ScopeService.php`
(SHA-256 `6a674ca3a98bf9949e5c26a20db8ee8f4d81541f37adefe644bdac780b777087`).
Define `visibleWorkerIds` con trabajador propio, encargado directo incluyendo
su perfil y oficina. La huella se comprobó al preparar esta entrega; no certifica
la versión actualmente desplegada del módulo PHP de ADT.

El controlador CRM capturado previamente distingue otro alcance recursivo para
su panel administrativo (`campoActorScope`) y excluye al propio encargado de
la lista de subordinados de `campoEncargado`. No se mezclan esas superficies:
esta consulta sigue el contrato Workforce explícito ya usado por Equipo y obras.
No afirma cerrar la paridad de esos dos recorridos de CRM ni la delegación de
marcaciones.

El esquema 077 añade `workforce_time_summary`, con una implementación privada
compartida con `time_summary`. Conserva el resumen personal y las reglas de
[cómputo, filtros y exportación](PARIDAD-HORAS-RESUMEN.md): tiempo neto,
fecha local de entrada, exclusión de anulados, días distintos, proyectos por
nombre, intervalos, paginación y CSV completo independiente de la página.

La respuesta solo entrega nombre e identificador de trabajador/proyecto y
tiempo agregado por día/proyecto. No devuelve identificadores de marcaciones,
notas, correos, tarifas, localizaciones, auditoría o solicitudes. La lectura
directa y los detalles de marcaciones conservan su RLS personal. Oficina y
Encargado no reciben permisos generales de administración ni permisos de
escritura sobre las horas de otro trabajador.

La página y el CSV seleccionan su RPC desde una ruta definida en el servidor;
el parámetro de usuario no elige funciones arbitrarias. Ambos comprueban sesión,
empresa y filtros, y el CSV mantiene `private, no-store` y protección de fórmulas.
Los enlaces aparecen en Horas, Equipo y obras y el resumen propio según el perfil.

`tests/workforce-time-summary.test.ts` verifica el ámbito por identidad,
subordinado directo frente a indirecto, oficina, perfil ausente/retirado,
trabajador inactivo, cambios de supervisor, revocación de permisos/membresía,
aislamiento de empresas y privacidad de detalles y auditoría. Reutiliza todos
los casos del cómputo compartido de `tests/time-summary.test.ts` y prueba el CSV
con la RPC de equipo. No cambia pagos, gastos, aprobaciones ni marcaciones.

Las pruebas locales y CI son evidencia de código. La sesión autenticada publicada
y el retorno operativo se registran en el acta privada al concluir. No equivalen
a prueba física de GPS, que permanece aplazada por instrucción del propietario.
