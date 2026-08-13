import { permanentRedirect } from 'next/navigation'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export default async function ConsultaSapPage() {
  permanentRedirect('/engineering/sap-consulting')
}
