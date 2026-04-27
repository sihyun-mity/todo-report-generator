import { Metadata } from 'next';

export function staticMetadata(meta: Metadata): Metadata {
  return {
    ...meta,
    title: meta.title ? `${meta.title} | 일일 업무 보고 생성기` : '일일 업무 보고 생성기',
    description: `${meta.description}`,
    openGraph: {
      ...meta.openGraph,
      images: meta.openGraph?.images,
    },
    keywords: [...(typeof meta.keywords === 'string' ? [meta.keywords] : meta.keywords || [])],
  };
}

export const shareCurrentPage = async () => {
  const data: ShareData = { title: document.title, url: window.location.href };
  if (!!navigator?.share && navigator?.canShare?.(data)) {
    try {
      await navigator.share(data);
    } catch (err) {
      console.error(err);
    }
  }
};
