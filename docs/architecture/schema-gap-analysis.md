# Análisis de brechas — esquema actual vs. esquema lógico v2

**Estado:** planeación; no ejecuta cambios
**Fecha:** 2026-10-22
**Comparación:** migraciones locales actuales contra `logical-schema-v2.md`

## 1. Resultado ejecutivo

El prototipo actual es una base aprovechable, pero no debe considerarse todavía el esquema definitivo. Ya resuelve identidad multiempresa, roles, almacenes, clientes, obras, productos, contratos, solicitudes, HS/HE, reservas, ledger, folios, auditoría, RLS y Storage privado.

Para alcanzar el modelo aprobado se requiere:

- conservar 10 grupos de tablas fundamentales;
- ampliar 9 tablas existentes;
- reemplazar `contract_chains` por una OR formal;
- agregar 15 tablas o agregados nuevos;
- ampliar tipos de documentos y ubicaciones;
- rediseñar las funciones de autorización, renovación, confirmación y reversión;
- ajustar permisos para que coincidan con la matriz aprobada;
- añadir vistas de cobertura, procedencia, subarrendamiento y estado de OR.

No existe todavía información productiva que obligue a conservar compatibilidad histórica. Por ello, la opción técnicamente más limpia será reconstruir el esquema de desarrollo antes del lanzamiento, sujeto a aprobación expresa.

## 2. Elementos que pueden conservarse

| Área actual | Evaluación | Acción prevista |
|---|---|---|
| `organizations` | compatible | conservar |
| `profiles` | compatible | conservar |
| membresías y múltiples roles | compatible | conservar y revisar permisos |
| `branches` y `warehouses` | compatible | conservar |
| `customers` y `customer_sites` | compatibles | conservar y ampliar índices/reglas |
| `crm_leads` y `customer_activities` | compatibles con CRM ligero | conservar |
| `document_sequences` | coincide con secuencia por tipo/año | ampliar códigos |
| `audit_events` | base adecuada | conservar y aplicar a tablas nuevas |
| Storage privado | base adecuada | ampliar tipos de archivo y roles |
| helpers de organización/roles | patrón aprovechable | revisar exposición y capacidades |

## 3. Tablas existentes que requieren ampliación

| Tabla | Brecha | Cambio conceptual |
|---|---|---|
| `products` | no distingue cantidad/serie ni precio de reposición | añadir `tracking_mode`, precio y fecha de actualización |
| `inventory_locations` | no existe tránsito y la condición está mezclada con tipo | incluir tránsito y validar almacén/obra según tipo |
| `contracts` | depende de cadena vacía, no tiene cotización ni propósito | relacionar con OR/cotización, propósito y justificación |
| `contract_lines` | sin vigencia, tarifa periódica, gracia ni linaje por línea | agregar reglas de cobro, fechas y `previous_contract_line_id` |
| `operation_requests` | no conserva OR ni disponibilidad para recolección | agregar OR y campos de SE/cobro |
| `operation_request_lines` | sólo guarda cantidad original | agregar procesada, pendiente y validaciones de saldo |
| `inventory_documents` | sólo HS/HE y siempre exige solicitud | soportar EA/TA/AJ/BI y reversión documental independiente |
| `inventory_document_lines` | no conoce condición, fuente o asignaciones | agregar clasificación y tabla de asignaciones |
| `inventory_movements` | no conoce procedencia, activo ni línea causante | agregar fuente, activo, línea, contrato y OR formal |
| `stock_reservations` | sólo reserva producto/ubicación | asignar fuentes y activos mediante tabla hija |
| `document_files` | sólo firma/foto/PDF y sólo inventario | ampliar soportes o separar adjuntos por agregado |

## 4. Sustitución de `contract_chains`

### Situación actual

`contract_chains` sólo contiene identificador, organización y fecha. Agrupa renovaciones, pero no representa cliente, obra, nombre, folio, cierre ni reglas propias.

### Objetivo

`rental_operations` será una entidad de negocio completa con:

- folio OR;
- cliente y obra inmutables después del primer movimiento;
- nombre de frente o etapa;
- cancelación y cierre formal;
- evidencia para cierres excepcionales;
- estado derivado de contratos, cobertura, saldo e incidencias.

### Impacto

Debe sustituirse `contract_chain_id` por `rental_operation_id` en contratos, solicitudes, movimientos, vistas y funciones. No se recomienda mantener ambas entidades en paralelo.

## 5. Entidades faltantes

