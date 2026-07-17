import { requirePagePermission } from '@/utils/auth/access'
import { ColorAuditClient } from './ColorAuditClient'

export default async function ColorAuditPage() {
  await requirePagePermission('module:product-design')
  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <ColorAuditClient />
    </main>
  )
}

