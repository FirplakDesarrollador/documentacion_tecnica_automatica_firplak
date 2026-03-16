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

  const selectedLabels = values.length > 0 
    ? options.filter((o) => values.includes(o.value)).map(o => o.label).join(", ")
    : placeholder

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(buttonVariants({ variant: "outline" }), "w-full justify-between font-normal", className)}
      >
        <span className="truncate">
          {selectedLabels}
        </span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
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
                    "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                    values.length === options.length && options.length > 0
                    ? "bg-primary text-primary-foreground"
                    : "opacity-50 [&_svg]:invisible"
                )}>
                    <Check className="h-4 w-4" />
                </div>
                (Seleccionar todas)
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
                        "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                        values.includes(option.value)
                        ? "bg-primary text-primary-foreground"
                        : "opacity-50 [&_svg]:invisible"
                    )}>
                        <Check className="h-4 w-4" />
                    </div>
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
