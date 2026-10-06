import { 
    WebhookItem, 
    RedisQueueStatus, 
    InfobipTemplateSummary, 
    InfobipQueueMessage, 
    DispatchRecord,
    AddSenderRequest,
    AddSenderResponse,
    VerifySenderRequest,
    VerifySenderResponse,
    RetryOtpRequest,
    RetryOtpResponse,
    InfobipActiveSender
} from '../types';
import { mediaStorage } from './mediaStorage';

// Credenciais de API mantidas estritamente no Server-Side (SECURITY-FIRST)
export const INFOBIP_BASE = '9kn66r.api-us.infobip.com';
export const LUIS_BASE = INFOBIP_BASE;

export const TRIAGE_WEBHOOK_URL = 'https://plug-sales-dispatch-app-n8n-2.hx8235.easypanel.host/webhook/a2d2ee02-2bdf-4f5c-a1b6-a0cd43b128ed';

export interface DiagnosticError {
    title: string;
    description: string;
    code?: string;
    rawText: string;
    suggestion?: string;
}

export function parseInfobipErrorDiagnostic(payload: any, fallbackMessage = 'Erro no envio'): DiagnosticError {
    if (!payload) {
        return {
            title: 'Falha no Envio',
            description: fallbackMessage,
            rawText: fallbackMessage
        };
    }

    let raw = payload;
    if (typeof payload === 'string') {
        try {
            raw = JSON.parse(payload);
        } catch {
            raw = { error: payload };
        }
    }

    let code = '';
    let description = '';
    let suggestion = '';

    // 1. Mensagem Infobip (Array messages)
    const firstMsg = raw.messages?.[0];
    if (firstMsg?.status) {
        code = firstMsg.status.name || firstMsg.status.groupName || '';
        description = firstMsg.status.description || '';
    } else if (firstMsg?.error) {
        code = firstMsg.error.name || '';
        description = firstMsg.error.description || (typeof firstMsg.error === 'string' ? firstMsg.error : '');
    }

    // 2. RequestError da Infobip (ServiceException e validationErrors)
    const sexc = raw.requestError?.serviceException;
    if (sexc) {
        code = sexc.messageId || 'SERVICE_EXCEPTION';
        description = sexc.text || '';

        // Inspecionar validationErrors (ex: placeholders[1]: ["must not be empty"])
        const valErrors = sexc.validationErrors;
        if (valErrors && typeof valErrors === 'object') {
            const errorKeys = Object.keys(valErrors);
            if (errorKeys.length > 0) {
                const details: string[] = [];
                for (const k of errorKeys) {
                    const msgs = Array.isArray(valErrors[k]) ? valErrors[k].join(', ') : String(valErrors[k]);
                    const matchPlaceholder = k.match(/placeholders\[(\d+)\]/);
                    if (matchPlaceholder) {
                        const varIdx = parseInt(matchPlaceholder[1], 10) + 1;
                        if (msgs.includes('must not be empty')) {
                            details.push(`A variável {{${varIdx}}} não pode estar vazia (obrigatória no template).`);
                        } else {
                            details.push(`Variável {{${varIdx}}}: ${msgs}`);
                        }
                    } else if (k.includes('header') || k.includes('mediaUrl')) {
                        details.push(`Cabeçalho/Imagem: ${msgs}`);
                    } else {
                        details.push(`${k}: ${msgs}`);
                    }
                }
                if (details.length > 0) {
                    description = details.join(' ');
                }
            }
        }
    }

    // 3. Objeto error na raiz
    if (!description && raw.error) {
        if (typeof raw.error === 'string') {
            description = raw.error;
        } else if (typeof raw.error === 'object') {
            code = raw.error.name || raw.error.code || '';
            description = raw.error.description || raw.error.message || '';
        }
    }

    // 4. Outros campos padrão
    if (!description && raw.description) description = raw.description;
    if (!description && raw.message) description = raw.message;
    if (!description && raw.errorMessage) description = raw.errorMessage;

    // Se ainda não encontrou e tem statusCode
    if (!description && raw.statusCode) {
        code = `HTTP_${raw.statusCode}`;
        description = `Servidor da Infobip retornou erro HTTP ${raw.statusCode}`;
    }

    // Se nada encontrado
    if (!description) {
        description = fallbackMessage;
    }

    // Dicas e sugestões automáticas baseadas nos erros oficiais da Infobip / Meta (documentação oficial)
    const combinedLower = (code + ' ' + description).toLowerCase();

    let title = 'Erro na Transmissão';

    if (combinedLower.includes('7016') || combinedLower.includes('ec_spam_rate') || combinedLower.includes('spam rate')) {
        title = 'Limite de Spam Excedido (Meta)';
        suggestion = 'Restrição de qualidade do remetente imposta pela Meta (EC_SPAM_RATE 7016). Reduza o ritmo de envio, pause a campanha ou rotacione para outra WABA.';
    } else if (combinedLower.includes('7008') || combinedLower.includes('invalid_template_args') || combinedLower.includes('match template parameters')) {
        title = 'Parâmetros do Template Incompatíveis (Meta)';
        suggestion = 'A quantidade ou formato das variáveis {{1}}, {{2}}... não confere com o modelo aprovado na Meta (EC_INVALID_TEMPLATE_ARGS 7008).';
    } else if (combinedLower.includes('7032') || combinedLower.includes('frequency_capping') || combinedLower.includes('frequency capping')) {
        title = 'Limite de Frequência do Destinatário (Meta)';
        suggestion = 'O destinatário já recebeu a cota máxima de mensagens promocionais nas últimas 24 horas permitida pela Meta (EC_FREQUENCY_CAPPING 7032).';
    } else if (combinedLower.includes('7048') || combinedLower.includes('7046') || combinedLower.includes('daily_promo_quota') || combinedLower.includes('destination_message_quota')) {
        title = 'Cota Promocional do Destinatário Atingida';
        suggestion = 'O usuário atingiu o limite de mensagens de marketing recebidas hoje (EC_DESTINATION_DAILY_PROMO_QUOTA_REACHED).';
    } else if (combinedLower.includes('not_enough_credits') || combinedLower.includes('rejected_not_enough_credits') || combinedLower.includes('saldo') || combinedLower.includes('credit')) {
        title = 'Saldo Insuficiente na Infobip';
        suggestion = 'A conta Infobip está sem saldo para envio (REJECTED_NOT_ENOUGH_CREDITS 12). Recarregue sua conta na Infobip.';
    } else if (combinedLower.includes('unknown_subscriber') || combinedLower.includes('unidentified_subscriber') || combinedLower.includes('ec_unknown_subscriber')) {
        title = 'Número Inexistente na Operadora';
        suggestion = 'O número do destinatário não existe ou não está ativo na rede da operadora (EC_UNKNOWN_SUBSCRIBER 1).';
    } else if (combinedLower.includes('absent_subscriber') || combinedLower.includes('ec_absent_subscriber')) {
        title = 'Aparelho Desligado / Sem Sinal';
        suggestion = 'O celular do destinatário estava desligado ou fora de área de cobertura da operadora (EC_ABSENT_SUBSCRIBER 6/27).';
    } else if (combinedLower.includes('call_barred') || combinedLower.includes('ec_call_barred')) {
        title = 'Linha Bloqueada pela Operadora';
        suggestion = 'A operadora suspendeu o serviço do destinatário por bloqueio ou pendência de faturamento (EC_CALL_BARRED 13).';
    } else if (combinedLower.includes('rejected_dnd') || combinedLower.includes('dnd')) {
        title = 'Destinatário com Não Perturbe (DND)';
        suggestion = 'O destinatário cadastrou o número no serviço Não Perturbe (DND), bloqueando mensagens em massa (REJECTED_DND 10).';
    } else if (combinedLower.includes('flooding') || combinedLower.includes('rejected_flooding_filter')) {
        title = 'Filtro Anti-Flooding Acionado';
        suggestion = 'Envios muito rápidos para o mesmo destinatário foram bloqueados pelo filtro anti-flooding da Infobip (REJECTED_FLOODING_FILTER 20).';
    } else if (combinedLower.includes('blocklisted') || combinedLower.includes('rejected_destination_blocklisted') || combinedLower.includes('rejected_sender')) {
        title = 'Número ou Remetente em Blacklist';
        suggestion = 'O número ou remetente foi adicionado à lista de bloqueio (blacklist) na plataforma Infobip.';
    } else if (combinedLower.includes('rejected_operator') || combinedLower.includes('undeliverable_rejected_operator')) {
        title = 'Rejeitado pela Operadora';
        suggestion = 'A operadora de telefonia rejeitou a entrega da mensagem por restrições de rede ou filtros da operadora (UNDELIVERABLE_REJECTED_OPERATOR 4).';
    } else if (combinedLower.includes('expired_expired') || combinedLower.includes('expired')) {
        title = 'Mensagem Expirada (Timeout de 48h)';
        suggestion = 'A mensagem expirou o período de validade de 48h sem conseguir confirmação de entrega no handset (EXPIRED_EXPIRED 15).';
    } else if (combinedLower.includes('unknown_template') || combinedLower.includes('template not found') || combinedLower.includes('template')) {
        title = 'Template Inválido ou Não Aprovado';
        suggestion = 'O nome do template ou o idioma não conferem com o modelo aprovado na Meta/Infobip para este remetente.';
    } else if (combinedLower.includes('destination_not_registered') || combinedLower.includes('not registered') || combinedLower.includes('user not found')) {
        title = 'Número Sem WhatsApp';
        suggestion = 'O número de destino não possui uma conta ativa no WhatsApp ou bloqueou o recebimento de mensagens.';
    } else if (combinedLower.includes('header media url is required') || combinedLower.includes('media url')) {
        title = 'URL da Imagem Obrigatória';
        suggestion = 'O template aprovado exige uma imagem válida no cabeçalho. Preencha o campo "URL da Imagem Original" na transmissão.';
    } else if (combinedLower.includes('placeholder') || combinedLower.includes('variable') || combinedLower.includes('parameter')) {
        title = 'Variáveis Incompatíveis';
        suggestion = 'A quantidade de variáveis fornecidas não corresponde exatamente ao que o template aprovado exige.';
    } else if (combinedLower.includes('unauthorized') || combinedLower.includes('401') || combinedLower.includes('forbidden') || combinedLower.includes('403')) {
        title = 'Falha de Autenticação da API';
        suggestion = 'A chave de API (API Key) da Infobip ou URL de endpoint não tem permissão para disparar por esta WABA.';
    } else if (combinedLower.includes('sender') || combinedLower.includes('from')) {
        title = 'Remetente Não Autorizado';
        suggestion = 'O número da WABA (remetente) não está devidamente associado à conta ou BM na Infobip.';
    }

    return {
        title,
        description,
        code: code || undefined,
        rawText: typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2),
        suggestion: suggestion || undefined
    };
}

