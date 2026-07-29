import Image, { type ImageProps, StaticImageData } from 'next/image';
import { ComponentProps, CSSProperties, ReactNode, RefObject } from 'react';
import type { Property } from 'csstype';
import { cn } from '@/utils';

/** `56` / `'56px'` 처럼 px 로 확정되는 길이만 숫자로 해석 — `'100%'`·`'auto'`·`calc()` 는 undefined. */
const toPxLength = (value: Property.Width | Property.Height | number | undefined): number | undefined => {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : undefined;
  if (typeof value !== 'string') return undefined;
  const parsed = Number(/^\s*(\d+(?:\.\d+)?)px\s*$/.exec(value)?.[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

/** 그려지는 이미지 폭이 박스 폭을 넘지 않는 objectFit — 이때만 박스 폭이 디코딩 폭의 상한이 된다. */
const isWidthBoundedFit = (objectFit: Property.ObjectFit): boolean =>
  objectFit === 'contain' || objectFit === 'scale-down';

/**
 * 디코딩 해상도 힌트인 `sizes` 를 컴포넌트가 이미 받은 박스 크기 props 에서 유도한다.
 *
 * 디코딩 비트맵 RAM 은 `폭 × 높이 × 4B` 이고, `sizes` 가 없거나 무효면 브라우저는 srcset 후보를
 * **뷰포트 폭** 기준으로 고른다 — 44px 아이콘도 DPR3 기기에서 1200px 로 디코딩된다(동일 srcset
 * 에서 `sizes="44px"` 는 96px, `sizes="100%"`(무효값 → `100vw` 폴백) 는 750px @DPR2·375px 뷰포트
 * = 면적 61 배). 호출부마다 손으로 `sizes` 를 다는 대신 여기서 유도한다.
 *
 * **유도하지 않고 폴백 `sizes="100%"` 를 그대로 두는 경우 (의도된 보수적 동작):**
 * - 박스 폭이 px 로 확정되지 않는 경우. 특히 `width`/`height` 없이 `responsiveRatio` 만 주는
 *   반응형 채움 모드는 실제 폭을 부모가 정하므로 컴포넌트가 알 수 없다 — 여기서 폭을 잘못
 *   좁히면 이미지가 저해상도로 깨진다. **폭 근거가 없으면 손대지 않는다** 가 제1 원칙.
 * - `objectFit` 이 `cover`/`fill`/`none` 인데 높이를 모르는 경우. 이들은 박스보다 넓게 확대돼
 *   그려질 수 있어 박스 폭이 상한이 아니다. 높이까지 확정될 때만 긴 변으로 유도한다.
 */
const deriveSizesFromBox = ({
  width,
  height,
  maxWidth,
  maxHeight,
  objectFit,
}: {
  width: Property.Width | number;
  height: Property.Height | number;
  maxWidth: Property.MaxWidth | number | undefined;
  maxHeight: Property.MaxHeight | number | undefined;
  objectFit: Property.ObjectFit;
}): string | undefined => {
  const widthCap = toPxLength(maxWidth);
  const boxWidth = toPxLength(width) ?? widthCap;
  if (boxWidth === undefined) return undefined;

  const slotWidth = widthCap === undefined ? boxWidth : Math.min(boxWidth, widthCap);
  if (isWidthBoundedFit(objectFit)) return `${Math.ceil(slotWidth)}px`;

  const boxHeight = toPxLength(height) ?? toPxLength(maxHeight);
  if (boxHeight === undefined) return undefined;
  return `${Math.ceil(Math.max(slotWidth, boxHeight))}px`;
};

type Props = Omit<ImageProps, 'width' | 'height' | 'src' | 'alt' | 'objectFit'> & {
  width?: Property.Width | number;
  height?: Property.Height | number;
  maxWidth?: Property.MaxWidth | number;
  maxHeight?: Property.MaxHeight | number;
  minWidth?: Property.MinWidth | number;
  minHeight?: Property.MinHeight | number;
  responsiveRatio?: Property.PaddingBottom;
  src?: ComponentProps<typeof Image>['src'];
  alt?: string;
  objectFit?: Property.ObjectFit;
  containerClass?: string;
  containerStyle?: CSSProperties;
  imageBoxClass?: string;
  imageBoxStyle?: CSSProperties;
  imageClass?: string;
  imageStyle?: CSSProperties;
  onClick?: () => void;
  containerRef?: RefObject<HTMLDivElement | null> | null;
};

export function OriginNextImage({
  width = '100%',
  height = 'auto',
  maxWidth,
  maxHeight,
  minWidth,
  minHeight,
  responsiveRatio,
  objectFit = 'contain',
  src,
  alt = '',
  containerClass,
  containerStyle,
  imageBoxClass,
  imageBoxStyle,
  imageClass,
  imageStyle,
  fill = !!responsiveRatio,
  unoptimized,
  onClick,
  containerRef,
  placeholder = 'blur',
  quality = 100,
  sizes,
  ...props
}: Props): ReactNode {
  const isRemoteImage = typeof src === 'string' && src.startsWith('http');
  const isLocalSvgImage =
    (typeof src !== 'string' && !!(src as StaticImageData)?.src?.endsWith?.('svg')) ||
    (typeof src === 'string' && !src.startsWith('http') && src.endsWith('svg'));
  const isAutomaticallyBlurImage =
    !isRemoteImage &&
    typeof src !== 'string' &&
    ['jpg', 'jpeg', 'png', 'webp', 'avif'].includes((src as StaticImageData)?.src);
  const style: CSSProperties = (() => {
    const obj: CSSProperties = { objectFit, ...imageStyle };
    if (!fill) {
      obj.width = width;
      obj.height = height;
    }
    return obj;
  })();

  // 호출부가 명시한 sizes 가 항상 우선. 없으면 박스 크기에서 유도하고, 유도 근거가 없으면
  // 폴백 `100%` 를 유지한다 (deriveSizesFromBox 주석의 폴백 원칙 참고).
  //
  // 폴백은 반드시 `100%` 문자열이어야 한다 — 무효값이라 브라우저는 `100vw` 로 폴백하지만,
  // Next 의 getWidths 는 sizes 문자열에 `vw` 가 매치될 때만 srcset 후보를 deviceSizes[0](640)
  // 이상으로 필터한다. 실제로 `100vw` 를 적어 넣으면 16~384px 후보가 사라져 작은 아이콘이
  // 오히려 악화된다.
  const resolvedSizes = sizes ?? deriveSizesFromBox({ width, height, maxWidth, maxHeight, objectFit }) ?? '100%';

  const element = src ? (
    <Image
      src={src}
      alt={alt}
      width={fill ? undefined : 0}
      height={fill ? undefined : 0}
      style={style}
      fill={fill}
      sizes={resolvedSizes}
      className={imageClass}
      unoptimized={unoptimized !== undefined ? unoptimized : isRemoteImage}
      placeholder={isLocalSvgImage ? 'empty' : placeholder}
      blurDataURL={
        isAutomaticallyBlurImage
          ? undefined
          : 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP89h8AAvEB93wyFi8AAAAASUVORK5CYII='
      }
      quality={quality}
      {...props}
    />
  ) : null;

  if (!src) {
    return null;
  }

  return (
    <div
      className={containerClass}
      style={{ width, height, maxWidth, maxHeight, minWidth, minHeight, ...containerStyle }}
      onClick={onClick}
      ref={containerRef}
    >
      <div
        className={cn('relative h-full w-full', imageBoxClass)}
        style={{ paddingBottom: responsiveRatio, ...imageBoxStyle }}
      >
        {responsiveRatio ? <picture className="absolute top-0 left-0 h-full w-full">{element}</picture> : element}
      </div>
    </div>
  );
}
