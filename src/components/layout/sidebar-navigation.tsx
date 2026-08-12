'use client'

import Link from 'next/link'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useId, useState } from 'react'

import {
  getNavigationHref,
  isModuleNavigationNodeActive,
  resolveModuleNavigationTree,
  type ResolvedModuleNavigationNode,
} from '@/lib/navigation/moduleHierarchy'
import { cn } from '@/lib/utils'
import type { Permission } from '@/types/auth'

type SidebarNavigationProps = {
  permissions: readonly Permission[]
  isAdmin: boolean
  pathname: string | null
  generateHref: string
  isCollapsed: boolean
  mobile?: boolean
  onExpandSidebar?: () => void
}

type NavigationBranchProps = {
  node: ResolvedModuleNavigationNode
  pathname: string | null
  generateHref: string
  isCollapsed: boolean
  mobile: boolean
  depth: number
  openSections: Readonly<Record<string, boolean>>
  onToggle: (nodeId: string) => void
  onExpandSidebar?: () => void
  contentPrefix: string
}

function navigationRowClassName(
  isActive: boolean,
  depth: number,
  isCollapsed: boolean,
  mobile: boolean
): string {
  const nestedPadding = depth === 1 ? 'pl-8' : depth === 2 ? 'pl-11' : 'pl-14'
  const padding = depth === 0
    ? (mobile ? 'px-3 py-3' : 'px-3 py-2.5')
    : (mobile ? 'px-3 py-2.5 pl-9' : `px-3 py-2 ${nestedPadding} text-[13px]`)

  return cn(
    'group relative flex min-w-0 items-center rounded-lg transition-all duration-200',
    isActive
      ? 'bg-white/10 font-semibold text-white ring-1 ring-white/10'
      : 'text-white/65 hover:bg-white/10 hover:text-white',
    isCollapsed && !mobile ? 'justify-center px-2 py-2.5' : `gap-3 ${padding}`
  )
}

function ActiveMarker({ isActive, mobile }: { isActive: boolean; mobile: boolean }) {
  if (!isActive) return null

  return (
    <div
      className={cn(
        'absolute left-0 w-1 rounded-r-full bg-firplak-green',
        mobile ? 'bottom-2 top-2' : 'bottom-1.5 top-1.5'
      )}
    />
  )
}

function SidebarNavigationLeaf({
  node,
  pathname,
  generateHref,
  isCollapsed,
  mobile,
  depth,
}: Omit<NavigationBranchProps, 'openSections' | 'onToggle' | 'onExpandSidebar' | 'contentPrefix'>) {
  const isActive = isModuleNavigationNodeActive(node, pathname)
  const Icon = node.icon

  return (
    <Link
      href={getNavigationHref(node, generateHref)}
      title={isCollapsed && !mobile ? node.label : undefined}
      className={navigationRowClassName(isActive, depth, isCollapsed, mobile)}
    >
      <ActiveMarker isActive={isActive} mobile={mobile} />
      <Icon
        className={cn(
          'shrink-0 transition-colors',
          mobile ? 'h-5 w-5' : (depth === 0 ? 'h-4 w-4' : 'h-3.5 w-3.5'),
          isActive ? 'text-firplak-ivory' : 'text-white/60 group-hover:text-white'
        )}
      />
      {isCollapsed && !mobile ? null : <span className="min-w-0 truncate">{node.label}</span>}
    </Link>
  )
}

function SidebarNavigationBranch({
  node,
  pathname,
  generateHref,
  isCollapsed,
  mobile,
  depth,
  openSections,
  onToggle,
  onExpandSidebar,
  contentPrefix,
}: NavigationBranchProps) {
  if (node.children.length === 0) {
    return (
      <SidebarNavigationLeaf
        node={node}
        pathname={pathname}
        generateHref={generateHref}
        isCollapsed={isCollapsed}
        mobile={mobile}
        depth={depth}
      />
    )
  }

  const isActive = isModuleNavigationNodeActive(node, pathname)
  const open = openSections[node.id] === true
  const compact = isCollapsed && !mobile
  const Icon = node.icon
  const contentId = `${contentPrefix}-${node.id}`

  if (compact) {
    return (
      <button
        type="button"
        onClick={onExpandSidebar ?? (() => onToggle(node.id))}
        title={`Abrir ${node.label}`}
        aria-label={`Abrir ${node.label}`}
        className={cn(
          'flex w-full items-center justify-center rounded-lg px-2 py-2.5 transition-colors',
          isActive
            ? 'bg-white/10 text-firplak-ivory ring-1 ring-white/10'
            : 'text-white/60 hover:bg-white/10 hover:text-white'
        )}
      >
        <Icon className="h-4 w-4" />
      </button>
    )
  }

  const rowClassName = navigationRowClassName(isActive, depth, false, mobile)
  const headerContent = (
    <>
      <ActiveMarker isActive={isActive} mobile={mobile} />
      <Icon className={cn('shrink-0', mobile ? 'h-5 w-5' : 'h-4 w-4', isActive ? 'text-firplak-ivory' : 'text-white/60')} />
      <span className="min-w-0 flex-1 truncate text-left">{node.label}</span>
    </>
  )

  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-1">
        {node.canNavigate ? (
          <Link href={getNavigationHref(node, generateHref)} className={cn(rowClassName, 'flex-1')}>
            {headerContent}
          </Link>
        ) : (
          <div className={cn(rowClassName, 'flex-1')}>
            {headerContent}
          </div>
        )}
        <button
          type="button"
          onClick={() => onToggle(node.id)}
          aria-label={open ? `Contraer ${node.label}` : `Expandir ${node.label}`}
          aria-expanded={open}
          aria-controls={contentId}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/55 transition-colors hover:bg-white/10 hover:text-white"
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      </div>
      <div
        id={contentId}
        hidden={!open}
        className={cn(
          'mt-1 grid gap-0.5 border-l border-white/10',
          depth === 0 ? 'ml-4 pl-2' : 'ml-5 pl-2',
          open ? 'grid' : 'hidden'
        )}
      >
        {node.children.map((child) => (
          <SidebarNavigationBranch
            key={child.id}
            node={child}
            pathname={pathname}
            generateHref={generateHref}
            isCollapsed={false}
            mobile={mobile}
            depth={depth + 1}
            openSections={openSections}
            onToggle={onToggle}
            onExpandSidebar={onExpandSidebar}
            contentPrefix={contentPrefix}
          />
        ))}
      </div>
    </div>
  )
}

export function SidebarNavigation({
  permissions,
  isAdmin,
  pathname,
  generateHref,
  isCollapsed,
  mobile = false,
  onExpandSidebar,
}: SidebarNavigationProps) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({})
  const contentPrefix = useId()
  const tree = resolveModuleNavigationTree(permissions, isAdmin)

  const toggleSection = (nodeId: string) => {
    setOpenSections((current) => ({
      ...current,
      [nodeId]: !current[nodeId],
    }))
  }

  return (
    <>
      {tree.map((node) => (
        <SidebarNavigationBranch
          key={node.id}
          node={node}
          pathname={pathname}
          generateHref={generateHref}
          isCollapsed={isCollapsed}
          mobile={mobile}
          depth={0}
          openSections={openSections}
          onToggle={toggleSection}
          onExpandSidebar={onExpandSidebar}
          contentPrefix={contentPrefix}
        />
      ))}
    </>
  )
}
