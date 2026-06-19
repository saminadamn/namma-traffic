"use client"
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState } from "react"
import type { RouteResponse, RouteIncidentInfo } from "@/lib/api"

interface Props {
  originLat: number
  originLon: number
  destLat: number
  destLon: number
  route: RouteResponse | null
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: "#E24B4A",
  high:     "#EF9F27",
  medium:   "#F59E0B",
  low:      "#6B7280",
}

export default function RouteMap({ originLat, originLon, destLat, destLon, route }: Props) {
  const containerId = useRef(`route-map-${Math.random().toString(36).slice(2)}`)
  const mapRef      = useRef<any>(null)
  const layersRef   = useRef<any[]>([])
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  // Initialise map once
  useEffect(() => {
    if (!mounted || mapRef.current) return
    const L = require("leaflet")

    const map = L.map(containerId.current, {
      center: [12.97, 77.59],
      zoom: 11,
      scrollWheelZoom: false,
    })
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 18,
    }).addTo(map)
    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [mounted])

  // Re-draw whenever route or pins change
  useEffect(() => {
    if (!mapRef.current) return
    const L = require("leaflet")
    const map = mapRef.current

    // Clear previous layers
    layersRef.current.forEach(l => l.remove())
    layersRef.current = []

    const add = (layer: any) => { layer.addTo(map); layersRef.current.push(layer) }

    // Origin marker (green)
    const originIcon = L.divIcon({
      className: "",
      html: `<div style="width:24px;height:32px">
        <svg viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg">
          <path d="M14 0C6.27 0 0 6.27 0 14c0 9.63 14 22 14 22s14-12.37 14-22C28 6.27 21.73 0 14 0z"
            fill="#1D9E75" stroke="#0F7A59" stroke-width="1.5"/>
          <text x="14" y="18" text-anchor="middle" fill="white" font-size="11" font-weight="bold" font-family="sans-serif">A</text>
        </svg></div>`,
      iconSize: [24, 32], iconAnchor: [12, 32],
    })
    add(L.marker([originLat, originLon], { icon: originIcon }).bindPopup("<b>Origin</b>"))

    // Destination marker (red)
    const destIcon = L.divIcon({
      className: "",
      html: `<div style="width:24px;height:32px">
        <svg viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg">
          <path d="M14 0C6.27 0 0 6.27 0 14c0 9.63 14 22 14 22s14-12.37 14-22C28 6.27 21.73 0 14 0z"
            fill="#E24B4A" stroke="#C0392B" stroke-width="1.5"/>
          <text x="14" y="18" text-anchor="middle" fill="white" font-size="11" font-weight="bold" font-family="sans-serif">B</text>
        </svg></div>`,
      iconSize: [24, 32], iconAnchor: [12, 32],
    })
    add(L.marker([destLat, destLon], { icon: destIcon }).bindPopup("<b>Destination</b>"))

    if (route) {
      // Draw avoided incident zones FIRST (beneath route line)
      route.incidents_avoided.forEach((inc: RouteIncidentInfo) => {
        const radius = inc.requires_road_closure ? 450 : 250
        // Outer glow ring
        add(L.circle([inc.latitude, inc.longitude], {
          radius: radius + 80,
          color: "#DC2626",
          fillColor: "#DC2626",
          fillOpacity: 0.08,
          weight: 0,
        }))
        // Main red zone
        add(L.circle([inc.latitude, inc.longitude], {
          radius,
          color: "#DC2626",
          fillColor: "#FF2222",
          fillOpacity: 0.30,
          weight: 2.5,
        }).bindPopup(
          `<div style="min-width:180px">` +
          `<b style="color:#DC2626">⚠ AVOIDED ZONE</b><br>` +
          `<b>${inc.event_cause.replace(/_/g, " ").toUpperCase()}</b><br>` +
          `Severity: <b>${inc.severity_band}</b><br>` +
          (inc.requires_road_closure
            ? `<span style="color:#DC2626">🚫 Road closure — blocked from graph</span>`
            : `<span style="color:#D97706">⚡ Danger zone — route penalised 5×</span>`) +
          `</div>`
        ))
        // Warning icon marker
        const warnIcon = L.divIcon({
          className: "",
          html: `<div style="background:#DC2626;color:white;border-radius:50%;width:26px;height:26px;` +
                `display:flex;align-items:center;justify-content:center;font-size:14px;` +
                `border:2px solid white;box-shadow:0 0 8px rgba(220,38,38,0.7);font-weight:bold">⚠</div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        })
        add(L.marker([inc.latitude, inc.longitude], { icon: warnIcon }).bindPopup(
          `<b style="color:#DC2626">⚠ ${inc.event_cause.replace(/_/g, " ")}</b><br>Severity: ${inc.severity_band}`
        ))
      })

      // Draw route polyline ON TOP of red zones
      if (route.path_coords.length >= 2) {
        const line = L.polyline(route.path_coords, { color: "#185FA5", weight: 5, opacity: 0.9 })
        add(line)
        map.fitBounds(line.getBounds(), { padding: [60, 60] })
      }

      // Draw on-route incidents (fallback path only)
      route.incidents_on_route.forEach((inc: RouteIncidentInfo) => {
        add(L.circle([inc.latitude, inc.longitude], {
          radius: 200,
          color: "#991B1B",
          fillColor: "#991B1B",
          fillOpacity: 0.5,
          weight: 2,
        }).bindPopup(`<b>⚠ On-route alert:</b> ${inc.event_cause.replace(/_/g, " ")}`))
      })
    } else {
      // No route yet — just fit to origin + dest
      const bounds = L.latLngBounds([[originLat, originLon], [destLat, destLon]])
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [60, 60] })
    }
  }, [mounted, originLat, originLon, destLat, destLon, route])

  if (!mounted) {
    return <div className="w-full rounded-xl border border-gray-200 bg-gray-100 animate-pulse" style={{ height: 420 }} />
  }

  return (
    <div id={containerId.current} style={{ height: 420 }}
      className="w-full rounded-xl border border-gray-200 z-0" />
  )
}
