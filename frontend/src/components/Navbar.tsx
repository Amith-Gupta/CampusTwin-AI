import React from 'react';
import {
  LayoutGrid,
  Camera,
  School,
  Sparkles,
  RefreshCw
} from 'lucide-react';

export type NavTab = 'overview' | 'live' | 'classrooms';

interface NavbarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  activeAlertsCount?: number;
  isBackendHealthy?: boolean;
  onResetSeed: () => void;
  isSeeding: boolean;
}

interface NavItem {
  id: NavTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | number;
  badgeType?: 'live' | 'count';
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onSelectTab,
  onResetSeed,
  isSeeding,
}) => {
  const navItems: NavItem[] = [
    { id: 'overview', label: 'Overview', icon: LayoutGrid },
    { id: 'live', label: 'Live Vision', icon: Camera, badge: 'LIVE', badgeType: 'live' },
    { id: 'classrooms', label: 'Classrooms', icon: School },
  ];

  return (
    <header className="sticky top-3 z-50 max-w-7xl mx-auto w-full px-4 sm:px-6">
      <div className="bg-white/90 backdrop-blur-xl border border-white/80 rounded-2xl shadow-[0_8px_30px_rgba(15,23,42,0.06)] px-4 py-2.5 flex items-center justify-between gap-3">
        {/* Left: Brand Logo & Title */}
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => onSelectTab('overview')}>
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500/10 to-teal-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-600 shadow-sm">
            <Sparkles className="w-5 h-5 text-cyan-600" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-base font-black text-slate-900 tracking-tight">
                CampusTwin <span className="text-cyan-600 font-extrabold">AI</span>
              </span>
            </div>
            <p className="text-[9px] font-extrabold uppercase tracking-widest text-slate-400">
              Smart Campus OS
            </p>
          </div>
        </div>

        {/* Center: Clean Pill Navigation */}
        <nav className="hidden lg:flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl border border-slate-200/60">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`relative flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-150 cursor-pointer ${
                  isActive
                    ? 'bg-white text-slate-900 shadow-sm border border-slate-200/80'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-cyan-600' : 'text-slate-400'}`} />
                <span>{item.label}</span>

                {item.badge && item.badgeType === 'live' && (
                  <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black uppercase tracking-wider bg-rose-500 text-white animate-pulse">
                    {item.badge}
                  </span>
                )}

                {item.badge && item.badgeType === 'count' && (
                  <span className="w-4 h-4 rounded-full text-[10px] font-black bg-rose-500 text-white flex items-center justify-center">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Right: Quick Demo Re-Seed */}
        <div className="flex items-center gap-2">
          <button
            onClick={onResetSeed}
            disabled={isSeeding}
            title="Reset demonstration data"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200/80 text-xs font-bold text-slate-700 transition shadow-sm cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isSeeding ? 'animate-spin text-cyan-600' : ''}`} />
            <span className="hidden sm:inline">Reset Demo</span>
          </button>
        </div>
      </div>

      {/* Mobile Nav Drawer for small screens */}
      <div className="lg:hidden flex items-center gap-1 overflow-x-auto py-2 no-scrollbar">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer shadow-sm ${
                isActive
                  ? 'bg-white text-slate-900 border border-slate-300'
                  : 'bg-white/70 text-slate-600 border border-white'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-cyan-600' : 'text-slate-400'}`} />
              <span>{item.label}</span>
              {item.badge && (
                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-rose-500 text-white">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </header>
  );
};
