export interface MediaStore extends Media {
  setMedia: (media: Partial<Media>) => void;
}

export interface Media {
  sm: boolean;
  md: boolean;
  lg: boolean;
  xl: boolean;
}
