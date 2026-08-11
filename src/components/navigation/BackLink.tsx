import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

type BackLinkProps = {
  href: string
  label: string
}

/** Shared parent-navigation pattern for module and detail screens. */
export function BackLink({ href, label }: BackLinkProps) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </Link>
  )
}