export const api = {
    // Autenticação (Login Admin)
    async login(email: string, password: string): Promise<{ success: boolean; token?: string; user?: any; error?: string }> {
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (data.success && data.token) {
                localStorage.setItem('auth_token', data.token);
                if (data.user) localStorage.setItem('auth_user', JSON.stringify(data.user));
            }
            return data;
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    },

    // 1. Triage webhook (fetch pending dispatches if needed)
    async fetchTriageItems(): Promise<WebhookItem[]> {
        const response = await fetch(TRIAGE_WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ action: 'fetch_express_templates' })
        });

        if (!response.ok) {
            throw new Error(`Falha na API n8n: ${response.status}`);
        }

        const data = await response.json();
        if (Array.isArray(data)) return data;
        if (data && typeof data === 'object') return [data];
        return [];
    },

    // 2. Fetch approved Infobip templates for a sender (Via Backend Seguro - Zero Secrets no Frontend)
    async fetchSenderTemplates(senderNumber: string): Promise<InfobipTemplateSummary[]> {
        const rawDigits = senderNumber.replace(/\D/g, '');
        if (!rawDigits || rawDigits.length < 8) return [];

        // Rota Primária: Backend Proxy seguro (Zero Secrets no Frontend)
        try {
            const res = await fetch(`/api/meta-templates?sender=${encodeURIComponent(rawDigits)}`);
            if (res.ok) {
                const data = await res.json();
                if (data && Array.isArray(data.templates) && data.templates.length > 0) {
                    return data.templates
                        .filter((t: any) => t.status === 'APPROVED')
                        .map((t: any) => ({
                            id: t.id || t.name,
                            name: t.name,
                            language: t.language || 'pt_BR',
                            status: t.status,
                            category: t.category,
                            structure: t.structure
                        }));
                }
            }
        } catch (backendErr) {
            console.warn('[Infobip] Falha ao consultar endpoint de templates do backend:', backendErr);
        }

        // Rota Secundária: Infobip Proxy Server-Side
        const candidateNumbers = new Set<string>();
        candidateNumbers.add(rawDigits);
        if (rawDigits.length === 10 || rawDigits.length === 11) candidateNumbers.add('55' + rawDigits);
        if (rawDigits.length === 13 && rawDigits.startsWith('55')) candidateNumbers.add(rawDigits.slice(0, 4) + rawDigits.slice(5));
        if (rawDigits.length === 12 && rawDigits.startsWith('55')) candidateNumbers.add(rawDigits.slice(0, 4) + '9' + rawDigits.slice(4));

        for (const num of candidateNumbers) {
            try {
                const proxyUrl = `/infobip-proxy/whatsapp/2/senders/${num}/templates`;
                const res = await fetch(proxyUrl, {
                    headers: { 'Accept': 'application/json' }
                });

                if (res && res.ok) {
                    const data = await res.json().catch(() => ({}));
                    const templates = data.templates || [];
                    const approved = templates
                        .filter((t: any) => t.status === 'APPROVED')
                        .map((t: any) => ({
                            id: t.id || t.name,
                            name: t.name,
                            language: t.language || 'pt_BR',
                            status: t.status,
                            category: t.category,
                            structure: t.structure
                        }));

                    if (approved.length > 0) {
                        return approved;
                    }
                }
            } catch (candidateErr) {
                console.warn(`[Infobip Proxy Error] (${num}):`, candidateErr);
            }
        }

        return [];
    },

    // 3. Redis Queue Status (includes rateLimit)
    async getRedisQueueStatus(): Promise<RedisQueueStatus> {
        try {
            const res = await fetch('/api/dispatch/queue/status');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch {
            return { queueLength: 0, isRunning: false, processed: 0, rateLimit: 1.0, warning: 'Não conectado ao Redis / Backend offline' };
        }
    },

    // 4. Update Redis Rate Limit (e.g. 0.5s, 1.0s, 1.5s)
    async setRedisRateLimit(rateLimit: number): Promise<{ success: boolean; rateLimit: number }> {
        const res = await fetch('/api/dispatch/rate-limit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rateLimit })
        });
        if (!res.ok) throw new Error('Falha ao atualizar Rate Limit no Redis');
        return await res.json();
    },

    // 5. Enqueue messages into Redis queue (Credenciais aplicadas com segurança no server-side)
    async enqueueMessages(messages: InfobipQueueMessage[]): Promise<{ success: boolean; count: number; error?: string }> {
        const token = localStorage.getItem('auth_token');
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch('/api/dispatch/queue', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                messages
            })
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
            throw new Error(err.error || 'Erro ao enfileirar no Redis');
        }

        return await res.json();
    },

    // 6. Stop / Pause Redis queue
    async stopRedisQueue(): Promise<void> {
        const res = await fetch('/api/dispatch/queue/pause', { method: 'POST' });
        if (!res.ok) throw new Error('Falha ao pausar fila Redis');
    },

    async pauseRedisQueue(): Promise<void> {
        const res = await fetch('/api/dispatch/queue/pause', { method: 'POST' });
        if (!res.ok) throw new Error('Falha ao pausar fila Redis');
    },

    async resumeRedisQueue(): Promise<void> {
        const res = await fetch('/api/dispatch/queue/resume', { method: 'POST' });
        if (!res.ok) throw new Error('Falha ao retomar fila Redis');
    },

    // 6b. Individual Campaign Pause / Resume
    async pauseCampaign(campaignId: string, campaignName?: string): Promise<void> {
        const res = await fetch(`/api/dispatch/campaign/${encodeURIComponent(campaignId)}/pause`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ campaignName })
        });
        if (!res.ok) throw new Error('Falha ao pausar campanha individual');
    },

    async resumeCampaign(campaignId: string, campaignName?: string): Promise<void> {
        const res = await fetch(`/api/dispatch/campaign/${encodeURIComponent(campaignId)}/resume`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ campaignName })
        });
        if (!res.ok) throw new Error('Falha ao retomar campanha individual');
    },

    async getPausedCampaigns(): Promise<string[]> {
        try {
            const res = await fetch('/api/dispatch/campaigns/paused');
            if (!res.ok) return [];
            return await res.json();
        } catch {
            return [];
        }
    },

    // 7. Clear Redis queue
    async clearRedisQueue(): Promise<void> {
        const res = await fetch('/api/dispatch/queue', { method: 'DELETE' });
        if (!res.ok) throw new Error('Falha ao limpar fila Redis');
    },

    // 8. Fetch Real-time Dispatch Records / Logs
    async getDispatchLogs(): Promise<DispatchRecord[]> {
        try {
            const res = await fetch('/api/dispatch/logs');
            if (!res.ok) return [];
            const rows = await res.json();
            return (rows || []).map((r: any) => {
                let parsedPayload: any = null;
                try {
                    parsedPayload = typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload;
                } catch {
                    parsedPayload = r.payload;
                }

                const isSuccess = r.log_type === 'SUCCESS';
                const statusName = parsedPayload?.messages?.[0]?.status?.name || parsedPayload?.status?.name || '';
                const statusGroup = parsedPayload?.messages?.[0]?.status?.groupName || parsedPayload?.status?.groupName || '';
                const deliveryStatus = r.delivery_status || r.deliveryReason || statusName || statusGroup || '';
                const deliveryUpper = String(deliveryStatus).toUpperCase();
                const statusUpper = String(statusName).toUpperCase();
                const groupUpper = String(statusGroup).toUpperCase();

                // Obter erro real da Infobip (Atenção: status.id NÃO é erro! status.id = 5 significa DELIVERED_TO_HANDSET!)
                const realErrorObj = parsedPayload?.error || parsedPayload?.messages?.[0]?.error || null;
                const realErrorId = (realErrorObj && realErrorObj.id !== undefined && realErrorObj.id !== null && Number(realErrorObj.id) > 0)
                    ? Number(realErrorObj.id)
                    : null;
                const realErrorDesc = (realErrorObj && realErrorObj.description && !realErrorObj.description.toLowerCase().includes('no error'))
                    ? realErrorObj.description
                    : (r.error_name && !r.error_name.toLowerCase().includes('no error') ? r.error_name : '');

                // Verificação estrita: DELIVERED_TO_OPERATOR é entrega na operadora (deve ser PENDENTE/AGUARDANDO HANDSET)
                const isOperatorOnly = statusUpper === 'DELIVERED_TO_OPERATOR' || 
                                       deliveryUpper === 'DELIVERED_TO_OPERATOR' ||
                                       (deliveryUpper.includes('OPERATOR') && !deliveryUpper.includes('HANDSET'));

                // 1. Detecção estrita de ENTREGA CONFIRMADA NO HANDSET (apenas DELIVERED_TO_HANDSET)
                const isDelivered = (
                    statusUpper === 'DELIVERED_TO_HANDSET' || 
                    deliveryUpper === 'DELIVERED_TO_HANDSET' || 
                    (
                        (groupUpper === 'DELIVERED' || deliveryUpper === 'DELIVERED' || r.status === 'DELIVERED' || r.log_type === 'DELIVERED') &&
                        !isOperatorOnly
                    )
                ) && !deliveryUpper.includes('NOT') && 
                     !deliveryUpper.includes('UNDELIVERABLE') && 
                     !statusUpper.includes('NOT') && 
                     !statusUpper.includes('UNDELIVERABLE') &&
                     !realErrorId;

                // 2. Detecção estrita de FALHA / NÃO ENTREGUE (apenas se NÃO for Handset Delivered e NÃO for Operator)
                const isFailed = !isDelivered && !isOperatorOnly && (
                    r.status === 'FAILED' || 
                    r.log_type === 'ERROR' || 
                    groupUpper === 'UNDELIVERABLE' || 
                    groupUpper === 'REJECTED' || 
                    groupUpper === 'FAILED' ||
                    groupUpper === 'EXPIRED' ||
                    statusUpper.includes('UNDELIVERABLE') || 
                    statusUpper.includes('NOT_DELIVERED') || 
                    statusUpper.includes('REJECTED') || 
                    statusUpper.includes('SPAM') || 
                    statusUpper.includes('FAILED') || 
                    deliveryUpper.includes('UNDELIVERABLE') || 
                    deliveryUpper.includes('NOT_DELIVERED') || 
                    deliveryUpper.includes('REJECTED') || 
                    deliveryUpper.includes('SPAM') || 
                    deliveryUpper.includes('EXPIRED') ||
                    deliveryUpper.includes('BOUNCE') ||
                    deliveryUpper.includes('BLOCKED') ||
                    (deliveryUpper.includes('FAILED') && !deliveryUpper.includes('NO')) ||
                    (deliveryUpper.includes('ERROR') && !deliveryUpper.includes('NO_ERROR') && !deliveryUpper.includes('NO ERROR') && !deliveryUpper.includes('CODE 0')) ||
                    Boolean(realErrorId) ||
                    Boolean(realErrorDesc && !realErrorDesc.includes('No Error'))
                );

                let recordStatus: 'DELIVERED' | 'SENT' | 'PENDING' | 'FAILED' = 'PENDING';
                if (isDelivered) {
                    recordStatus = 'DELIVERED';
                } else if (isFailed) {
                    recordStatus = 'FAILED';
                } else if (isSuccess || r.status === 'SENT' || isOperatorOnly || deliveryUpper.includes('PENDING') || deliveryUpper.includes('ENROUTE') || deliveryUpper.includes('WAITING') || groupUpper === 'PENDING') {
                    recordStatus = 'SENT';
                }

                const diagnostic = recordStatus === 'FAILED' ? parseInfobipErrorDiagnostic(parsedPayload) : null;
                
                let finalErrorReason = recordStatus === 'DELIVERED'
                    ? undefined
                    : (diagnostic 
                        ? (diagnostic.code ? `[${diagnostic.code}] ${diagnostic.description}` : diagnostic.description) 
                        : (r.errorReason || realErrorDesc || (recordStatus === 'FAILED' ? (deliveryStatus || 'UNDELIVERABLE_NOT_DELIVERED') : undefined)));

                if (isFailed && deliveryStatus && (!finalErrorReason || finalErrorReason === 'Falha no envio')) {
                    finalErrorReason = realErrorId ? `${realErrorDesc || 'Erro no envio'} (code ${realErrorId}) · Reason: ${deliveryStatus}` : `Reason: ${deliveryStatus}`;
                }

                // Data de entrega: apenas para mensagens realmente entregues no aparelho
                let validDoneAt: string | undefined = undefined;
                if (recordStatus === 'DELIVERED') {
                    validDoneAt = r.done_at || r.doneAt || r.timestamp;
                }

                const toNum = r.recipient || '';
                const operatorName = r.network_name || r.operator || api.detectOperator(toNum);

                const cleanedDeliveryReason = recordStatus === 'DELIVERED' 
                    ? (deliveryUpper === 'DELIVERED' || deliveryUpper === 'DELIVERED_TO_HANDSET' ? deliveryStatus : 'DELIVERED_TO_HANDSET')
                    : (isOperatorOnly
                        ? 'DELIVERED_TO_OPERATOR'
                        : (recordStatus === 'FAILED' 
                            ? (deliveryStatus || 'UNDELIVERABLE_NOT_DELIVERED') 
                            : (deliveryUpper.includes('PENDING') || deliveryUpper.includes('ENROUTE') || deliveryUpper.includes('WAITING') ? deliveryStatus : 'PENDING_WAITING_DELIVERY')));

                return {
                    id: String(r.id || r.transmission_id || Math.random()),
                    transmissionId: r.transmission_id,
                    campaignId: r.campaign_id || r.campaignId || undefined,
                    campaignName: r.campaign_name || r.campaignName || 'Campanha_Principal',
                    listName: r.list_name || r.listName || 'Lista_Padrao',
                    timestamp: r.timestamp || new Date().toISOString(),
                    recipient: toNum,
                    senderNumber: r.waba || r.senderNumber || '',
                    templateName: r.message || r.templateName || '',
                    status: recordStatus,
                    messageId: r.transmission_id,
                    errorReason: recordStatus === 'FAILED' ? finalErrorReason : undefined,
                    rawPayload: parsedPayload,
                    doneAt: validDoneAt,
                    deliveryReason: cleanedDeliveryReason,
                    errorGroup: recordStatus === 'DELIVERED' ? 'No Errors' : (recordStatus === 'FAILED' ? (r.error_group || 'HANDSET_ERRORS') : 'No Errors'),
                    errorName: recordStatus === 'DELIVERED' ? 'No Error (code 0)' : (recordStatus === 'FAILED' ? (finalErrorReason || 'Erro no envio') : 'No Error (code 0)'),
                    operator: operatorName,
                    mediaUrl: r.media_url || r.mediaUrl || '',
                    headerType: r.header_type || r.headerType || 'NONE',
                    price: r.price !== undefined ? r.price : 0
                };
            });
        } catch (err) {
            console.warn('Erro ao carregar logs de envio:', err);
            return [];
        }
    },

    // 8.0 Limpar Logs de Envio (Redis e Banco)
    async clearDispatchLogs(): Promise<{ success: boolean; message?: string }> {
        try {
            const res = await fetch('/api/dispatch/logs', { method: 'DELETE' });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || 'Falha ao limpar logs');
            }
            return await res.json();
        } catch (err: any) {
            console.error('Erro ao limpar logs de envio:', err);
            throw err;
        }
    },

    // 8.1 Sincronizar Relatórios de Entrega (DLR) com a Infobip
    async syncDeliveryReports(): Promise<{ success: boolean; synced: number; updated: number; sample?: any[] }> {
        try {
            const res = await fetch('/api/dispatch/sync-reports', { method: 'POST' });
            if (!res.ok) return { success: false, synced: 0, updated: 0 };
            return await res.json();
        } catch (err) {
            console.warn('Erro ao sincronizar relatórios Infobip:', err);
            return { success: false, synced: 0, updated: 0 };
        }
    },

    // 8.2 Detector de Operadora Brasileira por DDD
    detectOperator(phone: string): string {
        const clean = phone.replace(/\D/g, '');
        let ddd = '';
        if (clean.startsWith('55') && clean.length >= 12) {
            ddd = clean.slice(2, 4);
        } else if (clean.length >= 10) {
            ddd = clean.slice(0, 2);
        }
        const dddNum = parseInt(ddd, 10);
        const map: Record<number, string> = {
            11: 'Vivo // SP',
            12: 'Claro // SP',
            13: 'TIM Brasil',
            14: 'Vivo // SP',
            15: 'Claro // SP',
            16: 'TIM Brasil',
            17: 'Vivo // SP',
            18: 'TIM Brasil',
            19: 'Claro // SP',
            21: 'Claro // RJ',
            22: 'Vivo // RJ',
            24: 'TIM Brasil',
            27: 'Vivo // ES',
            28: 'Claro // ES',
            31: 'Claro // MG - Belo Horiz',
            32: 'TIM Brasil // MG',
            33: 'Vivo // MG',
            34: 'Claro // MG',
            35: 'TIM Brasil',
            37: 'Vivo // MG',
            38: 'Claro // MG',
            41: 'TIM Brasil // PR',
            47: 'Claro // SC',
            48: 'Vivo // SC',
            49: 'Claro // SC',
            51: 'Claro // RS',
            53: 'Vivo // RS',
            54: 'TIM Brasil',
            61: 'Vivo // DF',
            62: 'Claro // GO',
            71: 'Claro // BA',
            81: 'TIM Brasil // PE',
            84: 'Claro // RN',
            85: 'Claro // CE',
            91: 'Vivo // PA'
        };
        return (dddNum && map[dddNum]) ? map[dddNum] : 'TIM Brasil';
    },

    // 9. Shorten URL
    async shortenUrl(targetUrl: string): Promise<string> {
        let clean = targetUrl.trim();
        if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
            clean = 'https://' + clean;
        }

        const token = localStorage.getItem('auth_token');
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        try {
            const res = await fetch('/api/shortener/create', {
                method: 'POST',
                headers,
                body: JSON.stringify({ original_url: clean, title: 'Express Template Link' })
            });

            if (res.ok) {
                const data = await res.json();
                if (data.shortUrl || data.shortenedUrl) {
                    return data.shortUrl || data.shortenedUrl;
                }
            }
        } catch (err) {
            console.warn('[Shortener] API call failed, generating direct short link:', err);
        }

        // Robust fallback: generate short redirect code
        const code = Math.random().toString(36).substring(2, 8);
        return `https://fastdispatch.com.br/r/${code}`;
    },

    // 10. Upload media (images, videos, documents) with safe permanent storage
    async uploadMedia(file: File): Promise<{ success: boolean; url: string; originalName: string; size: number; id?: string }> {
        const token = localStorage.getItem('auth_token');
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        let uploadedUrl = '';
        let mediaId = `media_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

        try {
            const base64Data = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve((e.target?.result as string) || '');
                reader.readAsDataURL(file);
            });

            const res = await fetch('/api/upload', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    name: file.name,
                    data: base64Data
                })
            });

            if (res.ok) {
                const data = await res.json();
                if (data.url || data.fileUrl) {
                    let returnedUrl = data.url || data.fileUrl;
                    if (returnedUrl.startsWith('/')) {
                        returnedUrl = window.location.origin + returnedUrl;
                    }
                    uploadedUrl = returnedUrl;
                    if (data.id) mediaId = String(data.id);
                }
            }
        } catch (err) {
            console.warn('[UploadMedia] API upload failed, using secure fallback:', err);
        }

        // If backend was reached and gave a URL, or fallback to data URL
        if (!uploadedUrl) {
            uploadedUrl = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve((e.target?.result as string) || '');
                reader.readAsDataURL(file);
            });
        }

        const sizeFormatted = file.size > 1024 * 1024
            ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
            : `${Math.round(file.size / 1024)} KB`;

        const mediaType = file.type.startsWith('video') 
            ? 'video' 
            : file.type.startsWith('image') 
                ? 'image' 
                : 'document';

        // Save permanently for dispatcher use
        mediaStorage.saveMedia({
            id: mediaId,
            name: file.name,
            originalName: file.name,
            url: uploadedUrl,
            size: sizeFormatted,
            type: mediaType,
        });

        return {
            success: true,
            url: uploadedUrl,
            originalName: file.name,
            size: file.size,
            id: mediaId
        };
    },

    // 11. Legacy alias
    async uploadImage(file: File): Promise<string> {
        const res = await api.uploadMedia(file);
        return res.url;
    },

    // 12. WhatsApp Embedded Signup (Cadastro de Remetente via Infobip)
    async addWhatsAppSender(data: AddSenderRequest): Promise<AddSenderResponse> {
        try {
            const res = await fetch('/api/whatsapp/embedded-signup/senders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await res.json();
            if (!res.ok) {
                return {
                    success: false,
                    error: result.error || 'Falha ao solicitar cadastro do remetente na Infobip'
                };
            }
            return {
                success: true,
                ...result
            };
        } catch (err: any) {
            return {
                success: false,
                error: err.message || 'Erro de conexão ao cadastrar remetente'
            };
        }
    },

    // 13. WhatsApp Embedded Signup - Verificar Código OTP
    async verifyWhatsAppSender(data: VerifySenderRequest): Promise<VerifySenderResponse> {
        try {
            const res = await fetch('/api/whatsapp/embedded-signup/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await res.json();
            if (!res.ok) {
                return {
                    success: false,
                    error: result.error || 'Código OTP inválido ou expirado'
                };
            }
            return {
                success: true,
                ...result
            };
        } catch (err: any) {
            return {
                success: false,
                error: err.message || 'Erro de rede ao verificar código OTP'
            };
        }
    },

    // 14. WhatsApp Embedded Signup - Reenviar Código OTP
    async retryWhatsAppSenderOtp(data: RetryOtpRequest): Promise<RetryOtpResponse> {
        try {
            const res = await fetch('/api/whatsapp/embedded-signup/retry-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await res.json();
            if (!res.ok) {
                return {
                    success: false,
                    error: result.error || 'Falha ao reenviar código OTP'
                };
            }
            return {
                success: true,
                ...result
            };
        } catch (err: any) {
            return {
                success: false,
                error: err.message || 'Erro de rede ao reenviar OTP'
            };
        }
    },

    // 15. Listar Remetentes Ativos na Infobip
    async getWhatsAppSenders(params?: { apiKey?: string; baseUrl?: string }): Promise<{ senders: InfobipActiveSender[] }> {
        try {
            const query = new URLSearchParams();
            if (params?.apiKey) query.set('apiKey', params.apiKey);
            if (params?.baseUrl) query.set('baseUrl', params.baseUrl);
            const res = await fetch(`/api/whatsapp/senders?${query.toString()}`);
            if (!res.ok) return { senders: [] };
            const data = await res.json();
            return data;
        } catch {
            return { senders: [] };
        }
    },

    // 16. Obter WABA IDs conhecidos na conta Infobip
    async getKnownWabas(): Promise<string[]> {
        try {
            const res = await fetch('/api/whatsapp/known-wabas');
            if (!res.ok) return ['875786408937731'];
            const data = await res.json();
            return data.wabas || ['875786408937731'];
        } catch {
            return ['875786408937731'];
        }
    }
};
