import type { ReactNode } from 'react'

import { requirePagePermission } from '@/utils/auth/access'

export default async function AssetsLayout({ children }: { children: ReactNode }) {
    await requirePagePermission('module:assets')

    return children
}
