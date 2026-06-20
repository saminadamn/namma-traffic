"use client"
import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function SimulatePage() {
  const router = useRouter()
  useEffect(() => { router.replace("/authority/predict?tab=simulate") }, [router])
  return null
}
