# Andavalle — Operaciones de renta, cotizaciones y folios

**Estado:** cuestionarios de operaciones de renta e inventario validados
**Objetivo:** definir la lógica antes de modificar base de datos o interfaz
**Última revisión:** 2026-10-22

## 1. Decisiones acordadas

### Operación de renta (OR)

Una **Operación de Renta (OR)** es la identidad permanente de una renta. Es la evolución formal del concepto de `folio raíz`, pero contiene información operativa propia.

- Aplica únicamente a renta, no a venta.
- Pertenece a una organización, cliente y obra.
- Un cliente puede tener varias obras.
- Una obra puede tener varias OR independientes.
- Una OR puede contener varios contratos: inicial, renovaciones y ampliaciones.
- Renovar un contrato no mueve inventario.
- El saldo físico se calcula con los movimientos confirmados de toda la OR.

```text
OR-2026-000001 · Cliente A · Obra Torre Norte
├── CTR-R-2026-000001 · periodo inicial
├── CTR-R-2026-000014 · renovación
├── SS / HS · entregas
└── SE / HE · devoluciones
```

### Momento de creación

1. En CRM se crea una cotización de renta.
2. Después de seleccionar cliente y obra, se muestran las OR activas relacionadas.
3. El comercial indica si la cotización corresponde a una OR existente o a una nueva.
4. Si es nueva, la OR **no se crea todavía**: la cotización conserva la intención `nueva OR`.
5. La OR se crea cuando la cotización aceptada se convierte en el primer contrato de renta.

### Relaciones documentales

```text
OR
└── Contrato
    └── Solicitud SS o SE
        └── Hoja HS o HE
```

- El contrato pertenece a una OR.
- SS y SE guardan la OR y el contrato que las originó.
- HS y HE pertenecen a una solicitud e heredan su OR y contrato.
- El saldo físico se consulta por OR, no únicamente por contrato.
- Venta usa contratos/documentos de venta independientes y no crea OR.

### Corrección de una OR mal asignada

- Contrato en borrador: puede cambiarse de OR con auditoría.
- Contrato autorizado sin solicitudes ni movimientos: sólo un administrador puede reasignarlo, indicando motivo.
- Contrato con solicitudes pero sin HS ni HE confirmadas: un administrador cancelará primero las solicitudes, liberará las reservas y después podrá reasignarlo a una OR de la nueva obra del mismo cliente; deberá crearse una nueva SS.
- Contrato con movimientos físicos confirmados: no se reasigna directamente; deberá documentarse la devolución y una nueva salida, o utilizarse una transferencia controlada únicamente cuando no cambie la obra.
- Nunca se reescribe el historial de movimientos confirmados.

## 2. Lógica preliminar de renovaciones

Una renovación crea un contrato nuevo dentro de la misma OR. Sus partidas pueden ser distintas a las del contrato anterior.

Por cada SKU:

```text
saldo físico = HS confirmadas − HE confirmadas ± ajustes autorizados
cantidad cubierta = cantidad incluida en el contrato vigente
pendiente de devolución = máximo(saldo físico − cantidad cubierta, 0)
pendiente de entrega = máximo(cantidad cubierta − saldo físico, 0)
```

- Renovación igual al saldo físico: no requiere movimiento.
- Renovación menor al saldo físico: puede originar una SE en borrador por la diferencia.
- Renovación mayor al saldo físico: puede originar una SS en borrador por la diferencia.
- Las solicitudes generadas como propuesta nunca se autorizan automáticamente.
- Terminar un periodo contractual no implica cerrar la OR.
- La OR sólo puede cerrarse cuando su saldo físico sea cero y no existan documentos operativos pendientes, salvo excepción administrativa auditada.

## 3. Propuesta inicial de nomenclaturas

Formato recomendado:

```text
TIPO-AÑO-SECUENCIA
```

La secuencia tendría seis dígitos, sería independiente por tipo de documento y reiniciaría cada año.

| Entidad o documento | Prefijo propuesto | Ejemplo |
|---|---|---|
| Operación de renta | `OR` | `OR-2026-000001` |
| Cotización de renta | `COT-R` | `COT-R-2026-000001` |
| Cotización de venta | `COT-V` | `COT-V-2026-000001` |
| Contrato de renta | `CTR-R` | `CTR-R-2026-000001` |
| Contrato de venta | `CTR-V` | `CTR-V-2026-000001` |
| Solicitud de salida | `SS` | `SS-2026-000001` |
| Hoja de salida | `HS` | `HS-2026-000001` |
| Solicitud de entrada | `SE` | `SE-2026-000001` |
| Hoja de entrada | `HE` | `HE-2026-000001` |
| Ajuste de inventario | `AJ` | `AJ-2026-000001` |
| Transferencia entre operaciones | `TOR` | `TOR-2026-000001` |

