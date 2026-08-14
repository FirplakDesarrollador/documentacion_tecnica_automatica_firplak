import Link from 'next/link'

import { BackLink } from '@/components/navigation/BackLink'
import { requirePagePermission } from '@/utils/auth/access'

import { listEngineeringMeasurementsAction } from './actions'
import EngineeringMeasurementsClient from './EngineeringMeasurementsClient'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export default async function EngineeringMeasurementsPage() {
  await requirePagePermission('module:engineering:measurements')
  const initial = await listEngineeringMeasurementsAction()

  return (
    <div className="mx-auto max-w-7xl space-y-4 py-2">
      <div className="flex flex-wrap items-center justify-between gap-3"><BackLink href="/engineering" label="Volver a Ingeniería" /><Link href="/physical-weights" className="text-sm font-medium text-sky-700 hover:text-sky-900">Administrar factores físicos</Link></div>
      <EngineeringMeasurementsClient
        initialMeasurements={initial.measurements}
        initialError={initial.error}
      />
    </div>
  )
}
