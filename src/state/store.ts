// ============================================================
// VPS Manager · Global State
// ============================================================
import { createContext, useContext } from 'react';

export type VpsStatus =
  | 'idle'        // sin VPS
  | 'creating'    // creando repo + workflow
  | 'booting'     // workflow disparado, esperando URL
  | 'running'     // VPS listo y con URL
  | 'warning'     // quedan <15 min para el corte
  | 'reconnecting'; // perdió conexión, reintentando

export interface VpsSession {
  repoFullName: string;   // "usuario/vps-project-xxx"
  repoName: string;
  vncUrl: string;         // https://xxx.trycloudflare.com/vnc.html
  rdpHost?: string;       // host para RDP (si se expone)
  startedAt: number;      // epoch ms
  minutesTotal: number;   // 330 por defecto
  runId?: number;         // GitHub Actions run ID
}

export interface AppState {
  token: string | null;
  session: VpsSession | null;
  status: VpsStatus;
  setToken: (t: string | null) => void;
  setSession: (s: VpsSession | null) => void;
  setStatus: (s: VpsStatus) => void;
  logout: () => void;
}

export const AppCtx = createContext<AppState | null>(null);
export const useApp = (): AppState => {
  const v = useContext(AppCtx);
  if (!v) throw new Error('useApp() outside provider');
  return v;
};