Reglas propuestas:

- El folio es único dentro de la organización y tipo documental.
- Cliente, obra, sucursal y estado no se codifican dentro del folio.
- Una renovación recibe un nuevo folio `CTR-R`; no usa sufijos como `-R1`.
- El vínculo entre contratos se obtiene por OR y `previous_contract_id`.
- Cancelar no libera el folio para reutilización.
- Los folios se asignan al crear el documento formal; una vista previa puede mostrar `Pendiente`.

## 4. Cuestionario del proceso

Responder debajo de cada pregunta. Las respuestas se convertirán después en reglas, estados y restricciones de base de datos.

### A. Operación de renta

1. ¿Una OR corresponde siempre a una sola obra y dirección durante toda su vida?
   - **Recomendación:** sí; si cambia la obra, crear otra OR.
   - **Respuesta:** Sí. Cada OR pertenece a una sola obra y dirección; un cambio requiere una OR nueva.

2. ¿Puede una obra tener varias OR activas al mismo tiempo?
   - Ejemplo: diferentes frentes, responsables o presupuestos.
   - **Respuesta:** Sí. Una obra puede mantener varias OR activas simultáneamente.

3. ¿Qué dato distingue dos OR de la misma obra: nombre del frente, centro de costo, responsable, etapa u otro?
   - **Respuesta:** Cada OR tendrá un nombre o descripción obligatoria, por ejemplo `Fachada norte` o `Etapa 2`.

4. ¿Qué estados necesita una OR?
   - Propuesta: `planeada`, `activa`, `pendiente_devolucion`, `cerrada`, `cancelada`.
   - **Respuesta:** Se aceptan los estados propuestos. El estado de la OR dependerá de sus contratos y de las entregas y devoluciones relacionadas; no se modificará libremente.

5. ¿Una OR cerrada puede reabrirse o siempre debe crearse otra?
   - **Recomendación:** no reabrir; crear una nueva OR.
   - **Respuesta:** No se reabre. Una nueva necesidad deberá registrarse en una OR nueva.

### B. Cotización y contrato

6. Al cotizar sobre una OR existente, ¿qué motivos deben distinguirse?
   - Propuesta: renovación, ampliación de equipo, cambio de condiciones o reposición.
   - **Respuesta:** Renovación, ampliación de equipo, cambio de condiciones, reposición y `otro`. La opción `otro` requerirá una explicación. Cuando el cliente solicite equipo adicional para una OR abierta, se clasificará como ampliación y generará un contrato nuevo asociado a la misma OR.

7. ¿Toda cotización aceptada genera un contrato nuevo?
   - **Respuesta:** Sí. Cada cotización aceptada genera un contrato nuevo, incluso cuando se relaciona con una OR existente.

8. ¿El precio de renta se pacta por todo el periodo o usa tarifa diaria, semanal o mensual?
   - **Respuesta:** Será flexible por contrato y producto. El panel de cotización permitirá establecer una vigencia general y, cuando sea necesario, una vigencia particular para cada SKU; la vigencia particular tendrá prioridad sobre la general.

9. ¿Una renovación puede cambiar cantidades, tarifas, descuentos y fechas?
   - **Respuesta:** Sí. Una renovación puede modificar cantidades, tarifas, descuentos, fechas y vigencias por SKU. El contrato anterior permanece inmutable como historial.

10. ¿Quién prepara, revisa y autoriza el contrato? ¿Puede una persona autorizar su propio contrato?
    - **Respuesta:** El comercial prepara y el administrador autoriza. Si sólo existe un administrador, podrá autorizar un contrato preparado por él mismo, pero deberá indicar una justificación y la acción quedará auditada.

11. ¿Se permiten contratos o renovaciones con vigencias superpuestas dentro de una OR?
    - **Recomendación:** no, salvo una ampliación expresamente diferenciada.
    - **Respuesta:** Sí, únicamente cuando corresponda a una ampliación, a cantidades adicionales o a SKU diferentes. El contrato de ampliación tendrá condiciones y vigencia propias y sólo solicitará la salida del equipo incremental. En una renovación, el sistema advertirá y evitará la duplicidad accidental de cantidades y periodos ya cubiertos.

### C. Entregas y devoluciones

12. ¿Quién crea y quién autoriza una SS?
    - **Respuesta:** El comercial crea la SS y almacén la revisa y autoriza. El administrador podrá intervenir excepcionalmente y la acción quedará auditada.

