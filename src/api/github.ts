// ============================================================
// VPS Manager · GitHub API client + workflow generator
// ============================================================

const BASE = 'https://api.github.com';
const HEADERS = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'Content-Type': 'application/json',
});

async function req<T>(token: string, method: string, path: string, body?: any): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: HEADERS(token),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 204) return undefined as any;
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.message || `HTTP ${r.status}`), { status: r.status });
  return data;
}

export const gh = {
  me: (token: string) => req<any>(token, 'GET', '/user'),
  createRepo: (token: string, name: string) =>
    req<any>(token, 'POST', '/user/repos', { name, private: true, auto_init: true, description: '🖥️ VPS Manager — Windows VPS via GitHub Actions' }),
  deleteRepo: (token: string, owner: string, repo: string) =>
    req<void>(token, 'DELETE', `/repos/${owner}/${repo}`),
  getFile: (token: string, owner: string, repo: string, path: string) =>
    req<any>(token, 'GET', `/repos/${owner}/${repo}/contents/${path}`),
  putFile: (token: string, owner: string, repo: string, path: string, content: string, sha?: string, message?: string) =>
    req<any>(token, 'PUT', `/repos/${owner}/${repo}/contents/${path}`, {
      message: message || `chore: update ${path}`,
      content: btoa(unescape(encodeURIComponent(content))),
      ...(sha ? { sha } : {}),
    }),
  dispatch: (token: string, owner: string, repo: string, eventType: string, payload?: any) =>
    req<void>(token, 'POST', `/repos/${owner}/${repo}/dispatches`, { event_type: eventType, client_payload: payload || {} }),
  listRuns: (token: string, owner: string, repo: string) =>
    req<any>(token, 'GET', `/repos/${owner}/${repo}/actions/runs?per_page=5`),
  cancelRun: (token: string, owner: string, repo: string, runId: number) =>
    req<void>(token, 'POST', `/repos/${owner}/${repo}/actions/runs/${runId}/cancel`),
  disableWorkflow: (token: string, owner: string, repo: string, workflowId: string) =>
    req<void>(token, 'PUT', `/repos/${owner}/${repo}/actions/workflows/${workflowId}/disable`),
  listWorkflows: (token: string, owner: string, repo: string) =>
    req<any>(token, 'GET', `/repos/${owner}/${repo}/actions/workflows`),
};

