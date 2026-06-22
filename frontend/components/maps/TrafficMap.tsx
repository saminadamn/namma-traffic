"use client"
import 'leaflet/dist/leaflet.css'
import { useCallback, useEffect, useRef, useState } from "react"
import { getHotspots, getHeatmap, type Hotspot } from "@/lib/api"

const CAUSES = ["All", "vehicle_breakdown", "water_logging", "tree_fall", "accident", "public_event"]

interface Props {
  height?: number
  onHotspotsChange?: (spots: Hotspot[]) => void
  focusPoint?: { lat: number; lon: number } | null
}

export default function TrafficMap({ height = 480, onHotspotsChange, focusPoint }: Props) {
  const mapRef    = useRef<any>(null)
  const layerRef  = useRef<any>(null)
  const wsRef     = useRef<WebSocket | null>(null)
  const reconnRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const causeRef  = useRef("All")

  const [hotspots,    setHotspots]    = useState<Hotspot[]>([])
  const [cause,       setCause]       = useState("All")
  const [mounted,     setMounted]     = useState(false)
  const [wsLive,      setWsLive]      = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [pulse,       setPulse]       = useState(false)

  useEffect(() => { setMounted(true) }, [])

  // Fly to a hotspot when clicked from outside
  useEffect(() => {
    if (!mapRef.current || !focusPoint) return
    mapRef.current.flyTo([focusPoint.lat, focusPoint.lon], 15, { animate: true, duration: 0.8 })
  }, [focusPoint])

  // Keep causeRef in sync so WebSocket refresh callback never has stale closure
  useEffect(() => { causeRef.current = cause }, [cause])

  // Redraw heatmap circles for the current cause
  const redrawHeatmap = useCallback((c: string) => {
    if (!mapRef.current || !layerRef.current) return
    const L = require("leaflet")
    layerRef.current.clearLayers()

    getHeatmap(c).then(({ points }) => {
      points.forEach(([lat, lon, w]) => {
        L.circle([lat, lon], {
          radius: 120 + w * 100,
          color:     w >= 2 ? "#E24B4A" : w >= 1.5 ? "#EF9F27" : "#1D9E75",
          fillColor: w >= 2 ? "#E24B4A" : w >= 1.5 ? "#EF9F27" : "#1D9E75",
          fillOpacity: 0.38, weight: 1,
        }).addTo(layerRef.current)
      })
    }).catch(() => {})

    getHotspots().then(spots => {
      setHotspots(spots)
      onHotspotsChange?.(spots)
      spots.forEach(h => {
        if (c !== "All" && h.dominant_cause !== c) return
        L.circleMarker([h.lat, h.lon], {
          radius: Math.max(6, h.count / 8),
          color: "#185FA5", fillColor: "#185FA5",
          fillOpacity: 0.55, weight: 1.5,
        }).bindPopup(
          `<b>${h.junction}</b><br>${h.count} incidents<br>Top: ${h.dominant_cause.replace(/_/g, " ")}`
        ).addTo(layerRef.current)
      })
      setLastUpdated(new Date())
      setPulse(true)
      setTimeout(() => setPulse(false), 1200)
    }).catch(() => {})
  }, [onHotspotsChange])

  // Init Leaflet map once mounted
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
      redrawHeatmap(causeRef.current)
    }
  }, [mounted, redrawHeatmap])

  // Redraw when cause filter changes
  useEffect(() => {
    if (!mapRef.current) return
    redrawHeatmap(cause)
  }, [cause, redrawHeatmap])

  // Fallback poll every 20s
  useEffect(() => {
    const t = setInterval(() => redrawHeatmap(causeRef.current), 20_000)
    return () => clearInterval(t)
  }, [redrawHeatmap])

  // WebSocket — instant update on incident_created / resources_updated
  useEffect(() => {
    const wsBase = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000")
      .replace(/^https/, "wss").replace(/^http/, "ws")

    const connect = () => {
      let ws: WebSocket
      try {
        ws = new WebSocket(`${wsBase}/ws/incidents`)
      } catch { return }

      wsRef.current = ws

      ws.onopen  = () => setWsLive(true)
      ws.onclose = () => {
        setWsLive(false)
        reconnRef.current = setTimeout(connect, 5000)
      }
      ws.onerror = () => ws.close()

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === "incident_created" || msg.type === "resources_updated") {
            redrawHeatmap(causeRef.current)
          }
        } catch {}
      }
    }

    connect()
    return () => {
      if (reconnRef.current) clearTimeout(reconnRef.current)
      wsRef.current?.close()
    }
  }, [redrawHeatmap])

  return (
    <div className="space-y-3">
      {/* Controls row */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1.5 flex-wrap flex-1">
          {CAUSES.map(c => (
            <button key={c} onClick={() => setCause(c)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                cause === c
                  ? "bg-gov-500 text-white border-gov-500"
                  : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50"
              }`}>
              {c.replace(/_/g, " ")}
            </button>
          ))}
        </div>

        {/* Live status indicator */}
        <div className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border flex-shrink-0 transition-colors ${
          wsLive
            ? pulse
              ? "bg-emerald-100 border-emerald-300 text-emerald-800"
              : "bg-emerald-50 border-emerald-200 text-emerald-700"
            : "bg-gray-50 border-gray-200 text-gray-400"
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
            wsLive ? "bg-emerald-500 animate-pulse" : "bg-gray-400"
          }`} />
          {wsLive ? "Live" : "Connecting…"}
          {lastUpdated && wsLive && (
            <span className="opacity-60 hidden sm:inline">
              · {lastUpdated.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          )}
        </div>
      </div>

      {/* Map */}
      <div id="traffic-map" style={{ height }} className="rounded-xl border border-gray-200 z-0" />

      {/* Legend */}
      <div className="flex items-center gap-4 text-[11px] text-gray-500 px-1">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 opacity-70 flex-shrink-0" />Road closure / high severity
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 opacity-70 flex-shrink-0" />Medium severity
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 opacity-70 flex-shrink-0" />Low severity
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-600 opacity-60 flex-shrink-0" />Hotspot cluster
        </span>
      </div>
    </div>
  )
}