13. ¿Quién crea y quién autoriza una SE?
    - **Respuesta:** El comercial crea la SE, logística programa la recolección y almacén la autoriza. El administrador podrá intervenir excepcionalmente con auditoría.

14. Cuando una renovación aumenta cantidades, ¿el sistema debe proponer automáticamente una SS en borrador?
    - **Respuesta:** Sí. El sistema propondrá una SS en borrador únicamente por las cantidades adicionales; deberá revisarse y autorizarse mediante el flujo normal.

15. Cuando una renovación reduce cantidades, ¿debe proponer automáticamente una SE en borrador?
    - **Respuesta:** Sí. El sistema propondrá una SE en borrador por la diferencia a devolver; deberá seguir el flujo normal de programación y autorización.

16. ¿Puede recibirse equipo mediante HE sin una SE previa por devolución espontánea o emergencia?
    - **Respuesta:** Sí, excepcionalmente, indicando motivo y dejando auditoría. La HE se utilizará exclusivamente para devoluciones de renta y permanecerá vinculada con la OR y el contrato. Las compras, subarrendamientos, inventario inicial, transferencias y ajustes utilizarán documentos de entrada independientes, aunque todos generarán movimientos en el mismo ledger de inventario. El inventario distinguirá equipo propio, subarrendado y de terceros en custodia.

17. ¿La HE clasifica inmediatamente cada cantidad como disponible, inspección, mantenimiento, dañada o baja?
    - **Respuesta:** Sí. Al confirmar la HE deberá clasificarse toda la cantidad recibida como disponible, inspección, mantenimiento, dañada o baja. Cuando aún no se conozca su condición, se registrará en inspección y no podrá reservarse para otra renta.

18. ¿Qué evidencia es obligatoria en HS y HE: nombre, firma, fotografías, PDF, placas, operador u otra?
    - **Respuesta:** En HS y HE serán obligatorios el nombre y la firma, fotografías generales y fotografías específicas cuando exista daño. El sistema generará el PDF del documento. Los datos de vehículo y operador serán obligatorios cuando exista transporte asociado.

### D. Vigencia, excedentes y cierre

19. ¿En qué momento inicia el cobro: fecha contractual, salida física u otra fecha acordada?
    - **Respuesta:** Cada SKU podrá tener una fecha de inicio de cobro acordada. Por defecto será la fecha de su entrega física confirmada mediante HS; cualquier excepción deberá justificarse y quedará auditada.

20. ¿En qué momento termina: vencimiento, solicitud de recolección o entrada física?
    - **Respuesta:** El cobro termina cuando el cliente pone efectivamente el equipo a disposición mediante una SE autorizada. Si el cliente impide o retrasa la recolección, continuará hasta la HE. Los retrasos de recolección imputables a Andavalle no generarán cobro adicional.

21. ¿Existe periodo de gracia para equipo no renovado que continúa en obra?
    - **Respuesta:** Sí. Para cada SKU con vigencia mínima de 15 días, la gracia será el 10 % de su vigencia, redondeada hacia arriba, con un mínimo de 2 y un máximo de 5 días. Las vigencias menores de 15 días no tendrán gracia. La gracia permite formalizar la renovación, pero no representa días gratuitos: si se renueva, el contrato nuevo comenzará al terminar el anterior.

22. ¿En el primer MVP sólo se mostrará el equipo descubierto o también se calculará su cargo monetario?
    - **Recomendación:** mostrar cantidades y días; diferir facturación/cobranza.
    - **Respuesta:** El MVP mostrará los SKU, las cantidades y los días sin cobertura. No calculará cargos monetarios ni incluirá facturación o cobranza.

23. ¿Quién puede cerrar una OR con saldo físico o documentos pendientes?
    - **Recomendación:** únicamente administrador, con motivo y auditoría.
    - **Respuesta:** Únicamente un administrador, indicando motivo y adjuntando evidencia. Antes del cierre, un movimiento controlado deberá resolver o transferir cualquier saldo físico y los documentos pendientes deberán resolverse o cancelarse. Todo quedará auditado.

### E. Folios

24. ¿Se aprueba el formato `TIPO-AÑO-000001`?
    - **Respuesta:** Sí. Se utilizará el formato `TIPO-AÑO-000001`, por ejemplo `OR-2026-000001`, sin incluir cliente, obra ni sucursal en el folio.

25. ¿Las secuencias reinician cada año o deben ser consecutivas permanentes?
    - **Respuesta:** Las secuencias reiniciarán cada año en `000001`.

26. ¿Cada tipo documental tiene su propia secuencia?
    - **Recomendación:** sí.
    - **Respuesta:** Sí. Cada tipo documental tendrá su propia secuencia anual independiente.

