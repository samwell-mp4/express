import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import https from 'https';
import http from 'http';

const COLLABORATORS = [
  { name: 'Geraldo e Joyce', gid: '1891628336' },
  { name: 'Thiago', gid: '879953666' },
  { name: 'Ricardo', gid: '667662526' },
  { name: 'Gelton', gid: '1873785868' },
  { name: 'Gabriel.M', gid: '1737381979' },
  { name: 'Otavio', gid: '197007771' },
  { name: 'Ramon', gid: '1927928604' },
  { name: 'Anderson', gid: '1208062035' },
  { name: 'Bernardo', gid: '810544018' },
  { name: 'Lucas', gid: '108879898' },
  { name: 'Augusto', gid: '1913598537' },
  { name: 'Italo', gid: '923813990' },
  { name: 'Gabriel.A', gid: '1004352589' },
  { name: 'Samwell', gid: '29074140' }
];

const BASE_SHEET_KEY = '2PACX-1vSgMK4ZwR9PhuXaHAwlBbtbXM_bGsSThF7SLyn2by1ObgxZ14FNF1Lcednw87xAuA';

function fetchUrl(targetUrl: string, maxRedirects = 5): Promise<string> {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) return reject(new Error('Muitos redirecionamentos'));
    const client = targetUrl.startsWith('https') ? https : http;
    client.get(targetUrl, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (!redirectUrl.startsWith('http')) {
          const origin = new URL(targetUrl).origin;
          redirectUrl = new URL(redirectUrl, origin).toString();
        }
        return fetchUrl(redirectUrl, maxRedirects - 1).then(resolve).catch(reject);
      }
      let body = '';
      res.setEncoding('utf-8');
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });
}

const memoryCache = new Map<string, { time: number; data: string }>();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

