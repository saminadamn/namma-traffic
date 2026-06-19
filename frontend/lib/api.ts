const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    ...init,
  })
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`)
  return res.json()
}

async function authApi<T>(path: string, init?: RequestInit): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("namma_token") : null
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`)
  return res.json()
}

// ── Auth ────────────────────────────────────────────────────────────────
export const authLogin    = (identifier: string, password: string) => {
  const isEmail = identifier.includes("@")
  const body = isEmail ? { email: identifier, password } : { phone_number: identifier, password }
  return api<TokenResponse>("/api/auth/login", { method: "POST", body: JSON.stringify(body) })
}
export const authRegister = (data: RegisterRequest) =>
  api<UserOut>("/api/auth/register", { method: "POST", body: JSON.stringify(data) })
export const authMe       = () => authApi<UserOut>("/api/auth/me")
export const authLogout   = (refresh_token: string) =>
  authApi("/api/auth/logout", { method: "POST", body: JSON.stringify({ refresh_token }) })

export const predictEvent     = (b: EventInput)  => api<PredictionOutput>("/api/predict", { method: "POST", body: JSON.stringify(b) })
export const getIncidents     = (p?: string)     => api<Incident[]>(`/api/incidents${p ? "?" + p : ""}`)
export const getIncidentStats = ()               => api<IncidentStats>("/api/incidents/stats")
export const getReports       = (s?: string)     => api<Report[]>(`/api/reports${s ? "?status=" + s : ""}`)
export const verifyReport     = (b: object)      => api("/api/reports/verify", { method: "PATCH", body: JSON.stringify(b) })
export const submitReport     = (f: FormData)    => fetch(`${BASE}/api/reports`, { method: "POST", body: f }).then(r => r.json())
export const getHeatmap       = (c?: string)     => api<HeatmapData>(`/api/heatmap${c ? "?cause=" + c : ""}`)
export const getHotspots      = ()               => api<Hotspot[]>("/api/heatmap/hotspots")
export const getAnalytics     = ()               => api<Analytics>("/api/analytics/summary")
export const getWeather       = ()               => api<Weather>("/api/weather")

// ── SIH enhancement-sprint features ────────────────────────────────────
export const explainPrediction = (b: EventInput) => {
  const params = new URLSearchParams()
  Object.entries(b).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") params.set(k, String(v)) })
  return api<ExplainResponse>(`/prediction/explain?${params.toString()}`)
}
export const simulateEvent    = (b: SimulateEventRequest) => api<SimulateEventResponse>("/simulate-event", { method: "POST", body: JSON.stringify(b) })
export const whatIf           = (b: WhatIfRequest)         => api<WhatIfResponse>("/what-if", { method: "POST", body: JSON.stringify(b) })
export const getCommandCenter = ()                         => api<CommandCenterSummary>("/command-center/summary")
export const generateDemoData = (b?: Partial<DemoDataRequest>) =>
  api<DemoDataResponse>("/generate-demo-data", { method: "POST", body: JSON.stringify(b || {}) })
export const getPriorityRanking  = (limit = 10) => api<Incident[]>(`/api/incidents/priority-ranking?limit=${limit}`)

export interface EventInput {
  event_type: string; latitude: number; longitude: number; address: string
  corridor: string; police_station: string; zone: string
  date: string; time: string; crowd_size?: number; weather?: string; description?: string
}
export interface SHAPFeature { feature: string; value: number; direction: "positive" | "negative" }
export interface PredictionOutput {
  risk_score: number; risk_band: "Low" | "Moderate" | "High" | "Critical"
  road_closure_probability: number; officers_required: number; barricades_required: number
  diversion_required: boolean; monitoring_priority: "P1" | "P2" | "P3"
  shap_features: SHAPFeature[]; reasoning: string[]
}
export interface Incident {
  id: string; event_type: string; event_cause: string; latitude: number; longitude: number
  address: string; corridor: string; zone: string; police_station: string
  priority: "High" | "Low"; status: string; requires_road_closure: boolean
  description: string; start_datetime: string
  severity_score?: number | null; severity_label?: "Low" | "Medium" | "High" | "Critical" | null
  priority_score?: number; congestion_impact_score?: number; emergency_proximity_score?: number
}
export interface IncidentStats { total: number; active: number; high_priority: number; road_closures: number }
export interface Report {
  id: string; tracking_id: string; category: string; description: string; address: string
  latitude: number; longitude: number; photo_url?: string; status: string; created_at: string
}
export interface HeatmapData { points: [number, number, number][]; total: number }
export interface Hotspot { junction: string; count: number; lat: number; lon: number; dominant_cause: string }
export interface Analytics {
  total_incidents: number; high_priority: number; road_closures: number; active: number
  top_causes: { cause: string; count: number }[]
  top_zones: { zone: string; count: number }[]
  monthly_trend: { month: string; count: number }[]
}
export interface Weather { max_rain_24h_mm: number; risk: string; monsoon_alert: boolean }

