# Estado de implementación — 18 de septiembre de 2026

## Los 23 módulos tienen una primera implementación

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
- Migraciones 001–016 aplicadas manualmente en SQL Editor. No usar `supabase db push` sin reconciliar antes ese historial.
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
- Quedan integraciones, notificaciones de negocio, pruebas de carga, monitoreo y staging. El propietario confirmó que la recuperación de contraseña funciona. Las invitaciones internas tienen creación, aceptación, rechazo, vencimiento y revocación; el propietario confirmó la aceptación con la segunda cuenta y se corroboró en Supabase. Se implementó el aviso automático con registro de intentos; su recepción real necesita evidencia separada. Véase [Invitaciones](INVITACIONES.md). Se restauró una copia MySQL del origen; falta ensayar la restauración de PostgreSQL y objetos del SaaS.
- Falta trasladar y conciliar registros y archivos históricos de ADT, incluidas solicitudes web y referencias de trabajadores. Solo se importaron las diez tarifas indicadas; no se migraron clientes, facturas, horas ni archivos. ADT sigue siendo la fuente vigente.

## Recorrido recomendado de auditoría

1. Revisar Precios y su historial en All Decor Terrace.
2. Crear cliente y diseño, guardar, reabrir, cambiar medidas y generar un estimado.
3. Publicar propuesta web, abrir su enlace en otra sesión, responder y revocar.
4. Aprobar internamente el estimado, registrar un pago externo de prueba y revisar factura/proyecto. No usar pagos reales como prueba.
5. Crear permiso, manual, instalación y movimientos de inventario; revisar conflictos e historial.
6. Vincular un trabajador, registrar horas, solicitar corrección y cerrar una semana revisada.
7. Verificar que el portal no muestra otros clientes y que un usuario de permisos limitados tampoco obtiene otros módulos mediante IA.
8. Repetir el aislamiento en la segunda empresa y conciliar diferencias con ADT antes de migrar registros.
