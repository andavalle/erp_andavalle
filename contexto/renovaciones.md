# ICAM ERP — Análisis de arquitectura de contratos y renovaciones

**Proyecto:** ICAM ERP
**Empresa de referencia:** Andamios ICAM
**Estado:** Análisis arquitectónico / Decisión pendiente
**Prioridad:** Alta
**Fecha:** 2026-10-22

---

## 1. Objetivo del documento

Analizar y definir la arquitectura más adecuada para gestionar contratos de renta, renovaciones, entregas, devoluciones, inventarios y facturación en un ERP especializado en empresas de venta y renta de andamios y equipos de construcción.

El propósito es identificar las limitaciones del modelo actual de ICAM, investigar las alternativas utilizadas en sistemas de gestión de alquileres y seleccionar una solución que sea:

- Escalable.
- Flexible para renovaciones completas y parciales.
- Compatible con PostgreSQL y Supabase.
- Auditable y trazable.
- Capaz de gestionar inventario físico independientemente de los documentos comerciales.
- Compatible con futuras integraciones con Odoo y otros sistemas.
- Adecuada para conservar y migrar información histórica.

**Importante:** Este documento no constituye una decisión definitiva de arquitectura. Codex deberá analizar la implementación existente, identificar restricciones y presentar alternativas antes de realizar modificaciones.

---

## 2. Contexto general del ERP

ICAM es una empresa dedicada principalmente a la venta y renta de andamios, sistemas de apuntalamiento y equipos relacionados con la construcción.

El ERP en desarrollo busca administrar de manera integral las operaciones comerciales, administrativas y operativas.

### 2.1 Áreas funcionales previstas

**Comercial**
- Clientes y contactos.
- Cotizaciones.
- Contratos de renta.
- Renovaciones.
- Venta de equipos.
- Tarifas y descuentos.

**Logística**
- Solicitudes de salida.
- Solicitudes de entrada.
- Hojas de salida (HS).
- Hojas de entrada (HE).
- Entregas y recolecciones.
- Control de fletes.
- Programación de movimientos.

**Inventarios**
- Catálogo de SKU.
- Existencias por almacén.
- Equipos disponibles.
- Equipos rentados.
- Equipos en mantenimiento.
- Equipos dañados o extraviados.
- Movimientos físicos y ajustes.

**Fabricación y mantenimiento**
- Órdenes de fabricación.
- Consumo de materiales.
- Alta de equipos fabricados.
- Inspecciones.
- Reparaciones.
- Mantenimiento preventivo y correctivo.

**Administración**
- Facturación.
- Cobranza.
- Estados de cuenta.
- Excedentes de renta.
- Reportes operativos y financieros.

### 2.2 Tecnologías del entorno

Tecnologías conocidas del ecosistema ICAM:

- PostgreSQL.
- Supabase.
- Python.
- Google Apps Script.
- Odoo mediante API.
- Integraciones externas.

Codex debe inspeccionar el repositorio para determinar cuáles de estas tecnologías están implementadas en el nuevo ERP y cuáles corresponden a sistemas existentes o integraciones futuras.

No debe asumir que la estructura actual del ERP coincide exactamente con la base de datos histórica de ICAM.

---

## 3. Modelo actual de contratos en ICAM

### 3.1 Funcionamiento general

Actualmente, cuando un cliente renta equipo, se genera un contrato identificado mediante un folio.

Cuando el cliente necesita ampliar el periodo de renta, se genera un nuevo contrato con otro folio.

Este contrato se relaciona con el anterior, formando una cadena de renovaciones.

Ejemplo:

```text
C-100 (Contrato inicial)
  |
  +-- C-101 (Primera renovación)
        |
        +-- C-102 (Segunda renovación)
              |
              +-- C-103 (Tercera renovación)
```

Cada contrato puede tener:

- Folio propio.
- Fecha de inicio.
- Fecha de vencimiento.
- Cantidades contratadas.
- Tarifas.
- Importe.
- Estado.
- Referencias a contratos anteriores.

La cadena se identifica mediante un `folio_raiz`.

### 3.2 Renovaciones completas

El cliente conserva todos los equipos y amplía su periodo de renta.

Ejemplo:

```text
Contrato C-100
100 marcos
15 días

Renovación C-101
100 marcos
15 días adicionales
```

No existe necesariamente una nueva salida física del almacén.

### 3.3 Renovaciones parciales

El cliente conserva solamente una parte de los equipos.

Ejemplo:

```text
Contrato C-100
100 marcos

Renovación C-101
70 marcos

Diferencia:
30 marcos pendientes de devolución
```

