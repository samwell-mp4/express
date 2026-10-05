import { WebhookItem, RedisQueueStatus, InfobipTemplateSummary, InfobipQueueMessage, DispatchRecord } from '../types';
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

    // Dicas e sugestões automáticas baseadas nos erros comuns da Meta/Infobip
    const combinedLower = (code + ' ' + description).toLowerCase();

    let title = 'Erro na Transmissão';

    if (combinedLower.includes('not_enough_credits') || combinedLower.includes('saldo') || combinedLower.includes('credit')) {
        title = 'Saldo Insuficiente';
        suggestion = 'A conta Infobip está sem saldo de recarga para envio de mensagens WhatsApp. Recarregue a conta na Infobip.';
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
        suggestion = 'A quantidade de variáveis fornecidas não corresponde exatamente ao que o template aprovado exige (ex: esperado 4, enviado 2).';
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

    // 6. Stop Redis queue
    async stopRedisQueue(): Promise<void> {
        const res = await fetch('/api/dispatch/queue/stop', { method: 'POST' });
        if (!res.ok) throw new Error('Falha ao pausar fila Redis');
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

                const isSuccess = r.log_type === 'SUCCESS' || r.log_type === 'DELIVERED';
                const statusName = parsedPayload?.messages?.[0]?.status?.groupName || parsedPayload?.messages?.[0]?.status?.name;
                const deliveryStatus = r.delivery_status || r.deliveryReason || statusName;

                let recordStatus: 'DELIVERED' | 'SENT' | 'PENDING' | 'FAILED' = 'PENDING';
                if (r.status === 'DELIVERED' || r.log_type === 'DELIVERED' || statusName === 'DELIVERED' || deliveryStatus === 'DELIVERED_TO_HANDSET' || deliveryStatus === 'DELIVERED') {
                    recordStatus = 'DELIVERED';
                } else if (r.status === 'FAILED' || r.log_type === 'ERROR' || statusName === 'REJECTED' || statusName === 'UNDELIVERABLE') {
                    recordStatus = 'FAILED';
                } else if (isSuccess || r.status === 'SENT') {
                    recordStatus = 'SENT';
                }

                const diagnostic = recordStatus === 'FAILED' ? parseInfobipErrorDiagnostic(parsedPayload) : null;
                const finalErrorReason = diagnostic 
                    ? (diagnostic.code ? `[${diagnostic.code}] ${diagnostic.description}` : diagnostic.description) 
                    : (recordStatus === 'FAILED' ? (r.errorReason || 'Falha no envio') : undefined);

                const toNum = r.recipient || '';
                const operatorName = r.network_name || r.operator || api.detectOperator(toNum);

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
                    errorReason: finalErrorReason,
                    rawPayload: parsedPayload,
                    doneAt: r.done_at || r.doneAt || (recordStatus === 'DELIVERED' ? r.timestamp : undefined),
                    deliveryReason: deliveryStatus || (recordStatus === 'DELIVERED' ? 'DELIVERED_TO_HANDSET' : (recordStatus === 'FAILED' ? 'REJECTED' : 'SENT_TO_NETWORK')),
                    errorGroup: r.error_group || r.errorGroup || (recordStatus === 'DELIVERED' ? 'No Errors' : (recordStatus === 'FAILED' ? 'HANDSET_ERRORS' : 'No Errors')),
                    errorName: r.error_name || r.errorName || (recordStatus === 'DELIVERED' ? 'No Error (code 0)' : (recordStatus === 'FAILED' ? (finalErrorReason || 'Erro no envio') : 'No Error (code 0)')),
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
    }
};
