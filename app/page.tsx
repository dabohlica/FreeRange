import { redirect } from 'next/navigation'

// Root redirects to /map — middleware handles auth
export default function RootPage() {
  redirect('/map')
}
