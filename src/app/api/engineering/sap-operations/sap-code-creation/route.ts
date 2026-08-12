import {
  getSapCodeCreation,
  postSapCodeCreation,
} from '@/app/engineering/sap-operations/sap-code-creation/apiHandler'

export const runtime = 'nodejs'

export const GET = getSapCodeCreation
export const POST = postSapCodeCreation
