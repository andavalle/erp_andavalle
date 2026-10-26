# Esquema lógico v2 — ERP Andavalle

**Estado:** propuesta para revisión; no es una migración ejecutable
**Base:** decisiones validadas en `contexto/operaciones-renta-y-folios.md`
**Objetivo:** fijar tablas, claves y restricciones antes de modificar Supabase

## 1. Convenciones

- Nombres en inglés, minúsculas y `snake_case`.
- Claves públicas UUID; `audit_events` puede conservar identidad `bigint` por volumen y orden.
- Toda tabla de negocio incluye `organization_id`, `created_at` y, si es editable, `updated_at`.
- Todas las fechas de evento usan `timestamptz`; vigencias comerciales sin hora usan `date`.
- Cantidades: `numeric(14,3)`; dinero: `numeric(14,2)`; tasas: `numeric(7,4)`.
- Estados y tipos inicialmente serán `text` con restricciones `check`, para permitir evolución controlada.
- Las relaciones entre entidades multiempresa usan claves foráneas que incluyen `organization_id`.
- Las tablas expuestas tendrán RLS; las tablas económicas sensibles tendrán además permisos separados.
- Ninguna eliminación en cascada alcanzará contratos, documentos, movimientos o auditoría.

## 2. Identidad y estructura

Se conservan las tablas ya diseñadas:

- `organizations`
- `profiles`
- `organization_members`
- `organization_member_roles`
- `branches`
- `warehouses`

Restricciones relevantes:

- membresía única por organización y perfil;
- rol único por membresía;
- toda autorización requiere una membresía activa;
- índices sobre perfil, organización y membresías activas.

## 3. CRM y catálogos

### `crm_leads`

Aunque conserva este nombre físico por compatibilidad con el esquema inicial, cada fila representa una oportunidad comercial, no únicamente una persona o empresa sin convertir. Puede guardar datos preliminares del prospecto o vincularse con un cliente existente. Una misma empresa o cliente puede originar varias oportunidades independientes.

| Columna | Regla |
|---|---|
| `organization_id` | aislamiento multiempresa obligatorio |
| `customer_id` | opcional para cliente existente o después de conversión |
| `site_id` | opcional hasta preparar cotización |
| `previous_lead_id` | oportunidad perdida anterior, cuando el interés regresa |
| `name`, `company` | al menos uno informado |
| `phone`, `email` | al menos uno informado |
| `need_summary` | necesidad obligatoria |
| `assigned_to` | un responsable comercial principal |
| `status` | `new`, `contacted`, `qualified`, `quoted`, `won` o `lost` |
| `source_id`, `source_other` | `source_other` obligatorio para origen `other` |
| `lost_reason_id`, `lost_notes` | motivo obligatorio al pasar a `lost`; `other` exige explicación |
| `duplicate_override_reason` | requerido al continuar después de una advertencia |
| `privacy_consent_at`, `privacy_notice_version` | obligatorios para origen web |
| `archived_at` | archivo lógico; nunca eliminación física desde la aplicación |
| fechas de etapa | primer contacto, calificación, cotización y cierre |

Los teléfonos se compararán en su representación normalizada, los correos con `lower(trim(email))` y el RFC con mayúsculas sin espacios. Los índices de estas expresiones permitirán advertir coincidencias sin impedir que un cliente tenga varias oportunidades.

### `crm_sources` y `crm_loss_reasons`

Catálogos por organización con código estable, nombre, orden y estado activo. Incluirán una fila `other`; cuando se seleccione exigirá explicación en la oportunidad. Los códigos usados no se eliminarán ni reutilizarán.

### `crm_assignment_history`

Registro append-only de oportunidad, responsable anterior, responsable nuevo, actor, motivo y fecha. Cada oportunidad mantiene un solo `assigned_to` vigente.

### `customer_activities`

