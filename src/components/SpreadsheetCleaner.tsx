import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
    Upload,
    Download,
    Check,
    Copy,
    X,
    FileSpreadsheet,
    Loader2
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
    const [file, setFile] = useState<File | null>(null);
    const [baseTag, setBaseTag] = useState('clientes');
    const [batchSize, setBatchSize] = useState<number>(5000);
    const [appendTagToName, setAppendTagToName] = useState(false);
    const [removeDuplicates, setRemoveDuplicates] = useState(true);
    const [discardNoName, setDiscardNoName] = useState(false);
    const [smartSplit, setSmartSplit] = useState(false);

    const [isProcessing, setIsProcessing] = useState(false);
    const [processedData, setProcessedData] = useState<CleanedContact[]>([]);
    const [results, setResults] = useState<BatchResult[]>([]);
    const [totalContacts, setTotalContacts] = useState(0);
    const [duplicateCount, setDuplicateCount] = useState(0);
    const [invalidCount, setInvalidCount] = useState(0);
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

    const [page, setPage] = useState(1);
    const itemsPerPage = 8;

    const fileInputRef = useRef<HTMLInputElement>(null);

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

        cleaned = cleaned.replace(/\D/g, '');
        cleaned = cleaned.replace(/^0+/, '');

        if (cleaned.length === 10 || cleaned.length === 11) {
            cleaned = '55' + cleaned;
        }

        if (cleaned.length === 12 && cleaned.startsWith('55')) {
            cleaned = cleaned.slice(0, 4) + '9' + cleaned.slice(4);
        }

        return cleaned;
    };

    const smartParseRow = (input: string) => {
        if (!input || !input.trim()) return null;
        const parts = input.split(/[;,|\t]/).map(p => p.trim()).filter(Boolean);

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

                const words = clean.split(/\s+/).filter(Boolean);
                const isProperCase = words.length > 0 && words.every(w => {
                    if (w.length <= 2) return true;
                    return w[0] === w[0].toUpperCase() && w.slice(1) === w.slice(1).toLowerCase();
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

    const processFile = async () => {
        if (!file) return alert('Selecione um arquivo para processar.');
        if (!baseTag.trim()) return alert('Informe uma etiqueta base.');
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
                    const data = new Uint8Array(e.target?.result as ArrayBuffer);
                    await new Promise(resolve => setTimeout(resolve, 50));
                    const workbook = XLSX.read(data, { type: 'array', cellDates: true, dense: true });

                    for (const sheetName of workbook.SheetNames) {
                        const sheet = workbook.Sheets[sheetName];
                        if (!sheet) continue;

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
                    alert('Nenhum número de telefone válido encontrado.');
                    setIsProcessing(false);
                    return;
                }

                setTotalContacts(total);

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

                setProcessedData(formattedList);

                const batchCount = Math.ceil(total / effectiveBatchSize);
                const resultsList: BatchResult[] = [];
                for (let i = 0; i < batchCount; i++) {
                    const sIdx = i * effectiveBatchSize;
                    const eIdx = Math.min((i + 1) * effectiveBatchSize, total);
                    resultsList.push({
                        batchNumber: i + 1,
                        tag: `${cleanBaseTag}_${i + 1}`,
                        count: eIdx - sIdx,
                        startIndex: sIdx,
                        endIndex: eIdx
                    });
                }

                setResults(resultsList);
                setPage(1);

            } catch (err: any) {
                console.error(err);
                alert('Erro ao processar: ' + err.message);
            } finally {
                setIsProcessing(false);
            }
        };

        reader.readAsArrayBuffer(file);
    };

    const exportCompleteFile = (format: 'csv' | 'xlsx') => {
        if (processedData.length === 0) return alert('Nenhum dado para exportar.');

        const cleanBaseTag = baseTag.trim() || 'planilha';
        const total = processedData.length;
        const fileName = `${cleanBaseTag}_${total}_contatos.${format}`;

        if (format === 'csv') {
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
            const worksheet = XLSX.utils.json_to_sheet(processedData);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Contatos');
            XLSX.writeFile(workbook, fileName, { bookType: 'xlsx' });
        }
    };

    const handleCopy = (text: string, idx: number) => {
        navigator.clipboard.writeText(text);
        setCopiedIndex(idx);
        setTimeout(() => setCopiedIndex(null), 1500);
    };

    const totalPages = Math.ceil(results.length / itemsPerPage);

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Header OpenAI Platform Style */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e5e5e5', paddingBottom: '16px' }}>
                <div>
                    <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#09090b', letterSpacing: '-0.02em', margin: 0 }}>
                        Higienizador de Planilhas
                    </h1>
                    <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#71717a' }}>
                        Validação de números no padrão WhatsApp, particionamento por lotes e unificação de arquivos.
                    </p>
                </div>
                {isEmbedded && onClose && (
                    <button
                        onClick={onClose}
                        style={{
                            background: '#ffffff',
                            border: '1px solid #e5e5e5',
                            borderRadius: '6px',
                            padding: '6px 12px',
                            fontSize: '13px',
                            fontWeight: 500,
                            color: '#09090b',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <X size={14} /> Fechar
                    </button>
                )}
            </div>

            {/* Layout em Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 360px) minmax(0, 1fr)', gap: '24px', alignItems: 'start' }}>
                
                {/* Coluna 1: Formulário e Upload */}
                <div style={{ background: '#ffffff', border: '1px solid #e5e5e5', borderRadius: '8px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    
                    {/* Etiqueta base */}
                    <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#09090b', marginBottom: '6px' }}>
                            Etiqueta base
                        </label>
                        <input
                            type="text"
                            value={baseTag}
                            onChange={e => setBaseTag(e.target.value)}
                            placeholder="ex: clientes"
                            style={{
                                width: '100%',
                                padding: '8px 12px',
                                fontSize: '13px',
                                border: '1px solid #e5e5e5',
                                borderRadius: '6px',
                                outline: 'none',
                                background: '#fafafa',
                                color: '#09090b',
                                boxSizing: 'border-box'
                            }}
                        />
                    </div>

                    {/* Batch size */}
                    <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#09090b', marginBottom: '6px' }}>
                            Contatos por lote
                        </label>
                        <input
                            type="number"
                            min={100}
                            step={500}
                            value={batchSize}
                            onChange={e => setBatchSize(Number(e.target.value) || 5000)}
                            style={{
                                width: '100%',
                                padding: '8px 12px',
                                fontSize: '13px',
                                border: '1px solid #e5e5e5',
                                borderRadius: '6px',
                                outline: 'none',
                                background: '#fafafa',
                                color: '#09090b',
                                boxSizing: 'border-box'
                            }}
                        />
                    </div>

                    {/* Opções simples */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '4px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#27272a', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={removeDuplicates}
                                onChange={e => setRemoveDuplicates(e.target.checked)}
                                style={{ accentColor: '#09090b' }}
                            />
                            Remover duplicados
                        </label>

                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#27272a', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={appendTagToName}
                                onChange={e => setAppendTagToName(e.target.checked)}
                                style={{ accentColor: '#09090b' }}
                            />
                            Adicionar etiqueta no nome (ex: Nome_etiqueta_1)
                        </label>

                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#27272a', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={discardNoName}
                                onChange={e => setDiscardNoName(e.target.checked)}
                                style={{ accentColor: '#09090b' }}
                            />
                            Descartar linhas sem nome
                        </label>

                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#27272a', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={smartSplit}
                                onChange={e => setSmartSplit(e.target.checked)}
                                style={{ accentColor: '#09090b' }}
                            />
                            Separador inteligente (arquivos sem cabeçalho)
                        </label>
                    </div>

                    {/* Upload Dropzone */}
                    <div
                        onDragOver={e => e.preventDefault()}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                            border: '1px dashed #d4d4d8',
                            borderRadius: '6px',
                            padding: '24px 16px',
                            textAlign: 'center',
                            cursor: 'pointer',
                            background: file ? '#f4f4f5' : '#ffffff',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".xlsx,.xls,.csv,.txt"
                            onChange={handleFileChange}
                            style={{ display: 'none' }}
                        />
                        <Upload size={18} color="#71717a" style={{ margin: '0 auto 8px auto', display: 'block' }} />
                        <span style={{ fontSize: '13px', fontWeight: 500, color: '#09090b', display: 'block' }}>
                            {file ? file.name : 'Selecionar planilha'}
                        </span>
                        <span style={{ fontSize: '12px', color: '#71717a', marginTop: '2px', display: 'block' }}>
                            {file ? `${(file.size / 1024).toFixed(1)} KB` : '.xlsx, .csv ou .txt'}
                        </span>
                    </div>

                    {/* Botão de processamento OpenAI black button */}
                    <button
                        type="button"
                        onClick={processFile}
                        disabled={isProcessing}
                        style={{
                            width: '100%',
                            padding: '10px 16px',
                            background: '#09090b',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '13px',
                            fontWeight: 500,
                            cursor: isProcessing ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            opacity: isProcessing ? 0.7 : 1
                        }}
                    >
                        {isProcessing ? (
                            <>
                                <Loader2 size={15} className="animate-spin" />
                                Processando...
                            </>
                        ) : (
                            'Processar planilha'
                        )}
                    </button>
                </div>

                {/* Coluna 2: Resultados e Exportação */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {results.length > 0 ? (
                        <>
                            {/* Métricas estilo OpenAI Platform */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                                <div style={{ background: '#ffffff', border: '1px solid #e5e5e5', borderRadius: '8px', padding: '14px 16px' }}>
                                    <span style={{ fontSize: '12px', color: '#71717a', fontWeight: 500 }}>Total válido</span>
                                    <div style={{ fontSize: '22px', fontWeight: 600, color: '#09090b', marginTop: '4px' }}>
                                        {totalContacts.toLocaleString('pt-BR')}
                                    </div>
                                </div>
                                <div style={{ background: '#ffffff', border: '1px solid #e5e5e5', borderRadius: '8px', padding: '14px 16px' }}>
                                    <span style={{ fontSize: '12px', color: '#71717a', fontWeight: 500 }}>Lotes gerados</span>
                                    <div style={{ fontSize: '22px', fontWeight: 600, color: '#09090b', marginTop: '4px' }}>
                                        {results.length}
                                    </div>
                                </div>
                                <div style={{ background: '#ffffff', border: '1px solid #e5e5e5', borderRadius: '8px', padding: '14px 16px' }}>
                                    <span style={{ fontSize: '12px', color: '#71717a', fontWeight: 500 }}>Duplicados</span>
                                    <div style={{ fontSize: '22px', fontWeight: 600, color: '#71717a', marginTop: '4px' }}>
                                        {duplicateCount.toLocaleString('pt-BR')}
                                    </div>
                                </div>
                                <div style={{ background: '#ffffff', border: '1px solid #e5e5e5', borderRadius: '8px', padding: '14px 16px' }}>
                                    <span style={{ fontSize: '12px', color: '#71717a', fontWeight: 500 }}>Inválidos</span>
                                    <div style={{ fontSize: '22px', fontWeight: 600, color: '#71717a', marginTop: '4px' }}>
                                        {invalidCount.toLocaleString('pt-BR')}
                                    </div>
                                </div>
                            </div>

                            {/* Ações de Download */}
                            <div style={{ background: '#ffffff', border: '1px solid #e5e5e5', borderRadius: '8px', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                                <div>
                                    <span style={{ fontSize: '14px', fontWeight: 600, color: '#09090b' }}>
                                        Exportar arquivo unificado
                                    </span>
                                    <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#71717a' }}>
                                        Todas as {totalContacts.toLocaleString('pt-BR')} linhas em 1 único arquivo com as etiquetas sequenciais.
                                    </p>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        type="button"
                                        onClick={() => exportCompleteFile('xlsx')}
                                        style={{
                                            background: '#09090b',
                                            color: '#ffffff',
                                            border: 'none',
                                            borderRadius: '6px',
                                            padding: '8px 14px',
                                            fontSize: '13px',
                                            fontWeight: 500,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px'
                                        }}
                                    >
                                        <Download size={14} /> Baixar Excel (.xlsx)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => exportCompleteFile('csv')}
                                        style={{
                                            background: '#ffffff',
                                            color: '#09090b',
                                            border: '1px solid #e5e5e5',
                                            borderRadius: '6px',
                                            padding: '8px 14px',
                                            fontSize: '13px',
                                            fontWeight: 500,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px'
                                        }}
                                    >
                                        <Download size={14} /> Baixar CSV
                                    </button>
                                </div>
                            </div>

                            {/* Lista de Lotes */}
                            <div style={{ background: '#ffffff', border: '1px solid #e5e5e5', borderRadius: '8px', overflow: 'hidden' }}>
                                <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e5e5', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#09090b' }}>
                                        Distribuição dos lotes
                                    </span>
                                    <span style={{ fontSize: '12px', color: '#71717a' }}>
                                        Página {page} de {totalPages}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    {results.slice((page - 1) * itemsPerPage, page * itemsPerPage).map((r, i) => (
                                        <div
                                            key={i}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                padding: '10px 16px',
                                                borderBottom: i === itemsPerPage - 1 ? 'none' : '1px solid #f4f4f5'
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <span style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 600, color: '#09090b' }}>
                                                    {r.tag}
                                                </span>
                                                <span style={{ fontSize: '12px', color: '#a1a1aa' }}>
                                                    linhas {r.startIndex + 1} – {r.endIndex}
                                                </span>
                                            </div>
                                            <span style={{ fontSize: '12px', fontWeight: 500, color: '#71717a', background: '#f4f4f5', padding: '2px 8px', borderRadius: '4px' }}>
                                                {r.count.toLocaleString('pt-BR')} contatos
                                            </span>
                                        </div>
                                    ))}
                                </div>
                                {totalPages > 1 && (
                                    <div style={{ padding: '10px 16px', borderTop: '1px solid #e5e5e5', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fafafa' }}>
                                        <button
                                            type="button"
                                            disabled={page === 1}
                                            onClick={() => setPage(p => p - 1)}
                                            style={{
                                                background: '#ffffff',
                                                border: '1px solid #e5e5e5',
                                                borderRadius: '4px',
                                                padding: '4px 10px',
                                                fontSize: '12px',
                                                color: page === 1 ? '#a1a1aa' : '#09090b',
                                                cursor: page === 1 ? 'default' : 'pointer'
                                            }}
                                        >
                                            Anterior
                                        </button>
                                        <button
                                            type="button"
                                            disabled={page === totalPages}
                                            onClick={() => setPage(p => p + 1)}
                                            style={{
                                                background: '#ffffff',
                                                border: '1px solid #e5e5e5',
                                                borderRadius: '4px',
                                                padding: '4px 10px',
                                                fontSize: '12px',
                                                color: page === totalPages ? '#a1a1aa' : '#09090b',
                                                cursor: page === totalPages ? 'default' : 'pointer'
                                            }}
                                        >
                                            Próxima
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Tabela de Pré-visualização Limpa */}
                            <div style={{ background: '#ffffff', border: '1px solid #e5e5e5', borderRadius: '8px', overflow: 'hidden' }}>
                                <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e5e5' }}>
                                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#09090b' }}>
                                        Pré-visualização (primeiras 10 linhas)
                                    </span>
                                </div>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                                        <thead>
                                            <tr style={{ background: '#fafafa', borderBottom: '1px solid #e5e5e5', color: '#71717a', fontSize: '12px' }}>
                                                <th style={{ padding: '8px 14px', fontWeight: 500 }}>#</th>
                                                <th style={{ padding: '8px 14px', fontWeight: 500 }}>Número</th>
                                                <th style={{ padding: '8px 14px', fontWeight: 500 }}>Nome (info_2)</th>
                                                <th style={{ padding: '8px 14px', fontWeight: 500 }}>Etiqueta</th>
                                                <th style={{ padding: '8px 14px', fontWeight: 500 }}>CPF (info_3)</th>
                                                <th style={{ padding: '8px 14px', fontWeight: 500 }}>E-mail</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {processedData.slice(0, 10).map((row, idx) => (
                                                <tr key={idx} style={{ borderBottom: '1px solid #f4f4f5' }}>
                                                    <td style={{ padding: '8px 14px', color: '#a1a1aa', fontSize: '12px' }}>
                                                        {idx + 1}
                                                    </td>
                                                    <td style={{ padding: '8px 14px', fontFamily: 'monospace', fontWeight: 500, color: '#09090b' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <span>{row.Número}</span>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleCopy(row.Número, idx)}
                                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', padding: 0 }}
                                                                title="Copiar"
                                                            >
                                                                {copiedIndex === idx ? <Check size={12} color="#16a34a" /> : <Copy size={12} />}
                                                            </button>
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '8px 14px', color: '#09090b' }}>
                                                        {row.info_2 || '—'}
                                                    </td>
                                                    <td style={{ padding: '8px 14px' }}>
                                                        <span style={{ background: '#f4f4f5', color: '#3f3f46', padding: '2px 6px', borderRadius: '4px', fontSize: '12px', fontFamily: 'monospace' }}>
                                                            {row.Etiquetas}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '8px 14px', color: '#71717a' }}>
                                                        {row.info_3 || '—'}
                                                    </td>
                                                    <td style={{ padding: '8px 14px', color: '#71717a' }}>
                                                        {row['E-mail'] || '—'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div style={{ background: '#ffffff', border: '1px solid #e5e5e5', borderRadius: '8px', padding: '48px 24px', textAlign: 'center' }}>
                            <FileSpreadsheet size={32} color="#a1a1aa" style={{ margin: '0 auto 12px auto' }} />
                            <span style={{ fontSize: '14px', fontWeight: 500, color: '#09090b', display: 'block' }}>
                                Nenhuma planilha carregada
                            </span>
                            <span style={{ fontSize: '13px', color: '#71717a', marginTop: '4px', display: 'block' }}>
                                Selecione um arquivo ao lado para higienizar e gerar as etiquetas.
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SpreadsheetCleaner;
