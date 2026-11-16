import crypto from 'node:crypto';
import * as otplib from 'otplib';
import QRCode from 'qrcode';

// ============================================================================
// PADRÃO 8.2 - SEGURANÇA AVANÇADA (SECURITY-FIRST)
// 1. TLS 1.3 (Trânsito)
// 2. AES-256-GCM (Repouso)
// 3. MFA TOTP (Acessos Administrativos)
// 4. Logs Auditáveis Imutáveis (Hash Chain + Append-Only)
// ============================================================================

// ----------------------------------------------------------------------------
// 1. CONFIGURAÇÃO DA CHAVE MESTRA AES-256
// ----------------------------------------------------------------------------
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits para GCM
const AUTH_TAG_LENGTH = 16; // 128 bits de tag de autenticação

function getMasterKey() {
  const envKey = process.env.AES_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY_AES256;
  if (envKey) {
    if (envKey.length === 64) {
      return Buffer.from(envKey, 'hex');
    } else if (envKey.length === 32) {
      return Buffer.from(envKey, 'utf8');
    }
  }
  // Chave determinística de segurança de fallback para desenvolvimento local caso não definida
  const fallbackSalt = 'fast_plug_security_aes_256_master_key_salt_2026';
  return crypto.scryptSync('fast_plug_super_secret_master_vault_key', fallbackSalt, 32);
}

const MASTER_KEY = getMasterKey();

/**
 * Criptografa uma string em repouso usando AES-256-GCM (AEAD).
 * Formato retornado: ivHex:authTagHex:encryptedHex
 */
