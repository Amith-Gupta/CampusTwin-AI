import React, { useState, useEffect } from 'react';
import {
  Settings,
  Cpu,
  Database,
  Activity,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  HardDrive
} from 'lucide-react';
import type { SystemStatusResponse } from '../types/campus';
import { api } from '../services/api';

interface PageAdminSettingsProps {
  onRefreshAll: () => void;
  onResetSeed: () => void;
  isSeeding: boolean;
}

export const PageAdminSettings: React.FC<PageAdminSettingsProps> = ({
  onRefreshAll,
  onResetSeed,
  isSeeding,
}) => {
  const [systemStatus, setSystemStatus] = useState<SystemStatusResponse | null>(null);
  const [healthData, setHealthData] = useState<any | null>(null);
  const [isRetraining, setIsRetraining] = useState<boolean>(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadStatus = async () => {
    try {
      const [sysRes, hltRes] = await Promise.all([
        api.getSystemStatus(),
        api.getHealth(),
      ]);
      setSystemStatus(sysRes);
      setHealthData(hltRes);
    } catch (err) {
      console.warn('Failed to load system diagnostics:', err);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleRetrain = async () => {
    setIsRetraining(true);
    setMessage(null);
    try {
      const res = await api.trainForecaster();
      setMessage(res.message || 'Model successfully retrained.');
      await loadStatus();
      onRefreshAll();
    } catch (err: any) {
      setMessage(err?.response?.data?.message || 'Retraining failed.');
    } finally {
      setIsRetraining(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-3xl bg-white/90 backdrop-blur-md border border-white/80 shadow-sm">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-100 mb-2">
            <Settings className="w-3.5 h-3.5" /> Administration & Model Management
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            System Diagnostics, ML Pipelines & Edge Clusters
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Telemetry for Ultralytics YOLOv8, Scikit-learn Random Forest regressor, Isolation Forest, and SQLite persistence.
          </p>
        </div>

        <button
          onClick={onResetSeed}
          disabled={isSeeding}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold bg-white hover:bg-slate-50 text-cyan-700 border border-slate-200/80 shadow-sm transition disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-cyan-600 ${isSeeding ? 'animate-spin' : ''}`} />
          <span>Reset / Re-Seed Campus Data</span>
        </button>
      </div>

      {message && (
        <div className="p-4 rounded-2xl bg-cyan-50 border border-cyan-200 text-cyan-800 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-cyan-600" />
          <span>{message}</span>
        </div>
      )}

      {/* 4 Diagnostics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Vision Model */}
        <div className="p-6 rounded-3xl bg-white/90 backdrop-blur-md border border-white/80 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Vision Engine</span>
            <Cpu className="w-4 h-4 text-cyan-600" />
          </div>
          <div className="text-lg font-black text-slate-900">
            {healthData?.vision_engine?.model_name || 'YOLOv8n Pretrained'}
          </div>
          <div className="text-[11px] text-slate-500">
            Target: <span className="text-cyan-700 font-semibold">COCO Person (#0)</span>
          </div>
          <div className="pt-2 border-t border-slate-100 flex items-center gap-1.5 text-[11px] text-emerald-700 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Real-time Inference Ready</span>
          </div>
        </div>

        {/* Card 2: Database */}
        <div className="p-6 rounded-3xl bg-white/90 backdrop-blur-md border border-white/80 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Storage Layer</span>
            <Database className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-lg font-black text-slate-900">
            {healthData?.database?.dialect?.toUpperCase() || 'SQLITE'}
          </div>
          <div className="text-[11px] text-slate-500">
            Total Readings: <strong className="text-purple-700">{systemStatus?.total_occupancy_records || 0}</strong>
          </div>
          <div className="pt-2 border-t border-slate-100 flex items-center gap-1.5 text-[11px] text-emerald-700 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Connection Active</span>
          </div>
        </div>

        {/* Card 3: ML Forecaster */}
        <div className="p-6 rounded-3xl bg-white/90 backdrop-blur-md border border-white/80 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Occupancy Forecaster</span>
            <Activity className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-lg font-black text-slate-900">Random Forest</div>
          <div className="text-[11px] text-slate-500">
            Split: <strong className="text-blue-700">Chronological Holdout</strong>
          </div>
          <div className="pt-2 border-t border-slate-100 flex items-center gap-1.5 text-[11px] text-emerald-700 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>{systemStatus?.forecasting_model?.is_trained ? 'Trained & Calibrated' : 'Ready to Train'}</span>
          </div>
        </div>

        {/* Card 4: Anomaly Detector */}
        <div className="p-6 rounded-3xl bg-white/90 backdrop-blur-md border border-white/80 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Anomaly Engine</span>
            <HardDrive className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-lg font-black text-slate-900">Isolation Forest</div>
          <div className="text-[11px] text-slate-500">
            Active Alerts: <strong className="text-rose-600">{systemStatus?.active_alerts_count || 0}</strong>
          </div>
          <div className="pt-2 border-t border-slate-100 flex items-center gap-1.5 text-[11px] text-emerald-700 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Statistical Envelope Active</span>
          </div>
        </div>
      </div>

      {/* Model Training Console */}
      <div className="p-6 rounded-3xl bg-white/90 backdrop-blur-md border border-white/80 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-600" />
              Machine Learning Pipeline Re-Training Console
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Refits Random Forest regressor and Isolation Forest on all logged historical records using chronological temporal splits.
            </p>
          </div>

          <button
            onClick={handleRetrain}
            disabled={isRetraining}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-bold bg-[#1e293b] hover:bg-[#0f172a] text-white shadow-md transition disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isRetraining ? 'animate-spin' : ''}`} />
            <span>{isRetraining ? 'Fitting Trees...' : 'Retrain Forecasting Model'}</span>
          </button>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-slate-100">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
            <span className="text-[11px] text-slate-500 block font-semibold">Mean Absolute Error</span>
            <span className="text-xl font-black text-slate-900">
              {systemStatus?.forecasting_model?.metrics?.mae ? `${systemStatus.forecasting_model.metrics.mae} people` : '—'}
            </span>
          </div>
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
            <span className="text-[11px] text-slate-500 block font-semibold">Root Mean Squared Error</span>
            <span className="text-xl font-black text-purple-700">
              {systemStatus?.forecasting_model?.metrics?.rmse ? `${systemStatus.forecasting_model.metrics.rmse} people` : '—'}
            </span>
          </div>
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
            <span className="text-[11px] text-slate-500 block font-semibold">R² Score</span>
            <span className="text-xl font-black text-emerald-600">
              {systemStatus?.forecasting_model?.metrics?.r2_score ?? '—'}
            </span>
          </div>
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
            <span className="text-[11px] text-slate-500 block font-semibold">Training Records</span>
            <span className="text-xl font-black text-slate-900">
              {systemStatus?.forecasting_model?.metrics?.training_samples ?? systemStatus?.total_occupancy_records ?? 0}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};