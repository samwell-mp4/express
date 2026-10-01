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
    Hash
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
    tag: string;
    count: number;
}

interface SpreadsheetCleanerProps {
    isEmbedded?: boolean;
    onClose?: () => void;
}

export const SpreadsheetCleaner: React.FC<SpreadsheetCleanerProps> = ({ isEmbedded, onClose }) => {
    // Configurações do UploadContacts
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
    const resultsPerPage = 5;

    const fileInputRef = useRef<HTMLInputElement>(null);

    // 1. Normalização de Telefone exata do UploadContacts
    const normalizePhone = (input: string) => {
        if (!input) return '';
        // 1. Remove non-digits
        let cleaned = String(input).replace(/\D/g, '');

        // 1b. Remove leading zero if present (common in manually typed DDDs)
        if (cleaned.startsWith('0')) {
            cleaned = cleaned.substring(1);
        }

        // 2. Add 55 if missing (assuming Brazil if 10 or 11 digits)
        if (cleaned.length === 10 || cleaned.length === 11) {
            cleaned = '55' + cleaned;
        }

        // 3. Handle missing 9th digit for 12-digit numbers starting with 55 (55 + 2 DD + 8 digits)
        if (cleaned.length === 12 && cleaned.startsWith('55')) {
            cleaned = cleaned.slice(0, 4) + '9' + cleaned.slice(4);
        }

        return cleaned;
    };

    // 2. SmartParseRow heurístico do UploadContacts
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

            // 1. Check for Email
            if (emailRegex.test(cleanPart)) {
                email = cleanPart;
                return;
            }

            // 2. Check for CPF
            const cpfMatch = cleanPart.match(cpfRegex);
            if (cleanPart.toUpperCase().includes('CPF:') || (cpfMatch && !normalizePhone(cleanPart).startsWith('55') && cleanPart.length <= 15)) {
                cpf = cleanPart.replace(/CPF:/i, '').replace(/[^\d.-]/g, '').trim();
                return;
            }

            // 3. Check for Phone
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

    // 3. Processamento idêntico ao UploadContacts
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

    const processFile = async () => {
        if (!file) {
            alert('Por favor, selecione sua planilha ou arquivo TXT/CSV primeiro!');
            return;
        }
        if (!baseTag.trim()) {
            alert('Por favor, digite uma Etiqueta Base para identificar os contatos!');
            return;
        }
        if (!batchSize || batchSize < 1) {
            alert('Por favor, defina um tamanho de lote válido (ex: 5000)!');
            return;
        }

        setIsProcessing(true);
        setDuplicateCount(0);
        setInvalidCount(0);

        const reader = new FileReader();

        reader.onload = async (e) => {
            try {
                let extractedContacts: any[] = [];
                const fileName = file.name.toLowerCase();

                if (fileName.endsWith('.txt') || fileName.endsWith('.csv')) {
                    const textData = new TextDecoder('utf-8').decode(e.target?.result as ArrayBuffer);
                    const lines = textData.split(/\r?\n/).filter(line => line.trim().length > 0);

                    let phoneColIndex = 0;
                    if (lines.length > 0 && !smartSplit) {
                        const separator = lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : ',';
                        const firstDataLine = (lines.length > 1 && isNaN(Number(lines[0].split(separator)[0]))) ? lines[1] : lines[0];
                        const parts = firstDataLine.split(separator);
                        for (let col = 0; col < Math.min(parts.length, 6); col++) {
                            const raw = String(parts[col] || '');
                            if (normalizePhone(raw).length === 13) {
                                phoneColIndex = col;
                                break;
                            }
                        }
                    }

                    const separator = lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : ',';
                    const headerRow = (lines.length > 1 && isNaN(Number(lines[0].split(separator)[0]))) 
                        ? lines[0].split(separator).map(h => h.trim()) 
                        : null;

                    extractedContacts = lines.map((line, idx) => {
                        const rowSeparator = line.includes(';') ? ';' : line.includes('\t') ? '\t' : ',';
                        if (idx === 0 && headerRow) return null;

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
                            return contact;
                        }
                        return null;
                    }).filter(Boolean);

                    setInvalidCount(lines.length - extractedContacts.length);
                } else {
                    // Excel (.xlsx, .xls)
                    const data = new Uint8Array(e.target?.result as ArrayBuffer);
                    await new Promise(resolve => setTimeout(resolve, 50));
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    const json: any[][] = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
                    const startIndex = (json[0] && typeof json[0][0] === 'string' && isNaN(Number(json[0][0]))) ? 1 : 0;

                    const headers = startIndex === 1 && json[0] ? json[0].map((h: any) => String(h || '').trim()) : null;
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

                    // Auto-detect phone column (0 to 5) se não achou no header
                    if (json.length > startIndex && phoneColIndex === -1) {
                        const firstDataRow = json[startIndex];
                        for (let col = 0; col < Math.min(firstDataRow.length, 6); col++) {
                            if (col === cpfColIndex) continue;
                            const raw = String(firstDataRow[col] || '');
                            if (normalizePhone(raw).length === 13) {
                                phoneColIndex = col;
                                break;
                            }
                            if (smartSplit) {
                                const parsed = smartParseRow(raw);
                                if (parsed && parsed.telefone?.length >= 10 && parsed.telefone?.length <= 15) {
                                    phoneColIndex = col;
                                    break;
                                }
                            }
                        }
                    }

                    if (phoneColIndex === -1) phoneColIndex = 0;

                    for (let i = startIndex; i < json.length; i++) {
                        const row = json[i];
                        if (row && row.length > 0) {
                            const rawCell = String(row[phoneColIndex] || '');
                            let contact: any = null;

                            if (smartSplit) {
                                const parsed = smartParseRow(rawCell);
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

                    setInvalidCount((json.length - startIndex) - extractedContacts.length);
                }

                // Deduplicação e filtros
                let filtered = [...extractedContacts];
                if (removeDuplicates) {
                    const seen = new Set();
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
                    alert('Nenhum número válido foi encontrado na planilha.');
                    setIsProcessing(false);
                    return;
                }

                setTotalContacts(total);

                // Formatação exata do UploadContacts com etiqueta por lote na mesma planilha
                const cleanBaseTag = baseTag.trim() || 'lote';
                const formattedList: CleanedContact[] = filtered.map((item, index) => {
                    const batchNumber = Math.floor(index / batchSize) + 1;
                    const tag = `${cleanBaseTag}_${batchNumber}`;
                    const { telefone, nome, cpf, email, ...rest } = item;

                    const cleanRest: any = {};
                    Object.keys(rest).forEach(k => {
                        const kl = k.toLowerCase().trim();
                        if (!['telefone', 'nome', 'cpf', 'email', 'numero', 'e-mail', 'celular', 'whatsapp'].includes(kl)) {
                            cleanRest[k] = rest[k];
                        }
                    });

                    // Nome final com sufixo de etiqueta se solicitado pelo usuário
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

                setProcessedData(formattedList);

                // Cálculo dos lotes para o resumo
                const batchCount = Math.ceil(total / batchSize);
                const resultsList: BatchResult[] = [];
                for (let i = 0; i < batchCount; i++) {
                    const count = (i === batchCount - 1) ? total % batchSize || batchSize : batchSize;
                    resultsList.push({ tag: `${cleanBaseTag}_${i + 1}`, count });
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

    // 4. Exportação Unificada (CSV e XLSX)
    const exportFile = (format: 'csv' | 'xlsx') => {
        if (processedData.length === 0) {
            alert('Nenhum dado processado para exportar.');
            return;
        }

        const cleanBaseTag = baseTag.trim() || 'planilha';
        const worksheet = XLSX.utils.json_to_sheet(processedData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Contatos');

        const fileName = `${cleanBaseTag}_unificado.${format}`;
        XLSX.writeFile(workbook, fileName, { bookType: format === 'csv' ? 'csv' : 'xlsx' });
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
                                Motor Plug &amp; Sales PRO
                            </span>
                        </div>
                        <p style={{ margin: '3px 0 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
                            Formatação de números (55+DDD+9 dígitos), etiquetas automáticas por lote na mesma planilha e colunas oficiais Meta / Infobip.
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
                                Padrão: 5.000 contatos. A cada 5.000, o número da etiqueta incrementa na mesma planilha.
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
                                <span>Smart Split Heurístico (para textos brutos sem cabeçalho)</span>
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
                                height: '44px',
                                fontSize: '14px',
                                fontWeight: 700,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px'
                            }}
                        >
                            {isProcessing ? (
                                <>
                                    <Activity className="animate-spin" size={18} />
                                    <span>Processando e Formatando...</span>
                                </>
                            ) : (
                                <>
                                    <Sparkles size={18} />
                                    <span>PROCESSAR E HIGIENIZAR AGORA</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* CARD 2: Resultados & Download */}
                <div className="glass-panel" style={{ padding: '24px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                        <Layers size={18} color="var(--primary-color)" />
                        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-main)' }}>
                            2. Resumo de Lotes &amp; Exportação
                        </h3>
                    </div>

                    {results.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {/* Card de Estatísticas */}
                            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                                <div>
                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block' }}>Contatos Higienizados</span>
                                    <span style={{ fontSize: '28px', fontWeight: 800, color: 'var(--primary-color)', lineHeight: 1.1 }}>
                                        {totalContacts.toLocaleString('pt-BR')}
                                    </span>
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

                            {/* Lotes Gerados com Tags */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                                    Lotes Particionados na Planilha ({results.length}):
                                </span>

                                {results.slice((currentResultsPage - 1) * resultsPerPage, currentResultsPage * resultsPerPage).map((r, i) => (
                                    <div
                                        key={i}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '10px 14px',
                                            background: 'rgba(172, 248, 0, 0.04)',
                                            border: '1px solid rgba(172, 248, 0, 0.15)',
                                            borderRadius: '8px'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <Tag size={13} color="var(--primary-color)" />
                                            <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '13px', color: 'var(--text-main)' }}>
                                                {r.tag}
                                            </span>
                                        </div>
                                        <span style={{ background: 'var(--primary-color)', color: '#000000', padding: '2px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 800 }}>
                                            {r.count.toLocaleString('pt-BR')} leads
                                        </span>
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

                            {/* Botões de Download Unificado */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '6px' }}>
                                <button
                                    type="button"
                                    onClick={() => exportFile('xlsx')}
                                    className="btn-primary"
                                    style={{
                                        height: '42px',
                                        fontSize: '13px',
                                        fontWeight: 700,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px'
                                    }}
                                >
                                    <Download size={15} />
                                    <span>Baixar Excel (.xlsx)</span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => exportFile('csv')}
                                    className="btn-secondary"
                                    style={{
                                        height: '42px',
                                        fontSize: '13px',
                                        fontWeight: 700,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px'
                                    }}
                                >
                                    <Download size={15} />
                                    <span>Baixar CSV</span>
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                            <UploadCloud size={48} style={{ opacity: 0.3, marginBottom: '12px' }} />
                            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text-main)' }}>
                                Aguardando Planilha
                            </h4>
                            <p style={{ margin: '6px 0 0 0', fontSize: '12.5px', lineHeight: 1.4 }}>
                                Selecione uma lista ao lado e clique em "Processar" para visualizar os lotes formatados e baixar a planilha completa.
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
                                Pré-visualização da Planilha Formatada
                            </h3>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                Mostrando os primeiros {Math.min(processedData.length, 10)} contatos do total de {totalContacts.toLocaleString('pt-BR')} (Colunas oficiais Infobip &amp; Meta)
                            </span>
                        </div>
                        <span className="badge badge-approved" style={{ fontSize: '11px' }}>
                            Tudo na mesma planilha com lotes sequenciais
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