27. ¿Debe incluirse un código de sucursal en el folio aunque inicialmente sólo exista una?
    - **Recomendación:** no; guardar sucursal como dato separado.
    - **Respuesta:** No. La sucursal se guardará como un campo separado y no formará parte del folio.

28. ¿Los prefijos propuestos (`OR`, `COT-R`, `CTR-R`, `SS`, `HS`, `SE`, `HE`) son claros para los usuarios?
    - **Respuesta:** Sí. Se conservarán los prefijos `OR`, `COT-R`, `COT-V`, `CTR-R`, `CTR-V`, `SS`, `HS`, `SE` y `HE`.

29. ¿Una corrección posterior a la confirmación necesita un folio propio de reversión?
    - Propuesta: `RHS` para reversión de salida y `RHE` para reversión de entrada.
    - **Respuesta:** Sí. Se crearán documentos compensatorios con folio `RHS` o `RHE`, vinculados al documento original. Los documentos confirmados no se editarán directamente.

30. ¿Hay folios utilizados actualmente por Andavalle que deban conservarse o evitarse?
    - **Respuesta:** No. Andavalle iniciará con la nomenclatura y las series nuevas definidas en este documento.

## 5. Criterio para cerrar esta definición

Antes de modificar el esquema deberán quedar respondidos, como mínimo:

- alcance de una OR;
- cálculo y periodicidad de renta;
- responsables de autorización;
- tratamiento de ampliaciones y renovaciones parciales;
- inicio y fin del cobro;
- condiciones de cierre;
- formato y secuencia de folios.

Después se preparará un modelo entidad-relación y las máquinas de estado definitivas para aprobación.

## 6. Cuestionario complementario de inventario

Este bloque definirá los movimientos que no provienen directamente de contratos de clientes: compras, subarrendamientos, inventario inicial, transferencias, ajustes y bajas.

31. ¿Las compras, subarrendamientos e inventario inicial utilizarán un documento común de Entrada de Almacén o documentos completamente separados?
    - **Respuesta:** Utilizarán un documento común de Entrada de Almacén (`EA`), separado de la HE, con un subtipo y campos específicos según el origen: compra, subarrendamiento, inventario inicial u otro ingreso autorizado.

32. ¿Una entrada por compra requerirá una orden de compra previa en el MVP?
    - **Respuesta:** No en el MVP. Serán obligatorios el proveedor y una referencia externa; el modelo quedará preparado para relacionar posteriormente la entrada con una orden de compra.

33. ¿Qué datos serán obligatorios para recibir equipo subarrendado?
    - **Respuesta:** Proveedor, contrato o referencia externa, vigencia, fecha prevista de devolución, SKU, cantidad, tarifa o costo y evidencia adjunta. La propiedad del equipo quedará identificada como subarrendada.

34. ¿El equipo subarrendado podrá reservarse y entregarse a clientes igual que el equipo propio?
    - **Respuesta:** Sí. Utilizará el mismo flujo SS/HS, conservando la trazabilidad del proveedor y de su vigencia. No podrá reservarse ni comprometerse más allá de su fecha prevista de devolución sin una ampliación del subarrendamiento.

35. ¿Una misma SS y HS podrán combinar equipo propio y subarrendado?
    - **Respuesta:** Sí. El cliente recibirá una sola SS/HS y el sistema conservará internamente el origen, propietario y asignación de cada cantidad.

36. ¿Las transferencias entre almacenes utilizarán salida y recepción separadas?
    - **Respuesta:** Sí. Un solo folio de transferencia controlará la salida del almacén origen, el estado `en tránsito` y la recepción confirmada por el almacén destino.

37. ¿Quién puede crear y autorizar ajustes de inventario?
    - **Respuesta:** Almacén propone y el administrador autoriza. Si sólo existe un administrador, podrá realizar ambas acciones con una justificación obligatoria y auditoría.

38. ¿Qué evidencia se exigirá para ajustes y bajas?
    - **Respuesta:** Motivo, cantidades anterior y nueva, documento soporte y responsable. Las fotografías serán obligatorias cuando el movimiento se deba a daño o baja.

39. ¿Qué productos se controlarán por cantidad y cuáles por número de serie o activo individual?
    - **Respuesta:** Se utilizará un modelo híbrido configurable por producto. Las piezas comunes se controlarán por cantidad y los equipos relevantes por número de serie o activo individual.

40. ¿El MVP calculará costos y valuación o sólo cantidades, propiedad, ubicación y condición?
    - **Respuesta:** El MVP controlará cantidades, propiedad, ubicación, condición y disponibilidad. No realizará valuación contable; los costos capturados como referencia quedarán disponibles para módulos futuros.

