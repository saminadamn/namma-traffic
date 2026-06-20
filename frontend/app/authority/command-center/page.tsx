"use client"
import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function CommandCenterRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace("/authority/dashboard") }, [])
  return null
}
