import { useEffect, useRef } from 'react';

/** Indica se o conteúdo mudou desde que o editor terminou de carregar. */
export function useDirty(opened: boolean, loaded: boolean, content: unknown) {
  const snapshot = useRef('');
  const json = JSON.stringify(content);
  useEffect(() => {
    if (!opened) snapshot.current = '';
    else if (loaded && !snapshot.current) snapshot.current = json;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, loaded]);
  return !!snapshot.current && json !== snapshot.current;
}
