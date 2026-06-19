"use client"
import { useState } from "react"
import { simulateEvent, type SimulateEventRequest, type SimulateEventResponse } from "@/lib/api"

const EVENT_TYPES: { value: SimulateEventRequest["event_type"]; label: string }[] = [
  { value: "political_rally", label: "Political Rally" },
  { value: "concert", label: "Concert" },
  { value: "cricket_match", label: "Cricket Match" },
  { value: "road_closure", label: "Road Closure" },
]
const ZONES = ["Central Zone 1", "Central Zone 2", "North Zone 1", "North Zone 2", "South Zone 1", "South Zone 2", "West Zone 1", "East Zone 1"]

export default function Simulate() {
  const [eventType, setEventType] = useState<SimulateEventRequest["event_type"]>("cricket_match")
  const [zone, setZone] = useState(ZONES[0])
  const [attendance, setAttendance] = useState<number | undefined>(20000)
  const [duration, setDuration] = useState<number | undefined>(3)
  const [result, setResult] = useState<SimulateEventResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const run = async () => {
    setLoading(true); setError("")
    try {
      setResult(await simulateEvent({ event_type: eventType, zone, expected_attendance: attendance, duration_hours: duration }))
    } catch { setError("API unavailable — is the backend running on :8000?") }
    finally { setLoading(false) }
  }

  return (
    <div className="p-6">
      <h1 className="text-base font-medium text-gov-900">Event impact simulator</h1>
      <p className="text-xs text-gray-400 mt-0.5 mb-5">Model the traffic impact of a planned event before it happens</p>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-1 gov-card p-5">
          <p className="text-sm font-medium text-gov-900 mb-3">Event details</p>
          <div className="space-y-3">
            <div><label className="gov-label">Event type</label>
              <select className="gov-input" value={eventType} onChange={e => setEventType(e.target.value as SimulateEventRequest["event_type"])}>
                {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select></div>
            <div><label className="gov-label">Zone</label>
              <select className="gov-input" value={zone} onChange={e => setZone(e.target.value)}>
                {ZONES.map(z => <option key={z}>{z}</option>)}
              </select></div>
            <div><label className="gov-label">Expected attendance</label>
              <input className="gov-input" type="number" value={attendance ?? ""} onChange={e => setAttendance(e.target.value ? parseInt(e.target.value) : undefined)} /></div>
            <div><label className="gov-label">Duration (hours)</label>
              <input className="gov-input" type="number" step="0.5" value={duration ?? ""} onChange={e => setDuration(e.target.value ? parseFloat(e.target.value) : undefined)} /></div>
          </div>
          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
          <button onClick={run} disabled={loading} className="gov-btn w-full mt-4">{loading ? "Simulating…" : "Run simulation"}</button>
        </div>

        <div className="col-span-2 space-y-3">
          {result ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="gov-card p-4">
                  <p className="text-[11px] text-gray-500 mb-1">Congestion increase</p>
                  <p className="text-2xl font-medium text-amber-700">+{result.expected_congestion_increase_pct}%</p>
                </div>
                <div className="gov-card p-4">
                  <p className="text-[11px] text-gray-500 mb-1">Projected congestion</p>
                  <p className="text-2xl font-medium text-red-700">{result.projected_congestion_pct}%</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">baseline {result.baseline_congestion_pct}%</p>
                </div>
                <div className="gov-card p-4">
                  <p className="text-[11px] text-gray-500 mb-1">Recommended officers</p>
                  <p className="text-2xl font-medium text-gov-900">{result.recommended_officers}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{result.recommended_barricades} barricades</p>
                </div>
              </div>

              <div className="gov-card p-4">
                <p className="text-sm font-medium text-gov-900 mb-3">Affected zones</p>
                <div className="flex flex-wrap gap-2">
                  {result.affected_zones.map((z, i) => (
                    <span key={z} className={`text-xs px-3 py-1.5 rounded-full ${i === 0 ? "bg-gov-50 text-gov-600 font-medium" : "bg-gray-100 text-gray-600"}`}>
                      {z}{i === 0 ? " (epicenter)" : ""}
                    </span>
                  ))}
                </div>
              </div>

              <div className="gov-card p-3 bg-gray-50 border-gray-100">
                <p className="text-[10px] text-gray-400">{result.basis}</p>
              </div>
            </>
          ) : (
            <div className="gov-card p-10 text-center text-xs text-gray-400">Run a simulation to see projected impact</div>
          )}
        </div>
      </div>
    </div>
  )
}
