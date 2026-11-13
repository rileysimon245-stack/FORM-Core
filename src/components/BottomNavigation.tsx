import React from 'react';
import { CalendarDays, Dumbbell, User, Activity } from 'lucide-react';
import { motion } from 'motion/react';

export type TabType = 'overview' | 'workouts' | 'anatomy' | 'profile';

interface BottomNavigationProps {
  activeTab: TabType;
  onChangeTab: (tab: TabType) => void;
}

export const BottomNavigation: React.FC<BottomNavigationProps> = ({
  activeTab,
  onChangeTab,
}) => {
  const tabs: { id: TabType; label: string; icon: typeof CalendarDays }[] = [
    { id: 'overview', label: 'Обзор', icon: CalendarDays },
    { id: 'workouts', label: 'Тренировки', icon: Dumbbell },
    { id: 'anatomy', label: 'Анатомия', icon: Activity },
    { id: 'profile', label: 'Профиль', icon: User },
  ];

  return (
    <nav className="fixed bottom-3.5 left-3 right-3 z-40 max-w-md mx-auto pointer-events-auto">
      <div className="bg-[#0A1310]/95 backdrop-blur-2xl border border-[#1F3A30] rounded-full p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.85)] flex items-center justify-around">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              onClick={() => onChangeTab(tab.id)}
              className={`relative flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-full transition-all cursor-pointer select-none ${
                isActive
                  ? 'bg-[#10251C] border border-[#56CC97]/30 text-[#56CC97] shadow-xs'
                  : 'text-[#6F8A7F] hover:text-[#F2F5F3]'
              }`}
              aria-label={tab.label}
            >
              <Icon
                className={`w-4 h-4 transition-transform duration-200 ${
                  isActive ? 'scale-105 stroke-[2.2]' : 'stroke-[1.8]'
                }`}
              />
              <span
                className={`text-xs transition-colors duration-200 ${
                  isActive ? 'font-black tracking-tight text-[#56CC97]' : 'font-medium'
                }`}
              >
                {tab.label}
              </span>
              {isActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#56CC97] shadow-[0_0_8px_rgba(86,204,151,0.8)]" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
