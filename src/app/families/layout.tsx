import type { ReactNode } from 'react'

import { requirePagePermission } from '@/utils/auth/access'

export default async function FamiliesLayout({ children }: { children: ReactNode }) {
    await requirePagePermission('module:configuration')

    return children
}