function googleSheetsProxyPlugin(): Plugin {
  return {
    name: 'google-sheets-proxy',
    configureServer(server) {
      // Smart Link Shortener & Rotator Redirection Middleware (/r/:slug)
      server.middlewares.use((req, res, next) => {
        const rawUrl = req.url || '';
        if (rawUrl.startsWith('/r/')) {
          const slug = rawUrl.replace(/^\/r\//, '').split('?')[0];
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Redirecionando | Link Rotator PRO</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0B0F19; color: #F3F4F6; }
    .box { text-align: center; max-width: 440px; width: 90%; padding: 36px 28px; background: #111827; border: 1px solid #1F2937; border-radius: 12px; box-shadow: 0 20px 40px rgba(0,0,0,0.6); }
    .spinner { width: 36px; height: 36px; border: 3px solid #374151; border-top-color: #ACF800; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 20px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    h3 { margin: 0 0 10px; font-size: 17px; font-weight: 700; color: #F9FAFB; letter-spacing: -0.3px; }
    p { margin: 0; font-size: 13px; color: #9CA3AF; line-height: 1.5; }
    .err-btn { display: inline-block; margin-top: 20px; padding: 9px 18px; background: #1F2937; color: #ACF800; text-decoration: none; border-radius: 6px; font-size: 12px; font-weight: 600; border: 1px solid #374151; }
    .err-btn:hover { background: #374151; }
  </style>
</head>
<body>
  <div class="box" id="box">
    <div class="spinner"></div>
    <h3>Redirecionando...</h3>
    <p>Conectando você ao destino através do Link Rotator PRO.</p>
  </div>
  <script>
    (async function() {
      const slug = "${slug}".trim();
      const box = document.getElementById('box');
      
      // 1. Tentar API Backend (se online)
      try {
        const res = await fetch('/api/pro-links');
        if (res.ok) {
          const links = await res.json();
          if (Array.isArray(links)) {
            const found = links.find(l => (l.slug || '').toLowerCase() === slug.toLowerCase());
            if (found) {
              const rawTargets = typeof found.targets === 'string' ? JSON.parse(found.targets) : found.targets;
              if (rawTargets && rawTargets.length > 0) {
                const totalW = rawTargets.reduce((s, t) => s + (parseFloat(t.weight) || 1), 0);
                let rnd = Math.random() * totalW;
                let targetUrl = rawTargets[0].url;
                for (let i = 0; i < rawTargets.length; i++) {
                  rnd -= (parseFloat(rawTargets[i].weight) || 1);
                  if (rnd <= 0) { targetUrl = rawTargets[i].url; break; }
                }
                if (!/^https?:\\/\\//i.test(targetUrl)) targetUrl = 'https://' + targetUrl;
                window.location.replace(targetUrl);
                return;
              }
            }
          }
        }
      } catch(e) {}

      // 2. Fallback Armazenamento Local
      try {
        const local = JSON.parse(localStorage.getItem('plugesales_pro_rotators_v1') || '[]');
        const found = local.find(r => (r.slug || '').toLowerCase() === slug.toLowerCase());
        if (found && found.targets && found.targets.length > 0) {
          const totalW = found.targets.reduce((s, t) => s + (parseFloat(t.weight) || 1), 0);
          let rnd = Math.random() * totalW;
          let targetUrl = found.targets[0].url;
          let targetIdx = 0;
          for (let i = 0; i < found.targets.length; i++) {
            rnd -= (parseFloat(found.targets[i].weight) || 1);
            if (rnd <= 0) { targetUrl = found.targets[i].url; targetIdx = i; break; }
          }
          found.total_clicks = (found.total_clicks || 0) + 1;
          const statsKey = 'plugesales_pro_rotator_stats_' + found.id;
          const stats = JSON.parse(localStorage.getItem(statsKey) || '{"targets":[],"timeline":[],"recentClicks":[]}');
          const existingTargetStat = stats.targets.find(t => t.target_url === targetUrl);
          if (existingTargetStat) existingTargetStat.clicks++;
          else stats.targets.push({ target_index: targetIdx, target_url: targetUrl, clicks: 1 });
          const today = new Date().toISOString().split('T')[0];
          const todayTimeline = stats.timeline.find(d => d.date === today);
          if (todayTimeline) todayTimeline.clicks++;
          else stats.timeline.push({ date: today, clicks: 1 });
          stats.recentClicks.unshift({
            user_agent: navigator.userAgent,
            country: 'Local',
            city: 'N/A',
            timestamp: new Date().toISOString()
          });
          if (stats.recentClicks.length > 50) stats.recentClicks.length = 50;
          localStorage.setItem(statsKey, JSON.stringify(stats));
          localStorage.setItem('plugesales_pro_rotators_v1', JSON.stringify(local));

          if (!/^https?:\\/\\//i.test(targetUrl)) targetUrl = 'https://' + targetUrl;
          window.location.replace(targetUrl);
          return;
        }
      } catch(e) {}

      // 3. Não encontrado
      box.innerHTML = '<h3 style="color:#EF4444;font-size:18px;">Link não encontrado</h3><p style="margin-top:8px;">O link encurtado <b>/r/' + slug + '</b> não existe ou não possui destinos configurados.</p><a class="err-btn" href="/">Voltar ao Painel</a>';
    })();
  </script>
</body>
</html>`);
          return;
        }
        next();
      });

      server.middlewares.use('/api/bm-sheets', async (req, res) => {
        try {
          const urlObj = new URL(req.url || '', 'http://localhost');
          const gid = urlObj.searchParams.get('gid');
          const isAll = urlObj.searchParams.get('all') === 'true';

          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

          if (req.method === 'OPTIONS') {
            res.statusCode = 204;
            res.end();
            return;
          }

          if (isAll) {
            const cacheKey = 'all_collaborators';
            const cached = memoryCache.get(cacheKey);
            const now = Date.now();
            if (cached && (now - cached.time < CACHE_TTL_MS)) {
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(cached.data);
              return;
            }

            const results = await Promise.all(
              COLLABORATORS.map(async (collab) => {
                const sheetUrl = `https://docs.google.com/spreadsheets/d/e/${BASE_SHEET_KEY}/pub?gid=${collab.gid}&single=true&output=csv`;
                try {
                  const csv = await fetchUrl(sheetUrl);
                  return { name: collab.name, gid: collab.gid, csv, success: true };
                } catch (err: any) {
                  return { name: collab.name, gid: collab.gid, csv: '', success: false, error: err.message };
                }
              })
            );

            const jsonResponse = JSON.stringify({
              success: true,
              timestamp: new Date().toISOString(),
              sheets: results
            });

            memoryCache.set(cacheKey, { time: now, data: jsonResponse });
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(jsonResponse);
            return;
          }

          if (gid) {
            const cacheKey = `gid_${gid}`;
            const cached = memoryCache.get(cacheKey);
            const now = Date.now();
            if (cached && (now - cached.time < CACHE_TTL_MS)) {
              res.setHeader('Content-Type', 'text/csv; charset=utf-8');
              res.end(cached.data);
              return;
            }

            const sheetUrl = `https://docs.google.com/spreadsheets/d/e/${BASE_SHEET_KEY}/pub?gid=${gid}&single=true&output=csv`;
            const csv = await fetchUrl(sheetUrl);

            memoryCache.set(cacheKey, { time: now, data: csv });
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.end(csv);
            return;
          }

          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Parâmetro gid ou all=true obrigatório' }));
        } catch (error: any) {
          console.error('[GoogleSheetsProxy Error]:', error);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: error.message || 'Falha ao buscar dados do Google Sheets' }));
        }
      });

      // Endpoint para listar templates da Infobip (BM do Luiz oficial)
      server.middlewares.use('/api/meta-templates', async (req, res) => {
        try {
          const urlObj = new URL(req.url || '', 'http://localhost');
          const sinceParam = urlObj.searchParams.get('since') || '2026-09-21T00:00:00Z';
          const forceRefresh = urlObj.searchParams.get('force') === 'true';
          const senderParam = urlObj.searchParams.get('sender') || '';
          const knownSendersParam = urlObj.searchParams.get('knownSenders') || '';

          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

          if (req.method === 'OPTIONS') {
            res.statusCode = 204;
            res.end();
            return;
          }

          const LUIZ_HOST = '9kn66r.api-us.infobip.com';
          const LUIZ_KEY = 'a20edbf816d727811c324791316af20b-56e251b9-66f6-4f75-b461-e9006d123473';
          const LUIS_HOST = LUIZ_HOST;
          const LUIS_KEY = LUIZ_KEY;

          const getJson = (host: string, path: string, key: string): Promise<any> => {
            return new Promise((resolve) => {
              const r = https.request({
                hostname: host,
                path,
                method: 'GET',
                headers: {
                  'Authorization': `App ${key}`,
                  'Accept': 'application/json'
                }
              }, (resp) => {
                let d = '';
                resp.on('data', c => d += c);
                resp.on('end', () => {
                  try { resolve(JSON.parse(d)); } catch { resolve({}); }
                });
              });
              r.on('error', () => resolve({}));
              r.setTimeout(12000, () => { r.destroy(); resolve({}); });
              r.end();
            });
          };

          // 1. CASO ESPECÍFICO: Busca filtrada por Número Remetente WhatsApp (ex: +1 555-932-1381)
          if (senderParam.trim()) {
            const raw = senderParam.replace(/\D/g, '');
            const cacheKey = `meta_templates_sender_${raw}`;
            const cached = memoryCache.get(cacheKey);
            const now = Date.now();
            if (!forceRefresh && cached && (now - cached.time < CACHE_TTL_MS)) {
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(cached.data);
              return;
            }

            const candidateNumbers = new Set<string>();
            candidateNumbers.add(raw);
            if (raw.length === 10 || raw.length === 11) candidateNumbers.add('55' + raw);
            if (raw.length === 13 && raw.startsWith('55')) candidateNumbers.add(raw.slice(0, 4) + raw.slice(5));
            if (raw.length === 12 && raw.startsWith('55')) candidateNumbers.add(raw.slice(0, 4) + '9' + raw.slice(4));

            let matchedTemplates: any[] = [];
            let matchedNumber = raw;

            for (const num of candidateNumbers) {
              const directRes = await getJson(LUIZ_HOST, `/whatsapp/2/senders/${num}/templates`, LUIS_KEY);
              if (directRes && Array.isArray(directRes.templates) && directRes.templates.length > 0) {
                const formattedNum = num === '15559321381' ? '+1 555-932-1381' : (num.startsWith('55') ? `+${num}` : num);
                matchedTemplates = directRes.templates.map((t: any) => ({
                  id: t.id || t.name,
                  businessAccountId: t.businessAccountId,
                  name: t.name,
                  language: t.language || 'pt_BR',
                  status: t.status,
                  category: t.category,
                  structure: t.structure,
                  createdAt: t.createdAt,
                  lastUpdatedAt: t.lastUpdatedAt,
                  _account: 'BM do Luiz',
                  _accountId: 'luiz',
                  _sender: num,
                  _senderFormatted: formattedNum
                }));
                matchedNumber = num;
                break;
              }
            }

            const responseData = JSON.stringify({
              success: true,
              sender: matchedNumber,
              count: matchedTemplates.length,
              templates: matchedTemplates,
              timestamp: new Date().toISOString()
            });

            memoryCache.set(cacheKey, { time: now, data: responseData });
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(responseData);
            return;
          }

          // 2. CASO GERAL: Lista geral com templates recentes + senders ativos conhecidos
          const cacheKey = `meta_templates_general_${sinceParam}`;
          const cached = memoryCache.get(cacheKey);
          const now = Date.now();
          if (!forceRefresh && cached && (now - cached.time < CACHE_TTL_MS)) {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(cached.data);
            return;
          }

          const cutoffMs = new Date(sinceParam).getTime();
          const allTemplates: any[] = [];

          // Lista de remetentes ativos na BM do Luiz para consultar diretamente
          const activeSenders = new Set<string>(['15559321381', '5511925399038']);
          if (knownSendersParam) {
            knownSendersParam.split(',').forEach(s => {
              const clean = s.replace(/\D/g, '');
              if (clean.length >= 8) activeSenders.add(clean);
            });
          }

          // A. Buscar templates por remetente ativo
          await Promise.all(Array.from(activeSenders).map(async (senderNum) => {
            try {
              const sRes = await getJson(LUIZ_HOST, `/whatsapp/2/senders/${senderNum}/templates`, LUIS_KEY);
              if (sRes && Array.isArray(sRes.templates)) {
                const formattedNum = senderNum === '15559321381' ? '+1 555-932-1381' : (senderNum.startsWith('55') ? `+${senderNum}` : senderNum);
                for (const t of sRes.templates) {
                  allTemplates.push({
                    id: t.id || t.name,
                    businessAccountId: t.businessAccountId,
                    name: t.name,
                    language: t.language || 'pt_BR',
                    status: t.status,
                    category: t.category,
                    structure: t.structure,
                    createdAt: t.createdAt,
                    lastUpdatedAt: t.lastUpdatedAt,
                    _account: 'BM do Luiz',
                    _accountId: 'luiz',
                    _sender: senderNum,
                    _senderFormatted: formattedNum
                  });
                }
              }
            } catch (err) {
              console.warn(`[MetaTemplates] Erro ao buscar templates do sender ${senderNum}:`, err);
            }
          }));

          // B. Buscar templates gerais da conta /whatsapp/1/templates
          try {
            const init = await getJson(LUIZ_HOST, '/whatsapp/1/templates?page=0&size=100', LUIS_KEY);
            if (init.paging && init.paging.totalPages) {
              const totalPages = init.paging.totalPages;
              const pagesToFetch: number[] = [0];
              for (let p = Math.max(1, totalPages - 4); p < totalPages; p++) {
                pagesToFetch.push(p);
              }

              const pagesResults = await Promise.all(
                pagesToFetch.map(p => getJson(LUIZ_HOST, `/whatsapp/1/templates?page=${p}&size=100`, LUIS_KEY))
              );

              for (const pageRes of pagesResults) {
                const results = pageRes.results || [];
                for (const t of results) {
                  const itemDate = new Date(t.lastUpdatedAt || t.createdAt || 0).getTime();
                  if (itemDate >= cutoffMs) {
                    allTemplates.push({
                      ...t,
                      _account: 'BM do Luiz',
                      _accountId: 'luiz'
                    });
                  }
                }
              }
            }
          } catch (accErr) {
            console.warn('[MetaTemplates] Erro ao carregar templates gerais da BM do Luiz:', accErr);
          }

          // Ordenar por data decrescente (mais recentes primeiro)
          allTemplates.sort((a, b) => {
            const timeA = new Date(a.lastUpdatedAt || a.createdAt || 0).getTime();
            const timeB = new Date(b.lastUpdatedAt || b.createdAt || 0).getTime();
            return timeB - timeA;
          });

          // Remover duplicatas por nome do template
          const uniqueMap = new Map<string, any>();
          for (const item of allTemplates) {
            const key = item.name || item.id;
            if (!uniqueMap.has(key)) {
              uniqueMap.set(key, item);
            } else {
              // Se o item existente não tem _sender mas o novo tem, enriquecer
              const existing = uniqueMap.get(key);
              if (!existing._sender && item._sender) {
                existing._sender = item._sender;
                existing._senderFormatted = item._senderFormatted;
              }
            }
          }
          const deduplicated = Array.from(uniqueMap.values());

          const responseData = JSON.stringify({
            success: true,
            since: sinceParam,
            count: deduplicated.length,
            templates: deduplicated,
            timestamp: new Date().toISOString()
          });

          memoryCache.set(cacheKey, { time: now, data: responseData });
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(responseData);
        } catch (error: any) {
          console.error('[MetaTemplates Error]:', error);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: error.message || 'Falha ao buscar templates Meta' }));
        }
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), googleSheetsProxyPlugin()],
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false
      },
      '/infobip-proxy': {
        target: 'https://9kn66r.api-us.infobip.com',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/infobip-proxy/, ''),
        headers: {
          'Authorization': 'App a20edbf816d727811c324791316af20b-56e251b9-66f6-4f75-b461-e9006d123473'
        }
      }
    }
  }
});