| Columna | Regla |
|---|---|
| `lead_id` | oportunidad relacionada; obligatoria para seguimiento comercial |
| `customer_id`, `site_id` | contexto opcional derivado o seleccionado |
| `activity_type` | `call`, `email`, `whatsapp`, `visit`, `task` o `note` |
| `summary` | obligatoria |
| `due_at` | obligatoria para actividades futuras, salvo `note` |
| `completed_at`, `cancelled_at` | cierre excluyente |
| `assigned_to`, `created_by` | responsables auditables |

La transición que registre una oportunidad como `contacted` exigirá, en la misma operación, una actividad futura abierta o su cierre como `won`/`lost`. El próximo seguimiento será un dato derivado de la actividad abierta más próxima.

Los prospectos del sitio web se insertarán mediante una Edge Function protegida por Turnstile. Se crearán sin `assigned_to` en la bandeja compartida y con una tarea de contacto a 24 horas. La función guardará fecha y versión del consentimiento, pero nunca almacenará el token de Turnstile.

### `customers`

Conserva tipo de persona, razón social o nombre, nombre comercial, RFC, estado y archivo lógico. El RFC podrá faltar durante la preparación inicial, pero se normalizará cuando exista. Antes de crear un cliente desde una oportunidad se buscarán coincidencias y podrá reutilizarse uno existente.

`customer_code` seguirá `CLI-000001`, con secuencia permanente por organización. Un índice único parcial sobre el RFC normalizado de clientes no archivados impedirá dos clientes activos con el mismo RFC; los valores nulos seguirán permitidos.

### `customer_contacts`

| Columna | Regla |
|---|---|
| `id` | PK |
| `organization_id`, `customer_id` | FK multiempresa |
| `name` | obligatoria |
| `position`, `phone`, `email` | opcionales |
| `is_primary`, `active` | booleanos |
| `site_id` | opcional para indicar contacto propio de una obra |

Sólo un contacto principal activo por cliente mediante índice único parcial.

### `customer_sites`

Conserva cliente, nombre de obra, dirección y coordenadas opcionales. Una obra archivada no admite nuevas OR, pero permanece visible históricamente.

`site_code` seguirá `OBR-000001`, con secuencia permanente por organización. La dirección será obligatoria antes de emitir la primera cotización asociada.

### Acceso CRM

Administrador y comercial pueden consultar las oportunidades de su organización. Comercial sólo modifica aquellas cuyo `assigned_to` corresponde a su perfil; administrador puede modificar y reasignar todas. Las políticas RLS validan membresía activa y roles protegidos en tablas, no metadatos editables del JWT.

### `suppliers`

| Columna | Regla |
|---|---|
| `id` | PK |
| `organization_id` | FK |
| `legal_name` | obligatoria |
| `tax_id` | RFC opcional; único cuando exista |
| `contact_name`, `phone`, `email` | operativos |
| `active` | predeterminado verdadero |

### `products`

Además de SKU, descripción, familia y unidad:

| Columna | Regla |
|---|---|
| `origin_class_code` | dos dígitos: origen técnico, no propiedad |
| `family_code` | dos dígitos y FK al catálogo de familias |
| `variant_code` | seis dígitos definidos por familia |
| `catalog_code` | código visible de 10 dígitos derivado de los tres segmentos |
| `item_type` | `inventory` o `service` |
| `base_unit_id` | FK al catálogo controlado de unidades de medida |
| `tracking_mode` | `quantity` o `serialized` |
| `replacement_price` | precio actual de reposición, no costo histórico |
| `replacement_price_updated_at` | fecha de actualización |
| `active` | no elimina historial |
| `replacement_product_id` | sustituto opcional cuando se desactiva |

Los andamios y accesorios comienzan como `quantity`; maquinaria, vehículos y equipo especial como `serialized`. El modo no podrá cambiar después de registrar movimientos, salvo conversión administrativa específica.

Los SKU `service` —por ejemplo flete o montaje— podrán aparecer en cotizaciones y contratos, pero no serán reservables y nunca generarán movimientos de inventario.

