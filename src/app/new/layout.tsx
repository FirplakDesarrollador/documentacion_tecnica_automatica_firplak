import type { ReactNode } from 'react'

import { requirePagePermission } from '@/utils/auth/access'

export default async function NewProductLayout({ children }: { children: ReactNode }) {
    await requirePagePermission('module:dashboard')

    return children
}
