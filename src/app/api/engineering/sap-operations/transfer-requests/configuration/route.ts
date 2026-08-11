import { NextResponse } from 'next/server'

import {
  getSapTransferRequestDefaults,
  listSapTransferRequestWarehouses,
} from '@/lib/sap/transferRequests'
import { dbQuery } from '@/lib/supabase'
import { apiGuard } from '@/utils/auth/access'

import { transferRequestErrorResponse } from '../_utils'

export const runtime = 'nodejs'

export async function GET() {
  const guard = await apiGuard('module:engineering')
  if (guard.response) return guard.response

  try {
    const [defaults, warehouses, responsibleUsers] = await Promise.all([
      getSapTransferRequestDefaults(),
      listSapTransferRequestWarehouses(),
      dbQuery(`SELECT id, email, role
                 FROM public.user_profiles
                WHERE email IS NOT NULL
                ORDER BY email ASC`),
    ])
    const normalizedResponsibleUsers = (responsibleUsers as Array<Record<string, unknown>>)
      .map(row => ({
        id: typeof row.id === 'string' ? row.id : '',
        email: typeof row.email === 'string' ? row.email : '',
        role: typeof row.role === 'string' ? row.role : null,
      }))
      .filter((user): user is { id: string; email: string; role: string | null } => Boolean(user.id && user.email))
    return NextResponse.json({
      success: true,
      configuration: {
        defaults,
        warehouses,
        hasActiveBinLocations: warehouses.some(warehouse => warehouse.binsEnabled),
        creator: {
          id: guard.access?.user?.id ?? '',
          email: guard.access?.user?.email ?? null,
        },
        responsibleUsers: normalizedResponsibleUsers,
      },
    })
  } catch (error) {
    return transferRequestErrorResponse(error)
  }
}
