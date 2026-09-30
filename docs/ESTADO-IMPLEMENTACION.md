# Estado de implementación — 22 de septiembre de 2026

**Entrega del 30 de septiembre: c75cfdc, esquema 048, solo staging.**
Gastos de Workforce con recibo privado, primera decisión de encargado y segunda
de oficina publicados y comprobados. Envío/descarga idéntica, reapertura,
historial, errores con borrador conservado, móvil emulado y revocación verificados.
Diez pruebas específicas y los tres trabajos de CI correctos, con concurrencia
real en PostgreSQL 17 y suite completa. Catorce conjuntos previos preservados;
permisos temporales restaurados. Un gasto ficticio aprobado, sin pago ni copia
contable. [Evidencia y límites](GASTOS-WORKFORCE-20260930.md).

Quedan revisión IA/humana, reembolso y origen del pago, copia contable sin duplicar,
edición/archivo, Labor automática y demás recorridos de Workforce. La consulta
por fases y esta entrega no cierran la paridad de Trabajadores/Horas ni los
[21 módulos activos](CIERRE-FUNCIONAL.md). ADT sigue principal; migración y traspaso
suspendidos, configuradores y 3D excluidos. Recuperación real conserva sus pendientes.

**Auditoría previa del 30 de septiembre:** la consulta de equipo y obras de
Trabajador, Encargado y Oficina se comprobó con una sesión real por fases,
escritorio y móvil emulado. Revocación de perfil, asignación y módulo, aislamiento
y conservación de catorce conjuntos previos comprobados; 10 pruebas locales
específicas y ocho controles públicos correctos. Los permisos temporales se
restauraron. No hubo nueva entrega de aplicación ni cambios de producción.
En esa fase quedaban pendientes recibos, decisiones y demás escrituras.
La entrega posterior descrita arriba cierra únicamente recibos y doble decisión. [Evidencia y límites](AUDITORIA-ROLES-WORKFORCE-20260930.md).


**Entrega anterior de staging, 29 de septiembre: 80adf3d, esquema 047.**
Base de equipo de Workforce publicada: perfiles, encargado directo, asignaciones
con periodo, finalización e historial. 440 pruebas, lint, tipos, compilación y
los tres trabajos de CI correctos, incluida concurrencia en PostgreSQL 17.
Interfaz de propietario probada con datos sintéticos: guardar/reabrir, rechazo de
solapamiento, finalizar en móvil emulado, historial, consulta y acceso restringido.
Once tablas previas conservaron recuentos y huellas exactos.
[Evidencia y límites](AUDITORIA-EQUIPO-WORKFORCE-20260929.md).

Retorno real a 3c567f9 y vuelta a 80adf3d: gastos/totales, disponibilidad y nueva
asignación preservados. Ensayo de lectura, sin afirmar todas las escrituras.
Se eliminaron solo b69a5c5 y su comprimido, autorizados expresamente: 283 MiB y
1.464 entradas liberadas. Se conservaron aaf268c y su archivo, las dependencias
y las versiones necesarias; no hubo otra eliminación ni contratación.

Tras esa entrega quedaban pendientes los recorridos reales y recibos/decisiones,
parcialmente cubiertos por las auditorías del 30 de septiembre. Reembolso, Labor
automática, reversión contable y el resto del alcance activo siguen abiertos.
La base nueva no cambia las acciones existentes de Horas/Gastos ni cierra la paridad.
Nuevas migraciones de datos ADT y traspaso siguen suspendidos. ADT y producción SaaS
no se modificaron. Recuperación operativa y retención general conservan sus pendientes.


Prioridad actualizada el 25 de septiembre: verificar y completar equivalencia
funcional con ADT en staging. Nuevas migraciones de datos y traspaso aplazados
hasta petición expresa. El contenido siguiente conserva evidencia histórica;
las auditorías recientes y su estado están en [el seguimiento](EJECUCION-SEIS-PASOS.md).

**Alcance vigente desde el 29 de septiembre:** 21 módulos; configuradores y 3D
excluidos por decisión del propietario. Geometría, despiece y planos automáticos
no bloquean el cierre. Este documento conserva la evidencia histórica; consultar
[el alcance activo](CIERRE-FUNCIONAL.md). El expediente comercial de Clientes está publicado en staging 9598d35: [resultados del 29 de septiembre](AUDITORIA-CLIENTES-20260929.md), con 356 pruebas y recorridos autenticados de consulta y permisos.

## Los 23 módulos originales tienen una primera implementación

Cada entrada del catálogo abre una pantalla con operaciones y persistencia. **Esto no acredita paridad completa con ADT Admin ni una migración terminada.** El alcance y las diferencias están documentados para auditar cada flujo.

| Grupo | Módulos |
| --- | --- |
| General y administración | Dashboard, Actividad, Configuración |
| Comercial | Leads, Clientes, Productos, Estimados |
| Finanzas y personal | Facturas, Proyectos, Gastos, Trabajadores |
| Operaciones | Permisos, Inventario, Instalaciones, Manual de fabricación, Mapa de zonas, Horas y solicitudes |
| Nuevas funciones comerciales | Precios, Pérgola sin 3D, Nuevo estimado 3D, Estimados web, Portal del cliente, IA Assistant |

Documentación: [Comercial](COMERCIAL.md), [Estimados](ESTIMADOS.md), [Finanzas](FINANZAS-Y-OPERACIONES.md), [Operaciones y horas](OPERACIONES-Y-HORAS.md), [Diseños, portal e IA](DISENOS-PORTAL-IA.md).

