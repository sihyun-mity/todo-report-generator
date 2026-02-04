import { MutableRefObject, Ref } from 'react';

export const mergeRefs = <T>(...refs: (Ref<T> | undefined)[]): Ref<T> => {
  return (element: T | null) => {
    refs.forEach((ref) => {
      if (typeof ref === 'function') {
        ref(element);
      } else if (ref && 'current' in ref) {
        (ref as MutableRefObject<T | null>).current = element;
      }
    });
  };
};
