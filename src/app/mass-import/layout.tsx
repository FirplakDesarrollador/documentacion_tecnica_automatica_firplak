import type { ReactNode } from 'react'

import { requirePagePermission } from '@/utils/auth/access'

export default async function MassImportLayout({ children }: { children: ReactNode }) {
    await requirePagePermission('module:dashboard')

    return children
}
