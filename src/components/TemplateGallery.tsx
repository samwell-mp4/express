import React, { useState, useEffect, useMemo } from 'react';
import {
    Search, RefreshCw, Filter, Check, Copy, ExternalLink, Download,
    LayoutGrid, LayoutList, ShieldCheck, Clock, AlertTriangle,
    FileText, Smartphone, ArrowRight, Eye, Sparkles, MessageSquare,
    Share2, CheckCircle2, X, ChevronRight, Tag
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { InfobipAccountTemplate } from '../types';
import { templateService } from '../services/templateService';

interface TemplateGalleryProps {
    onSelectTemplateForDispatch?: (templateName: string) => void;
}

export const TemplateGallery: React.FC<TemplateGalleryProps> = ({
    onSelectTemplateForDispatch
}) => {
    // State
    const [templates, setTemplates] = useState<InfobipAccountTemplate[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [lastSyncTime, setLastSyncTime] = useState<string>('');
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [selectedTemplateForModal, setSelectedTemplateForModal] = useState<InfobipAccountTemplate | null>(null);

    // View Options
    const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
    const [dateRange, setDateRange] = useState<'7days' | '14days' | '30days' | 'all'>('7days');

    // Filters
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [filterStatus, setFilterStatus] = useState<string>('ALL');
    const [filterAccount, setFilterAccount] = useState<string>('ALL');
    const [filterCategory, setFilterCategory] = useState<string>('ALL');

    // Dedicated Sender Phone Search
    const [senderSearchInput, setSenderSearchInput] = useState<string>('');
    const [activeSenderFilter, setActiveSenderFilter] = useState<string | null>(null);
    const [isSearchingSender, setIsSearchingSender] = useState<boolean>(false);

    const showToast = (msg: string) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(null), 3000);
    };

    const handleSearchSender = async (targetNumber?: string) => {
        const raw = (targetNumber !== undefined ? targetNumber : senderSearchInput).trim();
        if (!raw) {
            setActiveSenderFilter(null);
            return;
        }
        setIsSearchingSender(true);
        try {
            const res = await templateService.fetchTemplatesBySender(raw, true);
            if (res.templates && res.templates.length > 0) {
                // Mesclar templates encontrados na lista geral mantendo os existentes
                setTemplates(prev => {
                    const map = new Map<string, InfobipAccountTemplate>();
                    for (const t of res.templates) map.set(t.name, t);
                    for (const t of prev) {
                        if (!map.has(t.name)) map.set(t.name, t);
                    }
                    return Array.from(map.values());
                });
                setActiveSenderFilter(raw);
                setSenderSearchInput(raw);
                showToast(`✓ ${res.templates.length} templates carregados para o remetente ${raw}!`);
            } else {
                showToast(`⚠️ Nenhum template retornado para o número ${raw} na BM do Luiz.`);
            }
        } catch (e: any) {
            console.error('Erro ao buscar remetente:', e);
            showToast(`Erro ao buscar: ${e.message}`);
        } finally {
            setIsSearchingSender(false);
        }
    };

    const handleClearSenderFilter = () => {
        setSenderSearchInput('');
        setActiveSenderFilter(null);
    };

    // Calculate cutoff date based on dateRange
    const getCutoffDate = (range: '7days' | '14days' | '30days' | 'all') => {
        if (range === '7days') return '2026-09-21T00:00:00Z'; // Solicitado: 7 dias a partir de 21/09
        if (range === '14days') return '2026-09-14T00:00:00Z';
        if (range === '30days') return '2026-08-28T00:00:00Z';
        return '2026-01-01T00:00:00Z';
    };

    // Load templates on mount
    useEffect(() => {
        const cached = templateService.getCached();
        setTemplates(cached.templates);
        setLastSyncTime(cached.timestamp);
        setIsLoading(false);

        // Background sync
        syncTemplates(false);
    }, [dateRange]);

    const syncTemplates = async (showNotification = true) => {
        if (showNotification) setIsLoading(true);
        try {
            const cutoff = getCutoffDate(dateRange);
            const res = await templateService.fetchRecentTemplates(cutoff, true);
            setTemplates(res.templates);
            setLastSyncTime(res.timestamp);
            if (showNotification) {
                showToast(`Sincronização concluída! ${res.templates.length} templates carregados.`);
            }
        } catch (err: any) {
            console.error('Erro ao sincronizar templates:', err);
            showToast('Erro ao sincronizar templates com a Infobip.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleCopy = (text: string, id: string, label: string) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        showToast(`${label} copiado!`);
        setTimeout(() => setCopiedId(null), 1800);
    };

    // Filter templates
    const filteredTemplates = useMemo(() => {
        const cutoffMs = new Date(getCutoffDate(dateRange)).getTime();

        return templates.filter(t => {
            // Sender number filter (se ativo, filtra templates vinculados a esse número)
            if (activeSenderFilter) {
                const cleanFilter = activeSenderFilter.replace(/\D/g, '');
                const tSender = (t._sender || '').replace(/\D/g, '');
                const tFormatted = (t._senderFormatted || '').replace(/\D/g, '');
                const matchSender = tSender.includes(cleanFilter) ||
                    tFormatted.includes(cleanFilter) ||
                    (t.businessName || '').toLowerCase().includes(cleanFilter.toLowerCase()) ||
                    (t.name || '').toLowerCase().includes(cleanFilter.toLowerCase());
                if (!matchSender) {
                    return false;
                }
            }

            // Date filter (aplicado na visualização geral)
            if (!activeSenderFilter) {
                const itemDate = new Date(t.lastUpdatedAt || t.createdAt || 0).getTime();
                if (dateRange !== 'all' && itemDate < cutoffMs) {
                    return false;
                }
            }

            // Status filter
            if (filterStatus !== 'ALL' && t.status !== filterStatus) {
                return false;
            }

            // Account filter
            if (filterAccount !== 'ALL' && (t._account || 'BM do Luiz') !== filterAccount) {
                return false;
            }

            // Category filter
            if (filterCategory !== 'ALL' && t.category !== filterCategory) {
                return false;
            }

            // Search query
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                const matchName = t.name.toLowerCase().includes(q);
                const matchBm = (t.businessName || '').toLowerCase().includes(q);
                const matchBody = (t.structure?.body?.text || '').toLowerCase().includes(q);
                const matchSender = (t._senderFormatted || t._sender || '').toLowerCase().includes(q);
                const matchButtons = (t.structure?.buttons || []).some(b =>
                    (b.text || '').toLowerCase().includes(q) || (b.url || '').toLowerCase().includes(q)
                );

                if (!matchName && !matchBm && !matchBody && !matchSender && !matchButtons) {
                    return false;
                }
            }

            return true;
        }).sort((a, b) => {
            const timeA = new Date(a.lastUpdatedAt || a.createdAt || 0).getTime();
            const timeB = new Date(b.lastUpdatedAt || b.createdAt || 0).getTime();
            return timeB - timeA;
        });
    }, [templates, dateRange, filterStatus, filterAccount, filterCategory, searchQuery, activeSenderFilter]);

    // Metrics HUD
    const metrics = useMemo(() => {
        let approved = 0;
        let pending = 0;
        let rejected = 0;
        let utility = 0;
        let marketing = 0;

        for (const t of filteredTemplates) {
            if (t.status === 'APPROVED') approved++;
            else if (t.status === 'PENDING') pending++;
            else rejected++;

            if (t.category === 'UTILITY') utility++;
            else if (t.category === 'MARKETING') marketing++;
        }

        return {
            total: filteredTemplates.length,
            approved,
            pending,
            rejected,
            utility,
            marketing
        };
    }, [filteredTemplates]);

    // Export to Excel
    const handleExportExcel = () => {
        if (filteredTemplates.length === 0) {
            showToast('Nenhum template para exportar.');
            return;
        }

        const dataForExport = filteredTemplates.map(t => ({
            'Nome do Template': t.name,
            'Status': t.status,
            'Categoria': t.category,
            'Idioma': t.language,
            'Conta/BM': t.businessName || t._account || 'BM do Luiz',
            'Header': t.structure?.header?.format || 'Nenhum',
            'Texto da Mensagem': t.structure?.body?.text || '',
            'Botões': (t.structure?.buttons || []).map(b => `${b.text} (${b.url || b.type})`).join(' | '),
            'Criado Em': t.createdAt ? new Date(t.createdAt).toLocaleString('pt-BR') : '',
            'Atualizado Em': t.lastUpdatedAt ? new Date(t.lastUpdatedAt).toLocaleString('pt-BR') : ''
        }));

        const ws = XLSX.utils.json_to_sheet(dataForExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Templates Meta');
        const filename = `Templates_Meta_${dateRange}_${new Date().toISOString().slice(0, 10)}.xlsx`;
        XLSX.writeFile(wb, filename);
        showToast(`Planilha ${filename} baixada com sucesso!`);
    };

    // Helper to format body text with highlighted variables
    const renderFormattedBodyText = (text: string) => {
        if (!text) return <span style={{ color: 'var(--text-dim)' }}>Sem texto</span>;
        const parts = text.split(/(\{\{\d+\}\})/g);
        return parts.map((part, idx) => {
            if (/^\{\{\d+\}\}$/.test(part)) {
                return (
                    <span
                        key={idx}
                        style={{
                            background: '#dcfce7',
                            color: '#15803d',
                            padding: '1px 5px',
                            borderRadius: '4px',
                            fontWeight: 800,
                            fontFamily: 'monospace',
                            fontSize: '0.85em',
                            border: '1px solid #bbf7d0',
                            display: 'inline-block',
                            margin: '0 2px'
                        }}
                    >
                        {part}
                    </span>
                );
            }
            return part;
        });
    };

    const hasActiveFilters = searchQuery !== '' || filterStatus !== 'ALL' || filterAccount !== 'ALL' || filterCategory !== 'ALL' || activeSenderFilter !== null;

    const clearFilters = () => {
        setSearchQuery('');
        setFilterStatus('ALL');
        setFilterAccount('ALL');
        setFilterCategory('ALL');
        handleClearSenderFilter();
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

            {/* Header Bar */}
            <div className="glass-panel" style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <span className="badge badge-approved" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Sparkles size={13} />
                            Plug &amp; Sales Meta Templates
                        </span>
                        {lastSyncTime && (
                            <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>
                                Sincronizado: {new Date(lastSyncTime).toLocaleTimeString('pt-BR')}
                            </span>
                        )}
                    </div>
                    <h2 style={{ fontSize: '1.45rem', fontWeight: 900, color: 'var(--text-main)', letterSpacing: '-0.3px' }}>
                        Templates Aprovados &amp; Pendentes
                    </h2>
                    <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                        Monitoramento e gerenciamento oficial de templates WhatsApp via Infobip (BM do Luiz - Oficial).
                    </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    {/* View Switcher */}
                    <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
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
                            Cards WhatsApp
                        </button>
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
                    </div>

                    {/* Export Button */}
                    <button
                        className="btn-secondary"
                        onClick={handleExportExcel}
                        style={{ padding: '8px 14px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                        <Download size={14} />
                        Exportar Excel
                    </button>

                    {/* Sync Button */}
                    <button
                        className="btn-primary"
                        onClick={() => syncTemplates(true)}
                        disabled={isLoading}
                        style={{ padding: '8px 16px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                        <RefreshCw size={14} className={isLoading ? 'spin-animation' : ''} />
                        {isLoading ? 'Sincronizando...' : 'Sincronizar Templates'}
                    </button>
                </div>
            </div>

            {/* Date Range Selector Bar */}
            <div style={{
                background: '#ffffff',
                border: '1px solid var(--border-subtle)',
                borderRadius: '16px',
                padding: '12px 18px',
                boxShadow: 'var(--shadow-card)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Clock size={16} color="var(--primary-color)" />
                    <span style={{ fontSize: '0.82rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-main)' }}>
                        Período dos Templates:
                    </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {[
                        { id: '7days', label: 'Últimos 7 dias (desde 21/09)', badge: 'Solicitado' },
                        { id: '14days', label: 'Últimos 14 dias', badge: null },
                        { id: '30days', label: 'Últimos 30 dias', badge: null },
                        { id: 'all', label: 'Histórico Completo', badge: null }
                    ].map(r => {
                        const isSelected = dateRange === r.id;
                        return (
                            <button
                                key={r.id}
                                onClick={() => setDateRange(r.id as any)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '7px 14px',
                                    borderRadius: '10px',
                                    border: `1.5px solid ${isSelected ? 'var(--primary-color)' : 'var(--border-subtle)'}`,
                                    background: isSelected ? 'var(--primary-light)' : '#ffffff',
                                    color: isSelected ? 'var(--primary-color)' : 'var(--text-muted)',
                                    fontWeight: isSelected ? 800 : 600,
                                    fontSize: '0.8rem',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <span>{r.label}</span>
                                {r.badge && (
                                    <span style={{
                                        background: isSelected ? 'var(--primary-color)' : '#e2e8f0',
                                        color: isSelected ? '#ffffff' : 'var(--text-dim)',
                                        padding: '1px 6px',
                                        borderRadius: '999px',
                                        fontSize: '0.66rem',
                                        fontWeight: 800
                                    }}>
                                        {r.badge}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Metrics HUD Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
                {/* Total */}
                <div className="glass-panel" style={{ padding: '16px 18px', background: '#ffffff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.76rem', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase' }}>
                            Total Listados
                        </span>
                        <div style={{ background: '#f1f5f9', padding: '6px', borderRadius: '8px', color: 'var(--text-muted)' }}>
                            <FileText size={16} />
                        </div>
                    </div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--text-main)' }}>
                        {metrics.total}
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                        Templates recentes no período
                    </span>
                </div>

                {/* Aprovados */}
                <div className="glass-panel" style={{ padding: '16px 18px', background: '#ffffff', borderLeft: '4px solid #10b981' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.76rem', color: '#059669', fontWeight: 700, textTransform: 'uppercase' }}>
                            Aprovados (APPROVED)
                        </span>
                        <div style={{ background: '#ecfdf5', padding: '6px', borderRadius: '8px', color: '#059669' }}>
                            <CheckCircle2 size={16} />
                        </div>
                    </div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#059669' }}>
                        {metrics.approved}
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                        {metrics.total > 0 ? `${((metrics.approved / metrics.total) * 100).toFixed(0)}% de aprovação` : '0%'}
                    </span>
                </div>

                {/* Pendentes */}
                <div className="glass-panel" style={{ padding: '16px 18px', background: '#ffffff', borderLeft: '4px solid #f59e0b' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.76rem', color: '#b45309', fontWeight: 700, textTransform: 'uppercase' }}>
                            Pendentes (PENDING)
                        </span>
                        <div style={{ background: '#fffbeb', padding: '6px', borderRadius: '8px', color: '#b45309' }}>
                            <Clock size={16} />
                        </div>
                    </div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#b45309' }}>
                        {metrics.pending}
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                        Em análise pela Meta
                    </span>
                </div>

                {/* Rejeitados / Outros */}
                <div className="glass-panel" style={{ padding: '16px 18px', background: '#ffffff', borderLeft: '4px solid #ef4444' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.76rem', color: '#dc2626', fontWeight: 700, textTransform: 'uppercase' }}>
                            Rejeitados / Pausados
                        </span>
                        <div style={{ background: '#fef2f2', padding: '6px', borderRadius: '8px', color: '#dc2626' }}>
                            <AlertTriangle size={16} />
                        </div>
                    </div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#dc2626' }}>
                        {metrics.rejected}
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                        Recusados ou desativados
                    </span>
                </div>

                {/* Categorias */}
                <div className="glass-panel" style={{ padding: '16px 18px', background: '#ffffff', borderLeft: '4px solid #3b82f6' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.76rem', color: '#2563eb', fontWeight: 700, textTransform: 'uppercase' }}>
                            Utilidade vs Marketing
                        </span>
                        <div style={{ background: '#eff6ff', padding: '6px', borderRadius: '8px', color: '#2563eb' }}>
                            <Tag size={16} />
                        </div>
                    </div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--text-main)' }}>
                        {metrics.utility} <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-dim)' }}>Util /</span> {metrics.marketing} <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-dim)' }}>Mkt</span>
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                        Classificação de conteúdo Meta
                    </span>
                </div>
            </div>

            {/* DEDICATED SENDER SEARCH BAR (Pesquisa Separada por Número Remetente) */}
            <div className="glass-panel" style={{
                padding: '20px 22px',
                background: 'linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)',
                border: '1.5px solid #86efac',
                borderRadius: '16px',
                boxShadow: '0 4px 15px -3px rgba(22, 163, 74, 0.08)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ background: '#dcfce7', padding: '8px', borderRadius: '10px', color: '#16a34a', display: 'flex' }}>
                            <Smartphone size={20} />
                        </div>
                        <div>
                            <h4 style={{ fontSize: '0.98rem', fontWeight: 800, color: '#14532d', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                Pesquisar Templates por Número Remetente WhatsApp (BM do Luiz)
                                <span style={{ fontSize: '0.7rem', background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>
                                    Busca Direta Meta
                                </span>
                            </h4>
                            <p style={{ fontSize: '0.78rem', color: '#166534', margin: '2px 0 0 0' }}>
                                Digite o número WhatsApp vinculado para consultar e filtrar imediatamente os templates aprovados pela Meta.
                            </p>
                        </div>
                    </div>

                    {/* Quick Example Chip */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#166534' }}>
                            Exemplo rápido ativo:
                        </span>
                        <button
                            type="button"
                            onClick={() => handleSearchSender('+1 555-932-1381')}
                            style={{
                                background: '#ffffff',
                                border: '1.5px solid #22c55e',
                                color: '#15803d',
                                padding: '6px 12px',
                                borderRadius: '20px',
                                fontSize: '0.78rem',
                                fontWeight: 800,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                boxShadow: '0 2px 5px rgba(34, 197, 94, 0.15)',
                                transition: 'all 0.15s ease'
                            }}
                            title="Carregar templates criados para +1 555-932-1381 (ivo_01 a ivo_04)"
                        >
                            <span>⚡ +1 555-932-1381</span>
                            <span style={{ fontSize: '0.68rem', background: '#dcfce7', padding: '1px 6px', borderRadius: '10px' }}>Exemplo Ativo</span>
                        </button>
                    </div>
                </div>

                {/* Sender Search Input & Action Controls */}
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative', flex: 1, minWidth: '280px' }}>
                        <Smartphone size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#16a34a' }} />
                        <input
                            type="text"
                            placeholder="Digite o número WhatsApp (ex: +1 555-932-1381 ou 5511...)"
                            value={senderSearchInput}
                            onChange={(e) => setSenderSearchInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleSearchSender(); }}
                            className="input-field"
                            style={{ paddingLeft: '38px', height: '42px', fontSize: '0.86rem', borderColor: '#86efac', background: '#ffffff' }}
                        />
                    </div>

                    <button
                        onClick={() => handleSearchSender()}
                        disabled={isSearchingSender}
                        className="btn-primary"
                        style={{
                            height: '42px',
                            padding: '0 20px',
                            fontSize: '0.84rem',
                            fontWeight: 800,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            background: '#16a34a',
                            borderColor: '#15803d'
                        }}
                    >
                        {isSearchingSender ? (
                            <>
                                <RefreshCw size={14} className="spin-animation" />
                                <span>Buscando na Meta...</span>
                            </>
                        ) : (
                            <>
                                <Search size={15} />
                                <span>Buscar Número</span>
                            </>
                        )}
                    </button>

                    {activeSenderFilter && (
                        <button
                            onClick={handleClearSenderFilter}
                            style={{
                                height: '42px',
                                padding: '0 16px',
                                fontSize: '0.82rem',
                                fontWeight: 700,
                                background: '#ffffff',
                                border: '1px solid #cbd5e1',
                                borderRadius: '8px',
                                color: 'var(--text-main)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}
                        >
                            <X size={14} />
                            <span>Ver Todos os Templates</span>
                        </button>
                    )}
                </div>

                {/* Banner when sender filter is active */}
                {activeSenderFilter && (
                    <div style={{
                        marginTop: '12px',
                        padding: '10px 14px',
                        background: '#dcfce7',
                        border: '1px solid #86efac',
                        borderRadius: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '0.84rem',
                        color: '#15803d',
                        fontWeight: 700
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Smartphone size={15} />
                            <span>Mostrando templates vinculados ao Remetente: <strong>{activeSenderFilter}</strong> ({filteredTemplates.length} encontrados)</span>
                        </div>
                        <button
                            onClick={handleClearSenderFilter}
                            style={{ background: 'none', border: 'none', color: '#15803d', cursor: 'pointer', fontWeight: 800, textDecoration: 'underline', fontSize: '0.8rem' }}
                        >
                            Limpar e ver lista geral
                        </button>
                    </div>
                )}
            </div>

            {/* Smart Filters Bar */}
            <div className="glass-panel" style={{ padding: '18px 20px', background: '#ffffff' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Filter size={16} color="var(--primary-color)" />
                        <span style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Filtros Rápidos &amp; Busca Geral
                        </span>
                    </div>

                    {hasActiveFilters && (
                        <button
                            onClick={clearFilters}
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
                            <span>Limpar Filtros</span>
                        </button>
                    )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                    {/* Search */}
                    <div style={{ position: 'relative' }}>
                        <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                        <input
                            type="text"
                            placeholder="Buscar por nome, texto da mensagem, BM..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="input-field"
                            style={{ paddingLeft: '36px', height: '40px', fontSize: '0.82rem' }}
                        />
                    </div>

                    {/* Status */}
                    <div>
                        <select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            className="input-field"
                            style={{ height: '40px', fontSize: '0.82rem', fontWeight: 600 }}
                        >
                            <option value="ALL">Status: Todos</option>
                            <option value="APPROVED">✅ Aprovados (APPROVED)</option>
                            <option value="PENDING">⏳ Pendentes (PENDING)</option>
                            <option value="REJECTED">🚫 Rejeitados (REJECTED)</option>
                        </select>
                    </div>

                    {/* Account (BM do Luiz only) */}
                    <div>
                        <select
                            value={filterAccount}
                            onChange={(e) => setFilterAccount(e.target.value)}
                            className="input-field"
                            style={{ height: '40px', fontSize: '0.82rem', fontWeight: 600 }}
                        >
                            <option value="ALL">Conta: BM do Luiz (4k3e4p - Oficial)</option>
                        </select>
                    </div>

                    {/* Category */}
                    <div>
                        <select
                            value={filterCategory}
                            onChange={(e) => setFilterCategory(e.target.value)}
                            className="input-field"
                            style={{ height: '40px', fontSize: '0.82rem', fontWeight: 600 }}
                        >
                            <option value="ALL">Categoria: Todas</option>
                            <option value="UTILITY">UTILIDADE (UTILITY)</option>
                            <option value="MARKETING">MARKETING</option>
                            <option value="AUTHENTICATION">AUTENTICAÇÃO</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Template Render: Cards or Table */}
            {isLoading && templates.length === 0 ? (
                <div className="glass-panel" style={{ padding: '60px', textAlign: 'center' }}>
                    <RefreshCw size={36} className="spin-animation" style={{ color: 'var(--primary-color)', margin: '0 auto 16px auto' }} />
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Buscando templates recentes na Infobip...</h3>
                    <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                        Carregando templates criados ou alterados a partir de 21/09/2026.
                    </p>
                </div>
            ) : filteredTemplates.length === 0 ? (
                <div className="glass-panel" style={{ padding: '50px', textAlign: 'center' }}>
                    <MessageSquare size={36} style={{ color: 'var(--text-dim)', margin: '0 auto 12px auto' }} />
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 800 }}>Nenhum template encontrado com esses filtros</h3>
                    <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                        Tente ajustar a busca ou clique para ver o histórico de outros períodos.
                    </p>
                    <button className="btn-secondary" onClick={clearFilters}>
                        Limpar Filtros
                    </button>
                </div>
            ) : viewMode === 'cards' ? (
                /* WHATSAPP CHAT CARDS VIEW */
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '18px' }}>
                    {filteredTemplates.map((t) => {
                        const isApproved = t.status === 'APPROVED';
                        const isPending = t.status === 'PENDING';
                        const isRejected = t.status === 'REJECTED';
                        const headerFormat = t.structure?.header?.format || null;
                        const buttons = t.structure?.buttons || [];

                        return (
                            <div
                                key={t.id || t.name}
                                className="glass-panel"
                                style={{
                                    padding: '0',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    borderRadius: '16px',
                                    overflow: 'hidden',
                                    border: '1px solid var(--border-subtle)',
                                    background: '#ffffff',
                                    boxShadow: 'var(--shadow-card)',
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                {/* Top Header Info */}
                                <div style={{
                                    padding: '14px 16px',
                                    background: '#f8fafc',
                                    borderBottom: '1px solid var(--border-subtle)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: '8px'
                                }}>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px', flexWrap: 'wrap' }}>
                                            <span style={{
                                                background: '#e0f2fe',
                                                color: '#0369a1',
                                                padding: '2px 7px',
                                                borderRadius: '6px',
                                                fontWeight: 800,
                                                fontSize: '0.7rem'
                                            }}>
                                                {t.category}
                                            </span>
                                            <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontWeight: 600 }}>
                                                {t.language}
                                            </span>
                                            {(t._senderFormatted || t._sender) && (
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleSearchSender(t._senderFormatted || t._sender);
                                                    }}
                                                    style={{
                                                        background: '#f0fdf4',
                                                        color: '#15803d',
                                                        border: '1px solid #bbf7d0',
                                                        padding: '2px 6px',
                                                        borderRadius: '6px',
                                                        fontWeight: 800,
                                                        fontSize: '0.68rem',
                                                        cursor: 'pointer',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '3px'
                                                    }}
                                                    title="Clique para filtrar apenas templates deste remetente"
                                                >
                                                    <Smartphone size={10} />
                                                    {t._senderFormatted || t._sender}
                                                </button>
                                            )}
                                        </div>
                                        <h4
                                            style={{
                                                fontSize: '0.94rem',
                                                fontWeight: 800,
                                                color: 'var(--text-main)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px'
                                            }}
                                        >
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '190px' }} title={t.name}>
                                                {t.name}
                                            </span>
                                            <button
                                                onClick={() => handleCopy(t.name, `name_${t.id || t.name}`, 'Nome')}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}
                                                title="Copiar nome do template"
                                            >
                                                {copiedId === `name_${t.id || t.name}` ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
                                            </button>
                                        </h4>
                                    </div>

                                    {/* Status Badge */}
                                    <div>
                                        {isApproved && (
                                            <span className="badge" style={{ background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0' }}>
                                                <CheckCircle2 size={12} style={{ marginRight: '4px', verticalAlign: '-1px' }} />
                                                Aprovado
                                            </span>
                                        )}
                                        {isPending && (
                                            <span className="badge" style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a' }}>
                                                <Clock size={12} style={{ marginRight: '4px', verticalAlign: '-1px' }} />
                                                Pendente
                                            </span>
                                        )}
                                        {isRejected && (
                                            <span className="badge" style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>
                                                <AlertTriangle size={12} style={{ marginRight: '4px', verticalAlign: '-1px' }} />
                                                Rejeitado
                                            </span>
                                        )}
                                        {!isApproved && !isPending && !isRejected && (
                                            <span className="badge" style={{ background: '#f8fafc', color: '#64748b' }}>
                                                {t.status}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* WhatsApp Chat Mockup Body */}
                                <div style={{
                                    padding: '16px',
                                    flex: 1,
                                    background: '#ece5dd', // Real WhatsApp chat wallpaper tint
                                    backgroundImage: 'radial-gradient(#d1d7db 1px, transparent 1px)',
                                    backgroundSize: '16px 16px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'center'
                                }}>
                                    {/* Chat Bubble */}
                                    <div style={{
                                        background: '#ffffff',
                                        borderRadius: '10px 10px 10px 2px',
                                        padding: '12px 14px',
                                        boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '10px',
                                        position: 'relative'
                                    }}>
                                        {/* Header placeholder if media */}
                                        {headerFormat && headerFormat !== 'TEXT' && (
                                            <div style={{
                                                background: '#f1f5f9',
                                                border: '1px dashed #cbd5e1',
                                                borderRadius: '8px',
                                                padding: '16px',
                                                textAlign: 'center',
                                                color: 'var(--text-muted)',
                                                fontSize: '0.78rem',
                                                fontWeight: 700,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '6px'
                                            }}>
                                                <Smartphone size={16} color="var(--primary-color)" />
                                                <span>Cabeçalho de Mídia ({headerFormat})</span>
                                            </div>
                                        )}

                                        {/* Message Body */}
                                        <div style={{
                                            fontSize: '0.84rem',
                                            lineHeight: 1.5,
                                            color: '#111827',
                                            whiteSpace: 'pre-wrap',
                                            wordBreak: 'break-word'
                                        }}>
                                            {renderFormattedBodyText(t.structure?.body?.text || '')}
                                        </div>

                                        {/* Footer text */}
                                        {t.structure?.footer?.text && (
                                            <div style={{ fontSize: '0.72rem', color: '#6b7280', fontStyle: 'italic' }}>
                                                {t.structure.footer.text}
                                            </div>
                                        )}

                                        {/* Timestamp in bubble */}
                                        <div style={{ textAlign: 'right', fontSize: '0.66rem', color: '#9ca3af' }}>
                                            {t.lastUpdatedAt ? new Date(t.lastUpdatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '12:00'}
                                        </div>

                                        {/* Buttons */}
                                        {buttons.length > 0 && (
                                            <div style={{
                                                borderTop: '1px solid #f3f4f6',
                                                paddingTop: '8px',
                                                marginTop: '2px',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '6px'
                                            }}>
                                                {buttons.map((btn, bIdx) => (
                                                    <div
                                                        key={bIdx}
                                                        style={{
                                                            background: '#f9fafb',
                                                            border: '1px solid #e5e7eb',
                                                            borderRadius: '6px',
                                                            padding: '7px 10px',
                                                            textAlign: 'center',
                                                            fontSize: '0.8rem',
                                                            fontWeight: 700,
                                                            color: '#0284c7',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            gap: '6px'
                                                        }}
                                                    >
                                                        <ExternalLink size={13} />
                                                        <span>{btn.text}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Card Footer & Action Buttons */}
                                <div style={{
                                    padding: '12px 16px',
                                    background: '#ffffff',
                                    borderTop: '1px solid var(--border-subtle)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: '10px'
                                }}>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                                        <div>{t.businessName || t._account || 'BM do Luiz'}</div>
                                        {(t._senderFormatted || t._sender) && (
                                            <div style={{ color: '#15803d', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '3px', marginTop: '2px' }}>
                                                <Smartphone size={10} />
                                                <span>Remetente: {t._senderFormatted || t._sender}</span>
                                            </div>
                                        )}
                                        <div>{t.lastUpdatedAt ? `Atualizado: ${new Date(t.lastUpdatedAt).toLocaleDateString('pt-BR')}` : ''}</div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        {onSelectTemplateForDispatch && isApproved && (
                                            <button
                                                onClick={() => onSelectTemplateForDispatch(t.name)}
                                                className="btn-primary"
                                                style={{ padding: '5px 10px', fontSize: '0.74rem', fontWeight: 800 }}
                                                title="Usar este template no Multi-Remetente"
                                            >
                                                Usar no Disparo
                                            </button>
                                        )}
                                        <button
                                            onClick={() => setSelectedTemplateForModal(t)}
                                            className="btn-secondary"
                                            style={{ padding: '5px 8px', fontSize: '0.74rem' }}
                                            title="Ver Detalhes do Template"
                                        >
                                            <Eye size={13} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                /* DETAILED TABLE VIEW */
                <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border-subtle)' }}>
                                    <th style={{ padding: '14px 16px', fontWeight: 800, color: 'var(--text-muted)' }}>Nome do Template</th>
                                    <th style={{ padding: '14px 16px', fontWeight: 800, color: 'var(--text-muted)' }}>Status</th>
                                    <th style={{ padding: '14px 16px', fontWeight: 800, color: 'var(--text-muted)' }}>Categoria</th>
                                    <th style={{ padding: '14px 16px', fontWeight: 800, color: 'var(--text-muted)' }}>Conta/BM</th>
                                    <th style={{ padding: '14px 16px', fontWeight: 800, color: 'var(--text-muted)' }}>Conteúdo da Mensagem</th>
                                    <th style={{ padding: '14px 16px', fontWeight: 800, color: 'var(--text-muted)' }}>Atualizado Em</th>
                                    <th style={{ padding: '14px 16px', fontWeight: 800, color: 'var(--text-muted)', textAlign: 'right' }}>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredTemplates.map((t, idx) => {
                                    return (
                                        <tr
                                            key={t.id || t.name || idx}
                                            style={{
                                                borderBottom: '1px solid #f1f5f9',
                                                background: idx % 2 === 0 ? '#ffffff' : '#fafafa'
                                            }}
                                        >
                                            {/* Nome */}
                                            <td style={{ padding: '12px 16px', fontWeight: 800, color: 'var(--text-main)', whiteSpace: 'nowrap' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <span>{t.name}</span>
                                                    <button
                                                        onClick={() => handleCopy(t.name, `tbl_${t.name}`, 'Nome')}
                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}
                                                    >
                                                        {copiedId === `tbl_${t.name}` ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                                                    </button>
                                                </div>
                                            </td>

                                            {/* Status */}
                                            <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                                                {t.status === 'APPROVED' && (
                                                    <span className="badge" style={{ background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0' }}>
                                                        Aprovado
                                                    </span>
                                                )}
                                                {t.status === 'PENDING' && (
                                                    <span className="badge" style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a' }}>
                                                        Pendente
                                                    </span>
                                                )}
                                                {t.status === 'REJECTED' && (
                                                    <span className="badge" style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>
                                                        Rejeitado
                                                    </span>
                                                )}
                                            </td>

                                            {/* Categoria */}
                                            <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                                                <span style={{
                                                    background: '#f1f5f9',
                                                    color: 'var(--text-muted)',
                                                    padding: '2px 7px',
                                                    borderRadius: '6px',
                                                    fontWeight: 700,
                                                    fontSize: '0.74rem'
                                                }}>
                                                    {t.category}
                                                </span>
                                            </td>

                                            {/* Conta & Remetente */}
                                            <td style={{ padding: '12px 16px', whiteSpace: 'nowrap', color: 'var(--text-main)' }}>
                                                <div>{t.businessName || t._account || 'BM do Luiz'}</div>
                                                {(t._senderFormatted || t._sender) && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSearchSender(t._senderFormatted || t._sender)}
                                                        style={{
                                                            fontSize: '0.72rem',
                                                            color: '#15803d',
                                                            background: '#dcfce7',
                                                            border: '1px solid #bbf7d0',
                                                            padding: '1px 6px',
                                                            borderRadius: '4px',
                                                            fontWeight: 700,
                                                            cursor: 'pointer',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '3px',
                                                            marginTop: '3px'
                                                        }}
                                                        title="Filtrar por este remetente"
                                                    >
                                                        <Smartphone size={10} />
                                                        {t._senderFormatted || t._sender}
                                                    </button>
                                                )}
                                            </td>

                                            {/* Mensagem */}
                                            <td style={{ padding: '12px 16px', maxWidth: '280px' }}>
                                                <span style={{
                                                    display: '-webkit-box',
                                                    WebkitLineClamp: 2,
                                                    WebkitBoxOrient: 'vertical',
                                                    overflow: 'hidden',
                                                    fontSize: '0.78rem',
                                                    color: 'var(--text-muted)'
                                                }}>
                                                    {t.structure?.body?.text || '-'}
                                                </span>
                                            </td>

                                            {/* Data */}
                                            <td style={{ padding: '12px 16px', whiteSpace: 'nowrap', color: 'var(--text-dim)', fontSize: '0.76rem' }}>
                                                {t.lastUpdatedAt ? new Date(t.lastUpdatedAt).toLocaleString('pt-BR') : '-'}
                                            </td>

                                            {/* Ações */}
                                            <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                <div style={{ display: 'inline-flex', gap: '6px' }}>
                                                    {onSelectTemplateForDispatch && t.status === 'APPROVED' && (
                                                        <button
                                                            onClick={() => onSelectTemplateForDispatch(t.name)}
                                                            className="btn-primary"
                                                            style={{ padding: '4px 8px', fontSize: '0.72rem' }}
                                                        >
                                                            Usar
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => setSelectedTemplateForModal(t)}
                                                        className="btn-secondary"
                                                        style={{ padding: '4px 8px', fontSize: '0.72rem' }}
                                                    >
                                                        Detalhes
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Modal: Template Structure Inspection */}
            {selectedTemplateForModal && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(15, 23, 42, 0.65)',
                    backdropFilter: 'blur(4px)',
                    zIndex: 9999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '20px'
                }}>
                    <div style={{
                        background: '#ffffff',
                        borderRadius: '16px',
                        width: '100%',
                        maxWidth: '600px',
                        maxHeight: '90vh',
                        overflowY: 'auto',
                        padding: '24px',
                        boxShadow: 'var(--shadow-float)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <div>
                                <h3 style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--text-main)' }}>
                                    {selectedTemplateForModal.name}
                                </h3>
                                <span style={{ fontSize: '0.76rem', color: 'var(--text-dim)' }}>
                                    ID: {selectedTemplateForModal.id || 'N/A'} • {selectedTemplateForModal.language}
                                </span>
                            </div>
                            <button
                                onClick={() => setSelectedTemplateForModal(null)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', display: 'block', fontWeight: 700 }}>
                                    CONTEÚDO DA MENSAGEM
                                </span>
                                <p style={{ fontSize: '0.86rem', color: 'var(--text-main)', whiteSpace: 'pre-wrap', marginTop: '6px', lineHeight: 1.5 }}>
                                    {selectedTemplateForModal.structure?.body?.text}
                                </p>
                            </div>

                            {selectedTemplateForModal.structure?.body?.examples && (
                                <div style={{ background: '#ecfdf5', padding: '12px 14px', borderRadius: '10px', border: '1px solid #a7f3d0' }}>
                                    <span style={{ fontSize: '0.72rem', color: '#047857', display: 'block', fontWeight: 700 }}>
                                        {'EXEMPLOS DE VARIÁVEIS ({{1}}, {{2}}...)'}
                                    </span>
                                    <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        {selectedTemplateForModal.structure.body.examples.map((ex: string, eIdx: number) => (
                                            <div key={eIdx} style={{ fontSize: '0.78rem', color: '#065f46' }}>
                                                <strong>{`{{${eIdx + 1}}}`}:</strong> {ex}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {selectedTemplateForModal.structure?.buttons && selectedTemplateForModal.structure.buttons.length > 0 && (
                                <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', display: 'block', fontWeight: 700 }}>
                                        BOTÕES CONFIGURADOS
                                    </span>
                                    <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        {selectedTemplateForModal.structure.buttons.map((b, idx) => (
                                            <div key={idx} style={{ fontSize: '0.8rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <ExternalLink size={13} color="var(--primary-color)" />
                                                <strong>{b.text}:</strong> {b.url || b.type}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                                <button
                                    onClick={() => handleCopy(selectedTemplateForModal.structure?.body?.text || '', 'modal_txt', 'Texto da Mensagem')}
                                    className="btn-secondary"
                                >
                                    Copiar Texto
                                </button>
                                {onSelectTemplateForDispatch && selectedTemplateForModal.status === 'APPROVED' && (
                                    <button
                                        onClick={() => {
                                            onSelectTemplateForDispatch(selectedTemplateForModal.name);
                                            setSelectedTemplateForModal(null);
                                        }}
                                        className="btn-primary"
                                    >
                                        Usar no Disparo
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
export default TemplateGallery;
