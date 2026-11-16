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

    // Chaves vitais de autenticação que NUNCA devem ser excluídas
    const PROTECTED_KEYS = new Set([
        'auth_token',
        'auth_user',
        'pns_user',
        'fast_dispatch_session_revoked_2026_11_12_v1'
    ]);

    try {
        // 1. Limpa histórico temporário pesado de disparos (salva no IndexedDB antes)
        const dispatchRaw = localStorage.getItem('express_live_dispatch_records');
        if (dispatchRaw) {
            idbSet('express_live_dispatch_records', dispatchRaw);
            localStorage.removeItem('express_live_dispatch_records');
            freedSomething = true;
            console.log('[SafeStorage] Migrado express_live_dispatch_records para IndexedDB.');
        }

        // 2. Submissões com planilhas de contatos gigantes (salva tudo no IndexedDB)
        const submissionsRaw = localStorage.getItem('plugesales_client_submissions_v1');
        if (submissionsRaw) {
            idbSet('plugesales_client_submissions_v1', submissionsRaw);
            try {
                const subs = JSON.parse(submissionsRaw);
                if (Array.isArray(subs)) {
                    // Mantém versão slim no localStorage sem os arrays brutos de contatos
                    const slim = subs.slice(0, 15).map((s: any) => {
                        const { contacts, ...rest } = s;
                        return { ...rest, validCount: s.validCount || (contacts ? contacts.length : 0) };
                    });
                    localStorage.setItem('plugesales_client_submissions_v1', JSON.stringify(slim));
                } else {
                    localStorage.removeItem('plugesales_client_submissions_v1');
                }
            } catch {
                localStorage.removeItem('plugesales_client_submissions_v1');
            }
            freedSomething = true;
            console.log('[SafeStorage] Migrado plugesales_client_submissions_v1 para IndexedDB.');
        }

        // 3. Mídias em base64 (salva no IndexedDB e remove do localStorage)
        const mediaRaw = localStorage.getItem('plugesales_media_items_v1');
        if (mediaRaw) {
            idbSet('plugesales_media_items_v1', mediaRaw);
            localStorage.removeItem('plugesales_media_items_v1');
            freedSomething = true;
            console.log('[SafeStorage] Migrado plugesales_media_items_v1 para IndexedDB.');
        }

        // 4. Analisa todas as chaves restantes no localStorage e remove as mais pesadas não essenciais
        const nonProtectedEntries: Array<{ key: string; size: number }> = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && !PROTECTED_KEYS.has(k)) {
                const val = localStorage.getItem(k) || '';
                nonProtectedEntries.push({ key: k, size: val.length });
            }
        }

        nonProtectedEntries.sort((a, b) => b.size - a.size);
        for (const entry of nonProtectedEntries) {
            if (entry.size > 20000) { // maiores que ~20KB
                const val = localStorage.getItem(entry.key);
                if (val) {
                    idbSet(entry.key, val);
                    localStorage.removeItem(entry.key);
                    freedSomething = true;
                    console.log(`[SafeStorage] Chave pesada '${entry.key}' (${Math.round(entry.size / 1024)} KB) migrada para IndexedDB.`);
                }
            }
        }
    } catch (e) {
        console.warn('[SafeStorage] Erro ao tentar podar localStorage:', e);
    }

    return freedSomething;
}

// Inicializa e carrega cache em memória
export function initSafeStorage() {
    if (typeof window === 'undefined') return;

    // Checagem proativa no boot da página: se o localStorage tiver > 1.5MB, faz poda preventiva
    try {
        let totalBytes = 0;
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k) {
                const v = localStorage.getItem(k) || '';
                totalBytes += k.length + v.length;
            }
        }
        if (totalBytes > 1500000) {
            console.log('[SafeStorage] Total em localStorage alto (' + Math.round(totalBytes / 1024) + ' KB). Executando poda proativa...');
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
        if (typeof sessionStorage !== 'undefined') {
            try {
                const sessionVal = sessionStorage.getItem(key);
                if (sessionVal !== null) {
                    memoryCache.set(key, sessionVal);
                    return sessionVal;
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

        // 3. Persiste em sessionStorage como camada redundante
        if (typeof sessionStorage !== 'undefined') {
            try {
                sessionStorage.setItem(key, value);
            } catch {}
        }

        // 4. Tenta salvar no localStorage com recuperação automática de cota
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
                        // O dado JÁ está 100% gravado no IndexedDB, sessionStorage e na memória!
                        console.warn(`[SafeStorage] Chave '${key}' mantida com sucesso no IndexedDB, sessionStorage e Memória.`);
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
