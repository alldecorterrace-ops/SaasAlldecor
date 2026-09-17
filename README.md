# SaasAlldecor

Nueva aplicación SaaS para varias empresas, con migración de datos y paridad funcional completa con ADT Admin.

## Decisiones confirmadas

- Una base de código común para varias empresas, cada una con sus usuarios, permisos, datos y archivos.
- Migrar los datos de ADT Admin a una aplicación nueva.
- Incluir todos los módulos actuales de ADT Admin con sus funciones; el trabajo por dependencias no reduce el alcance final.
- Stack previsto: TypeScript, Next.js, Supabase/PostgreSQL, Tailwind CSS y shadcn/ui. Código e historial en GitHub. Alojamiento comercial por configurar.
- All Decor Terrace será la empresa inicial para el traslado de sus datos.

## Estado real

Este repositorio comienza con la especificación del proyecto. **No contiene todavía una aplicación funcional ni una migración ejecutada.**

Se contrastó el catálogo de 23 módulos y la presencia de siete módulos propios de Drupal mediante lectura del servidor el 17 de septiembre de 2026. Esa lectura no demuestra que todas sus acciones funcionen: falta completar la matriz con pruebas de navegador y datos de prueba.

El proyecto Supabase `SaasAlldecor` fue identificado por el propietario y su acceso mediante el panel está verificado. El esquema `public` no tiene tablas. Esto confirma acceso al panel, no todavía conexión de la aplicación ni ejecución de migraciones.

El destino de despliegue y la separación de entornos de pruebas/producción siguen pendientes. No se han trasladado datos, cambiado dominios ni modificado ADT en producción.

## Documentación

- [Alcance y matriz inicial de paridad](docs/ALCANCE-Y-PARIDAD.md)
- [Arquitectura propuesta](docs/ARQUITECTURA.md)
- [Plan de migración y verificación](docs/MIGRACION.md)

Los datos reales, copias de seguridad, credenciales, recibos y documentos privados quedan fuera de GitHub. El repositorio era público al comenzar esta definición; su visibilidad deberá corresponder a la decisión del propietario antes de incorporar código privado del sistema anterior.