La renovación comercial puede ocurrir antes de que los equipos sean físicamente recolectados.

Esto genera dos cantidades diferentes:

1. Cantidad contratada para el nuevo periodo.
2. Cantidad física que permanece en obra.

Estas cantidades no deben confundirse.

### 3.4 Movimientos físicos

Los equipos se controlan mediante hojas de salida (HS) y hojas de entrada (HE).

Una operación puede tener movimientos asociados a diferentes folios de la cadena.

Ejemplo:

```text
C-100
  HS-001: salida de 100 marcos

C-101
  HE-001: entrada de 30 marcos

C-102
  HE-002: entrada de 20 marcos
```

El saldo físico total es:

```text
Entregados:   100
Recolectados:  50
En obra:       50
```

Actualmente, para calcular este saldo, es necesario considerar los movimientos relacionados con todos los contratos de la cadena.

---

## 4. Problemas potenciales del modelo actual

### 4.1 Dependencia entre contratos

La información histórica se obtiene recorriendo relaciones entre folios.

Esto aumenta la complejidad de consultas y validaciones.

### 4.2 Mezcla de responsabilidades

Un contrato puede estar funcionando simultáneamente como:

- Documento comercial.
- Identificador de la operación de renta.
- Referencia de inventario.
- Unidad de facturación.
- Contenedor del historial.

Estas responsabilidades deberían evaluarse por separado.

### 4.3 Renovaciones parciales

Una renovación parcial puede generar diferencias entre:

- Equipo renovado.
- Equipo pendiente de devolución.
- Equipo realmente entregado.
- Equipo físicamente disponible.
- Equipo sujeto a cargos adicionales.

### 4.4 Cálculo de excedentes

Es necesario establecer cuándo termina la obligación de pago por cada SKU.

Por ejemplo:

- Al vencimiento del contrato.
- Al generar una renovación parcial.
- Al solicitar la recolección.
- Al recolectar físicamente el equipo.
- Después de un periodo de gracia.

Estas reglas deben definirse explícitamente.

### 4.5 Integridad histórica

Una modificación incorrecta en un contrato anterior podría alterar la interpretación de toda la cadena.

Debe analizarse cómo conservar registros históricos inmutables y auditables.

---

## 5. Alternativas de arquitectura

Codex deberá evaluar al menos tres alternativas.

### Alternativa A: Mantener cadenas de contratos

Cada renovación genera un nuevo contrato relacionado con el anterior.

La cadena continúa identificándose mediante el folio raíz.

**Ventajas**
- Compatible con el proceso actual.
- Menor impacto inicial.
- Facilita una migración gradual.

**Desventajas**
- Consultas históricas más complejas.
- Mayor dependencia entre documentos.
- Riesgo de mezclar movimientos físicos y condiciones comerciales.

Debe evaluarse si una estructura mejorada de relaciones y vistas puede resolver estas limitaciones.

### Alternativa B: Contrato permanente con versiones

Una sola entidad contractual representa toda la relación de renta.

Las renovaciones se almacenan como versiones, anexos o modificaciones.

```text
Contrato C-100
  |
  +-- Versión 1
  +-- Versión 2
  +-- Versión 3
```

**Ventajas**
- Identidad contractual estable.
- Historial centralizado.
- Menor fragmentación.

**Desventajas**
- Puede dificultar la gestión de documentos comerciales independientes.
- Requiere definir cuidadosamente las vigencias y condiciones de cada versión.
- Puede no coincidir con procesos administrativos que requieren folios nuevos.

### Alternativa C: Operación de renta independiente

Crear una entidad permanente llamada `operacion_renta`.

Esta entidad identifica toda la operación comercial y logística.

Los contratos, renovaciones, movimientos y cobros se relacionan con ella.

```text
OPERACIÓN DE RENTA R-001
│
├── CONTRATOS
│   ├── C-100
│   ├── C-101
│   └── C-102
│
├── MOVIMIENTOS
│   ├── HS-001
│   ├── HE-001
│   └── HE-002
│
├── PERIODOS DE RENTA
│   ├── Periodo 1
│   ├── Periodo 2
│   └── Periodo 3
│
└── FINANZAS
    ├── Cargos
    ├── Facturas
    └── Pagos
```

**Ventajas**
- Identidad permanente de la operación.
- Independencia entre documentos y movimientos.
- Facilita el control físico por SKU.
- Permite contratos y renovaciones con folios propios.
- Facilita estados de cuenta consolidados.
- Reduce la necesidad de recorrer cadenas de contratos.

