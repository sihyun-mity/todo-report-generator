const scroll = {
  lock: () => {
    if (typeof document === 'undefined') return;
    document.documentElement.style.overflow = 'hidden';
  },

  unlock: () => {
    if (typeof document === 'undefined') return;
    document.documentElement.style.removeProperty('overflow');
  },
};

export default scroll;
