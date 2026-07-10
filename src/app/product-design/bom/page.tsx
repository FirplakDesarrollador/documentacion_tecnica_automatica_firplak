import { requirePagePermission } from '@/utils/auth/access'
import { listReferenceBomImportCandidatesAction } from './referenceImportActions'
import { ReferenceBomImportClient } from './ReferenceBomImportClient'

export default async function ProductBomPage() {
  await requirePagePermission('module:product-design')
  const candidates = await listReferenceBomImportCandidatesAction()

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <ReferenceBomImportClient initialCandidates={candidates} />
    </main>
  )
}