**Desventajas**
- Requiere nuevas relaciones y reglas de integridad.
- Puede implicar migraciones.
- Necesita una definición clara de operación, contrato y periodo.

**Hipótesis inicial:** La alternativa C parece la más adecuada para ICAM, pero debe validarse contra los requisitos reales y el código existente.

---

## 6. Principios arquitectónicos propuestos

Independientemente de la alternativa seleccionada, evaluar los siguientes principios.

### 6.1 Separación comercial y física

Un contrato representa condiciones comerciales.

Un movimiento representa un evento físico.

La renovación de un contrato no debe generar automáticamente un movimiento de inventario.

### 6.2 Trazabilidad por operación

Todos los eventos deben poder consultarse desde una identidad estable.

### 6.3 Control de inventario por SKU

El saldo físico debe derivarse de movimientos confirmados.

```text
Equipo en obra =
Salidas confirmadas
-
Entradas confirmadas
+
Ajustes físicos netos autorizados
```

Los ajustes deben tener signo, motivo y trazabilidad definidos.

### 6.4 Vigencias comerciales independientes

El sistema debe registrar:

- Fecha de inicio.
- Fecha de término.
- Cantidad contratada por SKU.
- Tarifa aplicada.
- Periodicidad de cobro.
- Condiciones de renovación.

### 6.5 Historial auditable

Las operaciones confirmadas deben conservar su historial.

Las correcciones deben realizarse mediante mecanismos controlados, preferentemente con reversión y registro de auditoría.

### 6.6 Integridad transaccional

Las operaciones que modifiquen varias entidades relacionadas deben ejecutarse de forma atómica.

El sistema debe prevenir renovaciones duplicadas, cantidades negativas injustificadas y movimientos inconsistentes.

---

## 7. Escenarios que debe soportar el ERP

Codex deberá comprobar cómo se resolverían los siguientes casos.

| Caso | Escenario | Resultado esperado |
|---|---|---|
| E01 | Renta inicial | Contrato y operación registrados |
| E02 | Renovación total | Nueva vigencia sin duplicar inventario |
| E03 | Renovación parcial | Diferenciar cantidad renovada y saldo físico |
| E04 | Devolución parcial | Reducir saldo físico confirmado |
| E05 | Devolución tardía | Aplicar reglas de excedentes |
| E06 | Ampliación de equipo | Incorporar nuevos SKU o cantidades |
| E07 | Cambio de tarifa | Conservar historial de precios |
| E08 | Devolución anticipada | Determinar ajustes comerciales |
| E09 | Equipo dañado | Registrar condición y cargo si procede |
| E10 | Equipo extraviado | Registrar faltante y tratamiento comercial |
| E11 | Cancelación de renovación | Revertir efectos autorizados sin perder historial |
| E12 | Cierre de operación | Validar saldos físicos y financieros |
| E13 | Varias entregas | Registrar múltiples HS por operación |
| E14 | Varias recolecciones | Registrar múltiples HE por operación |
| E15 | Renovaciones consecutivas | Mantener historial consistente |
| E16 | Diferencias entre contrato e inventario | Identificar equipo pendiente de devolución |
| E17 | Renovación con varios SKU | Permitir cantidades y condiciones diferentes |
| E18 | Venta de equipo rentado | Gestionar conversión comercial y baja física autorizada |

---

## 8. Ejemplo para validar el modelo

### Operación inicial

Cliente renta:

| SKU | Cantidad | Tarifa diaria hipotética |
|---|---:|---:|
| M156-200 | 100 | $2.00 |
| CR244 | 200 | $0.80 |
| BASE-N | 100 | $0.50 |

Vigencia inicial: 15 días.

### Primera renovación

El cliente decide conservar:

| SKU | Cantidad renovada |
|---|---:|
| M156-200 | 70 |
| CR244 | 140 |
| BASE-N | 70 |

La diferencia queda pendiente de devolución.

### Segunda renovación

El cliente conserva:

| SKU | Cantidad renovada |
|---|---:|
| M156-200 | 50 |
| CR244 | 100 |
| BASE-N | 50 |

### Condiciones para la evaluación

El sistema debe poder determinar:

1. Cuánto equipo salió originalmente.
2. Cuánto equipo regresó físicamente.
3. Cuánto equipo permanece en obra.
4. Cuánto equipo está cubierto por una vigencia vigente.
5. Cuánto equipo está pendiente de devolución.
6. Qué equipos generan cargos adicionales.
7. Cuánto se ha facturado.
8. Cuánto se ha cobrado.
9. Qué contratos y documentos originaron cada cargo.
10. Cuál es el historial completo de cada SKU.