Los servicios compartirán la estructura de ID técnico de 10 dígitos y SKU fijo, mediante familias propias. `item_type` será la regla definitiva para excluirlos del inventario.

Para SKU `service`, `origin_class_code = 01` significará prestación directa por Andavalle y `02` prestación subcontratada.

`quotation_type` y `contract_type` serán excluyentes entre `rental` y `sale`. Una operación no mezclará líneas de equipo de ambos tipos, aunque cualquiera podrá incluir líneas `service`.

`units_of_measure` normaliza clave, nombre, símbolo y precisión decimal. No se utilizarán unidades de texto libre en productos ni documentos operativos. La unidad base del producto será también su unidad comercial; el MVP no manejará conversiones entre unidades.

En el MVP todas las cantidades operativas serán enteras y positivas; no se aceptarán fracciones en líneas documentales ni en el ledger de inventario.

Las semillas iniciales de `units_of_measure` sólo incluirán unidades compatibles con conteos enteros. La incorporación futura de unidades fraccionarias requerirá una decisión y migración explícitas.

El MVP no incluirá tablas de kits. Toda línea comercial y operativa apuntará directamente a un SKU individual.

### `product_prices`

Conserva por organización y producto el tipo `rental` o `sale`, importe en MXN, vigencia y estado. Las líneas de cotización y contrato copiarán el precio aplicado para preservar el historial ante cambios posteriores.

Las escrituras sobre precios base estarán reservadas a administración; comercial tendrá lectura y podrá utilizar los precios vigentes al preparar cotizaciones.

Las líneas de cotización guardarán el precio capturado desde su creación. Si cambia la tarifa de catálogo, el borrador no se actualizará automáticamente; una acción explícita podrá reemplazarla y quedará auditada.

### `rental_rate_tiers`

Define por organización los límites mínimo y máximo de días, factor, vigencia y orden de cada rango. La tabla será global para todos los SKU. El cálculo utilizará el precio diario vigente del producto y un piso derivado del máximo del rango anterior. La cotización guardará precio diario, días, factor, piso e importe resultante como fotografía histórica. Las excepciones conservarán motivo, solicitante y autorización.

El porcentaje de descuento adicional se guardará en el encabezado de la cotización y se aplicará de forma general sólo al subtotal de SKU `inventory`. Los SKU `service` conservarán su precio. Hasta 10 % podrá aplicarlo comercial; un porcentaje superior requerirá autorización administrativa antes de aceptar la cotización. El MVP no admitirá descuentos diferentes por línea.

`product_origin_classes` administra códigos de origen técnico como `01` fabricación Andavalle y `02` sistema comercial externo. `product_categories` agrupa familias para navegación y reportes. `product_families` pertenece a una categoría y administra el código de familia y el prefijo de SKU; ambos serán únicos por organización, no por categoría. `product_external_references` conserva códigos Layher u otros sin convertirlos en propiedad del inventario. El UUID sigue siendo la llave interna del producto.

### `product_legacy_codes`

Relaciona cada producto con uno o varios códigos del catálogo anterior. Incluye `organization_id`, `product_id`, `legacy_code` y una procedencia opcional. Sólo se utilizará para búsqueda y trazabilidad; no será una clave operativa.

## 4. Cotizaciones

### `quotations`

| Columna | Regla |
|---|---|
| `id`, `organization_id` | PK y tenant |
| `opportunity_id` | obligatorio; si se inicia sin uno, se crea automáticamente |
| `folio` | único por organización |
| `base_folio`, `revision_number` | agrupan revisiones; `R00` es la emisión original |
| `quotation_type` | `rental` o `sale` |
| `customer_id`, `contact_id`, `site_id` | obligatorios antes de emitir |
| `issued_at`, `valid_until` | vigencia comercial; 15 días naturales por defecto |
| `operation_mode` | `new`, `existing` o `none` |
| `rental_operation_id` | sólo cuando continúa una OR |
| `proposed_operation_name` | obligatorio para OR nueva |
| `purpose` | `initial`, `renewal`, `expansion`, `terms_change`, `replacement`, `other` |
| `other_purpose` | obligatorio si `purpose = other` |
| `status` | `draft`, `sent`, `accepted`, `converted`, `rejected`, `expired`, `cancelled` |
| `accepted_at`, `accepted_by` | registro interno de la aceptación |
| `acceptance_evidence_path` | archivo privado obligatorio para aceptar |

