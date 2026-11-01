import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart3,
  Cpu,
  RefreshCw,
  Sparkles,
  Info,
  Calendar
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import type { Room, ForecastResponse, HourlyChartPoint } from '../types/campus';
import { api } from '../services/api';

interface PageOccupancyAnalyticsProps {
  rooms: Room[];
  selectedRoom: Room | null;
  onSelectRoom: (room: Room) => void;
}

export const PageOccupancyAnalytics: React.FC<PageOccupancyAnalyticsProps> = ({
  rooms,
  selectedRoom,
  onSelectRoom,
}) => {
  const [horizonHours, setHorizonHours] = useState<number>(24);
  const [forecastData, setForecastData] = useState<ForecastResponse | null>(null);
  const [hourlyData, setHourlyData] = useState<HourlyChartPoint[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRetraining, setIsRetraining] = useState<boolean>(false);
  const [trainingMessage, setTrainingMessage] = useState<string | null>(null);

  const loadAnalytics = useCallback(async () => {
    setIsLoading(true);
    try {
      const [histRes, fcRes] = await Promise.all([
        api.getOccupancyHistory(selectedRoom?.id, 7),
        api.getForecast(selectedRoom?.id, horizonHours),
      ]);
      setHourlyData(histRes.hourly_chart || []);
      setForecastData(fcRes);
    } catch (err) {
      console.warn('Failed to load occupancy analytics:', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedRoom, horizonHours]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const handleRetrainModel = async () => {
    setIsRetraining(true);
    setTrainingMessage(null);
    try {
      const res = await api.trainForecaster();
      setTrainingMessage(res.message || 'Model retrained successfully.');
      await loadAnalytics();
    } catch (err: any) {
      setTrainingMessage(err?.response?.data?.message || 'Retraining failed. Insufficient records.');
    } finally {
      setIsRetraining(false);
    }
  };

  const metrics = forecastData?.metrics || {};

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-3xl bg-white/90 backdrop-blur-md border border-white/80 shadow-sm">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-100 mb-2">
            <BarChart3 className="w-3.5 h-3.5" /> AI Predictive Analytics
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Classroom Occupancy Analytics & ML Forecasts
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Historical hourly distribution combined with Scikit-learn Random Forest regression forecasting.
          </p>
        </div>

        {/* Room & Horizon Selectors */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedRoom?.id || ''}
            onChange={(e) => {
              const r = rooms.find((rm) => rm.id === Number(e.target.value));
              if (r) onSelectRoom(r);
            }}
            className="px-3.5 py-2 rounded-2xl text-xs font-bold bg-white text-slate-800 border border-slate-200/80 shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.building} - {r.room_number}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl border border-slate-200/80 text-xs font-bold">
            <button
              onClick={() => setHorizonHours(24)}
              className={`px-3 py-1 rounded-xl transition ${
                horizonHours === 24 ? 'bg-[#1e293b] text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              24h Horizon
            </button>
            <button
              onClick={() => setHorizonHours(48)}
              className={`px-3 py-1 rounded-xl transition ${
                horizonHours === 48 ? 'bg-[#1e293b] text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              48h Horizon
            </button>
          </div>
        </div>
      </div>

      {/* Model Performance & Retraining Alert Bar */}
      <div className="p-6 rounded-3xl bg-white/90 backdrop-blur-md border border-white/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center flex-shrink-0 border border-purple-100">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-900">Random Forest Occupancy Regressor</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200 uppercase">
                Chronological Split
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Features: Hour, Day of Week, Is Operating Hours, Room Capacity, Autoregressive 1h/2h Lags.
            </p>
          </div>
        </div>

        {/* Model Metrics */}
        <div className="flex items-center gap-5 text-xs">
          <div className="text-right">
            <span className="text-slate-400 block text-[11px]">Mean Abs Error (MAE)</span>
            <span className="font-extrabold text-slate-800">{metrics.mae ? `${metrics.mae} people` : '—'}</span>
          </div>
          <div className="text-right">
            <span className="text-slate-400 block text-[11px]">Root Mean Sq (RMSE)</span>
            <span className="font-extrabold text-purple-700">{metrics.rmse ? `${metrics.rmse} people` : '—'}</span>
          </div>
          <div className="text-right">
            <span className="text-slate-400 block text-[11px]">R² Variance Score</span>
            <span className="font-extrabold text-emerald-600">{metrics.r2_score ?? '—'}</span>
          </div>

          <button
            onClick={handleRetrainModel}
            disabled={isRetraining}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs font-bold bg-[#1e293b] hover:bg-[#0f172a] text-white shadow-sm transition disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isRetraining ? 'animate-spin' : ''}`} />
            <span>Retrain</span>
          </button>
        </div>
      </div>

      {trainingMessage && (
        <div className="p-4 rounded-2xl bg-cyan-50 border border-cyan-200 text-cyan-800 text-xs flex items-center gap-2">
          <Info className="w-4 h-4 flex-shrink-0 text-cyan-600" />
          <span>{trainingMessage}</span>
        </div>
      )}

      {/* Main Charts: 1) Future ML Forecast, 2) Historical Hourly Profile */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ML Forecast Projection with Confidence Upper/Lower Bounds */}
        <div className="p-6 rounded-3xl bg-white/90 backdrop-blur-md border border-white/80 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-purple-600" />
                {horizonHours}-Hour ML Occupancy Projection
              </h2>
              <p className="text-xs text-slate-400">
                Target: {selectedRoom ? `${selectedRoom.building} - ${selectedRoom.room_number}` : 'Classroom'}
              </p>
            </div>
            <span className="text-[11px] font-semibold text-slate-400">
              Shaded: 90% Confidence Interval
            </span>
          </div>

          <div className="h-64 w-full">
            {isLoading ? (
              <div className="flex items-center justify-center h-full text-slate-400 text-xs">
                Loading forecast projection...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={forecastData?.forecast || []}>
                  <defs>
                    <linearGradient id="forecastFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="boundFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time_label" stroke="#94a3b8" fontSize={10} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '12px', color: '#1e293b', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}
                    labelStyle={{ color: '#64748b', fontWeight: 600 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="upper_bound"
                    name="Upper Bound"
                    stroke="#06b6d4"
                    strokeDasharray="3 3"
                    fill="url(#boundFill)"
                  />
                  <Area
                    type="monotone"
                    dataKey="predicted_people"
                    name="Predicted Occupancy"
                    stroke="#8b5cf6"
                    strokeWidth={2.5}
                    fill="url(#forecastFill)"
                  />
                  <Area
                    type="monotone"
                    dataKey="lower_bound"
                    name="Lower Bound"
                    stroke="#06b6d4"
                    strokeDasharray="3 3"
                    fill="transparent"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Historical 24h Hourly Profile */}
        <div className="p-6 rounded-3xl bg-white/90 backdrop-blur-md border border-white/80 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-cyan-600" />
                Historical Hourly Occupancy Profile
              </h2>
              <p className="text-xs text-slate-400">Average people count observed per hour of day (7-day history)</p>
            </div>
            <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">Peak: 10 AM - 3 PM</span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyData}>
                <XAxis dataKey="hour" stroke="#94a3b8" fontSize={10} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '12px', color: '#1e293b', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}
                />
                <Bar dataKey="avg_people" name="Avg Occupants" fill="#0284c7" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};