Las tarifas del ejemplo son exclusivamente datos de prueba, no tarifas reales de ICAM.

---

## 9. Modelo de datos preliminar

Si se selecciona la alternativa de operación de renta independiente, evaluar las siguientes entidades.

### `operaciones_renta`

- `id`
- `folio_operacion`
- `cliente_id`
- `obra_id`
- `fecha_apertura`
- `fecha_cierre`
- `estado`

### `contratos`

- `id`
- `operacion_id`
- `folio`
- `tipo`
- `fecha_inicio`
- `fecha_fin`
- `estado`
- `contrato_anterior_id` (opcional)
- `documento_url`

### `contrato_items`

- `id`
- `contrato_id`
- `sku`
- `cantidad`
- `tarifa`
- `unidad_tarifa`
- `importe`

### `movimientos_inventario`

- `id`
- `operacion_id`
- `folio`
- `tipo`
- `fecha_programada`
- `fecha_confirmacion`
- `almacen_id`
- `estado`

### `movimiento_items`

- `id`
- `movimiento_id`
- `sku`
- `cantidad`
- `condicion_equipo`

### `periodos_cobro`

- `id`
- `operacion_id`
- `fecha_inicio`
- `fecha_fin`
- `estado`

### `cargos_renta`

- `id`
- `operacion_id`
- `periodo_id`
- `sku`
- `cantidad_facturable`
- `tarifa`
- `tipo_cargo`
- `importe`

Este esquema es conceptual y no está aprobado.

Codex deberá analizar normalización, claves foráneas, restricciones, índices, control de concurrencia, integridad temporal y relaciones con las tablas existentes.

También deberá evaluar si es necesario un modelo de asignación de equipos individuales, lotes o únicamente cantidades por SKU.

---

## 10. Reglas de negocio pendientes de definición

No implementar automáticamente estas reglas sin validación.

### R01. Inicio del cobro

Determinar si comienza:

- Al confirmar el contrato.
- Al confirmar la salida física.
- En una fecha acordada.
- Según condiciones especiales.

### R02. Fin del cobro

Determinar si termina:

- Al vencer el contrato.
- Al solicitar la devolución.
- Al confirmar la entrada física.
- Después de un periodo de gracia.

### R03. Renovaciones parciales

Determinar qué sucede con el equipo que no se renueva pero permanece físicamente en obra.

### R04. Excedentes

Definir:

- Tarifa aplicable.
- Periodo de gracia.
- Cálculo por días.
- Cantidades sujetas a excedente.
- Descuentos y excepciones.

### R05. Cierre de contratos

Definir si un contrato puede cerrarse con equipo pendiente de devolución.

Distinguir el cierre documental del cierre físico y financiero de la operación.

### R06. Cambio de tarifas

Definir si una renovación conserva la tarifa original o permite nuevas condiciones.

### R07. Documentos fiscales

Determinar cómo se relacionan contratos, periodos facturables, facturas, notas de crédito y pagos.

### R08. Equipo individualizado

Determinar qué productos requieren trazabilidad por número de serie, lote o únicamente SKU y cantidad.

---

## 11. Migración del modelo existente

Si se decide reemplazar las cadenas de contratos, diseñar una migración que conserve:

- Folios originales.
- Folios raíz.
- Relaciones entre contratos.
- Fechas y vigencias.
- Tarifas históricas.
- Hojas de salida.
- Hojas de entrada.
- Cantidades por SKU.
- Estados y documentos originales.

### Proceso preliminar

1. Inventariar tablas y relaciones actuales.
2. Identificar cadenas mediante `folio_raiz`.
3. Detectar cadenas incompletas, ciclos y referencias inconsistentes.
4. Crear las nuevas entidades necesarias.
5. Asignar una operación permanente a cada cadena validada.
6. Relacionar contratos y movimientos históricos.
7. Conciliar saldos físicos por SKU.
8. Comparar estados de cuenta antes y después.
9. Ejecutar pruebas con operaciones reales anonimizadas.
10. Preparar estrategia de reversión.

**No modificar ni eliminar datos históricos sin respaldo, conciliación y autorización.**

---

## 12. Investigación requerida a Codex

Antes de proponer cambios, inspeccionar el repositorio y responder:

### Arquitectura actual

- ¿Qué módulos implementan contratos y renovaciones?
- ¿Qué tablas contienen los datos?
- ¿Cómo se relacionan los contratos?
- ¿Dónde se calcula el saldo de equipo?
- ¿Cómo se calculan los excedentes?
- ¿Qué servicios, funciones SQL o RPC participan?
- ¿Qué procesos dependen de los folios actuales?

