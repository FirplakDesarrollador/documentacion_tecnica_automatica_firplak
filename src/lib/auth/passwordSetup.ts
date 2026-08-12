import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

const PASSWORD_SETUP_KEY = 'samigen_password_setup'
const PASSWORD_SETUP_LIFETIME_MS = 24 * 60 * 60 * 1000

type PasswordSetupChallenge = {
  tokenHash: string
  expiresAt: string
}

type PasswordSetupToken = {
  token: string
  challenge: PasswordSetupChallenge
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function createPasswordSetupToken(): PasswordSetupToken {
  const token = randomBytes(32).toString('base64url')

  return {
    token,
    challenge: {
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + PASSWORD_SETUP_LIFETIME_MS).toISOString(),
    },
  }
}

export function createTemporaryPassword() {
  return randomBytes(48).toString('base64url')
}

export function readPasswordSetupChallenge(appMetadata: unknown): PasswordSetupChallenge | null {
  if (!isRecord(appMetadata) || !isRecord(appMetadata[PASSWORD_SETUP_KEY])) {
    return null
  }

  const challenge = appMetadata[PASSWORD_SETUP_KEY]
  const tokenHash = typeof challenge.tokenHash === 'string' ? challenge.tokenHash : ''
  const expiresAt = typeof challenge.expiresAt === 'string' ? challenge.expiresAt : ''

  return tokenHash && expiresAt ? { tokenHash, expiresAt } : null
}

export function hasActivePasswordSetupChallenge(appMetadata: unknown) {
  const challenge = readPasswordSetupChallenge(appMetadata)
  return Boolean(challenge && Date.parse(challenge.expiresAt) > Date.now())
}

export function passwordSetupMetadata(appMetadata: unknown, challenge: PasswordSetupChallenge) {
  return {
    ...(isRecord(appMetadata) ? appMetadata : {}),
    [PASSWORD_SETUP_KEY]: challenge,
  }
}

export function clearPasswordSetupMetadata(appMetadata: unknown) {
  const metadata = { ...(isRecord(appMetadata) ? appMetadata : {}) }
  delete metadata[PASSWORD_SETUP_KEY]
  return metadata
}

export function isValidPasswordSetupToken(challenge: PasswordSetupChallenge, token: string) {
  if (!token || Date.parse(challenge.expiresAt) <= Date.now()) {
    return false
  }

  const expectedHash = Buffer.from(challenge.tokenHash, 'hex')
  const receivedHash = Buffer.from(hashToken(token), 'hex')

  return expectedHash.length === receivedHash.length && timingSafeEqual(expectedHash, receivedHash)
}
