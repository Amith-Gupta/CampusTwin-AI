import React, { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Clock,
  ArrowRight,
  ShieldAlert
} from 'lucide-react';
import type { Alert, Recommendation } from '../types/campus';
import { api } from '../services/api';

export const PageAlerts: React.FC = () => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');

  const loadData = useCallback(async () => {
    try {
      const [alertsRes, recsRes] = await Promise.all([
        api.getAlerts(statusFilter === 'all' ? undefined : statusFilter),
        api.getRecommendations(),
      ]);
      setAlerts(alertsRes.alerts || []);
      setRecommendations(recsRes.recommendations || []);
    } catch (err) {
      console.warn('Failed to load alerts:', err);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAcknowledge = async (alertId: number) => {
    try {
      await api.acknowledgeAlert(alertId);
      setAlerts((prev) =>
        prev.map((a) => (a.id === alertId ? { ...a, status: 'acknowledged' } : a))
      );
    } catch (err) {
      console.warn('Failed to acknowledge alert:', err);
    }
  };

  const filteredAlerts = alerts.filter((a) => {
    if (severityFilter !== 'all' && a.severity !== severityFilter) return false;
    return true;
  });

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'high':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'medium':
        return 'bg-yellow-50 text-yellow-800 border-yellow-200';
      default:
        return 'bg-cyan-50 text-cyan-700 border-cyan-200';
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-3xl bg-white/90 backdrop-blur-md border border-white/80 shadow-sm">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-100 mb-2">
            <ShieldAlert className="w-3.5 h-3.5" /> Anomaly Intelligence Center
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Campus Anomaly Alerts & Optimization Actions
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Real-time triggers from Isolation Forest anomaly modeling and deterministic threshold rules.
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Filter */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl border border-slate-200/80 text-xs font-bold">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1 rounded-xl transition ${
                statusFilter === 'all' ? 'bg-[#1e293b] text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-1 rounded-xl transition ${
                statusFilter === 'active' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Active
            </button>
            <button
              onClick={() => setStatusFilter('acknowledged')}
              className={`px-3 py-1 rounded-xl transition ${
                statusFilter === 'acknowledged' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Acknowledged
            </button>
          </div>

          {/* Severity Selector */}
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="px-3.5 py-1.5 rounded-2xl text-xs font-bold bg-white text-slate-800 border border-slate-200/80 shadow-sm focus:outline-none"
          >
            <option value="all">All Severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      {/* Smart Recommendations Banner Cards */}
      {recommendations.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
            <Sparkles className="w-4 h-4 text-cyan-600" /> AI Smart Space & Resource Recommendations
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recommendations.map((rec) => (
              <div
                key={rec.id}
                className="p-5 rounded-3xl bg-white/90 backdrop-blur-md border border-white/80 shadow-sm hover:shadow-md transition flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-cyan-50 text-cyan-700 border border-cyan-100">
                      {rec.category}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-500">{rec.room_name}</span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 mb-1">{rec.title}</h4>
                  <p className="text-xs text-slate-600 leading-relaxed">{rec.message}</p>
                </div>

                <div className="pt-3 border-t border-slate-100 mt-3 flex items-center justify-between">
                  <span className="text-[11px] text-cyan-700 font-bold flex items-center gap-1">
                    {rec.action} <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Alerts Feed List */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          Logged Anomaly Events ({filteredAlerts.length})
        </h2>

        {filteredAlerts.length === 0 ? (
          <div className="p-12 text-center rounded-3xl bg-white/90 backdrop-blur-md border border-white/80 text-slate-500 space-y-2 shadow-sm">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
            <h3 className="text-sm font-bold text-slate-900">No Matching Anomaly Alerts</h3>
            <p className="text-xs text-slate-500">All campus zones operating within normal parameters.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredAlerts.map((alert) => (
              <div
                key={alert.id}
                className={`p-6 rounded-3xl border transition shadow-sm ${
                  alert.status === 'active'
                    ? 'bg-white/95 border-white/80 hover:shadow-md'
                    : 'bg-white/60 border-slate-100 opacity-75'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${getSeverityBadge(alert.severity)}`}>
                        {alert.severity}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        alert.mechanism === 'hybrid'
                          ? 'bg-purple-50 text-purple-700 border border-purple-200'
                          : alert.mechanism === 'ml_based'
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}>
                        {alert.mechanism ? alert.mechanism.replace('_', ' ') : 'rule based'}
                      </span>
                      <span className="text-sm font-bold text-slate-900">
                        {alert.room_name}
                      </span>
                      <span className="text-xs text-slate-500">
                        • {alert.alert_type.replace(/_/g, ' ').toUpperCase()}
                      </span>
                    </div>

                    <p className="text-xs text-slate-700 font-medium">
                      {alert.description}
                    </p>

                    {alert.technical_reason && (
                      <p className="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                        <strong className="text-slate-700">Engineering Diagnosis:</strong> {alert.technical_reason}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-500 pt-1">
                      {alert.observed_value !== null && (
                        <span>
                          Observed: <strong className="text-slate-800">{alert.observed_value}</strong>
                        </span>
                      )}
                      {alert.expected_range && (
                        <span>
                          Expected Baseline: <strong className="text-slate-700">{alert.expected_range}</strong>
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-slate-400">
                        <Clock className="w-3 h-3" />
                        {new Date(alert.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Acknowledge Button */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {alert.status === 'active' ? (
                      <button
                        onClick={() => handleAcknowledge(alert.id)}
                        className="px-3.5 py-1.5 rounded-2xl text-xs font-bold bg-[#1e293b] hover:bg-[#0f172a] text-white shadow-sm transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Acknowledge</span>
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Acknowledged
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};