# Estado de implementación — 17 de septiembre de 2026

## Primera entrega

- Next.js, TypeScript, Tailwind CSS y componentes base siguiendo shadcn/ui (Radix y CVA).
- Registro con confirmación de correo, inicio y cierre de sesión mediante Supabase Auth.
- Creación y selección de empresas. Acceso validado en servidor y PostgreSQL.
- Roles propietario, administrador y miembro; selección de lectura/escritura para los 23 módulos. Incorporación por correo de usuarios ya registrados y confirmados; todavía no envía invitaciones.
- Clientes: búsqueda por nombre, paginación, creación, edición, archivo y restauración. Conflictos de edición detectados por versión y auditoría de cambios.
- Dashboard inicial con conteo real de clientes y configuración básica de empresa.

## Evidencia y límites

La migración SQL se ejecutó en una transacción sobre el esquema public vacío del proyecto elegido. Una consulta posterior confirmó cinco tablas, RLS en todas, 23 módulos, cero empresas y cero clientes. El rol anónimo no puede leer clientes ni crear empresas; usuarios autenticados tampoco tienen UPDATE directo de clientes.

Las pruebas automatizadas ejecutan PostgreSQL mediante PGlite, con usuarios y roles sintéticos: aislamiento de empresas, denegación anónima, permisos, suspensión, protección de propietario, conflictos de edición, archivo/restauración y auditoría. También hay pruebas del catálogo y validación de entrada. No usan datos de ADT.

La compilación, lint y TypeScript se verifican localmente y quedan configurados en GitHub Actions. El navegador local muestra el acceso; las rutas privadas redirigen a login sin sesión. **Falta validar con una cuenta real confirmada el recorrido completo: registro, empresa, cliente y permisos.** El propietario crea su propia contraseña en la pantalla de registro.

La aplicación utiliza la clave publicable y el JWT del usuario; no necesita una clave service_role. Las mutaciones pasan por funciones PostgreSQL con validación de membresía/permisos, search_path fijo y privilegios limitados. Los cambios auditados no se borran desde la aplicación.

## Pendiente

- Completar la matriz de paridad de cada módulo y sus recorridos reales. Dashboard, Clientes y Configuración tienen una base inicial, no paridad completa.
- CRM, estimados, facturas, proyectos, horas, fabricación, inventario, gastos, trabajadores, mapas, instalaciones, portal, IA y demás módulos de la matriz.
- Adjuntos privados, documentos, recuperación de contraseña, invitaciones, integración de correo, integraciones por empresa y tareas programadas.
- Separación de entornos, despliegue comercial, dominio, observabilidad, copias y restauración.
- Exportación de ADT, mapeo, ensayo de migración, conciliación y corte. No se han importado registros ni archivos ni modificado ADT.

La estructura se aplicó manualmente en SQL Editor. El archivo de migración está versionado, pero **no se registró en el historial de Supabase CLI**. Reconciliar ese historial antes de usar db push; no volver a ejecutar la migración inicial sobre este proyecto.

Vercel todavía no tiene un despliegue de esta aplicación. La elección de un plan compatible con uso comercial sigue pendiente; no se ha contratado ningún servicio.
