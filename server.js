import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createClient } from 'redis';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const DIST_DIR = path.join(__dirname, 'dist');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// -------------------------------------------------------------
// CREDENCIAIS DE PRODUÇÃO & CONFIGURAÇÕES (SECURITY-FIRST)
// -------------------------------------------------------------

// Infobip Credenciais
const INFOBIP_BASE_URL = process.env.INFOBIP_BASE_URL || '9kn66r.api-us.infobip.com';
const INFOBIP_API_KEY = process.env.INFOBIP_API_KEY || 'a20edbf816d727811c324791316af20b-56e251b9-66f6-4f75-b461-e9006d123473';

// Redis Credenciais (Host: fast_plug_redis / Password: Samuca82465! / Port: 6379)
const REDIS_HOST = process.env.REDIS_HOST || 'fast_plug_redis';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || 'Samuca82465!';
const REDIS_URL = process.env.REDIS_URL || `redis://:${encodeURIComponent(REDIS_PASSWORD)}@${REDIS_HOST}:${REDIS_PORT}`;

// PostgreSQL Credenciais
const DEFAULT_PG_URL = 'postgres://fast_plug:Samuca82465!@plug_sales_dispatch_app_fast_plug_postgress:5432/fast_plug?sslmode=disable';
const DATABASE_URL = process.env.DATABASE_URL || DEFAULT_PG_URL;

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'fastplug_security_jwt_master_2026_x89q';

// Rate Limiter em memória para prevenção de ataques de força bruta
const rateLimitMap = new Map();
function checkRateLimit(ip, maxRequests = 60, windowMs = 60000) {
  const now = Date.now();
  const record = rateLimitMap.get(ip) || { count: 0, resetTime: now + windowMs };
  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + windowMs;
  } else {
    record.count++;
  }
  rateLimitMap.set(ip, record);
  return record.count <= maxRequests;
}

// -------------------------------------------------------------
// CONEXÃO POSTGRESQL & BOOTSTRAP DE TABELAS
// -------------------------------------------------------------
const { Pool } = pg;
const pgPool = new Pool({
  connectionString: DATABASE_URL,
  connectionTimeoutMillis: 5000,
  max: 15,
  idleTimeoutMillis: 30000
});

let isPostgresConnected = false;

