import * as React from "react"
import { cn } from "@/lib/utils"

interface ProgressProps {
  value?: number
  className?: string
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ value = 0, className, ...props }, ref) => (
    <div
      ref={ref}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-slate-100",
        className
      )}
      {...props}
    >
      <div
        className="h-full bg-indigo-500 transition-all duration-300 ease-in-out rounded-full"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
)
Progress.displayName = "Progress"

export { Progress }
