import type { ReactNode } from 'react'

import { requirePagePermission } from '@/utils/auth/access'

export default async function TemplatesLayout({ children }: { children: ReactNode }) {
    await requirePagePermission('module:templates')

    return children
}
