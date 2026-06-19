"use client"
import { useEffect, useRef, useState } from "react"
import { getHotspots, getHeatmap, type Hotspot } from "@/lib/api"

const CAUSES = ["All", "vehicle_breakdown", "water_logging", "tree_fall", "accident", "public_event"]

export default function TrafficMap({ height = 480 }: { height?: number }) {
  const mapRef = useRef<any>(null)
  const layerRef = useRef<any>(null)
  const [hotspots, setHotspots] = useState<Hotspot[]>([])
  const [cause, setCause] = useState("All")
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => { getHotspots().then(setHotspots).catch(() => {}) }, [])

  useEffect(() => {
    if (!mounted) return
    const L = require("leaflet")
    if (!mapRef.current) {
      const map = L.map("traffic-map", { center: [12.97, 77.59], zoom: 12, scrollWheelZoom: false })
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap", maxZoom: 18,
      }).addTo(map)
      mapRef.current = map
      layerRef.current = L.layerGroup().addTo(map)
    }
    return () => {}
  }, [mounted])

  useEffect(() => {
    if (!mapRef.current || !layerRef.current) return
    const L = require("leaflet")
    layerRef.current.clearLayers()
    getHeatmap(cause).then(({ points }) => {
      points.forEach(([lat, lon, w]) => {
        L.circle([lat, lon], {
          radius: 120 + w * 100,
          color: w >= 2 ? "#E24B4A" : w >= 1.5 ? "#EF9F27" : "#1D9E75",
          fillColor: w >= 2 ? "#E24B4A" : w >= 1.5 ? "#EF9F27" : "#1D9E75",
          fillOpacity: 0.35, weight: 1,
        }).addTo(layerRef.current)
      })
    }).catch(() => {})

    hotspots.forEach(h => {
      if (cause !== "All" && h.dominant_cause !== cause) return
      L.circleMarker([h.lat, h.lon], {
        radius: Math.max(6, h.count / 8), color: "#185FA5", fillColor: "#185FA5",
        fillOpacity: 0.5, weight: 1.5,
      }).bindPopup(`<b>${h.junction}</b><br>${h.count} incidents<br>Top: ${h.dominant_cause.replace(/_/g, " ")}`)
       .addTo(layerRef.current)
    })
  }, [cause, hotspots])

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        {CAUSES.map(c => (
          <button key={c} onClick={() => setCause(c)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              cause === c ? "bg-gov-500 text-white border-gov-500" : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50"
            }`}>
            {c.replace(/_/g, " ")}
          </button>
        ))}
      </div>
      <div id="traffic-map" style={{ height }} className="rounded-xl border border-gray-200 z-0" />
    </div>
  )
}
