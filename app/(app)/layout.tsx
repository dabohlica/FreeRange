import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Navigation from '@/components/Navigation'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')

  return (
    <>
      <Navigation role={session.role} />
      {children}
    </>
  )
}
