import { SavedMediaItem } from '../types';

const STORAGE_KEY = 'express_saved_media_v1';

export const mediaStorage = {
    // Retorna todos os arquivos salvos permanentemente
    getAllMedia(): SavedMediaItem[] {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return [];
            return JSON.parse(raw);
        } catch (e) {
            console.error('Erro ao ler mídias salvas:', e);
            return [];
        }
    },

    // Retorna estritamente os últimos 5 para a galeria limpa
    getRecentMedia(limit = 5): SavedMediaItem[] {
        const all = mediaStorage.getAllMedia();
        return all.slice(0, limit);
    },

    // Salva a mídia com persistência permanente no banco/localStorage
    saveMedia(item: Omit<SavedMediaItem, 'id' | 'createdAt'> & { id?: string }): SavedMediaItem {
        const list = mediaStorage.getAllMedia();
        const target: SavedMediaItem = {
            ...item,
            id: item.id || `media_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            createdAt: new Date().toISOString()
        };

        // Remove duplicatas por URL se já existir
        const filtered = list.filter(m => m.url !== target.url && m.id !== target.id);
        filtered.unshift(target);

        // Limita histórico salvo a 100 itens para não estourar storage
        const capped = filtered.slice(0, 100);

        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(capped));
        } catch (e) {
            console.error('Erro ao salvar mídia:', e);
        }

        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('media_storage_updated'));
        }

        return target;
    },

    // Excluir mídia se necessário
    deleteMedia(id: string): void {
        const list = mediaStorage.getAllMedia().filter(m => m.id !== id);
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
        } catch (e) {
            console.error('Erro ao excluir mídia:', e);
        }
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('media_storage_updated'));
        }
    }
};