Una cotización enviada con `valid_until` vencido no podrá aceptarse. Su duplicado será un documento nuevo y deberá recalcular o confirmar precios, periodos y disponibilidad.

Una oportunidad puede tener varias cotizaciones. Crear una cotización directamente generará primero una oportunidad enlazada en la misma transacción. Emitir la primera cotización cambia la oportunidad a `quoted`; aceptar cualquiera la cambia a `won` de forma idempotente.

Una modificación posterior al envío creará una nueva revisión enlazada a la anterior. Las revisiones emitidas serán inmutables y sólo la marcada como vigente podrá aceptarse.

En el MVP, comercial registrará la aceptación y adjuntará como evidencia una cotización firmada, correo u orden de compra. La evidencia se almacenará de forma privada; sin ella la transición a `accepted` y la conversión a contrato serán rechazadas.

La conversión de una cotización aceptada será transaccional e idempotente: creará exactamente un contrato en borrador y, cuando `operation_mode = new` en renta, una OR enlazada. No creará reservas ni movimientos; éstos comenzarán únicamente con la autorización posterior de una SS.
| `valid_until` | vigencia de la oferta, distinta de la renta |
| `default_starts_on`, `default_ends_on` | vigencia general propuesta |
| importes | subtotal, descuento, IVA y total |
| auditoría de aceptación | actor y fecha |

Restricciones:

- venta exige `operation_mode = none` y OR nula;
- renta exige `new` o `existing`;
- `existing` exige OR del mismo cliente y obra;
- una cotización sólo puede convertirse una vez.

### `quotation_lines`

| Columna | Regla |
|---|---|
| `quotation_id`, `line_no` | únicos juntos |
| `product_id`, `quantity` | cantidad positiva |
| `billing_unit` | `day`, `week`, `month` o `fixed_period` |
| `unit_price`, `discount_percent`, `tax_rate` | exactos y no negativos |
| `starts_on`, `ends_on` | opcionales; prevalecen sobre cabecera |

## 5. Operación de Renta

### `rental_operations`

Reemplazo objetivo de `contract_chains`.

| Columna | Regla |
|---|---|
| `id`, `organization_id` | PK y tenant |
| `folio` | `OR-AÑO-000001`, único |
| `customer_id`, `site_id` | inmutables después del primer movimiento |
| `name` | obligatorio para distinguir frentes o etapas |
| `cancelled_at`, `cancelled_by` | sólo sin movimientos |
| `closed_at`, `closed_by` | cierre formal |
| `closure_reason`, `closure_evidence_path` | obligatorios en excepción |

El estado operativo se expone mediante una vista derivada; no se guarda como campo libremente editable.

Una OR nueva permanecerá `planned` hasta que se confirme su primera HS con movimiento físico hacia cliente/obra. Cotización aceptada, contrato autorizado, SS o reservas no la convertirán por sí solos en `active`.

Si antes de cualquier entrega se cancela su único contrato y la OR no tiene otras relaciones, reservas ni movimientos, la OR se cancelará automáticamente en la misma operación transaccional. Su folio permanecerá reservado para auditoría.

### `contracts`

| Columna | Regla |
|---|---|
| `contract_type` | `rental` o `sale` |
| `quotation_id` | origen único |
| `rental_operation_id` | obligatorio para renta, nulo para venta |
| `previous_contract_id` | renovación o continuación |
| `purpose` | mismo catálogo de propósitos |
| `status` | borrador a cerrado/cancelado |

