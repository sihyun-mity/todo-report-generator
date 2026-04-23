export type Media = {
  sm: boolean;
  md: boolean;
  lg: boolean;
  xl: boolean;
};

export type MediaStore = Media & {
  setMedia: (media: Partial<Media>) => void;
};
