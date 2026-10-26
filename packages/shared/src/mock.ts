import type { CrmActivitySummary, CrmOpportunitySummary, CustomerSummary, InventorySummary, OperationRequestSummary } from './domain.ts'

export const mockCrmOpportunities: CrmOpportunitySummary[] = [
  { id:'demo-lead-1',name:'Laura Méndez',company:'Constructora Valle Alto',phone:'55 1234 8901',email:'laura@vallealto.mx',needSummary:'Renta de andamio multidireccional para ampliación de nave.',status:'qualified',sourceName:'Cliente recurrente',assignedTo:'demo-user',assignedName:'Gustavo',nextActivityAt:'2026-10-27T16:00:00-06:00',createdAt:'2026-10-24T10:00:00-06:00' },
  { id:'demo-lead-2',name:'Mauricio León',company:'Proyectos Lerma',phone:'55 2345 6789',needSummary:'Cotización para apuntalamiento temporal de losa.',status:'contacted',sourceName:'Sitio web',assignedTo:'demo-user',assignedName:'Gustavo',nextActivityAt:'2026-10-27T11:00:00-06:00',createdAt:'2026-10-25T09:15:00-06:00' },
  { id:'demo-lead-3',name:'Sara Luna',company:'Ingeniería del Centro',email:'sara@icsa.mx',needSummary:'Venta de plataformas y accesorios para proyecto industrial.',status:'new',sourceName:'Recomendación',createdAt:'2026-10-26T08:30:00-06:00' },
]

export const mockCrmActivities: CrmActivitySummary[] = [
  {id:'demo-activity-1',leadId:'demo-lead-1',type:'visit',summary:'Visita técnica a la nave',dueAt:'2026-10-27T16:00:00-06:00'},
  {id:'demo-activity-2',leadId:'demo-lead-2',type:'call',summary:'Confirmar medidas y fechas',dueAt:'2026-10-27T11:00:00-06:00'},
]

export const mockCustomers: CustomerSummary[] = [
  { id: 'demo-customer-1', legalName: 'Constructora Valle Alto, S.A. de C.V.', tradeName: 'Valle Alto', siteName: 'Nave Norte', contactName: 'Laura Méndez', activeContracts: 2, equipmentAtSite: 1248 },
  { id: 'demo-customer-2', legalName: 'Proyectos Lerma, S.A. de C.V.', tradeName: 'Proyectos Lerma', siteName: 'Edificio B', contactName: 'Mauricio León', activeContracts: 1, equipmentAtSite: 684 },
  { id: 'demo-customer-3', legalName: 'Ingeniería del Centro, S.A. de C.V.', tradeName: 'ICSA', siteName: 'Planta Toluca', contactName: 'Sara Luna', activeContracts: 3, equipmentAtSite: 2106 },
]

export const mockRequests: OperationRequestSummary[] = [
  { id: 'demo-request-1', folio: 'SS-2026-000028', type: 'SS', customer: 'Constructora Valle Alto', site: 'Nave Norte', status: 'authorized', lineCount: 14, requestedAt: '2026-10-21' },
  { id: 'demo-request-2', folio: 'SE-2026-000019', type: 'SE', customer: 'Proyectos Lerma', site: 'Edificio B', status: 'submitted', lineCount: 8, requestedAt: '2026-10-21' },
  { id: 'demo-request-3', folio: 'SS-2026-000027', type: 'SS', customer: 'Ingeniería del Centro', site: 'Planta Toluca', status: 'partially_fulfilled', lineCount: 11, requestedAt: '2026-10-20' },
]

export const mockInventory: InventorySummary = {
  available: 8420,
  reserved: 1108,
  customer: 4038,
  inspection: 312,
  maintenance: 96,
  damaged: 28,
}
