import { request } from './http'

/**
 * The signed-in person's own multi-factor sign-in. Every call acts on the caller only;
 * none takes a user id.
 */
export interface MfaStatus {
  /** Whether the server can do MFA at all (it needs MFA_SECRET_KEY_B64). */
  available: boolean
  enabled: boolean
  recoveryCodesRemaining: number
  /** A workspace this person belongs to requires it, so it cannot be turned off. */
  required: boolean
}

export const mfaApi = {
  status(): Promise<MfaStatus> {
    return request<MfaStatus>('/account/mfa')
  },

  /** A new secret for the authenticator app, as text and as an otpauth:// URI for the QR. */
  beginSetup(): Promise<{ secret: string; otpauthUri: string }> {
    return request('/account/mfa/setup', { method: 'POST', body: JSON.stringify({}) })
  },

  /** Confirms setup with a code. The recovery codes come back here, once only. */
  enable(code: string): Promise<{ recoveryCodes: string[] }> {
    return request('/account/mfa/enable', { method: 'POST', body: JSON.stringify({ code }) })
  },

  disable(password: string, code: string): Promise<void> {
    return request('/account/mfa/disable', { method: 'POST', body: JSON.stringify({ password, code }) })
  },

  regenerateRecoveryCodes(code: string): Promise<{ recoveryCodes: string[] }> {
    return request('/account/mfa/recovery-codes', { method: 'POST', body: JSON.stringify({ code }) })
  },
}
