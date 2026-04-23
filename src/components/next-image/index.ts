import { OriginNextImage } from '@/components/next-image/next-image';
import { Protected } from '@/components/next-image/protected';
import { withSubComponents } from '@/utils';

export const NextImage = withSubComponents(OriginNextImage, { Protected });
