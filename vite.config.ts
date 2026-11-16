import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { testAndFetchBm, fetchWabaDetails, maskToken, encryptToken, decryptToken } from './metaBmService.js';

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

      // Persistência local para BMs conectadas na Meta
      const BM_STORAGE_FILE = path.join(import.meta.dirname, 'bm_storage.json');

      function loadDevBmStorage(): any[] {
        try {
          if (fs.existsSync(BM_STORAGE_FILE)) {
            const data = fs.readFileSync(BM_STORAGE_FILE, 'utf-8');
            const parsed = JSON.parse(data);
            if (Array.isArray(parsed)) return parsed;
          }
        } catch (e) {
          console.warn('[BM Storage] Erro ao carregar bm_storage.json:', e);
        }
        return [];
      }

      function saveDevBmStorage(list: any[]): void {
        try {
          fs.writeFileSync(BM_STORAGE_FILE, JSON.stringify(list, null, 2), 'utf-8');
        } catch (e) {
          console.warn('[BM Storage] Erro ao salvar bm_storage.json:', e);
        }
      }

      // Endpoint para listar templates da Infobip (BM do Luiz oficial) e BMs conectadas
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

          const LUIZ_HOST = process.env.INFOBIP_BASE_URL || '9kn66r.api-us.infobip.com';
          const LUIZ_KEY = process.env.INFOBIP_API_KEY || '';
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

          // C. Incluir templates de todas as BMs conectadas na Meta
          try {
            const connectedBms = loadDevBmStorage();
            connectedBms.forEach(c => {
              (c.dados?.wabas || []).forEach((w: any) => {
                const defaultSender = w.numeros?.[0]?.display_phone_number || '';
                (w.templates || []).forEach((t: any) => {
                  allTemplates.push({
                    id: t.id || t.name,
                    businessAccountId: w.id,
                    name: t.name,
                    language: t.language || 'pt_BR',
                    status: t.status,
                    category: t.category,
                    structure: { body: { text: t.bodyText || '' } },
                    components: t.components || [],
                    createdAt: new Date().toISOString(),
                    lastUpdatedAt: new Date().toISOString(),
                    _account: c.nome || 'BM Conectada',
                    _accountId: c.bm_id,
                    _sender: defaultSender,
                    _senderFormatted: defaultSender
                  });
                });
              });
            });
          } catch (bmTplErr) {
            console.warn('[MetaTemplates] Erro ao incorporar templates de BMs conectadas:', bmTplErr);
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

      // Dev middleware for /api/client-submissions (evita erro 502 no Vite dev quando backend 3000 não está ativo)
      const devSubmissionsList: any[] = [];

      server.middlewares.use((req, res, next) => {
        const rawUrl = req.url || '';
        if (rawUrl.startsWith('/api/client-submissions')) {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

          if (req.method === 'OPTIONS') {
            res.statusCode = 204;
            res.end();
            return;
          }

          if (req.method === 'GET') {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify(devSubmissionsList));
            return;
          }

          if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
              try {
                const parsed = JSON.parse(body || '{}');
                const newCard = {
                  id: Date.now(),
                  ...parsed,
                  status: parsed.status || 'GERADO',
                  origin: parsed.origin || 'TEMPLATE_CREATOR',
                  created_at: new Date().toISOString()
                };
                devSubmissionsList.unshift(newCard);
                res.statusCode = 201;
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.end(JSON.stringify(newCard));
              } catch (e: any) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: e.message }));
              }
            });
            return;
          }

          if (req.method === 'PUT' || req.method === 'DELETE') {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ success: true }));
            return;
          }
        }
        next();
      });

      // Dev middleware for /api/dispatch/queue/status (evita erro 502 no Vite dev quando Redis/Backend não está ativo)
      server.middlewares.use((req, res, next) => {
        const rawUrl = req.url || '';
        if (rawUrl.startsWith('/api/dispatch/queue/status')) {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ queueLength: 0, isRunning: false, processed: 0 }));
          return;
        }
        next();
      });

      // Dev middleware for /api/bm/* com integração REAL à Meta Graph API e persistência em bm_storage.json
      const devAquecimento = [
        { etapa: 'Conectada', meta_diaria: 50, o_que_fazer: 'Começar os primeiros envios, de forma gradual.' },
        { etapa: 'Aquecendo', meta_diaria: 250, o_que_fazer: 'Manter envio diário, com qualidade verde, até o limite subir.' },
        { etapa: 'Subindo limite', meta_diaria: 1000, o_que_fazer: 'Aumentar o volume aos poucos e vigiar a qualidade.' },
        { etapa: 'Escalando', meta_diaria: 5000, o_que_fazer: 'Operação em alta escala com monitoramento contínuo.' },
        { etapa: 'Matura', meta_diaria: 10000, o_que_fazer: 'BM estabelecida e estável para envios volumosos.' }
      ];

      server.middlewares.use((req, res, next) => {
        const rawUrl = req.url || '';
        if (rawUrl.startsWith('/api/bm/')) {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

          if (req.method === 'OPTIONS') {
            res.statusCode = 204;
            res.end();
            return;
          }

          if (rawUrl.startsWith('/api/bm/dados') && req.method === 'GET') {
            const conexoes = loadDevBmStorage();
            let totalNums = 0;
            let totalWabas = 0;
            let totalQualidadeBaixa = 0;
            let totalTemplates = 0;
            let totalTemplatesRejeitados = 0;
            let msgs = 0;
            let msgsEntregues = 0;
            let wabasNotificadas = 0;

            const alertas: any[] = [];

            conexoes.forEach(c => {
              const wabas = c.dados?.wabas || [];
              totalWabas += wabas.length;
              totalNums += c.dados?.totalNumeros || 0;
              totalQualidadeBaixa += c.dados?.numerosQualidadeBaixa || 0;
              totalTemplates += c.dados?.totalTemplates || 0;
              totalTemplatesRejeitados += c.dados?.templatesRejeitados || 0;
              msgs += c.dados?.msgs24hEnviadas || 0;
              msgsEntregues += c.dados?.msgs24hEntregues || 0;
              if (c.dados?.wabaNotificada) wabasNotificadas += 1;

              wabas.forEach((w: any) => {
                if (w.notificada) {
                  alertas.push({
                    id: `${c.bm_id}_${w.id}_res`,
                    bm_id: c.bm_id,
                    waba_id: w.id,
                    tipo: 'waba_restrita',
                    severidade: 'critico',
                    titulo: `WABA ${w.name || w.id} com restrição na Meta`,
                    mensagem: w.motivoNotificacao || 'A conta WABA possui notificação de revisão ou advertência na Meta.'
                  });
                }
                (w.numeros || []).forEach((n: any) => {
                  if (n.qualidadeBaixa) {
                    alertas.push({
                      id: `${c.bm_id}_${n.id}_qual`,
                      bm_id: c.bm_id,
                      waba_id: w.id,
                      phone_number_id: n.id,
                      tipo: 'qualidade_baixa',
                      severidade: n.quality_rating === 'RED' ? 'critico' : 'aviso',
                      titulo: `Qualidade baixa no número ${n.display_phone_number || n.id}`,
                      mensagem: `Rating atual: ${n.quality_rating}. Limite: ${n.messaging_limit_tier || 'TIER_250'}. Evite disparos em massa até a qualidade recuperar.`
                    });
                  }
                });
              });
            });

            const payload = {
              success: true,
              conexoes,
              aquecimentoConfig: devAquecimento,
              alertas,
              resumoGeral: {
                totalBms: conexoes.length,
                totalWabas,
                totalNumeros: totalNums,
                totalNumerosQualidadeBaixa: totalQualidadeBaixa,
                totalTemplates,
                totalTemplatesRejeitados,
                totalMsgs24hEnviadas: msgs,
                totalMsgs24hEntregues: msgsEntregues,
                totalWabasNotificadas: wabasNotificadas
              }
            };
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify(payload));
            return;
          }

          if (rawUrl.startsWith('/api/bm/conectar') && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', async () => {
              try {
                const parsed = JSON.parse(body || '{}');
                const cleanBmId = String(parsed.bm_id || '').trim();
                const cleanToken = String(parsed.token || '').trim();
                const cleanNome = String(parsed.nome || '').trim() || (`BM ${cleanBmId}`);
                const tipo = parsed.tipo || 'agencia';

                if (!cleanBmId || !cleanToken) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json; charset=utf-8');
                  res.end(JSON.stringify({
                    success: false,
                    error: 'ID da BM e Token do usuário do sistema são obrigatórios.'
                  }));
                  return;
                }

                // 1. VALIDAÇÃO REAL NA META GRAPH API (Se inválido, lança erro e REJEITA imediatamente)
                let metaResult;
                try {
                  metaResult = await testAndFetchBm(cleanBmId, cleanToken);
                } catch (metaErr: any) {
                  console.error('[BM Connect] Erro na validação da Meta:', metaErr.message);
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json; charset=utf-8');
                  res.end(JSON.stringify({
                    success: false,
                    error: metaErr.message || 'Falha ao autenticar com a Meta Graph API. Verifique o ID e o Token.'
                  }));
                  return;
                }

                const { bm: metaBm, wabas } = metaResult;

                // 2. Coletar telefones e templates de cada WABA em paralelo
                const wabasFull: any[] = await Promise.all(
                  wabas.map(async (w: any) => {
                    try {
                      const details = await fetchWabaDetails(w.id, cleanToken);
                      return {
                        ...w,
                        ...details
                      };
                    } catch (wErr: any) {
                      console.warn(`[BM Connect] Aviso ao buscar WABA ${w.id}:`, wErr.message);
                      return w;
                    }
                  })
                );

                // 3. Cálculos agregados reais
                const totalNumeros = wabasFull.reduce((acc, w) => acc + (w.numeros?.length || 0), 0);
                const numerosQualidadeBaixa = wabasFull.reduce((acc, w) => acc + (w.numeros?.filter((n: any) => n.qualidadeBaixa)?.length || 0), 0);
                const totalTemplates = wabasFull.reduce((acc, w) => acc + (w.templates?.length || 0), 0);
                const templatesRejeitados = wabasFull.reduce((acc, w) => acc + (w.templates?.filter((t: any) => t.status === 'REJECTED')?.length || 0), 0);
                const msgs24hEnviadas = wabasFull.reduce((acc, w) => acc + (w.msgs24h?.enviadas || 0), 0);
                const msgs24hEntregues = wabasFull.reduce((acc, w) => acc + (w.msgs24h?.entregues || 0), 0);
                const wabaNotificada = wabasFull.some(w => w.notificada);

                let etapaAquecimento = 'Conectada';
                if (totalNumeros === 0) {
                  etapaAquecimento = 'Conta sem número';
                } else if (msgs24hEnviadas > 0) {
                  etapaAquecimento = 'Já dispararam';
                } else {
                  etapaAquecimento = 'Com número';
                }

                const encryptedToken = encryptToken(cleanToken);
                const masked = maskToken(cleanToken);

                const newConn = {
                  id: Date.now(),
                  nome: cleanNome,
                  bm_id: cleanBmId,
                  tipo,
                  status: 'ativa',
                  token_cifrado: encryptedToken,
                  token_mascarado: masked,
                  ultima_verificacao: new Date().toISOString(),
                  dados: {
                    metaBm,
                    wabas: wabasFull,
                    totalNumeros,
                    numerosQualidadeBaixa,
                    totalTemplates,
                    templatesRejeitados,
                    msgs24hEnviadas,
                    msgs24hEntregues,
                    wabaNotificada,
                    etapaAquecimento,
                    lastSync: new Date().toISOString()
                  }
                };

                const currentList = loadDevBmStorage();
                const filtered = currentList.filter(c => c.bm_id !== cleanBmId);
                filtered.unshift(newConn);
                saveDevBmStorage(filtered);

                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.end(JSON.stringify({
                  success: true,
                  id: newConn.id,
                  totalNumeros,
                  totalTemplates,
                  message: `BM conectada com sucesso! ${totalNumeros} número(s) e ${totalTemplates} template(s) carregados da Meta.`
                }));
              } catch (e: any) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.end(JSON.stringify({ success: false, error: e.message || 'Erro inesperado ao conectar BM' }));
              }
            });
            return;
          }

          if (rawUrl.startsWith('/api/bm/sincronizar') && req.method === 'POST') {
            (async () => {
              try {
                const list = loadDevBmStorage();
                let updatedCount = 0;

                for (const conn of list) {
                  const token = decryptToken(conn.token_cifrado);
                  if (!token) continue;

                  try {
                    const { bm: metaBm, wabas } = await testAndFetchBm(conn.bm_id, token);
                    const wabasFull: any[] = await Promise.all(
                      wabas.map(async (w: any) => {
                        try {
                          const details = await fetchWabaDetails(w.id, token);
                          return { ...w, ...details };
                        } catch (_) {
                          return w;
                        }
                      })
                    );

                    const totalNumeros = wabasFull.reduce((acc, w) => acc + (w.numeros?.length || 0), 0);
                    const numerosQualidadeBaixa = wabasFull.reduce((acc, w) => acc + (w.numeros?.filter((n: any) => n.qualidadeBaixa)?.length || 0), 0);
                    const totalTemplates = wabasFull.reduce((acc, w) => acc + (w.templates?.length || 0), 0);
                    const templatesRejeitados = wabasFull.reduce((acc, w) => acc + (w.templates?.filter((t: any) => t.status === 'REJECTED')?.length || 0), 0);
                    const msgs24hEnviadas = wabasFull.reduce((acc, w) => acc + (w.msgs24h?.enviadas || 0), 0);
                    const msgs24hEntregues = wabasFull.reduce((acc, w) => acc + (w.msgs24h?.entregues || 0), 0);
                    const wabaNotificada = wabasFull.some(w => w.notificada);

                    conn.ultima_verificacao = new Date().toISOString();
                    conn.dados = {
                      metaBm,
                      wabas: wabasFull,
                      totalNumeros,
                      numerosQualidadeBaixa,
                      totalTemplates,
                      templatesRejeitados,
                      msgs24hEnviadas,
                      msgs24hEntregues,
                      wabaNotificada,
                      lastSync: new Date().toISOString()
                    };
                    updatedCount++;
                  } catch (syncErr: any) {
                    console.warn(`[BM Sync] Erro ao sincronizar BM ${conn.bm_id}:`, syncErr.message);
                  }
                }

                saveDevBmStorage(list);
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.end(JSON.stringify({ success: true, count: updatedCount }));
              } catch (e: any) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.end(JSON.stringify({ success: false, error: e.message }));
              }
            })();
            return;
          }

          if (rawUrl.startsWith('/api/bm/aquecimento-config') && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
              try {
                const parsed = JSON.parse(body || '{}');
                const found = devAquecimento.find(a => a.etapa === parsed.etapa);
                if (found) found.meta_diaria = Number(parsed.meta_diaria) || 0;
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.end(JSON.stringify({ success: true }));
              } catch (e: any) {
                res.statusCode = 400;
                res.end(JSON.stringify({ success: false, error: e.message }));
              }
            });
            return;
          }

          if (rawUrl.startsWith('/api/bm/conexoes/') && req.method === 'DELETE') {
            const parts = rawUrl.split('/');
            const id = Number(parts[parts.length - 1]);
            const list = loadDevBmStorage();
            const filtered = list.filter(c => c.id !== id);
            saveDevBmStorage(filtered);
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ success: true }));
            return;
          }

          if (rawUrl.includes('/resolver') && req.method === 'POST') {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ success: true }));
            return;
          }
        }
        next();
      });

      // Middleware de fallback para servir arquivos de /uploads no ambiente Vite dev
      server.middlewares.use((req, res, next) => {
        const rawUrl = req.url || '';
        if (rawUrl.startsWith('/uploads/')) {
          const filename = path.basename(rawUrl.split('?')[0]);
          const candidate1 = path.join(import.meta.dirname, 'uploads', filename);
          const candidate2 = path.join(import.meta.dirname, '..', 'uploads', filename);

          let filePath = '';
          if (fs.existsSync(candidate1)) {
            filePath = candidate1;
          } else if (fs.existsSync(candidate2)) {
            filePath = candidate2;
          }

          if (filePath) {
            const ext = path.extname(filePath).toLowerCase();
            const mimeTypes: Record<string, string> = {
              '.png': 'image/png',
              '.jpg': 'image/jpeg',
              '.jpeg': 'image/jpeg',
              '.gif': 'image/gif',
              '.webp': 'image/webp',
              '.svg': 'image/svg+xml',
              '.pdf': 'application/pdf',
              '.mp4': 'video/mp4'
            };
            const contentType = mimeTypes[ext] || 'application/octet-stream';
            res.setHeader('Content-Type', contentType);
            res.setHeader('Access-Control-Allow-Origin', '*');
            fs.createReadStream(filePath).pipe(res);
            return;
          }
        }
        next();
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), googleSheetsProxyPlugin()],
  server: {
    port: 5174,
    proxy: {
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false
      },
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false
      },
      '/infobip-proxy': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false
      }
    }
  }
});

