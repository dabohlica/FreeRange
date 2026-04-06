import { redirect } from 'next/navigation'

// Root redirects to /journey — middleware handles auth
export default function RootPage() {
  redirect('/journey')
}
