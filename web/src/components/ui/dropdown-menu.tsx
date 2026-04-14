import * as React from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Root ───────────────────────────────────────────────────────────────────
interface DropdownMenuContextValue {
  open: boolean
  setOpen: (open: boolean) => void
}
const DropdownMenuContext = React.createContext<DropdownMenuContextValue>({
  open: false,
  setOpen: () => {},
})

interface DropdownMenuProps {
  children: React.ReactNode
}
function DropdownMenu({ children }: DropdownMenuProps) {
  const [open, setOpen] = React.useState(false)
  return (
    <DropdownMenuContext.Provider value={{ open, setOpen }}>
      <div className="relative inline-block">{children}</div>
    </DropdownMenuContext.Provider>
  )
}

// ─── Trigger ────────────────────────────────────────────────────────────────
interface DropdownMenuTriggerProps {
  asChild?: boolean
  children: React.ReactNode
}
function DropdownMenuTrigger({ children, asChild }: DropdownMenuTriggerProps) {
  const { open, setOpen } = React.useContext(DropdownMenuContext)

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setOpen(!open)
  }

  // Close on outside click
  React.useEffect(() => {
    if (!open) return
    const handler = () => setOpen(false)
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open, setOpen])

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<any>, {
      onClick: handleClick,
    })
  }

  return (
    <button type="button" onClick={handleClick}>
      {children}
    </button>
  )
}

// ─── Content ────────────────────────────────────────────────────────────────
interface DropdownMenuContentProps {
  children: React.ReactNode
  align?: "start" | "end" | "center"
  className?: string
}
function DropdownMenuContent({ children, align = "start", className }: DropdownMenuContentProps) {
  const { open } = React.useContext(DropdownMenuContext)
  if (!open) return null

  const alignClass =
    align === "end" ? "right-0" : align === "center" ? "left-1/2 -translate-x-1/2" : "left-0"

  return (
    <div
      className={cn(
        "absolute z-50 mt-1 min-w-[10rem] max-h-72 overflow-y-auto",
        "bg-white border border-slate-200 rounded-xl shadow-lg py-1",
        alignClass,
        className
      )}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  )
}

// ─── Label ──────────────────────────────────────────────────────────────────
function DropdownMenuLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("px-3 py-2 text-xs text-slate-500 font-semibold uppercase tracking-wider", className)}>
      {children}
    </div>
  )
}

// ─── Separator ──────────────────────────────────────────────────────────────
function DropdownMenuSeparator() {
  return <div className="h-px bg-slate-100 my-1" />
}

// ─── RadioGroup ─────────────────────────────────────────────────────────────
interface RadioGroupContextValue {
  value: string
  onValueChange: (val: string) => void
}
const RadioGroupContext = React.createContext<RadioGroupContextValue>({
  value: "",
  onValueChange: () => {},
})

interface DropdownMenuRadioGroupProps {
  value: string
  onValueChange: (value: string) => void
  children: React.ReactNode
}
function DropdownMenuRadioGroup({ value, onValueChange, children }: DropdownMenuRadioGroupProps) {
  return (
    <RadioGroupContext.Provider value={{ value, onValueChange }}>
      <div>{children}</div>
    </RadioGroupContext.Provider>
  )
}

// ─── RadioItem ──────────────────────────────────────────────────────────────
interface DropdownMenuRadioItemProps {
  value: string
  children: React.ReactNode
  className?: string
}
function DropdownMenuRadioItem({ value, children, className }: DropdownMenuRadioItemProps) {
  const { value: selected, onValueChange } = React.useContext(RadioGroupContext)
  const { setOpen } = React.useContext(DropdownMenuContext)
  const isSelected = selected === value

  const handleSelectAction = () => {
    onValueChange(value)
    setOpen(false)
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        // Mantenemos onClick para accesibilidad (teclado: Enter/Space)
        handleSelectAction()
      }}
      onMouseDown={(e) => {
        // En algunos entornos el click falla; forzamos la selección en el momento de la pulsación
        e.preventDefault() // Prevenir que mousedown robe foco y rompa la cadena de clics
        handleSelectAction()
      }}
      className={cn(
        "w-full text-left flex items-start gap-2 px-3 py-2 text-sm hover:bg-slate-50 transition-colors",
        isSelected && "bg-indigo-50",
        className
      )}
    >
      <div className={cn(
        "mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
        isSelected ? "border-indigo-500 bg-indigo-500" : "border-slate-300 bg-white"
      )}>
        {isSelected && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
      </div>
      <div className="flex-1">{children}</div>
    </button>
  )
}

// ─── Item ────────────────────────────────────────────────────────────────────
interface DropdownMenuItemProps {
  children: React.ReactNode
  className?: string
  onClick?: () => void
}
function DropdownMenuItem({ children, className, onClick }: DropdownMenuItemProps) {
  const { setOpen } = React.useContext(DropdownMenuContext)
  return (
    <button
      type="button"
      onClick={() => { onClick?.(); setOpen(false) }}
      className={cn(
        "w-full text-left flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 transition-colors",
        className
      )}
    >
      {children}
    </button>
  )
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuItem,
}
