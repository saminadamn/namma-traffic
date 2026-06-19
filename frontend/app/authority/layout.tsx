"use client"
import { usePathname } from "next/navigation"
import AuthorityShell from "@/components/AuthorityShell"

const AUTH_PAGES = ["/authority/login", "/authority/signup"]

export default function AuthorityLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  if (AUTH_PAGES.includes(path)) return <>{children}</>
  return <AuthorityShell>{children}</AuthorityShell>
}
