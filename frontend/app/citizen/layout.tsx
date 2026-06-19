import PublicHeader from "@/components/PublicHeader"

export default function CitizenLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <div className="max-w-4xl mx-auto px-5 py-8">{children}</div>
    </div>
  )
}
