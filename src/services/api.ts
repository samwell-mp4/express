import { WebhookItem, RedisQueueStatus, InfobipTemplateSummary, InfobipQueueMessage, DispatchRecord } from '../types';

export const LUIS_KEY = '35a1621fff9a97453d02b0dbe043467e-9501a6c3-3289-4fb9-90b4-d16b18b48d47';
export const LUIS_BASE = '4k3e4p.api-us.infobip.com';

export const TRIAGE_WEBHOOK_URL = 'https://plug-sales-dispatch-app-n8n-2.hx8235.easypanel.host/webhook/a2d2ee02-2bdf-4f5c-a1b6-a0cd43b128ed';

export const api = {
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

    // 2. Fetch approved Infobip templates for a sender
    // Automatically tests BM do Luiz + number variations (+55, 12D/13D)
    async fetchSenderTemplates(senderNumber: string, preferredApiKey?: string, preferredBaseUrl?: string): Promise<InfobipTemplateSummary[]> {
        const rawDigits = senderNumber.replace(/\D/g, '');
        if (!rawDigits || rawDigits.length < 8) return [];

        // Build candidate number variations to test
        const candidateNumbers = new Set<string>();
        candidateNumbers.add(rawDigits);

        if (rawDigits.length === 10 || rawDigits.length === 11) {
            candidateNumbers.add('55' + rawDigits);
        }

        // If 13 digits (55 + DDD + 9 + 8 digits), also test 12 digits (without 9th digit)
        if (rawDigits.length === 13 && rawDigits.startsWith('55')) {
            const withoutNine = rawDigits.slice(0, 4) + rawDigits.slice(5);
            candidateNumbers.add(withoutNine);
        }

        // If 12 digits (55 + DDD + 8 digits), also test 13 digits (with 9th digit)
        if (rawDigits.length === 12 && rawDigits.startsWith('55')) {
            const withNine = rawDigits.slice(0, 4) + '9' + rawDigits.slice(4);
            candidateNumbers.add(withNine);
        }

        // Account to check: BM do Luiz
        const account = {
            name: 'BM do Luiz',
            key: preferredApiKey || LUIS_KEY,
            base: preferredBaseUrl || LUIS_BASE,
            proxy: '/infobip-proxy'
        };

        const acc = account;
        for (const num of candidateNumbers) {
            try {
                    const proxyUrl = `${acc.proxy}/whatsapp/2/senders/${num}/templates`;
                    const directUrl = `https://${acc.base}/whatsapp/2/senders/${num}/templates`;

                    let res: Response;
                    try {
                        res = await fetch(proxyUrl, {
                            headers: {
                                'Authorization': `App ${acc.key}`,
                                'Accept': 'application/json'
                            }
                        });
                    } catch {
                        res = await fetch(directUrl, {
                            headers: {
                                'Authorization': `App ${acc.key}`,
                                'Accept': 'application/json'
                            }
                        });
                    }

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
                            console.log(`[Infobip] Templates encontrados na ${acc.name} para o remetente ${num}: ${approved.length}`);
                            return approved;
                        }
                    }
                } catch (candidateErr) {
                    console.warn(`[Infobip Candidate Check Error] ${acc.name} (${num}):`, candidateErr);
                }
            }

        console.warn(`[Infobip] Nenhum template encontrado para ${rawDigits} em nenhuma das contas testadas.`);
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

    // 5. Enqueue messages into Redis queue
    async enqueueMessages(messages: InfobipQueueMessage[], apiKey: string = LUIS_KEY, baseUrl: string = LUIS_BASE): Promise<{ success: boolean; count: number; error?: string }> {
        const res = await fetch('/api/dispatch/queue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages,
                apiKey,
                baseUrl
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

                const isSuccess = r.log_type === 'SUCCESS';
                const statusName = parsedPayload?.messages?.[0]?.status?.groupName || parsedPayload?.messages?.[0]?.status?.name;
                
                let recordStatus: 'DELIVERED' | 'SENT' | 'PENDING' | 'FAILED' = 'PENDING';
                if (statusName === 'DELIVERED') recordStatus = 'DELIVERED';
                else if (isSuccess) recordStatus = 'SENT';
                else if (r.log_type === 'ERROR') recordStatus = 'FAILED';

                return {
                    id: String(r.id || r.transmission_id || Math.random()),
                    transmissionId: r.transmission_id,
                    timestamp: r.timestamp || new Date().toISOString(),
                    recipient: r.recipient || '',
                    senderNumber: r.waba || '',
                    templateName: r.message || '',
                    status: recordStatus,
                    messageId: r.transmission_id,
                    errorReason: !isSuccess ? (parsedPayload?.error?.description || parsedPayload?.requestError?.serviceException?.text || 'Erro no envio') : undefined,
                    rawPayload: parsedPayload
                };
            });
        } catch (err) {
            console.warn('Erro ao carregar logs de envio:', err);
            return [];
        }
    },

    // 9. Shorten URL
    async shortenUrl(targetUrl: string): Promise<string> {
        const res = await fetch('/api/shortener/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ original_url: targetUrl, title: 'Express Template Link' })
        });
        const data = await res.json();
        return data.shortUrl || data.shortenedUrl || '';
    },

    // 10. Upload image
    async uploadImage(file: File): Promise<string> {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const result = await res.json();
        if (result.success && result.url) return result.url;
        throw new Error(result.error || 'Falha no upload da mídia');
    }
};
