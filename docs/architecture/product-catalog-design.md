# Diseño del catálogo de productos

**Estado:** estructura, gobierno y recaptura aprobados; pendientes familias y reglas de variante
**Objetivo:** conservar un código compacto para operación y un SKU legible sin mezclar producto con propiedad del inventario

## 1. Identificadores del producto

Cada producto tendrá tres identificadores con responsabilidades distintas:

| Campo | Uso |
|---|---|
| `id` | UUID interno para relaciones de base de datos; no se captura manualmente |
| `catalog_code` | identificador visible de 10 dígitos, denominado “ID de catálogo” en la interfaz |
| `sku` | clave corta y legible para búsqueda, documentos y operación diaria |
| códigos históricos | una o varias claves anteriores para búsqueda y trazabilidad |

`catalog_code` y `sku` serán únicos dentro de la organización, pero ninguno sustituirá la llave interna UUID.

## 2. Estructura propuesta del código

```text
OO FF VVVVVV
│  │  └──── variante técnica de 6 dígitos
│  └─────── familia de 2 dígitos
└────────── origen técnico de 2 dígitos
```

### Origen técnico `OO`

- `01`: diseño o especificación de fabricación Andavalle;
- `02`: diseño, sistema o referencia comercial externa.

El origen técnico no indica si la existencia actual es propia o subarrendada. Esa información pertenece a `inventory_sources`, porque el mismo producto puede existir en lotes propios, comprados y subarrendados al mismo tiempo.

### Familia `FF`

Catálogo administrado de dos dígitos. Ejemplos iniciales:

- `01`: marcos;
- `10`: verticales.

Cada familia conserva nombre, prefijo sugerido de SKU y regla descriptiva de su variante.

Las familias forman un catálogo controlado. Sólo administración puede crearlas o autorizarlas. Una vez utilizado un código o prefijo, queda inmutable y no puede asignarse posteriormente a otra familia.

El código de familia será único dentro de toda la organización, no sólo dentro de su categoría. Por tanto, un código como `01` siempre identificará la misma familia en Andavalle.

### Variante `VVVVVV`

Código técnico de seis dígitos cuyo significado depende de la familia. Los marcos pueden codificar medidas como `156200`; los verticales pueden usar una referencia técnica como `217100`. Las dimensiones y referencias también se almacenarán en campos explícitos; la aplicación no dependerá de interpretar estos seis dígitos para hacer cálculos.

## 3. Ejemplos

### Marco de fabricación Andavalle

```text
origen técnico:  01
familia:         01
variante:        156200
catalog_code:    0101156200
sku:             MAR-156-200
descripción:     MARCO DE 156 X 200 CM
ancho:           1560 mm
alto:            2000 mm
```

### Vertical de sistema comercial externo

```text
origen técnico:  02
familia:         10
variante:        217100
catalog_code:    0210217100
sku:             VER-100-000
descripción:     VERTICAL DE 100 CM SISTEMA MULTIDIRECCIONAL
alto:            1000 mm
referencia externa: 217100
```

El segundo producto puede tener simultáneamente:

- un lote comprado y propiedad de Andavalle;
- otro lote subarrendado a un proveedor.

Ambos usan el mismo producto, código y SKU; `inventory_sources` distingue procedencia, propiedad, proveedor, vigencia y costo.

## 4. Estructura lógica

### `product_origin_classes`

- organización;
- código de dos dígitos;
- nombre y descripción;
- activo.

### `product_families`

- organización;
- categoría;
- código de dos dígitos;
- nombre;
- prefijo de SKU sugerido;
- descripción de la regla de variante;
- activo.

El SKU legible seguirá el formato `AAA-###-###`: tres letras de familia y dos grupos técnicos de tres caracteres. Un grupo sin uso se representa como `000`; por ejemplo, `MAR-156-200` y `VER-100-000`.

Tanto el código de catálogo como el SKU tendrán longitud fija. No se omitirán segmentos aunque la captura sea manual, para mantener búsquedas, impresión de etiquetas y validaciones uniformes.

### `product_categories`

- organización;
- nombre y descripción;
- orden de presentación;
- activo.

La categoría agrupa familias para navegación y reportes, pero no se codifica automáticamente dentro del identificador del producto. La jerarquía será categoría → familia → producto.

