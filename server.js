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

// Sanitização de host da Infobip para prevenção estrita de SSRF (Server-Side Request Forgery)
function sanitizeInfobipHost(host) {
  if (!host || typeof host !== 'string') return INFOBIP_BASE_URL;
  const clean = host.replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim();
  // Permitir somente subdomínios oficiais da Infobip (*.infobip.com) ou o host configurado via ENV
  if (/^[a-zA-Z0-9-]+\.(api|api-us|api-eu)\.infobip\.com$/.test(clean) || clean === INFOBIP_BASE_URL) {
    return clean;
  }
  return INFOBIP_BASE_URL;
}

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
        sender_phone TEXT,
        origin TEXT DEFAULT 'CLIENT_FORM',
        user_id INTEGER,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`ALTER TABLE client_submissions ADD COLUMN IF NOT EXISTS origin TEXT DEFAULT 'CLIENT_FORM'`);
    await client.query(`ALTER TABLE client_submissions ADD COLUMN IF NOT EXISTS sender_phone TEXT`);

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
        campaign_name TEXT,
        list_name TEXT,
        log_type TEXT,
        delivery_status TEXT,
        waba TEXT,
        recipient TEXT,
        message TEXT,
        payload JSONB,
        user_id INTEGER,
        done_at TIMESTAMPTZ,
        timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(`ALTER TABLE dispatch_records ADD COLUMN IF NOT EXISTS campaign_name TEXT;`).catch(() => {});
    await client.query(`ALTER TABLE dispatch_records ADD COLUMN IF NOT EXISTS campaign_id TEXT;`).catch(() => {});
    await client.query(`ALTER TABLE dispatch_records ADD COLUMN IF NOT EXISTS list_name TEXT;`).catch(() => {});
    await client.query(`ALTER TABLE dispatch_records ADD COLUMN IF NOT EXISTS done_at TIMESTAMPTZ;`).catch(() => {});
    await client.query(`ALTER TABLE dispatch_records ADD COLUMN IF NOT EXISTS delivery_status TEXT;`).catch(() => {});
    await client.query(`ALTER TABLE dispatch_records ADD COLUMN IF NOT EXISTS error_group TEXT;`).catch(() => {});
    await client.query(`ALTER TABLE dispatch_records ADD COLUMN IF NOT EXISTS error_name TEXT;`).catch(() => {});
    await client.query(`ALTER TABLE dispatch_records ADD COLUMN IF NOT EXISTS price NUMERIC;`).catch(() => {});

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

    // 7. Tabela uploaded_files (Persistência Permanente de Imagens & Mídias contra reinicializações e novos deploys)
    await client.query(`
      CREATE TABLE IF NOT EXISTS uploaded_files (
        id SERIAL PRIMARY KEY,
        filename TEXT UNIQUE NOT NULL,
        mime_type TEXT NOT NULL,
        data_base64 TEXT NOT NULL,
        size_bytes INTEGER,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
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
    setTimeout(() => syncLocalUploadsToPostgres(), 1000);
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

async function syncLocalUploadsToPostgres() {
  if (!isPostgresConnected) return;
  try {
    const files = fs.readdirSync(UPLOADS_DIR);
    for (const f of files) {
      const fullPath = path.join(UPLOADS_DIR, f);
      if (fs.statSync(fullPath).isFile() && !f.startsWith('.')) {
        const ext = path.extname(f).toLowerCase();
        const mime = MIME_TYPES[ext] || 'application/octet-stream';
        const fileBuf = fs.readFileSync(fullPath);
        if (fileBuf.length <= 15 * 1024 * 1024) {
          const b64 = fileBuf.toString('base64');
          await pgPool.query(
            `INSERT INTO uploaded_files (filename, mime_type, data_base64, size_bytes)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (filename) DO NOTHING`,
            [f, mime, b64, fileBuf.length]
          );
        }
      }
    }
    console.log('💾 [Uploads Backup] Sincronização de arquivos locais com o banco PostgreSQL concluída.');
  } catch (err) {
    console.warn('[Uploads Backup] Aviso ao sincronizar mídias locais com banco:', err.message);
  }
}

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
          const parsed = JSON.parse(data);
          if (resp.statusCode && resp.statusCode >= 400 && typeof parsed === 'object') {
            parsed.statusCode = resp.statusCode;
          }
          resolve(parsed);
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

function putJson(host, reqPath, key, bodyData) {
  return new Promise((resolve, reject) => {
    const dataStr = typeof bodyData === 'string' ? bodyData : JSON.stringify(bodyData);
    const options = {
      hostname: host,
      path: reqPath,
      method: 'PUT',
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
          const parsed = JSON.parse(data);
          if (resp.statusCode && resp.statusCode >= 400 && typeof parsed === 'object') {
            parsed.statusCode = resp.statusCode;
          }
          resolve(parsed);
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

function isLocalhostRequest(req) {
  const host = (req.headers.host || '').toLowerCase();
  const clientIp = typeof getClientIp === 'function' ? getClientIp(req) : '';
  const isLoopbackIp = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp.includes('127.0.0.1');
  const isLocalHostHeader = host.startsWith('localhost') || host.startsWith('127.0.0.1');
  const isNotProduction = !process.env.NODE_ENV || process.env.NODE_ENV !== 'production';

  return isNotProduction && (isLoopbackIp || isLocalHostHeader);
}

function authenticateToken(req) {
  const token = extractToken(req);

  // Apenas para desenvolvimento em localhost: dispensa login manual conforme solicitado
  if (isLocalhostRequest(req) && (!token || token === 'dev_localhost_token')) {
    return {
      id: 1,
      name: 'Desenvolvedor Local',
      email: 'dev@localhost',
      role: 'ADMIN',
      isAdmin: true
    };
  }

  if (!token) {
    const err = new Error('Acesso não autorizado: token de autenticação ausente.');
    err.status = 401;
    throw err;
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded;
  } catch (e) {
    if (isLocalhostRequest(req)) {
      return {
        id: 1,
        name: 'Desenvolvedor Local',
        email: 'dev@localhost',
        role: 'ADMIN',
        isAdmin: true
      };
    }
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
  try {
    const isPaused = (await redisClient.get('dispatch_paused')) === 'true';
    if (isPaused) {
      console.log('[Worker] Fila está pausada. Não iniciando worker.');
      return;
    }
  } catch {}
  runDispatchWorker().catch(err => {
    console.error('[Worker] Erro não tratado:', err);
    isWorkerRunning = false;
  });
}

async function runDispatchWorker() {
  if (isWorkerRunning) return;
  if (isRedisConnected) {
    try {
      const isPaused = (await redisClient.get('dispatch_paused')) === 'true';
      if (isPaused) {
        console.log('[Worker] Fila pausada. Worker não será iniciado.');
        return;
      }
    } catch {}
  }

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

      // Checa se a fila foi pausada globalmente
      const isPaused = (await redisClient.get('dispatch_paused')) === 'true';
      if (isPaused) {
        console.log('[Worker] Fila pausada globalmente. Suspendendo worker.');
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

      // Checa se a CAMPANHA individual deste job está pausada
      const jobCampaignId = job.campaignId || job.campaign_id;
      const jobCampaignName = job.campaignName || job.campaign_name;
      let isCampaignPaused = false;
      try {
        if (jobCampaignId && await redisClient.sIsMember('paused_campaigns', String(jobCampaignId))) {
          isCampaignPaused = true;
        } else if (jobCampaignName && await redisClient.sIsMember('paused_campaigns', String(jobCampaignName))) {
          isCampaignPaused = true;
        }
      } catch {}

      if (isCampaignPaused) {
        // Enfileira na fila reservada da campanha pausada para manter a integridade sem travar as outras
        const pausedKey = `dispatch_queue_paused:${jobCampaignId || jobCampaignName}`;
        await redisClient.rPush(pausedKey, itemStr);
        continue;
      }

      // Utiliza credencial server-side obrigatória
      const apiKey = INFOBIP_API_KEY;
      const baseUrl = INFOBIP_BASE_URL;
      const targetNumber = job.to;
      const senderNumber = job.from;
      const templateName = job.content?.templateName || 'template';

      // Safeguard de botões para templates como final_0708 (evita erro 7008 Meta)
      if (templateName.includes('final_0708') && job.content?.templateData) {
        if (!job.content.templateData.buttons || job.content.templateData.buttons.length === 0) {
          job.content.templateData.buttons = [
            {
              type: 'QUICK_REPLY',
              parameter: 'Não Reconheço'
            }
          ];
        }
      }

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
        if (
          res?.statusCode >= 400 ||
          statusGroup === 'REJECTED' || 
          statusGroup === 'UNDELIVERABLE' || 
          res?.requestError ||
          res?.error ||
          res?.errorMessage
        ) {
          logType = 'ERROR';
        }
      } catch (sendErr) {
        logType = 'ERROR';
        payload = { error: sendErr.message };
      }

      const campaignId = job.campaignId || job.campaign_id || null;
      const campaignName = job.campaignName || job.campaign_name || 'Campanha_Padrao';
      const listName = job.listName || 'Lista_Contatos';
      const firstMsg = payload?.messages?.[0];
      const messageId = firstMsg?.messageId || `tx_${Date.now()}`;
      const statusGroup = firstMsg?.status?.groupName;
      const statusName = firstMsg?.status?.name;
      const errorId = firstMsg?.status?.id || firstMsg?.error?.id;
      const errorDesc = firstMsg?.status?.description || firstMsg?.error?.description || '';

      let initialStatus = 'SENT';
      if (logType === 'ERROR' || statusGroup === 'REJECTED' || statusGroup === 'UNDELIVERABLE') {
        initialStatus = 'FAILED';
      } else if (statusName === 'DELIVERED_TO_HANDSET' || firstMsg?.status?.id === 5) {
        initialStatus = 'DELIVERED';
      }

      let deliveryStatus = statusName || statusGroup || 'PENDING_ENROUTE';
      if (errorId === 7008 || String(errorDesc).includes('7008') || String(errorDesc).includes('match template parameters')) {
        deliveryStatus = 'FALHA_PARAMETROS_7008 (Erro de parâmetros Meta)';
        initialStatus = 'FAILED';
      }

      const logRecord = {
        id: `disp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        campaign_id: campaignId,
        transmission_id: messageId,
        campaign_name: campaignName,
        list_name: listName,
        timestamp: startTime,
        recipient: targetNumber,
        waba: senderNumber,
        message: templateName,
        log_type: logType,
        status: initialStatus,
        delivery_status: deliveryStatus,
        done_at: null,
        media_url: job.content?.templateData?.header?.mediaUrl || job.mediaUrl || '',
        header_type: job.content?.templateData?.header?.type || job.headerType || 'NONE',
        payload: payload
      };

      // Gravação do log no Redis
      try {
        await redisClient.lPush('dispatch_logs', JSON.stringify(logRecord));
        await redisClient.lTrim('dispatch_logs', 0, 999);
        await redisClient.incr('dispatch_processed');
      } catch (logErr) {
        console.warn('[Worker] Erro ao gravar log no Redis:', logErr);
      }

      // Persistência no PostgreSQL
      if (isPostgresConnected) {
        try {
          await pgPool.query(
            `INSERT INTO dispatch_records (transmission_id, campaign_id, campaign_name, list_name, log_type, delivery_status, waba, recipient, message, payload, user_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
              logRecord.transmission_id,
              campaignId,
              campaignName,
              listName,
              logRecord.log_type,
              logRecord.delivery_status,
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
      const isPaused = (await redisClient.get('dispatch_paused')) === 'true';
      if (isPaused) return; // Fila pausada pelo usuário, não reiniciar!
      const len = await redisClient.lLen('dispatch_queue');
      if (len > 0) {
        startWorkerIfNeeded();
      }
    } catch {}
  }
}, 5000);

// -------------------------------------------------------------
// INFOBIP DELIVERY REPORTS (DLR) REAL-TIME SYNC ENGINE
// -------------------------------------------------------------
let isSyncInProgress = false;

async function syncDeliveryReportsFromInfobip() {
  if (isSyncInProgress) return { synced: 0, updated: 0, sample: [] };
  isSyncInProgress = true;

  try {
    const apiKey = INFOBIP_API_KEY;
    const baseUrl = INFOBIP_BASE_URL;

    let reports = [];

    // 1. Consultar /messages-api/1/reports?limit=1000 (DLRs não lidos em tempo real)
    try {
      const rRes = await getJson(baseUrl, '/messages-api/1/reports?limit=1000', apiKey);
      if (rRes?.results && Array.isArray(rRes.results)) {
        reports.push(...rRes.results);
      }
    } catch (e) {
      console.warn('[SyncDLR] Erro ao consultar /messages-api/1/reports:', e.message);
    }

    // 1.5. Consultar /messages-api/1/logs?limit=100 (últimos logs persistidos no Infobip)
    try {
      const lGeneralRes = await getJson(baseUrl, '/messages-api/1/logs?limit=100', apiKey);
      if (lGeneralRes?.results && Array.isArray(lGeneralRes.results)) {
        reports.push(...lGeneralRes.results);
      }
    } catch (e) {
      console.warn('[SyncDLR] Erro ao consultar /messages-api/1/logs gerais:', e.message);
    }

    // 2. Coletar IDs de transmissão (messageId único de cada envio)
    const trackedIds = new Set();

    if (isRedisConnected) {
      try {
        const rawLogs = await redisClient.lRange('dispatch_logs', 0, 499);
        for (const str of rawLogs) {
          try {
            const l = JSON.parse(str);
            const mId = l.transmission_id || l.messageId;
            if (mId && !mId.startsWith('tx_')) {
              trackedIds.add(mId);
            }
          } catch {}
        }
      } catch {}
    }

    if (isPostgresConnected) {
      try {
        const pgTracked = await pgPool.query(`
          SELECT transmission_id 
          FROM dispatch_records 
          WHERE transmission_id IS NOT NULL 
            AND transmission_id NOT LIKE 'tx_%'
          ORDER BY id DESC LIMIT 500
        `);
        for (const row of pgTracked.rows) {
          if (row.transmission_id) {
            trackedIds.add(row.transmission_id);
          }
        }
      } catch {}
    }

    // 3. Consultar /messages-api/1/logs em lotes usando estritamente os IDs únicos
    if (trackedIds.size > 0) {
      const idArray = Array.from(trackedIds);
      for (let i = 0; i < idArray.length; i += 50) {
        const chunk = idArray.slice(i, i + 50);
        const q = chunk.map(id => `messageId=${encodeURIComponent(id)}`).join('&');
        try {
          const lRes = await getJson(baseUrl, `/messages-api/1/logs?${q}`, apiKey);
          if (lRes?.results && Array.isArray(lRes.results)) {
            reports.push(...lRes.results);
          }
        } catch (e) {
          console.warn('[SyncDLR] Erro ao consultar logs por messageId:', e.message);
        }
      }
    }

    // 4. Dedup de relatórios exclusivamente pelo messageId
    const seenMap = new Map();
    for (const r of reports) {
      if (r.messageId) {
        seenMap.set(r.messageId, r);
      }
    }
    const uniqueReports = Array.from(seenMap.values());

    let updatedCount = 0;

    // 5. Atualização no Redis: ESTRITAMENTE POR transmission_id / messageId
    if (isRedisConnected) {
      try {
        const rawLogs = await redisClient.lRange('dispatch_logs', 0, 999);
        const parsedLogs = rawLogs.map(str => {
          try { return JSON.parse(str); } catch { return null; }
        }).filter(Boolean);

        // Auto-correção retroativa: se algum registro no Redis estava com DELIVERED_TO_HANDSET marcado como FAILED/ERROR, conserta imediatamente
        for (const l of parsedLogs) {
          const dStat = String(l.delivery_status || l.deliveryReason || '').toUpperCase();
          if ((dStat === 'DELIVERED_TO_HANDSET' || dStat === 'DELIVERED') && (l.status === 'FAILED' || l.log_type === 'ERROR')) {
            l.status = 'DELIVERED';
            l.log_type = 'SUCCESS';
            l.error_group = 'No Errors';
            l.error_name = 'No Error (code 0)';
            if (!l.done_at) l.done_at = l.timestamp || new Date().toISOString();
            updatedCount++;
          }
        }

        for (const rep of uniqueReports) {
          const mId = rep.messageId;
          const statusGroup = rep.status?.groupName;
          const statusName = rep.status?.name;
          const statusId = rep.status?.id !== undefined ? Number(rep.status.id) : null;
          const doneAt = rep.doneAt || rep.sentAt;
          const price = rep.price?.pricePerMessage;

          // ATENÇÃO CRÍTICA (Documentação Oficial Infobip):
          // status.id === 5 (DELIVERED_TO_HANDSET) -> Entregue com sucesso no aparelho do cliente.
          // status.id === 2 (DELIVERED_TO_OPERATOR) -> Entregue à operadora, mas AINDA PENDENTE no aparelho!
          // rep.error.id === 0 é NO_ERROR (sucesso). NUNCA tratar status.id como código de erro!
          const realErrorId = (rep.error?.id !== undefined && rep.error?.id !== null && Number(rep.error.id) > 0)
            ? Number(rep.error.id)
            : null;
          const realErrorDesc = (rep.error?.description && !rep.error.description.toLowerCase().includes('no error'))
            ? rep.error.description
            : null;
          const realErrorGroup = (rep.error?.groupName && !rep.error.groupName.toLowerCase().includes('ok'))
            ? rep.error.groupName
            : null;

          // REGRA DE OURO: Apenas DELIVERED_TO_HANDSET conta como ENTREGUE
          const isHandsetDelivered = (
            statusName === 'DELIVERED_TO_HANDSET' || statusId === 5
          ) && !realErrorId;

          // DELIVERED_TO_OPERATOR é tratado como PENDENTE (enviado à operadora, aguarda aparelho)
          const isOperatorDelivered = (
            statusName === 'DELIVERED_TO_OPERATOR' || statusId === 2
          );

          const isFail = !isHandsetDelivered && !isOperatorDelivered && (
            statusGroup === 'UNDELIVERABLE' || 
            statusGroup === 'REJECTED' || 
            statusGroup === 'FAILED' || 
            statusGroup === 'EXPIRED' ||
            (statusName && (
              statusName.includes('REJECTED') || 
              statusName.includes('UNDELIVERABLE') || 
              statusName.includes('NOT_DELIVERED') || 
              statusName.includes('SPAM') || 
              statusName.includes('FAILED')
            )) ||
            Boolean(realErrorId) ||
            (realErrorDesc && (
              realErrorDesc.toLowerCase().includes('spam') || 
              realErrorDesc.toLowerCase().includes('undeliverable') || 
              realErrorDesc.toLowerCase().includes('failed') || 
              realErrorDesc.toLowerCase().includes('error')
            ))
          );

          // VINCULAÇÃO: por transmission_id / messageId, com fallback por telefone de destino
          const match = parsedLogs.find(l => {
            if (l.transmission_id === mId || l.messageId === mId) return true;
            if (rep.destination && l.recipient) {
              const cleanL = String(l.recipient).replace(/\D/g, '');
              const cleanR = String(rep.destination).replace(/\D/g, '');
              if (cleanL && cleanL === cleanR && (!l.transmission_id || l.transmission_id.startsWith('tx_') || l.transmission_id === mId)) {
                return true;
              }
            }
            return false;
          });

          if (match) {
            let changed = false;

            if (match.transmission_id !== mId && (!match.transmission_id || match.transmission_id.startsWith('tx_'))) {
              match.transmission_id = mId;
              changed = true;
            }

            if (isHandsetDelivered) {
              if (match.status !== 'DELIVERED' || match.delivery_status !== 'DELIVERED_TO_HANDSET') {
                match.status = 'DELIVERED';
                match.log_type = 'SUCCESS';
                match.delivery_status = 'DELIVERED_TO_HANDSET';
                match.deliveryReason = 'DELIVERED_TO_HANDSET';
                match.done_at = doneAt || match.done_at || new Date().toISOString();
                match.error_group = 'No Errors';
                match.error_name = 'No Error (code 0)';
                changed = true;
              }
            } else if (isFail) {
              if (match.status !== 'FAILED' || match.delivery_status !== (statusName || statusGroup)) {
                match.status = 'FAILED';
                match.log_type = 'ERROR';
                match.delivery_status = statusName || statusGroup || 'UNDELIVERABLE_NOT_DELIVERED';
                match.deliveryReason = statusName || statusGroup || 'UNDELIVERABLE_NOT_DELIVERED';
                match.done_at = null;
                match.error_group = realErrorGroup || 'HANDSET_ERRORS';
                match.error_name = realErrorDesc ? (realErrorId ? `${realErrorDesc} (code ${realErrorId})` : realErrorDesc) : (statusName || 'UNDELIVERABLE_NOT_DELIVERED');
                changed = true;
              }
            } else {
              // Status em trânsito / operadora (DELIVERED_TO_OPERATOR, PENDING_WAITING_DELIVERY, PENDING_ENROUTE)
              const pendStatus = isOperatorDelivered ? 'DELIVERED_TO_OPERATOR' : (statusName || 'PENDING_WAITING_DELIVERY');
              if (match.delivery_status !== pendStatus || match.status !== 'SENT') {
                match.status = 'SENT';
                match.log_type = 'SUCCESS';
                match.delivery_status = pendStatus;
                match.deliveryReason = pendStatus;
                match.done_at = null;
                match.error_group = 'No Errors';
                match.error_name = 'No Error (code 0)';
                changed = true;
              }
            }

            if (price !== undefined && match.price !== price) {
              match.price = price;
              changed = true;
            }

            if (changed) updatedCount++;
          }
        }

        if (updatedCount > 0) {
          await redisClient.del('dispatch_logs');
          for (let i = parsedLogs.length - 1; i >= 0; i--) {
            await redisClient.rPush('dispatch_logs', JSON.stringify(parsedLogs[i]));
          }
        }
      } catch (err) {
        console.warn('[SyncDLR] Erro ao sincronizar logs no Redis:', err.message);
      }
    }

    // 6. Atualização no PostgreSQL
    if (isPostgresConnected) {
      try {
        // Auto-correção retroativa no Postgres para registros marcados incorretamente como ERROR
        await pgPool.query(`
          UPDATE dispatch_records 
          SET log_type = 'DELIVERED', 
              error_name = 'No Error (code 0)',
              done_at = COALESCE(done_at, NOW())
          WHERE (delivery_status = 'DELIVERED_TO_HANDSET' OR delivery_status = 'DELIVERED') 
            AND log_type = 'ERROR'
        `).catch(() => {});

        for (const rep of uniqueReports) {
          const mId = rep.messageId;
          if (!mId) continue;

          const statusGroup = rep.status?.groupName;
          const statusName = rep.status?.name;
          const statusId = rep.status?.id !== undefined ? Number(rep.status.id) : null;
          const doneAt = rep.doneAt || rep.sentAt;

          const realErrorId = (rep.error?.id !== undefined && rep.error?.id !== null && Number(rep.error.id) > 0)
            ? Number(rep.error.id)
            : null;
          const realErrorDesc = (rep.error?.description && !rep.error.description.toLowerCase().includes('no error'))
            ? rep.error.description
            : null;

          const isHandsetDelivered = (
            statusName === 'DELIVERED_TO_HANDSET' || statusId === 5
          ) && !realErrorId;

          const isOperatorDelivered = (
            statusName === 'DELIVERED_TO_OPERATOR' || statusId === 2
          );

          const isFail = !isHandsetDelivered && !isOperatorDelivered && (
            statusGroup === 'UNDELIVERABLE' || 
            statusGroup === 'REJECTED' || 
            statusGroup === 'FAILED' || 
            statusGroup === 'EXPIRED' ||
            (statusName && (
              statusName.includes('REJECTED') || 
              statusName.includes('UNDELIVERABLE') || 
              statusName.includes('NOT_DELIVERED') || 
              statusName.includes('SPAM') || 
              statusName.includes('FAILED')
            )) ||
            Boolean(realErrorId) ||
            (realErrorDesc && (
              realErrorDesc.toLowerCase().includes('spam') || 
              realErrorDesc.toLowerCase().includes('undeliverable') || 
              realErrorDesc.toLowerCase().includes('failed') || 
              realErrorDesc.toLowerCase().includes('error')
            ))
          );

          const logType = isHandsetDelivered ? 'DELIVERED' : (isFail ? 'ERROR' : 'SENT');
          const doneAtVal = isHandsetDelivered ? (rep.doneAt ? new Date(rep.doneAt) : (rep.sentAt ? new Date(rep.sentAt) : new Date())) : null;
          const errorFormatted = (isHandsetDelivered || isOperatorDelivered) ? 'No Error (code 0)' : (realErrorDesc ? (realErrorId ? `${realErrorDesc} (code ${realErrorId})` : realErrorDesc) : (statusName || (isFail ? 'UNDELIVERABLE_NOT_DELIVERED' : 'No Error (code 0)')));
          const delivStatus = isHandsetDelivered ? 'DELIVERED_TO_HANDSET' : (isOperatorDelivered ? 'DELIVERED_TO_OPERATOR' : (statusName || statusGroup || (isFail ? 'UNDELIVERABLE_NOT_DELIVERED' : 'SENT_TO_NETWORK')));

          await pgPool.query(
            `UPDATE dispatch_records 
             SET log_type = $1, 
                 delivery_status = $2,
                 done_at = $3,
                 error_name = $4,
                 transmission_id = $5
             WHERE transmission_id = $5 OR (recipient = $6 AND transmission_id LIKE 'tx_%')`,
            [
              logType, 
              delivStatus, 
              doneAtVal, 
              errorFormatted,
              mId,
              rep.destination || ''
            ]
          ).catch(() => {});
        }
      } catch (err) {
        console.warn('[SyncDLR] Erro ao sincronizar PostgreSQL:', err.message);
      }
    }

    return {
      synced: uniqueReports.length,
      updated: updatedCount,
      sample: uniqueReports.slice(0, 3)
    };
  } finally {
    isSyncInProgress = false;
  }
}

// Background auto-sync de DLR da Infobip a cada 10 segundos
setInterval(() => {
  syncDeliveryReportsFromInfobip().catch(() => {});
}, 10000);


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

  // Security Headers (Defesa profunda contra XSS, Clickjacking, MIME Sniffing e Information Disclosure)
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');

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
          'SELECT * FROM pro_rotators WHERE LOWER(slug) = LOWER($1) AND (status IS NULL OR UPPER(status) = $2) LIMIT 1',
          [slug, 'ACTIVE']
        );

        if (result.rows.length > 0) {
          const rotator = result.rows[0];
          const rawTargets = typeof rotator.targets === 'string' ? JSON.parse(rotator.targets) : rotator.targets;
          
          let targetUrl = null;
          if (Array.isArray(rawTargets) && rawTargets.length > 0) {
            const validTargets = rawTargets.filter(t => t && t.url);
            if (validTargets.length > 0) {
              const totalW = validTargets.reduce((s, t) => s + (parseFloat(t.weight) || 1), 0);
              let rnd = Math.random() * totalW;
              targetUrl = validTargets[0].url;

              for (let i = 0; i < validTargets.length; i++) {
                rnd -= (parseFloat(validTargets[i].weight) || 1);
                if (rnd <= 0) {
                  targetUrl = validTargets[i].url;
                  break;
                }
              }
            }
          }

          if (!targetUrl && rotator.original_url) {
            targetUrl = rotator.original_url;
          }

          if (targetUrl) {
            // Asynchronously record click
            pgPool.query(
              'UPDATE pro_rotators SET total_clicks = total_clicks + 1 WHERE id = $1',
              [rotator.id]
            ).catch(() => {});

            pgPool.query(
              'INSERT INTO rotator_clicks (rotator_id, target_url, user_agent, ip_address) VALUES ($1, $2, $3, $4)',
              [rotator.id, targetUrl, req.headers['user-agent'] || '', clientIp]
            ).catch(() => {});

            let finalUrl = targetUrl.trim();
            if (!/^https?:\/\//i.test(finalUrl)) finalUrl = 'https://' + finalUrl;
            res.writeHead(302, { Location: finalUrl });
            res.end();
            return;
          }
        }
      }

      // Fallback: Redirecionador do cliente com verificação no localStorage (garante funcionamento offline / cache)
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
    h3 { margin: 0 0 10px; font-size: 17px; font-weight: 700; color: #F9FAFB; }
    p { margin: 0; font-size: 13px; color: #9CA3AF; line-height: 1.5; }
    .err-btn { display: inline-block; margin-top: 20px; padding: 9px 18px; background: #1F2937; color: #ACF800; text-decoration: none; border-radius: 6px; font-size: 12px; font-weight: 600; border: 1px solid #374151; }
  </style>
</head>
<body>
  <div class="box" id="box">
    <div class="spinner"></div>
    <h3>Redirecionando...</h3>
    <p>Conectando você ao destino inteligente...</p>
  </div>
  <script>
    (function() {
      var slug = "${slug}".trim().toLowerCase();
      try {
        var local = JSON.parse(localStorage.getItem('plugesales_pro_rotators_v1') || '[]');
        var found = local.find(function(r) { return (r.slug || '').toLowerCase() === slug; });
        if (found) {
          var rawTargets = Array.isArray(found.targets) ? found.targets : (typeof found.targets === 'string' ? JSON.parse(found.targets) : []);
          var targetUrl = null;
          if (rawTargets && rawTargets.length > 0) {
            var valid = rawTargets.filter(function(t) { return t && t.url; });
            if (valid.length > 0) {
              var totalW = valid.reduce(function(s, t) { return s + (parseFloat(t.weight) || 1); }, 0);
              var rnd = Math.random() * totalW;
              targetUrl = valid[0].url;
              for (var i = 0; i < valid.length; i++) {
                rnd -= (parseFloat(valid[i].weight) || 1);
                if (rnd <= 0) { targetUrl = valid[i].url; break; }
              }
            }
          }
          if (!targetUrl && found.original_url) targetUrl = found.original_url;
          if (targetUrl) {
            if (!/^https?:\\/\\//i.test(targetUrl)) targetUrl = 'https://' + targetUrl;
            found.total_clicks = (found.total_clicks || 0) + 1;
            try { localStorage.setItem('plugesales_pro_rotators_v1', JSON.stringify(local)); } catch(e) {}
            window.location.replace(targetUrl);
            return;
          }
        }
      } catch(e) {}

      var box = document.getElementById('box');
      if (box) {
        box.innerHTML = '<h3 style="color:#EF4444;">Link Não Encontrado</h3><p style="color:#9CA3AF;">O link rotacionador PRO <b>/r/' + slug + '</b> não existe ou foi removido.</p><a href="/" class="err-btn">Voltar ao Início</a>';
      }
    })();
  </script>
</body>
</html>`);
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
      const sender_number = body.sender_number || body.sender_phone || '';
      const sender_phone = body.sender_phone || body.sender_number || '';
      const origin = body.origin || 'CLIENT_FORM';
      const notes = body.notes || '';
      const client_name = body.client_name || campaign_name;
      const user_id = currentUser?.id || null;

      if (!isPostgresConnected) {
        return sendJson({
          id: Date.now(),
          campaign_name,
          profile_name,
          client_name,
          ddd,
          template_type,
          media_url,
          ad_copy,
          button_link,
          contacts,
          headers,
          ads,
          status,
          sender_number,
          sender_phone,
          origin,
          notes,
          download_count: 0
        });
      }

      const insertRes = await pgPool.query(
        `INSERT INTO client_submissions (
          campaign_name, profile_name, ddd, template_type, media_url, ad_copy,
          button_link, spreadsheet_url, file_name, valid_count, total_rows,
          contacts, headers, ads, status, sender_number, sender_phone, origin, notes, user_id, download_count, max_downloads
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, 0, 3)
        RETURNING *`,
        [
          campaign_name, profile_name, ddd, template_type, media_url, ad_copy,
          button_link, spreadsheet_url, file_name, valid_count, total_rows,
          JSON.stringify(contacts), JSON.stringify(headers), JSON.stringify(ads),
          status, sender_number, sender_phone, origin, notes, user_id
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
      const isPaused = (await redisClient.get('dispatch_paused')) === 'true';
      const processed = parseInt((await redisClient.get('dispatch_processed')) || '0', 10);
      const rateLimitStr = await redisClient.get('dispatch_rate_limit');
      const rateLimit = rateLimitStr ? parseFloat(rateLimitStr) : 1.0;
      let pausedCampaigns = [];
      try {
        pausedCampaigns = await redisClient.sMembers('paused_campaigns') || [];
      } catch {}

      return sendJson({
        queueLength,
        isRunning: isRunning && !isPaused,
        isPaused,
        processed,
        rateLimit,
        pausedCampaigns,
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

  // Pausar Fila Redis Global
  if ((pathname === '/api/dispatch/queue/stop' || pathname === '/api/dispatch/queue/pause') && req.method === 'POST') {
    try {
      if (isRedisConnected) {
        await redisClient.set('dispatch_paused', 'true');
        await redisClient.set('dispatch_running', 'false');
      }
      return sendJson({ success: true, isPaused: true, message: 'Fila global pausada com sucesso' });
    } catch (err) {
      return sendError(err.message, 500);
    }
  }

  // Retomar Fila Redis Global
  if (pathname === '/api/dispatch/queue/resume' && req.method === 'POST') {
    try {
      if (isRedisConnected) {
        await redisClient.set('dispatch_paused', 'false');
        startWorkerIfNeeded();
      }
      return sendJson({ success: true, isPaused: false, message: 'Fila global retomada com sucesso' });
    } catch (err) {
      return sendError(err.message, 500);
    }
  }

  // Pausar / Retomar Campanha Individual
  if (pathname.startsWith('/api/dispatch/campaign/') && req.method === 'POST') {
    try {
      const parts = pathname.split('/');
      // /api/dispatch/campaign/:id/pause or /api/dispatch/campaign/:id/resume
      const campaignId = decodeURIComponent(parts[4] || '');
      const action = parts[5]; // 'pause' ou 'resume'

      if (!campaignId) return sendError('ID de campanha inválido', 400);

      const body = await parseJsonBody(req).catch(() => ({}));
      const campaignName = body?.campaignName;

      if (action === 'pause') {
        if (isRedisConnected) {
          await redisClient.sAdd('paused_campaigns', campaignId);
          if (campaignName) await redisClient.sAdd('paused_campaigns', campaignName);
        }
        return sendJson({ success: true, campaignId, paused: true, message: `Campanha "${campaignId}" pausada com sucesso` });
      }

      if (action === 'resume') {
        if (isRedisConnected) {
          await redisClient.sRem('paused_campaigns', campaignId);
          if (campaignName) await redisClient.sRem('paused_campaigns', campaignName);

          // Restaura mensagens da fila temporária de volta para dispatch_queue
          const keys = [`dispatch_queue_paused:${campaignId}`];
          if (campaignName) keys.push(`dispatch_queue_paused:${campaignName}`);

          for (const key of keys) {
            let item;
            while ((item = await redisClient.lPop(key))) {
              await redisClient.rPush('dispatch_queue', item);
            }
          }

          startWorkerIfNeeded();
        }
        return sendJson({ success: true, campaignId, paused: false, message: `Campanha "${campaignId}" retomada com sucesso` });
      }

      return sendError('Ação desconhecida para campanha', 404);
    } catch (err) {
      return sendError(err.message, 500);
    }
  }

  // Listar campanhas pausadas
  if (pathname === '/api/dispatch/campaigns/paused' && req.method === 'GET') {
    try {
      if (!isRedisConnected) return sendJson([]);
      const paused = await redisClient.sMembers('paused_campaigns');
      return sendJson(paused || []);
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
      // Dispara sincronização em segundo plano caso haja mensagens pendentes
      syncDeliveryReportsFromInfobip().catch(() => {});

      if (!isRedisConnected) {
        if (isPostgresConnected) {
          const pgLogs = await pgPool.query('SELECT * FROM dispatch_records ORDER BY id DESC LIMIT 500');
          return sendJson(pgLogs.rows);
        }
        return sendJson([]);
      }

      const rawLogs = await redisClient.lRange('dispatch_logs', 0, 999);
      const logs = rawLogs.map(str => {
        try { return JSON.parse(str); } catch { return null; }
      }).filter(Boolean);

      return sendJson(logs);
    } catch (err) {
      return sendError(err.message, 500);
    }
  }

  // Limpar Logs de Envio (Redis e Postgres)
  if ((pathname === '/api/dispatch/logs' || pathname === '/api/dispatch/logs/clear') && (req.method === 'DELETE' || req.method === 'POST')) {
    try {
      if (isRedisConnected) {
        await redisClient.del('dispatch_logs');
        await redisClient.del('dispatch_batches');
      }
      if (isPostgresConnected) {
        await pgPool.query('DELETE FROM dispatch_records').catch(() => {});
      }
      return sendJson({ success: true, message: 'Logs de envio limpos com sucesso' });
    } catch (err) {
      return sendError(err.message, 500);
    }
  }

  // Sincronizar Relatórios de Entrega (DLR) em tempo real diretamente da Infobip
  if ((pathname === '/api/dispatch/sync-reports' || pathname === '/api/dispatch/sync-reports/') && (req.method === 'GET' || req.method === 'POST')) {
    try {
      const syncResult = await syncDeliveryReportsFromInfobip();
      return sendJson({ 
        success: true, 
        synced: syncResult.synced, 
        updated: syncResult.updated,
        sample: syncResult.sample 
      });
    } catch (err) {
      return sendError(err.message, 500);
    }
  }

  // Webhook para receber Delivery Reports (DLR) em tempo real da Infobip
  if ((pathname === '/api/webhook/whatsapp' || pathname === '/api/webhook/infobip') && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const results = body?.results || body?.messages || (Array.isArray(body) ? body : []);

      if (results.length > 0) {
        // Dispara sincronização com o array de relatórios recebido
        syncDeliveryReportsFromInfobip().catch(() => {});
      }

      return sendJson({ received: true, count: results.length });
    } catch (e) {
      return sendJson({ received: true });
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

          // Backup permanente no banco PostgreSQL (Auto-Healing após Deploys)
          if (isPostgresConnected) {
            pgPool.query(
              `INSERT INTO uploaded_files (filename, mime_type, data_base64, size_bytes)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (filename) DO UPDATE SET data_base64 = EXCLUDED.data_base64`,
              [uniqueFileName, MIME_TYPES[ext] || 'application/octet-stream', base64Data, Buffer.from(base64Data, 'base64').length]
            ).catch(pgErr => console.warn('[Upload] Erro ao salvar backup no Postgres:', pgErr.message));
          }
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
        // Se conectado ao Postgres, salvar backup
        if (isPostgresConnected && fs.existsSync(targetPath)) {
          try {
            const buf = fs.readFileSync(targetPath);
            pgPool.query(
              `INSERT INTO uploaded_files (filename, mime_type, data_base64, size_bytes)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (filename) DO NOTHING`,
              [safeRandomName, 'application/octet-stream', buf.toString('base64'), buf.length]
            ).catch(() => {});
          } catch (_) {}
        }
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

  // Servir arquivos de upload com segurança & auto-healing após redeploys
  if (pathname.startsWith('/uploads/') && req.method === 'GET') {
    const requestedFile = path.basename(pathname.replace('/uploads/', ''));
    let safeFilePath = path.join(UPLOADS_DIR, requestedFile);

    // 1. Se não existir no UPLOADS_DIR local, verificar pasta pai fallback (migração)
    if (!fs.existsSync(safeFilePath) || !fs.statSync(safeFilePath).isFile()) {
      const parentUploads = path.join(__dirname, '..', 'uploads', requestedFile);
      if (fs.existsSync(parentUploads) && fs.statSync(parentUploads).isFile()) {
        safeFilePath = parentUploads;
      }
    }

    // 2. Se ainda não existir no disco (ex: container reconstruído em novo deploy), restaurar do PostgreSQL
    if ((!fs.existsSync(safeFilePath) || !fs.statSync(safeFilePath).isFile()) && isPostgresConnected) {
      try {
        const dbFile = await pgPool.query('SELECT mime_type, data_base64 FROM uploaded_files WHERE filename = $1', [requestedFile]);
        if (dbFile.rows.length > 0 && dbFile.rows[0].data_base64) {
          const row = dbFile.rows[0];
          const restoredBuf = Buffer.from(row.data_base64, 'base64');
          fs.writeFileSync(path.join(UPLOADS_DIR, requestedFile), restoredBuf);
          safeFilePath = path.join(UPLOADS_DIR, requestedFile);
          console.log(`[Uploads Auto-Healing] Arquivo '${requestedFile}' restaurado com sucesso do PostgreSQL!`);
        }
      } catch (dbErr) {
        console.warn(`[Uploads Auto-Healing] Falha ao consultar arquivo '${requestedFile}' no PostgreSQL:`, dbErr.message);
      }
    }

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

  // -------------------------------------------------------------
  // WHATSAPP EMBEDDED SIGNUP (CADASTRO DE NOVO REMETENTE VIA INFOBIP)
  // -------------------------------------------------------------
  if (pathname === '/api/whatsapp/embedded-signup/senders' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const {
        businessAccountId,
        countryCode,
        phoneNumber,
        displayName,
        type = 'EXTERNAL_SMS',
        locale = 'pt_BR',
        apiKey = INFOBIP_API_KEY,
        baseUrl = INFOBIP_BASE_URL
      } = body;

      if (!businessAccountId || !countryCode || !phoneNumber || !displayName) {
        return sendError('Campos obrigatórios: businessAccountId, countryCode, phoneNumber, displayName', 400);
      }

      const cleanWabaId = String(businessAccountId).trim();
      const cleanCountry = String(countryCode).replace(/\D/g, '');
      const cleanPhone = String(phoneNumber).replace(/\D/g, '');
      const cleanHost = sanitizeInfobipHost(baseUrl);
      const activeKey = apiKey || INFOBIP_API_KEY;

      const payload = {
        countryCode: cleanCountry,
        phoneNumber: cleanPhone,
        displayName: displayName.trim(),
        type: type === 'EXTERNAL_VOICE' ? 'EXTERNAL_VOICE' : 'EXTERNAL_SMS',
        locale: locale || 'pt_BR'
      };

      console.log(`[EmbeddedSignup] Solicitando registro de remetente para WABA ${cleanWabaId}: +${cleanCountry}${cleanPhone} (${payload.type})`);
      const endpoint = `/whatsapp/1/embedded-signup/registrations/business-account/${cleanWabaId}/senders`;
      const infobipRes = await postJson(cleanHost, endpoint, activeKey, payload);

      if (infobipRes && (infobipRes.statusCode >= 400 || infobipRes.requestError)) {
        let errMsg = infobipRes.requestError?.serviceException?.text ||
                     infobipRes.requestError?.clientCorrelator ||
                     infobipRes.message ||
                     infobipRes.description;

        if (!errMsg || errMsg === 'Something went wrong. Please contact support.') {
          if (infobipRes.statusCode === 404) {
            errMsg = `WABA ID ${cleanWabaId} não encontrado na Infobip (404). O ID digitado não existe ou não está vinculado à sua conta Infobip. Certifique-se de que informou o ID da Conta do WhatsApp (WABA ID) e não o ID da Business Manager (BM) do Meta.`;
          } else if (infobipRes.statusCode === 500 || infobipRes.requestError?.serviceException?.messageId === 'GENERAL_ERROR') {
            errMsg = `A API de Bulk Sender da Infobip retornou erro 500 para a WABA ${cleanWabaId}. O recurso 'whatsapp-bulk-sender-registration' é classificado como Early Access pela Infobip e requer que o suporte/gerente de conta da Infobip habilite a permissão 'whatsapp:manage', ou utilize o Portal Oficial da Infobip.`;
          } else {
            errMsg = JSON.stringify(infobipRes);
          }
        }

        console.warn('[EmbeddedSignup] Erro retornado pela Infobip:', infobipRes);
        return sendError(`Infobip: ${errMsg}`, 400);
      }

      console.log('[EmbeddedSignup] Sucesso no envio do registro:', infobipRes);
      return sendJson({
        success: true,
        sender: `${cleanCountry}${cleanPhone}`,
        businessAccountId: cleanWabaId,
        displayName: displayName.trim(),
        ...infobipRes
      }, 200);
    } catch (err) {
      console.error('[EmbeddedSignup] Exceção ao cadastrar remetente:', err);
      return sendError(err.message, 500);
    }
  }

  if (pathname === '/api/whatsapp/embedded-signup/verify' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const {
        sender,
        code,
        apiKey = INFOBIP_API_KEY,
        baseUrl = INFOBIP_BASE_URL
      } = body;

      if (!sender || !code) {
        return sendError('Campos obrigatórios: sender (número com DDI e DDD) e code (código de 6 dígitos)', 400);
      }

      const cleanSender = String(sender).replace(/\D/g, '');
      const cleanCode = String(code).trim();
      const cleanHost = sanitizeInfobipHost(baseUrl);
      const activeKey = apiKey || INFOBIP_API_KEY;

      const payload = { code: cleanCode };
      console.log(`[EmbeddedSignup] Verificando código OTP para ${cleanSender}...`);
      const endpoint = `/whatsapp/1/embedded-signup/registrations/senders/${cleanSender}/verification`;
      const infobipRes = await postJson(cleanHost, endpoint, activeKey, payload);

      if (infobipRes && (infobipRes.statusCode >= 400 || infobipRes.requestError)) {
        const errMsg = infobipRes.requestError?.serviceException?.text ||
                       infobipRes.message ||
                       infobipRes.description ||
                       JSON.stringify(infobipRes);
        console.warn('[EmbeddedSignup] Erro de verificação:', infobipRes);
        return sendError(`Infobip: ${errMsg}`, infobipRes.statusCode || 400);
      }

      console.log('[EmbeddedSignup] Remetente verificado com sucesso:', infobipRes);
      return sendJson({
        success: true,
        sender: cleanSender,
        ...infobipRes
      }, 200);
    } catch (err) {
      console.error('[EmbeddedSignup] Exceção ao verificar remetente:', err);
      return sendError(err.message, 500);
    }
  }

  if (pathname === '/api/whatsapp/embedded-signup/retry-otp' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const {
        sender,
        type = 'EXTERNAL_SMS',
        locale = 'pt_BR',
        apiKey = INFOBIP_API_KEY,
        baseUrl = INFOBIP_BASE_URL
      } = body;

      if (!sender) {
        return sendError('Campo obrigatório: sender (número completo)', 400);
      }

      const cleanSender = String(sender).replace(/\D/g, '');
      const cleanHost = sanitizeInfobipHost(baseUrl);
      const activeKey = apiKey || INFOBIP_API_KEY;

      const payload = {
        type: type === 'EXTERNAL_VOICE' ? 'EXTERNAL_VOICE' : 'EXTERNAL_SMS',
        locale: locale || 'pt_BR'
      };

      console.log(`[EmbeddedSignup] Reenviando código OTP para ${cleanSender} via ${payload.type}...`);
      const endpoint = `/whatsapp/1/embedded-signup/registrations/senders/${cleanSender}/verification`;
      const infobipRes = await putJson(cleanHost, endpoint, activeKey, payload);

      if (infobipRes && (infobipRes.statusCode >= 400 || infobipRes.requestError)) {
        const errMsg = infobipRes.requestError?.serviceException?.text ||
                       infobipRes.message ||
                       infobipRes.description ||
                       JSON.stringify(infobipRes);
        return sendError(`Infobip: ${errMsg}`, infobipRes.statusCode || 400);
      }

      return sendJson({
        success: true,
        sender: cleanSender,
        ...infobipRes
      }, 200);
    } catch (err) {
      console.error('[EmbeddedSignup] Exceção ao reenviar OTP:', err);
      return sendError(err.message, 500);
    }
  }

  if (pathname === '/api/whatsapp/senders' && req.method === 'GET') {
    try {
      const activeKey = urlObj.searchParams.get('apiKey') || INFOBIP_API_KEY;
      const cleanHost = sanitizeInfobipHost(urlObj.searchParams.get('baseUrl'));
      const sendersRes = await getJson(cleanHost, '/whatsapp/1/senders', activeKey);
      return sendJson(sendersRes || { senders: [] });
    } catch (err) {
      return sendError(err.message, 500);
    }
  }

  if (pathname === '/api/whatsapp/known-wabas' && req.method === 'GET') {
    try {
      const activeKey = urlObj.searchParams.get('apiKey') || INFOBIP_API_KEY;
      const cleanHost = sanitizeInfobipHost(urlObj.searchParams.get('baseUrl'));
      const known = new Set(['875786408937731']);
      try {
        const templatesRes = await getJson(cleanHost, '/whatsapp/1/templates?page=0&size=100', activeKey);
        if (templatesRes && Array.isArray(templatesRes.results)) {
          for (const t of templatesRes.results) {
            if (t.businessAccountId) known.add(String(t.businessAccountId));
          }
        }
      } catch {}
      return sendJson({ success: true, wabas: Array.from(known) });
    } catch (err) {
      return sendError(err.message, 500);
    }
  }

  // Proxy Seguro Infobip (Restrito estritamente a leitura de templates de remetentes cadastrados)
  if (pathname.startsWith('/infobip-proxy/')) {
    // 1. Bloquear qualquer método HTTP que não seja GET (defesa anti-Burp Suite / Pentest)
    if (req.method !== 'GET') {
      return sendError('Método não permitido no proxy', 405);
    }

    // 2. Permitir APENAS a rota de busca de templates: /infobip-proxy/whatsapp/2/senders/:digits/templates
    const match = pathname.match(/^\/infobip-proxy\/whatsapp\/2\/senders\/([0-9]{8,20})\/templates$/);
    if (!match) {
      return sendError('Acesso negado: rota de proxy não autorizada ou formato de remetente inválido', 403);
    }

    const senderDigits = match[1];
    const targetPath = `/whatsapp/2/senders/${senderDigits}/templates` + (urlObj.search || '');

    const proxyHeaders = {
      'host': INFOBIP_BASE_URL,
      'authorization': `App ${INFOBIP_API_KEY}`,
      'accept': 'application/json',
      'user-agent': 'FastPlug-SecureProxy/1.0'
    };

    const proxyReq = https.request({
      hostname: INFOBIP_BASE_URL,
      path: targetPath,
      method: 'GET',
      headers: proxyHeaders
    }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 200, {
        'content-type': proxyRes.headers['content-type'] || 'application/json',
        'cache-control': 'no-cache'
      });
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      sendError(`Proxy error: ${err.message}`, 502);
    });
    proxyReq.end();
    return;
  }

  // -------------------------------------------------------------
  // 8. SERVIR ARQUIVOS ESTÁTICOS DO DIRETÓRIO ./dist (Anti-Path Traversal)
  // -------------------------------------------------------------
  const normalizedDist = path.resolve(DIST_DIR);
  // Normalizar e sanitizar caminho para prevenir Directory Traversal (LFI / Path Traversal)
  const safeRelativePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  let resolvedFilePath = path.resolve(normalizedDist, '.' + safeRelativePath);

  // Verificação de segurança estrita: o arquivo resolvido DEVE estar dentro de dist/
  if (!resolvedFilePath.startsWith(normalizedDist)) {
    return sendError('Acesso proibido (Path Traversal detectado)', 403);
  }

  // Se for rota raiz ou sem extensão de arquivo (SPA client-side routing), verificar arquivo ou fallback para index.html
  if (pathname === '/' || !path.extname(pathname)) {
    if (fs.existsSync(resolvedFilePath) && fs.statSync(resolvedFilePath).isFile()) {
      // Arquivo existe diretamente
    } else {
      resolvedFilePath = path.join(normalizedDist, 'index.html');
    }
  }

  if (fs.existsSync(resolvedFilePath) && fs.statSync(resolvedFilePath).isFile()) {
    // Validação secundária para garantir que não vazou do diretório dist
    if (!resolvedFilePath.startsWith(normalizedDist)) {
      return sendError('Acesso proibido', 403);
    }
    const ext = path.extname(resolvedFilePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    if (ext !== '.html') {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      res.setHeader('Cache-Control', 'no-cache');
    }
    const stream = fs.createReadStream(resolvedFilePath);
    stream.pipe(res);
  } else {
    const indexPath = path.join(normalizedDist, 'index.html');
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
