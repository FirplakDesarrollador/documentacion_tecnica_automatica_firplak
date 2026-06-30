import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getNomenclatureConfigAction } from './actions'
import { NomenclatureConfigClient } from './NomenclatureConfigClient'

export const dynamic = 'force-dynamic'

type PrefixRow = {
    id?: string
    document_slot: string
    label: string
    prefix: string
    description?: string | null
    active: boolean
}

type AbbreviationRow = {
    id?: string
    category: string
    source_value: string
    abbreviation: string
    description?: string | null
    active: boolean
}

export default async function NomenclatureConfigurationPage() {
    const config = await getNomenclatureConfigAction()

    return (
        <div className="container mx-auto py-6 space-y-6">
            <div className="flex items-center gap-3">
                <Link href="/configuration">
                    <Button variant="ghost" size="icon" className="rounded-xl">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Nomenclatura</h1>
                    <p className="text-sm text-slate-500">
                        Prefijos publicos, abreviaturas maestras y bases reutilizables para slugs/documentos.
                    </p>
                </div>
            </div>

            <NomenclatureConfigClient
                prefixes={config.prefixes as PrefixRow[]}
                abbreviations={config.abbreviations as AbbreviationRow[]}
            />
        </div>
    )
}
