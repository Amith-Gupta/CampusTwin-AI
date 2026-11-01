import axios from 'axios';
import type {
  DashboardSummary,
  Room,
  DetectionResult,
  ForecastResponse,
  EnergySummaryResponse,
  Alert,
  Recommendation,
  SystemStatusResponse,
  HourlyChartPoint,
  OccupancyReading,
  EnergyReading
} from '../types/campus';

const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const baseURL = apiBase ? `${apiBase}/api` : '/api';

const apiClient = axios.create({
  baseURL,
  timeout: 45000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const api = {
  // Health & System
  getHealth: async () => (await apiClient.get('/health')).data,
  getSystemStatus: async (): Promise<SystemStatusResponse> => (await apiClient.get('/system/status')).data,

  // Benchmarks (CV & Anomaly)
  getCVBenchmark: async () => (await apiClient.get('/detection/benchmark')).data,
  getAnomalyBenchmark: async () => (await apiClient.get('/alerts/benchmark')).data,

  // Dashboard
  getDashboardSummary: async (): Promise<DashboardSummary> => (await apiClient.get('/dashboard/summary')).data,

  // Rooms
  getRooms: async (): Promise<{ status: string; total: number; rooms: Room[] }> => (await apiClient.get('/rooms')).data,
  getRoom: async (id: number): Promise<{ status: string; room: Room }> => (await apiClient.get(`/rooms/${id}`)).data,
  createRoom: async (roomData: Partial<Room>): Promise<{ status: string; room: Room }> => (await apiClient.post('/rooms', roomData)).data,
  updateRoom: async (id: number, roomData: Partial<Room>): Promise<{ status: string; room: Room }> => (await apiClient.put(`/rooms/${id}`, roomData)).data,
  deleteRoom: async (id: number): Promise<{ status: string; message: string }> => (await apiClient.delete(`/rooms/${id}`)).data,

  // Live Vision & Video Detection
  getDetectionStatus: async () => (await apiClient.get('/detection/status')).data,
  startDetection: async (roomId: number, sourceType: string = 'webcam') => (await apiClient.post('/detection/start', { room_id: roomId, source_type: sourceType })).data,
  stopDetection: async () => (await apiClient.post('/detection/stop')).data,
  sendDetectionFrame: async (imageBase64: string, roomId?: number, confThreshold?: number): Promise<DetectionResult> => {
    return (await apiClient.post('/detection/frame', { image: imageBase64, room_id: roomId, conf_threshold: confThreshold })).data;
  },
  getExportRoomsCsvUrl: () => '/api/rooms/export',
  uploadVideoForAnalysis: async (formData: FormData) => {
    return (await apiClient.post('/detection/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    })).data;
  },

  // Occupancy & Forecasting
  getOccupancyHistory: async (roomId?: number, days: number = 7): Promise<{
    status: string;
    total_records: number;
    readings: OccupancyReading[];
    hourly_chart: HourlyChartPoint[];
  }> => {
    const params = new URLSearchParams();
    if (roomId) params.append('room_id', String(roomId));
    params.append('days', String(days));
    return (await apiClient.get(`/occupancy/history?${params.toString()}`)).data;
  },
  recordOccupancy: async (roomId: number, count: number) => {
    return (await apiClient.post('/occupancy/record', { room_id: roomId, people_count: count })).data;
  },
  trainForecaster: async () => (await apiClient.post('/forecast/train')).data,
  getForecast: async (roomId?: number, horizonHours: number = 24): Promise<ForecastResponse> => {
    const params = new URLSearchParams();
    if (roomId) params.append('room_id', String(roomId));
    params.append('horizon_hours', String(horizonHours));
    return (await apiClient.get(`/forecast?${params.toString()}`)).data;
  },

  // Energy Intelligence
  getEnergySummary: async (): Promise<EnergySummaryResponse> => (await apiClient.get('/energy/summary')).data,
  recordMeterReading: async (roomId: number, actualKwh: number) => {
    return (await apiClient.post('/energy/readings', { room_id: roomId, actual_kwh: actualKwh })).data;
  },
  getEnergyHistory: async (roomId?: number): Promise<{ status: string; readings: EnergyReading[] }> => {
    const url = roomId ? `/energy/history?room_id=${roomId}` : '/energy/history';
    return (await apiClient.get(url)).data;
  },

  // Alerts & Anomalies
  getAlerts: async (statusFilter?: string): Promise<{ status: string; total: number; alerts: Alert[] }> => {
    const url = statusFilter ? `/alerts?status=${statusFilter}` : '/alerts';
    return (await apiClient.get(url)).data;
  },
  acknowledgeAlert: async (alertId: number): Promise<{ status: string; alert: Alert }> => {
    return (await apiClient.post(`/alerts/${alertId}/acknowledge`)).data;
  },
  getAnomalies: async () => (await apiClient.get('/anomalies')).data,

  // Smart Recommendations
  getRecommendations: async (): Promise<{ status: string; recommendations: Recommendation[] }> => (await apiClient.get('/recommendations')).data,

  // Demo Seeding & Reset
  seedDemoData: async () => (await apiClient.post('/seed/demo-data')).data,
};
