import type { ContactLeadInput } from './domain.ts'

export interface ValidationResult<T> {
  ok: boolean
  value?: T
  errors: string[]
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateContactLead(input: ContactLeadInput): ValidationResult<ContactLeadInput> {
  const value = {
    name: input.name.trim(),
    company: input.company?.trim() || undefined,
    phone: input.phone.trim(),
    email: input.email?.trim().toLowerCase() || undefined,
    message: input.message.trim(),
    turnstileToken: input.turnstileToken.trim(),
    privacyConsent: input.privacyConsent,
    privacyNoticeVersion: input.privacyNoticeVersion.trim(),
  }
  const errors: string[] = []
  if (value.name.length < 2 || value.name.length > 120) errors.push('El nombre debe tener entre 2 y 120 caracteres.')
  if (!value.phone && !value.email) errors.push('Proporciona un teléfono o correo.')
  if (value.phone && (value.phone.length < 8 || value.phone.length > 30)) errors.push('El teléfono no es válido.')
  if (value.email && !emailPattern.test(value.email)) errors.push('El correo no es válido.')
  if (value.message.length < 10 || value.message.length > 2000) errors.push('El mensaje debe tener entre 10 y 2000 caracteres.')
  if (!value.turnstileToken) errors.push('Completa la verificación de seguridad.')
  if (!value.privacyConsent || !value.privacyNoticeVersion) errors.push('Debes aceptar el aviso de privacidad.')
  return { ok: errors.length === 0, value: errors.length === 0 ? value : undefined, errors }
}