### Ampliaciones a `products`

- `origin_class_code`;
- `family_code`;
- `variant_code` de seis dígitos;
- `catalog_code` derivado de los tres segmentos;
- `sku` legible;
- descripción;
- tipo de ítem: inventario o servicio;
- unidad base enlazada al catálogo controlado de unidades;
- `width_mm`, `height_mm`, `length_mm` y peso cuando correspondan;
- modo de control por cantidad o serie;
- precio vigente de reposición.

### `product_external_references`

Permite conservar una o varias referencias por fabricante o proveedor sin hacer que la identidad del producto dependa de ellas:

- producto;
- fabricante o sistema;
- código externo;
- referencia principal;
- notas.

Varias marcas o referencias podrán apuntar al mismo producto únicamente cuando sean totalmente intercambiables en operación y precio. Compartir dimensiones no será suficiente. Los artículos incompatibles conservarán productos, códigos y SKU distintos.

### `product_legacy_codes`

Conserva una o varias claves del catálogo anterior por producto:

- organización;
- producto;
- código histórico;
- descripción o sistema de procedencia opcional.

Estos códigos sólo servirán para búsquedas y trazabilidad. No podrán usarse como identificador operativo ni sustituirán `catalog_code` o `sku`.

### `units_of_measure`

- organización;
- clave normalizada;
- nombre y símbolo visibles;
- precisión configurada en cero para cantidades enteras;
- activo.

La unidad base de cada producto se seleccionará de este catálogo. No se admitirán variantes escritas libremente como `pz`, `pza` y `pieza` para representar la misma unidad.

La unidad base será también la unidad comercial del producto. Cotizaciones, contratos, reservas y movimientos utilizarán la misma unidad y el MVP no realizará conversiones como piezas a metros cuadrados.

Todas las cantidades operativas serán enteras. El esquema rechazará fracciones en cotizaciones, contratos, reservas y movimientos de inventario.

El catálogo inicial habilitará únicamente unidades naturalmente contabilizables en enteros, como pieza, juego, paquete y rollo. Unidades que normalmente requieren fracciones, como metro o kilogramo, quedarán fuera del alcance inicial.

### Operación exclusivamente por SKU

El MVP no manejará kits, paquetes compuestos ni existencias agrupadas. Cada renglón de cotización, contrato, reserva y documento operativo corresponderá directamente a un SKU individual.

El catálogo distinguirá SKU de tipo `inventory` y `service`. Flete, montaje y otros servicios podrán cotizarse y contratarse, pero quedarán excluidos de reservas, existencias y movimientos del ledger.

Los servicios utilizarán el mismo formato fijo de `catalog_code` y `sku` que los productos de inventario, pero pertenecerán a familias específicas de servicios. Seguirán siendo identificados además por `item_type = service`.

En los servicios, el segmento de origen mantendrá su intención: `01` indicará prestación directa por Andavalle y `02` prestación subcontratada. Esto describe el servicio del catálogo, no genera inventario.

Una cotización tendrá una sola operación principal: renta o venta. No mezclará equipo rentado y vendido; cuando el cliente requiera ambos se generarán cotizaciones separadas. Los servicios sí podrán acompañar cualquiera de las dos.

### Precios base por SKU

Cada producto tendrá referencias independientes para renta y venta. Los cambios de precio conservarán vigencia e historial; las cotizaciones y contratos guardarán una fotografía del precio efectivamente aplicado, por lo que no cambiarán al actualizar el catálogo.

Sólo administración podrá capturar o modificar precios base de renta, venta y servicios. Comercial tendrá acceso de consulta y únicamente podrá aplicar los descuentos autorizados por las reglas comerciales.

Un cambio de precio no reescribirá cotizaciones en borrador. La interfaz advertirá que existe una referencia vigente distinta y permitirá actualizarla manualmente, conservando auditoría del cambio.

Las cotizaciones tendrán una vigencia comercial predeterminada de 15 días naturales desde su emisión. Comercial podrá ajustarla antes de enviarlas; esta vigencia es distinta del periodo operativo de renta de cada SKU.

Al alcanzar `valid_until`, una cotización enviada pasará a vencida y quedará bloqueada para aceptación. Comercial podrá duplicarla, pero deberá revisar precios, periodos y disponibilidad antes de emitir el nuevo documento.

