'use client'

import { forwardRef } from 'react'
import EntryCard from '@/components/entries/EntryCard'
import { cn } from '@/lib/utils'

interface JourneyCardProps {
  entry: React.ComponentProps<typeof EntryCard>['entry']
  isActive: boolean
}

const JourneyCard = forwardRef<HTMLDivElement, JourneyCardProps>(
  ({ entry, isActive }, ref) => (
    <div
      ref={ref}
      data-entry-id={entry.id}
      className={cn(
        'transition-all duration-300 rounded-2xl',
        isActive && 'ring-2 ring-[#171717] ring-offset-2'
      )}
    >
      <EntryCard entry={entry} showTime />
    </div>
  )
)
JourneyCard.displayName = 'JourneyCard'
export default JourneyCard
