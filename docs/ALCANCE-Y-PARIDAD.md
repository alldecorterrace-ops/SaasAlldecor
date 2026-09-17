# Alcance y paridad con ADT Admin

Fecha: 17 de septiembre de 2026.

## Resultado requerido por el propietario

Aplicación nueva para varias empresas, migración de los datos existentes y todos los módulos de ADT Admin activos y funcionales. La organización del trabajo en etapas sirve para respetar dependencias; no entrega una versión final con módulos omitidos.

Todos los módulos forman parte del alcance. Que un módulo esté implementado y disponible no concede acceso a todos los usuarios: cada administrador conserva la selección de permisos dentro de su empresa.

## Evidencia y límites

Se leyó el catálogo vigente `ADT_MODULES` desde el servidor, sin ejecutar la aplicación ni consultar registros de la base de datos. Se confirmaron **23 entradas**. También se encontraron siete directorios de módulos propios de Drupal y se extrajeron **116 definiciones de ruta**. Una ruta puede contener varias acciones; esta cifra no equivale a cobertura funcional.

Se comprobó la presencia de los archivos del panel, estimador y puente 3D. Los hashes y el inventario técnico se conservan localmente como evidencia, fuera del repositorio público.

Las pruebas siguientes son criterios iniciales por completar contra la interfaz actual. El SaaS dispone de una primera implementación de los 23 módulos. **Ningún módulo se declara todavía con paridad completa**; véase el [estado de implementación](ESTADO-IMPLEMENTACION.md) para distinguir funciones disponibles y pruebas pendientes.

## Matriz inicial

| ID de origen    | Módulo                | Criterio inicial de paridad                                                                                  |
| --------------- | --------------------- | ------------------------------------------------------------------------------------------------------------ |
| `dashboard`     | Dashboard             | Comparar indicadores, filtros y enlaces con ADT para la misma empresa y periodo.                             |
| `crm`           | Leads                 | Crear y editar leads; conservar estados, datos, historial y relaciones vigentes.                             |
| `clientes`      | Clientes              | Abrir el expediente completo; editar sus campos y conservar documentos y relaciones.                         |
| `nuevo3d`       | Nuevo estimado 3D     | Crear, guardar, reabrir y modificar un estimado 3D conservando geometría, medidas y cálculo.                 |
| `productos`     | Productos             | Consultar y modificar el catálogo según permisos; mantener referencias históricas.                           |
| `pergolamotor`  | Pérgola sin 3D        | Reproducir configuración, equipos de cocina, precios y guardado del estimado.                                |
| `estimadosweb`  | Estimados web         | Conservar entradas web, consulta, estados y acciones disponibles en ADT.                                     |
| `adm-precios`   | Precios               | Reproducir catálogo de precios y reglas de cálculo sin cambiar importes históricos.                          |
| `fin-estimados` | Estimados             | Conservar revisiones, documentos y transiciones vigentes del estimado.                                       |
| `fin-invoices`  | Invoices              | Conservar numeración, emisión, pagos, anulaciones, importes y saldos.                                        |
| `fin-proyectos` | Proyectos             | Conservar expediente, relaciones, estados y operaciones vigentes por proyecto.                               |
| `horasfix`      | Horas y solicitudes   | Reproducir marcaciones, solicitudes, correcciones, aprobaciones y periodos bloqueados.                       |
| `manualfab`     | Manual de fabricación | Conservar versiones, medidas, pasos, fotos y revisión asociados a cada obra.                                 |
| `permisos`      | Permisos              | Conservar permisos de obra, estados, documentos y acciones actuales.                                         |
| `inventario`    | Inventario            | Conservar existencias y reproducir las operaciones realmente disponibles; detallar el flujo antes de portar. |
| `gastos`        | Gastos                | Conservar recibos, fechas, fotos, correcciones, aprobaciones, rechazo e historial.                           |
| `trabajadores`  | Trabajadores          | Conservar identidad operativa, asignaciones y relaciones; separar trabajador de cuenta de acceso.            |
| `mapazonas`     | Mapa de zonas         | Reproducir las capas, filtros, permisos y operaciones presentes en ADT.                                      |
| `instalaciones` | Instalaciones         | Reproducir las vistas y operaciones actuales y sus vínculos con proyectos y trabajadores.                    |
| `portal`        | Portal del cliente    | Un cliente autorizado ve y realiza solo las operaciones de su expediente y empresa.                          |
| `ia`            | IA Assistant          | Inventariar tareas y proveedores actuales; probar autorización, errores y coste por empresa.                 |
| `activity`      | Actividad             | Conservar eventos anteriores y registrar acciones nuevas sin reescribir el historial.                        |
| `config`        | Configuración         | Cada administrador gestiona ajustes y permisos de su empresa; los 23 módulos siguen seleccionables.          |

## Dependencias complementarias incluidas en el análisis

Los directorios de CRM, estimados, Workforce, finanzas, costos, Plaid y correo existen en el servidor. Se deben seguir sus vínculos con contratos/firma, documentos, portal, reportes, conciliación, bancos, notificaciones y tareas programadas.

Campo y Workforce son aplicaciones diferentes: inventariar ambas antes de consolidar sus acciones y datos. La disponibilidad real de cada integración externa debe probarse por separado. Los pilotos locales, como tarjetas, requieren clasificación; su presencia en una carpeta no los convierte en funciones operativas de ADT.

## Cómo se cerrará cada módulo

1. Registrar pantalla, rol, acción, endpoint/servicio, datos, adjuntos y regla actual.
2. Implementar la acción con persistencia y permisos de empresa.
3. Verificar éxito, errores, reintentos y el caso de un usuario sin acceso.
4. Comparar resultados con ADT mediante fixtures y ejemplos autorizados.
5. Registrar evidencia de interfaz, API y base de datos; cerrar todas las diferencias explicadas.

Mostrar una entrada de menú o aprobar un build no acredita funcionalidad. Una prueba local tampoco acredita producción.

## Pendientes de inventario

Metadatos reales de la base, volúmenes, cantidades y tamaños de archivos, fuentes de autenticación, trabajos programados, configuraciones externas y recorrido autenticado de cada pantalla. El mapa técnico anterior del mismo día sirve de referencia, pero estos pendientes requieren verificación.
