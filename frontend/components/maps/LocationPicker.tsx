"use client"
import "leaflet/dist/leaflet.css"
import { useEffect, useRef, useState } from "react"

interface Props {
  lat: string
  lon: string
  onPick: (lat: string, lon: string, address: string) => void
}

async function reverseGeocode(la: number, lo: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${la}&lon=${lo}&zoom=18&addressdetails=1`,
      { headers: { "Accept-Language": "en" } }
    )
    const d = await res.json()
    const parts = [
      d.address?.road || d.address?.pedestrian || d.address?.highway,
      d.address?.suburb || d.address?.neighbourhood || d.address?.locality,
      d.address?.city_district || d.address?.city || "Bengaluru",
    ].filter(Boolean)
    return parts.join(", ") || d.display_name?.split(",").slice(0, 3).join(", ") || ""
  } catch {
    return ""
  }
}

export default function LocationPicker({ lat, lon, onPick }: Props) {
  const containerId = useRef(`loc-map-${Math.random().toString(36).slice(2)}`)
  const mapRef    = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const [mounted,   setMounted]   = useState(false)
  const [locating,  setLocating]  = useState(false)
  const [showHint,  setShowHint]  = useState(true)

  useEffect(() => { setMounted(true) }, [])

  // Auto-hide the map hint after 4 s
  useEffect(() => {
    if (!showHint) return
    const t = setTimeout(() => setShowHint(false), 4000)
    return () => clearTimeout(t)
  }, [showHint])

  useEffect(() => {
    if (!mounted || mapRef.current) return
    const L = require("leaflet")

    const initLat = parseFloat(lat) || 12.9716
    const initLon = parseFloat(lon) || 77.5946

    const map = L.map(containerId.current, { center: [initLat, initLon], zoom: 14 })
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map)

    const pinIcon = L.divIcon({
      className: "",
      html: `<div style="width:28px;height:36px;cursor:grab" title="Drag me anywhere!">
        <svg viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg">
          <path d="M14 0C6.27 0 0 6.27 0 14c0 9.63 14 22 14 22s14-12.37 14-22C28 6.27 21.73 0 14 0z"
            fill="#3B82F6" stroke="#1D4ED8" stroke-width="1.5"/>
          <circle cx="14" cy="13" r="5" fill="white"/>
        </svg>
      </div>`,
      iconSize: [28, 36],
      iconAnchor: [14, 36],
    })

    const marker = L.marker([initLat, initLon], { draggable: true, icon: pinIcon }).addTo(map)

    marker.on("dragend", async () => {
      setShowHint(false)
      const pos = marker.getLatLng()
      const addr = await reverseGeocode(pos.lat, pos.lng)
      onPick(pos.lat.toFixed(6), pos.lng.toFixed(6), addr)
    })

    map.on("click", async (e: any) => {
      setShowHint(false)
      marker.setLatLng(e.latlng)
      const addr = await reverseGeocode(e.latlng.lat, e.latlng.lng)
      onPick(e.latlng.lat.toFixed(6), e.latlng.lng.toFixed(6), addr)
    })

    mapRef.current  = map
    markerRef.current = marker

    return () => {
      map.remove()
      mapRef.current  = null
      markerRef.current = null
    }
  }, [mounted])

  const useMyLocation = () => {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const la = pos.coords.latitude
        const lo = pos.coords.longitude
        if (mapRef.current)  mapRef.current.setView([la, lo], 16)
        if (markerRef.current) markerRef.current.setLatLng([la, lo])
        const addr = await reverseGeocode(la, lo)
        onPick(la.toFixed(6), lo.toFixed(6), addr)
        setLocating(false)
        setShowHint(false)
      },
      () => setLocating(false)
    )
  }

  if (!mounted) {
    return <div className="w-full rounded-xl border border-gray-200 bg-gray-50 animate-pulse" style={{ height: 220 }} />
  }

  return (
    <div>
      {/* Map container — position:relative so the hint overlay sits inside */}
      <div className="relative rounded-xl overflow-hidden border border-gray-200 shadow-sm">
        <div id={containerId.current} style={{ height: 220 }} className="w-full z-0" />

        {/* ── Floating hint banner (fades out after 4 s) ── */}
        <div
          className="absolute top-2.5 left-1/2 -translate-x-1/2 z-[400] pointer-events-none
                     transition-opacity duration-700"
          style={{ opacity: showHint ? 1 : 0 }}
        >
          <div className="flex items-center gap-2 bg-white/90 backdrop-blur-sm
                          border border-gov-200 rounded-full px-3.5 py-2 shadow-lg
                          text-[11px] font-medium text-gov-700 whitespace-nowrap">
            <span className="text-base">📍</span>
            Tap anywhere on the map · or drag the blue pin
          </div>
        </div>

        {/* ── Pulsing ring around pin hint (shows for 3 s) ── */}
        {showHint && (
          <div
            className="absolute z-[399] pointer-events-none"
            style={{
              bottom: "calc(50% - 18px)",
              left: "50%",
              transform: "translate(-50%, 0)",
            }}
          >
            <div className="w-10 h-10 rounded-full border-2 border-blue-400 animate-ping opacity-60" />
          </div>
        )}
      </div>

      {/* Below-map controls */}
      <div className="flex items-center justify-between mt-2 px-0.5">
        <p className="text-[11px] text-gray-500 flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" clipRule="evenodd"
              d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"/>
          </svg>
          Tap anywhere on map to place the pin at any location
        </p>
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          className="text-[11px] text-gov-500 hover:underline disabled:opacity-50 flex items-center gap-1 flex-shrink-0"
        >
          {locating
            ? <><span className="w-3 h-3 border border-gov-400 border-t-transparent rounded-full animate-spin" />Locating…</>
            : <>📍 Use my location</>
          }
        </button>
      </div>
    </div>
  )
}
