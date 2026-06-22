"use client"
import "leaflet/dist/leaflet.css"
import { useEffect, useRef, useState } from "react"
import type { RouteResponse, RouteIncidentInfo } from "@/lib/api"

interface Props {
  originLat: number; originLon: number
  destLat:   number; destLon:   number
  route: RouteResponse | null
}

// CSS for the pulsing danger zone animation injected once into the document head
const PULSE_STYLE = `
@keyframes danger-pulse {
  0%   { transform: scale(1);   opacity: 0.7; }
  50%  { transform: scale(1.35); opacity: 0.25; }
  100% { transform: scale(1);   opacity: 0.7; }
}
@keyframes avoided-pop {
  0%   { transform: scale(0.8); opacity: 0; }
  60%  { transform: scale(1.15); }
  100% { transform: scale(1);   opacity: 1; }
}
.danger-pulse { animation: danger-pulse 2s ease-in-out infinite; }
.avoided-pop  { animation: avoided-pop  0.4s ease-out forwards; }
`

function injectStyle() {
  if (typeof document === "undefined") return
  if (document.getElementById("routemap-style")) return
  const s = document.createElement("style")
  s.id = "routemap-style"
  s.textContent = PULSE_STYLE
  document.head.appendChild(s)
}

const SEVERITY_FILL: Record<string, string> = {
  critical: "#DC2626", high: "#EA580C", medium: "#D97706", low: "#6B7280",
}

function pinSvg(letter: string, fill: string, stroke: string) {
  return (
    `<svg viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg" width="28" height="36">` +
    `<path d="M14 0C6.27 0 0 6.27 0 14c0 9.63 14 22 14 22s14-12.37 14-22C28 6.27 21.73 0 14 0z"` +
    ` fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>` +
    `<text x="14" y="19" text-anchor="middle" fill="white" font-size="12" font-weight="bold" font-family="sans-serif">${letter}</text>` +
    `</svg>`
  )
}

