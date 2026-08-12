'use server'

import {
  clearPasswordSetupMetadata,
  isValidPasswordSetupToken,
  readPasswordSetupChallenge,
} from '@/lib/auth/passwordSetup'
import { createSupabaseAdminClient } from '@/utils/supabase/admin'

type CompletePasswordSetupInput = {
  userId: string
  token: string
  password: string
  confirmPassword: string
}

export type CompletePasswordSetupResult = {
  error: string | null
}

function isValidPassword(password: string) {
  return password.length >= 8
}

export async function completePasswordSetupAction(
  input: CompletePasswordSetupInput,
): Promise<CompletePasswordSetupResult> {
  const userId = input.userId.trim()
  const token = input.token.trim()

  if (!userId || !token) {
    return { error: 'El enlace de acceso no es válido.' }
  }

  if (!isValidPassword(input.password)) {
    return { error: 'La contraseña debe tener al menos 8 caracteres.' }
  }

  if (input.password !== input.confirmPassword) {
    return { error: 'Las contraseñas no coinciden.' }
  }

  const admin = createSupabaseAdminClient()
  const { data, error: userError } = await admin.auth.admin.getUserById(userId)
  const user = data.user
  const challenge = user ? readPasswordSetupChallenge(user.app_metadata) : null

  if (userError || !user || !challenge || !isValidPasswordSetupToken(challenge, token)) {
    return { error: 'El enlace de acceso no es válido o ya expiró. Solicita uno nuevo a un administrador.' }
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
    password: input.password,
    app_metadata: clearPasswordSetupMetadata(user.app_metadata),
  })

  if (updateError) {
    return { error: 'No se pudo actualizar la contraseña. Solicita un enlace nuevo a un administrador.' }
  }

  const { data: verifiedUser, error: verifyError } = await admin.auth.admin.getUserById(user.id)
  if (verifyError || !verifiedUser.user || readPasswordSetupChallenge(verifiedUser.user.app_metadata)) {
    return { error: 'No se pudo verificar la activación del acceso. Solicita un enlace nuevo a un administrador.' }
  }

  return { error: null }
}