41. ¿Qué prefijos se utilizarán para entradas, transferencias, ajustes y bajas?
    - **Respuesta:** Se utilizarán `EA` para Entrada de Almacén, `TA` para Transferencia de Almacén, `AJ` para Ajuste de Inventario y `BI` para Baja de Inventario.

42. ¿Qué productos se controlarán inicialmente por número de serie?
    - **Respuesta:** Los andamios, componentes y accesorios comunes se controlarán por cantidad. La maquinaria, los vehículos y el equipo especial se controlarán por número de serie o activo individual.

43. ¿Qué información mínima se guardará de un proveedor y de su documento soporte?
    - **Respuesta:** Razón social o nombre, RFC cuando aplique, contacto, teléfono o correo y documento soporte —contrato, factura, remisión u orden— con su referencia y archivo adjunto.

44. ¿Cómo se transferirá equipo entre dos OR?
    - **Respuesta:** Se utilizará un documento `TOR` sin movimiento físico únicamente entre OR del mismo cliente y obra, con autorización administrativa, motivo y auditoría. Servirá especialmente para corregir una asignación o cambiar el equipo de etapa. Si cambia la obra, deberán documentarse la devolución y la nueva salida física.

45. ¿Cómo se tratarán faltantes detectados al confirmar una HE?
    - **Respuesta:** La HE registrará únicamente la cantidad recibida y abrirá una incidencia por la diferencia. El faltante continuará como saldo pendiente de la OR hasta resolverse mediante devolución, cargo por reposición o venta desde renta autorizada. No se dará de baja automáticamente.

46. ¿Cómo se calcularán el cargo por reposición y la venta desde renta?
    - **Respuesta:** El cargo por pérdida será el 100 % del precio actual de reposición, más costos directos aplicables y menos recuperaciones de seguro. La venta voluntaria partirá del precio actual de reposición multiplicado por condición: 90 % excelente, 75 % buena y 60 % regular; el equipo dañado requerirá valuación manual. Ambos casos necesitan autorización administrativa y las rentas pagadas no se descuentan automáticamente.

47. ¿Quién podrá consultar costos de compra y subarrendamiento?
    - **Respuesta:** Administración y comercial podrán consultar costos. Almacén sólo verá proveedor, propiedad y vigencia necesarios para operar el inventario.

48. ¿La transición al esquema v2 será incremental o mediante reconstrucción del entorno de desarrollo?
    - **Respuesta:** Se realizará una reconstrucción controlada de Supabase de desarrollo, conservando únicamente los catálogos útiles. El reinicio requerirá respaldo, pruebas locales y autorización posterior expresa.

49. ¿Qué datos se conservarán antes de reconstruir desarrollo?
    - **Respuesta:** Se conservarán el catálogo real de productos y la configuración de organización, sucursal y almacén. El catálogo de productos será reestructurado y recodificado antes de importarse. Los usuarios y las operaciones ficticias podrán regenerarse.

50. ¿Qué representarán los primeros dos dígitos del código de catálogo?
    - **Respuesta:** Representarán el origen técnico: `01` para diseño o fabricación Andavalle y `02` para sistema o referencia comercial externa. La propiedad y procedencia de cada existencia se controlarán separadamente por lote.

51. ¿Cómo se interpretarán los últimos seis dígitos?
    - **Respuesta:** Tendrán una regla específica por familia. Por ejemplo, marcos podrán usar medidas como `156200` y verticales una referencia técnica como `217100`. Las dimensiones y referencias también se guardarán en campos separados; la lógica no dependerá de analizar el código.

52. ¿Qué formato tendrá el SKU legible?
    - **Respuesta:** Se utilizará `AAA-###-###`: prefijo de familia y dos grupos técnicos de tres caracteres. Cuando un grupo no aplique se completará con `000`, por ejemplo `MAR-156-200` y `VER-100-000`.

53. ¿Cómo se administrarán las familias de productos?
    - **Respuesta:** Serán un catálogo controlado. El administrador creará o autorizará nuevas familias; sus códigos y prefijos quedarán inmutables después de usarse y nunca se reutilizarán.

54. ¿Cómo se generará la descripción del producto?
    - **Respuesta:** El sistema propondrá la descripción a partir de familia, medidas y atributos. Podrá ajustarse antes de aprobar el producto; después sólo cambiará con auditoría. Los documentos conservarán la descripción histórica utilizada al confirmarse.

