export type MemberRole = 'admin' | 'commercial' | 'warehouse' | 'logistics'
export type ContractType = 'rental' | 'sale'
export type ContractStatus = 'draft' | 'pending_authorization' | 'authorized' | 'active' | 'closed' | 'cancelled'
export type RequestType = 'SS' | 'SE'
export type RequestStatus = 'draft' | 'submitted' | 'authorized' | 'partially_fulfilled' | 'completed' | 'cancelled'
export type DocumentType = 'HS' | 'HE'
export type DocumentStatus = 'draft' | 'confirmed' | 'reversed'
export type StockCondition = 'available' | 'inspection' | 'maintenance' | 'damaged' | 'writeoff'
export type CrmLeadStatus = 'new' | 'contacted' | 'qualified' | 'quoted' | 'won' | 'lost'
export type CrmActivityType = 'call' | 'email' | 'whatsapp' | 'visit' | 'task' | 'note'

export interface ContactLeadInput {
  name: string
  company?: string
  phone: string
  email?: string
  message: string
  turnstileToken: string
  privacyConsent: boolean
  privacyNoticeVersion: string
}

export interface CrmOpportunitySummary {
  id: string
  name: string
  company?: string
  phone?: string
  email?: string
  needSummary: string
  status: CrmLeadStatus
  sourceName: string
  assignedTo?: string
  assignedName?: string
  nextActivityAt?: string
  createdAt: string
}

export interface CrmActivitySummary {
  id: string
  leadId: string
  type: CrmActivityType
  summary: string
  dueAt?: string
  completedAt?: string
}

export interface CustomerSummary {
  id: string
  legalName: string
  tradeName?: string
  siteName: string
  contactName: string
  activeContracts: number
  equipmentAtSite: number
}

export interface OperationRequestSummary {
  id: string
  folio: string
  type: RequestType
  customer: string
  site: string
  status: RequestStatus
  lineCount: number
  requestedAt: string
}

export interface InventorySummary {
  available: number
  reserved: number
  customer: number
  inspection: number
  maintenance: number
  damaged: number
}

export const roleLabels: Record<MemberRole, string> = {
  admin: 'Administrador',
  commercial: 'Comercial',
  warehouse: 'Almacén',
  logistics: 'Logística',
}

export const requestStatusLabels: Record<RequestStatus, string> = {
  draft: 'Borrador',
  submitted: 'Enviada',
  authorized: 'Autorizada',
  partially_fulfilled: 'Surtida parcialmente',
  completed: 'Completada',
  cancelled: 'Cancelada',
}

export const crmLeadStatusLabels: Record<CrmLeadStatus, string> = {
  new: 'Nueva',
  contacted: 'Contactada',
  qualified: 'Calificada',
  quoted: 'Cotización',
  won: 'Ganada',
  lost: 'Perdida',
}

export const crmActivityTypeLabels: Record<CrmActivityType, string> = {
  call: 'Llamada',
  email: 'Correo',
  whatsapp: 'WhatsApp',
  visit: 'Visita',
  task: 'Tarea',
  note: 'Nota',
}
