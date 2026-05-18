import { Ref, RefObject } from 'react';

export const mergeRefs = <T>(...refs: Array<Ref<T> | undefined>): Ref<T> => {
  return (element: T | null) => {
    refs.forEach((ref) => {
      if (typeof ref === 'function') {
        ref(element);
      } else if (ref && 'current' in ref) {
        (ref as RefObject<T | null>).current = element;
      }
    });
  };
};
