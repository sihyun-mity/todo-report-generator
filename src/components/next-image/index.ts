import OriginNextImage from './next-image';
import Protected from './protected';
import { withSubComponents } from '@/utils';

const NextImage = withSubComponents(OriginNextImage, { Protected });

export default NextImage;