// ============================================================
// Genera el workflow YAML del VPS
// VPS_DURATION_MINUTES: 330 (5h30) — límite real de GH Actions es 6h
// Al minuto 320 notifica al servidor para que el APK avise al usuario
// Al minuto 330 guarda archivos en el repo y termina SIN auto-reinicio
// El usuario decide cuándo reconectar desde el APK.
// ============================================================
export function generateVpsWorkflow(vpsName: string, repoFullName: string): string {
  return `name: 🖥️ VPS Session

on:
  workflow_dispatch:
  repository_dispatch:
    types: [start-vps]

jobs:
  vps:
    runs-on: windows-latest
    timeout-minutes: 350
    permissions:
      contents: write
      actions: write

    steps:
    - name: ⬇️ Checkout
      uses: actions/checkout@v4
      with:
        token: \${{ secrets.GH_TOKEN }}

    - name: 🖥️ Setup Windows VPS (TightVNC + noVNC + Cloudflare)
      shell: pwsh
      env:
        GH_TOKEN: \${{ secrets.GH_TOKEN }}
        REPO_FULL: ${repoFullName}
      run: |
        Set-StrictMode -Off
        $ErrorActionPreference = "Continue"

        # ── TightVNC ──────────────────────────────────────────
        Write-Host "📥 Descargando TightVNC..."
        $maxTries = 4
        for ($t = 1; $t -le $maxTries; $t++) {
          try {
            Invoke-WebRequest "https://www.tightvnc.com/download/2.8.63/tightvnc-2.8.63-gpl-setup-64bit.msi" -OutFile tightvnc.msi -TimeoutSec 90
            break
          } catch { if ($t -eq $maxTries) { throw } Start-Sleep 10 }
        }
        Start-Process msiexec.exe -Wait -ArgumentList '/i tightvnc.msi /quiet /norestart ADDLOCAL="Server" SERVER_REGISTER_AS_SERVICE=1 SERVER_ADD_FIREWALL_EXCEPTION=1 SET_USEVNCAUTHENTICATION=1 VALUE_OF_USEVNCAUTHENTICATION=1 SET_PASSWORD=1 VALUE_OF_PASSWORD=Vps2024! SET_ALLOWLOOPBACK=1 VALUE_OF_ALLOWLOOPBACK=1'
        Set-ItemProperty -Path "HKLM:\\SOFTWARE\\TightVNC\\Server" -Name "AllowLoopback" -Value 1 -EA SilentlyContinue
        Stop-Process -Name tvnserver -Force -EA SilentlyContinue
        Start-Sleep 5
        Start-Process "C:\\Program Files\\TightVNC\\tvnserver.exe" -ArgumentList "-run -localhost no" -WindowStyle Hidden
        Start-Sleep 35
        netsh advfirewall firewall add rule name="VNC5900" dir=in action=allow protocol=TCP localport=5900 | Out-Null
        netsh advfirewall firewall add rule name="noVNC6080" dir=in action=allow protocol=TCP localport=6080 | Out-Null
        Write-Host "✅ TightVNC listo en :5900"

        # ── Python + websockify + noVNC ───────────────────────
        Write-Host "📥 Instalando websockify + noVNC..."
        python -m pip install --upgrade pip --quiet
        for ($t = 1; $t -le 4; $t++) {
          try { pip install websockify==0.13.0 novnc --quiet; break }
          catch { Start-Sleep 8 }
        }
        $novncBase = python -c "import novnc, os; print(os.path.dirname(novnc.__file__))"
        Write-Host "noVNC base: $novncBase"
        Start-Process python -ArgumentList "-m websockify 6080 127.0.0.1:5900 --web $novncBase" -WindowStyle Hidden
        Start-Sleep 12

        # ── Cloudflared ───────────────────────────────────────
        Write-Host "📥 Instalando cloudflared..."
        for ($t = 1; $t -le 4; $t++) {
          try {
            Invoke-WebRequest "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile cloudflared.exe -TimeoutSec 90
            break
          } catch { Start-Sleep 10 }
        }
        Start-Process cloudflared.exe -ArgumentList "tunnel --url http://localhost:6080 --no-autoupdate --logfile cloudflared.log" -WindowStyle Hidden
        Start-Sleep 45

        # ── Obtener URL ───────────────────────────────────────
        $vncUrl = ""
        for ($i = 1; $i -le 120; $i++) {
          $log = Get-Content cloudflared.log -Raw -EA SilentlyContinue
          if ($log -match 'https://[a-zA-Z0-9-]+\\.trycloudflare\\.com') {
            $vncUrl = $Matches[0] + "/vnc.html?autoconnect=true&password=Vps2024!"
            break
          }
          Start-Sleep 3
        }

        if (-not $vncUrl) { Write-Host "❌ No se obtuvo URL de Cloudflare"; exit 1 }
        Write-Host "🌐 VNC URL: $vncUrl"

        # ── Publicar URL al repo (el APK la lee) ──────────────
        git config --global user.email "vps-bot@actions.github.com"
        git config --global user.name "VPS Bot"
        $vncUrl | Out-File vnc-url.txt -Encoding UTF8 -NoNewline
        $status = @{ url = $vncUrl; started = (Get-Date -Format 'o'); status = "running" } | ConvertTo-Json
        $status | Out-File vps-status.json -Encoding UTF8
        git add vnc-url.txt vps-status.json
        git commit -m "🌐 VPS online - $(Get-Date -Format 'HH:mm:ss')" --allow-empty
        git push origin main
        Write-Host "✅ URL publicada en el repo"

        # ── Bucle principal: 330 minutos ──────────────────────
        $totalMin  = 330
        $warnMin   = 315   # aviso a los 315 min (quedan 15)
        $saveMin   = 325   # guarda archivos a los 325 min
        $warned    = $false
        $saved     = $false

        for ($min = 1; $min -le $totalMin; $min++) {
          $ts = Get-Date -Format 'HH:mm:ss'
          Write-Host "🟢 Min $min/$totalMin  $ts"

          # Aviso de reinicio próximo (escribe flag al repo)
          if ($min -ge $warnMin -and -not $warned) {
            Write-Host "⚠️ Quedan $($totalMin - $min) minutos — avisando al APK..."
            @{ url = $vncUrl; status = "warning"; minutesLeft = ($totalMin - $min) } | ConvertTo-Json | Out-File vps-status.json -Encoding UTF8
            git add vps-status.json
            git commit -m "⚠️ VPS warning - quedan $($totalMin - $min) min" --allow-empty
            git push origin main
            $warned = $true
          }

          # Guardar archivos del usuario antes del corte
          if ($min -ge $saveMin -and -not $saved) {
            Write-Host "💾 Guardando archivos del usuario..."
            try {
              $userDirs = @("C:\\Users\\runneradmin\\Desktop","C:\\Users\\runneradmin\\Documents","C:\\Users\\runneradmin\\Downloads")
              foreach ($dir in $userDirs) {
                if (Test-Path $dir) {
                  $zipName = "backup_$(Split-Path $dir -Leaf).zip"
                  Compress-Archive -Path "$dir\\*" -DestinationPath $zipName -Force -EA SilentlyContinue
                  if (Test-Path $zipName) { git add $zipName }
                }
              }
              git commit -m "💾 Backup archivos usuario - $(Get-Date -Format 'yyyy-MM-dd HH:mm')" --allow-empty
              git push origin main
            } catch { Write-Host "⚠️ Backup parcial: $_" }
            $saved = $true
          }

          Start-Sleep 60
        }

        # ── Fin de sesión: marca offline, NO hace auto-restart ─
        Write-Host "⏹️ Sesión terminada. El APK puede iniciar una nueva sesión."
        @{ url = $vncUrl; status = "offline"; endedAt = (Get-Date -Format 'o') } | ConvertTo-Json | Out-File vps-status.json -Encoding UTF8
        git add vps-status.json
        git commit -m "⏹️ VPS offline - $(Get-Date -Format 'HH:mm:ss')" --allow-empty
        git push origin main
`;
}
