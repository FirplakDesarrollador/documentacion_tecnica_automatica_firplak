import PasswordSetupForm from './PasswordSetupForm'

type PasswordSetupPageProps = {
  searchParams: Promise<{
    token?: string | string[]
    user?: string | string[]
  }>
}

function firstValue(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : ''
}

export default async function PasswordSetupPage({ searchParams }: PasswordSetupPageProps) {
  const params = await searchParams

  return (
    <PasswordSetupForm
      userId={firstValue(params.user)}
      token={firstValue(params.token)}
    />
  )
}
