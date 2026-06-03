// ============================================================
// VPS Manager · Lógica de ciclo de vida del VPS
// ============================================================
import { gh, generateVpsWorkflow } from './github';
import type { VpsSession } from '../state/store';

const VNC_PASSWORD = 'Vps2024!';
const VPS_MINUTES  = 330;

export interface CreateResult {
  session: VpsSession;
}

// ── Crear repo + workflow + arrancar VPS ─────────────────────
export async function createVps(token: string): Promise<CreateResult> {
  const me = await gh.me(token);
  const owner: string = me.login;

  const repoName     = `vps-${Date.now()}`;
  const repoFullName = `${owner}/${repoName}`;

  // 1. Crear repo privado
  await gh.createRepo(token, repoName); // público — Actions gratis ilimitado con windows-latest
  await sleep(2000);

  // 2. Crear secret GH_TOKEN en el repo vía API
  //    (necesitamos libsodium en el navegador — usamos workaround: ponemos el token en el YAML
  //     usando una variable de entorno del runner que sí es segura porque el repo es privado)
  //    Alternativa limpia: guardamos el token cifrado en el repo como archivo .env
  //    El workflow lo lee de secrets.GH_TOKEN que creamos vía API de GitHub.
  await createRepoSecret(token, owner, repoName, 'GH_TOKEN', token);
  await sleep(1500);

  // 3. Crear el workflow YAML
  const workflowContent = generateVpsWorkflow(repoName, repoFullName);
  await gh.putFile(token, owner, repoName, '.github/workflows/vps.yml', workflowContent, undefined, 'feat: add VPS workflow');
  await sleep(2000);

  // 4. Disparar el workflow
  await gh.dispatch(token, owner, repoName, 'start-vps', { vps_name: repoName });

  const session: VpsSession = {
    repoFullName,
    repoName,
    vncUrl: '',
    startedAt: Date.now(),
    minutesTotal: VPS_MINUTES,
  };
  return { session };
}

// ── Crear secret usando la API de GitHub (sin libsodium nativo) ─
// Usamos tweetsodium compilado a WASM inline vía SubtleCrypto workaround.
// En realidad la API de secrets requiere cifrado con la clave pública del repo.
// Solución: usamos la API de Variables (no secrets) para el token ya que el repo es privado.
async function createRepoSecret(token: string, owner: string, repo: string, name: string, value: string) {
  // Obtener clave pública del repo
  const { key, key_id } = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/secrets/public-key`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } }
  ).then(r => r.json());

  // Cifrar con tweetsodium (importamos dinámicamente desde CDN en build)
  const encrypted = await encryptSecret(value, key);

  await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/secrets/${name}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ encrypted_value: encrypted, key_id }),
  });
}

async function encryptSecret(secret: string, base64Key: string): Promise<string> {
  // Implementación de cifrado NaCl box_seal usando SubtleCrypto + libsodium-wasm
  // Cargamos libsodium desde CDN en tiempo de ejecución
  if (!(window as any)._sodium) {
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/libsodium-wrappers@0.7.13/dist/modules/libsodium-wrappers.js';
      s.onload = () => (window as any)._sodium_ready.then(() => resolve());
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  const sodium = (window as any).sodium || (window as any)._sodium;
  await sodium.ready;
  const keyBytes = sodium.from_base64(base64Key, sodium.base64_variants.ORIGINAL);
  const msgBytes = sodium.from_string(secret);
  const encrypted = sodium.crypto_box_seal(msgBytes, keyBytes);
  return sodium.to_base64(encrypted, sodium.base64_variants.ORIGINAL);
}

// ── Polling: leer vps-status.json del repo ──────────────────
export async function pollVpsStatus(token: string, owner: string, repo: string): Promise<{
  status: 'running' | 'warning' | 'offline' | 'unknown';
  url: string;
  minutesLeft?: number;
  endedAt?: string;
}> {
  try {
    const file = await gh.getFile(token, owner, repo, 'vps-status.json');
    const content = JSON.parse(atob(file.content.replace(/\n/g, '')));
    return content;
  } catch {
    return { status: 'unknown', url: '' };
  }
}

// ── Iniciar nueva sesión en repo existente ───────────────────
export async function restartVps(token: string, owner: string, repo: string) {
  await gh.dispatch(token, owner, repo, 'start-vps', { restart: true });
}

// ── Eliminar repo VPS (detener para siempre) ─────────────────
export async function destroyVps(token: string, owner: string, repo: string) {
  await gh.deleteRepo(token, owner, repo);
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

export { VNC_PASSWORD, VPS_MINUTES };
