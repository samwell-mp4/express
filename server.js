import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const DIST_DIR = path.join(__dirname, 'dist');

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

const LUIZ_HOST = '4k3e4p.api-us.infobip.com';
const LUIZ_KEY = '35a1621fff9a97453d02b0dbe043467e-9501a6c3-3289-4fb9-90b4-d16b18b48d47';

const memoryCache = new Map();
const CACHE_TTL_MS = 60 * 1000;

function fetchUrl(targetUrl, maxRedirects = 5) {
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

function getJson(host, reqPath, key) {
  return new Promise((resolve) => {
    const r = https.request({
      hostname: host,
      path: reqPath,
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
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;

  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  // 1. Endpoint /api/bm-sheets
  if (pathname === '/api/bm-sheets') {
    try {
      const gid = urlObj.searchParams.get('gid');
      const isAll = urlObj.searchParams.get('all') === 'true';

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
            } catch (err) {
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
      return;
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err.message || 'Falha ao buscar dados do Google Sheets' }));
      return;
    }
  }

  // 2. Endpoint /api/meta-templates
  if (pathname === '/api/meta-templates') {
    try {
      const sinceParam = urlObj.searchParams.get('since') || '2026-09-21T00:00:00Z';
      const forceRefresh = urlObj.searchParams.get('force') === 'true';
      const senderParam = urlObj.searchParams.get('sender') || '';
      const knownSendersParam = urlObj.searchParams.get('knownSenders') || '';

      // Busca direta por remetente específico
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

        const candidateNumbers = new Set();
        candidateNumbers.add(raw);
        if (raw.length === 10 || raw.length === 11) candidateNumbers.add('55' + raw);
        if (raw.length === 13 && raw.startsWith('55')) candidateNumbers.add(raw.slice(0, 4) + raw.slice(5));
        if (raw.length === 12 && raw.startsWith('55')) candidateNumbers.add(raw.slice(0, 4) + '9' + raw.slice(4));

        let matchedTemplates = [];
        let matchedNumber = raw;

        for (const num of candidateNumbers) {
          const directRes = await getJson(LUIZ_HOST, `/whatsapp/2/senders/${num}/templates`, LUIZ_KEY);
          if (directRes && Array.isArray(directRes.templates) && directRes.templates.length > 0) {
            const formattedNum = num === '15559321381' ? '+1 555-932-1381' : (num.startsWith('55') ? `+${num}` : num);
            matchedTemplates = directRes.templates.map(t => ({
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

      // Caso Geral: Lista geral recente
      const cacheKey = `meta_templates_general_${sinceParam}`;
      const cached = memoryCache.get(cacheKey);
      const now = Date.now();
      if (!forceRefresh && cached && (now - cached.time < CACHE_TTL_MS)) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(cached.data);
        return;
      }

      const cutoffMs = new Date(sinceParam).getTime();
      const allTemplates = [];

      const activeSenders = new Set(['15559321381', '5511925399038']);
      if (knownSendersParam) {
        knownSendersParam.split(',').forEach(s => {
          const clean = s.replace(/\D/g, '');
          if (clean.length >= 8) activeSenders.add(clean);
        });
      }

      // Templates de remetentes ativos
      await Promise.all(Array.from(activeSenders).map(async (senderNum) => {
        try {
          const sRes = await getJson(LUIZ_HOST, `/whatsapp/2/senders/${senderNum}/templates`, LUIZ_KEY);
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
        } catch (e) {
          console.warn(`[Server] Erro no remetente ${senderNum}:`, e);
        }
      }));

      // Templates gerais da conta
      try {
        const init = await getJson(LUIZ_HOST, '/whatsapp/1/templates?page=0&size=100', LUIZ_KEY);
        if (init.paging && init.paging.totalPages) {
          const totalPages = init.paging.totalPages;
          const pagesToFetch = [0];
          for (let p = Math.max(1, totalPages - 4); p < totalPages; p++) {
            pagesToFetch.push(p);
          }
          const pagesResults = await Promise.all(
            pagesToFetch.map(p => getJson(LUIZ_HOST, `/whatsapp/1/templates?page=${p}&size=100`, LUIZ_KEY))
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
      } catch (e) {
        console.warn('[Server] Erro em templates gerais:', e);
      }

      // Ordenar por data
      allTemplates.sort((a, b) => {
        const timeA = new Date(a.lastUpdatedAt || a.createdAt || 0).getTime();
        const timeB = new Date(b.lastUpdatedAt || b.createdAt || 0).getTime();
        return timeB - timeA;
      });

      // Deduplicar
      const uniqueMap = new Map();
      for (const item of allTemplates) {
        const key = item.name || item.id;
        if (!uniqueMap.has(key)) {
          uniqueMap.set(key, item);
        } else {
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
      return;
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err.message || 'Falha ao buscar templates Meta' }));
      return;
    }
  }

  // 3. Proxy /infobip-proxy/*
  if (pathname.startsWith('/infobip-proxy/')) {
    const targetPath = pathname.replace('/infobip-proxy', '') + urlObj.search;
    const proxyReq = https.request({
      hostname: LUIZ_HOST,
      path: targetPath,
      method: req.method,
      headers: {
        ...req.headers,
        host: LUIZ_HOST
      }
    }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
      proxyRes.pipe(res);
    });
    proxyReq.on('error', (err) => {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: `Proxy error: ${err.message}` }));
    });
    req.pipe(proxyReq);
    return;
  }

  // 4. Servir arquivos estáticos do diretório ./dist
  let filePath = path.join(DIST_DIR, pathname);
  if (pathname === '/' || !path.extname(pathname)) {
    // Se for rota SPA ou raiz, verificar se existe arquivo exato, senão servir index.html
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      // Arquivo existe
    } else {
      filePath = path.join(DIST_DIR, 'index.html');
    }
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    if (ext !== '.html') {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      res.setHeader('Cache-Control', 'no-cache');
    }
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  } else {
    // Fallback final para SPA
    const indexPath = path.join(DIST_DIR, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      fs.createReadStream(indexPath).pipe(res);
    } else {
      res.statusCode = 404;
      res.end('404 Not Found (Execute "npm run build" primeiro)');
    }
  }
});

server.listen(PORT, () => {
  console.log(`[Express-Dispatch App] Servidor de produção ativo na porta ${PORT}`);
  console.log(`[Express-Dispatch App] Servindo frontend a partir de: ${DIST_DIR}`);
});
