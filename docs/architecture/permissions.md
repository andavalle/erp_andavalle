# Matriz de permisos

Los usuarios pueden acumular roles. `admin` incluye todas las capacidades, pero cada acción conserva actor y fecha.

| Capacidad | Admin | Comercial | Almacén | Logística |
|---|:---:|:---:|:---:|:---:|
| Consultar catálogos y operación | Sí | Sí | Sí | Sí |
| Administrar usuarios y roles | Sí | No | No | No |
| Consultar oportunidades, clientes, contactos y obras | Sí | Sí | No | No |
| Crear oportunidades y actividades | Sí | Sí | No | No |
| Editar oportunidades propias | Sí | Sí | No | No |
| Editar o reasignar cualquier oportunidad | Sí | No | No | No |
| Crear/editar clientes, contactos y obras | Sí | Sí | No | No |
| Proponer productos | Sí | Sí | Sí | No |
| Aprobar productos y familias | Sí | No | No | No |
| Crear cotizaciones y contratos | Sí | Sí | No | No |
| Autorizar contratos | Sí | No | No | No |
| Crear SS/SE | Sí | Sí | No | No |
| Autorizar/cancelar SS/SE | Sí | No | Sí | No |
| Preparar y confirmar HS/HE | Sí | No | Sí | No |
| Asignar vehículo y operador | Sí | No | No | Sí |
| Proponer ajustes y bajas | Sí | No | Sí | No |
| Autorizar corte inicial, ajuste, baja o reversión | Sí | No | No | No |
| Autorizar TOR | Sí | No | No | No |
| Consultar costos de compra/subarrendamiento | Sí | Sí | No | No |
| Consultar auditoría | Sí | No | No | No |

La pertenencia activa a la organización siempre es obligatoria. Las políticas no usan `user_metadata`; consultan membresías y roles almacenados en tablas protegidas.

Cuando exista un único administrador podrá autorizar un documento creado por él mismo, pero deberá justificarlo y el evento quedará auditado.
