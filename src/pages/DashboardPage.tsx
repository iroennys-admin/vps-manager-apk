// ============================================================
// VPS Manager · Dashboard — control central del VPS
// ============================================================
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../state/store';
import { createVps, pollVpsStatus, restartVps, destroyVps, VPS_MINUTES } from '../api/vps';

const POLL_INTERVAL = 15_000; // 15 s

export default function DashboardPage({ onOpenVnc }: { onOpenVnc: () => void }) {
  const { token, session, status, setSession, setStatus, logout } = useApp();
  const owner = localStorage.getItem('vpsm_username') || '';

  const [log, setLog]         = useState<string[]>([]);
  const [showLog, setShowLog] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null); // minutos restantes
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const addLog = (msg: string) =>
    setLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 80));

  // ── Polling del estado del VPS ───────────────────────────
  const poll = useCallback(async () => {
    if (!token || !session) return;
    try {
      const s = await pollVpsStatus(token, owner, session.repoName);
      if (s.status === 'running' && s.url) {
        setSession({ ...session, vncUrl: s.url });
        setStatus('running');
        setCountdown(null);
      } else if (s.status === 'warning') {
        setStatus('warning');
        setCountdown(s.minutesLeft ?? null);
        addLog(`⚠️ Quedan ${s.minutesLeft} minutos de sesión`);
      } else if (s.status === 'offline') {
        setStatus('idle');
        addLog('⏹️ Sesión terminada. Puedes iniciar una nueva.');
        stopPolling();
      }
    } catch { /* sin conexión, sigue */ }
  }, [token, session, owner]);

  const startPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(poll, POLL_INTERVAL);
  }, [poll]);

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  useEffect(() => {
    if (session && (status === 'booting' || status === 'running' || status === 'warning')) {
      startPolling();
      poll(); // primera llamada inmediata
    }
    return stopPolling;
  }, [session?.repoName, status]);

  // ── Crear VPS ────────────────────────────────────────────
  const handleCreate = async () => {
    if (!token) return;
    setStatus('creating');
    addLog('🛠️ Creando repo privado en GitHub...');
    try {
      const { session: newSession } = await createVps(token);
      setSession(newSession);
      setStatus('booting');
      addLog(`✅ Repo creado: ${newSession.repoFullName}`);
      addLog('🚀 Workflow disparado — instalando Windows VPS...');
      addLog('⏳ Tarda ~4-6 minutos. Polling cada 15s...');
      startPolling();
    } catch (e: any) {
      setStatus('idle');
      addLog(`❌ Error: ${e.message}`);
    }
  };

  // ── Reconectar (relanzar workflow) ───────────────────────
  const handleRestart = async () => {
    if (!token || !session) return;
    setStatus('booting');
    addLog('🔄 Iniciando nueva sesión VPS...');
    try {
      await restartVps(token, owner, session.repoName);
      addLog('🚀 Workflow relanzado — espera ~5 min');
      startPolling();
    } catch (e: any) {
      setStatus('idle');
      addLog(`❌ Error al reiniciar: ${e.message}`);
    }
  };

  // ── Destruir VPS ─────────────────────────────────────────
  const handleDestroy = async () => {
    if (!token || !session) return;
    if (!confirm(`¿Borrar el repo "${session.repoName}" y todos los datos del VPS?`)) return;
    stopPolling();
    addLog('🗑️ Eliminando repo VPS...');
    try {
      await destroyVps(token, owner, session.repoName);
      setSession(null);
      setStatus('idle');
      addLog('✅ Repo eliminado. VPS destruido.');
    } catch (e: any) {
      addLog(`❌ Error: ${e.message}`);
    }
  };

  // ── Minutero visual ──────────────────────────────────────
  const elapsed   = session ? Math.floor((Date.now() - session.startedAt) / 60000) : 0;
  const remaining = session ? Math.max(0, VPS_MINUTES - elapsed) : 0;
  const pct       = session ? Math.min(100, (elapsed / VPS_MINUTES) * 100) : 0;

  return (
    <div className="screen">
      {/* ── Header ── */}
      <div className="topbar">
        <span className="topbar-title">🖥️ VPS Manager</span>
        <div className="topbar-actions">
          <button className="icon-btn" onClick={() => setShowLog(v => !v)} title="Logs">📋</button>
          <button className="icon-btn" onClick={logout} title="Salir">⎋</button>
        </div>
      </div>

      <div className="scroll">

        {/* ── Estado ── */}
        <div className={`status-card status-${status}`}>
          <div className="status-dot" />
          <div className="status-info">
            <div className="status-label">{statusLabel(status)}</div>
            {session && <div className="status-sub">{session.repoFullName}</div>}
          </div>
          {status === 'running' || status === 'warning' ? (
            <span className="status-badge">{remaining}m</span>
          ) : null}
        </div>

        {/* ── Barra de tiempo ── */}
        {session && status !== 'idle' && (
          <div className="time-bar-wrap">
            <div className="time-bar-labels">
              <span>Sesión iniciada hace {elapsed}min</span>
              <span className={remaining < 20 ? 'warn' : ''}>{remaining}min restantes</span>
            </div>
            <div className="time-bar">
              <div className="time-fill" style={{ width: `${pct}%`, background: pct > 90 ? 'var(--danger)' : pct > 75 ? 'var(--warn)' : 'var(--success)' }} />
            </div>
          </div>
        )}

        {/* ── Aviso de corte próximo ── */}
        {status === 'warning' && (
          <div className="alert-box">
            ⚠️ <strong>La sesión termina en ~{countdown ?? remaining} minutos.</strong>
            <br />Los archivos de tu escritorio se están guardando automáticamente en el repo.
            Cuando se corte, pulsa <strong>"Nueva sesión"</strong> para reconectar.
          </div>
        )}

        {/* ── Acciones principales ── */}
        <div className="actions-grid">
          {status === 'idle' && !session && (
            <button className="btn-primary big" onClick={handleCreate}>
              ⚡ Crear VPS Windows
            </button>
          )}

          {status === 'idle' && session && (
            <button className="btn-primary big" onClick={handleRestart}>
              🔄 Nueva sesión VPS
            </button>
          )}

          {(status === 'creating' || status === 'booting') && (
            <div className="loading-card">
              <span className="spinner large" />
              <div className="loading-text">
                {status === 'creating' ? 'Creando repositorio...' : 'Arrancando Windows VPS...'}
              </div>
              <div className="loading-sub">Esto tarda 4-6 minutos</div>
            </div>
          )}

          {(status === 'running' || status === 'warning') && session?.vncUrl && (
            <>
              <button className="btn-primary big" onClick={onOpenVnc}>
                🖥️ Abrir Escritorio (VNC)
              </button>
              <button
                className="btn-secondary"
                onClick={() => {
                  const host = session.vncUrl.replace('https://', '').replace('/vnc.html?autoconnect=true&password=Vps2024!', '');
                  alert(`Host RDP:\n${host}\nPuerto: 3389\nUsuario: runneradmin\nContraseña: Vps2024!`);
                }}
              >
                🔌 Datos RDP
              </button>
            </>
          )}
        </div>

        {/* ── Info del VPS ── */}
        {session && (
          <div className="info-card">
            <div className="info-title">Información del VPS</div>
            <InfoRow label="Repo"       value={session.repoFullName} />
            <InfoRow label="Iniciado"   value={new Date(session.startedAt).toLocaleString()} />
            <InfoRow label="Duración"   value={`${VPS_MINUTES} min (~5h 30min)`} />
            <InfoRow label="Contraseña" value="Vps2024!" mono />
            {session.vncUrl && (
              <InfoRow label="URL VNC" value={session.vncUrl} mono small />
            )}
          </div>
        )}

        {/* ── Zona peligrosa ── */}
        {session && status === 'idle' && (
          <div className="danger-zone">
            <div className="danger-title">⚠️ Zona peligrosa</div>
            <button className="btn-danger" onClick={handleDestroy}>
              🗑️ Eliminar VPS permanentemente
            </button>
          </div>
        )}

        {/* ── Log ── */}
        {showLog && (
          <div className="log-box">
            <div className="log-title">📋 Registro de actividad</div>
            {log.length === 0
              ? <div className="log-empty">Sin actividad aún</div>
              : log.map((l, i) => <div key={i} className="log-line">{l}</div>)
            }
          </div>
        )}

        <div style={{ height: 32 }} />
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono, small }: { label: string; value: string; mono?: boolean; small?: boolean }) {
  return (
    <div className="info-row-item">
      <span className="info-row-label">{label}</span>
      <span className={`info-row-value ${mono ? 'mono' : ''} ${small ? 'small' : ''}`}>{value}</span>
    </div>
  );
}

function statusLabel(s: string) {
  return {
    idle:         '⚫ Sin sesión activa',
    creating:     '🟡 Creando repositorio...',
    booting:      '🟠 Arrancando VPS...',
    running:      '🟢 VPS en línea',
    warning:      '🟡 Sesión por terminar',
    reconnecting: '🔵 Reconectando...',
  }[s] ?? s;
}
