import { requirePagePermission } from '@/utils/auth/access'
import { listTransientReferenceBomImportCandidatesAction } from './transientReferenceImportActions'
import { ReferenceBomImportClient } from './ReferenceBomImportClient'

export default async function ProductBomPage() {
  await requirePagePermission('module:product-design')
  const candidates = await listTransientReferenceBomImportCandidatesAction()

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <ReferenceBomImportClient initialCandidates={candidates} />
    </main>
  )
}
