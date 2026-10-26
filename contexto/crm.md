# Contexto y decisiones del CRM ligero

## Alcance

El CRM administrará oportunidades comerciales, seguimiento, clientes, contactos y obras. Las cotizaciones se integrarán como el siguiente paso comercial, mientras que inventarios y logística conservarán su planificación independiente.

## Cuestionario validado

1. ¿Qué representará cada registro comercial?
   - **Respuesta:** Una oportunidad comercial. Podrá corresponder a un prospecto nuevo o a un cliente existente con una necesidad nueva. Una misma empresa podrá tener varias oportunidades sin duplicarse como cliente.

2. ¿Qué etapas tendrá una oportunidad?
   - **Respuesta:** `new` → `contacted` → `qualified` → `quoted` → `won` o `lost`.

3. ¿Cómo se asignará la responsabilidad comercial?
   - **Respuesta:** Cada oportunidad tendrá un responsable principal. Podrá reasignarse conservando responsable anterior, nuevo responsable, actor, motivo y fecha.

4. ¿Cómo se registrará el origen de una oportunidad?
   - **Respuesta:** Mediante un catálogo controlado. La opción `other` exigirá una explicación.

5. ¿Qué datos serán mínimos para crear una oportunidad?
   - **Respuesta:** Nombre o empresa, al menos teléfono o correo, descripción de la necesidad y origen.

6. ¿Cómo se manejarán posibles duplicados?
   - **Respuesta:** Se advertirán coincidencias por teléfono, correo o RFC normalizados. Se permitirá continuar indicando motivo, sin bloquear oportunidades legítimas adicionales del mismo cliente.

7. ¿Qué tipos de actividad incluirá el MVP?
   - **Respuesta:** Llamada, correo, WhatsApp, visita, tarea y nota.

8. ¿Será obligatorio programar seguimiento?
   - **Respuesta:** Después de registrar contacto deberá programarse la siguiente actividad o cerrarse la oportunidad como ganada o perdida.

9. ¿Cuándo se convertirá un prospecto en cliente?
   - **Respuesta:** Al preparar la primera cotización. Antes de crear el cliente se buscarán coincidencias para reutilizar un registro existente.

10. ¿Qué tipos de cliente se manejarán?
    - **Respuesta:** Persona física y persona moral. El RFC será opcional hasta preparar la cotización.

11. ¿Cuántos contactos podrá tener un cliente?
    - **Respuesta:** Varios contactos, con uno principal activo y contactos opcionales asociados a obras específicas.

12. ¿Qué acceso tendrá el equipo comercial?
    - **Respuesta:** Podrá consultar todas las oportunidades de la organización, pero sólo editar las propias. El administrador podrá editar y reasignar cualquiera.

13. ¿Qué se exigirá para cerrar una oportunidad como perdida?
    - **Respuesta:** Un motivo de catálogo y un comentario opcional. El motivo `other` exigirá explicación.

14. ¿Cuántas cotizaciones podrá tener una oportunidad?
    - **Respuesta:** Varias. La oportunidad se marcará como ganada cuando se acepte una de sus cotizaciones.

15. ¿Qué ocurrirá al crear una cotización sin oportunidad previa?
    - **Respuesta:** Toda cotización deberá vincularse con una oportunidad. Si el usuario inicia directamente desde cotizaciones, el sistema creará una oportunidad automáticamente.

16. ¿Cómo se recibirán los prospectos del sitio web?
    - **Respuesta:** Entrarán a una bandeja compartida sin responsable y crearán automáticamente una tarea de contacto con vencimiento en 24 horas. Posteriormente se asignarán a un comercial.

17. ¿Qué ocurrirá si regresa una oportunidad marcada como perdida?
    - **Respuesta:** Se creará una oportunidad nueva vinculada a la anterior. La oportunidad perdida permanecerá cerrada e inmutable.

18. ¿Qué nomenclatura tendrá el cliente?
    - **Respuesta:** `CLI-000001`, mediante un consecutivo permanente por organización que no reinicia cada año.

19. ¿Qué nomenclatura tendrá la obra?
    - **Respuesta:** `OBR-000001`, mediante un consecutivo permanente por organización que no reinicia cada año.

20. ¿Cómo se manejará un RFC duplicado entre clientes?
    - **Respuesta:** Se bloqueará la creación de otro cliente activo con el mismo RFC normalizado y deberá reutilizarse el existente. Los clientes sin RFC sí estarán permitidos.

21. ¿Podrán eliminarse registros del CRM?
    - **Respuesta:** No. Oportunidades, clientes, contactos, obras y actividades se archivarán, cancelarán o cerrarán para conservar el historial.

22. ¿Qué datos serán obligatorios para preparar la primera cotización?
    - **Respuesta:** Cliente, contacto y obra con dirección. El RFC será obligatorio únicamente cuando corresponda por el tipo de cliente o proceso comercial.

23. ¿Cómo se registrará el consentimiento del formulario público?
    - **Respuesta:** La casilla de aceptación será obligatoria y se conservarán la fecha y la versión del aviso de privacidad aceptado.

## Cierre de planeación

Con estas decisiones queda cerrado el alcance funcional del CRM ligero para iniciar su implementación. Inventarios y logística permanecen fuera de este corte, salvo las relaciones futuras ya previstas.
