'use client';

import { useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export default function useScrollFadeIn(selector: string) {
  useEffect(() => {
    const elements = gsap.utils.toArray(selector) as HTMLElement[];
    const triggers: ScrollTrigger[] = [];

    elements.forEach((el) => {
      const animation = gsap.fromTo(
        el,
        {
          autoAlpha: 0,
          y: 50,
        },
        {
          autoAlpha: 1,
          y: 0,
          duration: 1,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: el,
            start: 'top 80%',
            toggleActions: 'play none none reverse',
          },
        },
      );

      triggers.push(animation.scrollTrigger!);
    });

    return () => {
      triggers.forEach((trigger) => trigger.kill());
    };
  }, [selector]);
}
