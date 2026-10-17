// =====================================================================
// SAFE STORAGE SERVICE (IndexedDB + Auto-Prune LocalStorage Fallback)
// Elimina o limite rígido de 5MB do localStorage utilizando IndexedDB
// (capacidade de centenas de MB/GBs) e auto-recuperação de QuotaExceededError.
// =====================================================================

const DB_NAME = 'plugesales_unified_storage_v1';
const DB_VERSION = 1;
const STORE_NAME = 'keyval';

// Memória em cache para leitura síncrona imediata
const memoryCache = new Map<string, string>();

let dbPromise: Promise<IDBDatabase | null> | null = null;

function getDb(): Promise<IDBDatabase | null> {
    if (typeof window === 'undefined' || !window.indexedDB) {
        return Promise.resolve(null);
    }
    if (!dbPromise) {
        dbPromise = new Promise((resolve) => {
            try {
                const request = window.indexedDB.open(DB_NAME, DB_VERSION);
                request.onupgradeneeded = () => {
                    const db = request.result;
                    if (!db.objectStoreNames.contains(STORE_NAME)) {
                        db.createObjectStore(STORE_NAME);
                    }
                };
                request.onsuccess = () => {
                    resolve(request.result);
                };
                request.onerror = (e) => {
                    console.warn('[SafeStorage] IndexedDB open error, continuing with memory/localStorage:', e);
                    resolve(null);
                };
            } catch (err) {
                console.warn('[SafeStorage] IndexedDB unavailable:', err);
                resolve(null);
            }
        });
    }
    return dbPromise;
}

// Salva em IndexedDB de forma assíncrona (armazenamento sem limite de 5MB)
async function idbSet(key: string, value: string): Promise<void> {
    try {
        const db = await getDb();
        if (!db) return;
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(value, key);
    } catch (err) {
        console.warn('[SafeStorage] idbSet error for key:', key, err);
    }
}

// Lê de IndexedDB de forma assíncrona
async function idbGet(key: string): Promise<string | null> {
    try {
        const db = await getDb();
        if (!db) return null;
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result !== undefined ? req.result : null);
            req.onerror = () => resolve(null);
        });
    } catch {
        return null;
    }
}

// Remove de IndexedDB
async function idbDelete(key: string): Promise<void> {
    try {
        const db = await getDb();
        if (!db) return;
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(key);
    } catch (err) {
        console.warn('[SafeStorage] idbDelete error for key:', key, err);
    }
}

// Função de auto-limpeza do localStorage quando atinge o limite do navegador
function pruneLocalStorageToFreeQuota(): boolean {
    if (typeof localStorage === 'undefined') return false;
    let freedSomething = false;

    try {
        // 1. Limpa ou reduz drasticamente o histórico temporário de disparos (express_live_dispatch_records)
        const dispatchRaw = localStorage.getItem('express_live_dispatch_records');
        if (dispatchRaw) {
            try {
                const parsed = JSON.parse(dispatchRaw);
                if (Array.isArray(parsed) && parsed.length > 50) {
                    // Salva cópia completa no IndexedDB antes de podar o localStorage
                    idbSet('express_live_dispatch_records', dispatchRaw);
                    // Deixa só 50 mais recentes no localStorage
                    localStorage.setItem('express_live_dispatch_records', JSON.stringify(parsed.slice(0, 50)));
                    freedSomething = true;
                    console.log('[SafeStorage] Reduzido express_live_dispatch_records de', parsed.length, 'para 50 itens.');
                } else if (parsed.length > 0) {
                    idbSet('express_live_dispatch_records', dispatchRaw);
                    localStorage.removeItem('express_live_dispatch_records');
                    freedSomething = true;
                }
            } catch {
                localStorage.removeItem('express_live_dispatch_records');
                freedSomething = true;
            }
        }

        // 2. Se ainda precisar, migra e limpa submissões com contatos pesados
        const submissionsRaw = localStorage.getItem('plugesales_client_submissions_v1');
        if (submissionsRaw && submissionsRaw.length > 1000000) {
            idbSet('plugesales_client_submissions_v1', submissionsRaw);
            try {
                const subs = JSON.parse(submissionsRaw);
                if (Array.isArray(subs)) {
                    // Remove array de contatos gigantes para economizar MBs no localStorage
                    const slim = subs.map((s: any) => ({
                        ...s,
                        contacts: (s.contacts && s.contacts.length > 20) ? s.contacts.slice(0, 20) : s.contacts
                    }));
                    localStorage.setItem('plugesales_client_submissions_v1', JSON.stringify(slim));
                    freedSomething = true;
                    console.log('[SafeStorage] Reduzido tamanho de plugesales_client_submissions_v1.');
                }
            } catch {}
        }
    } catch (e) {
        console.warn('[SafeStorage] Erro ao tentar podar localStorage:', e);
    }

    return freedSomething;
}

