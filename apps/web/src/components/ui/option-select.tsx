import type { ReactNode } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select'

/** Shared styled dropdown for small fixed option lists. */
export function OptionSelect({
  value,
  onValueChange,
  options,
  id,
  label,
  disabled,
  className,
  placeholder,
}: {
  value: string | number
  onValueChange: (value: string) => void
  options: { value: string | number; label: ReactNode }[]
  id?: string
  label: string
  disabled?: boolean
  className?: string
  placeholder?: string
}) {
  return (
    <Select
      value={String(value)}
      onValueChange={onValueChange}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        aria-label={label}
        className={className ?? 'w-full'}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={String(option.value)}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