### Evaluación técnica

- ¿Qué problemas concretos presenta el diseño existente?
- ¿Qué partes pueden conservarse?
- ¿Qué funcionalidades requieren refactorización?
- ¿Qué riesgos introduce cada alternativa?
- ¿Cómo garantizar compatibilidad histórica?
- ¿Qué consultas podrían simplificarse?
- ¿Qué restricciones e índices deberían implementarse?

### Evaluación de negocio

- ¿Cómo soporta cada alternativa las renovaciones parciales?
- ¿Cómo determina equipo físico versus equipo contratado?
- ¿Cómo se facturan periodos superpuestos o consecutivos?
- ¿Cómo se manejan equipos no devueltos?
- ¿Cómo se gestionan daños y extravíos?
- ¿Cómo se integra con ventas e inventarios?

---

## 13. Matriz de decisión

Comparar las alternativas utilizando la siguiente ponderación preliminar.

| Criterio | Peso |
|---|---:|
| Control físico de inventario | 20% |
| Renovaciones parciales | 20% |
| Trazabilidad y auditoría | 15% |
| Facturación y excedentes | 15% |
| Escalabilidad y mantenimiento | 10% |
| Complejidad de implementación | 10% |
| Migración y compatibilidad histórica | 10% |
| **Total** | **100%** |

Calificar cada alternativa de 1 a 5 y justificar cada puntuación mediante evidencia del código, la base de datos o los requisitos de negocio.

No asignar puntuaciones definitivas antes de realizar el análisis.

---

## 14. Entregables esperados de Codex

### Entregable 1 — Diagnóstico

Documento que describa:

- Arquitectura existente.
- Dependencias identificadas.
- Problemas reales.
- Riesgos técnicos.
- Restricciones del negocio.

### Entregable 2 — Comparativa

Matriz de alternativas con ventajas, desventajas, costos aproximados de implementación y riesgos.

### Entregable 3 — Propuesta arquitectónica

Incluir:

- Modelo entidad-relación.
- Diagrama de procesos.
- Esquema PostgreSQL propuesto.
- Reglas de integridad.
- Diseño de renovaciones.
- Diseño de movimientos físicos.
- Diseño de periodos de cobro.
- Estrategia de estados de cuenta.

### Entregable 4 — Plan de implementación

Incluir:

- Fases de desarrollo.
- Migraciones necesarias.
- Compatibilidad con módulos existentes.
- Pruebas unitarias y de integración.
- Pruebas de conciliación histórica.
- Estrategia de despliegue y reversión.

---

## 15. Instrucciones de trabajo para Codex

Actúa como arquitecto de software especializado en ERP, sistemas de alquiler de equipos, PostgreSQL y gestión de inventarios.

Tu responsabilidad inicial es analizar, no implementar.

Sigue estas instrucciones:

1. Inspecciona primero el repositorio y la documentación existente.
2. Identifica las entidades y relaciones reales.
3. No asumas que el modelo conceptual de este documento ya está implementado.
4. Distingue hechos comprobados, hipótesis y decisiones pendientes.
5. Investiga alternativas antes de recomendar una arquitectura.
6. Considera la continuidad operativa y la migración histórica.
7. Prioriza integridad de datos y trazabilidad.
8. No modifiques código, tablas, migraciones ni datos durante la fase de análisis.
9. Presenta una recomendación justificada.
10. Solicita aprobación antes de implementar cambios estructurales.

### Criterio de éxito

El nuevo diseño deberá permitir que una operación de renta tenga múltiples contratos, renovaciones, entregas, devoluciones y cargos sin perder trazabilidad ni generar inconsistencias entre el inventario físico y las obligaciones comerciales.

**La decisión arquitectónica debe basarse en las necesidades operativas de ICAM y en la evidencia encontrada en el ERP existente, no únicamente en la simplicidad del modelo de datos.**

---

## 16. Estado de la decisión

**Decisión:** Pendiente.

**Alternativa inicialmente favorecida:** Operación de renta independiente.

**Motivo:** Permite separar la identidad de la renta, los documentos comerciales, los movimientos físicos y los periodos de cobro.

**Condición para aprobar:** Validar reglas de negocio, revisar el código existente, comparar alternativas y comprobar los escenarios de operación.

**Siguiente acción:** Ejecutar el diagnóstico arquitectónico con Codex y presentar resultados antes de implementar cambios.
