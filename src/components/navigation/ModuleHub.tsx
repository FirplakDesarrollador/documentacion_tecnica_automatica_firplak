import Link from 'next/link'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'

import {
  getNavigationHref,
  resolveModuleNavigationNode,
  type ModuleNavigationNode,
  type ResolvedModuleNavigationNode,
} from '@/lib/navigation/moduleHierarchy'
import type { Permission } from '@/types/auth'

type ModuleHubProps = {
  node: ModuleNavigationNode
  permissions: readonly Permission[]
  isAdmin: boolean
  backHref: string
  backLabel: string
  generateHref?: string
  children?: ReactNode
}

type ModuleHubCardProps = {
  node: ResolvedModuleNavigationNode
  generateHref: string
}

function ModuleHubCard({ node, generateHref }: ModuleHubCardProps) {
  const Icon = node.icon
  const content = (
    <>
      <div className={`rounded-lg p-3 ${node.tone}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="font-semibold text-slate-900 transition-colors group-hover:text-indigo-700">
          {node.label}
        </h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">{node.description}</p>
      </div>
      {node.canNavigate ? (
        <ArrowRight className="mt-1 h-5 w-5 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-500" />
      ) : null}
    </>
  )

  const className = 'group flex min-h-32 items-start gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md'

  if (!node.canNavigate) {
    return <div className={className}>{content}</div>
  }

  return (
    <Link href={getNavigationHref(node, generateHref)} className={className}>
      {content}
    </Link>
  )
}

export function ModuleHub({
  node,
  permissions,
  isAdmin,
  backHref,
  backLabel,
  generateHref = '/generate',
  children,
}: ModuleHubProps) {
  const resolvedNode = resolveModuleNavigationNode(node, permissions, isAdmin)

  if (!resolvedNode) return null

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header>
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition hover:text-indigo-700"
          >
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </Link>
          <p className="mt-4 text-sm font-semibold uppercase tracking-wide text-indigo-600">
            {resolvedNode.label}
          </p>
          <h1 className="text-2xl font-bold text-slate-900">
            {resolvedNode.summaryTitle ?? resolvedNode.label}
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            {resolvedNode.summaryDescription ?? resolvedNode.description}
          </p>
        </header>

        {resolvedNode.children.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {resolvedNode.children.map((child) => (
              <ModuleHubCard key={child.id} node={child} generateHref={generateHref} />
            ))}
          </div>
        ) : null}

        {children}
      </div>
    </main>
  )
}
