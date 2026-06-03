// ============================================================
// VPS Manager · Login — pegar GitHub Token
// ============================================================
import React, { useState } from 'react';
import { useApp } from '../state/store';
import { gh } from '../api/github';

export default function LoginPage({ onLogin }: { onLogin: () => void }) {
  const { setToken } = useApp();
  const [input, setInput]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const submit = async () => {
    const t = input.trim();
    if (!t) { setError('Pega tu GitHub Token'); return; }
    if (!t.startsWith('ghp_') && !t.startsWith('github_pat_')) {
      setError('El token debe empezar por ghp_ o github_pat_'); return;
    }
    setLoading(true);
    setError('');
    try {
      const me = await gh.me(t);
      setToken(t);
      localStorage.setItem('vpsm_username', me.login);
      onLogin();
    } catch (e: any) {
      setError(e.status === 401 ? 'Token inválido o sin permisos' : e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="screen center">
      <div className="login-card">
        {/* Logo */}
        <div className="logo-wrap">
          <div className="logo-icon">🖥️</div>
          <h1 className="logo-title">VPS Manager</h1>
          <p className="logo-sub">Windows VPS gratuito vía GitHub Actions</p>
        </div>

        {/* Token input */}
        <div className="field">
          <label className="field-label">GitHub Personal Access Token</label>
          <div className="field-row">
            <input
              className="field-input"
              type="password"
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              autoComplete="off"
            />
            {input && (
              <button className="field-clear" onClick={() => setInput('')}>✕</button>
            )}
          </div>
          {error && <div className="field-error">{error}</div>}
        </div>

        {/* Info */}
        <div className="info-box">
          <div className="info-row">✅ Permisos necesarios: <strong>repo</strong>, <strong>workflow</strong></div>
          <div className="info-row">🔒 El token se guarda solo en tu dispositivo</div>
          <div className="info-row">⏱️ Cada sesión dura ~5h 30min y puedes relanzarla</div>
        </div>

        <button
          className="btn-primary"
          onClick={submit}
          disabled={loading}
        >
          {loading ? <><span className="spinner" /> Verificando...</> : '🚀 Entrar'}
        </button>

        <a
          className="link-small"
          href="https://github.com/settings/tokens/new?scopes=repo,workflow&description=VPS%20Manager"
          target="_blank"
          rel="noreferrer"
        >
          ¿No tienes token? Crear uno aquí →
        </a>
      </div>
    </div>
  );
}