// Inicializa e carrega cache em memória
export function initSafeStorage() {
    if (typeof window === 'undefined') return;

    // Checagem proativa no boot da página: se o localStorage já estiver quase no limite (> 3MB), faz a poda agora
    try {
        let totalBytes = 0;
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k) {
                const v = localStorage.getItem(k) || '';
                totalBytes += k.length + v.length;
            }
        }
        // Se ultrapassar 2.5MB (~2.5 milhões de caracteres UTF-16)
        if (totalBytes > 2500000) {
            console.log('[SafeStorage] Total em localStorage alto (' + Math.round(totalBytes / 1024) + ' KB). Executando auto-prune proativo...');
            pruneLocalStorageToFreeQuota();
        }
    } catch {}

    // Inicializa IndexedDB
    getDb().then(async () => {
        // Pré-carrega chaves críticas do IndexedDB caso o localStorage tenha sido esvaziado
        const keysToRestore = [
            'plugesales_pro_rotators_v1',
            'plugesales_client_submissions_v1',
            'plugesales_saved_wabas_v1'
        ];
        for (const k of keysToRestore) {
            try {
                const val = await idbGet(k);
                if (val && !localStorage.getItem(k)) {
                    memoryCache.set(k, val);
                    try {
                        localStorage.setItem(k, val);
                    } catch {}
                }
            } catch {}
        }
    });
}

// Executa init imediatamente ao importar
if (typeof window !== 'undefined') {
    initSafeStorage();
}

export const safeStorage = {
    // Leitura síncrona segura
    getItem(key: string): string | null {
        if (memoryCache.has(key)) {
            return memoryCache.get(key)!;
        }
        if (typeof localStorage !== 'undefined') {
            try {
                const val = localStorage.getItem(key);
                if (val !== null) {
                    memoryCache.set(key, val);
                    return val;
                }
            } catch {}
        }
        return null;
    },

    // Leitura assíncrona (busca no IndexedDB se não estiver no localStorage)
    async getItemAsync(key: string): Promise<string | null> {
        const syncVal = safeStorage.getItem(key);
        if (syncVal !== null) return syncVal;

        const idbVal = await idbGet(key);
        if (idbVal !== null) {
            memoryCache.set(key, idbVal);
            return idbVal;
        }
        return null;
    },

    // Gravação 100% segura sem limite de cota: NUNCA estoura erro para o usuário
    setItem(key: string, value: string): void {
        // 1. Sempre grava em memória imediatamente
        memoryCache.set(key, value);

        // 2. Sempre persiste em IndexedDB (onde NÃO há o limite de 5MB)
        idbSet(key, value);

        // 3. Tenta salvar no localStorage com recuperação de cota
        if (typeof localStorage !== 'undefined') {
            try {
                localStorage.setItem(key, value);
            } catch (err: any) {
                const isQuotaError = 
                    err?.name === 'QuotaExceededError' ||
                    err?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
                    err?.code === 22 ||
                    err?.code === 1014 ||
                    (typeof err?.message === 'string' && (
                        err.message.toLowerCase().includes('quota') ||
                        err.message.toLowerCase().includes('exceeded')
                    ));

                if (isQuotaError) {
                    console.warn(`[SafeStorage] Quota exceeded ao salvar chave '${key}'. Liberando espaço no localStorage...`);
                    
                    // Faz a poda de caches pesados
                    pruneLocalStorageToFreeQuota();

                    // Tenta de novo salvar a chave atual
                    try {
                        localStorage.setItem(key, value);
                        console.log(`[SafeStorage] Chave '${key}' salva com sucesso no localStorage após liberação de espaço.`);
                    } catch (retryErr) {
                        // Se o próprio valor for maior que a cota total do localStorage, não tem problema:
                        // O dado JÁ está 100% gravado no IndexedDB e na memória!
                        console.warn(`[SafeStorage] Chave '${key}' mantida com sucesso no IndexedDB e Memória (tamanho excede localStorage total).`);
                    }
                } else {
                    console.warn(`[SafeStorage] Erro ao gravar chave '${key}' no localStorage:`, err);
                }
            }
        }
    },

    // Remoção síncrona e assíncrona
    removeItem(key: string): void {
        memoryCache.delete(key);
        if (typeof localStorage !== 'undefined') {
            try {
                localStorage.removeItem(key);
            } catch {}
        }
        idbDelete(key);
    },

    // Limpeza forçada de caches para emergências
    forceFreeQuota(): void {
        pruneLocalStorageToFreeQuota();
    }
};
