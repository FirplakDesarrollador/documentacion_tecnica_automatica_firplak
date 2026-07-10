import type { ReactNode } from 'react'

import { requirePagePermission } from '@/utils/auth/access'

export default async function GenerateLayout({ children }: { children: ReactNode }) {
    await requirePagePermission('module:generate')

    return children
}
