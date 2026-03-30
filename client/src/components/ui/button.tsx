import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../../lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-xl text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97] cursor-pointer select-none whitespace-nowrap",
  {
    variants: {
      variant: {
        default:     "bg-[var(--brand)] text-white shadow-[0_1px_3px_rgba(0,122,255,0.25)] hover:bg-[var(--brand-strong)]",
        outline:     "border border-[var(--border)] bg-[var(--brand-soft)] text-[var(--brand)] hover:bg-[#d5eaff]",
        ghost:       "text-[var(--text-2)] hover:bg-[var(--bg-2)] hover:text-[var(--text)]",
        destructive: "bg-[var(--coral-soft)] text-[var(--coral)] border border-[rgba(255,59,48,0.25)] hover:bg-[#ffe5e3]",
        secondary:   "bg-[var(--bg-2)] text-[var(--text)] border border-[var(--border)] hover:bg-[var(--bg-3)]",
        link:        "text-brand underline-offset-4 hover:underline p-0 h-auto",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm:      "h-9 px-3 text-xs",
        lg:      "h-12 px-6 text-base",
        icon:    "h-9 w-9 p-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
