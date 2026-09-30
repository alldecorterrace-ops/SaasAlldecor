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

### Publicación y recorrido del 30 de septiembre

Aplicación `c75cfdce57cf105db54c3e39c886c10509c0145d` publicada únicamente en
staging; esquema 048 aplicado al proyecto aislado. Compilación del hosting,
proceso activo, lint, tipos y diez pruebas específicas correctos.
[CI de la entrega](https://github.com/alldecorterrace-ops/SaasAlldecor/actions/runs/36740061050):
suite completa, compilación, concurrencia y recuperación sintética aprobadas.

- Sesión real del auditor, por fases Trabajador → Encargado → Oficina. Se envió
  un gasto ficticio con una imagen, se descargó el archivo idéntico al original,
  se registraron ambas decisiones y se reabrió el resultado. Son fases de una
  cuenta, no tres personas distintas actuando simultáneamente en staging.
- Un envío, dos decisiones, tres recibos de ejecución y tres eventos de auditoría.
  El importe permanece intacto; no se crean gastos administrativos ni pagos.
- Corregidos dos errores encontrados en pantalla: un rechazo inválido conservaba
  mal la selección/motivo, y una fecha editada sin segundos mostraba un error
  técnico. Ahora se conservan la decisión, los campos y el archivo; UTC admite
  minutos y segundos sin cambiar la zona por la configuración del dispositivo.
- Borrador fuera del periodo permitido rechazado dos veces sin nuevo gasto ni
  segunda carga del mismo recibo. Los dos borradores ensayados dejaron dos objetos
  privados sin gasto asociado; se conservan, sin borrar pruebas ni contabilidad.
  La retención general de estos objetos pendientes sigue por definir.
- Escritorio y móvil emulado a 390 px, con documento también de 390 px; historial
  desplegado, consulta y error/reintento comprobados. No acredita dispositivo físico.
- Se retiraron los permisos temporales, se restauró el vínculo original del auditor,
  se desactivaron los perfiles de ensayo y se cerró la asignación. Catorce conjuntos
  previos mantienen recuentos y huellas exactos. Los datos de negocio de la ficha
  original permanecen iguales; sus versiones y eventos reflejan el ensayo.
- Tras la revocación, la pantalla de Horas muestra «Página no disponible»; RLS y
  el localizador de recibos deniegan la consulta en la base real. HTTP anónimo del
  recibo devuelve 401. El navegador bloqueó la navegación al recibo revocado:
  no se presenta ese intento como prueba de un código HTTP autenticado.
- Ocho comprobaciones públicas correctas entre staging y producción. Configuración
  de producción preservada; esta entrega no publica ni migra datos allí.

### Concurrencia entre conexiones

El job de PostgreSQL 17 utiliza identidades sintéticas distintas y Auth/Storage
mínimos simulados. Ocho reintentos paralelos de preparación, ocho de envío y ocho
primeras decisiones conservan un solo efecto por solicitud. Dos decisiones de
oficina opuestas sobre la misma versión producen un ganador y un conflicto;
permanecen tres eventos y ningún pago. La revocación bloquea incluso el reintento
privilegiado. No sustituye una prueba simultánea de dispositivos en Supabase.

### Alcance que sigue abierto

No considerar terminado Trabajadores/Horas ni la paridad completa de gastos:
quedan revisión IA y humana, edición, archivo/restauración, reembolso, copia
contable sin duplicación, notificaciones y labor por jornada. La revisión IA
no es una condición de las dos decisiones del servicio Workforce de referencia;
la interfaz administrativa separa estos envíos `wf_` de la aprobación genérica.
El reembolso tendrá sus propios requisitos de revisión y origen del pago.
