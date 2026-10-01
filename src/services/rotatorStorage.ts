import { ProRotator, RotatorTarget, RotatorStats } from '../types';

const STORAGE_KEY = 'plugesales_pro_rotators_v1';

export const rotatorStorage = {
    // 1. Get all rotators
    async getRotators(): Promise<ProRotator[]> {
        const token = localStorage.getItem('auth_token');
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        try {
            const res = await fetch('/api/pro-links', { headers });
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) {
                    const parsed = data.map(r => ({
                        ...r,
                        targets: typeof r.targets === 'string' ? JSON.parse(r.targets) : (r.targets || [])
                    }));
                    // Cache in localStorage
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
                    return parsed;
                }
            }
        } catch (err) {
            console.warn('[RotatorStorage] API offline or error, reading local cache:', err);
        }

        // Fallback to localStorage
        try {
            const localRaw = localStorage.getItem(STORAGE_KEY);
            if (localRaw) {
                return JSON.parse(localRaw);
            }
        } catch (e) {
            console.error('[RotatorStorage] Error reading localStorage:', e);
        }

        return [];
    },

    // 2. Create new rotator
    async createRotator(data: {
        title: string;
        slug?: string;
        targets: RotatorTarget[];
        client_id?: number | string | null;
    }): Promise<ProRotator> {
        const token = localStorage.getItem('auth_token');
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const cleanSlug = data.slug ? String(data.slug).trim().replace(/[^a-zA-Z0-9_-]/g, '') : Math.random().toString(36).substring(2, 8);
        
        let createdItem: ProRotator | null = null;

        try {
            const res = await fetch('/api/pro-links', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    title: data.title || 'Rotacionador PRO',
                    slug: cleanSlug,
                    targets: data.targets,
                    client_id: data.client_id || null
                })
            });

            if (res.ok) {
                const resData = await res.json();
                createdItem = {
                    ...resData,
                    targets: typeof resData.targets === 'string' ? JSON.parse(resData.targets) : (resData.targets || [])
                };
            }
        } catch (err) {
            console.warn('[RotatorStorage] API create failed, saving locally:', err);
        }

        // Local fallback item if API was unreachable
        if (!createdItem) {
            createdItem = {
                id: Date.now(),
                title: data.title || 'Rotacionador PRO',
                slug: cleanSlug,
                targets: data.targets,
                total_clicks: 0,
                created_at: new Date().toISOString()
            };
        }

        // Update local cache
        const current = await this.getLocalList();
        const updated = [createdItem, ...current.filter(r => r.id !== createdItem!.id)];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

        return createdItem;
    },

    // 3. Update existing rotator (title, slug, targets with weight)
    async updateRotator(id: number | string, data: {
        title?: string;
        slug?: string;
        targets?: RotatorTarget[];
    }): Promise<ProRotator> {
        const token = localStorage.getItem('auth_token');
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        let updatedItem: ProRotator | null = null;

        try {
            const res = await fetch(`/api/pro-links/${id}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify(data)
            });

            if (res.ok) {
                const resData = await res.json();
                updatedItem = {
                    ...resData,
                    targets: typeof resData.targets === 'string' ? JSON.parse(resData.targets) : (resData.targets || [])
                };
            }
        } catch (err) {
            console.warn('[RotatorStorage] API update failed, updating locally:', err);
        }

        // Update local list
        const current = await this.getLocalList();
        const index = current.findIndex(r => String(r.id) === String(id));
        if (index >= 0) {
            const existing = current[index];
            const merged: ProRotator = {
                ...existing,
                title: data.title !== undefined ? data.title : existing.title,
                slug: data.slug !== undefined ? data.slug : existing.slug,
                targets: data.targets !== undefined ? data.targets : existing.targets
            };
            current[index] = updatedItem || merged;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
            return current[index];
        }

        return updatedItem || {
            id,
            title: data.title || '',
            slug: data.slug || '',
            targets: data.targets || []
        };
    },

    // 4. Delete rotator
    async deleteRotator(id: number | string): Promise<boolean> {
        const token = localStorage.getItem('auth_token');
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        try {
            await fetch(`/api/pro-links/${id}`, { method: 'DELETE', headers });
        } catch (err) {
            console.warn('[RotatorStorage] API delete failed, deleting locally:', err);
        }

        const current = await this.getLocalList();
        const filtered = current.filter(r => String(r.id) !== String(id));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
        return true;
    },

    // 5. Get individual rotator stats & analytics
    async getRotatorStats(id: number | string): Promise<RotatorStats | null> {
        const token = localStorage.getItem('auth_token');
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        try {
            const res = await fetch(`/api/pro-links/${id}/stats`, { headers });
            if (res.ok) {
                const data = await res.json();
                if (data && data.rotator) {
                    return {
                        rotator: {
                            ...data.rotator,
                            targets: typeof data.rotator.targets === 'string' ? JSON.parse(data.rotator.targets) : (data.rotator.targets || [])
                        },
                        targets: data.targets || [],
                        timeline: data.timeline || [],
                        recentClicks: data.recentClicks || []
                    };
                }
            }
        } catch (err) {
            console.warn('[RotatorStorage] API stats error, generating local stats:', err);
        }

        // Local calculation fallback
        const current = await this.getLocalList();
        const item = current.find(r => String(r.id) === String(id));
        if (!item) return null;

        const total = item.total_clicks || 0;
        const totalWeight = item.targets.reduce((sum, t) => sum + (Number(t.weight) || 1), 0) || 1;

        const mockTargets = item.targets.map((t, idx) => ({
            target_index: idx,
            target_url: t.url,
            clicks: Math.round(total * (Number(t.weight || 1) / totalWeight))
        }));

        // Mock timeline for last 7 days
        const timeline = [];
        const today = new Date();
        for (let i = 6; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(today.getDate() - i);
            timeline.push({
                date: d.toISOString().slice(0, 10),
                clicks: Math.max(0, Math.round(total / (7 + i)))
            });
        }

        return {
            rotator: item,
            targets: mockTargets,
            timeline,
            recentClicks: []
        };
    },

    // 6. Bulk delete
    async bulkDelete(ids: (number | string)[]): Promise<boolean> {
        const token = localStorage.getItem('auth_token');
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        try {
            await fetch('/api/pro-links/bulk-delete', {
                method: 'POST',
                headers,
                body: JSON.stringify({ ids })
            });
        } catch (err) {
            console.warn('[RotatorStorage] API bulk-delete failed, updating locally:', err);
        }

        const idsSet = new Set(ids.map(String));
        const current = await this.getLocalList();
        const filtered = current.filter(r => !idsSet.has(String(r.id)));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
        return true;
    },

    // 7. Bulk add target
    async bulkAddTarget(ids: (number | string)[], target: RotatorTarget): Promise<boolean> {
        const token = localStorage.getItem('auth_token');
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        try {
            await fetch('/api/pro-links/bulk-add-target', {
                method: 'POST',
                headers,
                body: JSON.stringify({ ids, target })
            });
        } catch (err) {
            console.warn('[RotatorStorage] API bulk-add failed, updating locally:', err);
        }

        const idsSet = new Set(ids.map(String));
        const current = await this.getLocalList();
        const updated = current.map(r => {
            if (idsSet.has(String(r.id))) {
                return {
                    ...r,
                    targets: [...r.targets, target]
                };
            }
            return r;
        });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        return true;
    },

    // 8. Bulk reset targets to single target
    async bulkResetTargets(ids: (number | string)[], target: RotatorTarget): Promise<boolean> {
        const token = localStorage.getItem('auth_token');
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        try {
            await fetch('/api/pro-links/bulk-reset-targets', {
                method: 'POST',
                headers,
                body: JSON.stringify({ ids, target })
            });
        } catch (err) {
            console.warn('[RotatorStorage] API bulk-reset failed, updating locally:', err);
        }

        const idsSet = new Set(ids.map(String));
        const current = await this.getLocalList();
        const updated = current.map(r => {
            if (idsSet.has(String(r.id))) {
                return {
                    ...r,
                    targets: [target]
                };
            }
            return r;
        });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        return true;
    },

    // Helper: read raw list from localStorage
    async getLocalList(): Promise<ProRotator[]> {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    }
};
