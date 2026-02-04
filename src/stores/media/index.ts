import { MEDIA_STATE_DEFAULT_VALUE } from '@/stores/media/index.constant';
import { MediaStore } from '@/stores/media/index.type';
import { create } from 'zustand';

const useMediaStore = create<MediaStore>()((set) => ({
  ...MEDIA_STATE_DEFAULT_VALUE,
  setMedia: (media) => set({ ...media }),
}));

export default useMediaStore;
