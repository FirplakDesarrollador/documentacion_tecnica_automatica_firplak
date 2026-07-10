import type { ReactNode } from 'react'

import { requirePagePermission } from '@/utils/auth/access'

export default async function DatasetsLayout({ children }: { children: ReactNode }) {
    await requirePagePermission('module:datasets')

    return children
}
