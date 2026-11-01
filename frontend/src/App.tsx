import { useState, useEffect, useCallback, useRef } from 'react';
import { Navbar } from './components/Navbar';
import type { NavTab } from './components/Navbar';
import { PageOverview } from './components/PageOverview';
import { PageLiveVision } from './components/PageLiveVision';
import { PageClassrooms } from './components/PageClassrooms';
import { PageOccupancyAnalytics } from './components/PageOccupancyAnalytics';
import { PageAlerts } from './components/PageAlerts';
import { PageAdminSettings } from './components/PageAdminSettings';
import type { Room, DashboardSummary, DetectionResult } from './types/campus';
import { api } from './services/api';

export function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('overview');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummary | null>(null);
  const [isBackendHealthy, setIsBackendHealthy] = useState<boolean>(false);
  const [isSeeding, setIsSeeding] = useState<boolean>(false);

  // Load campus rooms and summary
  const refreshAllData = useCallback(async () => {
    try {
      const [healthRes, summaryRes, roomsRes] = await Promise.all([
        api.getHealth().catch(() => ({ status: 'error' })),
        api.getDashboardSummary().catch(() => null),
        api.getRooms().catch(() => ({ rooms: [] })),
      ]);

      setIsBackendHealthy(healthRes.status === 'healthy');
      if (summaryRes) setDashboardSummary(summaryRes);
      if (roomsRes.rooms) {
        setRooms(roomsRes.rooms);
        if (!selectedRoom && roomsRes.rooms.length > 0) {
          setSelectedRoom(roomsRes.rooms[0]);
        }
      }
    } catch (err) {
      console.warn('Error refreshing campus twin state:', err);
    }
  }, [selectedRoom]);

  // Initial load and periodic polling every 12 seconds
  useEffect(() => {
    refreshAllData();
    const timer = window.setInterval(refreshAllData, 12000);
    return () => window.clearInterval(timer);
  }, [refreshAllData]);

  // Demo Re-seed trigger
  const handleResetSeed = async () => {
    if (!window.confirm('Reset and seed 5 campus classrooms with 14 days of realistic hourly data?')) {
      return;
    }
    setIsSeeding(true);
    try {
      await api.seedDemoData();
      await refreshAllData();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to re-seed demo data.');
    } finally {
      setIsSeeding(false);
    }
  };

  const lastSummaryFetchRef = useRef<number>(0);
  const handleNewDetection = (_result: DetectionResult) => {
    // Throttled summary refresh so frames do not flood backend
    const now = Date.now();
    if (now - lastSummaryFetchRef.current > 6000) {
      lastSummaryFetchRef.current = now;
      api.getDashboardSummary().then((s) => setDashboardSummary(s)).catch(() => {});
    }
  };

  const activeAlertsCount = dashboardSummary?.kpis?.active_alerts_count || 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#eaf3f8] via-[#f1f6fa] to-[#e5edf5] text-slate-800 flex flex-col selection:bg-cyan-500 selection:text-white">
      {/* Top Sticky Navigation */}
      <Navbar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        activeAlertsCount={activeAlertsCount}
        isBackendHealthy={isBackendHealthy}
        onResetSeed={handleResetSeed}
        isSeeding={isSeeding}
      />

      {/* Main Tab Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 md:py-8">
        {activeTab === 'overview' && (
          <PageOverview
            summary={dashboardSummary}
            onNavigateTab={setActiveTab}
            onSelectRoom={(r) => {
              setSelectedRoom(r);
              setActiveTab('live');
            }}
          />
        )}

        {activeTab === 'live' && (
          <PageLiveVision
            rooms={rooms}
            selectedRoom={selectedRoom}
            onSelectRoom={setSelectedRoom}
            onNewDetection={handleNewDetection}
          />
        )}

        {activeTab === 'classrooms' && (
          <PageClassrooms
            rooms={rooms}
            onRefreshRooms={refreshAllData}
            onSelectRoom={(r) => {
              setSelectedRoom(r);
              setActiveTab('live');
            }}
          />
        )}

        {activeTab === 'analytics' && (
          <PageOccupancyAnalytics
            rooms={rooms}
            selectedRoom={selectedRoom}
            onSelectRoom={setSelectedRoom}
          />
        )}

        {activeTab === 'alerts' && <PageAlerts />}

        {activeTab === 'admin' && (
          <PageAdminSettings
            onRefreshAll={refreshAllData}
            onResetSeed={handleResetSeed}
            isSeeding={isSeeding}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-[#0d121f] py-6 text-center text-xs text-slate-500 space-y-2">
        <div className="flex flex-wrap items-center justify-center gap-4 text-slate-400">
          <span>Ultralytics YOLOv8 Pretrained</span>
          <span>•</span>
          <span>Scikit-learn Random Forest</span>
          <span>•</span>
          <span>Isolation Forest Anomaly Detection</span>
          <span>•</span>
          <span>OpenCV Vision Ingestion</span>
          <span>•</span>
          <span>Flask REST & SQLite</span>
        </div>
        <p className="text-[11px] text-slate-500">
          CampusTwin AI — Vision-Powered Smart Campus Intelligence System. Built for academic research and college evaluation.
        </p>
      </footer>
    </div>
  );
}

export default App;
