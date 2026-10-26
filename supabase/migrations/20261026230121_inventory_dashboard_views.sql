-- Tablero de inventario derivado del ledger y trazabilidad por movimiento.

create view public.inventory_position with (security_invoker=true) as
with balances as (
  select b.organization_id,b.product_id,
    coalesce(sum(b.quantity) filter(where l.location_type='available'),0)::numeric(14,3) as available_on_hand,
    coalesce(sum(b.quantity) filter(where l.location_type='customer'),0)::numeric(14,3) as customer,
    coalesce(sum(b.quantity) filter(where l.location_type='inspection'),0)::numeric(14,3) as inspection,
    coalesce(sum(b.quantity) filter(where l.location_type='maintenance'),0)::numeric(14,3) as maintenance,
    coalesce(sum(b.quantity) filter(where l.location_type='damaged'),0)::numeric(14,3) as damaged,
    coalesce(sum(b.quantity) filter(where l.location_type='writeoff'),0)::numeric(14,3) as writeoff,
    coalesce(sum(b.quantity) filter(where l.location_type='sold'),0)::numeric(14,3) as sold,
    coalesce(sum(b.quantity),0)::numeric(14,3) as net_quantity
  from public.inventory_balances b
  join public.inventory_locations l on l.id=b.location_id and l.organization_id=b.organization_id
  group by b.organization_id,b.product_id
), reservations as (
  select organization_id,product_id,
    coalesce(sum(quantity-consumed_quantity),0)::numeric(14,3) as reserved
  from public.stock_reservations
  where released_at is null and quantity>consumed_quantity
  group by organization_id,product_id
)
select p.organization_id,p.id as product_id,p.sku,p.description,p.family,p.unit_of_measure,p.active,
  coalesce(b.available_on_hand,0)::numeric(14,3) as available_on_hand,
  coalesce(r.reserved,0)::numeric(14,3) as reserved,
  (coalesce(b.available_on_hand,0)-coalesce(r.reserved,0))::numeric(14,3) as available,
  coalesce(b.customer,0)::numeric(14,3) as customer,
  coalesce(b.inspection,0)::numeric(14,3) as inspection,
  coalesce(b.maintenance,0)::numeric(14,3) as maintenance,
  coalesce(b.damaged,0)::numeric(14,3) as damaged,
  coalesce(b.writeoff,0)::numeric(14,3) as writeoff,
  coalesce(b.sold,0)::numeric(14,3) as sold,
  coalesce(b.net_quantity,0)::numeric(14,3) as net_quantity
from public.products p
left join balances b on b.organization_id=p.organization_id and b.product_id=p.id
left join reservations r on r.organization_id=p.organization_id and r.product_id=p.id
where p.item_type='inventory';

create view public.inventory_trace with (security_invoker=true) as
select m.organization_id,m.id as movement_id,m.product_id,m.created_at,m.quantity,m.movement_kind,m.reversal_of_id,
  origin.name as from_location,origin.location_type as from_location_type,
  destination.name as to_location,destination.location_type as to_location_type,
  d.id as document_id,d.folio as document_folio,d.document_type,d.status as document_status,
  r.folio as request_folio,c.folio as contract_folio,
  coalesce(customer.trade_name,customer.legal_name) as customer_name,site.name as site_name
from public.inventory_movements m
left join public.inventory_locations origin on origin.id=m.from_location_id
left join public.inventory_locations destination on destination.id=m.to_location_id
left join public.inventory_documents d on d.id=m.document_id
left join public.operation_requests r on r.id=d.request_id
left join public.contracts c on c.id=r.contract_id
left join public.customers customer on customer.id=c.customer_id
left join public.customer_sites site on site.id=c.site_id;

revoke all on public.inventory_position,public.inventory_trace from anon;
grant select on public.inventory_position,public.inventory_trace to authenticated;
