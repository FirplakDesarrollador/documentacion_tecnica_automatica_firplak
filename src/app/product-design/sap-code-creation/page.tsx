import { requirePagePermission } from '@/utils/auth/access'
import SapCodeCreationClient from './SapCodeCreationClient'

export default async function SapCodeCreationPage() {
  await requirePagePermission('module:product-design')
  return <SapCodeCreationClient />
}