La autorización del contrato consultará y mostrará disponibilidad, pero no se bloqueará por faltantes ni creará reservas. La disponibilidad definitiva se validará bajo bloqueo transaccional al autorizar cada SS.
Una vez autorizado, el contrato y sus líneas quedarán inmutables. Cualquier cambio comercial se realizará mediante un nuevo contrato relacionado; la cancelación será una transición formal, autorizada y auditada, no una edición ni eliminación del registro original.
Como excepción correctiva, antes de cualquier HS o HE confirmada un administrador podrá cambiar la OR del contrato a otra obra del mismo cliente. La función transaccional cancelará primero todas sus solicitudes pendientes, liberará las reservas y registrará OR anterior, OR nueva, motivo y actor; después deberá crearse una SS nueva. Con movimientos físicos confirmados, la reasignación quedará bloqueada.
La OR destino deberá estar `planned` o `active` y corresponder al mismo cliente y a la nueva obra. Si no existe una OR compatible, la operación podrá crear una en estado `planned`; nunca admitirá una OR cerrada, cancelada o perteneciente a otro cliente u obra.
Un contrato con alguna HS confirmada ya no podrá cancelarse. Su terminación anticipada cambiará el estado a `early_termination`, originará el flujo de devolución mediante SE y HE, y sólo permitirá el cierre después de conciliar el saldo físico o registrar una excepción administrativa auditada.
La devolución antes de la fecha pactada no recalculará ni reducirá automáticamente el importe autorizado. Cualquier ajuste comercial será una excepción administrativa con motivo, actor, fecha y valores anterior y nuevo en auditoría.
Antes de la primera HS, comercial podrá cancelar el contrato únicamente cuando no existan reservas. Si tiene SS autorizadas o reservas, la cancelación requerirá administrador y se ejecutará transaccionalmente junto con la cancelación de pendientes y la liberación de reservas. Los registros y folios permanecerán para auditoría.
| `starts_on`, `ends_on` | marco general |
| importes | fotografía autorizada |
| autorización | actor, fecha y justificación de autoautorización |

### `contract_lines`

| Columna | Regla |
|---|---|
| `contract_id`, `line_no` | únicos juntos |
| `previous_contract_line_id` | traza renovaciones parciales |
| `product_id`, `quantity` | positivos |
| `billing_unit`, `unit_price` | tarifa pactada |
| `starts_on`, `ends_on` | vigencia por SKU |
| `billing_start_rule` | `physical_delivery` o `agreed_date` |
| `billing_end_rule` | `available_for_pickup` o excepción acordada |
| `grace_days` | calculado y congelado al autorizar |
| importes | descuento, impuesto y total de línea |

La validación de superposición se realiza por producto, cantidad, propósito y fechas. Las ampliaciones permiten traslape; las renovaciones no duplican cobertura por error.

### `rental_billing_events`

Registro operativo —sin facturación— de inicio y fin cobrable para cantidades entregadas o devueltas parcialmente.

| Columna | Regla |
|---|---|
| `contract_line_id`, `product_id` | contexto comercial |
| `quantity` | positiva |
| `event_type` | `start` o `stop` |
| `effective_on` | fecha cobrable |
| `source_document_line_id` | HS, HE o SE causante |
| `exception_reason` | obligatoria si difiere de regla predeterminada |

Esta tabla permite que entregas parciales del mismo SKU inicien en fechas diferentes sin implementar todavía cobranza.

## 6. Solicitudes y logística

### `operation_requests`

| Columna | Regla |
|---|---|
| `request_type` | `SS` o `SE` |
| `contract_id`, `rental_operation_id` | obligatorios |
| `status` | borrador, enviada, autorizada, parcial, completada o cancelada |
| `requested_by` | comercial |
| `authorized_by`, `authorized_at` | almacén o excepción administrativa |
| `available_for_pickup_at` | SE; fecha efectiva indicada por cliente |
| `customer_delay` | impide detener cobro mientras sea verdadero |

### `operation_request_lines`

