import type { ReactNode } from 'react'

import { requirePagePermission } from '@/utils/auth/access'

export default async function PendingLayout({ children }: { children: ReactNode }) {
    await requirePagePermission('module:pending')

    return children
}
