import { ShieldX } from 'lucide-react'
import { EmptyState, LinkButton } from '@/components/ui'
import { useOrg } from '@/features/org/OrgContext'
import { ROLE_LABEL } from '@/api/types'

export function ForbiddenPage({ capability }: { capability?: string }) {
  const { role } = useOrg()
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <EmptyState
        icon={ShieldX}
        title="You don't have access to this page"
        titleAs="h1"
        // A link styled as a button. This was a <button> wrapping a <Link>: two tab stops
        // for one action, and a click on the button's padding went nowhere.
        action={<LinkButton to="/" variant="secondary">Back to Home</LinkButton>}
      >
        {role ? `Your role (${ROLE_LABEL[role]}) doesn't include` : 'Your role doesn\'t include'}
        {capability ? ` the "${capability}" permission.` : ' this permission.'} If you believe you
        need it, ask your workspace admin — access changes are audited.
      </EmptyState>
    </div>
  )
}
