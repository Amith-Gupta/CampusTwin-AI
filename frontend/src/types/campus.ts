export type UtilizationStatus = 'low' | 'normal' | 'high' | 'full';

export interface RoomEquipment {
  id?: number;
  equipment_name: string;
  quantity: number;
  power_rating_watts: number;
  total_power_watts?: number;
  is_active?: boolean;
}

export interface Room {
  id: number;
  building: string;
  room_number: string;
  name: string;
  capacity: number;
  room_type: string;
  camera_source: string;
  operating_hours: string;
  current_occupancy: number;
  occupancy_percentage: number;
  available_seats: number;
  utilization_status: UtilizationStatus;
  created_at: string;
  equipment?: RoomEquipment[];
}

export interface OccupancyReading {
  id: number;
  room_id: number;
  people_count: number;
  occupancy_percentage: number;
  source_type: 'live_webcam' | 'video_upload' | 'demo_data' | 'manual_entry';
  recorded_at: string;
}

export interface HourlyChartPoint {
  hour: string;
  avg_people: number;
  observations: number;
}

export interface EnergyReading {
  id: number;
  room_id: number;
  estimated_kwh: number;
  actual_kwh: number | null;
  source_type: 'calculated_estimate' | 'meter_entry' | 'demo_baseline';
  recorded_at: string;
}

export interface Alert {
  id: number;
  room_id: number;
  room_name: string;
  alert_type: string;
  mechanism?: 'rule_based' | 'ml_based' | 'hybrid';
  technical_reason?: string;
  anomaly_score?: number | null;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  description: string;
  observed_value: number | null;
  expected_range: string | null;
  status: 'active' | 'acknowledged' | 'resolved';
  created_at: string;
}

export interface DashboardKPIs {
  total_classrooms: number;
  total_campus_capacity: number;
  total_detected_people: number;
  available_seats: number;
  campus_occupancy_percentage: number;
  average_room_utilization: number;
  estimated_energy_demand_kw: number;
  active_alerts_count: number;
}

export interface DashboardSummary {
  status: string;
  kpis: DashboardKPIs;
  status_distribution: {
    low: number;
    normal: number;
    high: number;
    full: number;
  };
  room_cards: Room[];
  occupancy_trend: Array<{ time: string; people: number }>;
  active_alerts: Alert[];
}

export interface PersonDetectionItem {
  box: [number, number, number, number];
  confidence: number;
  class: string;
  track_id?: number | null;
}

export interface DetectionResult {
  status: string;
  person_count: number;
  detected_people_frame?: number;
  active_track_ids?: number[];
  cumulative_unique_tracks?: number;
  confidence_avg: number;
  detections: PersonDetectionItem[];
  model_used: string;
  is_fallback: boolean;
  stream_id?: string;
  annotated_frame?: string;
  room_id?: number;
  occupancy_percentage?: number;
  alert?: Alert | null;
}

export interface ForecastPrediction {
  timestamp: string;
  time_label: string;
  predicted_people: number;
  predicted_occupancy_pct: number;
  lower_bound: number;
  upper_bound: number;
  target_coverage?: number;
  measured_test_coverage?: number | null;
  calibration_status?: string;
  clipping_applied?: boolean;
}

export interface ForecastResponse {
  status: string;
  room_id: number;
  room_name: string;
  room_capacity: number;
  current_occupancy: number;
  model_trained: boolean;
  metrics: {
    mae?: number;
    rmse?: number;
    r2_score?: number;
    training_samples?: number;
    calibration_samples?: number;
    test_samples?: number;
    target_coverage?: number;
    measured_test_coverage?: number | null;
    calibration_margin?: number;
    is_rf_superior?: boolean;
    data_origin?: string;
    baselines?: {
      persistence: { mae: number; rmse: number; r2_score: number };
      seasonal: { mae: number; rmse: number; r2_score: number };
    };
    horizon_breakdown?: Record<string, { mae: number; rmse: number }>;
  };
  forecast: ForecastPrediction[];
}

export interface EquipmentBreakdownItem {
  name: string;
  quantity: number;
  rating_watts: number;
  total_watts: number;
}

export interface RoomEnergyComparison {
  room_id: number;
  room_name: string;
  people_count: number;
  capacity: number;
  active_power_kw: number;
  today_estimated_kwh: number;
  today_actual_kwh: number | null;
  equipment_count: number;
  equipment_breakdown: EquipmentBreakdownItem[];
}

export interface EnergyOptimizationTip {
  type: string;
  severity: string;
  title: string;
  message: string;
  potential_savings_kwh: number;
}

export interface EnergySummaryResponse {
  status: string;
  current_total_demand_kw: number;
  total_connected_equipment_kw: number;
  projected_daily_kwh: number;
  rooms_monitored: number;
  room_comparisons: RoomEnergyComparison[];
  recommendations: EnergyOptimizationTip[];
  data_disclosure: string;
}

export interface Recommendation {
  id: string;
  category: string;
  priority: 'low' | 'medium' | 'high';
  title: string;
  room_id: number;
  room_name: string;
  message: string;
  action: string;
}

export interface SystemStatusResponse {
  total_classrooms: number;
  total_occupancy_records: number;
  active_alerts_count: number;
  forecasting_model: {
    is_trained: boolean;
    metrics: Record<string, number | string>;
  };
  supported_sources: string[];
  operating_mode: string;
}
