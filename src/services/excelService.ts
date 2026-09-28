import * as XLSX from 'xlsx';
import { ParsedContact, SenderConfig } from '../types';

export interface SpreadsheetAnalysis {
    contacts: ParsedContact[];
    headers: string[];
    stats: {
        totalRows: number;
        validCount: number;
        duplicateCount: number;
        invalidCount: number;
    };
    samplePreview: ParsedContact[];
    detectedPhoneCol: number;
    detectedNameCol: number;
    rawGrid?: any[][];
    dataStartIndex?: number;
}

export const excelService = {
    // 1. Strict Brazil phone normalization: 55 + DDD + 9 + 8 digits = 13 digits
    normalizePhone(input: any): string {
        if (!input && input !== 0) return '';
        
        let cleaned = '';
        if (typeof input === 'number') {
            // Handle float / scientific notation from Excel (e.g. 5.51199E+12)
            try {
                cleaned = BigInt(Math.floor(input)).toString();
            } catch {
                cleaned = Math.floor(input).toString();
            }
        } else {
            cleaned = String(input).trim();
            // Remove decimal suffix like .0 or .00 if exported as numeric string
            cleaned = cleaned.replace(/\.0+$/, '');
            // If it contains scientific notation string like 5.51199E+12
            if (/^\d+(\.\d+)?[eE]\+\d+$/.test(cleaned)) {
                try {
                    cleaned = BigInt(Math.floor(Number(cleaned))).toString();
                } catch {
                    // ignore
                }
            }
        }

        // Keep digits only
        cleaned = cleaned.replace(/\D/g, '');
        // Remove leading zero (e.g., 011988887777 -> 11988887777)
        cleaned = cleaned.replace(/^0+/, '');
        
        // 10 digits (DDD + 8 digits) -> 55 + DDD + 9 + 8 digits = 13 digits
        if (cleaned.length === 10) {
            cleaned = '55' + cleaned.slice(0, 2) + '9' + cleaned.slice(2);
        } else if (cleaned.length === 11) {
            // 11 digits (DDD + 9 digits) -> 55 + 11 digits = 13 digits
            cleaned = '55' + cleaned;
        } else if (cleaned.length === 12 && cleaned.startsWith('55')) {
            // 12 digits (55 + DDD + 8 digits) -> add 9th digit
            cleaned = cleaned.slice(0, 4) + '9' + cleaned.slice(4);
        }

        return cleaned;
    },

    // Extract contacts from parsed 2D array given specific phone and name column indices
    extractFromGrid(
        json: any[][], 
        dataStartIndex: number, 
        phoneColIndex: number, 
        nameColIndex: number, 
        finalHeaders: string[]
    ): { contacts: ParsedContact[]; stats: { totalRows: number; validCount: number; duplicateCount: number; invalidCount: number }; samplePreview: ParsedContact[] } {
        const extracted: ParsedContact[] = [];
        const seen = new Set<string>();
        let duplicates = 0;
        let invalid = 0;

        for (let i = dataStartIndex; i < json.length; i++) {
            const row = json[i];
            if (!row || row.length === 0 || row.every((c: any) => c === '' || c === null)) continue;
            
            const rawCell = row[phoneColIndex];
            const phone = excelService.normalizePhone(rawCell);

            // Valid phone (at least 10 digits, normalized BR has 13)
            if (phone.length >= 10 && phone.length <= 15) {
                if (seen.has(phone)) {
                    duplicates++;
                    continue;
                }
                seen.add(phone);

                let contactName = '';
                if (nameColIndex !== -1 && row[nameColIndex] !== undefined && row[nameColIndex] !== null) {
                    contactName = String(row[nameColIndex]).trim();
                } else if (phoneColIndex !== 0 && row[0]) {
                    contactName = String(row[0]).trim();
                }

                const contact: ParsedContact = {
                    telefone: phone,
                    nome: contactName
                };

                // Add any additional columns
                if (finalHeaders && finalHeaders.length > 0) {
                    finalHeaders.forEach((h: string, cIdx: number) => {
                        if (cIdx !== phoneColIndex && cIdx !== nameColIndex && h) {
                            contact[h] = String(row[cIdx] !== undefined && row[cIdx] !== null ? row[cIdx] : '');
                        }
                    });
                }

                extracted.push(contact);
            } else {
                invalid++;
            }
        }

        const totalRows = Math.max(0, json.length - dataStartIndex);

        return {
            contacts: extracted,
            stats: {
                totalRows,
                validCount: extracted.length,
                duplicateCount: duplicates,
                invalidCount: invalid
            },
            samplePreview: extracted.slice(0, 10)
        };
    },

    // 2. Parse uploaded XLSX, XLS, CSV or TSV file
    async parseFile(file: File): Promise<SpreadsheetAnalysis> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target?.result as ArrayBuffer);
                    const workbook = XLSX.read(data, { 
                        type: 'array',
                        cellDates: false,
                        raw: true
                    });

                    // Find first sheet with contents
                    let sheetName = workbook.SheetNames[0];
                    for (const name of workbook.SheetNames) {
                        const s = workbook.Sheets[name];
                        if (s && Object.keys(s).length > 1) {
                            sheetName = name;
                            break;
                        }
                    }

                    const firstSheet = workbook.Sheets[sheetName];
                    if (!firstSheet) {
                        return reject(new Error('A planilha selecionada não possui abas ou conteúdo legível.'));
                    }

                    // Convert to 2D array
                    const json: any[][] = XLSX.utils.sheet_to_json(firstSheet, { 
                        header: 1, 
                        defval: '',
                        blankrows: false 
                    });

                    if (!json || json.length === 0) {
                        return reject(new Error('A planilha está vazia ou sem linhas legíveis.'));
                    }

                    // Find start row (first row with non-empty content)
                    let headerRowIndex = 0;
                    while (headerRowIndex < Math.min(json.length, 5) && json[headerRowIndex].every((c: any) => c === '' || c === null)) {
                        headerRowIndex++;
                    }

                    const rawHeaders = (json[headerRowIndex] || []).map((h: any, idx: number) => String(h || `Coluna_${idx + 1}`).trim());
                    const lowerHeaders = rawHeaders.map((h: string) => h.toLowerCase());

                    // Check if row is really a header row (contains text keywords) or raw data
                    const isHeaderRow = lowerHeaders.some(h => 
                        h.includes('nome') || h.includes('tel') || h.includes('cel') || h.includes('fone') || 
                        h.includes('whats') || h.includes('contato') || h.includes('numero') || 
                        h.includes('número') || h.includes('phone') || h.includes('lead') || h.includes('destinat')
                    );

                    const dataStartIndex = isHeaderRow ? headerRowIndex + 1 : headerRowIndex;
                    const finalHeaders = isHeaderRow ? rawHeaders : rawHeaders.map((_, i) => `Coluna_${i + 1}`);

                    // Look for phone column by header name keywords
                    let phoneColIndex = lowerHeaders.findIndex((h: string) =>
                        h.includes('celular') || h.includes('telefone') || h.includes('whatsapp') || 
                        h.includes('whats') || h.includes('wpp') || h.includes('fone') || 
                        h.includes('tel') || h.includes('mobile') || h.includes('phone') || 
                        h.includes('numero') || h.includes('número') || h.includes('num') || 
                        h.includes('contato') || h.includes('destinat')
                    );

                    // Look for name column by header name keywords
                    let nameColIndex = lowerHeaders.findIndex((h: string) =>
                        h === 'nome' || h === 'name' || h.includes('nome') || 
                        h === 'cliente' || h === 'lead' || h === 'info_2' || h === 'contato_nome'
                    );

                    // If phone column wasn't identified by header, scan up to 50 rows to detect which column has phone numbers
                    if (phoneColIndex === -1 && json.length > dataStartIndex) {
                        const sampleRows = json.slice(dataStartIndex, dataStartIndex + 50);
                        const colScores: { [col: number]: number } = {};

                        sampleRows.forEach(row => {
                            row.forEach((cell: any, cIdx: number) => {
                                const norm = excelService.normalizePhone(cell);
                                if (norm.length >= 10 && norm.length <= 15) {
                                    colScores[cIdx] = (colScores[cIdx] || 0) + 1;
                                }
                            });
                        });

                        let bestCol = -1;
                        let bestScore = 0;
                        Object.entries(colScores).forEach(([cStr, score]) => {
                            const c = Number(cStr);
                            if (score > bestScore) {
                                bestScore = score;
                                bestCol = c;
                            }
                        });

                        if (bestCol !== -1) {
                            phoneColIndex = bestCol;
                        }
                    }

                    if (phoneColIndex === -1) phoneColIndex = 0;

                    const extracted = excelService.extractFromGrid(json, dataStartIndex, phoneColIndex, nameColIndex, finalHeaders);

                    resolve({
                        contacts: extracted.contacts,
                        headers: finalHeaders,
                        stats: extracted.stats,
                        samplePreview: extracted.samplePreview,
                        detectedPhoneCol: phoneColIndex,
                        detectedNameCol: nameColIndex,
                        rawGrid: json,
                        dataStartIndex
                    });
                } catch (err: any) {
                    console.error('Spreadsheet processing error:', err);
                    reject(new Error(err.message || 'Erro ao processar conteúdo do arquivo. Certifique-se de que é um Excel (.xlsx/.xls) ou CSV válido.'));
                }
            };

            reader.onerror = () => reject(new Error('Falha na leitura do arquivo local.'));
            reader.readAsArrayBuffer(file);
        });
    },

    // Re-extract contacts when user changes column mapping manually
    reExtractWithColumns(analysis: SpreadsheetAnalysis, phoneColIndex: number, nameColIndex: number): SpreadsheetAnalysis {
        if (!analysis.rawGrid || analysis.dataStartIndex === undefined) return analysis;
        const res = excelService.extractFromGrid(
            analysis.rawGrid, 
            analysis.dataStartIndex, 
            phoneColIndex, 
            nameColIndex, 
            analysis.headers
        );

        return {
            ...analysis,
            contacts: res.contacts,
            stats: res.stats,
            samplePreview: res.samplePreview,
            detectedPhoneCol: phoneColIndex,
            detectedNameCol: nameColIndex
        };
    },

    // Parse plain text or pasted CSV/list of numbers
    parsePastedText(text: string): SpreadsheetAnalysis {
        const lines = text.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
        const contacts: ParsedContact[] = [];
        const seen = new Set<string>();
        let duplicates = 0;
        let invalid = 0;

        lines.forEach(line => {
            const parts = line.split(/[;,\t|]/).map(p => p.trim());
            const phone = excelService.normalizePhone(parts[0]);
            const name = parts[1] || '';

            if (phone.length >= 10 && phone.length <= 15) {
                if (seen.has(phone)) {
                    duplicates++;
                } else {
                    seen.add(phone);
                    contacts.push({ telefone: phone, nome: name });
                }
            } else {
                invalid++;
            }
        });

        return {
            contacts,
            headers: ['Telefone', 'Nome'],
            stats: {
                totalRows: lines.length,
                validCount: contacts.length,
                duplicateCount: duplicates,
                invalidCount: invalid
            },
            samplePreview: contacts.slice(0, 10),
            detectedPhoneCol: 0,
            detectedNameCol: 1
        };
    },

    // 3. Generate sanitized CSV download Blob
    generateSanitizedCsvUrl(contacts: ParsedContact[]): string {
        const rows = contacts.map((c, index) => {
            const labelIndex = Math.floor(index / 5000) + 1;
            const res: any = {
                'Número': c.telefone,
                'info_2': c.nome,
                'Etiqueta': `Etiqueta_${labelIndex}`
            };
            Object.keys(c).forEach(k => {
                if (k !== 'telefone' && k !== 'nome') res[k] = c[k];
            });
            return res;
        });

        const worksheet = XLSX.utils.json_to_sheet(rows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Contatos');
        const csvOutput = XLSX.write(workbook, { bookType: 'csv', type: 'array' });
        const blob = new Blob([csvOutput], { type: 'text/csv;charset=utf-8;' });
        return URL.createObjectURL(blob);
    },

    // 4. Partition contacts among senders based on each sender's configured limit
    partitionContacts(contacts: ParsedContact[], senders: SenderConfig[]): SenderConfig[] {
        let cursor = 0;
        return senders.map(sender => {
            const limit = Math.max(0, sender.limit);
            const slice = contacts.slice(cursor, cursor + limit);
            cursor += limit;
            return {
                ...sender,
                allocatedContacts: slice
            };
        });
    }
};
