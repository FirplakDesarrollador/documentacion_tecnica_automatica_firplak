import { ColorAuditClient } from '@/app/product-design/color-audit/ColorAuditClient'
import { BackLink } from '@/components/navigation/BackLink'
import { requirePagePermission } from '@/utils/auth/access'

export default async function SapAuditoriesPage() {
  await requirePagePermission('module:engineering')

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-4">
          <BackLink href="/engineering" label="Volver a Ingeniería" />
        </div>
        <ColorAuditClient apiBase="/api/engineering/sap-auditories" />
      </div>
    </main>
  )
}
