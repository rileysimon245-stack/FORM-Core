import React from 'react';
import { CalendarDays, Dumbbell, User } from 'lucide-react';
import { motion } from 'motion/react';

export type TabType = 'overview' | 'workouts' | 'profile';

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
    { id: 'profile', label: 'Профиль', icon: User },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#080D0E]/95 backdrop-blur-md border-t border-[#252D2F] max-w-md mx-auto">
      <div className="grid grid-cols-3 h-16 items-center px-3 pb-safe relative">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;

          return (
            <motion.button
              key={tab.id}
              onClick={() => onChangeTab(tab.id)}
              whileTap={{ scale: 0.92 }}
              className="flex flex-col items-center justify-center min-h-[48px] py-1 relative z-10 transition-colors cursor-pointer select-none"
              aria-label={tab.label}
            >
              {/* Animated soft glow pill behind active tab */}
              {isActive && (
                <motion.div
                  layoutId="activeTabPill"
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  className="absolute inset-x-2 inset-y-1 bg-[#14231b] border border-[#2f553f]/60 rounded-xl -z-10 shadow-sm"
                />
              )}

              <motion.div
                animate={{
                  scale: isActive ? 1.08 : 1,
                  y: isActive ? -1 : 0,
                }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              >
                <Icon
                  className={`w-5 h-5 transition-colors duration-200 ${
                    isActive
                      ? 'text-[#58C995] stroke-[2.3]'
                      : 'text-[#92999A] hover:text-[#E8E9E7] stroke-[1.8]'
                  }`}
                />
              </motion.div>

              <span
                className={`text-[11px] font-medium tracking-tight mt-1 transition-colors duration-200 ${
                  isActive ? 'text-[#58C995] font-bold' : 'text-[#92999A]'
                }`}
              >
                {tab.label}
              </span>

              {/* Tiny active dot */}
              {isActive && (
                <motion.span
                  layoutId="activeDot"
                  className="w-1 h-1 rounded-full bg-[#58C995] mt-0.5"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
};