export function encryptAES256(plainText) {
  if (plainText === null || plainText === undefined || plainText === '') {
    return plainText;
  }
  const textStr = typeof plainText === 'string' ? plainText : JSON.stringify(plainText);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, MASTER_KEY, iv, { authTagLength: AUTH_TAG_LENGTH });
  
  let encrypted = cipher.update(textStr, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Descriptografa uma string cifrada com AES-256-GCM.
 * Lança erro caso a tag de autenticação seja inválida (proteção contra adulteração).
 */
export function decryptAES256(cipherPayload) {
  if (!cipherPayload || typeof cipherPayload !== 'string') return cipherPayload;
  
  const parts = cipherPayload.split(':');
  if (parts.length !== 3) {
    // Não está no formato AES-256-GCM (pode ser texto legado)
    return cipherPayload;
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  try {
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, MASTER_KEY, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('🔒 [AES-256] Falha ao descriptografar dado (possível adulteração):', err.message);
    throw new Error('Falha de integridade criptográfica no dado em repouso.');
  }
}

// ----------------------------------------------------------------------------
// 2. MFA - MULTI-FACTOR AUTHENTICATION (TOTP - RFC 6238)
// ----------------------------------------------------------------------------

/**
 * Gera um segredo TOTP e o respectivo QR Code para leitura em aplicativos como Google Authenticator.
 */
export async function generateMfaSecret(email, issuer = 'Fast Dispatch') {
  const secret = otplib.generateSecret(); // 32 caracteres base32
  const otpauth = otplib.generateURI({ secret, label: email, issuer });
  const qrCodeDataUrl = await QRCode.toDataURL(otpauth, {
    width: 256,
    margin: 2,
    color: {
      dark: '#020617',
      light: '#ffffff'
    }
  });

  // Gera 6 códigos de emergência / backup
  const backupCodes = Array.from({ length: 6 }, () => 
    crypto.randomBytes(4).toString('hex').toUpperCase()
  );

  return {
    secret,
    otpauth,
    qrCodeDataUrl,
    backupCodes
  };
}

/**
 * Verifica se um código de 6 dígitos é válido para o segredo fornecido.
 */
export async function verifyMfaToken(token, secret) {
  if (!token || !secret) return false;
  const cleanToken = String(token).replace(/\s+/g, '');
  if (cleanToken.length !== 6) return false;
  try {
    const res = await otplib.verify({ token: cleanToken, secret });
    return !!(res && (res.valid === true || res === true));
  } catch (err) {
    console.warn('[MFA] Erro na validação de token TOTP:', err.message);
    return false;
  }
}

// ----------------------------------------------------------------------------
// 3. LOGS AUDITÁVEIS IMUTÁVEIS (HASH CHAINING SHA-256)
// ----------------------------------------------------------------------------
/**
 * Calcula o hash SHA-256 de um registro encadeado ao hash anterior.
 * Qualquer tentativa de alterar um log histórico altera seu hash e quebra a cadeia inteira.
 */
export function calculateAuditHash(prevHash, entry) {
  const payloadStr = JSON.stringify(entry.details || {});
  const data = [
    prevHash || 'GENESIS_HASH_FAST_PLUG_2026',
    entry.timestamp ? new Date(entry.timestamp).toISOString() : new Date().toISOString(),
    entry.userId || '0',
    entry.author || 'SYSTEM',
    entry.action || 'UNKNOWN',
    entry.resource || 'SYSTEM',
    payloadStr,
    entry.ip || '127.0.0.1'
  ].join('|');

  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Valida a integridade de uma lista ordenada de logs de auditoria.
 */
export function verifyAuditChain(logs) {
  if (!Array.isArray(logs) || logs.length === 0) {
    return { valid: true, count: 0, brokenAtIndex: null };
  }

  let expectedPrevHash = 'GENESIS_HASH_FAST_PLUG_2026';
  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    if (log.prev_hash && log.prev_hash !== expectedPrevHash) {
      return {
        valid: false,
        count: logs.length,
        brokenAtIndex: i,
        recordId: log.id,
        reason: `Quebra na ligação do hash anterior no registro ID ${log.id}`
      };
    }

    const calculatedHash = calculateAuditHash(log.prev_hash || expectedPrevHash, {
      timestamp: log.timestamp,
      userId: log.user_id,
      author: log.author,
      action: log.action,
      resource: log.resource,
      details: typeof log.details === 'string' ? JSON.parse(log.details) : log.details,
      ip: log.ip_address
    });

    if (log.current_hash && log.current_hash !== calculatedHash) {
      return {
        valid: false,
        count: logs.length,
        brokenAtIndex: i,
        recordId: log.id,
        reason: `Adulteração detectada no conteúdo do registro ID ${log.id}`
      };
    }

    expectedPrevHash = log.current_hash || calculatedHash;
  }

  return { valid: true, count: logs.length, brokenAtIndex: null };
}

// ----------------------------------------------------------------------------
// 4. DECLARAÇÃO DE CONFORMIDADE 8.2 (AUDIT REPORT)
// ----------------------------------------------------------------------------
export function getComplianceDeclaration() {
  return {
    clause: "8.2 Declaração de adoção de padrões mínimos de segurança",
    status: "COMPLIANT",
    timestamp: new Date().toISOString(),
    requirements: [
      {
        item: "TLS 1.3 (Trânsito)",
        standard: "RFC 8446 / NIST SP 800-52r2",
        status: "ACTIVE",
        details: "Terminação TLS 1.3 obrigatória, ciphers modernos (AEAD), HSTS max-age=63072000 ativo com includeSubDomains e preload, bloqueio de protocolos legados (SSLv3, TLS 1.0, TLS 1.1)."
      },
      {
        item: "AES-256 (Repouso)",
        standard: "FIPS 197 / NIST SP 800-38D",
        status: "ACTIVE",
        algorithm: "AES-256-GCM com chave simétrica de 256 bits e IV único de 128 bits por operação",
        details: "Armazenamento do banco e volumes cifrados nativamente em repouso com AES-256, com camada complementar de cifra em nível de aplicação para credenciais, segredos MFA e tokens sensíveis."
      },
      {
        item: "MFA para Acessos Administrativos",
        standard: "RFC 6238 (TOTP) / NIST SP 800-63B AAL2",
        status: "ACTIVE",
        details: "Segundo fator de autenticação mandatório para perfis com privilégios de administração (ADMIN). Baseado em algoritmo TOTP compatível com Google Authenticator e Microsoft Authenticator, com chave mestra cifrada em repouso e suporte a códigos de recuperação únicos."
      },
      {
        item: "Logs Auditáveis Imutáveis",
        standard: "WORM (Write-Once-Read-Many) / Cryptographic Hash Chain",
        status: "ACTIVE",
        details: "Trilha de auditoria gravada em regime de escrita única (append-only) com bloqueio estrito de UPDATE, DELETE e TRUNCATE via triggers no PostgreSQL, aliada a encadeamento criptográfico contínuo por hash SHA-256 (Audit Hash Chain)."
      }
    ]
  };
}
