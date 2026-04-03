// store/useStore.ts
// ─────────────────────────────────────────────────────────────────────────────
// المتجر العالمي للحالة باستخدام Zustand
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand';
import type { AppUser, Property, Unit } from '../types';

interface AppState {
  // المستخدم الحالي
  user:             AppUser | null;
  setUser:          (u: AppUser | null) => void;

  // العقار المختار حالياً
  activeProperty:   Property | null;
  setActiveProperty:(p: Property | null) => void;

  // قائمة العقارات
  properties:       Property[];
  setProperties:    (ps: Property[]) => void;

  // الوحدات المحملة
  units:            Unit[];
  setUnits:         (us: Unit[]) => void;

  // الشهر المختار للتقارير
  activeMonth:      string;   // "2026-03"
  setActiveMonth:   (m: string) => void;

  // حالة القائمة الجانبية
  sidebarOpen:      boolean;
  toggleSidebar:    () => void;

  // الصفحة الحالية
  activePage:       string;
  setActivePage:    (p: string) => void;
}

const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const useStore = create<AppState>((set) => ({
  user:             null,
  setUser:          (u) => set({ user: u }),

  activeProperty:   null,
  setActiveProperty:(p) => set({ activeProperty: p }),

  properties:       [],
  setProperties:    (ps) => set({ properties: ps }),

  units:            [],
  setUnits:         (us) => set({ units: us }),

  activeMonth:      currentMonth(),
  setActiveMonth:   (m) => set({ activeMonth: m }),

  sidebarOpen:      true,
  toggleSidebar:    () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  activePage:       'dashboard',
  setActivePage:    (p) => set({ activePage: p }),
}));
