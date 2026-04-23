import { create } from 'zustand';
import { MEDIA_STATE_DEFAULT_VALUE } from '@/constants';
import type { MediaStore } from '@/types';

export const useMediaStore = create<MediaStore>()((set) => ({
  ...MEDIA_STATE_DEFAULT_VALUE,
  setMedia: (media) => set({ ...media }),
}));