Incluye contrato/línea, producto, cantidad solicitada, procesada y pendiente. No permite solicitar devolución superior al saldo de la OR.

Un contrato podrá originar varias SS para fechas o entregas parciales. Bajo bloqueo transaccional, la suma de cantidades en SS activas por línea de contrato no podrá superar la cantidad autorizada, considerando cancelaciones y remanentes liberados.
Si el cliente necesita cantidades adicionales, el sistema bloqueará el exceso y exigirá una nueva cotización y un contrato con `purpose = expansion`, ligados a la misma OR. El contrato original no se ampliará ni se modificará.
Antes de la primera HS, almacén podrá revisar una SS autorizada y corregir cantidades, SKU, descripciones operativas o programación. La operación requerirá motivo, conservará la revisión anterior en auditoría y reemplazará las reservas bajo una sola transacción y bloqueo concurrente. Los valores finales deberán seguir cubiertos por las líneas del contrato y no podrán crear excedentes.
No se permitirá sustituir un SKU directamente durante la preparación o confirmación de una HS. Si el SKU alternativo está autorizado en el contrato, deberá corregirse primero la SS y reasignarse la reserva; si no lo está, se requerirán una nueva cotización y un contrato de ampliación.
Cuando una HS surta sólo parte de una línea, la SS quedará `partially_fulfilled` y la reserva se consumirá únicamente por la cantidad entregada. El remanente seguirá reservado hasta otra HS o hasta una cancelación expresa que lo libere transaccionalmente.
Las reservas no vencerán ni se liberarán automáticamente al superar la fecha programada. Se marcarán como atrasadas para el tablero operativo y almacén deberá reprogramarlas o cancelar el remanente con un motivo auditado.

### `logistics_assignments`

Conserva solicitud, fecha programada, vehículo, operador, estado y observaciones.

## 7. Fuentes, activos y ubicaciones

### `inventory_sources`

Una fila por producto y lote de procedencia.

| Columna | Regla |
|---|---|
| `product_id` | obligatorio |
| `ownership_type` | `owned`, `subleased`, `third_party` |
| `source_type` | `purchase`, `sublease`, `initial_stock`, `other_authorized` |
| `supplier_id` | obligatorio para compra/subarrendamiento |
| `external_reference` | obligatoria salvo inventario inicial |
| `valid_from`, `valid_until`, `expected_return_on` | obligatorias para subarrendamiento |
| `entry_document_line_id` | origen inmutable |

### `inventory_source_costs`

Separada para aplicar privilegios por columna de negocio.

| Columna | Regla |
|---|---|
| `inventory_source_id` | PK/FK uno a uno |
| `unit_cost`, `currency` | referencia económica |
| `cost_basis` | compra, tarifa diaria/semanal/mensual u otro |

Sólo administración y comercial reciben acceso. Almacén consulta `inventory_sources` sin unir costos.

### `serialized_assets`

| Columna | Regla |
|---|---|
| `product_id`, `inventory_source_id` | obligatorios |
| `serial_number` | único por organización |
| `asset_tag` | único cuando exista |
| `active` | no borra historial |

Sólo productos `serialized` admiten activos. Cada movimiento de activo usa cantidad igual a uno.

### `inventory_locations`

Tipos: disponible, inspección, mantenimiento, dañada, cliente/obra, tránsito, vendida y baja. Las ubicaciones de cliente se ligan a `customer_site_id`; las internas a almacén.

## 8. Reservas

### `stock_reservations`

Cabecera por línea de SS, producto y ubicación. Conserva cantidad, cantidad consumida y liberación.

### `reservation_allocations`

| Columna | Regla |
|---|---|
| `reservation_id` | FK |
| `inventory_source_id` | procedencia reservada |
| `serialized_asset_id` | obligatorio sólo para serializados |
| `quantity` | positiva; uno para activos |

La suma de asignaciones activas coincide con la reserva. La vigencia de una fuente subarrendada debe cubrir el compromiso contractual.

## 9. Documentos y ledger

