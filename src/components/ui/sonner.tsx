"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast border-border bg-popover text-popover-foreground shadow-premium",
          title: "text-sm font-semibold tracking-[-0.01em] text-slate-900",
          description: "text-xs leading-relaxed text-slate-500",
          content: "gap-0.5",
          icon: "text-firplak-green",
          actionButton: "bg-primary text-primary-foreground hover:bg-primary/90",
          cancelButton: "border border-border bg-white text-slate-700 hover:bg-slate-50",
          success: "border-l-4 border-l-emerald-500",
          info: "border-l-4 border-l-firplak-green",
          warning: "border-l-4 border-l-amber-500",
          error: "border-l-4 border-l-destructive",
          loading: "border-l-4 border-l-firplak-green",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