// ── Feature 1: Explainable AI ──────────────────────────────────────────
export interface ContributingFactor { factor: string; contribution_pct: number; direction: string }
export interface ExplainResponse {
  congestion_risk_pct: number; contributing_factors: ContributingFactor[]
  confidence_pct: number; explanation_method: "rule_based_heuristic" | "shap_tree_explainer"
}

// ── Feature 2: Event Impact Simulator ──────────────────────────────────
export interface SimulateEventRequest {
  event_type: "political_rally" | "concert" | "cricket_match" | "road_closure"
  zone: string; expected_attendance?: number; duration_hours?: number
}
export interface SimulateEventResponse {
  event_type: string; event_label: string; zone: string
  expected_congestion_increase_pct: number; baseline_congestion_pct: number; projected_congestion_pct: number
  affected_zones: string[]; recommended_officers: number; recommended_barricades: number
  duration_hours?: number; basis: string
}

// ── Feature 3: What-If Analysis ────────────────────────────────────────
export interface WhatIfRequest { corridor: string; closure_duration_hours?: number }
export interface AlternativeRoute { corridor: string; expected_load_increase_pct: number }
export interface WhatIfResponse {
  closed_corridor: string; closure_duration_hours?: number
  new_congestion_estimate_pct: number; traffic_increase_pct: number
  alternative_routes: AlternativeRoute[]; basis: string
}

// ── Feature 6: Executive Command Center ────────────────────────────────
export interface CommandCenterSummary {
  active_incidents: number; predicted_hotspots: number
  officers_available: number; officers_total: number
  emergency_routes_active: number; advisories_generated: number; generated_at: string
}

// ── Feature 7: Demo Data Generator ─────────────────────────────────────
export interface DemoDataRequest { accidents: number; roadblocks: number; congestion_spikes: number; emergency_calls: number }
export interface DemoDataResponse { generated_at: string; total_created: number; breakdown: Record<string, number>; incidents: Record<string, Incident[]> }

// ── Safe Route ─────────────────────────────────────────────────────────
export const getRoute = (b: RouteRequest) =>
  api<RouteResponse>("/api/route", { method: "POST", body: JSON.stringify(b) })

export interface RouteRequest {
  origin_lat: number; origin_lon: number
  dest_lat: number;   dest_lon: number
}
export interface RouteIncidentInfo {
  id: string; event_cause: string; severity_band: string
  requires_road_closure: boolean; latitude: number; longitude: number
}
export interface RouteResponse {
  path_coords: [number, number][]
  alternative_path_coords: [number, number][]   // the rejected dangerous route
  total_travel_time_s: number
  total_distance_m: number
  incidents_avoided: RouteIncidentInfo[]
  incidents_on_route: RouteIncidentInfo[]
  warnings: string[]
}

// ── Auth ────────────────────────────────────────────────────────────────
export interface TokenResponse { access_token: string; refresh_token: string; token_type: string; expires_in: number }
export interface UserOut { id: string; phone_number: string; email?: string; full_name?: string; is_active: boolean; roles: string[]; permissions: string[] }
export interface RegisterRequest { phone_number: string; password: string; full_name?: string; email?: string }

