# SaasAlldecor

Nueva aplicación SaaS para varias empresas, con migración de datos y paridad funcional completa con ADT Admin.

## Decisiones confirmadas

- Una base de código común para varias empresas, cada una con sus usuarios, permisos, datos y archivos.
- Migrar los datos de ADT Admin a una aplicación nueva.
- Incluir todos los módulos actuales de ADT Admin con sus funciones; el trabajo por dependencias no reduce el alcance final.
- Stack: TypeScript, Next.js, Supabase/PostgreSQL, Tailwind CSS y componentes basados en shadcn/ui. Código e historial en GitHub; aplicación alojada en el hosting existente.
- All Decor Terrace será la empresa inicial para el traslado de sus datos.

## Estado real

Primera implementación de 11 módulos: Dashboard, Leads, Clientes, Productos, Estimados, Facturas, Proyectos, Gastos, Trabajadores, Actividad y Configuración. Incluye autenticación, empresas, permisos, documentos con revisiones, pagos externos registrados y recibos privados. Los 23 módulos están registrados; **esto no significa que exista todavía paridad completa con ADT Admin**. Los módulos restantes muestran su estado pendiente.

Se contrastó el catálogo de 23 módulos y la presencia de siete módulos propios de Drupal mediante lectura del servidor el 17 de septiembre de 2026. Esa lectura no demuestra que todas sus acciones funcionen: falta completar la matriz con pruebas de navegador y datos de prueba.

La estructura inicial y las ampliaciones comerciales están versionadas en Supabase SQL. La aplicación usa la clave pública y el usuario autenticado. El propietario confirmó el acceso remoto y creó empresas. Las pruebas PostgreSQL verifican aislamiento, permisos y conversión; los módulos comerciales nuevos aún requieren el recorrido autenticado completo de navegador.

La aplicación está publicada en [saas.alldecorterrace.com](https://saas.alldecorterrace.com/login), en un subdominio nuevo y una carpeta separada del hosting existente. No depende de un túnel local. La separación de entornos sigue pendiente. No se han trasladado datos ni modificado los registros de ADT.

## Documentación

- [Estado, evidencia y próximos pasos](docs/ESTADO-IMPLEMENTACION.md)
- [Leads, Productos y Actividad](docs/COMERCIAL.md)
- [Estimados: funciones y validación](docs/ESTIMADOS.md)
- [Facturas, proyectos, pagos, trabajadores y gastos](docs/FINANZAS-Y-OPERACIONES.md)
- [Publicación permanente y operación](docs/ALOJAMIENTO.md)
- [Ejecución local y base de datos](docs/DESARROLLO.md)
- [Alcance y matriz inicial de paridad](docs/ALCANCE-Y-PARIDAD.md)
- [Arquitectura propuesta](docs/ARQUITECTURA.md)
- [Plan de migración y verificación](docs/MIGRACION.md)

Los datos reales, copias de seguridad, credenciales, recibos y documentos privados quedan fuera de GitHub. El repositorio era público al comenzar esta definición; su visibilidad deberá corresponder a la decisión del propietario antes de incorporar código privado del sistema anterior.