Los cambios solicitados después del envío crearán una revisión inmutable bajo el mismo folio base, con sufijo `R01`, `R02`, etc. Sólo la revisión vigente podrá aceptarse; las anteriores permanecerán disponibles para trazabilidad.

La referencia de renta será un precio diario base. Se aplicará una tarifa mínima de cinco días y la siguiente tabla:

| Días | Factor |
|---|---:|
| 5–6 | 1.30 |
| 7–14 | 1.20 |
| 15–29 | 1.10 |
| 30–60 | 1.00 |
| 61 o más | 0.90 |

El importe será `precio diario × días × factor`, sujeto a un piso equivalente al importe máximo del rango anterior. Para un precio diario `P`, los pisos serán `6.5P`, `7.8P`, `16.8P`, `31.9P` y `60P`, respectivamente. Así una vigencia mayor nunca producirá un total menor.

Los factores serán globales para todos los SKU de la organización y configurables con historial. Una excepción en cotización requerirá motivo y autorización; el valor autorizado quedará congelado en la línea documental.

El descuento comercial adicional será independiente del factor por duración. Comercial podrá aplicar hasta 10 %; excederlo cambiará la cotización a pendiente de autorización administrativa. Se conservarán porcentaje, motivo, solicitante y autorizador.

El descuento será general para toda la cotización; el MVP no permitirá porcentajes distintos por SKU. Se aplicará únicamente al subtotal de equipo. Los SKU de servicio conservarán su precio completo. Las líneas conservarán su precio calculado y el encabezado almacenará el porcentaje general aplicado.

## 5. Validaciones

- `catalog_code` y `sku` serán capturados manualmente; el sistema no los generará ni los completará;
- cada segmento se guarda como texto para preservar ceros iniciales;
- `catalog_code` contiene exactamente 10 dígitos;
- familia y origen deben existir y estar activos al crear el producto;
- el código y el prefijo de familia son únicos por organización, aunque las familias pertenezcan a categorías distintas;
- la combinación origen + familia + variante es única por organización;
- SKU normalizado en mayúsculas y único por organización;
- SKU ajustado al patrón `^[A-Z]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$`;
- dimensiones no negativas y almacenadas en milímetros;
- el código no cambia después de tener movimientos; una corrección crea una recodificación auditada o un producto sustituto;
- propiedad, proveedor y vigencia nunca se deducen del código del producto.

## 6. Descripción y fotografía histórica

El sistema propondrá la descripción en mayúsculas a partir de familia, medidas y atributos. Podrá ajustarse antes de aprobar el producto. Después de utilizarse, cualquier corrección será auditada. Cotizaciones, contratos y documentos operativos conservarán una fotografía del SKU y la descripción vigentes al confirmarse, por lo que una corrección posterior del catálogo no reescribirá el historial.

## 7. Recaptura del catálogo actual

El catálogo se reconstruirá manualmente dentro del ERP; no se realizará una transformación masiva ni una importación directa a la base de datos.

1. Conservar el catálogo anterior únicamente como fuente de consulta.
2. Configurar primero los orígenes técnicos, familias y reglas de variante.
3. Recapturar cada producto con su código técnico, SKU, descripción y atributos.
4. Validar duplicados, equivalencias y compatibilidad antes de aprobarlo.
5. Aprobar individualmente cada registro para habilitarlo en operaciones.

Los códigos anteriores se capturarán en `product_legacy_codes`. Serán consultables para localizar productos y relacionar documentación histórica, pero no participarán en folios, movimientos ni reglas de inventario nuevas.

No se modificará el catálogo original durante la etapa de planeación.

## 8. Flujo de alta

1. Comercial o almacén propone el producto y sus atributos.
2. El usuario captura por completo el código y el SKU; el sistema valida formato, unicidad, familia, dimensiones y posibles duplicados.
3. Administración aprueba o rechaza la propuesta.
4. Sólo un producto aprobado puede aparecer en cotizaciones, contratos, entradas, reservas o movimientos.

## 9. Desactivación y sustitución

Un producto utilizado no se elimina. Se desactiva para impedir nuevas operaciones y puede relacionarse con un producto sustituto aprobado. Su código y SKU no se reutilizan; los documentos y movimientos históricos continúan apuntando al producto original.
