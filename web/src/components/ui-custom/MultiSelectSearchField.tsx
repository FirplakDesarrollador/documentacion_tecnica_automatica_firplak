'use client'

import * as React from "react"
import { ChevronsUpDown, Check } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface Option {
  value: string
  label: string
}

interface MultiSelectSearchFieldProps {
  options: Option[]
  values: string[]
  onChange: (values: string[]) => void
  placeholder: string
  emptyMessage?: string
  className?: string
}

export function MultiSelectSearchField({
  options,
  values,
  onChange,
  placeholder,
  emptyMessage = "No se encontraron resultados.",
  className
}: MultiSelectSearchFieldProps) {
  const [open, setOpen] = React.useState(false)
  const [isMounted, setIsMounted] = React.useState(false)

  React.useEffect(() => {
    setIsMounted(true)
  }, [])

  const toggleOption = (value: string) => {
    if (value === "") {
        onChange([])
        return
    }

    const newValues = values.includes(value)
      ? values.filter((v) => v !== value)
      : [...values, value]
    
    onChange(newValues)
  }

  const selectedLabels = React.useMemo(() => {
    if (values.length === 0) return placeholder
    if (values.length === options.length && options.length > 0) return `Todos (${values.length})`
    if (values.length > 1) return `${values.length} seleccionados`
    
    const singleOption = options.find((o) => values.includes(o.value))
    return singleOption ? singleOption.label : placeholder
  }, [values, options, placeholder])

  if (!isMounted) {
    return (
      <div 
        className={cn(
          buttonVariants({ variant: "outline" }), 
          "w-full max-w-full justify-between font-normal bg-white border-slate-200 text-slate-700 shadow-sm transition-all overflow-hidden flex items-center px-3", 
          className
        )}
      >
        <span className="truncate min-w-0 flex-1 text-left opacity-50">
          {placeholder}
        </span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-20 text-slate-400" />
      </div>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          buttonVariants({ variant: "outline" }), 
          "w-full max-w-full justify-between font-normal bg-white border-slate-200 text-slate-700 shadow-sm hover:border-indigo-200 hover:bg-slate-50 transition-all overflow-hidden", 
          className
        )}
      >
        <span className="truncate min-w-0 flex-1 text-left">
          {selectedLabels}
        </span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50 text-slate-400" />
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-1 rounded-xl border-slate-200 shadow-premium" align="start">
        <Command>
          <CommandInput placeholder={`Buscar ${placeholder.toLowerCase()}...`} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value=""
                data-checked={values.length === options.length && options.length > 0}
                onSelect={() => {
                  if (values.length === options.length) {
                      onChange([])
                  } else {
                      onChange(options.map(o => o.value))
                  }
                }}
                className="flex items-center"
              >
                <div className={cn(
                    "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-slate-300 transition-colors",
                    values.length === options.length && options.length > 0
                    ? "bg-indigo-500 border-indigo-500 text-white"
                    : "opacity-50 [&_svg]:invisible bg-white"
                )}>
                    <Check className="h-3 w-3" />
                </div>
                <span className="font-medium text-slate-700">(Seleccionar todas)</span>
              </CommandItem>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value + '-' + option.label}
                  data-checked={values.includes(option.value)}
                  onSelect={() => {
                    toggleOption(option.value)
                    // Keep popover open for multi-select
                  }}
                  className="flex items-center"
                >
                   <div className={cn(
                        "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-slate-300 transition-colors",
                        values.includes(option.value)
                        ? "bg-indigo-500 border-indigo-500 text-white"
                        : "opacity-50 [&_svg]:invisible bg-white"
                    )}>
                        <Check className="h-3 w-3" />
                    </div>
                  <span className="text-slate-700">{option.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
