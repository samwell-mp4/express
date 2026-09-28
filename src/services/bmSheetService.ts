import * as XLSX from 'xlsx';
import { BmRecord, CollaboratorConfig } from '../types';

export const COLLABORATOR_SHEETS: CollaboratorConfig[] = [
    { name: 'Geraldo e Joyce', gid: '1891628336' },
    { name: 'Thiago', gid: '879953666' },
    { name: 'Ricardo', gid: '667662526' },
    { name: 'Gelton', gid: '1873785868' },
    { name: 'Gabriel.M', gid: '1737381979' },
    { name: 'Otavio', gid: '197007771' },
    { name: 'Ramon', gid: '1927928604' },
    { name: 'Anderson', gid: '1208062035' },
    { name: 'Bernardo', gid: '810544018' },
    { name: 'Lucas', gid: '108879898' },
    { name: 'Augusto', gid: '1913598537' },
    { name: 'Italo', gid: '923813990' },
    { name: 'Gabriel.A', gid: '1004352589' },
    { name: 'Samwell', gid: '29074140' }
];

const BASE_PUB_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSgMK4ZwR9PhuXaHAwlBbtbXM_bGsSThF7SLyn2by1ObgxZ14FNF1Lcednw87xAuA/pub';
const STORAGE_KEY = 'express_bm_cache_v2';