export default function RouteMap({ originLat, originLon, destLat, destLon, route }: Props) {
  const idRef     = useRef(`rm-${Math.random().toString(36).slice(2)}`)
  const mapRef    = useRef<any>(null)
  const layersRef = useRef<any[]>([])
  const [mounted, setMounted] = useState(false)

  useEffect(() => { injectStyle(); setMounted(true) }, [])

  // Init map once
  useEffect(() => {
    if (!mounted || mapRef.current) return
    const L = require("leaflet")
    const map = L.map(idRef.current, { center: [12.97, 77.59], zoom: 11, scrollWheelZoom: false })
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors", maxZoom: 18,
    }).addTo(map)
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [mounted])

  // Redraw whenever route/pins change
  useEffect(() => {
    if (!mapRef.current) return
    const L   = require("leaflet")
    const map = mapRef.current

    layersRef.current.forEach(l => l.remove())
    layersRef.current = []
    const add = (l: any) => { l.addTo(map); layersRef.current.push(l) }

    // ── Origin pin ──────────────────────────────────────────────────────
    add(L.marker([originLat, originLon], {
      icon: L.divIcon({ className: "", html: pinSvg("A", "#1D9E75", "#0F7A59"), iconSize: [28, 36], iconAnchor: [14, 36] }),
    }).bindPopup("<b>Origin</b>"))

    // ── Destination pin ──────────────────────────────────────────────────
    add(L.marker([destLat, destLon], {
      icon: L.divIcon({ className: "", html: pinSvg("B", "#E24B4A", "#C0392B"), iconSize: [28, 36], iconAnchor: [14, 36] }),
    }).bindPopup("<b>Destination</b>"))

    // ── Faint straight-line preview (always shown as a baseline) ─────────
    add(L.polyline([[originLat, originLon], [destLat, destLon]], {
      color: "#CBD5E1", weight: 2, opacity: 0.55, dashArray: "6 8",
    }))

    if (!route || route.path_coords.length < 2) {
      const b = L.latLngBounds([[originLat, originLon], [destLat, destLon]])
      if (b.isValid()) map.fitBounds(b, { padding: [70, 70] })
      return
    }

    const hasSafeAlt = route.alternative_path_coords?.length >= 2
    const isOnRoute  = route.incidents_on_route.length > 0

    // ── 1. Rejected "dangerous" route (drawn first, lowest z-index) ──────
    if (hasSafeAlt) {
      // Outer glow
      add(L.polyline(route.alternative_path_coords, {
        color: "#DC2626", weight: 12, opacity: 0.1,
      }))
      // Dashed red line
      add(L.polyline(route.alternative_path_coords, {
        color: "#DC2626", weight: 3, opacity: 0.55,
        dashArray: "10 8",
      }).bindPopup(
        `<div style="min-width:180px">` +
        `<b style="color:#DC2626">⚠ Rejected dangerous route</b><br>` +
        `<span style="font-size:12px">This path had active incidents — the system chose the safer route instead.</span>` +
        `</div>`
      ))
    }

    // ── 2. Incident danger zones (avoided — UNDER the safe route) ────────
    route.incidents_avoided.forEach((inc: RouteIncidentInfo) => {
      const fill   = SEVERITY_FILL[inc.severity_band.toLowerCase()] ?? "#DC2626"
      const radius = inc.requires_road_closure ? 500 : 300

      // Pulsing outer ring
      const pulseIcon = L.divIcon({
        className: "",
        html: `<div class="danger-pulse" style="
          width:${radius / 8}px;height:${radius / 8}px;
          border-radius:50%;border:3px solid ${fill};
          opacity:0.6;background:transparent;margin:auto"></div>`,
        iconSize: [radius / 8, radius / 8],
        iconAnchor: [radius / 16, radius / 16],
      })
      add(L.marker([inc.latitude, inc.longitude], { icon: pulseIcon }))

      // Filled danger circle
      add(L.circle([inc.latitude, inc.longitude], {
        radius,
        color: fill,
        fillColor: fill,
        fillOpacity: 0.22,
        weight: 2,
        dashArray: "6 4",
      }).bindPopup(
        `<div style="min-width:200px">` +
        `<b style="color:${fill}">⚠ ${inc.event_cause.replace(/_/g, " ").toUpperCase()}</b><br>` +
        `Severity: <b>${inc.severity_band}</b><br>` +
        (inc.requires_road_closure ? `<span style="color:#DC2626">🚫 Road closure</span><br>` : "") +
        `<span style="color:#16A34A;font-weight:600">✓ AVOIDED — your route goes around this</span>` +
        `</div>`
      ))

      // "AVOIDED ✓" badge
      const avoidIcon = L.divIcon({
        className: "avoided-pop",
        html: `<div style="background:#16A34A;color:white;border-radius:8px;padding:3px 7px;
          font-size:10px;font-weight:700;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.3);
          border:2px solid white">✓ AVOIDED</div>`,
        iconSize: [72, 22],
        iconAnchor: [36, -8],
      })
      add(L.marker([inc.latitude, inc.longitude], { icon: avoidIcon }))
    })

    // ── 3. On-route incidents (route couldn't avoid these) ────────────────
    route.incidents_on_route.forEach((inc: RouteIncidentInfo) => {
      const fill   = SEVERITY_FILL[inc.severity_band.toLowerCase()] ?? "#EA580C"
      const radius = inc.requires_road_closure ? 500 : 300

      add(L.circle([inc.latitude, inc.longitude], {
        radius,
        color: fill,
        fillColor: fill,
        fillOpacity: 0.35,
        weight: 2.5,
      }).bindPopup(
        `<div style="min-width:200px">` +
        `<b style="color:${fill}">⚠ ${inc.event_cause.replace(/_/g, " ").toUpperCase()}</b><br>` +
        `Severity: <b>${inc.severity_band}</b><br>` +
        (inc.requires_road_closure ? `<span style="color:#DC2626">🚫 Road closure ahead</span><br>` : "") +
        `<span style="color:#EA580C;font-weight:600">⚡ On your route — drive carefully</span>` +
        `</div>`
      ))

      const alertIcon = L.divIcon({
        className: "",
        html: `<div class="danger-pulse" style="background:#EA580C;color:white;border-radius:50%;
          width:28px;height:28px;display:flex;align-items:center;justify-content:center;
          font-size:15px;border:2px solid white;box-shadow:0 0 10px rgba(234,88,12,0.6)">⚠</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      })
      add(L.marker([inc.latitude, inc.longitude], { icon: alertIcon }))
    })

    // ── 4. Safe route line (top layer) ────────────────────────────────────
    const routeColor = isOnRoute ? "#F59E0B" : "#16A34A"
    const routeLabel = isOnRoute ? "⚠ Use caution — incidents ahead" : "✓ Safe route — no incidents"

    if (route.path_coords.length >= 2) {
      // Soft glow
      add(L.polyline(route.path_coords, { color: routeColor, weight: 14, opacity: 0.15 }))
      // Main line
      const line = L.polyline(route.path_coords, {
        color: routeColor, weight: 5, opacity: 0.95,
      }).bindPopup(
        `<div style="min-width:160px">` +
        `<b style="${isOnRoute ? "color:#F59E0B" : "color:#16A34A"}">${routeLabel}</b><br>` +
        `<span style="font-size:12px">` +
        `${Math.round(route.total_travel_time_s / 60)} min · ` +
        `${(route.total_distance_m / 1000).toFixed(1)} km</span>` +
        `</div>`
      )
      add(line)
      map.fitBounds(line.getBounds(), { padding: [70, 70] })
    }

    // ── 5. Map legend ──────────────────────────────────────────────────────
    const legend = L.control({ position: "bottomleft" })
    legend.onAdd = () => {
      const div = L.DomUtil.create("div")
      div.innerHTML = `
        <div style="background:white;border-radius:10px;padding:10px 12px;font-size:11px;
          box-shadow:0 2px 8px rgba(0,0,0,0.18);border:1px solid #E5E7EB;line-height:2">
          <div style="font-weight:700;font-size:12px;margin-bottom:4px;color:#111827">Route Legend</div>
          <div><span style="display:inline-block;width:24px;height:4px;background:#16A34A;border-radius:2px;vertical-align:middle;margin-right:6px"></span>Safe route</div>
          <div><span style="display:inline-block;width:24px;height:4px;background:#F59E0B;border-radius:2px;vertical-align:middle;margin-right:6px"></span>Caution route</div>
          ${hasSafeAlt ? `<div><span style="display:inline-block;width:24px;height:3px;background:#DC2626;border-radius:2px;vertical-align:middle;margin-right:6px;opacity:0.6;border-top:2px dashed #DC2626"></span>Avoided (dangerous)</div>` : ""}
          <div><span style="display:inline-block;width:12px;height:12px;background:#DC262640;border:2px dashed #DC2626;border-radius:50%;vertical-align:middle;margin-right:6px"></span>Danger zone (avoided)</div>
          <div><span style="display:inline-block;width:12px;height:12px;background:#EA580C50;border:2px solid #EA580C;border-radius:50%;vertical-align:middle;margin-right:6px"></span>Incident on route</div>
        </div>`
      return div
    }
    legend.addTo(map)
    layersRef.current.push(legend)

  }, [mounted, originLat, originLon, destLat, destLon, route])

  if (!mounted) {
    return <div className="w-full bg-gray-100 animate-pulse rounded-xl" style={{ height: 440 }} />
  }

  return (
    <div id={idRef.current} className="w-full rounded-xl border border-gray-200 z-0" style={{ height: 440 }} />
  )
}
