import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * Form spacing, as one standard - the law of proximity.
 *
 * Things close together are read as belonging together, and spacing alone does it
 * (Wertheimer, 1923): no border or colour is needed to make a label and its field one unit,
 * only that they sit nearer each other than either sits to anything else. The rule that
 * follows is a ratio, not a number - **the space inside a group must be clearly smaller
 * than the space between groups** - and form guidance puts it at about 4-8px from a label to
 * its control and 20-32px between fields.
 *
 * SafeOps had the first half (labels are 6px from their control, in FieldShell) and not the
 * second: fields sat 12, 14 or 16px apart depending on which file laid them out, so a label
 * was barely closer to its own field than to the one above it. These pin the second half:
 *
 *   inside a field    label -> control -> hint/error   6px   (FieldShell)
 *   between fields    FIELD_GAP                         20px  (FormStack, FormRow)
 *   between sections  SECTION_GAP                       32px  (FormSection), with the
 *                     heading 8px from its own fields, so it reads as theirs
 *
 * Exported as class strings too, for a layout that cannot use the components.
 */
export const FORM_SPACING = {
  stack: 'space-y-5',
  row: 'grid gap-x-3 gap-y-5',
  section: 'space-y-8',
  sectionHeading: 'mb-2',
} as const

/** Fields one above another, 20px apart. */
export function FormStack({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn(FORM_SPACING.stack, className)}>{children}</div>
}

/** Fields side by side; stacks to one column on a phone. */
export function FormRow({ children, columns = 2, className }: { children: ReactNode; columns?: 2 | 3; className?: string }) {
  return (
    <div className={cn(FORM_SPACING.row, columns === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2', className)}>
      {children}
    </div>
  )
}

/**
 * A titled group of fields. The heading sits 8px above its fields and 32px below the
 * previous section, so it is unmistakably the title of what follows - a heading spaced
 * evenly between two sections belongs to neither.
 */
export function FormSection({
  title, description, children, className,
}: {
  title: string
  description?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('[&+&]:mt-8', className)}>
      <div className={FORM_SPACING.sectionHeading}>
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </div>
      <FormStack>{children}</FormStack>
    </section>
  )
}