| Entidad objetivo | Motivo |
|---|---|
| `customer_contacts` | múltiples contactos y contacto principal |
| `crm_sources` | catálogo controlado de orígenes comerciales |
| `crm_loss_reasons` | catálogo controlado de motivos de pérdida |
| `crm_assignment_history` | historial append-only de reasignaciones |
| `master_data_sequences` | códigos permanentes `CLI` y `OBR` sin reinicio anual |
| `suppliers` | compras y subarrendamientos |
| `quotations` | cotización, OR nueva/existente, aceptación y conversión |
| `quotation_lines` | tarifas y vigencias por SKU |
| `rental_operations` | folio raíz de renta |
| `rental_billing_events` | inicio/fin cobrable de entregas parciales |
| `inventory_sources` | propiedad y procedencia por lote |
| `inventory_source_costs` | costos con acceso restringido |
| `serialized_assets` | maquinaria y equipo individual |
| `reservation_allocations` | reserva por fuente o activo |
| `inventory_document_allocations` | mezcla interna de equipo propio/subarrendado |
| `inventory_discrepancies` | faltantes de HE sin baja automática |
| `rental_operation_transfers` | cabecera TOR |
| `rental_operation_transfer_lines` | cantidades transferidas entre OR |
| `custody_resolutions` | reposición o venta desde renta |

### Brechas del CRM inicial

- `crm_leads` debe evolucionar de prospecto simple a oportunidad, añadir cliente/obra opcionales, etapas completas, origen controlado, motivo de pérdida, vínculo con oportunidad anterior, consentimiento y archivo lógico.
- `customer_activities` debe controlar tipos, cancelación y la regla de siguiente seguimiento.
- `customers` requiere tipo de persona, normalización de RFC e índice único parcial para clientes activos.
- `customer_contacts`, códigos permanentes de cliente/obra y relación obligatoria cotización-oportunidad aún no existen.
- Las políticas actuales permiten escritura comercial general; deberán separar lectura organizacional de edición por responsable.

## 6. Tipos y estados

### Tipos actuales insuficientes

- `inventory_document_type` sólo acepta HS y HE.
- `location_type` no contempla tránsito.
- no existen tipos de cotización, propósito, propiedad, procedencia, control serial, incidencias o resoluciones.

### Recomendación

En la reconstrucción v2, usar texto con restricciones `check` para estados que todavía evolucionarán. Mantener enums sólo donde el catálogo sea realmente estable. Esto evita recrear tipos PostgreSQL por cada ajuste durante el diseño inicial.

## 7. Brechas en funciones transaccionales

| Función actual | Brecha | Reemplazo o ajuste |
|---|---|---|
| `authorize_contract` | permite comercial y no valida cotización/OR/superposición | autorización administrativa y validación completa |
| `authorize_request` | permite comercial; reserva sólo por producto/ubicación | almacén autoriza y asigna fuentes/activos |
| `confirm_inventory_document` | sólo HS/HE; sin procedencia, serie o incidencias | despachador por tipo de documento y confirmadores especializados |
| `reverse_inventory_document` | marca el original y registra movimientos bajo el mismo documento | crear RHS/RHE con folio propio y movimientos compensatorios |
| `renew_contract` | copia todas las líneas sin diferencias ni vigencias por SKU | crear renovación editable, linaje por línea y propuestas SS/SE |
| `close_contract` | cierra contrato/cadena; permite comercial en casos normales | cierre de OR separado, saldo resuelto y autorización administrativa |

### Funciones nuevas previstas

- aceptar cotización y convertirla en contrato/OR;
- confirmar EA y crear fuentes/activos;
- despachar y recibir TA;
- autorizar TOR;
- proponer y autorizar AJ/BI;
- resolver una incidencia por devolución, reposición o venta;
- cerrar OR;
- recalcular o consultar cobertura sin editar estados derivados.

## 8. Brechas de permisos y RLS

### Diferencias detectadas

- El esquema actual permite al comercial autorizar contratos; la regla aprobada lo reserva al administrador.
- Comercial, almacén y logística tienen escritura amplia sobre solicitudes; la regla aprobada separa creación, programación y autorización.
- Comercial participa actualmente en reservas; en v2 las reservas nacen únicamente de autorización de almacén.
- Todos los usuarios autenticados reciben lectura de casi todas las tablas; los costos de compra/subarrendamiento deben restringirse.
- Las concesiones directas de inserción/actualización permiten demasiado acceso a tablas de flujo, aunque existan triggers protectores.

### Objetivo

- lectura por organización y membresía activa;
- escritura de borradores según capacidad;
- transiciones críticas exclusivamente por funciones transaccionales;
- tabla separada de costos para administración/comercial;
- ledger, auditoría y documentos confirmados sin actualización ni eliminación;
- políticas `UPDATE` con condiciones de lectura y validación de estado final;
- índices en todas las columnas usadas por RLS.

## 9. Brechas del ledger e inventario

### Lo que ya existe

- ledger append-only protegido por trigger;
- saldo derivado por vista;
- reservas separadas;
- bloqueos transaccionales por producto;
- confirmación idempotente básica.

