# SaasAlldecor

Nueva aplicación SaaS para varias empresas, con migración de datos y paridad funcional completa con ADT Admin.

## Decisiones confirmadas

- Una base de código común para varias empresas, cada una con sus usuarios, permisos, datos y archivos.
- Migrar los datos de ADT Admin a una aplicación nueva.
- Incluir todos los módulos actuales de ADT Admin con sus funciones; el trabajo por dependencias no reduce el alcance final.
- Stack previsto: TypeScript, Next.js, Supabase/PostgreSQL, Tailwind CSS y shadcn/ui. Código e historial en GitHub. Alojamiento comercial por configurar.
- All Decor Terrace será la empresa inicial para el traslado de sus datos.

## Estado real

Primera base implementada: autenticación, empresas, permisos y clientes con creación, edición, búsqueda, archivo/restauración e historial. Los 23 módulos están registrados; **esto no significa que exista todavía paridad completa con ADT Admin**. Los módulos restantes muestran su estado pendiente.

Se contrastó el catálogo de 23 módulos y la presencia de siete módulos propios de Drupal mediante lectura del servidor el 17 de septiembre de 2026. Esa lectura no demuestra que todas sus acciones funcionen: falta completar la matriz con pruebas de navegador y datos de prueba.

La migración de estructura inicial está aplicada en Supabase: cinco tablas, RLS y 23 módulos. La aplicación local está configurada con la clave pública. Las pruebas PostgreSQL verifican aislamiento y permisos; falta completar el primer recorrido de navegador con una cuenta confirmada del propietario.

El destino de despliegue y la separación de entornos de pruebas/producción siguen pendientes. No se han trasladado datos, cambiado dominios ni modificado ADT en producción.

## Documentación

- [Estado, evidencia y próximos pasos](docs/ESTADO-IMPLEMENTACION.md)
- [Ejecución local y base de datos](docs/DESARROLLO.md)
- [Alcance y matriz inicial de paridad](docs/ALCANCE-Y-PARIDAD.md)
- [Arquitectura propuesta](docs/ARQUITECTURA.md)
- [Plan de migración y verificación](docs/MIGRACION.md)

Los datos reales, copias de seguridad, credenciales, recibos y documentos privados quedan fuera de GitHub. El repositorio era público al comenzar esta definición; su visibilidad deberá corresponder a la decisión del propietario antes de incorporar código privado del sistema anterior.
