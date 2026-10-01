import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
    FileSpreadsheet,
    Download,
    Trash2,
    CheckCircle2,
    AlertCircle,
    ShieldCheck,
    UploadCloud,
    FileText,
    Sparkles,
    Copy,
    Check,
    X,
    Settings2,
    Activity,
    Layers,
    Sliders,
    Tag,
    Hash,
    CheckSquare
} from 'lucide-react';

interface CleanedContact {
    Número: string;
    info_2: string;
    info_3: string;
    'E-mail': string;
    Etiquetas: string;
    [key: string]: any;
}

interface BatchResult {
    batchNumber: number;
    tag: string;
    count: number;
    startIndex: number;
    endIndex: number;
}

interface SpreadsheetCleanerProps {
    isEmbedded?: boolean;
    onClose?: () => void;
}

export const SpreadsheetCleaner: React.FC<SpreadsheetCleanerProps> = ({ isEmbedded, onClose }) => {
    // Configurações do Módulo
    const [file, setFile] = useState<File | null>(null);
    const [baseTag, setBaseTag] = useState('clientes');
    const [batchSize, setBatchSize] = useState<number>(5000);
    const [appendTagToName, setAppendTagToName] = useState(false);
    
    // Filtros avançados
    const [removeDuplicates, setRemoveDuplicates] = useState(true);
    const [discardNoName, setDiscardNoName] = useState(false);
    const [smartSplit, setSmartSplit] = useState(false);

    // Estados de processamento e resultados
    const [isProcessing, setIsProcessing] = useState(false);
    const [processedData, setProcessedData] = useState<CleanedContact[]>([]);
    const [results, setResults] = useState<BatchResult[]>([]);
    const [totalContacts, setTotalContacts] = useState(0);
    const [duplicateCount, setDuplicateCount] = useState(0);
    const [invalidCount, setInvalidCount] = useState(0);
    const [copiedPreviewIndex, setCopiedPreviewIndex] = useState<number | null>(null);

    // Paginação dos lotes gerados
    const [currentResultsPage, setCurrentResultsPage] = useState(1);
    const resultsPerPage = 6;

    const fileInputRef = useRef<HTMLInputElement>(null);

    // 1. Normalização de Telefone Estrita (Padrão WhatsApp / Meta)
    const normalizePhone = (input: any): string => {
        if (!input && input !== 0) return '';
        
        let cleaned = '';
        if (typeof input === 'number') {
            try {
                cleaned = BigInt(Math.floor(input)).toString();
            } catch {
                cleaned = Math.floor(input).toString();
            }
        } else {
            cleaned = String(input).trim().replace(/\.0+$/, '');
            if (/^\d+(\.\d+)?[eE]\+\d+$/.test(cleaned)) {
                try {
                    cleaned = BigInt(Math.floor(Number(cleaned))).toString();
                } catch {}
            }
        }

        // Remove tudo que não for dígito
        cleaned = cleaned.replace(/\D/g, '');

        // Remove zeros à esquerda (ex: 011988887777 -> 11988887777)
        cleaned = cleaned.replace(/^0+/, '');

        // Adiciona DDI 55 se faltar (10 dígitos = DDD + 8 dígitos; 11 dígitos = DDD + 9 dígitos)
        if (cleaned.length === 10 || cleaned.length === 11) {
            cleaned = '55' + cleaned;
        }

        // Adiciona 9º dígito se for celular BR com 12 dígitos começando com 55 (55 + 2 DDD + 8 dígitos)
        if (cleaned.length === 12 && cleaned.startsWith('55')) {
            cleaned = cleaned.slice(0, 4) + '9' + cleaned.slice(4);
        }

        return cleaned;
    };

    // 2. Parser heurístico (Smart Parse) para linhas cruas sem cabeçalho
    const smartParseRow = (input: string) => {
        if (!input || !input.trim()) return null;

        const parts = input.split(/[;,|\t]/).map(p => p.trim()).filter(p => p.length > 0);

        let phone = '';
        let name = '';
        let cpf = '';
        let email = '';

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const cpfRegex = /([0-9]{3}[\.]?[0-9]{3}[\.]?[0-9]{3}[-]?[0-9]{2})/;
        const remainingParts: string[] = [];

        parts.forEach(part => {
            const cleanPart = part.trim();
            if (!cleanPart) return;

            if (emailRegex.test(cleanPart)) {
                email = cleanPart;
                return;
            }

            const cpfMatch = cleanPart.match(cpfRegex);
            if (cleanPart.toUpperCase().includes('CPF:') || (cpfMatch && !normalizePhone(cleanPart).startsWith('55') && cleanPart.length <= 15)) {
                cpf = cleanPart.replace(/CPF:/i, '').replace(/[^\d.-]/g, '').trim();
                return;
            }

            const normalized = normalizePhone(cleanPart);
            if (normalized.length >= 10 && normalized.length <= 15 && !phone) {
                phone = normalized;
                return;
            }

            remainingParts.push(cleanPart);
        });

        if (remainingParts.length > 0) {
            const scoredParts = remainingParts.map(part => {
                let score = 0;
                const clean = part.replace(/^["']|["']$/g, '').trim();
                if (!clean) return { part: '', score: -1000 };

                if (clean.includes(':')) score -= 60;
                if (clean.includes('/')) score -= 50;
                if (/\d{4,}/.test(clean)) score -= 40;
                if (/\d/.test(clean)) score -= 15;

                if (clean.length > 8 && clean === clean.toUpperCase()) score -= 20;
                if (clean.length < 3) score -= 30;
                if (clean.length > 50) score -= 25;

                const words = clean.split(/\s+/).filter(w => w.length > 0);
                const isProperCase = words.length > 0 && words.every(w => {
                    if (w.length <= 2) return true;
                    const firstChar = w[0];
                    const isCapitalized = firstChar === firstChar.toUpperCase();
                    const isRestLower = w.slice(1) === w.slice(1).toLowerCase();
                    return isCapitalized && isRestLower;
                });
                if (isProperCase) score += 45;

                if (words.length >= 2 && words.length <= 4) score += 30;
                score += (clean.length * 0.1);

                return { part: clean, score };
            });

            const best = scoredParts.sort((a, b) => b.score - a.score)[0];
            name = best ? best.part : '';
        }

        return { telefone: phone, nome: name, cpf, email };
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setFile(e.target.files[0]);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            setFile(e.dataTransfer.files[0]);
        }
    };

    // 3. Processamento Completo de Todas as Abas e Linhas da Planilha
    const processFile = async () => {
        if (!file) {
            alert('Por favor, selecione sua planilha ou arquivo TXT/CSV primeiro!');
            return;
        }
        if (!baseTag.trim()) {
            alert('Por favor, digite uma Etiqueta Base para identificar os contatos!');
            return;
        }
        const effectiveBatchSize = Math.max(1, Number(batchSize) || 5000);

        setIsProcessing(true);
        setDuplicateCount(0);
        setInvalidCount(0);

        const reader = new FileReader();

        reader.onload = async (e) => {
            try {
                let extractedContacts: any[] = [];
                let totalInputRows = 0;
                const fileName = file.name.toLowerCase();

                if (fileName.endsWith('.txt') || fileName.endsWith('.csv')) {
                    // Leitura de CSV ou TXT
                    const textData = new TextDecoder('utf-8').decode(e.target?.result as ArrayBuffer);
                    const lines = textData.split(/\r?\n/).filter(line => line.trim().length > 0);
                    totalInputRows = lines.length;

                    let phoneColIndex = 0;
                    const separator = lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : ',';

                    if (lines.length > 0 && !smartSplit) {
                        const firstDataLine = (lines.length > 1 && isNaN(Number(lines[0].split(separator)[0]))) ? lines[1] : lines[0];
                        const parts = firstDataLine.split(separator);
                        for (let col = 0; col < Math.min(parts.length, 8); col++) {
                            const raw = String(parts[col] || '');
                            if (normalizePhone(raw).length >= 10 && normalizePhone(raw).length <= 15) {
                                phoneColIndex = col;
                                break;
                            }
                        }
                    }

                    const headerRow = (lines.length > 1 && isNaN(Number(lines[0].split(separator)[0]))) 
                        ? lines[0].split(separator).map(h => h.trim()) 
                        : null;

                    for (let idx = 0; idx < lines.length; idx++) {
                        if (idx === 0 && headerRow) continue;
                        const line = lines[idx];
                        const rowSeparator = line.includes(';') ? ';' : line.includes('\t') ? '\t' : ',';

                        let contact: any = null;
                        if (smartSplit) {
                            contact = smartParseRow(line);
                        } else {
                            const parts = line.split(rowSeparator);
                            contact = {
                                telefone: normalizePhone(parts[phoneColIndex] || ''),
                                nome: (parts[phoneColIndex === 0 ? 1 : 0] || '').trim()
                            };
                        }

                        if (contact && contact.telefone && contact.telefone.length >= 10 && contact.telefone.length <= 15) {
                            const parts = line.split(rowSeparator);
                            if (headerRow) {
                                headerRow.forEach((h, colIdx) => {
                                    if (h && contact[h] === undefined) {
                                        contact[h] = parts[colIdx] !== undefined ? parts[colIdx] : '';
                                    }
                                });
                            } else {
                                parts.forEach((p, colIdx) => {
                                    if (colIdx !== phoneColIndex && colIdx !== (phoneColIndex === 0 ? 1 : 0)) {
                                        contact[`Coluna_${colIdx + 1}`] = p !== undefined ? p : '';
                                    }
                                });
                            }
                            extractedContacts.push(contact);
                        }
                    }

                    setInvalidCount(Math.max(0, totalInputRows - extractedContacts.length));
                } else {
                    // Leitura de Excel (.xlsx, .xls)
                    // IMPORTANTE: Lê TODAS as abas (SheetNames) para unificar planilhas com múltiplas abas
                    const data = new Uint8Array(e.target?.result as ArrayBuffer);
                    await new Promise(resolve => setTimeout(resolve, 50));
                    const workbook = XLSX.read(data, { type: 'array', cellDates: true, dense: true });

                    for (const sheetName of workbook.SheetNames) {
                        const sheet = workbook.Sheets[sheetName];
                        if (!sheet) continue;

                        // Recalcular range real caso o !ref do arquivo esteja truncado por exportadores
                        let maxRow = 0;
                        let maxCol = 0;
                        for (const cellAddress in sheet) {
                            if (cellAddress[0] === '!') continue;
                            const dec = XLSX.utils.decode_cell(cellAddress);
                            if (dec.r > maxRow) maxRow = dec.r;
                            if (dec.c > maxCol) maxCol = dec.c;
                        }
                        if (maxRow > 0) {
                            sheet['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow, c: maxCol } });
                        }

                        const json: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
                        if (!json || json.length === 0) continue;

                        const hasHeader = typeof json[0][0] === 'string' && isNaN(Number(json[0][0]));
                        const startIndex = hasHeader ? 1 : 0;
                        totalInputRows += (json.length - startIndex);

                        const headers = hasHeader && json[0] ? json[0].map((h: any) => String(h || '').trim()) : null;
                        const lowerHeaders = headers ? headers.map((h: string) => h.toLowerCase()) : [];

                        let phoneColIndex = -1;
                        let cpfColIndex = -1;
                        let nameColIndex = -1;
                        let emailColIndex = -1;

                        if (lowerHeaders.length > 0) {
                            phoneColIndex = lowerHeaders.findIndex((h: string) => 
                                h.includes('celular') || h.includes('telefone') || h.includes('whatsapp') || h.includes('numero') || h.includes('número') || h.includes('phone')
                            );
                            cpfColIndex = lowerHeaders.findIndex((h: string) => h === 'cpf' || h === 'cnpj' || h.includes('cpf') || h.includes('cnpj'));
                            nameColIndex = lowerHeaders.findIndex((h: string) => h === 'nome' || h === 'name' || h.includes('nome') || h === 'info_2' || h.includes('cliente'));
                            emailColIndex = lowerHeaders.findIndex((h: string) => h === 'email' || h === 'e-mail');
                        }

                        // Auto-detect coluna de telefone caso não tenha cabeçalho explícito
                        if (json.length > startIndex && phoneColIndex === -1) {
                            const firstDataRow = json[startIndex];
                            for (let col = 0; col < Math.min(firstDataRow.length, 8); col++) {
                                if (col === cpfColIndex) continue;
                                const raw = String(firstDataRow[col] || '');
                                if (normalizePhone(raw).length >= 10 && normalizePhone(raw).length <= 15) {
                                    phoneColIndex = col;
                                    break;
                                }
                            }
                        }

                        if (phoneColIndex === -1) phoneColIndex = 0;

                        for (let i = startIndex; i < json.length; i++) {
                            const row = json[i];
                            if (!row || row.length === 0) continue;

                            const rawCell = row[phoneColIndex];
                            let contact: any = null;

                            if (smartSplit) {
                                const parsed = smartParseRow(String(rawCell || ''));
                                if (parsed && parsed.telefone?.length >= 10 && parsed.telefone?.length <= 15) {
                                    contact = parsed;
                                }
                            }

                            if (!contact) {
                                const phone = normalizePhone(rawCell);
                                if (phone.length >= 10 && phone.length <= 15) {
                                    let contactName = '';
                                    if (nameColIndex !== -1) {
                                        contactName = String(row[nameColIndex] || '').trim();
                                    } else {
                                        contactName = String(row[phoneColIndex === 0 ? 1 : 0] || '').trim();
                                    }

                                    let contactCpf = '';
                                    if (cpfColIndex !== -1) {
                                        contactCpf = String(row[cpfColIndex] || '').replace(/[^\d.-]/g, '').trim();
                                    }

                                    let contactEmail = '';
                                    if (emailColIndex !== -1) {
                                        contactEmail = String(row[emailColIndex] || '').trim();
                                    }

                                    contact = {
                                        telefone: phone,
                                        nome: contactName,
                                        cpf: contactCpf,
                                        email: contactEmail
                                    };
                                }
                            }

                            if (contact) {
                                let extraInfoCounter = 4;
                                if (headers) {
                                    headers.forEach((h: any, colIdx: number) => {
                                        const hStr = String(h || '').trim();
                                        if (hStr && contact[hStr] === undefined) {
                                            const val = row[colIdx] !== undefined ? String(row[colIdx]) : '';
                                            contact[hStr] = val;
                                            if (val && colIdx !== phoneColIndex && colIdx !== nameColIndex && colIdx !== cpfColIndex && colIdx !== emailColIndex) {
                                                contact[`info_${extraInfoCounter}`] = val;
                                                extraInfoCounter++;
                                            }
                                        }
                                    });
                                } else {
                                    row.forEach((val: any, colIdx: number) => {
                                        if (colIdx !== phoneColIndex && colIdx !== nameColIndex && colIdx !== cpfColIndex && colIdx !== emailColIndex) {
                                            const strVal = val !== undefined ? String(val) : '';
                                            contact[`Coluna_${colIdx + 1}`] = strVal;
                                            if (strVal) {
                                                contact[`info_${extraInfoCounter}`] = strVal;
                                                extraInfoCounter++;
                                            }
                                        }
                                    });
                                }
                                extractedContacts.push(contact);
                            }
                        }
                    }

                    setInvalidCount(Math.max(0, totalInputRows - extractedContacts.length));
                }

                // Deduplicação estrita de telefones
                let filtered = [...extractedContacts];
                if (removeDuplicates) {
                    const seen = new Set<string>();
                    const beforeDedup = filtered.length;
                    filtered = filtered.filter(item => {
                        const duplicate = seen.has(item.telefone);
                        seen.add(item.telefone);
                        return !duplicate;
                    });
                    setDuplicateCount(beforeDedup - filtered.length);
                }

                if (discardNoName) {
                    filtered = filtered.filter(item => item.nome && item.nome.length > 0);
                }

                const total = filtered.length;
                if (total === 0) {
                    alert('Nenhum número de telefone válido foi encontrado na planilha.');
                    setIsProcessing(false);
                    return;
                }

                setTotalContacts(total);

                // ETAPAS DE ETIQUETAGEM SEQUENCIAL POR LOTE NA MESMA PLANILHA UNIFICADA
                // Exemplo:
                // Índice 0 a 4999 (Linhas 1 a 5000): lote 1 -> etiqueta_1
                // Índice 5000 a 9999 (Linhas 5001 a 10000): lote 2 -> etiqueta_2
                // Índice 10000 a 14999 (Linhas 10001 a 15000): lote 3 -> etiqueta_3...
                const cleanBaseTag = baseTag.trim() || 'lote';
                const formattedList: CleanedContact[] = filtered.map((item, index) => {
                    const batchNumber = Math.floor(index / effectiveBatchSize) + 1;
                    const tag = `${cleanBaseTag}_${batchNumber}`;
                    const { telefone, nome, cpf, email, ...rest } = item;

                    const cleanRest: any = {};
                    Object.keys(rest).forEach(k => {
                        const kl = k.toLowerCase().trim();
                        if (!['telefone', 'nome', 'cpf', 'email', 'numero', 'e-mail', 'celular', 'whatsapp', 'etiquetas', 'info_2', 'info_3'].includes(kl)) {
                            cleanRest[k] = rest[k];
                        }
                    });

                    let finalName = nome || '';
                    if (appendTagToName) {
                        finalName = finalName ? `${finalName}_${tag}` : tag;
                    }

                    return {
                        'Número': telefone,
                        'info_2': finalName,
                        'info_3': cpf || rest.CPF || rest.cpf || '',
                        'E-mail': email || '',
                        'Etiquetas': tag,
                        ...cleanRest
                    };
                });

                // Armazena a lista 100% COMPLETA de contatos
                setProcessedData(formattedList);

                // Resumo dos Lotes Calculados
                const batchCount = Math.ceil(total / effectiveBatchSize);
                const resultsList: BatchResult[] = [];
                for (let i = 0; i < batchCount; i++) {
                    const sIdx = i * effectiveBatchSize;
                    const eIdx = Math.min((i + 1) * effectiveBatchSize, total);
                    const count = eIdx - sIdx;
                    resultsList.push({
                        batchNumber: i + 1,
                        tag: `${cleanBaseTag}_${i + 1}`,
                        count,
                        startIndex: sIdx,
                        endIndex: eIdx
                    });
                }

                setResults(resultsList);
                setCurrentResultsPage(1);

            } catch (err: any) {
                console.error('Erro ao processar planilha:', err);
                alert('Erro ao processar o arquivo: ' + err.message);
            } finally {
                setIsProcessing(false);
            }
        };

        reader.readAsArrayBuffer(file);
    };

    // 4. Download da Planilha Completa Unificada (TODAS as 80k na mesma planilha com lotes etiquetados)
    const exportCompleteFile = (format: 'csv' | 'xlsx') => {
        if (processedData.length === 0) {
            alert('Nenhum dado processado para exportar.');
            return;
        }

        const cleanBaseTag = baseTag.trim() || 'planilha';
        const total = processedData.length;
        const fileName = `${cleanBaseTag}_unificado_total_${total}_contatos.${format}`;

        if (format === 'csv') {
            // CSV com UTF-8 BOM e separador ";" padrão Excel Brasil
            const keys = Object.keys(processedData[0]);
            const headerLine = keys.map(k => `"${String(k).replace(/"/g, '""')}"`).join(';');
            const csvRows = processedData.map(row => 
                keys.map(k => `"${String(row[k] ?? '').replace(/"/g, '""')}"`).join(';')
            );
            const csvContent = '\uFEFF' + [headerLine, ...csvRows].join('\r\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', fileName);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } else {
            // Excel (.xlsx) com todas as linhas unificadas
            const worksheet = XLSX.utils.json_to_sheet(processedData);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Contatos_Unificados');
            XLSX.writeFile(workbook, fileName, { bookType: 'xlsx' });
        }
    };

    // 5. Download Opcional de um Lote Específico
    const exportSingleBatch = (batch: BatchResult, format: 'csv' | 'xlsx') => {
        const batchSlice = processedData.slice(batch.startIndex, batch.endIndex);
        if (batchSlice.length === 0) return;

        const fileName = `${batch.tag}_lote_${batch.batchNumber}_${batch.count}_contatos.${format}`;

        if (format === 'csv') {
            const keys = Object.keys(batchSlice[0]);
            const headerLine = keys.map(k => `"${String(k).replace(/"/g, '""')}"`).join(';');
            const csvRows = batchSlice.map(row => 
                keys.map(k => `"${String(row[k] ?? '').replace(/"/g, '""')}"`).join(';')
            );
            const csvContent = '\uFEFF' + [headerLine, ...csvRows].join('\r\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', fileName);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } else {
            const worksheet = XLSX.utils.json_to_sheet(batchSlice);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, batch.tag);
            XLSX.writeFile(workbook, fileName, { bookType: 'xlsx' });
        }
    };

    const handleCopyPreview = (phone: string, index: number) => {
        navigator.clipboard.writeText(phone);
        setCopiedPreviewIndex(index);
        setTimeout(() => setCopiedPreviewIndex(null), 2000);
    };

    const totalResultsPages = Math.ceil(results.length / resultsPerPage);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
            {/* Header */}
            <div className="glass-panel" style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', borderRadius: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'linear-gradient(135deg, rgba(172, 248, 0, 0.15), rgba(16, 185, 129, 0.15))', border: '1px solid rgba(172, 248, 0, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#acf800' }}>
                        <FileSpreadsheet size={22} />
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <h2 style={{ margin: 0, fontSize: '19px', fontWeight: 700, color: 'var(--text-main)', letterSpacing: '-0.3px' }}>
                                Higienizador de Planilhas
                            </h2>
                            <span className="badge badge-approved" style={{ fontSize: '11px', padding: '2px 8px' }}>
                                Motor Fast Dispatch PRO
                            </span>
                        </div>
                        <p style={{ margin: '3px 0 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
                            Normalização no padrão 55 + DDD + 9 dígitos, unificação total em 1 planilha e particionamento sequencial de etiquetas.
                        </p>
                    </div>
                </div>

                {isEmbedded && onClose && (
                    <button
                        type="button"
                        onClick={onClose}
                        className="btn-secondary"
                        style={{ height: '36px', padding: '0 14px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                        <X size={15} /> Fechar
                    </button>
                )}
            </div>

            {/* Grid Principal: Configuração & Processamento */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px', alignItems: 'start' }}>
                
                {/* CARD 1: Parâmetros & Upload */}
                <div className="glass-panel" style={{ padding: '24px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                        <Settings2 size={18} color="var(--primary-color)" />
                        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-main)' }}>
                            1. Mapeamento &amp; Etiqueta
                        </h3>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        {/* Etiqueta Base */}
                        <div>
                            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>
                                Etiqueta Principal (Base Tag) *
                            </label>
                            <div style={{ position: 'relative' }}>
                                <Tag size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                                <input
                                    type="text"
                                    value={baseTag}
                                    onChange={e => setBaseTag(e.target.value)}
                                    placeholder="Ex: clientes_marco ou notificacao_cobranca"
                                    className="input-field"
                                    style={{ width: '100%', padding: '10px 12px 10px 36px', fontSize: '13.5px', boxSizing: 'border-box' }}
                                />
                            </div>
                            <span style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px', display: 'block' }}>
                                Cada lote receberá o sufixo: <strong style={{ color: 'var(--text-main)' }}>{baseTag || 'etiqueta'}_1</strong>, <strong style={{ color: 'var(--text-main)' }}>{baseTag || 'etiqueta'}_2</strong>...
                            </span>
                        </div>

                        {/* Batch Size (Tamanho do Lote) */}
                        <div>
                            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>
                                Quantidade por Lote de Etiqueta (Batch Size)
                            </label>
                            <div style={{ position: 'relative' }}>
                                <Hash size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                                <input
                                    type="number"
                                    min={100}
                                    step={500}
                                    value={batchSize}
                                    onChange={e => setBatchSize(Number(e.target.value) || 5000)}
                                    className="input-field"
                                    style={{ width: '100%', padding: '10px 12px 10px 36px', fontSize: '13.5px', boxSizing: 'border-box' }}
                                />
                            </div>
                            <span style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px', display: 'block' }}>
                                A cada <strong>{Number(batchSize || 5000).toLocaleString('pt-BR')}</strong> contatos, o número da etiqueta incrementa na mesma planilha unificada.
                            </span>
                        </div>

                        {/* Opções Avançadas */}
                        <div style={{ background: 'rgba(0,0,0,0.15)', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12.5px', color: 'var(--text-main)' }}>
                                <input
                                    type="checkbox"
                                    checked={removeDuplicates}
                                    onChange={e => setRemoveDuplicates(e.target.checked)}
                                    style={{ accentColor: 'var(--primary-color)', width: '15px', height: '15px' }}
                                />
                                <span>Remover telefones duplicados</span>
                            </label>

                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12.5px', color: 'var(--text-main)' }}>
                                <input
                                    type="checkbox"
                                    checked={appendTagToName}
                                    onChange={e => setAppendTagToName(e.target.checked)}
                                    style={{ accentColor: 'var(--primary-color)', width: '15px', height: '15px' }}
                                />
                                <span>Adicionar etiqueta também no final do Nome (ex: <em style={{ opacity: 0.8 }}>Nome_etiqueta_1</em>)</span>
                            </label>

                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12.5px', color: 'var(--text-main)' }}>
                                <input
                                    type="checkbox"
                                    checked={discardNoName}
                                    onChange={e => setDiscardNoName(e.target.checked)}
                                    style={{ accentColor: 'var(--primary-color)', width: '15px', height: '15px' }}
                                />
                                <span>Descartar linhas sem nome</span>
                            </label>

                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12.5px', color: 'var(--text-main)' }}>
                                <input
                                    type="checkbox"
                                    checked={smartSplit}
                                    onChange={e => setSmartSplit(e.target.checked)}
                                    style={{ accentColor: 'var(--primary-color)', width: '15px', height: '15px' }}
                                />
                                <span>Smart Split Heurístico (para arquivos de texto sem cabeçalho)</span>
                            </label>
                        </div>

                        {/* Dropzone de Arquivo */}
                        <div
                            onDragOver={e => e.preventDefault()}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                            style={{
                                border: '1.5px dashed var(--border-color)',
                                borderRadius: '10px',
                                padding: '20px',
                                textAlign: 'center',
                                cursor: 'pointer',
                                background: file ? 'rgba(172, 248, 0, 0.04)' : 'rgba(255,255,255,0.02)',
                                borderColor: file ? 'var(--primary-color)' : 'var(--border-color)',
                                transition: 'all 0.2s ease',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '14px'
                            }}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".xlsx,.xls,.csv,.txt"
                                onChange={handleFileChange}
                                style={{ display: 'none' }}
                            />
                            <div style={{ width: '42px', height: '42px', borderRadius: '8px', background: file ? 'rgba(172, 248, 0, 0.15)' : 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: file ? 'var(--primary-color)' : 'var(--text-muted)', flexShrink: 0 }}>
                                <UploadCloud size={20} />
                            </div>
                            <div style={{ textAlign: 'left', overflow: 'hidden' }}>
                                <strong style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-main)', display: 'block', textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                                    {file ? file.name : 'Selecionar Planilha'}
                                </strong>
                                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                    {file ? `${(file.size / 1024).toFixed(1)} KB` : 'Suporta .xlsx, .xls, .csv ou .txt'}
                                </span>
                            </div>
                        </div>

                        {/* Botão de Ação */}
                        <button
                            type="button"
                            className="btn-primary"
                            onClick={processFile}
                            disabled={isProcessing}
                            style={{
                                width: '100%',
                                height: '46px',
                                fontSize: '14px',
                                fontWeight: 800,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px'
                            }}
                        >
                            {isProcessing ? (
                                <>
                                    <Activity className="animate-spin" size={18} />
                                    <span>Processando todas as linhas...</span>
                                </>
                            ) : (
                                <>
                                    <Sparkles size={18} />
                                    <span>PROCESSAR E FORMATAR TODAS AS LINHAS</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* CARD 2: Resumo de Lotes & Exportação */}
                <div className="glass-panel" style={{ padding: '24px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                        <Layers size={18} color="var(--primary-color)" />
                        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-main)' }}>
                            2. Planilha Unificada &amp; Lotes
                        </h3>
                    </div>

                    {results.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {/* Card de Estatísticas */}
                            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                                <div>
                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block' }}>Total Unificado em 1 Planilha</span>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                                        <span style={{ fontSize: '28px', fontWeight: 800, color: 'var(--primary-color)', lineHeight: 1.1 }}>
                                            {totalContacts.toLocaleString('pt-BR')}
                                        </span>
                                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>
                                            contatos ({results.length} lotes de {Number(batchSize || 5000).toLocaleString('pt-BR')})
                                        </span>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'right' }}>
                                    {duplicateCount > 0 && (
                                        <span style={{ fontSize: '11.5px', color: '#fca5a5', fontWeight: 600 }}>
                                            -{duplicateCount.toLocaleString('pt-BR')} Duplicados
                                        </span>
                                    )}
                                    {invalidCount > 0 && (
                                        <span style={{ fontSize: '11.5px', color: '#94a3b8', fontWeight: 500 }}>
                                            -{invalidCount.toLocaleString('pt-BR')} Inválidos
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* BOTÕES PRINCIPAIS: BAIXAR PLANILHA COMPLETA COM TODAS AS LINHAS UNIFICADAS */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                                    Baixar Planilha Completa (Todas as {totalContacts.toLocaleString('pt-BR')} linhas unificadas):
                                </span>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                    <button
                                        type="button"
                                        onClick={() => exportCompleteFile('xlsx')}
                                        className="btn-primary"
                                        style={{
                                            height: '46px',
                                            fontSize: '13.5px',
                                            fontWeight: 800,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '8px'
                                        }}
                                    >
                                        <Download size={16} />
                                        <span>Baixar Excel (.xlsx)</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => exportCompleteFile('csv')}
                                        className="btn-secondary"
                                        style={{
                                            height: '46px',
                                            fontSize: '13.5px',
                                            fontWeight: 800,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '8px',
                                            background: 'rgba(255,255,255,0.06)'
                                        }}
                                    >
                                        <Download size={16} />
                                        <span>Baixar CSV</span>
                                    </button>
                                </div>
                            </div>

                            {/* Lotes Gerados com Tags */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                                        Distribuição dos Lotes na Planilha ({results.length}):
                                    </span>
                                    <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                                        Pág. {currentResultsPage} de {totalResultsPages}
                                    </span>
                                </div>

                                {results.slice((currentResultsPage - 1) * resultsPerPage, currentResultsPage * resultsPerPage).map((r, i) => (
                                    <div
                                        key={i}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '8px 12px',
                                            background: 'rgba(172, 248, 0, 0.03)',
                                            border: '1px solid rgba(172, 248, 0, 0.12)',
                                            borderRadius: '6px'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <Tag size={13} color="var(--primary-color)" />
                                            <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '12.5px', color: 'var(--text-main)' }}>
                                                {r.tag}
                                            </span>
                                            <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                                                (Linhas {r.startIndex + 1} a {r.endIndex})
                                            </span>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ background: 'var(--primary-color)', color: '#000000', padding: '2px 8px', borderRadius: '4px', fontSize: '11.5px', fontWeight: 800 }}>
                                                {r.count.toLocaleString('pt-BR')} leads
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => exportSingleBatch(r, 'csv')}
                                                title={`Baixar apenas o lote ${r.tag} em CSV`}
                                                className="btn-secondary"
                                                style={{ height: '24px', padding: '0 6px', fontSize: '10.5px' }}
                                            >
                                                CSV
                                            </button>
                                        </div>
                                    </div>
                                ))}

                                {results.length > resultsPerPage && (
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
                                        <button
                                            type="button"
                                            disabled={currentResultsPage === 1}
                                            onClick={() => setCurrentResultsPage(p => p - 1)}
                                            className="btn-secondary"
                                            style={{ height: '28px', padding: '0 10px', fontSize: '11px' }}
                                        >
                                            ← Anterior
                                        </button>
                                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                            {currentResultsPage} / {totalResultsPages}
                                        </span>
                                        <button
                                            type="button"
                                            disabled={currentResultsPage === totalResultsPages}
                                            onClick={() => setCurrentResultsPage(p => p + 1)}
                                            className="btn-secondary"
                                            style={{ height: '28px', padding: '0 10px', fontSize: '11px' }}
                                        >
                                            Próxima →
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                            <UploadCloud size={48} style={{ opacity: 0.3, marginBottom: '12px' }} />
                            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text-main)' }}>
                                Aguardando Planilha
                            </h4>
                            <p style={{ margin: '6px 0 0 0', fontSize: '12.5px', lineHeight: 1.4 }}>
                                Selecione uma lista ao lado e clique em "Processar" para unificar todas as linhas e particionar as etiquetas.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* TABELA DE PRÉ-VISUALIZAÇÃO AO VIVO */}
            {processedData.length > 0 && (
                <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-main)' }}>
                                Pré-visualização da Planilha Unificada
                            </h3>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                Exibindo as primeiras {Math.min(processedData.length, 10)} linhas do total de {totalContacts.toLocaleString('pt-BR')} contatos unificados
                            </span>
                        </div>
                        <span className="badge badge-approved" style={{ fontSize: '11px' }}>
                            {results.length} lotes de {Number(batchSize || 5000).toLocaleString('pt-BR')} na mesma planilha
                        </span>
                    </div>

                    <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid var(--border-color)' }}>
                                    <th style={{ padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 600 }}>#</th>
                                    <th style={{ padding: '10px 14px', color: 'var(--primary-color)', fontWeight: 700 }}>Número</th>
                                    <th style={{ padding: '10px 14px', color: 'var(--text-main)', fontWeight: 600 }}>info_2 (Nome)</th>
                                    <th style={{ padding: '10px 14px', color: 'var(--primary-color)', fontWeight: 700 }}>Etiquetas</th>
                                    <th style={{ padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 600 }}>info_3 (CPF)</th>
                                    <th style={{ padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 600 }}>E-mail</th>
                                </tr>
                            </thead>
                            <tbody>
                                {processedData.slice(0, 10).map((row, idx) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                                        <td style={{ padding: '10px 14px', color: 'var(--text-dim)', fontFamily: 'monospace' }}>
                                            {idx + 1}
                                        </td>
                                        <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 600, color: 'var(--primary-color)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span>{row.Número}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => handleCopyPreview(row.Número, idx)}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: 0 }}
                                                    title="Copiar número"
                                                >
                                                    {copiedPreviewIndex === idx ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                                                </button>
                                            </div>
                                        </td>
                                        <td style={{ padding: '10px 14px', color: 'var(--text-main)' }}>
                                            {row.info_2 || <span style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>—</span>}
                                        </td>
                                        <td style={{ padding: '10px 14px' }}>
                                            <span style={{ background: 'rgba(172, 248, 0, 0.1)', color: 'var(--primary-color)', border: '1px solid rgba(172, 248, 0, 0.25)', padding: '2px 8px', borderRadius: '4px', fontSize: '11.5px', fontFamily: 'monospace', fontWeight: 700 }}>
                                                {row.Etiquetas}
                                            </span>
                                        </td>
                                        <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>
                                            {row.info_3 || <span style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>—</span>}
                                        </td>
                                        <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>
                                            {row['E-mail'] || <span style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>—</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SpreadsheetCleaner;