## Evidencia

- Código de los seis módulos finales: `72267e8`. [GitHub Actions](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/35284534911) completó lint, tipos, 97 comprobaciones y build correctamente.
- Migraciones 001–025 aplicadas manualmente en SQL Editor según las evidencias de publicación. La 026 está preparada para ensayo aislado y no aplicada a producción. No usar `supabase db push` sin reconciliar antes el historial manual.
- Las siete tablas de esta ampliación tienen RLS y carecen de lectura anónima y escritura directa del rol authenticated. Las funciones públicas de enlaces y formularios validan su alcance antes de devolver o registrar datos.
- Ensayo real: diseño → estimado → enlace → aceptación anónima con token → solicitud web → lead → revocación, y comprobación de cuota de IA. Terminó con `COMPLETION_SMOKE_PASS_ROLLED_BACK` y cero empresas sintéticas persistidas. No generó facturas a partir de una aceptación pública.
- Ensayos anteriores comprobaron finanzas, recibos, inventario, horarios, solicitudes y cierre semanal, también con ROLLBACK.
- OpenAI respondió desde el servidor con HTTP 200 y `gpt-4o-mini-2024-07-18`. Esa prueba mínima no usó datos de clientes.
- Se copiaron diez tarifas de venta vigentes desde ADT a All Decor Terrace, sin sobrescribir un libro existente. La configuración de IA de esa empresa quedó activa con límite de 20 intentos por 24 horas. La otra empresa no recibió estas configuraciones.
- Las tarifas reales y credenciales están fuera de GitHub. La clave de IA permanece en el entorno privado del servidor. Las consultas pueden generar consumo en la cuenta API existente.

El propietario confirmó previamente el acceso remoto y creó empresas. **Los nuevos flujos todavía requieren un recorrido con una sesión autenticada de la aplicación en navegador.** La sesión de Supabase, las pruebas SQL y la respuesta del proveedor IA no sustituyen ese recorrido.

La aplicación usa el [dominio permanente](https://app.alldecorpatio.com/login) sobre el segundo hosting del propietario. Las entregas se compilan fuera de la carpeta activa y conservan la versión anterior. Véase [Alojamiento](ALOJAMIENTO.md) y el [seguimiento de los seis pasos](EJECUCION-SEIS-PASOS.md).

La publicación `72267e8` se comprobó mediante la raíz del proceso activo, HTTP y navegador: páginas públicas disponibles, rutas privadas dirigidas al login y código privado inválido rechazado. No se accedió a los módulos con la sesión del propietario en esta comprobación.

## Diferencias que siguen abiertas

- El visor 3D es conceptual y rectangular: faltan geometría avanzada, equipos dentro del diseño, despiece y planos del configurador anterior. Precios incorpora tarifas de venta, no todo el catálogo de costos y márgenes.
- Zonas es esquemático: faltan calles, rutas y GPS de marcaciones. Horas no incluye nómina, horas extra, auto-cierre ni recordatorios.
- Portal muestra proyectos y saldos; faltan documentos, fotos, mensajes y cobros en línea. La aceptación por enlace no equivale a firma certificada.
- IA admite preguntas independientes sobre un resumen agregado autorizado. Faltan conversación persistente, archivos, imágenes y herramientas de acción.
- Quedan integraciones, notificaciones de negocio, pruebas de carga, monitoreo y staging. El propietario confirmó que la recuperación de contraseña funciona. Las invitaciones internas tienen creación, aceptación, rechazo, vencimiento y revocación; el propietario confirmó la aceptación con la segunda cuenta y se corroboró en Supabase. Se publicó el aviso automático con registro de intentos. El propietario confirmó un correo técnico en Recibidos; queda el recorrido de creación y aviso de una invitación nueva desde la pantalla autenticada. Véase [Invitaciones](INVITACIONES.md). Se restauró una copia MySQL del origen; falta ensayar la restauración de PostgreSQL y objetos del SaaS.
- La migración es parcial: ya se publicaron el histórico, documentos privados y lotes operativos de clientes, proyectos, estimados, facturas y pagos. Faltan entidades, referencias, archivos y el delta del origen; las excepciones siguen abiertas. ADT sigue siendo la fuente vigente. Véase [Migración](MIGRACION.md).
- La entrega de infraestructura del 22 de septiembre añade guardas de staging, herramientas de verificación de copias/retención, monitor externo y una cola duradera desactivada. No acredita por sí misma respaldo, restauración, paridad ni traspaso. [Estado de los seis puntos](EJECUCION-SEIS-PASOS.md).

## Recorrido recomendado de auditoría

1. Revisar Precios y su historial en All Decor Terrace.
2. Crear cliente y diseño, guardar, reabrir, cambiar medidas y generar un estimado.
3. Publicar propuesta web, abrir su enlace en otra sesión, responder y revocar.
4. Aprobar internamente el estimado, registrar un pago externo de prueba y revisar factura/proyecto. No usar pagos reales como prueba.
5. Crear permiso, manual, instalación y movimientos de inventario; revisar conflictos e historial.
6. Vincular un trabajador, registrar horas, solicitar corrección y cerrar una semana revisada.
7. Verificar que el portal no muestra otros clientes y que un usuario de permisos limitados tampoco obtiene otros módulos mediante IA.
8. Repetir el aislamiento en la segunda empresa y conciliar diferencias con ADT antes de migrar registros.
