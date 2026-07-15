import { Link } from 'react-router-dom'
import { ShieldX } from 'lucide-react'
import { Button, EmptyState } from '@/components/ui'
import { useOrg } from '@/features/org/OrgContext'
import { ROLE_LABEL } from '@/api/types'

export function ForbiddenPage({ capability }: { capability?: string }) {
  const { role } = useOrg()
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <EmptyState
        icon={ShieldX}
        title="You don't have access to this page"
        action={<Button variant="secondary"><Link to="/">Back to Home</Link></Button>}
      >
        {role ? `Your role (${ROLE_LABEL[role]}) doesn't include` : 'Your role doesn\'t include'}
        {capability ? ` the "${capability}" permission.` : ' this permission.'} If you believe you
        need it, ask your workspace admin — access changes are audited.
      </EmptyState>
    </div>
  )
}
