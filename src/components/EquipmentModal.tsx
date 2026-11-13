import React, { useState } from 'react';
import { EquipmentItem, EquipmentCategory } from '../types/workout';
import { StorageService } from '../services/storage';
import { Modal } from './common/Modal';
import {
  X,
  Check,
  Dumbbell,
  Shield,
  Circle,
  Activity,
  Zap,
  Cpu,
  User,
  Minus,
  Equal,
  Square,
  Plus,
  Sliders,
  CheckCircle2,
} from 'lucide-react';

interface EquipmentModalProps {
  onClose: () => void;
  onSaved: () => void;
}

export const EquipmentModal: React.FC<EquipmentModalProps> = ({ onClose, onSaved }) => {
  const [equipmentList, setEquipmentList] = useState<EquipmentItem[]>(
    StorageService.getEquipmentList()
  );
  const [activePreset, setActivePreset] = useState<string>('custom');
  const [successToast, setSuccessToast] = useState(false);

  const getIcon = (id: EquipmentCategory) => {
    switch (id) {
      case 'bodyweight':
        return <User className="w-4 h-4 text-[#58C995]" />;
      case 'pullup_bar':
        return <Minus className="w-4 h-4 text-[#58C995]" />;
      case 'dip_bars':
        return <Equal className="w-4 h-4 text-[#58C995]" />;
      case 'dumbbells_adjustable':
      case 'dumbbells_fixed':
        return <Dumbbell className="w-4 h-4 text-[#58C995]" />;
      case 'barbell':
        return <Shield className="w-4 h-4 text-[#58C995]" />;
      case 'bench':
        return <Square className="w-4 h-4 text-[#58C995]" />;
      case 'resistance_bands':
        return <Activity className="w-4 h-4 text-[#58C995]" />;
      case 'kettlebells':
        return <Circle className="w-4 h-4 text-[#58C995]" />;
      case 'jump_rope':
        return <Zap className="w-4 h-4 text-[#58C995]" />;
      case 'gym_machines':
        return <Cpu className="w-4 h-4 text-[#58C995]" />;
      default:
        return <Plus className="w-4 h-4 text-[#58C995]" />;
    }
  };

  const handleToggle = (id: EquipmentCategory) => {
    setActivePreset('custom');
    setEquipmentList((prev) =>
      prev.map((item) => (item.id === id ? { ...item, selected: !item.selected } : item))
    );
  };

  const handleParamChange = (id: EquipmentCategory, field: keyof EquipmentItem, val: any) => {
    setEquipmentList((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: val } : item))
    );
  };

  const handlePreset = (preset: 'bodyweight_only' | 'home_minimal' | 'home_dumbbells' | 'full_gym') => {
    setActivePreset(preset);
    const updated = StorageService.applyEquipmentPreset(preset);
    setEquipmentList(updated);
  };

  const handleSave = () => {
    StorageService.saveEquipmentList(equipmentList);
    setSuccessToast(true);
    setTimeout(() => {
      setSuccessToast(false);
      onSaved();
      onClose();
    }, 800);
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Мой инвентарь"
      icon={<Dumbbell className="w-4 h-4" />}
      maxWidth="max-w-md"
      footer={
        successToast ? (
          <div className="w-full py-2.5 bg-[#315D4B]/40 text-[#58C995] text-xs font-bold rounded-xl flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>Инвентарь сохранен!</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 w-full">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-[#182327] hover:bg-[#202E34] text-[#92999A] text-xs font-semibold rounded-xl hover:text-[#E8E9E7] cursor-pointer"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex-1 py-2.5 bg-[#58C995] text-[#080D0E] text-xs font-bold rounded-xl hover:bg-[#48b885] transition-colors cursor-pointer shadow-md"
            >
              Сохранить инвентарь
            </button>
          </div>
        )
      }
    >
      <div className="space-y-4">
          {/* Quick Presets */}
          <div>
            <span className="text-[11px] font-semibold text-[#92999A] uppercase tracking-wider block mb-2">
              Быстрые пресеты
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => handlePreset('bodyweight_only')}
                className={`py-2 px-2.5 rounded-xl border text-[11px] font-medium text-left transition-all ${
                  activePreset === 'bodyweight_only'
                    ? 'border-[#58C995] bg-[#315D4B]/30 text-[#58C995]'
                    : 'border-[#252D2F] bg-[#171D1F] text-[#92999A] hover:text-[#E8E9E7]'
                }`}
              >
                Только свой вес
              </button>
              <button
                type="button"
                onClick={() => handlePreset('home_minimal')}
                className={`py-2 px-2.5 rounded-xl border text-[11px] font-medium text-left transition-all ${
                  activePreset === 'home_minimal'
                    ? 'border-[#58C995] bg-[#315D4B]/30 text-[#58C995]'
                    : 'border-[#252D2F] bg-[#171D1F] text-[#92999A] hover:text-[#E8E9E7]'
                }`}
              >
                Домашний минимум
              </button>
              <button
                type="button"
                onClick={() => handlePreset('home_dumbbells')}
                className={`py-2 px-2.5 rounded-xl border text-[11px] font-medium text-left transition-all ${
                  activePreset === 'home_dumbbells'
                    ? 'border-[#58C995] bg-[#315D4B]/30 text-[#58C995]'
                    : 'border-[#252D2F] bg-[#171D1F] text-[#92999A] hover:text-[#E8E9E7]'
                }`}
              >
                Гантели + турник
              </button>
              <button
                type="button"
                onClick={() => handlePreset('full_gym')}
                className={`py-2 px-2.5 rounded-xl border text-[11px] font-medium text-left transition-all ${
                  activePreset === 'full_gym'
                    ? 'border-[#58C995] bg-[#315D4B]/30 text-[#58C995]'
                    : 'border-[#252D2F] bg-[#171D1F] text-[#92999A] hover:text-[#E8E9E7]'
                }`}
              >
                Полный тренажерный зал
              </button>
            </div>
          </div>

          {/* Equipment Cards List */}
          <div className="space-y-2">
            <span className="text-[11px] font-semibold text-[#92999A] uppercase tracking-wider block">
              Доступное оборудование ({equipmentList.filter((e) => e.selected).length} выбрано)
            </span>

            {equipmentList.map((item) => (
              <div
                key={item.id}
                className={`p-3 rounded-xl border transition-all ${
                  item.selected
                    ? 'bg-[#17231d]/60 border-[#315D4B]'
                    : 'bg-[#171D1F] border-[#252D2F]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div
                    onClick={() => handleToggle(item.id)}
                    className="flex items-center gap-2.5 cursor-pointer flex-1"
                  >
                    <div className="w-7 h-7 rounded-lg bg-[#101719] border border-[#252D2F] flex items-center justify-center">
                      {getIcon(item.id)}
                    </div>
                    <div>
                      <span className="text-xs font-bold text-[#E8E9E7] block">
                        {item.name}
                      </span>
                      <span className="text-[10px] text-[#92999A]">
                        {item.categoryName}
                      </span>
                    </div>
                  </div>

                  {/* Toggle checkbox */}
                  <button
                    type="button"
                    onClick={() => handleToggle(item.id)}
                    className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all ${
                      item.selected
                        ? 'bg-[#58C995] border-[#58C995] text-[#080D0E]'
                        : 'border-[#252D2F] bg-[#101719]'
                    }`}
                  >
                    {item.selected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </button>
                </div>

                {/* Sub-parameters for adjustable items */}
                {item.selected && item.id === 'dumbbells_adjustable' && (
                  <div className="mt-2.5 pt-2 border-t border-[#252D2F] grid grid-cols-3 gap-2 text-[10px] text-[#92999A]">
                    <div>
                      <span>Мин вес (кг)</span>
                      <input
                        type="number"
                        value={item.minWeightKg || 2}
                        onChange={(e) =>
                          handleParamChange(item.id, 'minWeightKg', Number(e.target.value))
                        }
                        className="w-full bg-[#101719] border border-[#252D2F] rounded p-1 text-[#E8E9E7] text-center font-bold"
                      />
                    </div>
                    <div>
                      <span>Макс вес (кг)</span>
                      <input
                        type="number"
                        value={item.maxWeightKg || 32}
                        onChange={(e) =>
                          handleParamChange(item.id, 'maxWeightKg', Number(e.target.value))
                        }
                        className="w-full bg-[#101719] border border-[#252D2F] rounded p-1 text-[#E8E9E7] text-center font-bold"
                      />
                    </div>
                    <div>
                      <span>Шаг (кг)</span>
                      <input
                        type="number"
                        value={item.weightStepKg || 2}
                        onChange={(e) =>
                          handleParamChange(item.id, 'weightStepKg', Number(e.target.value))
                        }
                        className="w-full bg-[#101719] border border-[#252D2F] rounded p-1 text-[#E8E9E7] text-center font-bold"
                      />
                    </div>
                  </div>
                )}

                {item.selected && item.id === 'barbell' && (
                  <div className="mt-2.5 pt-2 border-t border-[#252D2F] flex items-center justify-between text-[10px] text-[#92999A]">
                    <span>Максимальный доступный вес штанги с блинами:</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={item.maxWeightKg || 120}
                        onChange={(e) =>
                          handleParamChange(item.id, 'maxWeightKg', Number(e.target.value))
                        }
                        className="w-16 bg-[#101719] border border-[#252D2F] rounded p-1 text-[#E8E9E7] text-center font-bold"
                      />
                      <span>кг</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
    </Modal>
  );
};
