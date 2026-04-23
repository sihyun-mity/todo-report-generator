import { create } from 'zustand';
import type { MobileStore } from '@/types';

export const useMobileStore = create<MobileStore>()((set) => ({
  isMobile: false,
  setIsMobile: (isMobile: boolean) => set({ isMobile }),
  isAndroid: false,
  setIsAndroid: (isAndroid: boolean) => set({ isAndroid }),
  isIOS: false,
  setIsIOS: (isIOS: boolean) => set({ isIOS }),
  isReady: false,
  setIsReady: (isReady: boolean) => set({ isReady }),
}));
