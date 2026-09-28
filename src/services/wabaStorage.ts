import { SavedWaba } from '../types';

const STORAGE_KEY = 'express_saved_wabas_v1';

export const wabaStorage = {
    getSavedWabas(): SavedWaba[] {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return [];
            return JSON.parse(raw);
        } catch (e) {
            console.error('Erro ao ler WABAs salvas:', e);
            return [];
        }
    },

    saveWaba(waba: Omit<SavedWaba, 'id' | 'createdAt'> & { id?: string }): SavedWaba {
        const list = wabaStorage.getSavedWabas();
        let target: SavedWaba;

        if (waba.id) {
            const idx = list.findIndex(w => w.id === waba.id);
            if (idx !== -1) {
                target = {
                    ...list[idx],
                    ...waba,
                    id: waba.id
                };
                list[idx] = target;
            } else {
                target = {
                    ...waba,
                    id: waba.id,
                    createdAt: new Date().toISOString()
                };
                list.push(target);
            }
        } else {
            target = {
                ...waba,
                id: 'waba_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
                createdAt: new Date().toISOString()
            };
            list.unshift(target);
        }

        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('waba_storage_updated'));
        }
        return target;
    },

    deleteWaba(id: string): void {
        const list = wabaStorage.getSavedWabas().filter(w => w.id !== id);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('waba_storage_updated'));
        }
    },

    duplicateWaba(id: string): SavedWaba | null {
        const list = wabaStorage.getSavedWabas();
        const found = list.find(w => w.id === id);
        if (!found) return null;

        const duplicated: SavedWaba = {
            ...found,
            id: 'waba_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
            label: `${found.label} (Cópia)`,
            createdAt: new Date().toISOString()
        };

        list.unshift(duplicated);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('waba_storage_updated'));
        }
        return duplicated;
    }
};
