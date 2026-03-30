import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../../lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-lg px-2 py-0.5 text-[11px] font-bold tracking-wide transition-colors",
  {
    variants: {
      variant: {
        default:  "bg-[var(--brand-soft)] text-[var(--brand)] border border-[rgba(78,226,140,0.20)]",
        income:   "bg-[var(--jade-soft)]  text-[var(--jade)]  border border-[rgba(78,226,140,0.20)]",
        expense:  "bg-[var(--coral-soft)] text-[var(--coral)] border border-[rgba(255,100,117,0.20)]",
        saving:   "bg-[var(--amber-soft)] text-[var(--amber)] border border-[rgba(255,190,85,0.20)]",
        transfer: "bg-[var(--sky-soft)]   text-[var(--sky)]   border border-[rgba(91,170,255,0.20)]",
        outline:  "border border-[var(--border-hi)] text-[var(--text-2)]",
        secondary:"bg-[var(--bg-3)] text-[var(--text-2)] border border-[var(--border)]",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
