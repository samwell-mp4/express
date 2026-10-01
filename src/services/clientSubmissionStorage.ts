import { ClientSubmission, SubmissionAd, ParsedContact } from '../types';

const STORAGE_SUBMISSIONS_KEY = 'express_dispatch_client_submissions_v2';
const LEGACY_STORAGE_KEY = 'express_dispatch_client_batches_v1';

export const clientSubmissionStorage = {
    // Retrieve all submissions with local fallback and legacy batch migration
    async getSubmissions(): Promise<ClientSubmission[]> {
        const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');
        let remoteList: ClientSubmission[] = [];

        if (token) {
            try {
                const res = await fetch('/api/client-submissions', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data)) {
                        remoteList = data.map(item => ({
                            ...item,
                            ads: typeof item.ads === 'string' ? JSON.parse(item.ads) : (item.ads || [])
                        }));
                    }
                }
            } catch (err) {
                console.warn('[clientSubmissionStorage] Remote fetch failed, using local storage:', err);
            }
        }

        // Local storage data
        let localList: ClientSubmission[] = [];
        try {
            const raw = localStorage.getItem(STORAGE_SUBMISSIONS_KEY);
            if (raw) {
                localList = JSON.parse(raw);
            } else {
                // Check legacy batches and migrate
                const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
                if (legacyRaw) {
                    const legacy = JSON.parse(legacyRaw);
                    if (Array.isArray(legacy)) {
                        localList = legacy.map((b: any, idx: number) => ({
                            id: b.id || `migrated_${idx + 1}`,
                            profile_name: b.clientName || 'Atendimento Geral',
                            client_name: b.clientName || 'Cliente',
                            ddd: '11',
                            template_type: 'TEXT' as const,
                            ad_copy: 'Olá {{1}}! Informamos uma novidade exclusiva para você. Clique no botão abaixo para conferir!',
                            button_link: '',
                            status: 'PENDENTE',
                            timestamp: b.createdAt || new Date().toISOString(),
                            dispatch_date: b.createdAt || '',
                            fileName: b.fileName || 'contatos.xlsx',
                            validCount: b.validCount || (b.contacts ? b.contacts.length : 0),
                            totalRows: b.totalRows || (b.contacts ? b.contacts.length : 0),
                            contacts: b.contacts || [],
                            headers: b.headers || ['Telefone', 'Nome'],
                            ads: [{
                                id: '1',
                                ad_name: 'Anúncio Principal',
                                template_type: 'TEXT' as const,
                                message_mode: 'manual' as const,
                                ad_copy: 'Olá {{1}}! Informamos uma novidade exclusiva para você. Clique no botão abaixo para conferir!',
                                variables: ['', '', '', '', ''],
                                button_link: ''
                            }]
                        }));
                        localStorage.setItem(STORAGE_SUBMISSIONS_KEY, JSON.stringify(localList));
                    }
                }
            }
        } catch (e) {
            console.error('Error reading local submissions:', e);
        }

        if (remoteList.length > 0) {
            // Merge remote with local contacts if available
            const merged = remoteList.map(rem => {
                const loc = localList.find(l => String(l.id) === String(rem.id));
                return loc ? { ...rem, contacts: loc.contacts, headers: loc.headers } : rem;
            });
            localStorage.setItem(STORAGE_SUBMISSIONS_KEY, JSON.stringify(merged));
            return merged;
        }

        return localList;
    },

    // Save a new submission
    async createSubmission(payload: Partial<ClientSubmission>): Promise<ClientSubmission> {
        const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');
        let created: ClientSubmission | null = null;

        if (token) {
            try {
                const res = await fetch('/api/client-submissions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        profile_photo: payload.profile_photo || '',
                        profile_name: payload.profile_name || 'Atendimento Geral',
                        ddd: payload.ddd || '11',
                        template_type: payload.template_type || 'TEXT',
                        media_url: payload.media_url || '',
                        ad_copy: payload.ad_copy || '',
                        button_link: payload.button_link || '',
                        original_button_link: payload.button_link || '',
                        spreadsheet_url: payload.spreadsheet_url || '',
                        status: payload.status || 'PENDENTE',
                        notes: payload.notes || '',
                        dispatch_date: payload.dispatch_date || null,
                        ads: payload.ads || [],
                        origin: 'CLIENT_FORM'
                    })
                });
                if (res.ok) {
                    const data = await res.json();
                    created = {
                        ...data,
                        ads: typeof data.ads === 'string' ? JSON.parse(data.ads) : (data.ads || payload.ads || []),
                        contacts: payload.contacts || [],
                        headers: payload.headers || []
                    };
                }
            } catch (err) {
                console.warn('[clientSubmissionStorage] Remote creation failed:', err);
            }
        }

        if (!created) {
            // Local fallback creation
            created = {
                id: `sub_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                campaign_name: payload.campaign_name || payload.profile_name || 'Campanha Sem Título',
                profile_photo: payload.profile_photo || '',
                profile_name: payload.profile_name || 'Atendimento Geral',
                client_name: payload.client_name || payload.campaign_name || payload.profile_name || 'Cliente',
                ddd: payload.ddd || '11',
                template_type: payload.template_type || 'TEXT',
                media_url: payload.media_url || '',
                ad_copy: payload.ad_copy || '',
                button_link: payload.button_link || '',
                spreadsheet_url: payload.spreadsheet_url || '',
                status: payload.status || (payload.dispatch_date ? 'AGENDADO' : 'PENDENTE'),
                timestamp: new Date().toISOString(),
                dispatch_date: payload.dispatch_date || '',
                notes: payload.notes || '',
                ads: payload.ads || [{
                    id: '1',
                    ad_name: payload.campaign_name || payload.profile_name || 'Anúncio 1',
                    template_type: payload.template_type || 'TEXT',
                    message_mode: 'manual',
                    media_url: payload.media_url,
                    ad_copy: payload.ad_copy || '',
                    variables: ['', '', '', '', ''],
                    button_link: payload.button_link
                }],
                contacts: payload.contacts || [],
                headers: payload.headers || [],
                fileName: payload.fileName || 'contatos.xlsx',
                validCount: payload.validCount || (payload.contacts ? payload.contacts.length : 0),
                totalRows: payload.totalRows || (payload.contacts ? payload.contacts.length : 0)
            };
        } else if (payload.campaign_name) {
            created.campaign_name = payload.campaign_name;
        }

        // Persist locally
        const existing = await clientSubmissionStorage.getSubmissions();
        const updated = [created, ...existing.filter(s => String(s.id) !== String(created!.id))];
        localStorage.setItem(STORAGE_SUBMISSIONS_KEY, JSON.stringify(updated));

        return created;
    },

    // Update an existing submission
    async updateSubmission(id: number | string, payload: Partial<ClientSubmission>): Promise<ClientSubmission | null> {
        const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');

        if (token && typeof id === 'number') {
            try {
                await fetch(`/api/client-submissions/${id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(payload)
                });
            } catch (err) {
                console.warn('[clientSubmissionStorage] Remote update failed:', err);
            }
        }

        const existing = await clientSubmissionStorage.getSubmissions();
        const index = existing.findIndex(s => String(s.id) === String(id));
        if (index !== -1) {
            existing[index] = { ...existing[index], ...payload };
            localStorage.setItem(STORAGE_SUBMISSIONS_KEY, JSON.stringify(existing));
            return existing[index];
        }

        return null;
    },

    // Delete a submission
    async deleteSubmission(id: number | string): Promise<boolean> {
        const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');

        if (token && (typeof id === 'number' || !isNaN(Number(id)))) {
            try {
                await fetch(`/api/client-submissions/${id}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
            } catch (err) {
                console.warn('[clientSubmissionStorage] Remote delete failed:', err);
            }
        }

        const existing = await clientSubmissionStorage.getSubmissions();
        const filtered = existing.filter(s => String(s.id) !== String(id));
        localStorage.setItem(STORAGE_SUBMISSIONS_KEY, JSON.stringify(filtered));
        return true;
    },

    // Duplicate a campaign
    async duplicateSubmission(sub: ClientSubmission): Promise<ClientSubmission> {
        const { id, timestamp, ...rest } = sub;
        const dupPayload: Partial<ClientSubmission> = {
            ...rest,
            campaign_name: `${sub.campaign_name || sub.profile_name} (Cópia)`,
            profile_name: `${sub.profile_name} (Cópia)`,
            button_link: '',
            status: 'PENDENTE',
            timestamp: new Date().toISOString(),
            ads: (sub.ads || []).map(ad => ({
                ...ad,
                button_link: '',
                delivered_leads: 0
            }))
        };
        return clientSubmissionStorage.createSubmission(dupPayload);
    },

    // Bulk update status
    async bulkUpdateStatus(ids: (number | string)[], newStatus: string): Promise<boolean> {
        const existing = await clientSubmissionStorage.getSubmissions();
        const idSet = new Set(ids.map(String));
        const updated = existing.map(s => {
            if (idSet.has(String(s.id))) {
                return { ...s, status: newStatus };
            }
            return s;
        });
        localStorage.setItem(STORAGE_SUBMISSIONS_KEY, JSON.stringify(updated));
        return true;
    },

    // Bulk update scheduled date
    async bulkUpdateDispatchDate(ids: (number | string)[], newDate: string): Promise<boolean> {
        const existing = await clientSubmissionStorage.getSubmissions();
        const idSet = new Set(ids.map(String));
        const updated = existing.map(s => {
            if (idSet.has(String(s.id))) {
                return { 
                    ...s, 
                    dispatch_date: newDate, 
                    status: newDate ? 'AGENDADO' : s.status 
                };
            }
            return s;
        });
        localStorage.setItem(STORAGE_SUBMISSIONS_KEY, JSON.stringify(updated));
        return true;
    },

    // Bulk delete submissions
    async bulkDelete(ids: (number | string)[], token?: string): Promise<boolean> {
        const existing = await clientSubmissionStorage.getSubmissions();
        const idSet = new Set(ids.map(String));
        const filtered = existing.filter(s => !idSet.has(String(s.id)));
        localStorage.setItem(STORAGE_SUBMISSIONS_KEY, JSON.stringify(filtered));
        return true;
    }
};
