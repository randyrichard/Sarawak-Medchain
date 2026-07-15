import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { Button, EmptyState } from '@/components/ui'

export function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <EmptyState
        icon={Compass}
        title="Page not found"
        action={<Button variant="secondary"><Link to="/">Back to Home</Link></Button>}
      >
        The page you're looking for doesn't exist — or hasn't shipped yet. Locked items in the
        sidebar show what's coming in the next sprints.
      </EmptyState>
    </div>
  )
}
