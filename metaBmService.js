import crypto from 'crypto'

const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0'
const ENCRYPTION_SECRET = process.env.ENCRYPTION_KEY || 'thsm-distribuidora-secret-salt-2026'
const KEY = crypto.createHash('sha256').update(ENCRYPTION_SECRET).digest()

export function encryptToken(text) {
  if (!text) return ''
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-cbc', KEY, iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return `${iv.toString('hex')}:${encrypted}`
}

export function decryptToken(encryptedText) {
  if (!encryptedText) return ''
  try {
    const parts = encryptedText.split(':')
    if (parts.length !== 2) return encryptedText
    const iv = Buffer.from(parts[0], 'hex')
    const decipher = crypto.createDecipheriv('aes-256-cbc', KEY, iv)
    let decrypted = decipher.update(parts[1], 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch (e) {
    console.error('Erro ao decifrar token:', e.message)
    return encryptedText
  }
}

export function maskToken(token) {
  if (!token) return ''
  const clean = String(token).trim()
  if (clean.length <= 8) return '****'
  return `${clean.slice(0, 4)}••••••••${clean.slice(-4)}`
}

// Faz requisição autenticada à Graph API da Meta com tratamento de erros
async function metaGet(endpoint, token, params = {}) {
  const cleanToken = String(token || '').trim()
  const cleanEndpoint = String(endpoint || '').replace(/^\//, '').trim()
  const url = new URL(`${GRAPH_API_BASE}/${cleanEndpoint}`)
  url.searchParams.set('access_token', cleanToken)
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
  }

  let res
  try {
    res = await fetch(url.toString(), {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(20000)
    })
  } catch (netErr) {
    throw new Error(`Falha de conexão com a Meta Graph API (${netErr.message})`)
  }

  let json = {}
  try {
    const raw = await res.text()
    json = raw ? JSON.parse(raw) : {}
  } catch (pErr) {
    throw new Error(`Resposta inválida da Meta Graph API (HTTP ${res.status})`)
  }

  if (!res.ok || json.error) {
    const errMsg = json.error?.message || `Erro HTTP ${res.status} da Meta`
    const code = json.error?.code
    const subcode = json.error?.error_subcode
    const err = new Error(errMsg)
    err.code = code
    err.subcode = subcode
    err.metaError = json.error
    throw err
  }
  return json
}

// Testa a BM e token, buscando dados cadastrais e contas WABA associadas
export async function testAndFetchBm(bmId, token) {
  const cleanBmId = String(bmId || '').trim()
  const cleanToken = String(token || '').trim()

  if (!cleanBmId) throw new Error('ID da BM é obrigatório')
  if (!cleanToken) throw new Error('Token do usuário do sistema é obrigatório')

  // 1. Valida BM e permissões
  let bmData = { id: cleanBmId, name: 'BM Meta' }
  try {
    const res = await metaGet(cleanBmId, cleanToken, {
      fields: 'id,name,verification_status,created_time'
    })
    bmData = res
  } catch (err) {
    // Se o token for de nível de WABA direto ou usuário de sistema restrito, tenta obter /me
    try {
      const me = await metaGet('me', cleanToken, { fields: 'id,name' })
      bmData = { id: cleanBmId, name: me.name || 'BM ' + cleanBmId }
    } catch (meErr) {
      throw new Error(`Token ou ID inválido na Meta Graph API: ${err.message}`)
    }
  }

  // 2. Busca WABAs próprias (owned), compartilhadas (client) ou associadas
  let wabas = []
  const seenWabaIds = new Set()

  // A. Owned WABAs da BM
  try {
    const owned = await metaGet(`${cleanBmId}/owned_whatsapp_business_accounts`, cleanToken, {
      fields: 'id,name,currency,timezone_id,message_template_namespace,account_review_status'
    })
    if (owned.data && Array.isArray(owned.data)) {
      owned.data.forEach(w => {
        if (!seenWabaIds.has(w.id)) {
          seenWabaIds.add(w.id)
          wabas.push({ ...w, tipo_propriedade: 'owned' })
        }
      })
    }
  } catch (err) {
    console.warn(`[Meta] owned_whatsapp_business_accounts: ${err.message}`)
  }

  // B. Client WABAs da BM
  try {
    const client = await metaGet(`${cleanBmId}/client_whatsapp_business_accounts`, cleanToken, {
      fields: 'id,name,currency,timezone_id,message_template_namespace,account_review_status'
    })
    if (client.data && Array.isArray(client.data)) {
      client.data.forEach(w => {
        if (!seenWabaIds.has(w.id)) {
          seenWabaIds.add(w.id)
          wabas.push({ ...w, tipo_propriedade: 'client' })
        }
      })
    }
  } catch (err) {
    console.warn(`[Meta] client_whatsapp_business_accounts: ${err.message}`)
  }

  // C. Direct whatsapp_business_accounts edge
  try {
    const directWabas = await metaGet(`${cleanBmId}/whatsapp_business_accounts`, cleanToken, {
      fields: 'id,name,currency,timezone_id,message_template_namespace,account_review_status'
    })
    if (directWabas.data && Array.isArray(directWabas.data)) {
      directWabas.data.forEach(w => {
        if (!seenWabaIds.has(w.id)) {
          seenWabaIds.add(w.id)
          wabas.push({ ...w, tipo_propriedade: 'owned' })
        }
      })
    }
  } catch (_) {}

  // D. Se o cleanBmId fornecido for o próprio ID da WABA
  if (wabas.length === 0) {
    try {
      const singleWaba = await metaGet(cleanBmId, cleanToken, {
        fields: 'id,name,currency,timezone_id,message_template_namespace,account_review_status'
      })
      if (singleWaba && singleWaba.id) {
        if (!seenWabaIds.has(singleWaba.id)) {
          seenWabaIds.add(singleWaba.id)
          wabas.push({ ...singleWaba, tipo_propriedade: 'direct' })
        }
      }
    } catch (_) {}
  }

  // E. Se o cleanBmId for um Phone Number ID
  if (wabas.length === 0) {
    try {
      const phoneRes = await metaGet(cleanBmId, cleanToken, {
        fields: 'id,display_phone_number,verified_name,whatsapp_business_account'
      })
      if (phoneRes?.whatsapp_business_account?.id) {
        const wId = phoneRes.whatsapp_business_account.id
        if (!seenWabaIds.has(wId)) {
          seenWabaIds.add(wId)
          try {
            const wInfo = await metaGet(wId, cleanToken, {
              fields: 'id,name,currency,timezone_id,message_template_namespace,account_review_status'
            })
            wabas.push({ ...wInfo, tipo_propriedade: 'direct' })
          } catch (_) {
            wabas.push({ id: wId, name: 'WABA ' + wId, tipo_propriedade: 'direct' })
          }
        }
      }
    } catch (_) {}
  }

  // F. Se o cleanBmId tiver phone_numbers diretamente vinculados
  if (wabas.length === 0) {
    try {
      const phoneDirect = await metaGet(`${cleanBmId}/phone_numbers`, cleanToken, {
        fields: 'id,display_phone_number,verified_name'
      })
      if (phoneDirect.data && phoneDirect.data.length > 0) {
        if (!seenWabaIds.has(cleanBmId)) {
          seenWabaIds.add(cleanBmId)
          wabas.push({
            id: cleanBmId,
            name: bmData.name || 'Conta WhatsApp ' + cleanBmId,
            tipo_propriedade: 'direct'
          })
        }
      }
    } catch (_) {}
  }

  // G. Busca via me/whatsapp_business_accounts caso o token seja de usuário de sistema com acesso direto
  if (wabas.length === 0) {
    try {
      const meWabas = await metaGet('me/whatsapp_business_accounts', cleanToken, {
        fields: 'id,name,currency,timezone_id,message_template_namespace,account_review_status'
      })
      if (meWabas?.data && Array.isArray(meWabas.data)) {
        meWabas.data.forEach(w => {
          if (!seenWabaIds.has(w.id)) {
            seenWabaIds.add(w.id)
            wabas.push({ ...w, tipo_propriedade: 'owned' })
          }
        })
      }
    } catch (_) {}
  }

  // H. Inspeção profunda de escopos granulares via debug_token
  // Essencial quando o usuário do sistema tem permissões diretas nas WABAs (whatsapp_business_management)
  // mas o token não possui permissão de business_management administrativo sobre toda a BM
  if (wabas.length === 0) {
    try {
      const debugRes = await metaGet('debug_token', cleanToken, {
        input_token: cleanToken
      })
      const granular = debugRes.data?.granular_scopes || []
      const targetWabaIds = new Set()

      granular.forEach(g => {
        if ((g.scope?.includes('whatsapp') || g.scope?.includes('manage')) && Array.isArray(g.target_ids)) {
          g.target_ids.forEach(id => targetWabaIds.add(String(id)))
        }
      })

      if (targetWabaIds.size > 0) {
        const resolved = await Promise.all(
          Array.from(targetWabaIds).map(async (wId) => {
            if (seenWabaIds.has(wId)) return null
            try {
              const wabaRes = await metaGet(wId, cleanToken, {
                fields: 'id,name,currency,timezone_id,message_template_namespace,account_review_status'
              })
              if (wabaRes && wabaRes.id && !wabaRes.error) {
                return { ...wabaRes, tipo_propriedade: 'owned' }
              }
            } catch (_) {}
            return null
          })
        )

        resolved.forEach(w => {
          if (w && !seenWabaIds.has(w.id)) {
            seenWabaIds.add(w.id)
            wabas.push(w)
          }
        })
      }
    } catch (debugErr) {
      console.warn(`[Meta] debug_token granular scopes: ${debugErr.message}`)
    }
  }

  // Se ainda assim não encontrou nenhuma WABA:
  if (wabas.length === 0) {
    throw new Error(`Acesso autenticado na Meta com sucesso (${bmData.name || cleanBmId}), mas nenhuma Conta do WhatsApp Business (WABA) ativa foi encontrada vinculada a este ID. Certifique-se de que o usuário do sistema possui controle total às contas do WhatsApp no Business Manager.`)
  }

  return {
    bm: bmData,
    wabas
  }
}

// Coleta detalhes profundos de uma WABA: telefones, templates, volume 24h e saúde
export async function fetchWabaDetails(wabaId, token) {
  const details = {
    wabaId,
    name: '',
    status: 'UNKNOWN',
    notificada: false,
    motivoNotificacao: '',
    numeros: [],
    templates: [],
    msgs24h: {
      enviadas: 0,
      entregues: 0,
      lidas: 0,
      conversas: 0
    }
  }

  // 1. Dados básicos e status de saúde da WABA
  try {
    const wabaInfo = await metaGet(wabaId, token, {
      fields: 'id,name,currency,timezone_id,account_review_status,onboarding_status,ban_state,health_status'
    })
    details.name = wabaInfo.name || ''
    details.status = wabaInfo.account_review_status || 'APPROVED'
    details.banState = wabaInfo.ban_state || 'NONE'

    if (wabaInfo.account_review_status && wabaInfo.account_review_status !== 'APPROVED') {
      details.notificada = true
      details.motivoNotificacao = `WABA com status: ${wabaInfo.account_review_status}`
    }
    if (wabaInfo.ban_state && wabaInfo.ban_state !== 'NONE' && wabaInfo.ban_state !== 'SCHEDULE_FOR_DISABLE') {
      details.notificada = true
      details.motivoNotificacao = `WABA em ban_state: ${wabaInfo.ban_state}`
    }
  } catch (err) {
    console.warn(`[Meta] Detalhes da WABA ${wabaId}: ${err.message}`)
  }

  // 2. Telefones conectados (com qualidade, limite de mensagens/tier e status)
  try {
    const phones = await metaGet(`${wabaId}/phone_numbers`, token, {
      fields: 'id,display_phone_number,verified_name,code_verification_status,quality_rating,messaging_limit_tier,status,throughput'
    })
    if (phones.data && Array.isArray(phones.data)) {
      details.numeros = phones.data.map(p => {
        const quality = (p.quality_rating || 'UNKNOWN').toUpperCase()
        const isBaixa = quality === 'RED' || quality === 'YELLOW'
        const isFlagged = (p.status || '').toUpperCase() === 'FLAGGED'

        return {
          id: p.id,
          display_phone_number: p.display_phone_number || '',
          verified_name: p.verified_name || '',
          code_verification_status: p.code_verification_status || 'NOT_VERIFIED',
          quality_rating: quality, // GREEN, YELLOW, RED, UNKNOWN
          messaging_limit_tier: p.messaging_limit_tier || 'TIER_250',
          status: p.status || 'CONNECTED',
          throughput: p.throughput || {},
          qualidadeBaixa: isBaixa || isFlagged,
          alerta: isFlagged ? 'Sinalizado (Flagged)' : (quality === 'RED' ? 'Qualidade Baixa' : (quality === 'YELLOW' ? 'Qualidade Média' : null))
        }
      })
    }
  } catch (err) {
    console.warn(`[Meta] Telefones da WABA ${wabaId}: ${err.message}`)
  }

  // Fallback se o próprio wabaId for um phone number:
  if (details.numeros.length === 0) {
    try {
      const singlePhone = await metaGet(wabaId, token, {
        fields: 'id,display_phone_number,verified_name,code_verification_status,quality_rating,messaging_limit_tier,status'
      })
      if (singlePhone && singlePhone.display_phone_number) {
        details.numeros.push({
          id: singlePhone.id,
          display_phone_number: singlePhone.display_phone_number,
          verified_name: singlePhone.verified_name || '',
          code_verification_status: singlePhone.code_verification_status || 'VERIFIED',
          quality_rating: (singlePhone.quality_rating || 'GREEN').toUpperCase(),
          messaging_limit_tier: singlePhone.messaging_limit_tier || 'TIER_250',
          status: singlePhone.status || 'CONNECTED',
          throughput: {},
          qualidadeBaixa: false,
          alerta: null
        })
      }
    } catch (_) {}
  }

  // 3. Templates de mensagem
  try {
    const tpls = await metaGet(`${wabaId}/message_templates`, token, {
      fields: 'id,name,status,category,language,components,quality_score,rejected_reason',
      limit: 250
    })
    if (tpls.data && Array.isArray(tpls.data)) {
      details.templates = tpls.data.map(t => {
        let bodyText = ''
        if (Array.isArray(t.components)) {
          const bodyComp = t.components.find(c => c.type === 'BODY')
          if (bodyComp && bodyComp.text) bodyText = bodyComp.text
        }
        return {
          id: t.id,
          name: t.name,
          status: (t.status || 'PENDING').toUpperCase(), // APPROVED, REJECTED, PENDING, PAUSED
          category: (t.category || 'MARKETING').toUpperCase(),
          language: t.language || 'pt_BR',
          rejected_reason: t.rejected_reason || null,
          quality_score: t.quality_score?.score || null,
          bodyText,
          components: t.components || []
        }
      })
    }
  } catch (err) {
    console.warn(`[Meta] Templates da WABA ${wabaId}: ${err.message}`)
  }

  // 4. Volume / Métricas das últimas 24 horas
  try {
    const end = Math.floor(Date.now() / 1000)
    const start = end - 86400 // últimas 24 horas

    const analyticsRes = await metaGet(wabaId, token, {
      fields: `conversation_analytics.start(${start}).end(${end}).granularity(HALF_HOUR).metric_types(SENT,DELIVERED,READ)`
    })

    const convData = analyticsRes.conversation_analytics?.data || []
    let totalSent = 0
    let totalDelivered = 0
    let totalRead = 0

    convData.forEach(d => {
      if (d.data_points) {
        d.data_points.forEach(dp => {
          if (dp.sent) totalSent += Number(dp.sent) || 0
          if (dp.delivered) totalDelivered += Number(dp.delivered) || 0
          if (dp.read) totalRead += Number(dp.read) || 0
        })
      }
    })

    details.msgs24h = {
      enviadas: totalSent,
      entregues: totalDelivered,
      lidas: totalRead,
      conversas: convData.length
    }
  } catch (err) {
    // Fallback: se conversation_analytics não estiver disponível para este tier de conta,
    // tenta contar a partir de dados de envio se houver
    details.msgs24h = { enviadas: 0, entregues: 0, lidas: 0, conversas: 0 }
  }

  return details
}

// Sincroniza todas as BMs cadastradas no banco de dados
export async function syncAllBms(pool) {
  const { rows: bms } = await pool.query('SELECT * FROM bm_conexoes WHERE status = $1 ORDER BY id ASC', ['ativo'])
  const results = []

  for (const bm of bms) {
    const token = decryptToken(bm.token_cifrado)
    if (!token) continue

    try {
      const { bm: metaBm, wabas } = await testAndFetchBm(bm.bm_id, token)
      const wabasFull = []

      for (const w of wabas) {
        const fullDetails = await fetchWabaDetails(w.id, token)
        wabasFull.push({
          ...w,
          ...fullDetails
        })
      }

      // Calcula indicadores agregados da BM
      const totalNumeros = wabasFull.reduce((acc, w) => acc + (w.numeros?.length || 0), 0)
      const numerosQualidadeBaixa = wabasFull.reduce((acc, w) => acc + (w.numeros?.filter(n => n.qualidadeBaixa)?.length || 0), 0)
      const totalTemplates = wabasFull.reduce((acc, w) => acc + (w.templates?.length || 0), 0)
      const templatesRejeitados = wabasFull.reduce((acc, w) => acc + (w.templates?.filter(t => t.status === 'REJECTED')?.length || 0), 0)
      const msgs24hEnviadas = wabasFull.reduce((acc, w) => acc + (w.msgs24h?.enviadas || 0), 0)
      const msgs24hEntregues = wabasFull.reduce((acc, w) => acc + (w.msgs24h?.entregues || 0), 0)
      const wabaNotificada = wabasFull.some(w => w.notificada)

      // Determina etapa da Esteira de Aquecimento
      let etapaAquecimento = 'Conectada'
      if (totalNumeros === 0) {
        etapaAquecimento = 'Conta sem número'
      } else if (msgs24hEnviadas > 0) {
        etapaAquecimento = msgs24hEntregues > 0 ? 'Já dispararam' : 'Com número'
      } else {
        etapaAquecimento = 'Com número'
      }

      const cachePayload = {
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

      await pool.query(
        'UPDATE bm_conexoes SET dados_cache = $1, ultima_verificacao = NOW(), updated_at = NOW() WHERE id = $2',
        [JSON.stringify(cachePayload), bm.id]
      )

      // Gera alertas no banco para números ruins ou notificações
      for (const w of wabasFull) {
        if (w.notificada) {
          await pool.query(`
            INSERT INTO bm_alertas (bm_id, waba_id, tipo, severidade, titulo, mensagem)
            VALUES ($1, $2, 'waba_restrita', 'critico', $3, $4)
            ON CONFLICT DO NOTHING
          `, [bm.bm_id, w.id, `WABA ${w.name || w.id} com restrição`, w.motivoNotificacao || 'A Meta emitiu uma notificação para esta conta.'])
        }

        for (const num of w.numeros || []) {
          if (num.qualidadeBaixa) {
            await pool.query(`
              INSERT INTO bm_alertas (bm_id, waba_id, phone_number_id, tipo, severidade, titulo, mensagem)
              VALUES ($1, $2, $3, 'qualidade_baixa', $4, $5, $6)
            `, [
              bm.bm_id,
              w.id,
              num.id,
              num.quality_rating === 'RED' ? 'critico' : 'aviso',
              `Qualidade baixa no número ${num.display_phone_number || num.id}`,
              `Número está com rating ${num.quality_rating} e limite ${num.messaging_limit_tier}. Risco de bloqueio se continuar disparando.`
            ])
          }
        }
      }

      results.push({
        id: bm.id,
        nome: bm.nome,
        bm_id: bm.bm_id,
        status: 'sucesso',
        dados: cachePayload
      })
    } catch (err) {
      console.error(`Erro ao sincronizar BM ${bm.bm_id}:`, err.message)
      results.push({
        id: bm.id,
        nome: bm.nome,
        bm_id: bm.bm_id,
        status: 'erro',
        erro: err.message
      })
    }
  }

  return results
}