### Lo que falta

- procedencia y propiedad;
- lotes de compra/subarrendamiento;
- activos serializados;
- asignaciones de reservas y documentos;
- restricción de vigencia del subarrendamiento;
- recepción EA;
- transferencia TA con tránsito;
- ajuste y baja documentados;
- TOR sin movimiento físico;
- incidencias y resoluciones de custodia;
- separación entre saldo físico, saldo por OR y cobertura contractual.

## 10. Vistas actuales y objetivo

| Vista | Situación |
|---|---|
| `inventory_balances` | conservar concepto; agrupar también por fuente/activo |
| `inventory_availability` | conservar concepto; descontar asignaciones activas |
| estado de OR | falta |
| saldo físico por OR | falta |
| cobertura contractual | falta |
| equipo sin cobertura | falta |
| compromisos de subarrendamiento | falta |

Las vistas existentes ya usan comportamiento de invocador, patrón que debe conservarse.

## 11. Índices

La migración actual cubre muchas claves foráneas, pero el v2 requerirá índices adicionales:

- OR por cliente/obra/fecha de cierre;
- cotizaciones por cliente, obra, estado y creación;
- líneas contractuales por producto y vigencia;
- fuentes por producto, propiedad y vencimiento;
- movimientos por fuente, activo y OR;
- asignaciones activas de reservas;
- incidencias abiertas;
- activos por serie;
- costos por fuente;
- columnas usadas en políticas RLS.

Antes de escribir SQL se revisará de forma automática que ninguna clave foránea quede sin índice.

## 12. Pruebas que deben cambiar

Las pruebas actuales de esquema, RLS y flujo son reutilizables como base, pero deben ampliarse para cubrir:

1. cotización aceptada crea exactamente un contrato y, si corresponde, una OR;
2. OR no mezcla cliente u obra;
3. ampliación permite traslape y renovación evita duplicidad accidental;
4. almacén, no comercial, autoriza SS/SE;
5. reservas no exceden disponibilidad por fuente;
6. equipo subarrendado no se compromete después de su devolución;
7. activos serializados no pueden estar simultáneamente en dos ubicaciones;
8. EA/TA/AJ/BI generan movimientos correctos;
9. RHS/RHE no duplican reversión;
10. una HE incompleta abre incidencia y conserva saldo;
11. TOR cambia atribución de OR sin cambiar saldo físico global;
12. almacén no puede leer costos;
13. cierres excepcionales exigen evidencia y saldo resuelto;
14. aislamiento completo entre organizaciones.

## 13. Estrategias posibles de transición

### A. Migración incremental

Ventajas:

- conserva los datos actuales;
- permite desplegar cambios gradualmente.

Desventajas:

- requiere migrar `contract_chains`, enums, funciones, políticas y movimientos existentes;
- aumenta el riesgo de estados temporales incompatibles;
- ofrece poco beneficio si sólo existen semillas ficticias.

### B. Reconstrucción del entorno de desarrollo — recomendada

Ventajas:

- crea una línea base coherente con el modelo aprobado;
- elimina compatibilidad innecesaria con el prototipo;
- simplifica restricciones, RLS y pruebas;
- las semillas ficticias pueden regenerarse.

Condiciones:

- confirmar que Supabase sigue siendo exclusivamente desarrollo;
- exportar cualquier catálogo real que ya se haya capturado;
- conservar las migraciones actuales en Git antes de reemplazarlas;
- ejecutar el reinicio sólo después de aprobación expresa.

## 14. Orden propuesto para la transición futura

1. Inventariar el estado real del proyecto Supabase de desarrollo.
2. Exportar catálogos que deban conservarse.
3. Congelar el esquema lógico y la matriz RLS.
4. Preparar una línea base v2 sin ejecutarla.
5. Preparar semillas reproducibles.
6. Ejecutar pruebas locales completas.
7. Revisar asesores de seguridad y rendimiento.
8. Solicitar aprobación para reiniciar desarrollo.
9. Aplicar y validar en Supabase de desarrollo.
10. Mantener producción separada hasta el corte físico inicial.

## 15. Decisión aprobada

Se reconstruirá controladamente el entorno de desarrollo y se preservarán únicamente los catálogos útiles que se identifiquen antes del reinicio. No se migrarán operaciones ficticias ni se mantendrá compatibilidad innecesaria con el esquema prototipo.

Se conservarán la organización, sucursal, almacén y el catálogo real de productos, pero este último se normalizará y recodificará antes de importarlo a la línea base v2. Los usuarios y las operaciones ficticias podrán regenerarse.

Esta decisión no autoriza todavía a reiniciar Supabase. Antes deberán existir una exportación verificada, línea base v2 revisada, semillas reproducibles, pruebas locales y aprobación expresa para ejecutar el cambio.
