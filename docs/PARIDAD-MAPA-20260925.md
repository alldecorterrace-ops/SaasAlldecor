# Contrato funcional del Mapa de zonas — 25 de septiembre de 2026

La prioridad vigente es paridad funcional. No se trasladaron datos de ADT;
las nuevas importaciones y sincronizaciones quedan suspendidas hasta petición
expresa del propietario. ADT conserva la operación principal.

## Referencia comprobada

Se leyeron mediante SSH con verificación estricta del servidor los archivos
actuales del controlador y del módulo de mapa. No se consultaron tablas reales,
no se inició Drupal y no se ejecutaron acciones de negocio. Las copias de código
del origen permanecen privadas. La huella del controlador es
`6da7688e6ec9a2cf863d40cb1f1348ccf0036cad5cb988b5725234d8fb4e08a9`.

Los métodos `mapaZip`, `mapaEnArea`, `mapaJitter` y `mapaZonas` se ejecutaron con
PHP y dobles en memoria de consultas y respuesta HTTP. Recibieron únicamente
los casos ficticios de `tests/fixtures/zone-parity-input.json`. La salida de esa
ejecución, independiente de la nueva implementación, produjo las huellas de
referencia. La prueba TypeScript compara el informe completo normalizando solo
el orden de claves, sin redondear ni omitir valores para hacerlo coincidir.

## Reglas observadas y conservadas

| Acción o cálculo | Comportamiento de ADT |
| --- | --- |
| Clasificar clientes | Sin pagos positivos: estimado. Con pago positivo y saldo de esa factura: activo. Si todas las facturas con pago positivo están saldadas: terminado. Un activo prevalece sobre terminado. No usa el estado de ejecución del proyecto. |
| Importes | Suma `paid_amount` de facturas no anuladas. La interfaz lo llama «Facturado» y el CSV «Ingresos», aunque corresponde a pagos recibidos. No se cambió esa definición durante esta comparación. |
| Fichas separadas | Todos los clientes contribuyen por separado, incluso si comparten correo o teléfono. No fusiona fichas. |
| Leads | Parte de las entradas del formulario web de ADT, no del listado general de leads manuales. Excluye `FUERA_AREA` y los que coinciden con un cliente por correo normalizado o los últimos diez dígitos de teléfono. Esta exclusión pertenece al informe; no elimina ni modifica registros. |
| Código postal | Busca cinco dígitos en código postal y, como alternativa, dirección. Acepta ZIP+4 y el prefijo de cinco dígitos. Puede interpretar un número de calle como ZIP; se conservó ese comportamiento para comparar. |
| Área | Prefijos 32, 33 y 34. Los registros sin ZIP también cuentan como fuera del área. Los contadores de incidencias no son categorías disjuntas. |
| Zona | Solo los registros dentro del área contribuyen a la tabla. Conserva la primera ciudad no vacía. Contactos suma las cuatro categorías; cerrados suma activos y terminados. |
| Cierre y ticket | Cierre = cerrados/contactos, a un decimal. Ticket = ingresos/cerrados, a dos decimales. Cero cuando no hay denominador. |
| Orden | Ingresos descendentes, después contactos descendentes; los empates conservan el orden de entrada. |
| Puntos | Centros de ZIP guardados y desplazamiento estable. Los que carecen de centro siguen en los agregados y aparecen en la lista pendiente. No son posiciones de viviendas. |
| Capas | Filtran los puntos y los de fuera del área. No recalculan la tabla ni el CSV. |
| CSV | Once columnas, comillas duplicadas y el orden de la tabla. La nueva utilidad neutraliza fórmulas de hoja de cálculo en textos; es una protección de exportación, no un cambio de importes. |

## Resultado inicial del cálculo

Quince conjuntos sintéticos coinciden con la salida PHP del origen: vacíos,
facturas anuladas, pagos parciales/completos, varios documentos por cliente,
fichas separadas con contactos compartidos, exclusiones de leads, límites del
área, ubicaciones ausentes, orden y redondeo. Los casos mixtos detectaron dos
diferencias de un centavo en ticket promedio; se corrigió el redondeo y se repitió
la comparación. Cinco pruebas adicionales verifican filtros, CSV, conservación
de entradas y rechazo de importes mal formados.

La entrega pasó localmente lint, tipos, 308 pruebas y compilación. No requiere
aplicar una migración de esquema ni publicar una versión del servidor.

El motor está en `src/lib/zone-analysis.ts`. Esa primera entrega solo acreditó
equivalencia de cálculo para los casos ensayados. La continuación conectó fuentes
y pantalla y publicó staging `8d936f0` con 315 pruebas; véase la
[auditoría autenticada](AUDITORIA-MAPA-COMERCIAL-20260925.md). El módulo sigue abierto.
Los nombres y ciudades extensos con caracteres multibyte requieren un contrato
adicional de truncamiento: PHP recorta bytes y JavaScript unidades de texto.

## Cómo repetir

La regresión sin acceso al origen se ejecuta con
`npx tsx --test tests/zone-parity.test.ts` y forma parte de `npm test`.
Para renovar la referencia, inspeccionar primero el código actual y su huella,
conservarlo fuera de Git y ejecutar en un entorno con PHP:

```text
php scripts/zone-reference.php /ruta/privada/CrmController.php tests/fixtures/zone-parity-input.json <SHA256-verificado>
```

El script verifica la huella y extrae solo los cuatro métodos. Los dobles no
tienen conexiones ni métodos de escritura. No actualizar las huellas esperadas
a partir de la implementación TypeScript. Conservar diferencias y evidencia
de la nueva referencia antes de reemplazar la existente.

## Pendiente de cierre

- Geocodificación automática y errores del proveedor.
- Proveedor cartográfico activo y contraste de UI actual de ADT.
- Casos extremos multibyte y lectura del CSV autenticado descargado.

El adaptador de entradas web, consulta completa, centros por empresa, UI,
capas/puntos, descarga y controles de permisos/reintentos se comprobaron en la
continuación; sus pruebas y límites están en la auditoría enlazada.

No se ejecutó geocodificación ni se enviaron direcciones a proveedores externos.
Producción permanece intacta. Staging avanzó de `a8e1dd9` a `8d936f0`,
conservando la anterior para retorno y sin importar datos de ADT.
