# Máquinas de estado

## Oportunidad CRM

```text
new → contacted → qualified → quoted → won
 └───────────────→ lost ←──────────────┘
```

- Una oportunidad puede pertenecer a un prospecto nuevo o a un cliente existente.
- Al pasar a `contacted` debe crearse una actividad futura o cerrarse la oportunidad.
- `quoted` se alcanza al emitir su primera cotización.
- `won` se deriva de la aceptación de una cotización; no se marca manualmente.
- `lost` exige un motivo de catálogo y explicación cuando sea `other`.
- `won` y `lost` son terminales. Si un interés perdido regresa, se crea otra oportunidad enlazada mediante `previous_lead_id`.
- Los registros pueden archivarse para ocultarlos de la operación diaria, pero no se eliminan.

## Operación de Renta

```text
planned → active → pending_return → closed
   └───────────────────────────→ cancelled
```

- El estado se deriva de contratos, cobertura, entregas, devoluciones e incidencias; no se edita libremente.
- La primera HS confirmada con entrega física cambia la OR de `planned` a `active`.
- Una OR `planned` se cancela automáticamente si se cancela su único contrato y no existen reservas ni movimientos.
- Una OR cerrada no se reabre.
- `pending_return` aplica cuando queda saldo físico por devolver o sin cobertura después de la gracia.

## Cotización

```text
draft → sent → accepted → converted
  └────────→ rejected
  └────────→ cancelled
```

- Cada cotización aceptada se convierte una sola vez en un contrato nuevo.
- Si indicó una OR nueva, ésta se crea durante la conversión.

## Contrato

```text
draft → pending_authorization → authorized → active → closed
   └──────────────→ cancelled       └→ early_termination → closed
```

- Sólo `authorized` permite crear una SS.
- Autorizar el contrato no reserva inventario; la reserva ocurre al autorizar la SS.
- La primera HS confirmada activa el contrato.
- Antes de la primera HS, comercial puede cancelar sólo si no existen reservas. Con SS autorizadas o reservas se requiere administrador y la operación cancela pendientes y libera reservas de forma atómica.
- Antes de cualquier movimiento físico, un administrador puede corregir la obra: cancela solicitudes, libera reservas y reasigna el contrato a otra OR del mismo cliente con auditoría.
- Después de una HS confirmada el contrato ya no puede cancelarse. Una terminación anticipada pasa a `early_termination`, requiere devolución mediante SE/HE y conciliación del saldo físico antes del cierre.
- Venta se cierra al surtirse completamente.
- Renta se cierra cuando el saldo físico de la cadena es cero; una excepción requiere administrador y motivo.

## Solicitud SS/SE

```text
draft → submitted → authorized → partially_fulfilled → completed
   └──────────────→ cancelled ←──────────────┘
```

- Autorizar una SS crea reservas; cancelar libera el remanente.
- Antes de la primera HS, almacén puede revisar una SS autorizada; el cambio queda auditado y reemplaza las reservas atómicamente sin exceder el contrato.
- Una HS parcial consume sólo la cantidad entregada; la SS queda `partially_fulfilled` y conserva la reserva del remanente hasta surtirlo o cancelarlo expresamente.
- SE no reserva inventario, pero nunca puede solicitar más que el saldo en cliente.

## HS

```text
draft → dispatched → confirmed → reversed
   └────→ cancelled
          └→ delivery_failed → returned_to_warehouse
```

- Despachar mueve de almacén a tránsito y consume la reserva correspondiente.
- La recepción y firma del cliente mueve de tránsito a obra y confirma la HS.
- Un rechazo pasa a `delivery_failed`; el regreso físico mueve tránsito → almacén, cambia a `returned_to_warehouse` y restaura la reserva de la SS en una sola transacción.
- En una aceptación parcial, sólo lo firmado pasa de tránsito a obra; el rechazo permanece en tránsito hasta volver al almacén y restaurar su reserva.
- Despachar y confirmar son transiciones idempotentes independientes.
- `reversed` se alcanza creando movimientos inversos; los originales permanecen.

## HE

```text
draft → confirmed → reversed
   └────→ cancelled
```

- Confirmar es idempotente: el mismo documento sólo genera movimientos una vez.
- `reversed` se alcanza creando movimientos inversos; los originales permanecen.
- Una HE con faltantes abre una incidencia; no da de baja automáticamente la diferencia.

## Entrada de Almacén

```text
draft → pending_authorization → confirmed
   └──────────────→ cancelled
```

- Al confirmar crea las fuentes de inventario y movimientos correspondientes.
- El subtipo identifica compra, subarrendamiento, inventario inicial u otro autorizado.

## Transferencia de Almacén

```text
draft → dispatched → in_transit → received
   └───────────────→ cancelled
```

- Despachar mueve del almacén origen a tránsito.
- Recibir mueve de tránsito al almacén destino.

## Incidencia de inventario

```text
open → under_review → resolved
  └───────────────→ cancelled
```

- Puede resolverse por devolución posterior, cargo por reposición, venta desde renta o baja autorizada.

## Logística

```text
planned → assigned → in_transit → completed
    └──────────────→ cancelled
```

El MVP registra fecha, vehículo, operador y estado; rutas, GPS, combustible y viáticos quedan fuera.
