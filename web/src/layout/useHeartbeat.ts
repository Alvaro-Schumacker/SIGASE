import { useEffect } from 'react';
import { api } from '../api';

/** Mantém o usuário como "online" no Histórico (mesmo intervalo da versão atual). */
export function useHeartbeat() {
  useEffect(() => {
    const beat = () => {
      if (!document.hidden) api('/api/heartbeat', { method: 'POST' }).catch(() => undefined);
    };
    beat();
    const id = window.setInterval(beat, 30_000);
    return () => window.clearInterval(id);
  }, []);
}