### `inventory_documents`

| Columna | Regla |
|---|---|
| `document_type` | `HS`, `HE`, `RHS`, `RHE`, `EA`, `TA`, `AJ`, `BI` |
| `document_subtype` | origen de EA o motivo específico |
| `request_id` | obligatorio sólo para HS/HE normales |
| `reversal_of_document_id` | único; requerido para RHS/RHE |
| `folio`, `status` | únicos y controlados |
| `idempotency_key` | único |
| evidencia | receptor, firma, confirmación y motivo |
| proveedor/origen | cuando aplique a EA |

Para una HS, `status` incluirá `draft`, `dispatched`, `confirmed`, `cancelled` y `reversed`. El despacho consumirá la reserva y generará el movimiento almacén → tránsito; la recepción firmada generará tránsito → obra y confirmará la HS. Cada transición tendrá una clave de idempotencia independiente.
También incluirá `delivery_failed` y `returned_to_warehouse`. Un rechazo conservará el equipo en tránsito hasta su regreso físico; entonces una función idempotente moverá tránsito → almacén y restaurará atómicamente la reserva pendiente de la SS. Se guardarán motivo, evidencia, actor y fechas, sin crear una HE.

### `inventory_document_lines`

| Columna | Regla |
|---|---|
| `document_id`, `line_no` | únicos juntos |
| `request_line_id` | opcional según tipo |
| `product_id`, `quantity` | positivos |
| `from_location_id`, `to_location_id` | según movimiento |
| `condition_code` | destino de HE |
| `accepted_quantity`, `rejected_quantity` | HS; juntas igualan la cantidad despachada |

En una HE, las líneas de clasificación suman exactamente la cantidad recibida.
En una HS, cada línea deberá corresponder a una línea vigente de la SS y al mismo SKU reservado; la confirmación no admitirá sustituciones implícitas.
Las ubicaciones incluirán tránsito logístico para que el equipo despachado no permanezca contablemente en almacén ni aparezca en obra antes de la recepción.
La recepción parcial moverá únicamente `accepted_quantity` de tránsito a obra. `rejected_quantity` permanecerá en tránsito hasta el regreso físico a almacén, momento en que recuperará su reserva; sólo la cantidad aceptada contará como surtida en la SS.

### `inventory_document_allocations`

Divide una línea por fuente y activo. Permite mostrar una sola línea al cliente y generar movimientos separados para existencias propias y subarrendadas.

### `inventory_movements`

Ledger físico append-only:

| Columna | Regla |
|---|---|
| `document_line_id` | causa obligatoria |
| `product_id`, `inventory_source_id` | obligatorios |
| `serialized_asset_id` | según modo de control |
| `from_location_id`, `to_location_id` | al menos uno; distintos |
| `quantity` | positiva |
| `rental_operation_id`, `contract_id` | cuando el movimiento sea comercial |
| `reversal_of_movement_id` | único cuando sea reversión |
| `created_by`, `created_at` | inmutables |

No se almacenará un saldo editable. Las vistas sumarán entradas y salidas del ledger.

### `inventory_discrepancies`

| Columna | Regla |
|---|---|
| `rental_operation_id`, `contract_id` | contexto |
| `expected_quantity`, `received_quantity`, `missing_quantity` | consistentes |
| `status` | abierta, en revisión, resuelta o cancelada |
| `resolution_type` | devolución, reposición, venta desde renta o baja |
| `resolution_document_id` | obligatorio al resolver |

### `rental_operation_transfers` y `rental_operation_transfer_lines`

Documento `TOR` con OR origen/destino, motivo, autorización, producto y cantidad. Ambas OR deben pertenecer al mismo cliente y obra. Modifica únicamente la atribución administrativa del saldo; no inserta movimientos físicos.

### `document_files`

Guarda rutas privadas para firma, fotografía, PDF y soporte. Las fotografías son obligatorias en daño/baja; vehículo y operador son obligatorios cuando existe transporte.