55. ¿Cuándo compartirán producto dos artículos de distinta marca o referencia?
    - **Respuesta:** Compartirán producto sólo cuando sean totalmente intercambiables en operación y precio. Las distintas marcas o referencias se asociarán al mismo producto; si no son compatibles, se crearán productos separados aunque tengan las mismas medidas.

56. ¿Quién podrá crear y aprobar productos nuevos?
    - **Respuesta:** Comercial o almacén podrán proponerlos. El administrador aprobará código, SKU, familia y atributos; sólo los productos aprobados podrán utilizarse en cotizaciones o movimientos.

57. ¿Qué ocurrirá cuando un producto utilizado deje de manejarse?
    - **Respuesta:** Se desactivará y nunca se eliminará ni reutilizará su código. Podrá enlazarse con un producto sustituto para orientar nuevas operaciones, conservando intacto el historial.

58. ¿Cómo se reconstruirá el catálogo actual?
    - **Respuesta:** Se recapturará manualmente en el ERP mediante el flujo de propuesta, validación y aprobación. No se realizará una transformación masiva ni una importación directa.

59. ¿Se conservará el código anterior de cada producto?
    - **Respuesta:** Sí. Se guardará como referencia histórica para búsqueda y trazabilidad, pero no controlará operaciones nuevas ni sustituirá el nuevo código de catálogo.

60. ¿Un producto nuevo podrá conservar varios códigos anteriores?
    - **Respuesta:** Sí. Se almacenarán como una lista de códigos históricos asociados al producto, separados del código operativo nuevo.

61. ¿El catálogo tendrá categoría además de familia?
    - **Respuesta:** Sí. Se utilizará la jerarquía categoría → familia → producto; por ejemplo, categoría `Andamios` y familia `Marcos`.

62. ¿El ID técnico y el SKU legible tendrán longitud fija?
    - **Respuesta:** Sí. Ambos conservarán su estructura fija; cuando un segmento del SKU no aplique se utilizará `000`, por ejemplo `VER-100-000`.

63. ¿Cómo se asignarán el ID técnico y el SKU durante la captura?
    - **Respuesta:** El usuario los capturará completamente. El sistema no los generará, pero validará formato, unicidad y coherencia con la familia antes de permitir su aprobación.

64. ¿El código de familia de dos dígitos será único en todo el catálogo?
    - **Respuesta:** Sí. Cada código de familia será único dentro de la organización y conservará el mismo significado sin importar la categoría.

65. ¿Cómo se manejará la unidad base de cada producto?
    - **Respuesta:** Se seleccionará desde un catálogo controlado de unidades —pieza, juego, metro, kilogramo, entre otras— y no mediante texto libre.

66. ¿La unidad comercial podrá ser distinta de la unidad de inventario?
    - **Respuesta:** No. Cada producto utilizará la misma unidad en inventario, cotizaciones, contratos y documentos operativos; no habrá conversiones entre unidades en el MVP.

67. ¿Las cantidades admitirán decimales?
    - **Respuesta:** No. Todas las cantidades operativas serán números enteros.

68. ¿Qué unidades estarán disponibles inicialmente?
    - **Respuesta:** Sólo unidades contabilizables en cantidades enteras, como pieza, juego, paquete y rollo. No se habilitarán inicialmente unidades que normalmente requieran fracciones.

69. ¿Cómo se manejarán los conjuntos o kits de equipo?
    - **Respuesta final:** No se manejarán kits en el MVP. Cotizaciones, contratos, reservas, salidas, entradas y movimientos se registrarán exclusivamente por SKU individual. Esta decisión sustituye las respuestas preliminares sobre composición y precio de kits.

70. ¿Cada SKU tendrá precios base separados?
    - **Respuesta:** Sí. Cada SKU tendrá una referencia de precio base de renta y otra de precio base de venta. Los documentos conservarán el precio aplicado históricamente.

71. ¿Cómo se calculará el precio de renta por vigencia?
    - **Respuesta:** Cada SKU tendrá un precio diario base. La renta mínima será de 5 días y se aplicarán factores por vigencia: 5–6 días `1.30`, 7–14 días `1.20`, 15–29 días `1.10`, 30–60 días `1.00` y 61 días o más `0.90`. El cálculo será precio diario × días × factor, con un piso igual al importe máximo del rango anterior para impedir que una vigencia mayor cueste menos.

72. ¿Los factores serán iguales para todos los SKU?
    - **Respuesta:** Sí. Habrá una tabla global configurable por organización. Una cotización podrá solicitar una excepción, pero deberá quedar justificada y autorizada.

73. ¿Quién podrá autorizar descuentos adicionales al factor calculado?
    - **Respuesta:** Comercial podrá autorizar descuentos hasta su límite permitido. Los porcentajes superiores requerirán autorización administrativa y motivo registrado.

