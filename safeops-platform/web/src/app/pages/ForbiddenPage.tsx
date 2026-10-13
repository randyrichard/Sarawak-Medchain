import { ShieldX } from 'lucide-react'
import { EmptyState, LinkButton } from '@/components/ui'
import { useOrg } from '@/features/org/OrgContext'
import { CAPABILITY_LABEL, type Capability } from '@/features/permissions/permissions'
import { ROLE_LABEL } from '@/api/types'

export function ForbiddenPage({ capability }: { capability?: string }) {
  const { role } = useOrg()
  // In words, not the key: this said a role lacked "the visitors:view permission", which is
  // the code's name for it and nobody else's.
  const needed = capability ? CAPABILITY_LABEL[capability as Capability] : undefined
  const yourRole = role ? `your role (${ROLE_LABEL[role]})` : 'your role'
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
        {needed ? `It needs “${needed}”, which ${yourRole} does not include.` : `It is not part of ${yourRole}.`}
        {' '}If you need it, ask your workspace administrator. Access changes are recorded.
      </EmptyState>
    </div>
  )
}
