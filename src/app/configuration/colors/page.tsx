import { getColorsAction } from '@/app/rules/colors/actions'
import ColorsClient from '@/app/rules/colors/ColorsClient'

export const dynamic = 'force-dynamic'

export default async function ColorsPage() {
  const colors = await getColorsAction()
  
  return (
    <div className="container mx-auto py-10">
      <ColorsClient initialData={colors} />
    </div>
  )
}
