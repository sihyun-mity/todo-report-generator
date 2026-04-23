export type MobileStore = {
  isMobile: boolean;
  setIsMobile: (isMobile: boolean) => void;
  isAndroid: boolean;
  setIsAndroid: (isAndroid: boolean) => void;
  isIOS: boolean;
  setIsIOS: (isIOS: boolean) => void;
  isReady: boolean;
  setIsReady: (isReady: boolean) => void;
};
