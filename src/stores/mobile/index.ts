import { create } from 'zustand';

interface MobileStore {
  isMobile: boolean;
  setIsMobile: (isMobile: boolean) => void;
  isAndroid: boolean;
  setIsAndroid: (isAndroid: boolean) => void;
  isIOS: boolean;
  setIsIOS: (isIOS: boolean) => void;
  isReady: boolean;
  setIsReady: (isReady: boolean) => void;
}

const useMobileStore = create<MobileStore>()((set) => ({
  isMobile: false,
  setIsMobile: (isMobile: boolean) => set({ isMobile }),
  isAndroid: false,
  setIsAndroid: (isAndroid: boolean) => set({ isAndroid }),
  isIOS: false,
  setIsIOS: (isIOS: boolean) => set({ isIOS }),
  isReady: false,
  setIsReady: (isReady: boolean) => set({ isReady }),
}));

export default useMobileStore;