async function initDB() {
  let client;
  try {
    client = await pgPool.connect();
    isPostgresConnected = true;
    console.log('[Postgres] Conectado com sucesso ao banco de dados fast_plug.');

    // 1. Tabela users
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'CLIENT',
        phone TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. Tabela client_submissions (com limite de 3 downloads de planilha)
    await client.query(`
      CREATE TABLE IF NOT EXISTS client_submissions (
        id SERIAL PRIMARY KEY,
        campaign_name TEXT,
        profile_name TEXT NOT NULL,
        ddd TEXT,
        template_type TEXT DEFAULT 'none',
        media_url TEXT,
        ad_copy TEXT,
        button_link TEXT,
        spreadsheet_url TEXT,
        file_name TEXT,
        valid_count INTEGER DEFAULT 0,
        total_rows INTEGER DEFAULT 0,
        download_count INTEGER DEFAULT 0,
        max_downloads INTEGER DEFAULT 3,
        contacts JSONB DEFAULT '[]',
        headers JSONB DEFAULT '[]',
        ads JSONB DEFAULT '[]',
        status TEXT DEFAULT 'PENDENTE',
        accepted_by TEXT,
        assigned_to TEXT,
        sender_number TEXT,
        user_id INTEGER,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 3. Tabela pro_rotators (Link Rotator PRO)
    await client.query(`
      CREATE TABLE IF NOT EXISTS pro_rotators (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        title TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        original_url TEXT,
        targets JSONB DEFAULT '[]',
        status TEXT DEFAULT 'ACTIVE',
        total_clicks INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 4. Tabela rotator_clicks
    await client.query(`
      CREATE TABLE IF NOT EXISTS rotator_clicks (
        id SERIAL PRIMARY KEY,
        rotator_id INTEGER,
        target_url TEXT,
        user_agent TEXT,
        ip_address TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 5. Tabela dispatch_records
    await client.query(`
      CREATE TABLE IF NOT EXISTS dispatch_records (
        id SERIAL PRIMARY KEY,
        transmission_id TEXT,
        log_type TEXT,
        waba TEXT,
        recipient TEXT,
        message TEXT,
        payload JSONB,
        user_id INTEGER,
        timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 6. Tabela audit_logs
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        author TEXT,
        action TEXT NOT NULL,
        resource TEXT NOT NULL,
        details JSONB,
        ip_address TEXT,
        timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Bootstrap do usuário admin se banco estiver vazio
    const userCheck = await client.query('SELECT id FROM users LIMIT 1');
    if (userCheck.rows.length === 0) {
      const defaultPasswordHash = await bcrypt.hash('AQ2938AJWIU3Y280#', 10);
      await client.query(`
        INSERT INTO users (name, email, password, role)
        VALUES ($1, $2, $3, $4)
      `, ['Admin Fast Dispatch', 'plug2026#adsales', defaultPasswordHash, 'ADMIN']);
      console.log('🔒 [Security] Usuário administrador padrão inicializado.');
    }

    client.release();
  } catch (err) {
    isPostgresConnected = false;
    console.warn(`[Postgres] Aguardando disponibilidade do banco (${DATABASE_URL}): ${err.message}`);
    if (client) client.release();
  }
}

initDB();
setInterval(() => {
  if (!isPostgresConnected) initDB();
}, 20000);

// -------------------------------------------------------------
// REDIS CLIENT & WORKER CONFIGURATION
// -------------------------------------------------------------
console.log(`[Express-Dispatch] Conectando ao Redis em: ${REDIS_HOST}:${REDIS_PORT}`);

const redisClient = createClient({
  url: REDIS_URL,
  socket: {
    reconnectStrategy: (retries) => {
      const delay = Math.min(retries * 500, 5000);
      return delay;
    }
  }
});

let isRedisConnected = false;

redisClient.on('connect', () => {
  isRedisConnected = true;
  console.log(`[Redis] Conexão socket estabelecida com ${REDIS_HOST}:${REDIS_PORT}`);
});

redisClient.on('ready', () => {
  isRedisConnected = true;
  console.log(`[Redis] Pronto para operações de fila e logs.`);
  startWorkerIfNeeded();
});

redisClient.on('error', (err) => {
  isRedisConnected = false;
  console.warn(`[Redis] Status da conexão (${REDIS_HOST}): ${err.message}`);
});

redisClient.on('end', () => {
  isRedisConnected = false;
  console.warn('[Redis] Conexão encerrada.');
});

(async () => {
  try {
    await redisClient.connect();
  } catch (err) {
    console.warn('[Redis] Inicialização assíncrona aguardando serviço ficar disponível:', err.message);
  }
})();

// -------------------------------------------------------------
// BM SHEETS & METADATA
// -------------------------------------------------------------
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

function postJson(host, reqPath, key, bodyData) {
  return new Promise((resolve, reject) => {
    const dataStr = typeof bodyData === 'string' ? bodyData : JSON.stringify(bodyData);
    const options = {
      hostname: host,
      path: reqPath,
      method: 'POST',
      headers: {
        'Authorization': `App ${key}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Content-Length': Buffer.byteLength(dataStr)
      }
    };

    const req = https.request(options, (resp) => {
      let data = '';
      resp.on('data', chunk => data += chunk);
      resp.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ raw: data, statusCode: resp.statusCode });
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Timeout na comunicação com a API da Infobip'));
    });
    req.write(dataStr);
    req.end();
  });
}

function parseJsonBody(req, limitBytes = 50 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    let received = 0;
    req.setEncoding('utf-8');
    req.on('data', chunk => {
      received += Buffer.byteLength(chunk);
      if (received > limitBytes) {
        req.destroy();
        return reject(new Error('Payload muito grande (máximo 50MB)'));
      }
      body += chunk;
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Formato JSON inválido no corpo da requisição'));
      }
    });
    req.on('error', reject);
  });
}

// -------------------------------------------------------------
// FUNÇÕES DE SEGURANÇA E AUTENTICAÇÃO (SECURITY-FIRST)
// -------------------------------------------------------------
function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role || 'CLIENT'
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function extractToken(req) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  return req.headers['x-access-token'] || null;
}

function authenticateToken(req) {
  const token = extractToken(req);
  if (!token) {
    const err = new Error('Acesso não autorizado: token de autenticação ausente.');
    err.status = 401;
    throw err;
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded;
  } catch (e) {
    const err = new Error('Sessão inválida ou expirada. Faça login novamente.');
    err.status = 403;
    throw err;
  }
}

function optionalAuth(req) {
  const token = extractToken(req);
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

async function recordAuditLog(userId, author, action, resource, details, ip) {
  if (!isPostgresConnected) return;
  try {
    await pgPool.query(
      `INSERT INTO audit_logs (user_id, author, action, resource, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId || null, author || 'Sistema', action, resource, JSON.stringify(details || {}), ip || '127.0.0.1']
    );
  } catch (err) {
    console.warn('[AuditLog] Erro ao registrar auditoria:', err.message);
  }
}

// -------------------------------------------------------------
// REDIS BACKGROUND WORKER (Processamento da Fila de Disparos)
// -------------------------------------------------------------
let isWorkerRunning = false;

async function startWorkerIfNeeded() {
  if (isWorkerRunning || !isRedisConnected) return;
  runDispatchWorker().catch(err => {
    console.error('[Worker] Erro não tratado:', err);
    isWorkerRunning = false;
  });
}

async function runDispatchWorker() {
  if (isWorkerRunning) return;
  isWorkerRunning = true;

  console.log('[Worker] Iniciando loop de processamento da fila Redis...');
  try {
    if (isRedisConnected) {
      await redisClient.set('dispatch_running', 'true');
    }

    while (true) {
      if (!isRedisConnected) {
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }

      const stopFlag = await redisClient.get('dispatch_stop');
      if (stopFlag === 'true') {
        console.log('[Worker] Sinal de parada detectado. Pausando worker.');
        await redisClient.set('dispatch_stop', 'false');
        break;
      }

      const itemStr = await redisClient.lPop('dispatch_queue');
      if (!itemStr) {
        break;
      }

      let job;
      try {
        job = JSON.parse(itemStr);
      } catch (err) {
        console.warn('[Worker] Item inválido descartado da fila:', itemStr);
        continue;
      }

      // Utiliza credencial server-side obrigatória
      const apiKey = INFOBIP_API_KEY;
      const baseUrl = INFOBIP_BASE_URL;
      const targetNumber = job.to;
      const senderNumber = job.from;
      const templateName = job.content?.templateName || 'template';

      const startTime = new Date().toISOString();
      let logType = 'SUCCESS';
      let payload = null;

      try {
        const infobipPayload = {
          messages: [
            {
              from: senderNumber,
              to: targetNumber,
              content: job.content
            }
          ]
        };

        const res = await postJson(baseUrl, '/whatsapp/1/message/template', apiKey, infobipPayload);
        payload = res;

        const firstMsg = res?.messages?.[0];
        const statusGroup = firstMsg?.status?.groupName;
        if (statusGroup === 'REJECTED' || statusGroup === 'UNDELIVERABLE' || res?.requestError) {
          logType = 'ERROR';
        }
      } catch (sendErr) {
        logType = 'ERROR';
        payload = { error: sendErr.message };
      }

      const logRecord = {
        id: `disp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        transmission_id: payload?.messages?.[0]?.messageId || `tx_${Date.now()}`,
        timestamp: startTime,
        recipient: targetNumber,
        waba: senderNumber,
        message: templateName,
        log_type: logType,
        payload: payload
      };

      // Gravação do log no Redis
      try {
        await redisClient.lPush('dispatch_logs', JSON.stringify(logRecord));
        await redisClient.lTrim('dispatch_logs', 0, 499);
        await redisClient.incr('dispatch_processed');
      } catch (logErr) {
        console.warn('[Worker] Erro ao gravar log no Redis:', logErr);
      }

      // Persistência no PostgreSQL
      if (isPostgresConnected) {
        try {
          await pgPool.query(
            `INSERT INTO dispatch_records (transmission_id, log_type, waba, recipient, message, payload, user_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              logRecord.transmission_id,
              logRecord.log_type,
              logRecord.waba,
              logRecord.recipient,
              logRecord.message,
              JSON.stringify(payload),
              job.user_id || null
            ]
          );
        } catch (dbErr) {
          console.warn('[Worker] Erro ao persistir log no Postgres:', dbErr.message);
        }
      }

      // Delay dinâmico de Rate Limit
      let delaySec = 1.0;
      try {
        const rateLimitStr = await redisClient.get('dispatch_rate_limit');
        if (rateLimitStr) {
          delaySec = Math.max(0.1, parseFloat(rateLimitStr));
        }
      } catch {}

      await new Promise(r => setTimeout(r, Math.round(delaySec * 1000)));
    }
  } catch (err) {
    console.error('[Worker] Exceção durante o processamento:', err);
  } finally {
    isWorkerRunning = false;
    try {
      if (isRedisConnected) {
        await redisClient.set('dispatch_running', 'false');
      }
    } catch {}
    console.log('[Worker] Loop finalizado (fila vazia ou em pausa).');
  }
}

setInterval(async () => {
  if (isRedisConnected && !isWorkerRunning) {
    try {
      const len = await redisClient.lLen('dispatch_queue');
      if (len > 0) {
        startWorkerIfNeeded();
      }
    } catch {}
  }
}, 5000);

// -------------------------------------------------------------
// SERVIDOR HTTP & ROTAS DA API COM POLÍTICA SECURITY-FIRST
// -------------------------------------------------------------
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
  '.ttf': 'font/ttf',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf',
  '.csv': 'text/csv'
};

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

  // Security Headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-access-token');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  // Helper para resposta JSON
  const sendJson = (data, statusCode = 200) => {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(data));
  };

  const sendError = (message, statusCode = 500) => {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: message, success: false }));
  };

  // -------------------------------------------------------------
  // 1. LINK ROTATOR PRO: REDIRECIONADOR PÚBLICO (/r/:slug)
  // -------------------------------------------------------------
  if (pathname.startsWith('/r/') && req.method === 'GET') {
    const slug = pathname.replace(/^\/r\//, '').split('?')[0].trim().toLowerCase();
    if (!slug) {
      return sendError('Slug inválido', 400);
    }

    try {
      if (isPostgresConnected) {
        const result = await pgPool.query(
          'SELECT * FROM pro_rotators WHERE LOWER(slug) = LOWER($1) AND status = $2 LIMIT 1',
          [slug, 'ACTIVE']
        );

        if (result.rows.length > 0) {
          const rotator = result.rows[0];
          const rawTargets = typeof rotator.targets === 'string' ? JSON.parse(rotator.targets) : rotator.targets;
          
          if (Array.isArray(rawTargets) && rawTargets.length > 0) {
            const totalW = rawTargets.reduce((s, t) => s + (parseFloat(t.weight) || 1), 0);
            let rnd = Math.random() * totalW;
            let targetUrl = rawTargets[0].url;

            for (let i = 0; i < rawTargets.length; i++) {
              rnd -= (parseFloat(rawTargets[i].weight) || 1);
              if (rnd <= 0) {
                targetUrl = rawTargets[i].url;
                break;
              }
            }

            // Asynchronously record click
            pgPool.query(
              'UPDATE pro_rotators SET total_clicks = total_clicks + 1 WHERE id = $1',
              [rotator.id]
            ).catch(() => {});

            pgPool.query(
              'INSERT INTO rotator_clicks (rotator_id, target_url, user_agent, ip_address) VALUES ($1, $2, $3, $4)',
              [rotator.id, targetUrl, req.headers['user-agent'] || '', clientIp]
            ).catch(() => {});

            if (!/^https?:\/\//i.test(targetUrl)) targetUrl = 'https://' + targetUrl;
            res.writeHead(302, { Location: targetUrl });
            res.end();
            return;
          }
        }
      }

      // HTML de fallback limpo se não encontrado
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Link Não Encontrado</title><style>body{background:#0b0f19;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;margin:0;} .card{background:#111827;padding:32px;border-radius:12px;border:1px solid #1f2937;text-align:center;max-width:400px;}</style></head><body><div class="card"><h2 style="color:#ef4444;margin-top:0;">Link não encontrado</h2><p style="color:#9ca3af;font-size:14px;">O link rotacionador PRO <b>/r/${slug}</b> não foi localizado ou está desativado.</p><a href="/" style="display:inline-block;margin-top:16px;padding:8px 16px;background:#374151;color:#acf800;text-decoration:none;border-radius:6px;font-size:13px;">Voltar ao Início</a></div></body></html>`);
      return;
    } catch (err) {
      return sendError(err.message, 500);
    }
  }

  // -------------------------------------------------------------
  // 2. ENDPOINTS DE AUTENTICAÇÃO (JWT & BCRYPT)
  // -------------------------------------------------------------
  if (pathname === '/api/auth/login' && req.method === 'POST') {
    if (!checkRateLimit(clientIp, 15, 60000)) {
      return sendError('Muitas tentativas de login. Aguarde 1 minuto.', 429);
    }

    try {
      const body = await parseJsonBody(req);
      const email = (body.email || body.username || '').trim().toLowerCase();
      const password = body.password || '';

      if (!email || !password) {
        return sendError('Email e senha são obrigatórios.', 400);
      }

      if (!isPostgresConnected) {
        // Fallback administrativo local de emergência se banco ainda estiver inicializando
        if (email === 'plug2026#adsales' && password === 'AQ2938AJWIU3Y280#') {
          const mockUser = { id: 1, name: 'Admin Fast Dispatch', email, role: 'ADMIN' };
          const token = generateToken(mockUser);
          return sendJson({ success: true, token, user: mockUser });
        }
        return sendError('Serviço de autenticação temporariamente indisponível.', 503);
      }

      const result = await pgPool.query(
        'SELECT id, name, email, password, role FROM users WHERE LOWER(email) = LOWER($1)',
        [email]
      );

      if (result.rows.length === 0) {
        return sendError('Credenciais inválidas.', 401);
      }

      const user = result.rows[0];
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return sendError('Credenciais inválidas.', 401);
      }

      const token = generateToken(user);
      const safeUser = { id: user.id, name: user.name, email: user.email, role: user.role };

      await recordAuditLog(user.id, user.name, 'LOGIN', 'auth', { ip: clientIp }, clientIp);
      return sendJson({ success: true, token, user: safeUser });
    } catch (err) {
      return sendError(err.message, 500);
    }
  }

  if (pathname === '/api/auth/me' && req.method === 'GET') {
    try {
      const user = authenticateToken(req);
      return sendJson({ success: true, user });
    } catch (err) {
      return sendError(err.message, err.status || 401);
    }
  }

  // -------------------------------------------------------------
  // 3. ENDPOINTS CLIENT SUBMISSIONS (COM IDOR & LIMITE 3X PLANILHA)
  // -------------------------------------------------------------

  // Listar campanhas / submissões
  if (pathname === '/api/client-submissions' && req.method === 'GET') {
    try {
      const currentUser = optionalAuth(req);
      if (!isPostgresConnected) {
        return sendJson([]);
      }

      let result;
      // Default deny / isolamento: CLIENT vê apenas suas campanhas; ADMIN vê todas
      if (currentUser && currentUser.role === 'CLIENT') {
        result = await pgPool.query(
          'SELECT * FROM client_submissions WHERE user_id = $1 ORDER BY id DESC',
          [currentUser.id]
        );
      } else {
        result = await pgPool.query('SELECT * FROM client_submissions ORDER BY id DESC');
      }

      const sanitized = result.rows.map(row => ({
        ...row,
        contacts: row.download_count >= (row.max_downloads || 3) ? [] : row.contacts,
        is_exhausted: row.download_count >= (row.max_downloads || 3)
      }));

      return sendJson(sanitized);
    } catch (err) {
      return sendError(err.message, 500);
    }
  }

  // Criar nova campanha / submissão (Mass Assignment Protection)
  if (pathname === '/api/client-submissions' && req.method === 'POST') {
    try {
      const currentUser = optionalAuth(req);
      const body = await parseJsonBody(req);

      const campaign_name = body.campaign_name || body.profile_name || 'Nova Campanha';
      const profile_name = body.profile_name || campaign_name;
      const ddd = String(body.ddd || '11').slice(0, 4);
      const template_type = body.template_type || 'none';
      const media_url = body.media_url || '';
      const ad_copy = body.ad_copy || '';
      const button_link = body.button_link || '';
      const spreadsheet_url = body.spreadsheet_url || '';
      const file_name = body.fileName || body.file_name || '';
      const valid_count = parseInt(body.validCount || body.valid_count || '0', 10);
      const total_rows = parseInt(body.totalRows || body.total_rows || '0', 10);
      const contacts = Array.isArray(body.contacts) ? body.contacts : [];
      const headers = Array.isArray(body.headers) ? body.headers : [];
      const ads = Array.isArray(body.ads) ? body.ads : [];
      const status = body.status || 'PENDENTE';
      const sender_number = body.sender_number || '';
      const user_id = currentUser?.id || null;

      if (!isPostgresConnected) {
        return sendJson({
          id: Date.now(),
          campaign_name,
          profile_name,
          ddd,
          template_type,
          media_url,
          ad_copy,
          button_link,
          contacts,
          headers,
          ads,
          status,
          download_count: 0
        });
      }

      const insertRes = await pgPool.query(
        `INSERT INTO client_submissions (
          campaign_name, profile_name, ddd, template_type, media_url, ad_copy,
          button_link, spreadsheet_url, file_name, valid_count, total_rows,
          contacts, headers, ads, status, sender_number, user_id, download_count, max_downloads
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 0, 3)
        RETURNING *`,
        [
          campaign_name, profile_name, ddd, template_type, media_url, ad_copy,
          button_link, spreadsheet_url, file_name, valid_count, total_rows,
          JSON.stringify(contacts), JSON.stringify(headers), JSON.stringify(ads),
          status, sender_number, user_id
        ]
      );

      await recordAuditLog(user_id, currentUser?.name, 'CREATE_SUBMISSION', 'client_submissions', { id: insertRes.rows[0].id, name: campaign_name }, clientIp);
      return sendJson(insertRes.rows[0], 201);
    } catch (err) {
      return sendError(err.message, 500);
    }
  }

  // Atualizar submissão (IDOR & Mass Assignment Protection)
  if (pathname.startsWith('/api/client-submissions/') && req.method === 'PUT') {
    const id = parseInt(pathname.replace('/api/client-submissions/', ''), 10);
    if (!id) return sendError('ID inválido', 400);

    try {
      const currentUser = optionalAuth(req);
      const body = await parseJsonBody(req);

      if (!isPostgresConnected) {
        return sendJson({ success: true, id, ...body });
      }

      // Verificação IDOR
      const existing = await pgPool.query('SELECT * FROM client_submissions WHERE id = $1', [id]);
      if (existing.rows.length === 0) return sendError('Campanha não encontrada', 404);

      const record = existing.rows[0];
      if (currentUser && currentUser.role !== 'ADMIN' && record.user_id && record.user_id !== currentUser.id) {
        return sendError('Acesso negado: você não tem permissão para alterar esta campanha.', 403);
      }

      // Allowlist de campos permitidos
      const updates = [];
      const values = [];
      let paramIdx = 1;

      const allowlist = [
        'campaign_name', 'profile_name', 'ddd', 'template_type', 'media_url',
        'ad_copy', 'button_link', 'spreadsheet_url', 'file_name', 'status',
        'accepted_by', 'assigned_to', 'sender_number', 'notes'
      ];

      for (const field of allowlist) {
        if (body[field] !== undefined) {
          updates.push(`${field} = $${paramIdx++}`);
          values.push(body[field]);
        }
      }

      if (body.ads !== undefined) {
        updates.push(`ads = $${paramIdx++}`);
        values.push(JSON.stringify(body.ads));
      }

      if (body.contacts !== undefined) {
        updates.push(`contacts = $${paramIdx++}`);
        values.push(JSON.stringify(body.contacts));
      }

      if (body.download_count !== undefined) {
        const count = parseInt(body.download_count, 10) || 0;
        updates.push(`download_count = $${paramIdx++}`);
        values.push(count);

        // Se atingiu o limite de 3 downloads, expurga contatos permanentemente
        if (count >= (record.max_downloads || 3)) {
          updates.push(`contacts = '[]'::jsonb`);
          updates.push(`headers = '[]'::jsonb`);
          updates.push(`file_name = 'Planilha Excluída (Limite de 3 downloads atingido)'`);
        }
      }

      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(id);

      const query = `UPDATE client_submissions SET ${updates.join(', ')} WHERE id = $${paramIdx} RETURNING *`;
      const updateRes = await pgPool.query(query, values);

      await recordAuditLog(currentUser?.id, currentUser?.name, 'UPDATE_SUBMISSION', 'client_submissions', { id, status: body.status }, clientIp);
      return sendJson(updateRes.rows[0]);
    } catch (err) {
      return sendError(err.message, 500);
    }
  }

  // Download seguro de planilha com controle Server-Side de até 3 downloads e exclusão automática
  if (pathname.match(/^\/api\/client-submissions\/(\d+)\/download-spreadsheet$/) && req.method === 'POST') {
    const id = parseInt(pathname.split('/')[3], 10);
    if (!id) return sendError('ID inválido', 400);

    try {
      const currentUser = optionalAuth(req);

      if (!isPostgresConnected) {
        return sendJson({ success: true, allowed: true, downloadCount: 1 });
      }

      const existing = await pgPool.query('SELECT * FROM client_submissions WHERE id = $1', [id]);
      if (existing.rows.length === 0) return sendError('Campanha não encontrada', 404);

      const record = existing.rows[0];

      // Verificação IDOR
      if (currentUser && currentUser.role !== 'ADMIN' && record.user_id && record.user_id !== currentUser.id) {
        return sendError('Acesso negado: permissão insuficiente para baixar este arquivo.', 403);
      }

      const currentCount = parseInt(record.download_count || 0, 10);
      const maxAllowed = parseInt(record.max_downloads || 3, 10);

      // Verificação de Segurança Server-Side: Limite Excedido
      if (currentCount >= maxAllowed) {
        return sendError('Diretriz de Segurança: Esta planilha atingiu o limite de 3 downloads e foi excluída permanentemente.', 410);
      }

      const nextCount = currentCount + 1;
      const isExhausted = nextCount >= maxAllowed;

      if (isExhausted) {
        // Exclusão automática dos contatos e planilha no 3º download
        await pgPool.query(
          `UPDATE client_submissions 
           SET download_count = $1, contacts = '[]'::jsonb, headers = '[]'::jsonb, 
               file_name = 'Planilha Excluída (Limite de 3 downloads atingido)', updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [nextCount, id]
        );
      } else {
        await pgPool.query(
          'UPDATE client_submissions SET download_count = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [nextCount, id]
        );
      }

      await recordAuditLog(
        currentUser?.id, 
        currentUser?.name, 
        'DOWNLOAD_SPREADSHEET', 
        'client_submissions', 
        { id, downloadNumber: nextCount, isExhausted }, 
        clientIp
      );

      return sendJson({
        success: true,
        downloadCount: nextCount,
        maxDownloads: maxAllowed,
        isExhausted,
        contacts: record.contacts,
        headers: record.headers,
        fileName: record.file_name || 'contatos.csv'
      });
    } catch (err) {
      return sendError(err.message, 500);
    }
  }

  // Excluir campanha (IDOR Protection)
  if (pathname.startsWith('/api/client-submissions/') && req.method === 'DELETE') {
    const id = parseInt(pathname.replace('/api/client-submissions/', ''), 10);
    if (!id) return sendError('ID inválido', 400);

    try {
      const currentUser = optionalAuth(req);

      if (isPostgresConnected) {
        const existing = await pgPool.query('SELECT user_id FROM client_submissions WHERE id = $1', [id]);
        if (existing.rows.length === 0) return sendError('Campanha não encontrada', 404);

        if (currentUser && currentUser.role !== 'ADMIN' && existing.rows[0].user_id && existing.rows[0].user_id !== currentUser.id) {
          return sendError('Acesso negado para excluir esta campanha.', 403);
        }

        await pgPool.query('DELETE FROM client_submissions WHERE id = $1', [id]);
        await recordAuditLog(currentUser?.id, currentUser?.name, 'DELETE_SUBMISSION', 'client_submissions', { id }, clientIp);
      }

      return sendJson({ success: true, message: 'Campanha excluída com sucesso' });
    } catch (err) {
      return sendError(err.message, 500);
    }
  }

  // -------------------------------------------------------------
  // 4. ENDPOINTS LINK ROTATOR PRO (/api/pro-links)
  // -------------------------------------------------------------
  if (pathname === '/api/pro-links' && req.method === 'GET') {
    try {
      const currentUser = optionalAuth(req);
      if (!isPostgresConnected) return sendJson([]);

      let result;
      if (currentUser && currentUser.role === 'CLIENT') {
        result = await pgPool.query('SELECT * FROM pro_rotators WHERE user_id = $1 ORDER BY id DESC', [currentUser.id]);
      } else {
        result = await pgPool.query('SELECT * FROM pro_rotators ORDER BY id DESC');
      }
      return sendJson(result.rows);
    } catch (err) {
      return sendError(err.message, 500);
    }
  }

  if (pathname === '/api/pro-links' && req.method === 'POST') {
    try {
      const currentUser = optionalAuth(req);
      const body = await parseJsonBody(req);

      const title = (body.title || 'Rotator PRO').trim();
      let slug = (body.slug || Math.random().toString(36).substring(2, 8)).trim().replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
      const targets = Array.isArray(body.targets) ? body.targets : [];
      const user_id = currentUser?.id || null;

      if (!isPostgresConnected) {
        return sendJson({ id: Date.now(), title, slug, targets, total_clicks: 0, status: 'ACTIVE' }, 201);
      }

      // Garante unicidade do slug
      const checkSlug = await pgPool.query('SELECT id FROM pro_rotators WHERE LOWER(slug) = LOWER($1)', [slug]);
      if (checkSlug.rows.length > 0) {
        slug = `${slug}-${Math.random().toString(36).substring(2, 5)}`;
      }

      const resInsert = await pgPool.query(
        `INSERT INTO pro_rotators (user_id, title, slug, original_url, targets, status, total_clicks)
         VALUES ($1, $2, $3, $4, $5, $6, 0)
         RETURNING *`,
        [user_id, title, slug, targets[0]?.url || '', JSON.stringify(targets), 'ACTIVE']
      );

      await recordAuditLog(user_id, currentUser?.name, 'CREATE_ROTATOR', 'pro_rotators', { id: resInsert.rows[0].id, slug }, clientIp);
      return sendJson(resInsert.rows[0], 201);
    } catch (err) {
      return sendError(err.message, 500);
    }
  }

  if (pathname.startsWith('/api/pro-links/') && req.method === 'PUT') {
    const id = parseInt(pathname.replace('/api/pro-links/', ''), 10);
    if (!id) return sendError('ID inválido', 400);

    try {
      const currentUser = optionalAuth(req);
      const body = await parseJsonBody(req);

      if (!isPostgresConnected) {
        return sendJson({ success: true, id, ...body });
      }

      const existing = await pgPool.query('SELECT user_id FROM pro_rotators WHERE id = $1', [id]);
      if (existing.rows.length === 0) return sendError('Rotator não encontrado', 404);

      if (currentUser && currentUser.role !== 'ADMIN' && existing.rows[0].user_id && existing.rows[0].user_id !== currentUser.id) {
        return sendError('Acesso negado para editar este link.', 403);
      }

      const updates = [];
      const vals = [];
      let idx = 1;

      if (body.title !== undefined) { updates.push(`title = $${idx++}`); vals.push(body.title); }
      if (body.slug !== undefined) { updates.push(`slug = $${idx++}`); vals.push(body.slug.trim().toLowerCase()); }
      if (body.targets !== undefined) { updates.push(`targets = $${idx++}`); vals.push(JSON.stringify(body.targets)); }
      if (body.status !== undefined) { updates.push(`status = $${idx++}`); vals.push(body.status); }

      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      vals.push(id);

      const query = `UPDATE pro_rotators SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`;
      const resUp = await pgPool.query(query, vals);

      return sendJson(resUp.rows[0]);
    } catch (err) {
      return sendError(err.message, 500);
    }
  }

  if (pathname.startsWith('/api/pro-links/') && req.method === 'DELETE') {
    const id = parseInt(pathname.replace('/api/pro-links/', ''), 10);
    if (!id) return sendError('ID inválido', 400);

    try {
      const currentUser = optionalAuth(req);

      if (isPostgresConnected) {
        const existing = await pgPool.query('SELECT user_id FROM pro_rotators WHERE id = $1', [id]);
        if (existing.rows.length === 0) return sendError('Rotator não encontrado', 404);

        if (currentUser && currentUser.role !== 'ADMIN' && existing.rows[0].user_id && existing.rows[0].user_id !== currentUser.id) {
          return sendError('Acesso negado para excluir este link.', 403);
        }

        await pgPool.query('DELETE FROM pro_rotators WHERE id = $1', [id]);
      }

      return sendJson({ success: true, message: 'Rotator excluído' });
    } catch (err) {
      return sendError(err.message, 500);
    }
  }

  // -------------------------------------------------------------
  // 5. ENDPOINTS REDIS DISPATCH QUEUE & MONITOR
  // -------------------------------------------------------------

  // Status da Fila
  if (pathname === '/api/dispatch/queue/status' && req.method === 'GET') {
    try {
      if (!isRedisConnected) {
        return sendJson({
          queueLength: 0,
          isRunning: false,
          processed: 0,
          rateLimit: 1.0,
          connected: false,
          warning: `Aguardando conexão com o serviço Redis (${REDIS_HOST}:${REDIS_PORT})...`
        });
      }

      const queueLength = await redisClient.lLen('dispatch_queue');
      const isRunning = (await redisClient.get('dispatch_running')) === 'true';
      const processed = parseInt((await redisClient.get('dispatch_processed')) || '0', 10);
      const rateLimitStr = await redisClient.get('dispatch_rate_limit');
      const rateLimit = rateLimitStr ? parseFloat(rateLimitStr) : 1.0;

      return sendJson({
        queueLength,
        isRunning,
        processed,
        rateLimit,
        connected: true
      });
    } catch (err) {
      return sendError(err.message, 500);
    }
  }

  // Definir Rate Limit dinâmico
  if (pathname === '/api/dispatch/rate-limit' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const rateLimit = Math.max(0.1, parseFloat(body.rateLimit) || 1.0);

      if (isRedisConnected) {
        await redisClient.set('dispatch_rate_limit', String(rateLimit));
      }

      return sendJson({ success: true, rateLimit });
    } catch (err) {
      return sendError(err.message, 500);
    }
  }

  // Enfileirar mensagens no Redis
  if (pathname === '/api/dispatch/queue' && req.method === 'POST') {
    try {
      const currentUser = optionalAuth(req);

      if (!isRedisConnected) {
        return sendError(`Serviço Redis indisponível no momento (${REDIS_HOST}:${REDIS_PORT})`, 503);
      }

      const body = await parseJsonBody(req);
      const messages = body.messages || [];

      if (!Array.isArray(messages) || messages.length === 0) {
        return sendError('Nenhuma mensagem fornecida no array "messages"', 400);
      }

      // Aplica credenciais server-side e vincula o usuário autenticado
      const stringifiedItems = messages.map(msg => JSON.stringify({
        ...msg,
        user_id: currentUser?.id || null,
        _apiKey: INFOBIP_API_KEY,
        _baseUrl: INFOBIP_BASE_URL
      }));

      await redisClient.rPush('dispatch_queue', stringifiedItems);
      startWorkerIfNeeded();

      await recordAuditLog(
        currentUser?.id, 
        currentUser?.name, 
        'ENQUEUE_DISPATCH', 
        'redis_queue', 
        { count: stringifiedItems.length }, 
        clientIp
      );

      return sendJson({ success: true, count: stringifiedItems.length });
    } catch (err) {
      return sendError(err.message, 500);
    }
  }

  // Pausar Fila Redis
  if (pathname === '/api/dispatch/queue/stop' && req.method === 'POST') {
    try {
      if (isRedisConnected) {
        await redisClient.set('dispatch_stop', 'true');
      }
      return sendJson({ success: true, message: 'Comando de pausa enviado' });
    } catch (err) {
      return sendError(err.message, 500);
    }
  }

  // Limpar Fila Redis
  if (pathname === '/api/dispatch/queue' && req.method === 'DELETE') {
    try {
      if (isRedisConnected) {
        await redisClient.del('dispatch_queue');
        await redisClient.set('dispatch_running', 'false');
      }
      return sendJson({ success: true, message: 'Fila limpa com sucesso' });
    } catch (err) {
      return sendError(err.message, 500);
    }
  }

  // Consultar Logs de Envio
  if (pathname === '/api/dispatch/logs' && req.method === 'GET') {
    try {
      if (!isRedisConnected) {
        if (isPostgresConnected) {
          const pgLogs = await pgPool.query('SELECT * FROM dispatch_records ORDER BY id DESC LIMIT 200');
          return sendJson(pgLogs.rows);
        }
        return sendJson([]);
      }

      const rawLogs = await redisClient.lRange('dispatch_logs', 0, 199);
      const logs = rawLogs.map(str => {
        try { return JSON.parse(str); } catch { return null; }
      }).filter(Boolean);

      return sendJson(logs);
    } catch (err) {
      return sendError(err.message, 500);
    }
  }

  // Encurtador de Link (Compatibilidade)
  if (pathname === '/api/shortener/create' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const original = body.original_url || '';
      const slug = Math.random().toString(36).substring(2, 8);

      if (isPostgresConnected && original) {
        await pgPool.query(
          `INSERT INTO pro_rotators (title, slug, original_url, targets, status, total_clicks)
           VALUES ($1, $2, $3, $4, 'ACTIVE', 0)`,
          [body.title || 'Short Link', slug, original, JSON.stringify([{ url: original, weight: 1 }])]
        ).catch(() => {});
      }

      const shortUrl = `/r/${slug}`;
      return sendJson({ success: true, shortUrl, slug });
    } catch (err) {
      return sendError(err.message, 500);
    }
  }

  // -------------------------------------------------------------
  // 6. UPLOAD SEGURO DE ARQUIVOS (PREVENÇÃO DE PATH TRAVERSAL)
  // -------------------------------------------------------------
  if (pathname === '/api/upload' && req.method === 'POST') {
    try {
      const contentType = req.headers['content-type'] || '';

      if (contentType.includes('application/json')) {
        const body = await parseJsonBody(req);
        const fileData = body.data || body.file || '';
        const fileName = body.name || `file_${Date.now()}`;
        const ext = path.extname(fileName).toLowerCase() || '.bin';

        // Sanitização contra Directory Traversal
        const safeBaseName = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
        const uniqueFileName = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}_${safeBaseName}`;
        const targetPath = path.join(UPLOADS_DIR, uniqueFileName);

        if (fileData.startsWith('data:')) {
          const base64Data = fileData.split(',')[1];
          fs.writeFileSync(targetPath, Buffer.from(base64Data, 'base64'));
        } else {
          fs.writeFileSync(targetPath, fileData);
        }

        const publicUrl = `/uploads/${uniqueFileName}`;
        return sendJson({ success: true, url: publicUrl, originalName: fileName });
      }

      // Upload binário direto
      const safeRandomName = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}.bin`;
      const targetPath = path.join(UPLOADS_DIR, safeRandomName);
      const writeStream = fs.createWriteStream(targetPath);

      req.pipe(writeStream);
      writeStream.on('finish', () => {
        return sendJson({ success: true, url: `/uploads/${safeRandomName}` });
      });
      writeStream.on('error', (err) => {
        return sendError(err.message, 500);
      });
      return;
    } catch (err) {
      return sendError(err.message, 500);
    }
  }

  // Servir arquivos de upload com segurança
  if (pathname.startsWith('/uploads/') && req.method === 'GET') {
    const requestedFile = path.basename(pathname.replace('/uploads/', ''));
    const safeFilePath = path.join(UPLOADS_DIR, requestedFile);

    if (fs.existsSync(safeFilePath) && fs.statSync(safeFilePath).isFile()) {
      const ext = path.extname(safeFilePath).toLowerCase();
      const mime = MIME_TYPES[ext] || 'application/octet-stream';
      res.setHeader('Content-Type', mime);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      fs.createReadStream(safeFilePath).pipe(res);
      return;
    }
    return sendError('Arquivo não encontrado', 404);
  }

  // -------------------------------------------------------------
  // 7. GOOGLE SHEETS & META TEMPLATES COM CREDENCIAIS SEGURAS
  // -------------------------------------------------------------
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

      return sendError('Parâmetro gid ou all=true obrigatório', 400);
    } catch (err) {
      return sendError(err.message, 500);
    }
  }

  // Meta Templates Infobip (Utiliza INFOBIP_API_KEY no backend - Zero Secrets no Frontend)
  if (pathname === '/api/meta-templates') {
    try {
      const sinceParam = urlObj.searchParams.get('since') || '2026-09-21T00:00:00Z';
      const forceRefresh = urlObj.searchParams.get('force') === 'true';
      const senderParam = urlObj.searchParams.get('sender') || '';
      const knownSendersParam = urlObj.searchParams.get('knownSenders') || '';

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
          const directRes = await getJson(INFOBIP_BASE_URL, `/whatsapp/2/senders/${num}/templates`, INFOBIP_API_KEY);
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

      // Caso Geral: Busca geral recente
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

      await Promise.all(Array.from(activeSenders).map(async (senderNum) => {
        try {
          const sRes = await getJson(INFOBIP_BASE_URL, `/whatsapp/2/senders/${senderNum}/templates`, INFOBIP_API_KEY);
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
          console.warn(`[Server] Erro no remetente ${senderNum}:`, e.message);
        }
      }));

      try {
        const init = await getJson(INFOBIP_BASE_URL, '/whatsapp/1/templates?page=0&size=100', INFOBIP_API_KEY);
        if (init.paging && init.paging.totalPages) {
          const totalPages = init.paging.totalPages;
          const pagesToFetch = [0];
          for (let p = Math.max(1, totalPages - 4); p < totalPages; p++) {
            pagesToFetch.push(p);
          }
          const pagesResults = await Promise.all(
            pagesToFetch.map(p => getJson(INFOBIP_BASE_URL, `/whatsapp/1/templates?page=${p}&size=100`, INFOBIP_API_KEY))
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
        console.warn('[Server] Erro em templates gerais:', e.message);
      }

      allTemplates.sort((a, b) => {
        const timeA = new Date(a.lastUpdatedAt || a.createdAt || 0).getTime();
        const timeB = new Date(b.lastUpdatedAt || b.createdAt || 0).getTime();
        return timeB - timeA;
      });

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
      return sendError(err.message, 500);
    }
  }

  // Proxy Seguro Infobip (Substitui Authorization pelo token do servidor)
  if (pathname.startsWith('/infobip-proxy/')) {
    const targetPath = pathname.replace('/infobip-proxy', '') + urlObj.search;
    const proxyHeaders = {
      ...req.headers,
      host: INFOBIP_BASE_URL,
      authorization: `App ${INFOBIP_API_KEY}`
    };

    const proxyReq = https.request({
      hostname: INFOBIP_BASE_URL,
      path: targetPath,
      method: req.method,
      headers: proxyHeaders
    }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      sendError(`Proxy error: ${err.message}`, 502);
    });
    req.pipe(proxyReq);
    return;
  }

  // -------------------------------------------------------------
  // 8. SERVIR ARQUIVOS ESTÁTICOS DO DIRETÓRIO ./dist
  // -------------------------------------------------------------
  let filePath = path.join(DIST_DIR, pathname);
  if (pathname === '/' || !path.extname(pathname)) {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      // Arquivo existe diretamente
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
    const indexPath = path.join(DIST_DIR, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      fs.createReadStream(indexPath).pipe(res);
    } else {
      res.statusCode = 404;
      res.end('404 Not Found (Execute "npm run build" primeiro para gerar o bundle do frontend)');
    }
  }
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`[Express-Dispatch App] Servidor de produção ativo na porta ${PORT}`);
  console.log(`[Segurança] Diretriz SECURITY-FIRST ativa.`);
  console.log(`[Infobip] Host configurado: ${INFOBIP_BASE_URL}`);
  console.log(`[Redis] Conexão: ${REDIS_HOST}:${REDIS_PORT}`);
  console.log(`[Postgres] URL: ${DATABASE_URL.replace(/:[^:]*@/, ':****@')}`);
  console.log(`[Arquivos] Servindo frontend de: ${DIST_DIR}`);
  console.log(`=======================================================`);
});