74. ¿Cuál será el límite de descuento del área comercial?
    - **Respuesta:** Comercial podrá aplicar hasta 10 % de descuento adicional. Cualquier porcentaje superior requerirá autorización administrativa.

75. ¿Dónde podrá aplicarse el descuento?
    - **Respuesta:** Se aplicará un único porcentaje general sobre la cotización. En el MVP no habrá descuentos diferentes por SKU.

76. ¿La cotización podrá incluir flete, montaje u otros servicios?
    - **Respuesta:** Sí. Se registrarán como SKU de tipo servicio, utilizables en cotizaciones y contratos, pero sin reservas, existencias ni movimientos de inventario.

77. ¿El descuento general también se aplicará a los servicios?
    - **Respuesta:** No. El descuento general sólo reducirá el importe del equipo; los SKU de servicio conservarán su precio completo.

78. ¿Una misma cotización podrá mezclar equipo en renta y equipo en venta?
    - **Respuesta:** No. Renta y venta utilizarán cotizaciones y contratos separados. Ambas podrán incluir SKU de servicio.

79. ¿Los servicios usarán la misma estructura de código que el equipo?
    - **Respuesta:** Sí. Tendrán ID técnico de 10 dígitos y SKU de longitud fija, utilizando familias propias de servicios dentro del catálogo general.

80. ¿Qué indicarán los primeros dos dígitos en los servicios?
    - **Respuesta:** `01` identificará un servicio prestado directamente por Andavalle y `02` un servicio subcontratado.

81. ¿Quién podrá modificar los precios base de renta, venta y servicios?
    - **Respuesta:** Sólo administración podrá capturarlos o modificarlos. Comercial podrá consultarlos y aplicar únicamente los descuentos permitidos.

82. ¿Qué ocurrirá con las cotizaciones en borrador cuando cambie un precio base?
    - **Respuesta:** Conservarán el precio capturado. Mostrarán que existe un precio vigente distinto y permitirán actualizarlo manualmente; nunca se modificarán automáticamente.

83. ¿Cuál será la vigencia predeterminada de una cotización?
    - **Respuesta:** 15 días naturales desde su emisión. Comercial podrá ajustarla antes de enviar la cotización.

84. ¿Qué ocurrirá al vencer una cotización?
    - **Respuesta:** Pasará a estado vencida y no podrá aceptarse directamente. Podrá duplicarse para revisar precios, vigencias y disponibilidad antes de emitir una nueva.

85. ¿Cómo se manejarán los cambios solicitados sobre una cotización ya enviada?
    - **Respuesta:** Se creará una revisión bajo el mismo folio base, por ejemplo `COT-R-2026-000001-R01`. Las versiones anteriores serán inmutables y quedarán visibles para auditoría; sólo la revisión vigente podrá aceptarse.

86. ¿Cómo se registrará la aceptación del cliente en el MVP?
    - **Respuesta:** Comercial registrará la aceptación y deberá adjuntar evidencia: cotización firmada, correo u orden de compra. Sin evidencia no podrá convertirse en contrato.

87. ¿Qué ocurrirá al aceptar una cotización?
    - **Respuesta:** Se creará automáticamente un contrato en borrador. Si la cotización corresponde a una renta nueva, también se creará la OR. Esta conversión no reservará inventario; las reservas seguirán originándose al autorizar una SS.

88. ¿Cuándo pasará una nueva OR a estado activo?
    - **Respuesta:** Al confirmar la primera HS que registre entrega física de equipo. La aceptación de la cotización y la autorización del contrato no bastarán para activarla.

89. ¿Qué ocurrirá con una OR nueva si se cancela el contrato antes de cualquier entrega?
    - **Respuesta:** Se cancelará automáticamente cuando no tenga otros contratos, reservas ni movimientos. La cancelación quedará auditada y el folio no se reutilizará.

90. ¿La autorización del contrato exigirá inventario disponible?
    - **Respuesta:** No. Mostrará la disponibilidad como referencia, pero no bloqueará ni reservará. La validación concurrente y la reserva ocurrirán al autorizar cada SS.

91. ¿Un contrato podrá tener varias SS?
    - **Respuesta:** Sí. Podrá dividirse por fechas o entregas parciales. La suma solicitada, descontando cancelaciones, nunca podrá superar la cantidad autorizada de cada SKU en el contrato.

92. ¿Qué ocurre si el cliente solicita más cantidad que la autorizada en el contrato?
    - **Respuesta:** Se bloqueará el exceso. Será necesaria una nueva cotización y un contrato de ampliación ligados a la misma OR; el contrato original permanecerá inmutable.

