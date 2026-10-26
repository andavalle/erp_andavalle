# Inventario, folios y auditoría

## Disponibilidad

```text
disponible = saldo en ubicaciones disponibles - reservas activas
```

- SS autorizada: crea reserva.
- HS de renta: disponible → cliente/obra y consume reserva.
- HS de venta: disponible → vendido y consume reserva.
- HE: cliente/obra → condición elegida.
- Sólo `available` vuelve a formar parte de la disponibilidad.
- Ninguna función permite saldo o disponibilidad negativos.

## Concurrencia

Las confirmaciones bloquean los registros afectados en orden estable por UUID de producto. Validación, bloqueo, movimiento y actualización de estado ocurren en una transacción corta. Cada documento tiene una clave de idempotencia única.

## Folios

Las secuencias se separan por organización, tipo y año. Ejemplos:

- `CTR-R-2026-000001`
- `CTR-V-2026-000001`
- `SS-2026-000001`, `HS-2026-000001`, `SE-2026-000001`, `HE-2026-000001`

## Auditoría

Se registra organización, actor, acción, entidad, identificador, valores anteriores/nuevos y fecha. Las funciones críticas escriben auditoría dentro de la misma transacción. La aplicación no puede actualizar ni eliminar eventos.
