import React, { useState, useEffect, useCallback } from 'react';
import {
  Zap,
  Leaf,
  Plus,
  Info,
  TrendingDown,
  Building,
  CheckCircle2,
  X
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';
import type { Room, EnergySummaryResponse } from '../types/campus';
import { api } from '../services/api';

interface PageEnergyIntelligenceProps {
  rooms: Room[];
}

export const PageEnergyIntelligence: React.FC<PageEnergyIntelligenceProps> = ({
  rooms,
}) => {
  const [summary, setSummary] = useState<EnergySummaryResponse | null>(null);
  const [isMeterModalOpen, setIsMeterModalOpen] = useState<boolean>(false);
  const [meterRoomId, setMeterRoomId] = useState<number>(rooms[0]?.id || 1);
  const [actualKwh, setActualKwh] = useState<string>('');
  const [meterMessage, setMeterMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const res = await api.getEnergySummary();
      setSummary(res);
    } catch (err) {
      console.warn('Failed to load energy summary:', err);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRecordMeter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actualKwh) return;

    try {
      await api.recordMeterReading(Number(meterRoomId), parseFloat(actualKwh));
      setMeterMessage('Physical utility meter reading recorded successfully.');
      setIsMeterModalOpen(false);
      setActualKwh('');
      await loadData();
    } catch (err: any) {
      setMeterMessage(err?.response?.data?.message || 'Failed to record meter reading.');
    }
  };

  const chartData = (summary?.room_comparisons || []).map((rc) => ({
    name: rc.room_name.split(' - ')[1] || rc.room_name,
    demand_kw: rc.active_power_kw,
    today_est_kwh: rc.today_estimated_kwh,
    today_act_kwh: rc.today_actual_kwh || 0,
    people: rc.people_count,
  }));

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20 mb-2">
            <Zap className="w-3.5 h-3.5" /> Campus Sustainability & Power
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Energy Demand Estimation & Carbon Intelligence
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Calculated via equipment ratings (kW × operating hours) scaled by thermal occupant cooling load.
          </p>
        </div>

        <button
          onClick={() => {
            setMeterMessage(null);
            setIsMeterModalOpen(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white shadow-lg shadow-amber-500/20 transition whitespace-nowrap"
        >
          <Plus className="w-4 h-4" /> Record Utility Meter
        </button>
      </div>

      {/* Mandatory Data Disclosure Banner */}
      <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-slate-300 flex items-start sm:items-center gap-2.5">
        <Info className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5 sm:mt-0" />
        <div>
          <span className="font-bold text-white">Transparency Notice: </span>
          Values labeled <span className="text-cyan-300 font-semibold">&apos;Estimated&apos;</span> derive from equipment ratings × operating hours. Values labeled <span className="text-emerald-300 font-semibold">&apos;Actual&apos;</span> derive from entered utility meters.
        </div>
      </div>

      {meterMessage && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{meterMessage}</span>
        </div>
      )}

      {/* Top 4 Energy KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Active Demand */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Active Campus Demand</span>
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-3xl font-black text-amber-300">
            {summary?.current_total_demand_kw ?? 0} <span className="text-sm font-semibold text-slate-400">kW</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Real-time dynamic load</p>
        </div>

        {/* Card 2: Connected Equipment Capacity */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Total Connected Load</span>
            <Building className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-3xl font-black text-cyan-300">
            {summary?.total_connected_equipment_kw ?? 0} <span className="text-sm font-semibold text-slate-400">kW</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Peak hardware rating</p>
        </div>

        {/* Card 3: Projected Daily Consumption */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Est. Daily Consumption</span>
            <Leaf className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-black text-emerald-300">
            {summary?.projected_daily_kwh ?? 0} <span className="text-sm font-semibold text-slate-400">kWh</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">10.5h operational day</p>
        </div>

        {/* Card 4: Potential Daily Savings */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Optimization Target</span>
            <TrendingDown className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-3xl font-black text-purple-300">
            {summary?.recommendations?.reduce((acc, r) => acc + (r.potential_savings_kwh || 0), 0).toFixed(1) ?? '0.0'}{' '}
            <span className="text-sm font-semibold text-slate-400">kWh</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Phantom & vacant load</p>
        </div>
      </div>

      {/* Room Energy Demand Comparison BarChart */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Room-Wise Power Demand Comparison (kW)
            </h2>
            <p className="text-xs text-slate-400">Active electrical demand based on connected equipment + occupant thermal load</p>
          </div>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
            Live kW
          </span>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} />
              <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                labelStyle={{ color: '#cbd5e1' }}
              />
              <Bar dataKey="demand_kw" name="Active Power (kW)" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.demand_kw > 3.0 ? '#ef4444' : entry.demand_kw > 1.5 ? '#f59e0b' : '#06b6d4'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Energy Optimization Advice & Equipment Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Smart Energy Recommendations */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-white uppercase tracking-wider">
            <Leaf className="w-4 h-4 text-emerald-400" /> Smart Energy Optimization Advice
          </div>

          <div className="space-y-3">
            {summary?.recommendations && summary.recommendations.length > 0 ? (
              summary.recommendations.map((tip, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/80 space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">{tip.title}</span>
                    {tip.potential_savings_kwh > 0 && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        Save ~{tip.potential_savings_kwh} kWh
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-300">{tip.message}</p>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-500">No energy anomalies detected. Campus zones operating efficiently.</p>
            )}
          </div>
        </div>

        {/* Room Energy Table: Est vs Actual */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Room Consumption Matrix
            </h2>
            <span className="text-xs text-slate-400">Today&apos;s Accumulated</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2">Classroom</th>
                  <th className="py-2">Occupants</th>
                  <th className="py-2">Active kW</th>
                  <th className="py-2">Est. kWh</th>
                  <th className="py-2">Actual kWh</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {(summary?.room_comparisons || []).map((rc) => (
                  <tr key={rc.room_id} className="hover:bg-slate-800/40">
                    <td className="py-2.5 font-semibold text-white">{rc.room_name}</td>
                    <td className="py-2.5 text-slate-300">{rc.people_count}</td>
                    <td className="py-2.5 font-bold text-amber-400">{rc.active_power_kw}</td>
                    <td className="py-2.5 text-cyan-300">{rc.today_estimated_kwh}</td>
                    <td className="py-2.5 text-emerald-400">
                      {rc.today_actual_kwh !== null ? `${rc.today_actual_kwh} ✓` : <span className="text-slate-600">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* RECORD UTILITY METER MODAL */}
      {isMeterModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-6 space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Record Physical Utility Meter</h3>
              <button onClick={() => setIsMeterModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRecordMeter} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Select Classroom</label>
                <select
                  value={meterRoomId}
                  onChange={(e) => setMeterRoomId(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.building} - {r.room_number}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Actual Meter Reading (kWh)
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={actualKwh}
                  onChange={(e) => setActualKwh(e.target.value)}
                  placeholder="e.g. 14.85"
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Enter the real kilowatt-hour reading from the physical electrical sub-meter.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsMeterModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 font-black transition"
                >
                  Save Meter Reading
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