## 10. Precios por pérdida y venta desde renta

### `custody_resolutions`

| Columna | Regla |
|---|---|
| `discrepancy_id` | incidencia de origen cuando aplique |
| `resolution_type` | `replacement_charge` o `rental_sale` |
| `product_id`, `quantity` | positivos |
| `replacement_price_snapshot` | precio vigente congelado |
| `condition_code`, `condition_factor` | venta voluntaria |
| `direct_costs`, `insurance_recovery` | pérdida |
| `subtotal`, `tax_rate`, `total` | cálculo exacto |
| `authorized_by`, `authorized_at` | administración |

Reglas:

- pérdida: 100 % de reposición + costos directos − seguro;
- venta: excelente 90 %, buena 75 %, regular 60 %, dañada manual;
- no se acreditan rentas pagadas automáticamente;
- resolver genera el movimiento a baja por pérdida o vendido, según corresponda.

## 11. Folios y auditoría

### `document_sequences`

PK: organización, código y año. Cada tipo reinicia en `000001` anualmente. Códigos: `OR`, `COT-R`, `COT-V`, `CTR-R`, `CTR-V`, `SS`, `HS`, `SE`, `HE`, `RHS`, `RHE`, `EA`, `TA`, `TOR`, `AJ`, `BI`.

### `master_data_sequences`

PK: organización y código, sin año. Mantiene consecutivos permanentes para `CLI` y `OBR`. La asignación se realizará dentro de la misma transacción que crea el cliente o la obra, con bloqueo de la fila de secuencia; los códigos emitidos nunca se reutilizan.

### `audit_events`

Append-only con organización, actor, acción, entidad, identificador, valores anterior/nuevo, motivo y fecha. No se concede actualización ni eliminación a clientes de aplicación.

## 12. Vistas derivadas

- `inventory_balances`: producto, fuente, activo y ubicación.
- `inventory_availability`: disponible menos reservas activas.
- `rental_operation_physical_balances`: HS − HE ± TOR por OR y producto.
- `rental_contract_coverage`: cantidades cubiertas por contrato, producto y fecha.
- `rental_uncovered_balances`: saldo físico menos cobertura, considerando gracia.
- `rental_operation_statuses`: estado derivado de contratos, saldos e incidencias.
- `sublease_commitments`: existencias subarrendadas, ubicación y fecha de devolución.

Todas las vistas expuestas deberán ejecutar con permisos del invocador.

## 13. Índices mínimos

- Todas las claves foráneas.
- `(organization_id, folio)` único en documentos.
- OR por cliente, obra y cierre.
- contratos por OR, estado y fechas.
- líneas por producto y vigencia.
- solicitudes por contrato, tipo y estado.
- fuentes por producto, propiedad y vigencia.
- movimientos por producto/fuente/ubicación/fecha.
- movimientos por OR/producto/fecha.
- reservas activas por producto, fuente y ubicación.
- incidencias abiertas por OR y producto.
- activos por serie y ubicación derivada.

Los índices parciales se usarán para registros activos, reservas no liberadas, incidencias abiertas y documentos pendientes.

## 14. Límites de seguridad

- RLS por organización y membresía activa en todas las tablas expuestas.
- Autorizaciones críticas únicamente mediante funciones transaccionales.
- `inventory_source_costs` sin permiso para almacén ni logística.
- Helpers de permisos en esquema privado, sin depender de `user_metadata`.
- Funciones privilegiadas con identidad explícita, `search_path` vacío y ejecución revocada por defecto.
- Storage privado con rutas `organization/document_type/document_id/...` y URLs firmadas.

## 15. Orden de implementación futura

1. Comparar este modelo con la migración existente y preparar un plan de transición de desarrollo.
2. Definir SQL de tablas y restricciones sin ejecutarlo.
3. Revisar RLS y funciones transaccionales.
4. Preparar pruebas de concurrencia, idempotencia y aislamiento.
5. Sólo después de aprobación, crear una migración mediante Supabase CLI.
