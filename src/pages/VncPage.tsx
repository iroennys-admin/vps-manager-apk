// ============================================================
// VPS Manager · VNC Page — escritorio Windows en WebView
// ============================================================
import React, { useRef, useState } from 'react';
import { useApp } from '../state/store';

export default function VncPage({ onBack }: { onBack: () => void }) {
  const { session, status } = useApp();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const url = session?.vncUrl || '';

  const toggleFullscreen = () => {
    const el = document.documentElement;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().then(() => setFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setFullscreen(false)).catch(() => {});
    }
  };

  const copyRdpInfo = () => {
    if (!session?.vncUrl) return;
    const host = session.vncUrl.split('//')[1]?.split('/')[0] || '';
    const info = `Host: ${host}\nPuerto: 3389\nUsuario: runneradmin\nContraseña: Vps2024!`;
    navigator.clipboard?.writeText(info).then(() => alert('✅ Datos RDP copiados al portapapeles'));
  };

  return (
    <div className="vnc-screen">
      {/* ── TopBar ── */}
      <div className={`vnc-bar ${fullscreen ? 'hidden' : ''}`}>
        <button className="icon-btn" onClick={onBack}>← Volver</button>
        <span className="vnc-title">
          {status === 'warning' ? '⚠️ VPS' : '🖥️ VPS'}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="icon-btn" onClick={copyRdpInfo} title="Copiar datos RDP">🔌</button>
          <button className="icon-btn" onClick={() => iframeRef.current?.contentWindow?.location.reload()} title="Recargar">↺</button>
          <button className="icon-btn" onClick={toggleFullscreen} title="Pantalla completa">⛶</button>
        </div>
      </div>

      {/* ── Aviso sesión por terminar ── */}
      {status === 'warning' && (
        <div className="vnc-warning">
          ⚠️ La sesión termina pronto. Tus archivos se están guardando automáticamente.
        </div>
      )}

      {/* ── WebView / iframe con noVNC ── */}
      {!loaded && (
        <div className="vnc-loading">
          <span className="spinner large" />
          <div>Conectando al escritorio...</div>
          <div className="small muted">Puede tardar unos segundos</div>
        </div>
      )}

      {url ? (
        <iframe
          ref={iframeRef}
          src={url}
          className="vnc-iframe"
          style={{ opacity: loaded ? 1 : 0 }}
          onLoad={() => setLoaded(true)}
          allow="clipboard-read; clipboard-write; fullscreen"
          title="VPS Desktop"
        />
      ) : (
        <div className="vnc-no-url">
          <div style={{ fontSize: 48 }}>🖥️</div>
          <div>No hay URL de VNC disponible</div>
          <button className="btn-secondary" onClick={onBack}>← Volver al dashboard</button>
        </div>
      )}
    </div>
  );
}
