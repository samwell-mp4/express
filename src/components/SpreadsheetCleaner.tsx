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
    X
} from 'lucide-react';
import { excelService } from '../services/excelService';

interface CleanedRow {
    telefone: string;
    nome: string;
    cpf?: string;
    email?: string;
    [key: string]: any;
}

interface Stats {
    totalOriginal: number;
    validCount: number;
    duplicateCount: number;
    invalidCount: number;
}

interface SpreadsheetCleanerProps {
    isEmbedded?: boolean;
    onClose?: () => void;
}

export const SpreadsheetCleaner: React.FC<SpreadsheetCleanerProps> = ({ isEmbedded, onClose }) => {
    const [file, setFile] = useState<File | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [stats, setStats] = useState<Stats | null>(null);
    const [sanitizedRows, setSanitizedRows] = useState<CleanedRow[]>([]);
    const [deduplicate, setDeduplicate] = useState(true);
    const [autoDeletedNotice, setAutoDeletedNotice] = useState(false);
    const [copiedPreviewIndex, setCopiedPreviewIndex] = useState<number | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            processFile(e.target.files[0]);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            processFile(e.dataTransfer.files[0]);
        }
    };

    const processFile = async (selectedFile: File) => {
        setFile(selectedFile);
        setIsProcessing(true);
        setAutoDeletedNotice(false);

        try {
            const fileName = selectedFile.name.toLowerCase();
            const buffer = await selectedFile.arrayBuffer();

            let rows: any[] = [];
            let headers: string[] = [];

            if (fileName.endsWith('.csv') || fileName.endsWith('.txt')) {
                const text = new TextDecoder('utf-8').decode(buffer);
                const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                if (lines.length > 0) {
                    const sep = lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : ',';
                    const hasHeader = isNaN(Number(lines[0].split(sep)[0]));
                    headers = hasHeader ? lines[0].split(sep).map(h => h.trim()) : [];
                    const startIdx = hasHeader ? 1 : 0;

                    for (let i = startIdx; i < lines.length; i++) {
                        const parts = lines[i].split(sep).map(p => p.trim());
                        const rowObj: any = {};
                        if (headers.length > 0) {
                            headers.forEach((h, col) => { rowObj[h] = parts[col] || ''; });
                        } else {
                            parts.forEach((p, col) => { rowObj[`col_${col + 1}`] = p; });
                        }
                        rows.push(rowObj);
                    }
                }
            } else {
                const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const json: any[][] = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

                if (json.length > 0) {
                    const hasHeader = typeof json[0][0] === 'string' && isNaN(Number(json[0][0]));
                    headers = hasHeader ? json[0].map((h: any) => String(h || '').trim()) : [];
                    const startIdx = hasHeader ? 1 : 0;

                    for (let i = startIdx; i < json.length; i++) {
                        const r = json[i];
                        if (!r || r.length === 0) continue;
                        const rowObj: any = {};
                        if (headers.length > 0) {
                            headers.forEach((h, col) => { rowObj[h] = r[col] !== undefined ? String(r[col]).trim() : ''; });
                        } else {
                            r.forEach((val: any, col: number) => { rowObj[`col_${col + 1}`] = val !== undefined ? String(val).trim() : ''; });
                        }
                        rows.push(rowObj);
                    }
                }
            }

            // Normalização estrita de telefones (55 + DDD + 9 dígitos = 13 dígitos)
            const cleanList: CleanedRow[] = [];
            const seenPhones = new Set<string>();
            let dups = 0;
            let invalids = 0;

            for (const r of rows) {
                // Procura coluna com telefone
                let rawPhone = '';
                let name = '';
                let cpf = '';
                let email = '';

                Object.keys(r).forEach(k => {
                    const kl = k.toLowerCase();
                    const v = String(r[k] || '').trim();
                    if (!v) return;

                    if (!rawPhone && (kl.includes('celular') || kl.includes('telefone') || kl.includes('whatsapp') || kl.includes('phone') || kl.includes('numero') || kl.includes('número'))) {
                        rawPhone = v;
                    } else if (!name && (kl.includes('nome') || kl.includes('name') || kl.includes('cliente') || kl === 'info_2')) {
                        name = v;
                    } else if (!cpf && (kl.includes('cpf') || kl.includes('cnpj') || kl === 'info_3')) {
                        cpf = v;
                    } else if (!email && (kl.includes('email') || kl.includes('e-mail'))) {
                        email = v;
                    }
                });

                // Fallback: busca por primeira coluna com formato de telefone
                if (!rawPhone) {
                    for (const k of Object.keys(r)) {
                        const testPhone = excelService.normalizePhone(r[k]);
                        if (testPhone.length === 12 || testPhone.length === 13) {
                            rawPhone = r[k];
                            break;
                        }
                    }
                }

                const normalized = excelService.normalizePhone(rawPhone);

                if (!normalized || normalized.length < 12 || normalized.length > 13) {
                    invalids++;
                    continue;
                }

                if (deduplicate) {
                    if (seenPhones.has(normalized)) {
                        dups++;
                        continue;
                    }
                    seenPhones.add(normalized);
                }

                cleanList.push({
                    telefone: normalized,
                    nome: name || '',
                    cpf: cpf || '',
                    email: email || '',
                    ...r
                });
            }

            setSanitizedRows(cleanList);
            setStats({
                totalOriginal: rows.length,
                validCount: cleanList.length,
                duplicateCount: dups,
                invalidCount: invalids
            });
        } catch (err: any) {
            console.error('Erro na higienização:', err);
            alert(`Falha ao ler o arquivo: ${err.message}`);
        } finally {
            setIsProcessing(false);
        }
    };

    // =========================================================================
    // REGRA DE SEGURANÇA MANDATÓRIA:
    // Ao fazer download, a planilha é exportada e IMEDIATAMENTE EXCLUÍDA DA MEMÓRIA
    // Nenhum dado fica salvo em banco, disco ou histórico.
    // =========================================================================
    const handleDownloadAndPurge = (format: 'csv' | 'xlsx') => {
        if (sanitizedRows.length === 0) return alert('Nenhum dado válido para download.');

        // Monta os dados finais higienizados
        const exportData = sanitizedRows.map((r, i) => ({
            'Ordem': i + 1,
            'Telefone_Higienizado': r.telefone,
            'Nome': r.nome || '',
            'CPF_CNPJ': r.cpf || '',
            'Email': r.email || '',
            ...r
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Higienizado');

        const baseName = (file?.name || 'planilha').replace(/\.[^/.]+$/, '');
        const outFileName = `${baseName}_higienizado.${format}`;

        if (format === 'csv') {
            XLSX.writeFile(wb, outFileName, { bookType: 'csv' });
        } else {
            XLSX.writeFile(wb, outFileName, { bookType: 'xlsx' });
        }

        // PURGA IMEDIATA DE TODOS OS DADOS DA MEMÓRIA
        setFile(null);
        setSanitizedRows([]);
        setStats(null);
        setAutoDeletedNotice(true);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleCopyPreview = (phone: string, index: number) => {
        navigator.clipboard.writeText(phone);
        setCopiedPreviewIndex(index);
        setTimeout(() => setCopiedPreviewIndex(null), 2000);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
            {/* Header */}
            <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', borderRadius: '8px' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text-main)', letterSpacing: '-0.2px' }}>
                            Higienizador de Planilhas
                        </h2>
                        <span className="badge badge-approved">
                            Sem Persistência
                        </span>
                    </div>
                    <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
                        Normalização automática no padrão 55 + DDD + 9 dígitos, remoção de duplicados e purga imediata no download.
                    </p>
                </div>

                {isEmbedded && onClose && (
                    <button
                        type="button"
                        onClick={onClose}
                        className="btn-secondary"
                        style={{ height: '32px', padding: '0 10px', fontSize: '12px' }}
                    >
                        <X size={14} /> Fechar
                    </button>
                )}
            </div>

            {/* Aviso de Purga Automática (LGPD / Segurança) */}
            <div style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                padding: '10px 14px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
            }}>
                <ShieldCheck color="#2563eb" size={16} style={{ flexShrink: 0 }} />
                <div style={{ fontSize: '12.5px', color: '#334155', lineHeight: 1.4 }}>
                    <strong style={{ fontWeight: 600 }}>Diretriz de Segurança:</strong> As planilhas processadas neste módulo <strong>nunca são salvas no banco de dados nem no servidor</strong>. Ao clicar em "Baixar Planilha Higienizada", os dados em memória são <strong>automaticamente destruídos</strong>.
                </div>
            </div>

            {/* Sucesso pós-download com auto-deleção confirmada */}
            {autoDeletedNotice && (
                <div style={{
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    padding: '12px 16px',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                }}>
                    <CheckCircle2 color="#16a34a" size={20} style={{ flexShrink: 0 }} />
                    <div>
                        <strong style={{ color: '#166534', fontSize: '13px', fontWeight: 600 }}>
                            Planilha baixada e dados expurgados com sucesso
                        </strong>
                        <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#15803d' }}>
                            A versão higienizada foi salva no seu dispositivo. Todas as informações foram descartadas da memória da aplicação.
                        </p>
                    </div>
                </div>
            )}

            {/* Upload Dropzone */}
            <div
                onDragOver={e => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                    background: '#ffffff',
                    border: '1px dashed #cbd5e1',
                    borderRadius: '8px',
                    padding: '28px 20px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'border-color 150ms ease, background 150ms ease',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px'
                }}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv,.txt"
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                />
                <div style={{ width: '36px', height: '36px', borderRadius: '6px', background: '#f1f5f9', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <UploadCloud size={18} />
                </div>
                <div>
                    <strong style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', display: 'block' }}>
                        {isProcessing ? 'Processando e higienizando...' : 'Clique ou arraste sua planilha aqui'}
                    </strong>
                    <span style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
                        Suporta arquivos .xlsx, .xls, .csv ou .txt
                    </span>
                </div>
            </div>

            {/* Estatísticas e Resultados */}
            {stats && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                        <div className="glass-panel" style={{ padding: '14px 16px', borderRadius: '8px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Total de Linhas</span>
                            <div style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-main)', marginTop: '2px' }}>
                                {stats.totalOriginal.toLocaleString()}
                            </div>
                        </div>

                        <div className="glass-panel" style={{ padding: '14px 16px', borderRadius: '8px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 500, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Válidos Higienizados</span>
                            <div style={{ fontSize: '20px', fontWeight: 600, color: '#16a34a', marginTop: '2px' }}>
                                {stats.validCount.toLocaleString()}
                            </div>
                        </div>

                        <div className="glass-panel" style={{ padding: '14px 16px', borderRadius: '8px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 500, color: '#d97706', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Duplicados</span>
                            <div style={{ fontSize: '20px', fontWeight: 600, color: '#d97706', marginTop: '2px' }}>
                                {stats.duplicateCount.toLocaleString()}
                            </div>
                        </div>

                        <div className="glass-panel" style={{ padding: '14px 16px', borderRadius: '8px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 500, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Inválidos</span>
                            <div style={{ fontSize: '20px', fontWeight: 600, color: '#dc2626', marginTop: '2px' }}>
                                {stats.invalidCount.toLocaleString()}
                            </div>
                        </div>
                    </div>

                    {/* Botões de Download com Auto-Exclusão */}
                    <div className="glass-panel" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', borderRadius: '8px' }}>
                        <div>
                            <strong style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-main)' }}>
                                Exportar Arquivo Higienizado
                            </strong>
                            <p style={{ margin: '1px 0 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                                Ao baixar, os dados são imediatamente expurgados da memória.
                            </p>
                        </div>

                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <button
                                className="btn-primary"
                                style={{ height: '36px', padding: '0 14px', fontSize: '13px' }}
                                onClick={() => handleDownloadAndPurge('csv')}
                            >
                                <Download size={15} /> Baixar CSV
                            </button>
                            <button
                                className="btn-secondary"
                                style={{ height: '36px', padding: '0 14px', fontSize: '13px' }}
                                onClick={() => handleDownloadAndPurge('xlsx')}
                            >
                                <Download size={15} /> Baixar XLSX
                            </button>
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => {
                                    setFile(null);
                                    setSanitizedRows([]);
                                    setStats(null);
                                    if (fileInputRef.current) fileInputRef.current.value = '';
                                }}
                                style={{
                                    height: '36px',
                                    padding: '0 12px',
                                    fontSize: '13px',
                                    color: '#dc2626'
                                }}
                            >
                                <Trash2 size={15} /> Descartar
                            </button>
                        </div>
                    </div>

                    {/* Preview das Primeiras 10 Linhas */}
                    {sanitizedRows.length > 0 && (
                        <div className="glass-panel" style={{ padding: '16px', borderRadius: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                                <strong style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>
                                    Prévia das Linhas Higienizadas
                                </strong>
                                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                    Exibindo {Math.min(10, sanitizedRows.length)} de {sanitizedRows.length} contatos
                                </span>
                            </div>

                            <div className="bulk-table-container" style={{ borderRadius: '6px' }}>
                                <table className="bulk-table">
                                    <thead>
                                        <tr>
                                            <th style={{ width: '40px' }}>#</th>
                                            <th>TELEFONE (55+DDD+9D)</th>
                                            <th>NOME / INFO 2</th>
                                            <th>CPF / CNPJ</th>
                                            <th>E-MAIL</th>
                                            <th style={{ textAlign: 'center', width: '80px' }}>AÇÃO</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sanitizedRows.slice(0, 10).map((r, idx) => (
                                            <tr key={idx}>
                                                <td style={{ color: 'var(--text-dim)', fontSize: '12px' }}>{idx + 1}</td>
                                                <td>
                                                    <code style={{ fontWeight: 600, color: '#16a34a', fontSize: '12.5px' }}>
                                                        {r.telefone}
                                                    </code>
                                                </td>
                                                <td>{r.nome || '—'}</td>
                                                <td>{r.cpf || '—'}</td>
                                                <td>{r.email || '—'}</td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleCopyPreview(r.telefone, idx)}
                                                        className="badge"
                                                        style={{
                                                            cursor: 'pointer',
                                                            background: copiedPreviewIndex === idx ? '#f0fdf4' : '#f8fafc',
                                                            color: copiedPreviewIndex === idx ? '#16a34a' : '#475569',
                                                            border: '1px solid var(--border-subtle)',
                                                            height: '22px'
                                                        }}
                                                    >
                                                        {copiedPreviewIndex === idx ? <Check size={11} /> : <Copy size={11} />}
                                                        {copiedPreviewIndex === idx ? 'Copiado' : 'Copiar'}
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default SpreadsheetCleaner;
