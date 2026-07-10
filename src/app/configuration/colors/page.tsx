import { getColorEditorOptionsAction, getColorsAction } from '@/app/rules/colors/actions'
import ColorsClient from '@/app/rules/colors/ColorsClient'

export const dynamic = 'force-dynamic'

export default async function ColorsPage() {
  const [colors, options] = await Promise.all([
    getColorsAction(),
    getColorEditorOptionsAction(),
  ])
  
  return (
    <div className="container mx-auto py-10">
      <ColorsClient
        initialData={colors}
        manufacturingProcesses={options.manufacturingProcesses}
        productTypes={options.productTypes}
      />
    </div>
  )
}
