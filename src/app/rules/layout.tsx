import type { ReactNode } from 'react'

import { requirePageRole } from '@/utils/auth/access'

export default async function RulesLayout({ children }: { children: ReactNode }) {
    await requirePageRole('admin')

    return children
}
