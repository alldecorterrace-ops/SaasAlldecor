# Estado de implementación — 17 de septiembre de 2026

## Disponible para auditar

Hay una primera implementación de 11 de los 23 módulos: Dashboard, Leads, Clientes, Productos, Estimados, Facturas, Proyectos, Gastos, Trabajadores, Actividad y Configuración. Esto no acredita paridad completa con ADT Admin.

- Autenticación con confirmación de correo, empresas y permisos de lectura/escritura por módulo.
- Clientes con búsqueda, edición, archivo/restauración, control de versiones y auditoría.
- Leads y conversión a cliente; productos con precios, reglas, opciones e imágenes privadas.
- Estimados con seis bases de cálculo, numeración, revisiones, impresión y aprobación administrativa que genera factura y proyecto en una transacción.
- Facturas con saldo, registro y reversión documentada de pagos, impresión, fechas y anulación sin borrar información. No procesa cargos bancarios.
- Proyectos con estados, fechas, notas y requisito de anticipo para avanzar a producción, instalación o completado.
- Trabajadores con ficha, tarifa, equipo y archivo. Crear la ficha no crea una cuenta de acceso.
- Gastos editables, incluidas fecha, importe y recibo privado; revisión administrativa, anulación con motivo e historial. Corregir datos financieros o recibo invalida la aprobación anterior.

Detalles: [Comercial](COMERCIAL.md), [Estimados](ESTIMADOS.md), [Finanzas y operaciones](FINANZAS-Y-OPERACIONES.md).

La aplicación se publicó en [saas.alldecorterrace.com](https://saas.alldecorterrace.com/login), sobre el hosting existente y fuera de la carpeta de ADT. HTTPS, pantalla de login y redirección de rutas privadas verificados. Véase [Alojamiento](ALOJAMIENTO.md).

## Evidencia y límites

Las migraciones 001–007 se aplicaron manualmente mediante SQL Editor. Las tablas operativas tienen RLS, sin lectura anónima ni escritura directa desde el rol authenticated. Las mutaciones validan permisos, empresa, versiones y referencias en funciones PostgreSQL. No se usa service_role en la aplicación.

71 comprobaciones automatizadas aprobaron en GitHub Actions para la entrega financiera y operativa. Cubren aislamiento, permisos, fórmulas, numeración, conflictos, duplicados, aprobaciones, pagos y recibos. La corrección 007 añade una comprobación dentro del ensayo de gastos: un miembro no puede cambiar el recibo de un gasto anulado.

El ensayo financiero y operativo en Supabase usó datos sintéticos y rol authenticated: aprobar estimado, reintento sin duplicación, registrar pago, verificar saldo, avanzar proyecto, revertir pago, anular factura, crear trabajador y corregir gasto aprobado. Finalizó con `FINANCE_OPERATIONS_PASS_ROLLED_BACK`, sin conservar registros de prueba. La consulta posterior confirmó RLS y ausencia de privilegios de escritura directa en las cinco tablas nuevas.

El propietario confirmó anteriormente el acceso remoto y creó empresas. **Los módulos nuevos todavía requieren un recorrido con una sesión autenticada de la aplicación en el navegador.** Una sesión administrativa de Supabase y los ensayos SQL no sustituyen esa prueba.

## Pendiente para completar el encargo

- Implementar Horas y solicitudes, Manual de fabricación, Permisos, Inventario, Mapa de zonas, Instalaciones, Portal del cliente, IA, Nuevo estimado 3D, Pérgola sin 3D, Estimados web y Precios.
- Completar la paridad de los módulos ya implementados: firmas, aceptación del cliente, documentos, ajustes de facturas, calendarios de anticipos e integraciones.
- Recuperación de contraseña, invitaciones, SMTP y notificaciones. El registro actual utiliza Supabase Auth y sus límites de correo.
- Pruebas autenticadas, observabilidad, entornos separados y ensayo de restauración.
- Exportar e importar los datos y archivos de ADT; conciliar referencias, cantidades e importes antes del corte.

El propietario eligió All Decor Terrace como destino de la migración. Se verificó su identificador sin confundirla con la empresa de piscinas. El inventario de tablas de ADT es de solo lectura y está fuera del repositorio público; **no constituye un respaldo de sus registros ni una migración completada**. No se han importado datos de ADT ni alterado sus registros.

Antes de utilizar Supabase CLI `db push`, reconciliar su historial con las siete migraciones aplicadas manualmente. No volver a ejecutar la migración inicial ni eliminar tablas para retirar una interfaz.