export const bmSheetService = {
    /**
     * Retorna os registros do cache local no LocalStorage
     */
    getCached(): { records: BmRecord[]; timestamp: string } | null {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (parsed && Array.isArray(parsed.records)) {
                return parsed;
            }
        } catch (e) {
            console.warn('Erro ao ler cache de BMs:', e);
        }
        return null;
    },

    /**
     * Salva registros no LocalStorage
     */
    saveCached(records: BmRecord[]) {
        try {
            const payload = {
                timestamp: new Date().toISOString(),
                records
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch (e) {
            console.warn('Erro ao salvar cache de BMs:', e);
        }
    },

    /**
     * Converte o texto CSV de uma aba para BmRecord[] usando XLSX
     */
    parseCsv(csvText: string, collaborator: string): BmRecord[] {
        if (!csvText || !csvText.trim()) return [];

        try {
            const workbook = XLSX.read(csvText, { type: 'string' });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

            if (!rows || rows.length === 0) return [];

            // Identificar a linha de cabeçalho
            let headerIdx = -1;
            for (let i = 0; i < Math.min(rows.length, 5); i++) {
                const rowStr = rows[i].map((c: any) => String(c).toLowerCase()).join(' ');
                if (rowStr.includes('data') && (rowStr.includes('bm') || rowStr.includes('adspower') || rowStr.includes('número') || rowStr.includes('numero') || rowStr.includes('facebook'))) {
                    headerIdx = i;
                    break;
                }
            }

            if (headerIdx === -1) {
                // Fallback para linha 0 se não achar padrão
                headerIdx = 0;
            }

            const headers = rows[headerIdx].map((h: any) => String(h || '').trim().toLowerCase());

            // Mapear posições de colunas dinamicamente
            const getColIdx = (keywords: string[]) => {
                return headers.findIndex((h: string) => keywords.some(k => h.includes(k)));
            };

            const dataCol = getColIdx(['data']);
            const adspowerCol = getColIdx(['adspower', 'id - ads', 'id ads']);
            const fbCol = getColIdx(['contato', 'facebook']);
            const numCol = getColIdx(['número', 'numero', 'whatsapp', 'tel']);
            const bmCol = getColIdx(['nome da bm', 'bm']);
            const verifCol = getColIdx(['verificação', 'verificacao', 'status']);
            const limiteCol = getColIdx(['limite']);
            const obsCol = getColIdx(['observação', 'observacao', 'obs']);
            const procCol = getColIdx(['processo', 'banimento']);

            const results: BmRecord[] = [];

            for (let r = headerIdx + 1; r < rows.length; r++) {
                const row = rows[r];
                if (!row || row.length === 0) continue;

                const getVal = (idx: number) => {
                    if (idx < 0 || idx >= row.length) return '';
                    const val = row[idx];
                    return val !== undefined && val !== null ? String(val).trim() : '';
                };

                const dataVal = getVal(dataCol);
                const adspowerVal = getVal(adspowerCol);
                const fbVal = getVal(fbCol);
                const numVal = getVal(numCol);
                const bmVal = getVal(bmCol);
                const verifVal = getVal(verifCol);
                const limiteVal = getVal(limiteCol);
                const obsVal = getVal(obsCol);
                const procVal = getVal(procCol);

                // Ignora linhas totalmente em branco ou de cabeçalhos repetidos
                if (!dataVal && !numVal && !bmVal && !adspowerVal && !fbVal && !verifVal) {
                    continue;
                }

                // Evitar linhas acidentais de cabeçalho duplicado
                if (dataVal.toLowerCase() === 'data' && bmVal.toLowerCase().includes('bm')) {
                    continue;
                }

                results.push({
                    id: `${collaborator.replace(/[^a-zA-Z0-9]/g, '_')}_${r}_${numVal || Math.random().toString(36).slice(2, 6)}`,
                    colaborador: collaborator,
                    data: dataVal,
                    idAdspower: adspowerVal,
                    contatoFacebook: fbVal,
                    numero: numVal,
                    nomeBm: bmVal,
                    verificacao: verifVal,
                    limiteBm: limiteVal,
                    observacao: obsVal,
                    processosBanimentos: procVal,
                    rawRow: row
                });
            }

            return results;
        } catch (err) {
            console.error(`Erro ao processar CSV da aba ${collaborator}:`, err);
            return [];
        }
    },

    /**
     * Busca dados de todos os 14 colaboradores
     */
    async fetchAll(forceRefresh = false): Promise<{ records: BmRecord[]; timestamp: string }> {
        // Se temos cache e não for refresh forçado, podemos retornar de imediato se recente
        if (!forceRefresh) {
            const cached = this.getCached();
            if (cached && cached.records.length > 0) {
                return cached;
            }
        }

        try {
            // Tenta obter via backend proxy Vite (/api/bm-sheets?all=true)
            const proxyRes = await fetch('/api/bm-sheets?all=true');
            if (proxyRes.ok) {
                const json = await proxyRes.json();
                if (json.success && Array.isArray(json.sheets)) {
                    const allRecords: BmRecord[] = [];
                    for (const sheet of json.sheets) {
                        if (sheet.csv) {
                            const parsed = this.parseCsv(sheet.csv, sheet.name);
                            allRecords.push(...parsed);
                        }
                    }
                    this.saveCached(allRecords);
                    return {
                        records: allRecords,
                        timestamp: json.timestamp || new Date().toISOString()
                    };
                }
            }
        } catch (proxyErr) {
            console.warn('Proxy local falhou ou indisponível, buscando direto do Google Sheets:', proxyErr);
        }

        // Fallback: Busca direta das 14 abas do Google Sheets
        const directPromises = COLLABORATOR_SHEETS.map(async (collab) => {
            try {
                const sheetUrl = `${BASE_PUB_URL}?gid=${collab.gid}&single=true&output=csv`;
                const res = await fetch(sheetUrl);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const csv = await res.text();
                return this.parseCsv(csv, collab.name);
            } catch (err) {
                console.error(`Falha no fallback direto para ${collab.name}:`, err);
                return [] as BmRecord[];
            }
        });

        const settled = await Promise.all(directPromises);
        const merged = settled.flat();
        this.saveCached(merged);

        return {
            records: merged,
            timestamp: new Date().toISOString()
        };
    },

    /**
     * Extrai valores únicos para os filtros rápidos
     */
    getUniqueFilters(records: BmRecord[]) {
        const verifications = new Set<string>();
        const limits = new Set<string>();
        const observations = new Set<string>();
        const processes = new Set<string>();

        for (const r of records) {
            if (r.verificacao) verifications.add(r.verificacao.trim());
            if (r.limiteBm) limits.add(r.limiteBm.trim());
            if (r.observacao) observations.add(r.observacao.trim());
            if (r.processosBanimentos) processes.add(r.processosBanimentos.trim());
        }

        return {
            verifications: Array.from(verifications).filter(Boolean).sort(),
            limits: Array.from(limits).filter(Boolean).sort(),
            observations: Array.from(observations).filter(Boolean).sort(),
            processes: Array.from(processes).filter(Boolean).sort()
        };
    }
};
