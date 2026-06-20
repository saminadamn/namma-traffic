"use client"
import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function WhatIfPage() {
  const router = useRouter()
  useEffect(() => { router.replace("/authority/predict?tab=whatif") }, [router])
  return null
}
