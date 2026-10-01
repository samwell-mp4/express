import React, { useState, useEffect } from 'react';
import {
    UploadCloud,
    FileSpreadsheet,
    CheckCircle2,
    AlertCircle,
    Trash2,
    Download,
    Send,
    RefreshCw,
    Users,
    Clock,
    Search,
    ChevronRight,
    Sparkles,
    Filter
} from 'lucide-react';
import { ParsedContact, ClientBatchRecord } from '../types';
import { excelService, SpreadsheetAnalysis } from '../services/excelService';

interface ClientUploadProps {
    onSendToDispatch: (contacts: ParsedContact[], headers: string[], clientName: string) => void;
}

const STORAGE_BATCHES_KEY = 'express_dispatch_client_batches_v1';

export const ClientUpload: React.FC<ClientUploadProps> = ({ onSendToDispatch }) => {
    // Current Upload States
    const [clientName, setClientName] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [analysis, setAnalysis] = useState<SpreadsheetAnalysis | null>(null);

    // Advanced cleaning options
    const [removeDuplicates, setRemoveDuplicates] = useState(true);
    const [discardNoName, setDiscardNoName] = useState(false);

    // Column Mapping selectors
    const [phoneColumn, setPhoneColumn] = useState('');
    const [nameColumn, setNameColumn] = useState('');

    // Saved Batches History
    const [savedBatches, setSavedBatches] = useState<ClientBatchRecord[]>(() => {
        try {
            const raw = localStorage.getItem(STORAGE_BATCHES_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    });

    const [searchHistory, setSearchHistory] = useState('');
    const [showSuccessToast, setShowSuccessToast] = useState(false);

    // Save batches to localStorage
    const persistBatches = (batches: ClientBatchRecord[]) => {
        setSavedBatches(batches);
        localStorage.setItem(STORAGE_BATCHES_KEY, JSON.stringify(batches));
    };

    const handleFileChange = async (selectedFile: File) => {
        if (!selectedFile) return;
        setFile(selectedFile);
        setIsProcessing(true);

        try {
            const result = await excelService.parseFile(selectedFile);
            setAnalysis(result);
            setPhoneColumn(result.detectedPhoneColumn || '');
            setNameColumn(result.detectedNameColumn || '');

            if (!clientName.trim()) {
                // Auto-suggest client name based on file name
                const cleanName = selectedFile.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
                setClientName(cleanName);
            }
        } catch (err: any) {
            console.error('Erro ao analisar planilha:', err);
            alert(`Erro ao processar planilha: ${err.message || 'Formato incompatível'}`);
            setFile(null);
            setAnalysis(null);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFileChange(e.dataTransfer.files[0]);
        }
    };

    const handleColumnChange = (newPhone: string, newName: string) => {
        if (!analysis) return;
        setPhoneColumn(newPhone);
        setNameColumn(newName);
        const updated = excelService.reExtractWithColumns(analysis, newPhone, newName);
        setAnalysis(updated);
    };

    const getFilteredContacts = (): ParsedContact[] => {
        if (!analysis) return [];
        let list = [...analysis.contacts];

        if (discardNoName) {
            list = list.filter(c => c.nome && c.nome.trim() !== '' && c.nome !== 'Sem Nome');
        }

        if (removeDuplicates) {
            const seen = new Set<string>();
            list = list.filter(c => {
                if (seen.has(c.telefone)) return false;
                seen.add(c.telefone);
                return true;
            });
        }

        return list;
    };

    const handleSaveBatchAndDispatch = () => {
        if (!analysis || !file) return;
        const finalContacts = getFilteredContacts();

        if (finalContacts.length === 0) {
            alert('Nenhum contato válido encontrado para envio.');
            return;
        }

        const effectiveClient = clientName.trim() || 'Cliente ' + new Date().toLocaleDateString('pt-BR');

        // Create new batch record
        const newBatch: ClientBatchRecord = {
            id: 'batch_' + Date.now(),
            clientName: effectiveClient,
            fileName: file.name,
            totalRows: analysis.totalRows,
            validCount: finalContacts.length,
            duplicateCount: analysis.duplicateCount,
            invalidCount: analysis.invalidCount,
            createdAt: new Date().toISOString(),
            contacts: finalContacts,
            headers: analysis.headers
        };

        const updatedBatches = [newBatch, ...savedBatches.filter(b => b.id !== newBatch.id)];
        persistBatches(updatedBatches);

        setShowSuccessToast(true);
        setTimeout(() => {
            setShowSuccessToast(false);
            onSendToDispatch(finalContacts, analysis.headers, effectiveClient);
        }, 800);
    };

    const handleLoadBatch = (batch: ClientBatchRecord) => {
        onSendToDispatch(batch.contacts, batch.headers, batch.clientName);
    };

    const handleDeleteBatch = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm('Excluir este lote do histórico?')) return;
        const filtered = savedBatches.filter(b => b.id !== id);
        persistBatches(filtered);
    };

    const handleDownloadSanitized = () => {
        const contacts = getFilteredContacts();
        if (contacts.length === 0) return;
        const url = excelService.generateSanitizedCsvUrl(contacts);
        const a = document.createElement('a');
        a.href = url;
        a.download = `leads_higienizados_${clientName.replace(/\s+/g, '_') || 'cliente'}.csv`;
        a.click();
    };

    const handleReset = () => {
        setFile(null);
        setAnalysis(null);
        setClientName('');
        setPhoneColumn('');
        setNameColumn('');
    };

    const filteredBatches = savedBatches.filter(b =>
        b.clientName.toLowerCase().includes(searchHistory.toLowerCase()) ||
        b.fileName.toLowerCase().includes(searchHistory.toLowerCase())
    );

    const activeContacts = getFilteredContacts();

    return (
        <div className="client-upload-container">
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#ecfdf5', color: '#059669', padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 800, marginBottom: '8px' }}>
                        <Sparkles size={13} /> GESTÃO DE LEADS &amp; PLANILHAS
                    </div>
                    <h1 style={{ fontSize: '1.85rem', fontWeight: 900, letterSpacing: '-0.5px', margin: 0, color: 'var(--text-main)' }}>
                        Upload de Clientes &amp; Higienização
                    </h1>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                        Importe planilhas Excel/CSV, padronize números no formato DDI 55 + DDD e envie diretamente ao disparador.
                    </p>
                </div>

                {analysis && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button
                            onClick={handleReset}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                background: '#f1f5f9',
                                border: '1px solid var(--border-subtle)',
                                color: 'var(--text-muted)',
                                padding: '8px 14px',
                                borderRadius: '10px',
                                fontSize: '12.5px',
                                fontWeight: 700,
                                cursor: 'pointer'
                            }}
                        >
                            <Trash2 size={15} /> Limpar
                        </button>
                        <button
                            onClick={handleDownloadSanitized}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                background: '#ffffff',
                                border: '1px solid var(--border-subtle)',
                                color: 'var(--text-main)',
                                padding: '8px 14px',
                                borderRadius: '10px',
                                fontSize: '12.5px',
                                fontWeight: 700,
                                cursor: 'pointer'
                            }}
                        >
                            <Download size={15} /> Baixar CSV Limpo
                        </button>
                        <button
                            onClick={handleSaveBatchAndDispatch}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                background: 'var(--primary-color)',
                                color: '#ffffff',
                                border: 'none',
                                padding: '9px 18px',
                                borderRadius: '10px',
                                fontSize: '13.5px',
                                fontWeight: 800,
                                cursor: 'pointer',
                                boxShadow: '0 4px 14px var(--primary-glow)'
                            }}
                        >
                            <Send size={16} /> Enviar para Disparador ({activeContacts.length})
                        </button>
                    </div>
                )}
            </div>

            {/* Success Toast */}
            {showSuccessToast && (
                <div style={{
                    background: '#10b981',
                    color: '#ffffff',
                    padding: '12px 20px',
                    borderRadius: '12px',
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    fontWeight: 700,
                    boxShadow: '0 8px 20px rgba(16, 185, 129, 0.3)'
                }}>
                    <CheckCircle2 size={20} />
                    <span>Lote salvo! Redirecionando para o disparador multi-remetente...</span>
                </div>
            )}

            {/* Main Grid: Upload & Controls */}
            {!analysis ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '24px', alignItems: 'start' }}>
                    {/* Upload Card */}
                    <div style={{ background: '#ffffff', border: '1px solid var(--border-subtle)', borderRadius: '18px', padding: '32px', boxShadow: 'var(--shadow-subtle)' }}>
                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                                Nome do Cliente ou Campanha
                            </label>
                            <input
                                type="text"
                                placeholder="Ex: Farmácia São Lucas - Campanha Outubro"
                                value={clientName}
                                onChange={(e) => setClientName(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '12px 16px',
                                    border: '1px solid var(--border-subtle)',
                                    borderRadius: '12px',
                                    fontSize: '14px',
                                    color: 'var(--text-main)',
                                    outline: 'none'
                                }}
                            />
                        </div>

                        {/* Drag and Drop Zone */}
                        <div
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={handleDrop}
                            onClick={() => document.getElementById('client-file-input')?.click()}
                            style={{
                                border: '2px dashed #cbd5e1',
                                borderRadius: '16px',
                                padding: '44px 24px',
                                textAlign: 'center',
                                background: '#f8fafc',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            <input
                                id="client-file-input"
                                type="file"
                                accept=".xlsx, .xls, .csv"
                                style={{ display: 'none' }}
                                onChange={(e) => e.target.files && handleFileChange(e.target.files[0])}
                            />
                            <div style={{ width: '56px', height: '56px', background: '#ecfdf5', color: '#059669', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto' }}>
                                <UploadCloud size={28} />
                            </div>
                            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: '0 0 6px 0', color: 'var(--text-main)' }}>
                                {isProcessing ? 'Processando planilha...' : 'Arraste a planilha aqui ou clique para selecionar'}
                            </h3>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                                Compatível com arquivos Excel (.xlsx, .xls) e CSV de qualquer tamanho
                            </p>
                            {isProcessing && (
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: '#059669', fontSize: '12px', fontWeight: 700, marginTop: '12px' }}>
                                    <RefreshCw size={14} className="animate-spin" /> Identificando colunas e telefones...
                                </div>
                            )}
                        </div>

                        {/* Cleaning Rules Information */}
                        <div style={{ marginTop: '24px', background: '#f8fafc', border: '1px solid var(--border-subtle)', borderRadius: '14px', padding: '16px 20px' }}>
                            <h4 style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', margin: '0 0 10px 0' }}>
                                Regras Automáticas de Higienização:
                            </h4>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <CheckCircle2 size={14} color="#059669" /> DDI 55 inserido caso ausente
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <CheckCircle2 size={14} color="#059669" /> 9º dígito móvel validado
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <CheckCircle2 size={14} color="#059669" /> Símbolos e traços removidos
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <CheckCircle2 size={14} color="#059669" /> Duplicados deduplicados
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* History Column */}
                    <div style={{ background: '#ffffff', border: '1px solid var(--border-subtle)', borderRadius: '18px', padding: '24px', boxShadow: 'var(--shadow-subtle)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Clock size={18} color="var(--primary-color)" />
                                <h3 style={{ fontSize: '1rem', fontWeight: 800, margin: 0, color: 'var(--text-main)' }}>
                                    Lotes Recentes de Clientes
                                </h3>
                            </div>
                            <span style={{ fontSize: '11px', fontWeight: 700, background: '#f1f5f9', color: 'var(--text-muted)', padding: '2px 8px', borderRadius: '999px' }}>
                                {savedBatches.length} lotes
                            </span>
                        </div>

                        {savedBatches.length > 3 && (
                            <div style={{ position: 'relative', marginBottom: '14px' }}>
                                <Search size={14} style={{ position: 'absolute', left: '12px', top: '10px', color: '#94a3b8' }} />
                                <input
                                    type="text"
                                    placeholder="Buscar cliente ou arquivo..."
                                    value={searchHistory}
                                    onChange={(e) => setSearchHistory(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '8px 12px 8px 34px',
                                        border: '1px solid var(--border-subtle)',
                                        borderRadius: '10px',
                                        fontSize: '12px'
                                    }}
                                />
                            </div>
                        )}

                        {filteredBatches.length === 0 ? (
                            <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-dim)' }}>
                                <FileSpreadsheet size={32} style={{ opacity: 0.4, margin: '0 auto 8px auto' }} />
                                <p style={{ fontSize: '12px', margin: 0 }}>Nenhum lote salvo ainda.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '420px', overflowY: 'auto' }}>
                                {filteredBatches.map(batch => (
                                    <div
                                        key={batch.id}
                                        onClick={() => handleLoadBatch(batch)}
                                        style={{
                                            border: '1px solid var(--border-subtle)',
                                            borderRadius: '12px',
                                            padding: '12px 14px',
                                            background: '#f8fafc',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                            <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-main)' }}>
                                                {batch.clientName}
                                            </span>
                                            <button
                                                onClick={(e) => handleDeleteBatch(batch.id, e)}
                                                style={{ background: 'none', border: 'none', color: '#ef4444', opacity: 0.6, cursor: 'pointer', padding: '2px' }}
                                                title="Excluir lote"
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
                                            <span>{batch.fileName}</span>
                                            <span style={{ fontWeight: 800, color: '#059669', background: '#ecfdf5', padding: '1px 6px', borderRadius: '4px' }}>
                                                {batch.validCount} leads
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                /* Analysis & Review View */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Metrics Cards Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                        <div style={{ background: '#ffffff', border: '1px solid var(--border-subtle)', borderRadius: '16px', padding: '18px', boxShadow: 'var(--shadow-subtle)' }}>
                            <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Total Lidos</span>
                            <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--text-main)', marginTop: '4px' }}>
                                {analysis.totalRows.toLocaleString('pt-BR')}
                            </div>
                            <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>Linhas brutas na planilha</span>
                        </div>

                        <div style={{ background: '#ffffff', border: '1px solid #10b981', borderRadius: '16px', padding: '18px', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.1)' }}>
                            <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#059669' }}>Leads Válidos</span>
                            <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#059669', marginTop: '4px' }}>
                                {activeContacts.length.toLocaleString('pt-BR')}
                            </div>
                            <span style={{ fontSize: '11.5px', color: '#059669' }}>Prontos para disparo imediato</span>
                        </div>

                        <div style={{ background: '#ffffff', border: '1px solid var(--border-subtle)', borderRadius: '16px', padding: '18px', boxShadow: 'var(--shadow-subtle)' }}>
                            <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#f59e0b' }}>Duplicados</span>
                            <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#d97706', marginTop: '4px' }}>
                                {analysis.duplicateCount.toLocaleString('pt-BR')}
                            </div>
                            <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>Removidos da lista</span>
                        </div>

                        <div style={{ background: '#ffffff', border: '1px solid var(--border-subtle)', borderRadius: '16px', padding: '18px', boxShadow: 'var(--shadow-subtle)' }}>
                            <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#ef4444' }}>Inválidos</span>
                            <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#ef4444', marginTop: '4px' }}>
                                {analysis.invalidCount.toLocaleString('pt-BR')}
                            </div>
                            <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>Sem telefone ou formato inválido</span>
                        </div>
                    </div>

                    {/* Column Selectors & Filter Options */}
                    <div style={{ background: '#ffffff', border: '1px solid var(--border-subtle)', borderRadius: '16px', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px' }}>
                                    Coluna de Telefone:
                                </label>
                                <select
                                    value={phoneColumn}
                                    onChange={(e) => handleColumnChange(e.target.value, nameColumn)}
                                    style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', fontSize: '13px', fontWeight: 600 }}
                                >
                                    {analysis.headers.map(h => (
                                        <option key={h} value={h}>{h}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px' }}>
                                    Coluna de Nome:
                                </label>
                                <select
                                    value={nameColumn}
                                    onChange={(e) => handleColumnChange(phoneColumn, e.target.value)}
                                    style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', fontSize: '13px', fontWeight: 600 }}
                                >
                                    <option value="">-- Sem Nome / Fixo --</option>
                                    {analysis.headers.map(h => (
                                        <option key={h} value={h}>{h}</option>
                                    ))}
                                </select>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', paddingTop: '16px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-main)', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={removeDuplicates}
                                        onChange={(e) => setRemoveDuplicates(e.target.checked)}
                                    />
                                    Deduplicar números
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-main)', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={discardNoName}
                                        onChange={(e) => setDiscardNoName(e.target.checked)}
                                    />
                                    Descartar sem nome
                                </label>
                            </div>
                        </div>

                        <div>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                Arquivo: <strong>{file?.name}</strong> • Cliente: <strong>{clientName || 'Geral'}</strong>
                            </span>
                        </div>
                    </div>

                    {/* Preview Table */}
                    <div style={{ background: '#ffffff', border: '1px solid var(--border-subtle)', borderRadius: '16px', padding: '20px', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 800, margin: 0, color: 'var(--text-main)' }}>
                                Prévia de Contatos Higienizados (Primeiras 10 linhas)
                            </h3>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                Mostrando 10 de {activeContacts.length} contatos prontos
                            </span>
                        </div>

                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left' }}>
                                        <th style={{ padding: '10px 14px', fontWeight: 800, color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>#</th>
                                        <th style={{ padding: '10px 14px', fontWeight: 800, color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Telefone Higienizado</th>
                                        <th style={{ padding: '10px 14px', fontWeight: 800, color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Nome</th>
                                        <th style={{ padding: '10px 14px', fontWeight: 800, color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Variáveis Adicionais</th>
                                        <th style={{ padding: '10px 14px', fontWeight: 800, color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', textAlign: 'center' }}>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {activeContacts.slice(0, 10).map((c, i) => {
                                        const extraKeys = Object.keys(c).filter(k => k !== 'telefone' && k !== 'nome');
                                        return (
                                            <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: '10px 14px', color: 'var(--text-dim)', fontWeight: 700 }}>{i + 1}</td>
                                                <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--text-main)', fontFamily: 'monospace' }}>
                                                    {c.telefone}
                                                </td>
                                                <td style={{ padding: '10px 14px', color: 'var(--text-main)' }}>
                                                    {c.nome || <span style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>Sem nome</span>}
                                                </td>
                                                <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: '12px' }}>
                                                    {extraKeys.length > 0 ? (
                                                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                            {extraKeys.slice(0, 3).map(k => (
                                                                <span key={k} style={{ background: '#f1f5f9', padding: '1px 6px', borderRadius: '4px' }}>
                                                                    {k}: {c[k]}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span style={{ color: 'var(--text-dim)' }}>-</span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#ecfdf5', color: '#059669', padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 800 }}>
                                                        <CheckCircle2 size={12} /> Válido
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
