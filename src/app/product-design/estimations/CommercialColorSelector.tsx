'use client'

import { useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'

import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { EstimationCommercialColorCandidate } from './actions'

type CommercialColorSelectorProps = {
  colors: readonly EstimationCommercialColorCandidate[]
  colorCode: string | null
  onSelect: (color: EstimationCommercialColorCandidate | null) => void
  id: string
}

export function CommercialColorSelector({ colors, colorCode, onSelect, id }: CommercialColorSelectorProps) {
  const [open, setOpen] = useState(false)
  const selected = colors.find(color => color.colorCode === colorCode) ?? null

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Color comercial</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger id={id} className={cn(buttonVariants({ variant: 'outline' }), 'w-full justify-between font-normal')}>
          <span className="truncate">{selected ? `${selected.colorCode} · ${selected.colorName || 'Sin nombre'}` : 'Seleccionar color'}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar color por código o nombre..." />
            <CommandList>
              <CommandEmpty>No se encontraron colores.</CommandEmpty>
              <CommandGroup>
                <CommandItem value="sin seleccionar" onSelect={() => { onSelect(null); setOpen(false) }}>
                  <Check className={cn('mr-2 h-4 w-4', colorCode ? 'invisible' : 'opacity-100')} />Sin seleccionar
                </CommandItem>
                {colors.map(color => (
                  <CommandItem key={color.colorCode} value={`${color.colorCode} ${color.colorName}`} onSelect={() => { onSelect(color); setOpen(false) }}>
                    <Check className={cn('mr-2 h-4 w-4', colorCode === color.colorCode ? 'opacity-100' : 'invisible')} />
                    {color.colorCode} · {color.colorName || 'Sin nombre'}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
