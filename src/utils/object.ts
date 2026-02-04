/* eslint-disable @typescript-eslint/no-explicit-any */

import { ComponentProps } from 'react';

export const compareAllKeys = <T extends Record<string, any>>(obj1: T, obj2: T): boolean => {
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);

  if (keys1.length !== keys2.length) {
    return false;
  }

  for (const key of keys1) {
    if (obj1[key] !== obj2[key]) {
      return false;
    }
  }

  return true;
};

export const hasAllValues = <T extends Record<string, any>>(obj: T): boolean => {
  if (!Object.values(obj).length) {
    return false;
  }

  return Object.values(obj).every((value) => {
    if (value === null || value === undefined) {
      return false;
    }

    if (typeof value === 'string' && value.trim() === '') {
      return false;
    }

    if (Array.isArray(value) && value.length === 0) {
      return false;
    }

    if (typeof value === 'object' && Object.keys(value).length === 0) {
      return false;
    }

    return true;
  });
};

export const withSubComponents = <T extends ComponentProps<any>, Sub extends Record<string, unknown>>(
  component: T,
  subComponents: Sub,
) => {
  const result = component as T & { readonly [K in keyof Sub]: Sub[K] };

  for (const key in subComponents) {
    Object.defineProperty(result, key, {
      value: subComponents[key],
      writable: false,
      configurable: false,
      enumerable: true,
    });
  }

  return result;
};