93. ¿Podrá editarse un contrato después de autorizarlo?
    - **Respuesta:** No. El contrato autorizado quedará inmutable. Cualquier cambio requerirá su cancelación formal o un nuevo contrato relacionado, conservando la trazabilidad y la auditoría.

94. ¿Cómo se terminará anticipadamente un contrato que ya tiene una HS confirmada?
    - **Respuesta:** No podrá cancelarse. Se iniciará una terminación anticipada, se gestionará la devolución mediante SE y HE, se conciliará el saldo físico y finalmente se cerrará el contrato con trazabilidad completa.

95. ¿Qué importe aplicará si el cliente devuelve el equipo antes de la fecha contratada?
    - **Respuesta:** Se conservará el importe contratado. La devolución anticipada no generará una reducción automática; cualquier ajuste requerirá autorización administrativa, motivo y auditoría.

96. ¿Quién podrá cancelar un contrato autorizado que aún no tenga una HS confirmada?
    - **Respuesta:** Comercial podrá cancelarlo si no existen reservas. Si existen SS autorizadas o reservas, requerirá autorización administrativa y la misma operación transaccional cancelará los pendientes y liberará las reservas. En ningún caso se eliminarán los documentos.

97. ¿Podrá almacén modificar una SS autorizada antes de surtirla?
    - **Respuesta:** Sí. Almacén podrá corregir cantidades, SKU, descripciones operativas o programación antes de la primera HS. Cada modificación exigirá motivo, quedará auditada y recalculará las reservas de forma transaccional. La SS seguirá limitada por las cantidades y los SKU autorizados en el contrato; no podrá modificar el contrato ni crear un excedente.

98. ¿Cómo se corregirá un cambio de obra antes de confirmar cualquier HS?
    - **Respuesta:** Un administrador cancelará la SS y liberará sus reservas, reasignará el contrato a una OR de la nueva obra del mismo cliente y después se creará otra SS. La operación exigirá motivo y conservará toda la trazabilidad. No podrá utilizarse si ya existe un movimiento físico confirmado.

99. ¿Cómo se seleccionará la OR destino al reasignar un contrato a otra obra?
    - **Respuesta:** Se mostrarán únicamente las OR planeadas o activas del mismo cliente y de la nueva obra. El administrador podrá elegir una compatible o crear una OR planeada cuando no exista una adecuada. No podrán utilizarse OR cerradas, canceladas, de otro cliente o de otra obra.

100. ¿Podrá almacén sustituir un SKU reservado por otro al preparar la carga?
     - **Respuesta:** No directamente. La HS sólo podrá incluir SKU autorizados por el contrato y por la SS. Si el SKU alternativo ya está autorizado en el contrato, almacén deberá corregir primero la SS y recalcular sus reservas; de lo contrario será necesaria una nueva cotización y un contrato de ampliación.

101. ¿Qué ocurrirá con el remanente cuando una HS entregue menos cantidad que la reservada?
     - **Respuesta:** Permanecerá reservado y la SS cambiará a `partially_fulfilled`. El remanente continuará pendiente hasta entregarse mediante otra HS o cancelarse expresamente; sólo esa cancelación liberará su reserva.

102. ¿Vencerá automáticamente una reserva pendiente cuando pase la fecha programada?
     - **Respuesta:** No. Se marcará como atrasada y aparecerá en alertas operativas. Almacén deberá reprogramarla o cancelar expresamente el remanente indicando motivo; únicamente la cancelación liberará la reserva.

103. ¿Cuándo se moverá el inventario durante una entrega?
     - **Respuesta:** Al despachar el vehículo se moverá de almacén a una ubicación de tránsito y se consumirá la reserva correspondiente. Cuando el cliente reciba y firme, se moverá de tránsito a la obra y la HS quedará confirmada. Ambos pasos serán transaccionales e idempotentes.

104. ¿Qué ocurrirá si el cliente rechaza la entrega después del despacho?
     - **Respuesta:** La HS se marcará como entrega fallida con motivo y evidencia. El equipo permanecerá en tránsito hasta registrar su regreso físico; al volver se moverá de tránsito a almacén y, en la misma transacción, se restaurará la reserva de la SS para reprogramarla. No se generará una entrega ni una HE ficticias.

105. ¿Cómo se manejará una aceptación parcial de lo despachado?
     - **Respuesta:** La HS confirmará únicamente la cantidad recibida y firmada por el cliente, que se moverá de tránsito a obra. La cantidad rechazada permanecerá en tránsito hasta regresar al almacén; al volver restaurará su reserva en la SS. La suma aceptada y rechazada deberá coincidir con lo despachado.
