import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-medium outline-none transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 focus-visible:ring-[3px] focus-visible:ring-ring/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: "bg-brand-600 text-white shadow-card hover:bg-brand-700 active:bg-brand-800",
        destructive: "bg-destructive text-white shadow-card hover:bg-red-700 active:bg-red-800 focus-visible:ring-destructive/30",
        outline: "border border-hairline-strong bg-white text-foreground shadow-card hover:bg-surface-subtle hover:border-hairline-strong",
        secondary: "bg-secondary text-secondary-foreground hover:bg-slate-200",
        subtle: "bg-brand-50 text-brand-700 hover:bg-brand-100",
        ghost: "text-slate-600 hover:bg-surface-subtle hover:text-foreground",
        link: "text-brand-700 underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 gap-1.5 rounded-md px-3 text-xs has-[>svg]:px-2.5",
        default: "h-9 rounded-md px-4 text-sm has-[>svg]:px-3.5",
        lg: "h-10 rounded-md px-5 text-sm has-[>svg]:px-4",
        /** Densité terrain : app livreur, cible 56px. */
        touch: "h-14 rounded-touch px-6 text-base font-semibold",
        icon: "size-9 rounded-md",
        "icon-sm": "size-8 rounded-md",
        "icon-touch": "size-14 rounded-touch",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button }
