import React, { useState, useEffect, useMemo } from 'react';
import { 
    Search, RefreshCw, Filter, Layers, Copy, Check, ExternalLink, 
    Download, LayoutGrid, LayoutList, ShieldCheck, ShieldAlert, 
    Clock, Smartphone, AlertCircle, ArrowUpDown, ChevronRight, User
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { BmRecord } from '../types';
import { bmSheetService, COLLABORATOR_SHEETS } from '../services/bmSheetService';

interface BmControlProps {
    onSelectNumberForDispatch?: (number: string, bmName: string) => void;
    onSelectNumberForRegistry?: (number: string, bmName: string) => void;
}

export const BmControl: React.FC<BmControlProps> = ({
    onSelectNumberForDispatch,
    onSelectNumberForRegistry
}) => {
    // Data State
    const [records, setRecords] = useState<BmRecord[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [lastSyncTime, setLastSyncTime] = useState<string>('');
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    // View Options
    const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
    const [sortField, setSortField] = useState<keyof BmRecord>('data');
    const [sortAsc, setSortAsc] = useState<boolean>(false);

    // Filter States
    const [selectedCollaborator, setSelectedCollaborator] = useState<string>('GERAL');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [filterVerificacao, setFilterVerificacao] = useState<string>('TODOS');
    const [filterLimite, setFilterLimite] = useState<string>('TODOS');
    const [filterObservacao, setFilterObservacao] = useState<string>('TODOS');
    const [filterProcessos, setFilterProcessos] = useState<string>('TODOS');

    // Show temporary toast
    const showToast = (msg: string) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(null), 3000);
    };

    // Load Data on Mount (instant from cache, then revalidate)
    useEffect(() => {
        const cached = bmSheetService.getCached();
        if (cached && cached.records.length > 0) {
            setRecords(cached.records);
            setLastSyncTime(cached.timestamp);
            setIsLoading(false);
            // Revalidate in background
            syncData(false);
        } else {
            syncData(true);
        }
    }, []);

    // Sync from Google Sheets
    const syncData = async (showLoadingSpinner = true) => {
        if (showLoadingSpinner) setIsLoading(true);
        try {
            const res = await bmSheetService.fetchAll(true);
            setRecords(res.records);
            setLastSyncTime(res.timestamp);
            if (showLoadingSpinner) {
                showToast(`Sincronização concluída! ${res.records.length} BMs carregadas.`);
            }
        } catch (err: any) {
            console.error('Erro na sincronização:', err);
            showToast('Erro ao sincronizar com a planilha do Google.');
        } finally {
            setIsLoading(false);
        }
    };

    // Copy to clipboard helper
    const handleCopy = (text: string, id: string, label: string) => {
        if (!text || text === '-') return;
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        showToast(`${label} copiado!`);
        setTimeout(() => setCopiedId(null), 1800);
    };

    // Dynamic unique filter options extracted from records
    const uniqueOptions = useMemo(() => {
        const targetRecords = selectedCollaborator === 'GERAL' 
            ? records 
            : records.filter(r => r.colaborador === selectedCollaborator);

        return bmSheetService.getUniqueFilters(targetRecords);
    }, [records, selectedCollaborator]);

    // Collaborator counts
    const collaboratorCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const r of records) {
            counts[r.colaborador] = (counts[r.colaborador] || 0) + 1;
        }
        return counts;
    }, [records]);

    // Filtered & Sorted Records
    const filteredRecords = useMemo(() => {
        return records.filter(r => {
            // Collaborator filter
            if (selectedCollaborator !== 'GERAL' && r.colaborador !== selectedCollaborator) {
                return false;
            }

            // Verification filter
            if (filterVerificacao !== 'TODOS') {
                if (filterVerificacao === 'APROVADO_100') {
                    const v = r.verificacao.toLowerCase();
                    if (!v.includes('aprovad') && !v.includes('100%') && !v.includes('verificad')) return false;
                } else if (filterVerificacao === 'ANALISE') {
                    const v = r.verificacao.toLowerCase();
                    if (!v.includes('análise') && !v.includes('analise') && !v.includes('aguardando')) return false;
                } else if (filterVerificacao === 'BANIDA') {
                    const v = r.verificacao.toLowerCase();
                    if (!v.includes('banid') && !v.includes('bloquead')) return false;
                } else if (r.verificacao.trim() !== filterVerificacao) {
                    return false;
                }
            }

            // Limit filter
            if (filterLimite !== 'TODOS' && r.limiteBm.trim() !== filterLimite) {
                return false;
            }

            // Observation filter
            if (filterObservacao !== 'TODOS') {
                if (filterObservacao === 'SEM_OBS') {
                    if (r.observacao.trim() !== '') return false;
                } else if (r.observacao.trim() !== filterObservacao) {
                    return false;
                }
            }

            // Process / Banimentos filter
            if (filterProcessos !== 'TODOS') {
                const proc = (r.processosBanimentos || '').toLowerCase().trim();
                if (filterProcessos === 'LIMPO') {
                    if (proc !== 'nenhum' && proc !== '' && proc !== '-') return false;
                } else if (filterProcessos === 'COM_PROBLEMA') {
                    if (proc === 'nenhum' || proc === '' || proc === '-') return false;
                }
            }

            // Free text search
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                const matchNumber = r.numero.toLowerCase().includes(q);
                const matchBm = r.nomeBm.toLowerCase().includes(q);
                const matchAds = r.idAdspower.toLowerCase().includes(q);
                const matchFb = r.contatoFacebook.toLowerCase().includes(q);
                const matchObs = r.observacao.toLowerCase().includes(q);
                const matchCollab = r.colaborador.toLowerCase().includes(q);
                const matchVerif = r.verificacao.toLowerCase().includes(q);
                const matchProc = r.processosBanimentos.toLowerCase().includes(q);

                if (!matchNumber && !matchBm && !matchAds && !matchFb && !matchObs && !matchCollab && !matchVerif && !matchProc) {
                    return false;
                }
            }

            return true;
        }).sort((a, b) => {
            const valA = String(a[sortField] || '').toLowerCase();
            const valB = String(b[sortField] || '').toLowerCase();
            return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        });
    }, [
        records, selectedCollaborator, filterVerificacao, filterLimite, 
        filterObservacao, filterProcessos, searchQuery, sortField, sortAsc
    ]);

    // Stat HUD metrics
    const metrics = useMemo(() => {
        let aprovadas = 0;
        let analise = 0;
        let banidas = 0;
        let comNumero = 0;

        for (const r of filteredRecords) {
            const v = r.verificacao.toLowerCase();
            if (v.includes('aprovad') || v.includes('100%') || v.includes('verificad')) aprovadas++;
            else if (v.includes('análise') || v.includes('analise') || v.includes('aguardando')) analise++;
            else if (v.includes('banid') || v.includes('bloquead')) banidas++;

            if (r.numero && r.numero.replace(/\D/g, '').length >= 8) comNumero++;
        }

        return {
            total: filteredRecords.length,
            aprovadas,
            analise,
            banidas,
            comNumero
        };
    }, [filteredRecords]);

    // Active filters count
    const hasActiveFilters = searchQuery !== '' || filterVerificacao !== 'TODOS' || filterLimite !== 'TODOS' || filterObservacao !== 'TODOS' || filterProcessos !== 'TODOS';

    const clearAllFilters = () => {
        setSearchQuery('');
        setFilterVerificacao('TODOS');
        setFilterLimite('TODOS');
        setFilterObservacao('TODOS');
        setFilterProcessos('TODOS');
    };

    // Export to Excel
    const handleExportExcel = () => {
        if (filteredRecords.length === 0) {
            showToast('Nenhum registro para exportar.');
            return;
        }

        const dataForExport = filteredRecords.map(r => ({
            'Colaborador': r.colaborador,
            'Data': r.data,
            'ID AdsPower': r.idAdspower,
            'Contato Facebook': r.contatoFacebook,
            'Número': r.numero,
            'Nome da BM': r.nomeBm,
            'Verificação': r.verificacao,
            'Limite da BM': r.limiteBm,
            'Observação': r.observacao,
            'Processos/Banimentos': r.processosBanimentos
        }));

        const ws = XLSX.utils.json_to_sheet(dataForExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Controle BMs');
        const filename = `Controle_BMs_${selectedCollaborator}_${new Date().toISOString().slice(0, 10)}.xlsx`;
        XLSX.writeFile(wb, filename);
        showToast(`Planilha ${filename} baixada com sucesso!`);
    };

    const toggleSort = (field: keyof BmRecord) => {
        if (sortField === field) {
            setSortAsc(!sortAsc);
        } else {
            setSortField(field);
            setSortAsc(true);
        }
    };

    // Helper for Status Badge styling
    const renderVerificacaoBadge = (val: string) => {
        if (!val || val === '-') {
            return <span className="badge" style={{ background: '#f1f5f9', color: '#64748b' }}>Indefinido</span>;
        }
        const v = val.toLowerCase();
        if (v.includes('aprovad') || v.includes('100%') || v.includes('verificad')) {
            return (
                <span className="badge" style={{ background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0' }}>
                    <ShieldCheck size={12} style={{ marginRight: '4px', verticalAlign: '-1px' }} />
                    {val}
                </span>
            );
        }
        if (v.includes('análise') || v.includes('analise') || v.includes('aguardando')) {
            return (
                <span className="badge" style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a' }}>
                    <Clock size={12} style={{ marginRight: '4px', verticalAlign: '-1px' }} />
                    {val}
                </span>
            );
        }
        if (v.includes('banid') || v.includes('bloquead') || v.includes('caiu')) {
            return (
                <span className="badge" style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>
                    <ShieldAlert size={12} style={{ marginRight: '4px', verticalAlign: '-1px' }} />
                    {val}
                </span>
            );
        }
        return <span className="badge" style={{ background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0' }}>{val}</span>;
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Toast Notification */}
            {toastMessage && (
                <div style={{
                    position: 'fixed',
                    bottom: '24px',
                    right: '24px',
                    background: '#0f172a',
                    color: '#ffffff',
                    padding: '12px 20px',
                    borderRadius: '10px',
                    boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)',
                    zIndex: 9999,
                    fontSize: '0.86rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}>
                    <Check size={16} color="#10b981" />
                    <span>{toastMessage}</span>
                </div>
            )}

            {/* Header Control Panel */}
            <div className="glass-panel" style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <span className="badge badge-approved" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Layers size={13} />
                            Google Sheets Oficial
                        </span>
                        {lastSyncTime && (
                            <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>
                                Sincronizado: {new Date(lastSyncTime).toLocaleTimeString('pt-BR')}
                            </span>
                        )}
                    </div>
                    <h2 style={{ fontSize: '1.45rem', fontWeight: 900, color: 'var(--text-main)', letterSpacing: '-0.3px' }}>
                        Controle de BMs & Contas Meta
                    </h2>
                    <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                        Filtros inteligentes por colaborador, status de verificação, limites e observações operacionais.
                    </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    {/* View Switcher */}
                    <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
                        <button
                            onClick={() => setViewMode('table')}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '6px 12px',
                                borderRadius: '7px',
                                border: 'none',
                                background: viewMode === 'table' ? '#ffffff' : 'transparent',
                                color: viewMode === 'table' ? 'var(--text-main)' : 'var(--text-muted)',
                                fontWeight: viewMode === 'table' ? 700 : 500,
                                fontSize: '0.8rem',
                                cursor: 'pointer',
                                boxShadow: viewMode === 'table' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
                            }}
                        >
                            <LayoutList size={14} />
                            Tabela
                        </button>
                        <button
                            onClick={() => setViewMode('cards')}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '6px 12px',
                                borderRadius: '7px',
                                border: 'none',
                                background: viewMode === 'cards' ? '#ffffff' : 'transparent',
                                color: viewMode === 'cards' ? 'var(--text-main)' : 'var(--text-muted)',
                                fontWeight: viewMode === 'cards' ? 700 : 500,
                                fontSize: '0.8rem',
                                cursor: 'pointer',
                                boxShadow: viewMode === 'cards' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
                            }}
                        >
                            <LayoutGrid size={14} />
                            Cards
                        </button>
                    </div>

                    {/* Export Button */}
                    <button 
                        className="btn-secondary"
                        onClick={handleExportExcel}
                        title="Exportar registros filtrados para Excel"
                        style={{ padding: '8px 14px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                        <Download size={14} />
                        Exportar Excel
                    </button>

                    {/* Sync Button */}
                    <button 
                        className="btn-primary"
                        onClick={() => syncData(true)}
                        disabled={isLoading}
                        style={{ padding: '8px 16px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                        <RefreshCw size={14} className={isLoading ? 'spin-animation' : ''} />
                        {isLoading ? 'Sincronizando...' : 'Sincronizar Planilha'}
                    </button>

                    {/* Open Google Sheets External Link */}
                    <a
                        href="https://docs.google.com/spreadsheets/d/e/2PACX-1vSgMK4ZwR9PhuXaHAwlBbtbXM_bGsSThF7SLyn2by1ObgxZ14FNF1Lcednw87xAuA/pubhtml"
                        target="_blank"
                        rel="noreferrer"
                        className="btn-secondary"
                        style={{ padding: '8px 10px', textDecoration: 'none', display: 'flex', alignItems: 'center' }}
                        title="Abrir Planilha Original Google Docs"
                    >
                        <ExternalLink size={15} />
                    </a>
                </div>
            </div>

            {/* Collaborator Horizontal Selector (Pills Bar) */}
            <div style={{
                background: '#ffffff',
                border: '1px solid var(--border-subtle)',
                borderRadius: '16px',
                padding: '12px 16px',
                boxShadow: 'var(--shadow-card)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <User size={15} color="var(--primary-color)" />
                        <span style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>
                            Colaborador / Aba da Planilha
                        </span>
                    </div>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>
                        Exibindo 14 colaboradores oficiais
                    </span>
                </div>

                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    overflowX: 'auto',
                    paddingBottom: '6px'
                }}>
                    {/* GERAL (TODOS) TAB */}
                    <button
                        onClick={() => setSelectedCollaborator('GERAL')}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 16px',
                            borderRadius: '10px',
                            border: `1.5px solid ${selectedCollaborator === 'GERAL' ? 'var(--primary-color)' : 'var(--border-subtle)'}`,
                            background: selectedCollaborator === 'GERAL' ? 'var(--primary-light)' : '#ffffff',
                            color: selectedCollaborator === 'GERAL' ? 'var(--primary-color)' : 'var(--text-main)',
                            fontWeight: selectedCollaborator === 'GERAL' ? 800 : 600,
                            fontSize: '0.82rem',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            transition: 'all 0.15s ease',
                            flexShrink: 0
                        }}
                    >
                        <span>✨ Geral (Todos)</span>
                        <span style={{
                            background: selectedCollaborator === 'GERAL' ? 'var(--primary-color)' : '#e2e8f0',
                            color: selectedCollaborator === 'GERAL' ? '#ffffff' : 'var(--text-muted)',
                            padding: '2px 7px',
                            borderRadius: '999px',
                            fontSize: '0.7rem',
                            fontWeight: 800
                        }}>
                            {records.length}
                        </span>
                    </button>

                    {/* 14 INDIVIDUAL COLLABORATORS */}
                    {COLLABORATOR_SHEETS.map(collab => {
                        const count = collaboratorCounts[collab.name] || 0;
                        const isSelected = selectedCollaborator === collab.name;
                        return (
                            <button
                                key={collab.name}
                                onClick={() => setSelectedCollaborator(collab.name)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '8px 14px',
                                    borderRadius: '10px',
                                    border: `1px solid ${isSelected ? 'var(--primary-color)' : 'var(--border-subtle)'}`,
                                    background: isSelected ? 'var(--primary-light)' : '#ffffff',
                                    color: isSelected ? 'var(--primary-color)' : 'var(--text-main)',
                                    fontWeight: isSelected ? 800 : 500,
                                    fontSize: '0.8rem',
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                    transition: 'all 0.15s ease',
                                    flexShrink: 0
                                }}
                            >
                                <span>{collab.name}</span>
                                <span style={{
                                    background: isSelected ? 'var(--primary-color)' : '#f1f5f9',
                                    color: isSelected ? '#ffffff' : 'var(--text-dim)',
                                    padding: '1px 6px',
                                    borderRadius: '999px',
                                    fontSize: '0.68rem',
                                    fontWeight: 700
                                }}>
                                    {count}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Metrics HUD Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '14px' }}>
                {/* Total */}
                <div className="glass-panel" style={{ padding: '16px 18px', background: '#ffffff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.76rem', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase' }}>
                            Total de BMs
                        </span>
                        <div style={{ background: '#f1f5f9', padding: '6px', borderRadius: '8px', color: 'var(--text-muted)' }}>
                            <Layers size={16} />
                        </div>
                    </div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--text-main)' }}>
                        {metrics.total}
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                        {selectedCollaborator === 'GERAL' ? 'Consolidado de todos' : `Colaborador: ${selectedCollaborator}`}
                    </span>
                </div>

                {/* Aprovadas */}
                <div className="glass-panel" style={{ padding: '16px 18px', background: '#ffffff', borderLeft: '4px solid #10b981' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.76rem', color: '#059669', fontWeight: 700, textTransform: 'uppercase' }}>
                            Aprovado / 100%
                        </span>
                        <div style={{ background: '#ecfdf5', padding: '6px', borderRadius: '8px', color: '#059669' }}>
                            <ShieldCheck size={16} />
                        </div>
                    </div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#059669' }}>
                        {metrics.aprovadas}
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                        {metrics.total > 0 ? `${((metrics.aprovadas / metrics.total) * 100).toFixed(0)}% das BMs listadas` : '0%'}
                    </span>
                </div>

                {/* Em Análise */}
                <div className="glass-panel" style={{ padding: '16px 18px', background: '#ffffff', borderLeft: '4px solid #f59e0b' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.76rem', color: '#b45309', fontWeight: 700, textTransform: 'uppercase' }}>
                            Em Análise / Meta
                        </span>
                        <div style={{ background: '#fffbeb', padding: '6px', borderRadius: '8px', color: '#b45309' }}>
                            <Clock size={16} />
                        </div>
                    </div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#b45309' }}>
                        {metrics.analise}
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                        Aguardando aprovação
                    </span>
                </div>

                {/* Banidas */}
                <div className="glass-panel" style={{ padding: '16px 18px', background: '#ffffff', borderLeft: '4px solid #ef4444' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.76rem', color: '#dc2626', fontWeight: 700, textTransform: 'uppercase' }}>
                            Banidas / Restrição
                        </span>
                        <div style={{ background: '#fef2f2', padding: '6px', borderRadius: '8px', color: '#dc2626' }}>
                            <ShieldAlert size={16} />
                        </div>
                    </div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#dc2626' }}>
                        {metrics.banidas}
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                        Contas com perda ou queda
                    </span>
                </div>

                {/* Com Número WhatsApp */}
                <div className="glass-panel" style={{ padding: '16px 18px', background: '#ffffff', borderLeft: '4px solid #3b82f6' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.76rem', color: '#2563eb', fontWeight: 700, textTransform: 'uppercase' }}>
                            Com WhatsApp
                        </span>
                        <div style={{ background: '#eff6ff', padding: '6px', borderRadius: '8px', color: '#2563eb' }}>
                            <Smartphone size={16} />
                        </div>
                    </div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#2563eb' }}>
                        {metrics.comNumero}
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                        Números válidos para disparo
                    </span>
                </div>
            </div>

            {/* Smart & Fast Filters Bar */}
            <div className="glass-panel" style={{ padding: '18px 20px', background: '#ffffff' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Filter size={16} color="var(--primary-color)" />
                        <span style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Filtros Rápidos & Inteligentes
                        </span>
                    </div>

                    {hasActiveFilters && (
                        <button
                            onClick={clearAllFilters}
                            style={{
                                background: '#fee2e2',
                                color: '#b91c1c',
                                border: 'none',
                                padding: '4px 10px',
                                borderRadius: '6px',
                                fontSize: '0.74rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                            }}
                        >
                            <span>Limpar Todos os Filtros</span>
                        </button>
                    )}
                </div>

                {/* Row 1: Global Search & Dropdown Filters */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                    {/* Free text search */}
                    <div style={{ position: 'relative' }}>
                        <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                        <input
                            type="text"
                            placeholder="Buscar por Número, BM, AdsPower, Facebook..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="input-field"
                            style={{ paddingLeft: '36px', height: '40px', fontSize: '0.82rem' }}
                        />
                    </div>

                    {/* Verificação Filter */}
                    <div>
                        <select
                            value={filterVerificacao}
                            onChange={(e) => setFilterVerificacao(e.target.value)}
                            className="input-field"
                            style={{ height: '40px', fontSize: '0.82rem', fontWeight: 600 }}
                        >
                            <option value="TODOS">Verificação: Todas</option>
                            <option value="APROVADO_100">✅ Aprovado - 100% / Verificada</option>
                            <option value="ANALISE">⏳ Em Análise / Aguardando Meta</option>
                            <option value="BANIDA">🚫 Banida / Bloqueada</option>
                            {uniqueOptions.verifications.map(v => (
                                <option key={v} value={v}>{v}</option>
                            ))}
                        </select>
                    </div>

                    {/* Limite BM Filter */}
                    <div>
                        <select
                            value={filterLimite}
                            onChange={(e) => setFilterLimite(e.target.value)}
                            className="input-field"
                            style={{ height: '40px', fontSize: '0.82rem', fontWeight: 600 }}
                        >
                            <option value="TODOS">Limite da BM: Todos</option>
                            {uniqueOptions.limits.map(l => (
                                <option key={l} value={l}>Limite: {l}</option>
                            ))}
                        </select>
                    </div>

                    {/* Observação Filter */}
                    <div>
                        <select
                            value={filterObservacao}
                            onChange={(e) => setFilterObservacao(e.target.value)}
                            className="input-field"
                            style={{ height: '40px', fontSize: '0.82rem', fontWeight: 600 }}
                        >
                            <option value="TODOS">Observações: Todas</option>
                            <option value="SEM_OBS">Sem Observação (Vazio)</option>
                            {uniqueOptions.observations.map(o => (
                                <option key={o} value={o}>Obs: {o.slice(0, 35)}...</option>
                            ))}
                        </select>
                    </div>

                    {/* Processos / Banimentos Filter */}
                    <div>
                        <select
                            value={filterProcessos}
                            onChange={(e) => setFilterProcessos(e.target.value)}
                            className="input-field"
                            style={{ height: '40px', fontSize: '0.82rem', fontWeight: 600 }}
                        >
                            <option value="TODOS">Processos/Banimentos: Todos</option>
                            <option value="LIMPO">Somente Nenhum / Limpo</option>
                            <option value="COM_PROBLEMA">Com Processo / Banimento / Caiu</option>
                        </select>
                    </div>
                </div>

                {/* Row 2: Instant 1-Click Quick Chips (Limite & Verificação) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', paddingTop: '10px', borderTop: '1px solid #f1f5f9' }}>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)', fontWeight: 700 }}>
                        Atalhos de Limite:
                    </span>
                    {['TODOS', '2k', '1.5k', '250', '50', '0'].map(lim => {
                        const isSelected = filterLimite === lim;
                        return (
                            <button
                                key={lim}
                                onClick={() => setFilterLimite(lim)}
                                style={{
                                    padding: '4px 10px',
                                    borderRadius: '6px',
                                    border: `1px solid ${isSelected ? 'var(--primary-color)' : 'var(--border-subtle)'}`,
                                    background: isSelected ? 'var(--primary-light)' : '#f8fafc',
                                    color: isSelected ? 'var(--primary-color)' : 'var(--text-muted)',
                                    fontWeight: isSelected ? 800 : 600,
                                    fontSize: '0.74rem',
                                    cursor: 'pointer'
                                }}
                            >
                                {lim === 'TODOS' ? 'Todos Limites' : lim}
                            </button>
                        );
                    })}

                    <div style={{ height: '16px', width: '1px', background: 'var(--border-subtle)', margin: '0 4px' }} />

                    <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)', fontWeight: 700 }}>
                        Atalhos Status:
                    </span>
                    <button
                        onClick={() => setFilterVerificacao(filterVerificacao === 'APROVADO_100' ? 'TODOS' : 'APROVADO_100')}
                        style={{
                            padding: '4px 10px',
                            borderRadius: '6px',
                            border: '1px solid #a7f3d0',
                            background: filterVerificacao === 'APROVADO_100' ? '#10b981' : '#ecfdf5',
                            color: filterVerificacao === 'APROVADO_100' ? '#ffffff' : '#047857',
                            fontWeight: 700,
                            fontSize: '0.74rem',
                            cursor: 'pointer'
                        }}
                    >
                        Aprovadas (100%)
                    </button>
                    <button
                        onClick={() => setFilterVerificacao(filterVerificacao === 'ANALISE' ? 'TODOS' : 'ANALISE')}
                        style={{
                            padding: '4px 10px',
                            borderRadius: '6px',
                            border: '1px solid #fde68a',
                            background: filterVerificacao === 'ANALISE' ? '#f59e0b' : '#fffbeb',
                            color: filterVerificacao === 'ANALISE' ? '#ffffff' : '#b45309',
                            fontWeight: 700,
                            fontSize: '0.74rem',
                            cursor: 'pointer'
                        }}
                    >
                        Em Análise
                    </button>
                    <button
                        onClick={() => setFilterVerificacao(filterVerificacao === 'BANIDA' ? 'TODOS' : 'BANIDA')}
                        style={{
                            padding: '4px 10px',
                            borderRadius: '6px',
                            border: '1px solid #fecaca',
                            background: filterVerificacao === 'BANIDA' ? '#ef4444' : '#fef2f2',
                            color: filterVerificacao === 'BANIDA' ? '#ffffff' : '#b91c1c',
                            fontWeight: 700,
                            fontSize: '0.74rem',
                            cursor: 'pointer'
                        }}
                    >
                        Banidas
                    </button>
                </div>
            </div>

            {/* List or Card View Render */}
            {isLoading && records.length === 0 ? (
                <div className="glass-panel" style={{ padding: '60px', textAlign: 'center' }}>
                    <RefreshCw size={36} className="spin-animation" style={{ color: 'var(--primary-color)', margin: '0 auto 16px auto' }} />
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Buscando abas e dados do Google Sheets...</h3>
                    <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                        Carregando as páginas dos 14 colaboradores. Aguarde alguns instantes.
                    </p>
                </div>
            ) : filteredRecords.length === 0 ? (
                <div className="glass-panel" style={{ padding: '50px', textAlign: 'center' }}>
                    <AlertCircle size={36} style={{ color: 'var(--text-dim)', margin: '0 auto 12px auto' }} />
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 800 }}>Nenhuma BM encontrada com esses filtros</h3>
                    <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                        Tente relaxar os filtros ou clique em limpar filtros para visualizar todos os registros.
                    </p>
                    <button className="btn-secondary" onClick={clearAllFilters}>
                        Limpar Filtros
                    </button>
                </div>
            ) : viewMode === 'table' ? (
                /* TABLE VIEW */
                <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border-subtle)' }}>
                                    <th style={{ padding: '14px 16px', fontWeight: 800, color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => toggleSort('data')}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            Data <ArrowUpDown size={12} />
                                        </div>
                                    </th>
                                    {selectedCollaborator === 'GERAL' && (
                                        <th style={{ padding: '14px 16px', fontWeight: 800, color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => toggleSort('colaborador')}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                Colaborador <ArrowUpDown size={12} />
                                            </div>
                                        </th>
                                    )}
                                    <th style={{ padding: '14px 16px', fontWeight: 800, color: 'var(--text-muted)' }}>
                                        AdsPower ID
                                    </th>
                                    <th style={{ padding: '14px 16px', fontWeight: 800, color: 'var(--text-muted)' }}>
                                        Contato Facebook
                                    </th>
                                    <th style={{ padding: '14px 16px', fontWeight: 800, color: 'var(--text-muted)' }}>
                                        Número (WhatsApp)
                                    </th>
                                    <th style={{ padding: '14px 16px', fontWeight: 800, color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => toggleSort('nomeBm')}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            Nome da BM <ArrowUpDown size={12} />
                                        </div>
                                    </th>
                                    <th style={{ padding: '14px 16px', fontWeight: 800, color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => toggleSort('verificacao')}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            Verificação <ArrowUpDown size={12} />
                                        </div>
                                    </th>
                                    <th style={{ padding: '14px 16px', fontWeight: 800, color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => toggleSort('limiteBm')}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            Limite <ArrowUpDown size={12} />
                                        </div>
                                    </th>
                                    <th style={{ padding: '14px 16px', fontWeight: 800, color: 'var(--text-muted)' }}>
                                        Observação
                                    </th>
                                    <th style={{ padding: '14px 16px', fontWeight: 800, color: 'var(--text-muted)' }}>
                                        Processos / Ban
                                    </th>
                                    <th style={{ padding: '14px 16px', fontWeight: 800, color: 'var(--text-muted)', textAlign: 'right' }}>
                                        Ações
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRecords.map((r, index) => {
                                    const hasValidNumber = r.numero && r.numero.replace(/\D/g, '').length >= 8;
                                    return (
                                        <tr 
                                            key={r.id || index}
                                            style={{
                                                borderBottom: '1px solid #f1f5f9',
                                                background: index % 2 === 0 ? '#ffffff' : '#fafafa',
                                                transition: 'background 0.15s ease'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = index % 2 === 0 ? '#ffffff' : '#fafafa'}
                                        >
                                            {/* Data */}
                                            <td style={{ padding: '12px 16px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontWeight: 500 }}>
                                                {r.data || '-'}
                                            </td>

                                            {/* Colaborador (only in Geral view) */}
                                            {selectedCollaborator === 'GERAL' && (
                                                <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                                                    <span style={{
                                                        background: '#e0f2fe',
                                                        color: '#0369a1',
                                                        padding: '3px 8px',
                                                        borderRadius: '6px',
                                                        fontWeight: 700,
                                                        fontSize: '0.74rem'
                                                    }}>
                                                        {r.colaborador}
                                                    </span>
                                                </td>
                                            )}

                                            {/* AdsPower ID */}
                                            <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                                                {r.idAdspower ? (
                                                    <button
                                                        onClick={() => handleCopy(r.idAdspower, `ads_${r.id}`, 'ID AdsPower')}
                                                        title="Copiar ID AdsPower"
                                                        style={{
                                                            background: '#f1f5f9',
                                                            border: '1px solid var(--border-subtle)',
                                                            borderRadius: '6px',
                                                            padding: '2px 7px',
                                                            fontSize: '0.74rem',
                                                            fontWeight: 700,
                                                            color: 'var(--text-main)',
                                                            cursor: 'pointer',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '4px'
                                                        }}
                                                    >
                                                        <span>#{r.idAdspower}</span>
                                                        {copiedId === `ads_${r.id}` ? <Check size={11} color="#10b981" /> : <Copy size={11} color="var(--text-dim)" />}
                                                    </button>
                                                ) : '-'}
                                            </td>

                                            {/* Contato Facebook */}
                                            <td style={{ padding: '12px 16px', color: 'var(--text-main)', fontWeight: 500 }}>
                                                {r.contatoFacebook || '-'}
                                            </td>

                                            {/* Número WhatsApp */}
                                            <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                                                {hasValidNumber ? (
                                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                                        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-main)', fontSize: '0.84rem' }}>
                                                            {r.numero}
                                                        </span>
                                                        <button
                                                            onClick={() => handleCopy(r.numero, `num_${r.id}`, 'Número')}
                                                            title="Copiar Número"
                                                            style={{
                                                                background: copiedId === `num_${r.id}` ? '#ecfdf5' : '#f1f5f9',
                                                                border: 'none',
                                                                borderRadius: '5px',
                                                                padding: '3px 5px',
                                                                cursor: 'pointer',
                                                                color: copiedId === `num_${r.id}` ? '#059669' : 'var(--text-dim)'
                                                            }}
                                                        >
                                                            {copiedId === `num_${r.id}` ? <Check size={13} /> : <Copy size={13} />}
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span style={{ color: 'var(--text-dim)', fontSize: '0.74rem' }}>{r.numero || 'Sem número'}</span>
                                                )}
                                            </td>

                                            {/* Nome da BM */}
                                            <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-main)', maxWidth: '240px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.nomeBm}>
                                                        {r.nomeBm || '-'}
                                                    </span>
                                                    {r.nomeBm && (
                                                        <button
                                                            onClick={() => handleCopy(r.nomeBm, `bm_${r.id}`, 'Nome da BM')}
                                                            title="Copiar Nome da BM"
                                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}
                                                        >
                                                            {copiedId === `bm_${r.id}` ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                                                        </button>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Verificação */}
                                            <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                                                {renderVerificacaoBadge(r.verificacao)}
                                            </td>

                                            {/* Limite BM */}
                                            <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                                                {r.limiteBm ? (
                                                    <span style={{
                                                        background: '#f3e8ff',
                                                        color: '#7e22ce',
                                                        padding: '3px 8px',
                                                        borderRadius: '6px',
                                                        fontWeight: 800,
                                                        fontSize: '0.76rem',
                                                        border: '1px solid #e9d5ff'
                                                    }}>
                                                        {r.limiteBm}
                                                    </span>
                                                ) : '-'}
                                            </td>

                                            {/* Observação */}
                                            <td style={{ padding: '12px 16px', maxWidth: '220px' }}>
                                                {r.observacao ? (
                                                    <span 
                                                        style={{ 
                                                            fontSize: '0.76rem', 
                                                            color: 'var(--text-muted)',
                                                            display: '-webkit-box',
                                                            WebkitLineClamp: 2,
                                                            WebkitBoxOrient: 'vertical',
                                                            overflow: 'hidden'
                                                        }} 
                                                        title={r.observacao}
                                                    >
                                                        {r.observacao}
                                                    </span>
                                                ) : (
                                                    <span style={{ color: 'var(--text-dim)', fontSize: '0.74rem' }}>-</span>
                                                )}
                                            </td>

                                            {/* Processos / Banimentos */}
                                            <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                                                {r.processosBanimentos && r.processosBanimentos.toLowerCase() !== 'nenhum' && r.processosBanimentos !== '-' ? (
                                                    <span style={{
                                                        background: '#fee2e2',
                                                        color: '#dc2626',
                                                        padding: '2px 7px',
                                                        borderRadius: '6px',
                                                        fontSize: '0.72rem',
                                                        fontWeight: 700
                                                    }}>
                                                        {r.processosBanimentos}
                                                    </span>
                                                ) : (
                                                    <span style={{ color: '#16a34a', fontSize: '0.74rem', fontWeight: 600 }}>Nenhum</span>
                                                )}
                                            </td>

                                            {/* Actions */}
                                            <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                <div style={{ display: 'inline-flex', gap: '6px' }}>
                                                    {hasValidNumber && onSelectNumberForDispatch && (
                                                        <button
                                                            onClick={() => onSelectNumberForDispatch(r.numero, r.nomeBm)}
                                                            className="btn-secondary"
                                                            style={{ padding: '4px 8px', fontSize: '0.72rem', fontWeight: 700 }}
                                                            title="Enviar este número para o Multi-Remetente"
                                                        >
                                                            Disparador
                                                        </button>
                                                    )}
                                                    {hasValidNumber && onSelectNumberForRegistry && (
                                                        <button
                                                            onClick={() => onSelectNumberForRegistry(r.numero, r.nomeBm)}
                                                            className="btn-primary"
                                                            style={{ padding: '4px 8px', fontSize: '0.72rem', fontWeight: 700 }}
                                                            title="Registrar como WABA"
                                                        >
                                                            Salvar WABA
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                /* CARDS VIEW */
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
                    {filteredRecords.map((r, index) => {
                        const hasValidNumber = r.numero && r.numero.replace(/\D/g, '').length >= 8;
                        return (
                            <div 
                                key={r.id || index}
                                className="glass-panel"
                                style={{
                                    padding: '18px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                    gap: '12px',
                                    background: '#ffffff',
                                    border: '1px solid var(--border-subtle)',
                                    borderRadius: '14px',
                                    boxShadow: 'var(--shadow-card)'
                                }}
                            >
                                {/* Card Header */}
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{
                                                background: '#e0f2fe',
                                                color: '#0369a1',
                                                padding: '2px 7px',
                                                borderRadius: '6px',
                                                fontWeight: 800,
                                                fontSize: '0.72rem'
                                            }}>
                                                {r.colaborador}
                                            </span>
                                            {r.idAdspower && (
                                                <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontWeight: 600 }}>
                                                    #{r.idAdspower}
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            {r.limiteBm && (
                                                <span style={{
                                                    background: '#f3e8ff',
                                                    color: '#7e22ce',
                                                    padding: '2px 7px',
                                                    borderRadius: '6px',
                                                    fontWeight: 800,
                                                    fontSize: '0.72rem'
                                                }}>
                                                    {r.limiteBm}
                                                </span>
                                            )}
                                            {renderVerificacaoBadge(r.verificacao)}
                                        </div>
                                    </div>

                                    {/* BM Name */}
                                    <h4 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '4px' }}>
                                        {r.nomeBm || 'BM Sem Nome'}
                                    </h4>
                                    <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>
                                        Data: {r.data || '-'} • Contato: {r.contatoFacebook || '-'}
                                    </span>
                                </div>

                                {/* Number Box */}
                                <div style={{
                                    background: '#f8fafc',
                                    padding: '10px 12px',
                                    borderRadius: '10px',
                                    border: '1px solid var(--border-subtle)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Smartphone size={16} color="var(--primary-color)" />
                                        <div>
                                            <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', display: 'block' }}>Número WhatsApp</span>
                                            <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '0.88rem', color: hasValidNumber ? 'var(--text-main)' : 'var(--text-dim)' }}>
                                                {r.numero || 'Não informado'}
                                            </span>
                                        </div>
                                    </div>
                                    {hasValidNumber && (
                                        <button
                                            onClick={() => handleCopy(r.numero, `card_num_${r.id}`, 'Número')}
                                            style={{
                                                background: copiedId === `card_num_${r.id}` ? '#ecfdf5' : '#ffffff',
                                                border: '1px solid var(--border-subtle)',
                                                borderRadius: '6px',
                                                padding: '5px 8px',
                                                cursor: 'pointer',
                                                color: copiedId === `card_num_${r.id}` ? '#059669' : 'var(--text-muted)'
                                            }}
                                            title="Copiar Número"
                                        >
                                            {copiedId === `card_num_${r.id}` ? <Check size={14} /> : <Copy size={14} />}
                                        </button>
                                    )}
                                </div>

                                {/* Observações & Processos */}
                                {(r.observacao || r.processosBanimentos) && (
                                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', background: '#fafafa', padding: '8px 10px', borderRadius: '8px' }}>
                                        {r.observacao && <div><strong>Obs:</strong> {r.observacao}</div>}
                                        {r.processosBanimentos && r.processosBanimentos.toLowerCase() !== 'nenhum' && (
                                            <div style={{ color: '#dc2626', marginTop: '2px' }}>
                                                <strong>Processo:</strong> {r.processosBanimentos}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Actions */}
                                <div style={{ display: 'flex', gap: '8px', paddingTop: '6px' }}>
                                    {hasValidNumber && onSelectNumberForDispatch && (
                                        <button
                                            onClick={() => onSelectNumberForDispatch(r.numero, r.nomeBm)}
                                            className="btn-secondary"
                                            style={{ flex: 1, padding: '6px 10px', fontSize: '0.74rem', justifyContent: 'center' }}
                                        >
                                            Usar no Disparador
                                        </button>
                                    )}
                                    {hasValidNumber && onSelectNumberForRegistry && (
                                        <button
                                            onClick={() => onSelectNumberForRegistry(r.numero, r.nomeBm)}
                                            className="btn-primary"
                                            style={{ flex: 1, padding: '6px 10px', fontSize: '0.74rem', justifyContent: 'center' }}
                                        >
                                            Registrar WABA
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
export default BmControl;
