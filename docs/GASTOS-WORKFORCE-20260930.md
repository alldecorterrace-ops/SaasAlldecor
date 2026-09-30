# Workforce: recibos y doble aprobación

Entrega aditiva de esquema 048. No importa datos de ADT ni modifica sus gastos.
Referencia: `ExpenseService`, `ReceiptService` y `ScopeService` de Workforce en
la copia local de ADT, junto con el contrato de interfaz observado del 29 de
septiembre. Esa copia de PHP no acredita por sí sola la versión hoy desplegada.

## Acciones implementadas

- El usuario envía su propio gasto con obra disponible en el instante del gasto,
  categoría, descripción y recibo obligatorio. Importe mayor que cero hasta
  10.000, fecha entre noventa días atrás y cinco minutos hacia adelante.
- Comprobantes privados de hasta 8 MiB: JPG, PNG, WebP, HEIC y HEIF. Comprobación
  de firma/dimensiones o marcas HEIF, tamaño, MIME y SHA-256 en el servidor web;
  nombres saneados, lectura autenticada, sin sobreescribir ni borrar objetos.
- Primero decide el encargado sobre otro trabajador de su equipo directo.
  Oficina o administración solo decide después de la aprobación del encargado.
  Se conserva actor, perfil, fecha, motivo y versión de cada etapa.
- El rechazo requiere al menos cinco caracteres y termina este envío.
  Reintentos idénticos recuperan el resultado guardado; otros datos o versiones
  antiguas se rechazan. Una decisión no crea un pago ni una copia contable.
- La lista, los nombres, el historial y el recibo siguen la empresa y el equipo
  vigentes. Permisos de Horas y rol de equipo son controles distintos.

## Evidencia y límites

Pruebas locales de PostgreSQL mediante PGlite: recibo ausente, obra ajena,
importe/fecha inválidos, segunda empresa, lectura de otro equipo, propia
aprobación, salto de etapa, dos decisiones, rechazo, reintentos, versiones,
revocación y ausencia de efectos en gastos administrativos, horas o pagos.
El contrato mínimo simula Auth y Storage; no prueba sus servicios reales ni
concurrencia entre conexiones. Las comprobaciones de imágenes identifican
formato y dimensiones/marcas, sin afirmar decodificación completa de píxeles.

Pendiente de agregar aquí la evidencia de publicación y recorrido autenticado.
No considerar terminado Trabajadores/Horas ni la paridad completa de gastos:
quedan revisión IA y humana, edición, archivo/restauración, reembolso, copia
contable sin duplicación, notificaciones y labor por jornada. La revisión IA
no es una condición de las dos decisiones del servicio Workforce de referencia;
la interfaz administrativa separa estos envíos `wf_` de la aprobación genérica.
El reembolso tendrá sus propios requisitos de revisión y origen del pago.
