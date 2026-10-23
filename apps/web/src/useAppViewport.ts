import { useLayoutEffect } from 'react';

// Set the scroll frame on the first paint as well as browser-toolbar/keyboard changes.
export function useAppViewport() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const update = () => root.style.setProperty('--app-height', `${window.visualViewport?.height ?? window.innerHeight}px`);
    update();
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
      root.style.removeProperty('--app-height');
    };
  }, []);
}
