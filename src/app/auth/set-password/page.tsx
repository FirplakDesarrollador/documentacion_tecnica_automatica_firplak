import PasswordSetupForm from './PasswordSetupForm'

type PasswordSetupPageProps = {
  searchParams: Promise<{
    mode?: string | string[]
    token?: string | string[]
    user?: string | string[]
  }>
}

function firstValue(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : ''
}

function passwordSetupMode(value: string | string[] | undefined) {
  return firstValue(value) === 'recovery' ? 'recovery' : 'invite'
}

export default async function PasswordSetupPage({ searchParams }: PasswordSetupPageProps) {
  const params = await searchParams

  return (
    <PasswordSetupForm
      userId={firstValue(params.user)}
      token={firstValue(params.token)}
      mode={passwordSetupMode(params.mode)}
    />
  )
}
