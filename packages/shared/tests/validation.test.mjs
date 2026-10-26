import test from 'node:test'
import assert from 'node:assert/strict'
import { validateContactLead } from '../src/validation.ts'

test('accepts a complete contact lead', () => {
  const result = validateContactLead({
    name: '  Ana Pérez  ', company: 'Constructora Demo', phone: '55 1234 5678',
    email: 'ANA@EXAMPLE.COM', message: 'Necesito cotizar andamio para una obra.', turnstileToken: 'token-demo',
    privacyConsent: true, privacyNoticeVersion: '2026-10-26',
  })
  assert.equal(result.ok, true)
  assert.equal(result.value?.name, 'Ana Pérez')
  assert.equal(result.value?.email, 'ana@example.com')
})

test('accepts email as the only contact channel', () => {
  const result = validateContactLead({ name: 'Ana', phone: '', email: 'ana@example.com', message: 'Necesito una cotización de andamios.', turnstileToken: 'token', privacyConsent: true, privacyNoticeVersion: '2026-10-26' })
  assert.equal(result.ok, true)
})

test('rejects invalid or incomplete contact data', () => {
  const result = validateContactLead({ name: 'A', phone: '12', email: 'incorrecto', message: 'corto', turnstileToken: '', privacyConsent: false, privacyNoticeVersion: '' })
  assert.equal(result.ok, false)
  assert.ok(result.errors.length >= 4)
})
