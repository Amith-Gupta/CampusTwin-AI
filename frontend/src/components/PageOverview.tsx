import React from 'react';
import {
  Users,
  School,
  AlertTriangle,
  TrendingUp,
  Activity,
  Maximize2,
  Sparkles,
  Camera,
  Cpu,
  HardDrive,
  ChevronDown
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid
} from 'recharts';
import type { DashboardSummary, Room } from '../types/campus';
import type { NavTab } from './Navbar';

interface PageOverviewProps {
  summary: DashboardSummary | null;
  onNavigateTab: (tab: NavTab) => void;
  onSelectRoom: (room: Room) => void;
}

export const PageOverview: React.FC<PageOverviewProps> = ({
  summary,
  onNavigateTab,
  onSelectRoom,
}) => {
  if (!summary) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <Activity className="w-6 h-6 animate-spin text-cyan-600 mr-2" />
        <span className="text-sm font-semibold text-slate-600">Loading Campus Intelligence Twin...</span>
      </div>
    );
  }

  const { kpis, room_cards, occupancy_trend } = summary;

  // Mini circular SVG progress calculation
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (kpis.campus_occupancy_percentage / 100) * circumference;

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Top Greeting & Header (Matching Figma Exactly) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
        <div>
          <div className="text-[11px] font-extrabold uppercase tracking-widest text-cyan-700 flex items-center gap-1.5 mb-1">
            <span>—</span> CAMPUS COMMAND CENTER
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Campus Intelligence Overview
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5 font-medium">
            Real-time vision tracking and AI occupancy monitoring across campus zones.
          </p>
        </div>

        {/* Quick Action Filter Pills */}
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white/90 hover:bg-white text-slate-700 border border-white/80 shadow-[0_4px_16px_rgba(15,23,42,0.04)] transition cursor-pointer">
            <Activity className="w-3.5 h-3.5 text-cyan-600" />
            <span>Live data</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          <button className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white/90 hover:bg-white text-slate-700 border border-white/80 shadow-[0_4px_16px_rgba(15,23,42,0.04)] transition cursor-pointer">
            <Cpu className="w-3.5 h-3.5 text-purple-600" />
            <span>Edge cluster 01</span>
          </button>
        </div>
      </div>

      {/* Top 4 KPI Cards Grid (Figma Design 1:1) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: CAMPUS OCCUPANCY */}
        <div className="p-5 rounded-3xl bg-white/90 backdrop-blur-md border border-white/80 shadow-[0_10px_30px_rgba(15,23,42,0.04)] hover:shadow-[0_15px_35px_rgba(15,23,42,0.07)] transition-all">
          <div className="flex items-center justify-between mb-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-50 border border-cyan-100 flex items-center justify-center text-cyan-600 shadow-sm">
              <Users className="w-4 h-4" />
            </div>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-100">
              +4.2%
            </span>
          </div>

          <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 block mb-1">
            Campus Occupancy
          </span>

          <div className="text-3xl font-black text-slate-900 tracking-tight">
            {kpis.campus_occupancy_percentage}%
          </div>

          {/* Mini Radial Indicator & Sub-text */}
          <div className="flex items-center gap-2.5 mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-500 font-medium">
            <svg className="w-7 h-7 -rotate-90 flex-shrink-0" viewBox="0 0 36 36">
              <path
                className="text-slate-100"
                strokeWidth="3.5"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className="text-cyan-500 transition-all duration-700"
                strokeDasharray={`${circumference}`}
                strokeDashoffset={`${strokeDashoffset}`}
                strokeWidth="3.5"
                strokeLinecap="round"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <div>
              <span className="font-bold text-slate-800">{kpis.total_detected_people}</span> people detected
              <span className="block text-[10px] text-slate-400">{kpis.available_seats} seats remaining</span>
            </div>
          </div>
        </div>

        {/* Card 2: AVAILABLE SEATS */}
        <div className="p-5 rounded-3xl bg-white/90 backdrop-blur-md border border-white/80 shadow-[0_10px_30px_rgba(15,23,42,0.04)] hover:shadow-[0_15px_35px_rgba(15,23,42,0.07)] transition-all">
          <div className="flex items-center justify-between mb-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shadow-sm">
              <School className="w-4 h-4" />
            </div>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-100">
              +12
            </span>
          </div>

          <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 block mb-1">
            Available Seats
          </span>

          <div className="text-3xl font-black text-slate-900 tracking-tight">
            {kpis.available_seats} <span className="text-lg font-semibold text-slate-400">/ {kpis.total_campus_capacity}</span>
          </div>

          <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-500 font-medium">
            Across <span className="font-bold text-slate-800">{kpis.total_classrooms}</span> monitored learning spaces
          </div>
        </div>

        {/* Card 3: AVERAGE ROOM UTILIZATION */}
        <div className="p-5 rounded-3xl bg-white/90 backdrop-blur-md border border-white/80 shadow-[0_10px_30px_rgba(15,23,42,0.04)] hover:shadow-[0_15px_35px_rgba(15,23,42,0.07)] transition-all">
          <div className="flex items-center justify-between mb-3">
            <div className="w-9 h-9 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 shadow-sm">
              <TrendingUp className="w-4 h-4" />
            </div>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 text-purple-600 border border-purple-100">
              Optimal
            </span>
          </div>

          <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 block mb-1">
            Average Room Utilization
          </span>

          <div className="text-3xl font-black text-slate-900 tracking-tight">
            {kpis.average_room_utilization}%
          </div>

          <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-500 font-medium">
            <span className="font-bold text-slate-800">{kpis.total_classrooms}</span> AI Vision streams synchronized
          </div>
        </div>

        {/* Card 4: ACTIVE ANOMALIES */}
        <div className="p-5 rounded-3xl bg-white/90 backdrop-blur-md border border-white/80 shadow-[0_10px_30px_rgba(15,23,42,0.04)] hover:shadow-[0_15px_35px_rgba(15,23,42,0.07)] transition-all">
          <div className="flex items-center justify-between mb-3">
            <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-500 shadow-sm">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-600 border border-rose-100">
              Needs Review
            </span>
          </div>

          <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 block mb-1">
            Active Anomalies
          </span>

          <div className="text-3xl font-black text-slate-900 tracking-tight">
            {kpis.active_alerts_count} <span className="text-sm font-semibold text-slate-400">incidents</span>
          </div>

          <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-500 font-medium flex items-center gap-2">
            <span className="text-rose-600 font-bold">1 critical</span> •{' '}
            <span className="text-amber-600 font-bold">2 high</span> •{' '}
            <span className="text-blue-600 font-bold">1 medium</span>
          </div>
        </div>
      </div>

      {/* Main Charts & Pulse Telemetry (2/3 + 1/3 Grid) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left (2/3 width): 24-hour campus occupancy */}
        <div className="lg:col-span-2 p-6 rounded-3xl bg-white/90 backdrop-blur-md border border-white/80 shadow-[0_10px_30px_rgba(15,23,42,0.04)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <div>
                <h2 className="text-base font-black text-slate-900 tracking-tight">
                  24-hour campus occupancy
                </h2>
                <p className="text-xs text-slate-400 font-medium">
                  Live aggregate from 24 edge-camera feeds
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-cyan-500 animate-ping" />
                Updated 12 sec ago
              </div>
            </div>

            <div className="h-72 w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={occupancy_trend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="figmaCyanCurve" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.25} />
                      <stop offset="90%" stopColor="#06b6d4" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="time" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(15, 23, 42, 0.95)',
                      borderColor: '#334155',
                      borderRadius: '12px',
                      color: '#ffffff',
                      boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
                    }}
                    labelStyle={{ color: '#94a3b8' }}
                  />
                  <Area
                    type="natural"
                    dataKey="people"
                    name="Occupants"
                    stroke="#0284c7"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#figmaCyanCurve)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Right (1/3 width): AI operations pulse */}
        <div className="p-6 rounded-3xl bg-white/90 backdrop-blur-md border border-white/80 shadow-[0_10px_30px_rgba(15,23,42,0.04)] flex flex-col justify-between space-y-4">
          <div>
            <h2 className="text-base font-black text-slate-900 tracking-tight">
              AI operations pulse
            </h2>
            <p className="text-xs text-slate-400 font-medium mb-4">
              Real-time model and infrastructure health
            </p>

            {/* Cyan Hero Highlight Card */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-cyan-50/80 via-sky-50/80 to-blue-50/60 border border-cyan-100 flex items-center justify-between mb-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-700 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-cyan-600" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-slate-900">Campus AI confidence</h4>
                  <p className="text-[11px] text-slate-500 font-medium">All models performing nominally</p>
                </div>
              </div>
              <div className="text-2xl font-black text-slate-900 tracking-tight">
                94.8%
              </div>
            </div>

            {/* 4 Telemetry Rows (Figma 1:1) */}
            <div className="space-y-3.5 text-xs font-semibold">
              {/* Vision detections */}
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                <div className="flex items-center gap-2.5 text-slate-600">
                  <Camera className="w-4 h-4 text-cyan-600" />
                  <span>Vision detections</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-slate-900">14,892</span>
                  <span className="text-[11px] font-bold text-emerald-600">+8.4%</span>
                </div>
              </div>

              {/* Forecast accuracy */}
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                <div className="flex items-center gap-2.5 text-slate-600">
                  <Activity className="w-4 h-4 text-purple-600" />
                  <span>Forecast accuracy</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-slate-900">92.1%</span>
                  <span className="text-[11px] font-bold text-emerald-600">+1.2%</span>
                </div>
              </div>

              {/* Edge inference */}
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                <div className="flex items-center gap-2.5 text-slate-600">
                  <Cpu className="w-4 h-4 text-emerald-600" />
                  <span>Edge inference</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-slate-900">18ms</span>
                  <span className="text-[11px] font-bold text-emerald-600">-3ms</span>
                </div>
              </div>

              {/* Data processed */}
              <div className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-2.5 text-slate-600">
                  <HardDrive className="w-4 h-4 text-amber-600" />
                  <span>Data processed</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-slate-900">2.4 TB</span>
                  <span className="text-[11px] font-bold text-emerald-600">+124 GB</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom: Live classroom overview */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-black text-slate-900 tracking-tight">
              Live classroom overview
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              Occupancy status across priority spaces
            </p>
          </div>

          <button
            onClick={() => onNavigateTab('classrooms')}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold bg-slate-900 text-emerald-400 hover:bg-slate-800 transition shadow-sm cursor-pointer"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>View all ({room_cards.length} spaces online)</span>
          </button>
        </div>

        {/* Classroom Cards Grid in Clean White Glass Style */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {room_cards.map((room) => {
            const occPct = room.occupancy_percentage;
            let badgeBg = 'bg-emerald-50 text-emerald-700 border-emerald-200';
            if (room.utilization_status === 'full') badgeBg = 'bg-rose-50 text-rose-700 border-rose-200';
            else if (room.utilization_status === 'high') badgeBg = 'bg-amber-50 text-amber-700 border-amber-200';
            else if (room.utilization_status === 'normal') badgeBg = 'bg-blue-50 text-blue-700 border-blue-200';

            return (
              <div
                key={room.id}
                onClick={() => onSelectRoom(room)}
                className="group p-5 rounded-3xl bg-white/90 backdrop-blur-md hover:bg-white border border-white/80 hover:border-cyan-300 shadow-[0_8px_25px_rgba(15,23,42,0.04)] hover:shadow-[0_15px_35px_rgba(15,23,42,0.08)] transition-all duration-200 cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <span className="text-[10px] font-extrabold uppercase tracking-widest text-cyan-600 block">
                        {room.building}
                      </span>
                      <h3 className="text-lg font-black text-slate-900 group-hover:text-cyan-700 transition">
                        {room.room_number}
                      </h3>
                      <p className="text-xs text-slate-400 font-medium">{room.room_type}</p>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${badgeBg}`}>
                      {room.utilization_status}
                    </span>
                  </div>

                  {/* Occupancy Progress Bar */}
                  <div className="space-y-1.5 my-3">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-slate-600">
                        {room.current_occupancy} <span className="text-slate-400 font-normal">/ {room.capacity} seats</span>
                      </span>
                      <span className="text-cyan-700">{occPct}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          occPct >= 100
                            ? 'bg-rose-500'
                            : occPct >= 75
                            ? 'bg-amber-500'
                            : occPct >= 30
                            ? 'bg-blue-500'
                            : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(100, occPct)}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-[11px] text-slate-400 font-medium">
                  <span>Source: {room.camera_source}</span>
                  <span className="text-cyan-700 font-bold group-hover:underline flex items-center gap-1">
                    Launch Vision <Maximize2 className="w-3 h-3" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
