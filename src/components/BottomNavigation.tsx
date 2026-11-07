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
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#080D0E]/90 backdrop-blur-xl border-t border-[#182225] max-w-md mx-auto transition-colors">
      <div className="grid grid-cols-4 h-16 items-center px-2 pb-safe relative">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;

          return (
            <motion.button
              key={tab.id}
              onClick={() => onChangeTab(tab.id)}
              whileTap={{ scale: 0.92 }}
              className="flex flex-col items-center justify-center min-h-[48px] py-1 relative z-10 transition-colors cursor-pointer select-none group"
              aria-label={tab.label}
            >
              {/* Subtle top indicator bar on active */}
              {isActive && (
                <motion.div
                  layoutId="activeTabTopLine"
                  transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                  className="absolute -top-[1px] w-8 h-[2px] bg-gradient-to-r from-transparent via-[#58C995] to-transparent shadow-[0_0_8px_rgba(88,201,149,0.9)]"
                />
              )}

              <motion.div
                animate={{
                  scale: isActive ? 1.06 : 1,
                  y: isActive ? -1 : 0,
                }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="relative"
              >
                <Icon
                  className={`w-5 h-5 transition-all duration-200 ${
                    isActive
                      ? 'text-[#58C995] stroke-[2.2] drop-shadow-[0_0_6px_rgba(88,201,149,0.4)]'
                      : 'text-[#7D888B] group-hover:text-[#C5CBCB] stroke-[1.8]'
                  }`}
                />
              </motion.div>

              <span
                className={`text-[10.5px] tracking-tight mt-1 transition-colors duration-200 ${
                  isActive
                    ? 'text-[#58C995] font-bold'
                    : 'text-[#7D888B] font-medium group-hover:text-[#C5CBCB]'
                }`}
              >
                {tab.label}
              </span>

              {/* Minimal mint active pip */}
              {isActive && (
                <motion.span
                  layoutId="activeNavPip"
                  transition={{ type: 'spring', stiffness: 500, damping: 36 }}
                  className="w-1 h-1 rounded-full bg-[#58C995] mt-0.5 shadow-[0_0_4px_rgba(88,201,149,0.8)]"
                />
              )}
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
};
