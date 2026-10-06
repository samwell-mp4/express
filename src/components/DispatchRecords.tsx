import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
    Activity, CheckCircle2, Clock, AlertTriangle, RefreshCw, 
    Search, Filter, Smartphone, Trash2, ArrowUpRight, Send, Check, 
    Radio, ShieldCheck, Download, ExternalLink, Zap, Copy, X, Info, 
    FileText, Layers, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
    Calendar, FileSpreadsheet, Eye, Sparkles,
    CheckCheck, BarChart3, ArrowLeft, Pause, Play
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { DispatchRecord } from '../types';
import { api, parseInfobipErrorDiagnostic, DiagnosticError } from '../services/api';

interface CampaignGroup {
    id: string;
    name: string;
    listName: string;
    senderNumber: string;
    senderNumbers: string[];
    templateName: string;
    mediaUrl: string;
    headerType: string;
    createdAt: string;
    total: number;
    delivered: number;
    pending: number;
    failed: number;
    deliveryRate: number;
    records: DispatchRecord[];
}

export const DispatchRecords: React.FC = () => {
    const [records, setRecords] = useState<DispatchRecord[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'DELIVERED' | 'SENT' | 'FAILED'>('ALL');
    const timerRef = useRef<any>(null);

    // View Mode: 'CAMPAIGNS' (Agrupamento por Campanha - Estilo Infobip) | 'REALTIME' (Log Linha a Linha)
    const [viewMode, setViewMode] = useState<'CAMPAIGNS' | 'REALTIME'>('CAMPAIGNS');

    // Campanha Selecionada para a Visualização Individual (Imagem 2)
    const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);

    // Sincronização de Entrega Infobip (DLR)
    const [isSyncingInfobip, setIsSyncingInfobip] = useState(false);
    const [syncBanner, setSyncBanner] = useState<string | null>(null);

    // Modal de Log de Falha
    const [selectedRecordForLog, setSelectedRecordForLog] = useState<DispatchRecord | null>(null);
    const [copiedLog, setCopiedLog] = useState(false);

    // Hover Tooltip State
    const [hoveredRecordId, setHoveredRecordId] = useState<string | null>(null);
    const [pausedCampaignIds, setPausedCampaignIds] = useState<Set<string>>(new Set());

    // Estado de Limpeza e Paginação
    const [isClearingLogs, setIsClearingLogs] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);

    const pollCountRef = useRef(0);

    const handleTogglePauseCampaign = async (campaignId: string, campaignName?: string) => {
        const isPaused = pausedCampaignIds.has(campaignId) || (campaignName ? pausedCampaignIds.has(campaignName) : false);
        try {
            if (isPaused) {
                await api.resumeCampaign(campaignId, campaignName);
                setPausedCampaignIds(prev => {
                    const next = new Set(prev);
                    next.delete(campaignId);
                    if (campaignName) next.delete(campaignName);
                    return next;
                });
            } else {
                await api.pauseCampaign(campaignId, campaignName);
                setPausedCampaignIds(prev => {
                    const next = new Set(prev);
                    next.add(campaignId);
                    if (campaignName) next.add(campaignName);
                    return next;
                });
            }
        } catch (err: any) {
            alert(`Erro ao alterar status de pausa da campanha: ${err.message}`);
        }
    };

    // Initial load & Polling
    useEffect(() => {
        loadRecords(true);

        if (autoRefresh) {
            timerRef.current = setInterval(() => loadRecords(false), 3000);
        }

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [autoRefresh]);

    const loadRecords = async (triggerDlrImmediate = false) => {
        try {
            pollCountRef.current++;
            // Sincroniza DLR com a Infobip imediatamente na carga ou a cada 2 ciclos (6s)
            if (triggerDlrImmediate || (pollCountRef.current % 2 === 0)) {
                await api.syncDeliveryReports().catch(() => {});
            }

            try {
                const pausedList = await api.getPausedCampaigns();
                setPausedCampaignIds(new Set(pausedList));
            } catch {}

            // 1. Logs oficiais do servidor (Postgres + Redis com relatórios da Infobip)
            const serverLogs = await api.getDispatchLogs();
            
            // 2. Registros locais temporários
            const localRaw = localStorage.getItem('express_live_dispatch_records');
            const localLogs: DispatchRecord[] = localRaw ? JSON.parse(localRaw) : [];

            // Se o servidor já gravou os logs, removemos os placeholders locais para não duplicar
            // nem deixar mensagens antigas presas em "Enviado"
            const serverRecipientSet = new Set(serverLogs.map(s => s.recipient));
            const pendingLocalLogs = localLogs.filter(l => !serverRecipientSet.has(l.recipient));

            if (pendingLocalLogs.length !== localLogs.length) {
                localStorage.setItem('express_live_dispatch_records', JSON.stringify(pendingLocalLogs));
            }

            // Unificação oficial
            const sorted = [...serverLogs, ...pendingLocalLogs].sort((a, b) => 
                new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            );

            setRecords(sorted);
        } catch (e) {
            console.warn('Erro ao atualizar registros:', e);
        }
    };

    // Sincronização ativa dos relatórios de entrega (DLR) diretamente da Infobip
    const handleSyncInfobipDlr = async () => {
        setIsSyncingInfobip(true);
        setSyncBanner(null);
        try {
            // Limpa placeholders locais para prevalecerem os dados oficiais da Infobip
            localStorage.removeItem('express_live_dispatch_records');
            const res = await api.syncDeliveryReports();
            await loadRecords();
            if (res.updated > 0) {
                setSyncBanner(`✓ Sincronização concluída! ${res.updated} status de entrega/rejeição atualizados via Infobip.`);
            } else {
                setSyncBanner(`✓ Conexão Infobip OK (${res.synced} relatórios checados). Todos os status estão sincronizados.`);
            }
            setTimeout(() => setSyncBanner(null), 5000);
        } catch (err: any) {
            setSyncBanner(`Aviso ao sincronizar: ${err.message || 'Falha na comunicação'}`);
        } finally {
            setIsSyncingInfobip(false);
        }
    };

    const handleClearLogs = async () => {
        if (!window.confirm('Deseja realmente limpar todos os registros e logs de envios (do servidor e da tela)? Esta ação apagará permanentemente o histórico no Redis e banco de dados.')) return;
        setIsClearingLogs(true);
        try {
            await api.clearDispatchLogs();
            localStorage.removeItem('express_live_dispatch_records');
            setRecords([]);
            setSelectedCampaignId(null);
            setCurrentPage(1);
        } catch (err: any) {
            console.error('Falha ao limpar logs no servidor:', err);
            localStorage.removeItem('express_live_dispatch_records');
            setRecords([]);
            setSelectedCampaignId(null);
            setCurrentPage(1);
            alert(`Aviso ao limpar logs: ${err.message || 'Erro na comunicação com o servidor'}`);
        } finally {
            setIsClearingLogs(false);
        }
    };

    const handleCopyLog = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopiedLog(true);
        setTimeout(() => setCopiedLog(false), 2000);
    };

    // Agrupamento por Campanha - Separação estrita de lotes/campanhas
    const campaigns: CampaignGroup[] = useMemo(() => {
        const map = new Map<string, DispatchRecord[]>();

        records.forEach(r => {
            // Se tem campaignId específico do lote, usa ele como chave única
            // Se não tem, agrupa por nome + cluster de tempo para nunca juntar campanhas distintas
            let groupKey = r.campaignId;
            if (!groupKey) {
                const timeCluster = r.timestamp ? r.timestamp.slice(0, 14) : 'legacy';
                groupKey = `${r.campaignName || 'Campanha'}_${timeCluster}`;
            }
            if (!map.has(groupKey)) map.set(groupKey, []);
            map.get(groupKey)!.push(r);
        });

        const list: CampaignGroup[] = [];
        map.forEach((recs, groupId) => {
            const total = recs.length;
            const delivered = recs.filter(r => r.status === 'DELIVERED').length;
            const failed = recs.filter(r => r.status === 'FAILED').length;
            const pending = total - delivered - failed;
            const deliveryRate = total > 0 ? Math.round((delivered / total) * 100) : 0;
            
            const first = recs[0];
            // Identifica TODOS os números de remetentes distintos usados nessa transmissão
            const allSenders = Array.from(new Set(recs.map(r => r.senderNumber).filter(Boolean)));

            list.push({
                id: groupId,
                name: first.campaignName || 'Campanha_Principal',
                listName: first.listName || 'Lista_Principal',
                senderNumber: allSenders[0] || first.senderNumber || '',
                senderNumbers: allSenders,
                templateName: first.templateName,
                mediaUrl: first.mediaUrl || '',
                headerType: first.headerType || 'NONE',
                createdAt: first.timestamp,
                total,
                delivered,
                pending: Math.max(0, pending),
                failed,
                deliveryRate,
                records: recs
            });
        });

        return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [records]);

    // Campanha atualmente aberta para detalhamento individual (Imagem 2)
    const activeCampaign = useMemo(() => {
        if (!selectedCampaignId) return null;
        return campaigns.find(c => c.id === selectedCampaignId) || null;
    }, [campaigns, selectedCampaignId]);

    // Exportação Completa de Relatório XLS / CSV no Padrão Infobip (Imagem 3)
    const handleExportDetailedReport = (campaign: CampaignGroup, format: 'xlsx' | 'csv' = 'xlsx') => {
        const formatDate = (dateStr?: string) => {
            if (!dateStr) return '';
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return dateStr;
            const pad = (n: number) => String(n).padStart(2, '0');
            return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        };

        const rows = campaign.records.map((r, idx) => {
            const sendDate = r.timestamp ? new Date(r.timestamp) : new Date();
            const doneDate = r.doneAt ? new Date(r.doneAt) : (r.status === 'DELIVERED' ? new Date(sendDate.getTime() + 11000) : null);

            const isDelivered = r.status === 'DELIVERED';
            const isFailed = r.status === 'FAILED';
            const operator = r.operator || api.detectOperator(r.recipient);

            return {
                'Account Name': 'Plug e Sale API',
                'Traffic Source': 'API',
                'Communication Name': campaign.name,
                'Communication Type': 'WhatsApp',
                'Communication Subtype': 'MEDIA_TEMPLATE',
                'Communication Protocol': 'INFOBIP_API',
                'From': r.senderNumber,
                'To': r.recipient,
                'Message ID': r.messageId || r.transmissionId || `E_${Math.random().toString(36).slice(2, 9)}`,
                'Send At': formatDate(r.timestamp),
                'Country Prefix': '55',
                'Country Name': 'Brazil',
                'Network Name': operator,
                'Purchase Price': r.price !== undefined ? r.price : 0,
                'Status': isDelivered ? 'Delivered' : (isFailed ? 'Failed' : 'Sent'),
                'Reason': isDelivered ? 'DELIVERED_TO_HANDSET' : (isFailed ? (r.errorReason || 'REJECTED') : 'SENT_TO_NETWORK'),
                'Action': '',
                'Error Group': isDelivered ? 'No Errors' : (isFailed ? 'HANDSET_ERRORS' : 'No Errors'),
                'Error Name': isDelivered ? 'No Error (code 0)' : (isFailed ? (r.errorReason || 'Undeliverable') : 'No Error (code 0)'),
                'Done At': doneDate ? formatDate(doneDate.toISOString()) : '',
                'Text': `MEDIA_TEMPLATE - ${r.templateName || campaign.templateName || 'template'}`,
                'Messages Count': 1,
                'Service Name': 'WhatsApp Business'
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(rows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Relatório Transmissão');

        const cleanName = campaign.name.replace(/[^a-zA-Z0-9_-]/g, '_');
        const fileName = `Relatorio_${cleanName}_${new Date().toISOString().slice(0, 10)}.${format}`;

        if (format === 'xlsx') {
            XLSX.writeFile(workbook, fileName);
        } else {
            const csvOutput = XLSX.write(workbook, { bookType: 'csv', type: 'array' });
            const blob = new Blob([csvOutput], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    };

    // Filtered records for Realtime Log
    const filteredRecords = records.filter(r => {
        const matchesStatus = statusFilter === 'ALL' || r.status === statusFilter;
        const q = searchQuery.toLowerCase().trim();
        const matchesSearch = !q || 
            r.recipient.toLowerCase().includes(q) || 
            r.senderNumber.toLowerCase().includes(q) || 
            r.templateName.toLowerCase().includes(q) ||
            (r.campaignName && r.campaignName.toLowerCase().includes(q)) ||
            (r.messageId && r.messageId.toLowerCase().includes(q));
        return matchesStatus && matchesSearch;
    });

    // Resetar para página 1 sempre que os filtros mudarem
    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, statusFilter]);

    // Cálculo de Paginação para o Log em Tempo Real
    const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));

    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [totalPages, currentPage]);

    const paginatedRecords = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return filteredRecords.slice(start, start + pageSize);
    }, [filteredRecords, currentPage, pageSize]);

    // Metrics Calculations
    const totalCount = records.length;
    const deliveredCount = records.filter(r => r.status === 'DELIVERED').length;
    const sentCount = records.filter(r => r.status === 'SENT').length;
    const failedCount = records.filter(r => r.status === 'FAILED').length;
    const successRate = totalCount > 0 
        ? Math.round(((deliveredCount + sentCount) / totalCount) * 100) 
        : 100;
    const deliveredRate = totalCount > 0 
        ? Math.round((deliveredCount / totalCount) * 100) 
        : 0;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Sync Alert Banner */}
            {syncBanner && (
                <div style={{
                    background: '#ecfdf5',
                    border: '1px solid #a7f3d0',
                    color: '#065f46',
                    padding: '10px 16px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '13px',
                    fontWeight: 500,
                    boxShadow: 'var(--shadow-subtle)'
                }}>
                    <CheckCircle2 size={16} color="#059669" />
                    <span>{syncBanner}</span>
                </div>
            )}

            {/* TOP BAR: View Switcher (Campanhas vs Logs) & Controls */}
            <div style={{
                background: '#FFFFFF',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '14px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px'
            }}>
                {/* Left: View Mode Toggle Tabs */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                        display: 'inline-flex',
                        background: '#f1f5f9',
                        padding: '3px',
                        borderRadius: '6px',
                        border: '1px solid #e2e8f0'
                    }}>
                        <button
                            type="button"
                            onClick={() => {
                                setViewMode('CAMPAIGNS');
                                setSelectedCampaignId(null);
                            }}
                            style={{
                                border: 'none',
                                background: viewMode === 'CAMPAIGNS' && !selectedCampaignId ? '#ffffff' : 'transparent',
                                color: viewMode === 'CAMPAIGNS' && !selectedCampaignId ? 'var(--primary-color)' : 'var(--text-muted)',
                                fontWeight: viewMode === 'CAMPAIGNS' && !selectedCampaignId ? 600 : 500,
                                padding: '6px 14px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '13px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                boxShadow: viewMode === 'CAMPAIGNS' && !selectedCampaignId ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <BarChart3 size={15} />
                            Relatórios por Campanha
                            <span style={{
                                background: viewMode === 'CAMPAIGNS' ? '#ecfdf5' : '#e2e8f0',
                                color: viewMode === 'CAMPAIGNS' ? '#059669' : '#64748b',
                                fontSize: '11px',
                                padding: '1px 6px',
                                borderRadius: '10px',
                                fontWeight: 700
                            }}>
                                {campaigns.length}
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                setViewMode('REALTIME');
                                setSelectedCampaignId(null);
                            }}
                            style={{
                                border: 'none',
                                background: viewMode === 'REALTIME' ? '#ffffff' : 'transparent',
                                color: viewMode === 'REALTIME' ? 'var(--primary-color)' : 'var(--text-muted)',
                                fontWeight: viewMode === 'REALTIME' ? 600 : 500,
                                padding: '6px 14px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '13px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                boxShadow: viewMode === 'REALTIME' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <Radio size={14} />
                            Log em Tempo Real
                            <span style={{
                                background: viewMode === 'REALTIME' ? '#ecfdf5' : '#e2e8f0',
                                color: viewMode === 'REALTIME' ? '#059669' : '#64748b',
                                fontSize: '11px',
                                padding: '1px 6px',
                                borderRadius: '10px',
                                fontWeight: 700
                            }}>
                                {records.length}
                            </span>
                        </button>
                    </div>

                    {/* Badge Ao Vivo */}
                    <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        background: autoRefresh ? '#ECFDF5' : '#F3F4F6',
                        color: autoRefresh ? '#065F46' : '#6B7280',
                        border: `1px solid ${autoRefresh ? '#A7F3D0' : '#E5E7EB'}`,
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '11.5px',
                        fontWeight: 600
                    }}>
                        <span style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: autoRefresh ? '#10B981' : '#9CA3AF'
                        }} />
                        {autoRefresh ? 'Ao Vivo (3s)' : 'Pausado'}
                    </span>
                </div>

                {/* Right: Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {/* Botão Sincronizar DLR da Infobip */}
                    <button
                        type="button"
                        className="btn-secondary"
                        onClick={handleSyncInfobipDlr}
                        disabled={isSyncingInfobip}
                        style={{
                            height: '34px',
                            fontSize: '12.5px',
                            padding: '0 12px',
                            borderRadius: '6px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            color: '#0369a1',
                            borderColor: '#bae6fd',
                            background: '#f0f9ff'
                        }}
                        title="Busca relatórios de entrega (Delivered) na API da Infobip"
                    >
                        <RefreshCw size={13} className={isSyncingInfobip ? 'animate-spin' : ''} />
                        {isSyncingInfobip ? 'Sincronizando Infobip...' : 'Sincronizar Infobip (DLR)'}
                    </button>

                    <button
                        className="btn-secondary"
                        onClick={() => setAutoRefresh(!autoRefresh)}
                        style={{ height: '34px', fontSize: '12px', padding: '0 10px', borderRadius: '6px' }}
                        title="Pausa ou retoma a atualização automática dos registros na tela a cada 3 segundos"
                    >
                        {autoRefresh ? 'Pausar Atualização (3s)' : 'Retomar Atualização'}
                    </button>

                    {records.length > 0 && (
                        <button
                            type="button"
                            onClick={handleClearLogs}
                            disabled={isClearingLogs}
                            style={{
                                height: '34px',
                                background: '#FEF2F2',
                                border: '1px solid #FECACA',
                                color: '#DC2626',
                                padding: '0 10px',
                                borderRadius: '6px',
                                cursor: isClearingLogs ? 'not-allowed' : 'pointer',
                                fontSize: '12.5px',
                                fontWeight: 500,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                opacity: isClearingLogs ? 0.6 : 1
                            }}
                            title="Limpar todos os registros e logs de envios permanentemente do servidor e da tela"
                        >
                            <Trash2 size={13} className={isClearingLogs ? 'animate-spin' : ''} />
                            {isClearingLogs ? 'Limpando...' : 'Limpar'}
                        </button>
                    )}
                </div>
            </div>

            {/* ============================================================ */}
            {/* MODO 1: DETALHAMENTO INDIVIDUAL DA CAMPANHA (EXATO IMAGEM 2) */}
            {/* ============================================================ */}
            {activeCampaign && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Header da Transmissão Individual */}
                    <div style={{
                        background: '#ffffff',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '8px',
                        padding: '16px 20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '14px'
                    }}>
                        <div>
                            {/* Voltar para todas as transmissões */}
                            <button
                                type="button"
                                onClick={() => setSelectedCampaignId(null)}
                                style={{
                                    border: 'none',
                                    background: 'none',
                                    color: '#0284c7',
                                    fontSize: '12.5px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    padding: 0,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    marginBottom: '6px'
                                }}
                            >
                                <ArrowLeft size={14} />
                                TODAS AS TRANSMISSÕES
                            </button>

                            <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-main)', margin: '0 0 4px 0', letterSpacing: '-0.02em' }}>
                                {activeCampaign.name}
                            </h1>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-muted)' }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#25D366', fontWeight: 600 }}>
                                    <Smartphone size={14} /> WhatsApp
                                </span>
                                <span>•</span>
                                {(pausedCampaignIds.has(activeCampaign.id) || pausedCampaignIds.has(activeCampaign.name)) ? (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#b45309', background: '#fef3c7', padding: '2px 8px', borderRadius: '4px', fontWeight: 700, fontSize: '12px' }}>
                                        <Pause size={13} /> PAUSADA
                                    </span>
                                ) : (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#059669', fontWeight: 600 }}>
                                        <CheckCircle2 size={14} /> {activeCampaign.pending === 0 ? 'Terminado' : 'Em Andamento'}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Botões de Ação Topo Direito (Imagem 2) */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            {/* PAUSAR / RETOMAR CAMPANHA INDIVIDUAL */}
                            {(pausedCampaignIds.has(activeCampaign.id) || pausedCampaignIds.has(activeCampaign.name)) ? (
                                <button
                                    type="button"
                                    className="btn-primary"
                                    onClick={() => handleTogglePauseCampaign(activeCampaign.id, activeCampaign.name)}
                                    style={{
                                        height: '36px',
                                        padding: '0 14px',
                                        fontSize: '12.5px',
                                        fontWeight: 600,
                                        borderRadius: '6px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        background: '#16a34a',
                                        borderColor: '#16a34a'
                                    }}
                                    title="Retomar o disparo dos contatos desta campanha"
                                >
                                    <Play size={14} />
                                    RETOMAR CAMPANHA
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={() => handleTogglePauseCampaign(activeCampaign.id, activeCampaign.name)}
                                    style={{
                                        height: '36px',
                                        padding: '0 14px',
                                        fontSize: '12.5px',
                                        fontWeight: 600,
                                        borderRadius: '6px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        color: '#b45309',
                                        background: '#fef3c7',
                                        border: '1px solid #fde68a'
                                    }}
                                    title="Pausar o envio dos contatos desta campanha individual"
                                >
                                    <Pause size={14} />
                                    PAUSAR CAMPANHA
                                </button>
                            )}

                            {/* OBTER RELATÓRIO (Gera o XLS/CSV da Imagem 3) */}
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => handleExportDetailedReport(activeCampaign, 'xlsx')}
                                style={{
                                    height: '36px',
                                    padding: '0 14px',
                                    fontSize: '12.5px',
                                    fontWeight: 600,
                                    borderRadius: '6px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    color: '#0f172a',
                                    background: '#ffffff',
                                    border: '1px solid #cbd5e1'
                                }}
                                title="Baixar relatório detalhado dos números entregues/não entregues (Estilo XLS Imagem 3)"
                            >
                                <Download size={14} />
                                OBTER RELATÓRIO
                            </button>

                            {/* DUPLICAR */}
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => alert(`Campanha "${activeCampaign.name}" pronta para reutilização de contatos.`)}
                                style={{
                                    height: '36px',
                                    padding: '0 14px',
                                    fontSize: '12.5px',
                                    fontWeight: 600,
                                    borderRadius: '6px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                            >
                                DUPLICAR
                            </button>

                            {/* VISUALIZAR ESTATÍSTICAS / SINCRONIZAR */}
                            <button
                                type="button"
                                className="btn-primary"
                                onClick={handleSyncInfobipDlr}
                                style={{
                                    height: '36px',
                                    padding: '0 16px',
                                    fontSize: '12.5px',
                                    fontWeight: 600,
                                    borderRadius: '6px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                            >
                                <RefreshCw size={14} className={isSyncingInfobip ? 'animate-spin' : ''} />
                                VISUALIZAR ESTATÍSTICAS
                            </button>
                        </div>
                    </div>

                    {/* GRID DE DUAS COLUNAS (Esquerda: Relatórios / Direita: Simulador WhatsApp) */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(400px, 1.8fr) minmax(320px, 1fr)', gap: '20px', alignItems: 'start' }}>
                        
                        {/* COLUNA ESQUERDA: RESUMOS E TABELA DE NÚMEROS */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                            
                            {/* Card 1: Resumo das Estimativas (Imagem 2) */}
                            <div style={{ background: '#ffffff', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '16px 20px' }}>
                                <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-main)', margin: '0 0 14px 0' }}>
                                    Resumo das estimativas
                                </h3>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', borderBottom: '1px solid #f1f5f9', paddingBottom: '14px' }}>
                                    {/* Enviadas */}
                                    <div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                                            Enviadas <Info size={11} color="#94a3b8" />
                                        </div>
                                        <strong style={{ fontSize: '24px', fontWeight: 600, color: 'var(--text-main)' }}>
                                            {activeCampaign.total}
                                        </strong>
                                    </div>

                                    {/* Entregues (Handset) */}
                                    <div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                                            Entregues <Info size={11} color="#94a3b8" />
                                        </div>
                                        <strong style={{ fontSize: '24px', fontWeight: 600, color: '#16a34a' }}>
                                            {activeCampaign.delivered}
                                        </strong>
                                    </div>

                                    {/* Não Entregues (Falhas / Spam / Rejeições) */}
                                    <div>
                                        <div style={{ fontSize: '12px', color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px', fontWeight: 500 }}>
                                            Não Entregues <Info size={11} color="#ef4444" />
                                        </div>
                                        <strong style={{ fontSize: '24px', fontWeight: 600, color: '#dc2626' }}>
                                            {activeCampaign.failed}
                                        </strong>
                                    </div>

                                    {/* Pendentes (Em rota) */}
                                    <div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                                            Pendentes <Info size={11} color="#94a3b8" />
                                        </div>
                                        <strong style={{ fontSize: '24px', fontWeight: 600, color: '#2563eb' }}>
                                            {activeCampaign.pending}
                                        </strong>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '14px', flexWrap: 'wrap', gap: '10px' }}>
                                    <div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                                            Taxa de entrega (Handset) <Info size={11} color="#94a3b8" />
                                        </div>
                                        <strong style={{ fontSize: '24px', fontWeight: 600, color: activeCampaign.deliveryRate >= 70 ? '#16a34a' : '#ea580c' }}>
                                            {activeCampaign.deliveryRate}%
                                        </strong>
                                    </div>

                                    {/* Barra de comparação Entregues vs Não Entregues */}
                                    <div style={{ minWidth: '190px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                                            <span style={{ color: '#16a34a', fontWeight: 600 }}>{activeCampaign.delivered} entregues</span>
                                            <span style={{ color: '#dc2626', fontWeight: 600 }}>{activeCampaign.failed} não entregues</span>
                                        </div>
                                        <div style={{ height: '6px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden', display: 'flex' }}>
                                            <div style={{ height: '100%', width: `${activeCampaign.total > 0 ? (activeCampaign.delivered / activeCampaign.total) * 100 : 0}%`, background: '#16a34a' }} />
                                            <div style={{ height: '100%', width: `${activeCampaign.total > 0 ? (activeCampaign.failed / activeCampaign.total) * 100 : 0}%`, background: '#dc2626' }} />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Card 2: Resumo da Transmissão (Imagem 2) */}
                            <div style={{ background: '#ffffff', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '16px 20px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                                    <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>
                                        Resumo da transmissão
                                    </h3>
                                    <span style={{ fontSize: '12px', color: '#0284c7', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                        Saiba mais <ExternalLink size={11} />
                                    </span>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
                                    {/* Lista de Destinatários */}
                                    <div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                                            <FileSpreadsheet size={13} /> Lista de destinatários <Info size={11} color="#94a3b8" />
                                        </div>
                                        <span style={{
                                            background: '#f1f5f9',
                                            border: '1px solid #cbd5e1',
                                            padding: '2px 8px',
                                            borderRadius: '4px',
                                            fontSize: '12px',
                                            fontFamily: 'monospace',
                                            color: '#334155'
                                        }}>
                                            {activeCampaign.listName}
                                        </span>
                                    </div>

                                    {/* Remetente(s) */}
                                    <div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                                            <Radio size={13} /> {activeCampaign.senderNumbers.length > 1 ? `Remetentes (${activeCampaign.senderNumbers.length})` : 'Remetente'}
                                        </div>
                                        {activeCampaign.senderNumbers.length > 1 ? (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxWidth: '380px' }}>
                                                {activeCampaign.senderNumbers.map((num, sIdx) => {
                                                    const countForNum = activeCampaign.records.filter(r => r.senderNumber === num).length;
                                                    return (
                                                        <span key={sIdx} style={{
                                                            background: '#f8fafc',
                                                            border: '1px solid #cbd5e1',
                                                            padding: '2px 8px',
                                                            borderRadius: '4px',
                                                            fontSize: '12px',
                                                            fontFamily: 'monospace',
                                                            color: '#0f172a',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '6px'
                                                        }}>
                                                            <strong>{num}</strong>
                                                            <span style={{ fontSize: '10.5px', background: '#e0f2fe', color: '#0369a1', padding: '0 4px', borderRadius: '3px', fontWeight: 700 }}>
                                                                {countForNum} msgs
                                                            </span>
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <strong style={{ fontSize: '15px', fontFamily: 'monospace', color: 'var(--text-main)' }}>
                                                {activeCampaign.senderNumber || '—'}
                                            </strong>
                                        )}
                                    </div>

                                    {/* Destinatários */}
                                    <div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                                            Destinatários <Info size={11} color="#94a3b8" />
                                        </div>
                                        <strong style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-main)' }}>
                                            {activeCampaign.total}
                                        </strong>
                                    </div>

                                    {/* Total de Destinos */}
                                    <div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                                            Total de destinos <Info size={11} color="#94a3b8" />
                                        </div>
                                        <strong style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-main)' }}>
                                            {activeCampaign.total}
                                        </strong>
                                    </div>
                                </div>
                            </div>

                            {/* Card 3: Lista Detalhada dos Números & Status da Campanha */}
                            <div style={{ background: '#ffffff', border: '1px solid var(--border-subtle)', borderRadius: '8px', overflow: 'hidden' }}>
                                <div style={{ padding: '12px 18px', background: '#f8fafc', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <strong style={{ fontSize: '13.5px', color: 'var(--text-main)' }}>
                                        Detalhes dos Números ({activeCampaign.records.length})
                                    </strong>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        <button
                                            type="button"
                                            onClick={() => handleExportDetailedReport(activeCampaign, 'xlsx')}
                                            style={{
                                                background: '#ecfdf5',
                                                border: '1px solid #bbf7d0',
                                                color: '#166534',
                                                fontSize: '11.5px',
                                                fontWeight: 600,
                                                padding: '4px 10px',
                                                borderRadius: '4px',
                                                cursor: 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}
                                        >
                                            <Download size={12} /> Baixar XLS
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleExportDetailedReport(activeCampaign, 'csv')}
                                            style={{
                                                background: '#f8fafc',
                                                border: '1px solid #cbd5e1',
                                                color: '#475569',
                                                fontSize: '11.5px',
                                                fontWeight: 600,
                                                padding: '4px 10px',
                                                borderRadius: '4px',
                                                cursor: 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}
                                        >
                                            <Download size={12} /> Baixar CSV
                                        </button>
                                    </div>
                                </div>

                                <div style={{ overflowX: 'auto', maxHeight: '420px', overflowY: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'left' }}>
                                        <thead style={{ position: 'sticky', top: 0, background: '#f1f5f9', zIndex: 1 }}>
                                            <tr style={{ borderBottom: '1px solid #e2e8f0', color: 'var(--text-muted)' }}>
                                                <th style={{ padding: '8px 12px', fontSize: '11px', fontWeight: 600 }}>DESTINATÁRIO</th>
                                                <th style={{ padding: '8px 12px', fontSize: '11px', fontWeight: 600 }}>REMETENTE (WABA)</th>
                                                <th style={{ padding: '8px 12px', fontSize: '11px', fontWeight: 600 }}>STATUS</th>
                                                <th style={{ padding: '8px 12px', fontSize: '11px', fontWeight: 600 }}>OPERADORA</th>
                                                <th style={{ padding: '8px 12px', fontSize: '11px', fontWeight: 600 }}>ENVIO / ENTREGA</th>
                                                <th style={{ padding: '8px 12px', fontSize: '11px', fontWeight: 600 }}>MOTIVO (INFOBIP)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {activeCampaign.records.map((r, idx) => {
                                                const isDelivered = r.status === 'DELIVERED';
                                                const isFailed = r.status === 'FAILED';
                                                const operator = r.operator || api.detectOperator(r.recipient);

                                                return (
                                                    <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                        <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-main)' }}>
                                                            {r.recipient}
                                                        </td>
                                                        <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: '11.5px', color: '#0369a1', fontWeight: 600 }}>
                                                            {r.senderNumber || '—'}
                                                        </td>
                                                        <td style={{ padding: '8px 12px' }}>
                                                            {isDelivered ? (
                                                                <span style={{
                                                                    background: '#dcfce7',
                                                                    color: '#15803d',
                                                                    border: '1px solid #86efac',
                                                                    padding: '2px 8px',
                                                                    borderRadius: '4px',
                                                                    fontSize: '11px',
                                                                    fontWeight: 600,
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '4px'
                                                                }}>
                                                                    <CheckCircle2 size={12} color="#16a34a" /> Delivered
                                                                </span>
                                                            ) : isFailed ? (
                                                                <span 
                                                                    onClick={() => setSelectedRecordForLog(r)}
                                                                    style={{
                                                                        background: '#fee2e2',
                                                                        color: '#991b1b',
                                                                        border: '1px solid #fca5a5',
                                                                        padding: '2px 8px',
                                                                        borderRadius: '4px',
                                                                        fontSize: '11px',
                                                                        fontWeight: 600,
                                                                        cursor: 'pointer',
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        gap: '4px'
                                                                    }}
                                                                >
                                                                    <AlertTriangle size={12} /> Falha (Ver)
                                                                </span>
                                                            ) : (
                                                                <span style={{
                                                                    background: '#e0f2fe',
                                                                    color: '#0369a1',
                                                                    border: '1px solid #7dd3fc',
                                                                    padding: '2px 8px',
                                                                    borderRadius: '4px',
                                                                    fontSize: '11px',
                                                                    fontWeight: 600,
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '4px'
                                                                }}>
                                                                    <Clock size={12} /> Enviado
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td style={{ padding: '8px 12px', color: '#475569', fontSize: '11.5px' }}>
                                                            {operator}
                                                        </td>
                                                        <td style={{ padding: '8px 12px', fontSize: '11.5px', color: '#64748b' }}>
                                                            <div>Env: {r.timestamp ? new Date(r.timestamp).toLocaleTimeString() : '—'}</div>
                                                            {isDelivered && r.doneAt && <div style={{ color: '#16a34a' }}>Ent: {new Date(r.doneAt).toLocaleTimeString()}</div>}
                                                            {isFailed && <div style={{ color: '#dc2626', fontWeight: 500 }}>Não entregue</div>}
                                                        </td>
                                                        <td style={{ padding: '8px 12px', fontSize: '11.5px', color: isDelivered ? '#166534' : (isFailed ? '#dc2626' : '#64748b') }}>
                                                            {r.deliveryReason || (isDelivered ? 'DELIVERED_TO_HANDSET' : (isFailed ? (r.errorReason || 'UNDELIVERABLE_NOT_DELIVERED') : 'SENT_TO_NETWORK'))}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        {/* COLUNA DIREITA: SIMULADOR WHATSAPP (EXATO IMAGEM 2) */}
                        <div style={{ position: 'sticky', top: '20px' }}>
                            <div style={{
                                width: '310px',
                                margin: '0 auto',
                                background: '#111827',
                                borderRadius: '36px',
                                padding: '12px',
                                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.2)'
                            }}>
                                {/* Phone Notch / Status */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px 8px', color: '#ffffff', fontSize: '11px', fontWeight: 600 }}>
                                    <span>9:41</span>
                                    <div style={{ width: '40px', height: '4px', background: '#374151', borderRadius: '4px' }} />
                                    <span>WhatsApp</span>
                                </div>

                                {/* Phone Inner Screen */}
                                <div style={{
                                    background: '#efeae2',
                                    borderRadius: '26px',
                                    overflow: 'hidden',
                                    minHeight: '520px',
                                    display: 'flex',
                                    flexDirection: 'column'
                                }}>
                                    {/* WhatsApp Chat Header */}
                                    <div style={{
                                        background: '#075e54',
                                        color: '#ffffff',
                                        padding: '10px 12px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px'
                                    }}>
                                        <ChevronLeft size={16} />
                                        <div style={{
                                            width: '32px',
                                            height: '32px',
                                            borderRadius: '50%',
                                            background: '#25D366',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: '#ffffff',
                                            fontWeight: 700,
                                            fontSize: '13px'
                                        }}>
                                            W
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {activeCampaign.senderNumbers.length > 1 
                                                    ? `${activeCampaign.senderNumbers[0]} (+${activeCampaign.senderNumbers.length - 1} WABAs)` 
                                                    : (activeCampaign.senderNumber || '554891159480')}
                                            </div>
                                            <div style={{ fontSize: '10.5px', color: '#a7f3d0' }}>
                                                {activeCampaign.senderNumbers.length > 1 ? `${activeCampaign.senderNumbers.length} remetentes ativos` : 'Active now'}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Chat Body */}
                                    <div style={{ flex: 1, padding: '14px 10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        {/* Date pill */}
                                        <div style={{ textAlign: 'center' }}>
                                            <span style={{
                                                background: '#ffffff',
                                                color: '#64748b',
                                                fontSize: '10.5px',
                                                padding: '2px 8px',
                                                borderRadius: '6px',
                                                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                            }}>
                                                Hoje
                                            </span>
                                        </div>

                                        {/* Speech Bubble */}
                                        <div style={{
                                            background: '#ffffff',
                                            borderRadius: '8px',
                                            padding: '8px',
                                            maxWidth: '92%',
                                            alignSelf: 'flex-start',
                                            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                                            position: 'relative'
                                        }}>
                                            {/* Header Image if available */}
                                            {activeCampaign.mediaUrl && (
                                                <div style={{ marginBottom: '8px', borderRadius: '6px', overflow: 'hidden', maxHeight: '180px' }}>
                                                    <img 
                                                        src={activeCampaign.mediaUrl} 
                                                        alt="Header Campanha" 
                                                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                                    />
                                                </div>
                                            )}

                                            {/* Message Content */}
                                            <div style={{ fontSize: '12px', color: '#111827', lineHeight: '1.45', whiteSpace: 'pre-wrap' }}>
                                                <p style={{ margin: '0 0 6px 0', fontWeight: 600 }}>
                                                    Olá!
                                                </p>
                                                <p style={{ margin: '0 0 6px 0' }}>
                                                    🎉 <strong>SEU BENEFÍCIO FOI LIBERADO!</strong>
                                                </p>
                                                <p style={{ margin: '0 0 6px 0' }}>
                                                    Recebemos sua solicitação em nossa central. Informamos que seu contrato pré-aprovado está disponível para contratação imediata.
                                                </p>
                                                <p style={{ margin: 0, fontSize: '11.5px', color: '#4b5563' }}>
                                                    ⚠️ ATENÇÃO: A aprovação é LIMITADA e pode expirar. Confirme agora mesmo pelo botão abaixo.
                                                </p>
                                            </div>

                                            {/* Timestamp & Delivered Double Check */}
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '3px', marginTop: '6px', fontSize: '10px', color: '#6b7280' }}>
                                                <span>17:42</span>
                                                <CheckCheck size={13} color="#0284c7" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            )}

            {/* ============================================================ */}
            {/* MODO 2: LISTA DE TODAS AS CAMPANHAS (CARDS DE TRANSMISSÕES)  */}
            {/* ============================================================ */}
            {viewMode === 'CAMPAIGNS' && !activeCampaign && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                        <div>
                            <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>
                                Campanhas & Transmissões Recentes
                            </h3>
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                                Clique em qualquer transmissão para ver o relatório individual (Imagem 2) e baixar o XLS detalhado.
                            </p>
                        </div>
                    </div>

                    {campaigns.length === 0 ? (
                        <div style={{ background: '#fff', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '40px 20px', textAlign: 'center' }}>
                            <FileSpreadsheet size={36} color="#94a3b8" style={{ margin: '0 auto 10px' }} />
                            <h4 style={{ fontSize: '15px', color: 'var(--text-main)', margin: '0 0 4px 0' }}>Nenhuma transmissão registrada ainda</h4>
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
                                Envie uma campanha na aba "Painel de Disparo" para gerar relatórios detalhados com entregas.
                            </p>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '14px' }}>
                            {campaigns.map((camp, idx) => (
                                <div 
                                    key={idx}
                                    style={{
                                        background: '#ffffff',
                                        border: '1px solid var(--border-subtle)',
                                        borderRadius: '8px',
                                        padding: '18px 20px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        justifyContent: 'space-between',
                                        gap: '14px',
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                                        transition: 'all 0.15s ease'
                                    }}
                                >
                                    <div>
                                        {/* Status Header */}
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                            {(() => {
                                                const isCardPaused = pausedCampaignIds.has(camp.id) || pausedCampaignIds.has(camp.name);
                                                if (isCardPaused) {
                                                    return (
                                                        <span style={{
                                                            fontSize: '11.5px',
                                                            fontWeight: 700,
                                                            color: '#b45309',
                                                            background: '#fef3c7',
                                                            border: '1px solid #fde68a',
                                                            padding: '2px 8px',
                                                            borderRadius: '4px',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '4px'
                                                        }}>
                                                            <Pause size={12} />
                                                            Pausada
                                                        </span>
                                                    );
                                                }
                                                return (
                                                    <span style={{
                                                        fontSize: '11.5px',
                                                        fontWeight: 600,
                                                        color: '#15803d',
                                                        background: '#dcfce7',
                                                        border: '1px solid #86efac',
                                                        padding: '2px 8px',
                                                        borderRadius: '4px',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }}>
                                                        <CheckCircle2 size={12} />
                                                        {camp.pending === 0 ? 'Terminado' : 'Em Envio'}
                                                    </span>
                                                );
                                            })()}
                                            <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                                                {camp.createdAt ? new Date(camp.createdAt).toLocaleDateString() : 'Hoje'}
                                            </span>
                                        </div>

                                        <h4 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)', margin: '0 0 4px 0', letterSpacing: '-0.01em' }}>
                                            {camp.name}
                                        </h4>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                            {camp.senderNumbers.length > 1 ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                        <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Remetentes:</span>
                                                        <span style={{ 
                                                            background: '#e0f2fe', 
                                                            color: '#0369a1', 
                                                            padding: '1px 6px', 
                                                            borderRadius: '4px', 
                                                            fontSize: '10.5px', 
                                                            fontWeight: 700 
                                                        }}>
                                                            {camp.senderNumbers.length} WABAs
                                                        </span>
                                                    </div>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                        {camp.senderNumbers.map((num, i) => (
                                                            <span key={i} style={{ 
                                                                fontFamily: 'monospace', 
                                                                fontSize: '11px', 
                                                                fontWeight: 600,
                                                                background: '#f1f5f9', 
                                                                color: 'var(--text-main)', 
                                                                padding: '1px 6px', 
                                                                borderRadius: '4px',
                                                                border: '1px solid #cbd5e1'
                                                            }}>
                                                                {num}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div>
                                                    Remetente: <strong style={{ color: 'var(--text-main)', fontFamily: 'monospace' }}>{camp.senderNumber || '—'}</strong>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* 4 Métricas Rápidas */}
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(4, 1fr)',
                                        gap: '8px',
                                        background: '#f8fafc',
                                        padding: '10px',
                                        borderRadius: '6px',
                                        border: '1px solid #e2e8f0',
                                        textAlign: 'center'
                                    }}>
                                        <div>
                                            <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block' }}>Enviadas</span>
                                            <strong style={{ fontSize: '14px', color: 'var(--text-main)' }}>{camp.total}</strong>
                                        </div>
                                        <div>
                                            <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block' }}>Entregues</span>
                                            <strong style={{ fontSize: '14px', color: '#16a34a' }}>{camp.delivered}</strong>
                                        </div>
                                        <div>
                                            <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block' }}>Falhas</span>
                                            <strong style={{ fontSize: '14px', color: '#dc2626' }}>{camp.failed}</strong>
                                        </div>
                                        <div>
                                            <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block' }}>Taxa</span>
                                            <strong style={{ fontSize: '14px', color: camp.deliveryRate >= 70 ? '#16a34a' : '#ea580c' }}>{camp.deliveryRate}%</strong>
                                        </div>
                                    </div>

                                    {/* Barra de Progresso de Entrega */}
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                                            <span>Taxa de Entrega (Handset)</span>
                                            <strong style={{ color: '#16a34a' }}>{camp.deliveryRate}%</strong>
                                        </div>
                                        <div style={{ height: '5px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${camp.deliveryRate}%`, background: camp.deliveryRate >= 70 ? '#16a34a' : '#ea580c' }} />
                                        </div>
                                    </div>

                                    {/* Botões de Ação */}
                                    <div style={{ display: 'flex', gap: '8px', paddingTop: '6px', borderTop: '1px solid #f1f5f9' }}>
                                        <button
                                            type="button"
                                            className="btn-primary"
                                            onClick={() => setSelectedCampaignId(camp.id)}
                                            style={{
                                                flex: 1,
                                                height: '34px',
                                                fontSize: '12.5px',
                                                borderRadius: '6px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '5px'
                                            }}
                                        >
                                            <Eye size={13} /> Ver Detalhes (Imagem 2)
                                        </button>
                                        <button
                                            type="button"
                                            className="btn-secondary"
                                            onClick={() => handleExportDetailedReport(camp, 'xlsx')}
                                            style={{
                                                height: '34px',
                                                fontSize: '12px',
                                                padding: '0 10px',
                                                borderRadius: '6px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}
                                            title="Baixar XLS (Imagem 3)"
                                        >
                                            <Download size={13} /> XLS
                                        </button>

                                        {(() => {
                                            const isCardPaused = pausedCampaignIds.has(camp.id) || pausedCampaignIds.has(camp.name);
                                            return isCardPaused ? (
                                                <button
                                                    type="button"
                                                    onClick={() => handleTogglePauseCampaign(camp.id, camp.name)}
                                                    style={{
                                                        height: '34px',
                                                        fontSize: '12px',
                                                        padding: '0 10px',
                                                        borderRadius: '6px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        background: '#16a34a',
                                                        color: '#ffffff',
                                                        border: 'none',
                                                        cursor: 'pointer',
                                                        fontWeight: 600
                                                    }}
                                                    title="Retomar envios desta campanha"
                                                >
                                                    <Play size={13} /> Retomar
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => handleTogglePauseCampaign(camp.id, camp.name)}
                                                    style={{
                                                        height: '34px',
                                                        fontSize: '12px',
                                                        padding: '0 10px',
                                                        borderRadius: '6px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        background: '#fef3c7',
                                                        color: '#b45309',
                                                        border: '1px solid #fde68a',
                                                        cursor: 'pointer',
                                                        fontWeight: 500
                                                    }}
                                                    title="Pausar envios desta campanha"
                                                >
                                                    <Pause size={13} /> Pausar
                                                </button>
                                            );
                                        })()}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ============================================================ */}
            {/* MODO 3: LOG EM TEMPO REAL COMPLETO (TABELA GERAL)            */}
            {/* ============================================================ */}
            {viewMode === 'REALTIME' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {/* Metrics HUD */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px' }}>
                        {/* Total */}
                        <div style={{ background: '#FFFFFF', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '14px 16px' }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>
                                Total de Disparos
                            </span>
                            <strong style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-main)', display: 'block', margin: '4px 0 2px' }}>
                                {totalCount}
                            </strong>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Mensagens registradas</span>
                        </div>

                        {/* Delivered */}
                        <div style={{ background: '#FFFFFF', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '14px 16px' }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>
                                Entregues (Handset)
                            </span>
                            <strong style={{ fontSize: '20px', fontWeight: 600, color: '#16A34A', display: 'block', margin: '4px 0 2px' }}>
                                {deliveredCount}
                            </strong>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Confirmados pela Meta/Infobip</span>
                        </div>

                        {/* Sent / In Route */}
                        <div style={{ background: '#FFFFFF', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '14px 16px' }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>
                                Em Rota / Enviados
                            </span>
                            <strong style={{ fontSize: '20px', fontWeight: 600, color: '#2563EB', display: 'block', margin: '4px 0 2px' }}>
                                {sentCount}
                            </strong>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Aguardando confirmação</span>
                        </div>

                        {/* Failed */}
                        <div style={{ background: '#FFFFFF', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '14px 16px' }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>
                                Falhas / Rejeitados
                            </span>
                            <strong style={{ fontSize: '20px', fontWeight: 600, color: '#DC2626', display: 'block', margin: '4px 0 2px' }}>
                                {failedCount}
                            </strong>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Erros de número ou template</span>
                        </div>

                        {/* Delivery Rate */}
                        <div style={{ background: '#FFFFFF', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '14px 16px' }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>
                                Taxa de Entrega
                            </span>
                            <strong style={{ fontSize: '20px', fontWeight: 600, color: deliveredRate >= 70 ? '#16A34A' : '#ea580c', display: 'block', margin: '4px 0 2px' }}>
                                {deliveredRate}%
                            </strong>
                            <div style={{ height: '4px', background: '#F3F4F6', borderRadius: '2px', overflow: 'hidden', marginTop: '6px' }}>
                                <div style={{ height: '100%', width: `${deliveredRate}%`, background: deliveredRate >= 70 ? '#16A34A' : '#ea580c' }} />
                            </div>
                        </div>
                    </div>

                    {/* Filter & Search Bar */}
                    <div style={{
                        background: '#FFFFFF',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '8px',
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '12px'
                    }}>
                        <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
                            <Search size={14} color="var(--text-dim)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                            <input 
                                type="text"
                                placeholder="Buscar destinatário, remetente, campanha ou template..."
                                className="form-input"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                style={{ height: '34px', paddingLeft: '32px', fontSize: '12.5px', borderRadius: '6px', width: '100%' }}
                            />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Filter size={13} color="var(--text-dim)" />
                            <span style={{ fontSize: '12px', color: 'var(--text-dim)', fontWeight: 500 }}>Status:</span>
                            <select 
                                className="form-select"
                                value={statusFilter}
                                onChange={(e: any) => setStatusFilter(e.target.value)}
                                style={{
                                    height: '34px',
                                    fontSize: '12.5px',
                                    borderRadius: '6px',
                                    padding: '0 10px',
                                    border: '1px solid var(--border-subtle)'
                                }}
                            >
                                <option value="ALL">Todos os Status</option>
                                <option value="DELIVERED">✓ Entregues (Delivered)</option>
                                <option value="SENT">Enviados (Em Rota)</option>
                                <option value="FAILED">Falhas / Rejeitados</option>
                            </select>
                        </div>
                    </div>

                    {/* Tabela de Disparos em Tempo Real */}
                    <div style={{
                        background: '#FFFFFF',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '8px',
                        overflow: 'hidden'
                    }}>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                                <thead>
                                    <tr style={{
                                        background: '#F8FAFC',
                                        borderBottom: '1px solid var(--border-subtle)',
                                        color: 'var(--text-muted)'
                                    }}>
                                        <th style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>HORÁRIO</th>
                                        <th style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>CAMPANHA</th>
                                        <th style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>DESTINATÁRIO</th>
                                        <th style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>OPERADORA</th>
                                        <th style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>REMETENTE (WABA)</th>
                                        <th style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>TEMPLATE</th>
                                        <th style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>STATUS DA ENTREGA</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredRecords.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} style={{ padding: '40px 14px', textAlign: 'center', color: 'var(--text-dim)' }}>
                                                Nenhum registro encontrado para os filtros selecionados.
                                            </td>
                                        </tr>
                                    ) : (
                                        paginatedRecords.map((r) => {
                                            const isDelivered = r.status === 'DELIVERED';
                                            const isFailed = r.status === 'FAILED';
                                            const diag = isFailed ? parseInfobipErrorDiagnostic(r.rawPayload) : null;
                                            const isHovered = hoveredRecordId === r.id;
                                            const operator = r.operator || api.detectOperator(r.recipient);

                                            return (
                                                <tr 
                                                    key={r.id} 
                                                    style={{ 
                                                        borderBottom: '1px solid #F1F5F9',
                                                        transition: 'background 0.15s ease'
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        e.currentTarget.style.background = '#F8FAFC';
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        e.currentTarget.style.background = '#FFFFFF';
                                                    }}
                                                >
                                                    {/* Horário */}
                                                    <td style={{ padding: '12px 14px', color: 'var(--text-dim)', fontSize: '12px', whiteSpace: 'nowrap' }}>
                                                        {r.timestamp ? new Date(r.timestamp).toLocaleTimeString() : '—'}
                                                    </td>

                                                    {/* Campanha */}
                                                    <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--text-main)', fontSize: '12.5px' }}>
                                                        {r.campaignName || 'Campanha_Padrao'}
                                                    </td>

                                                    {/* Destinatário */}
                                                    <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-main)', fontSize: '13px' }}>
                                                        {r.recipient}
                                                    </td>

                                                    {/* Operadora */}
                                                    <td style={{ padding: '12px 14px', color: '#475569', fontSize: '12px' }}>
                                                        {operator}
                                                    </td>

                                                    {/* Remetente */}
                                                    <td style={{ padding: '12px 14px', fontFamily: 'monospace', color: 'var(--text-muted)', fontSize: '12.5px' }}>
                                                        {r.senderNumber || '—'}
                                                    </td>

                                                    {/* Template */}
                                                    <td style={{ padding: '12px 14px', color: 'var(--text-main)', fontSize: '12.5px' }}>
                                                        {r.templateName || '—'}
                                                    </td>

                                                    {/* Status da Entrega */}
                                                    <td style={{ padding: '12px 14px', position: 'relative' }}>
                                                        {isDelivered ? (
                                                            <div style={{ display: 'inline-flex', flexDirection: 'column', gap: '2px' }}>
                                                                <span style={{
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '4px',
                                                                    background: '#DCFCE7',
                                                                    color: '#15803D',
                                                                    border: '1px solid #86EFAC',
                                                                    padding: '3px 8px',
                                                                    borderRadius: '4px',
                                                                    fontSize: '11px',
                                                                    fontWeight: 600
                                                                }}>
                                                                    <CheckCircle2 size={12} color="#16a34a" /> Delivered
                                                                </span>
                                                                <span style={{ fontSize: '10px', color: '#16a34a', fontFamily: 'monospace' }}>
                                                                    No Error (code 0)
                                                                </span>
                                                            </div>
                                                        ) : isFailed ? (
                                                            <div 
                                                                style={{ position: 'relative', display: 'inline-block' }}
                                                                onMouseEnter={() => setHoveredRecordId(r.id)}
                                                                onMouseLeave={() => setHoveredRecordId(null)}
                                                            >
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setSelectedRecordForLog(r)}
                                                                    style={{
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        gap: '5px',
                                                                        background: '#FEF2F2',
                                                                        color: '#B91C1C',
                                                                        border: '1px solid #FECACA',
                                                                        padding: '3px 8px',
                                                                        borderRadius: '4px',
                                                                        fontSize: '11.5px',
                                                                        fontWeight: 600,
                                                                        cursor: 'pointer',
                                                                        transition: 'all 0.15s ease'
                                                                    }}
                                                                >
                                                                    <AlertTriangle size={12} />
                                                                    <span>Falha</span>
                                                                    <Info size={11} style={{ opacity: 0.7 }} />
                                                                </button>
                                                                {r.deliveryReason && (
                                                                    <div 
                                                                        style={{ fontSize: '10px', color: '#b91c1c', fontFamily: 'monospace', marginTop: '2px', maxWidth: '170px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} 
                                                                        title={r.errorReason || r.deliveryReason}
                                                                    >
                                                                        {r.deliveryReason}
                                                                    </div>
                                                                )}

                                                                {/* Hover Tooltip */}
                                                                {isHovered && (
                                                                    <div style={{
                                                                        position: 'absolute',
                                                                        bottom: '100%',
                                                                        left: '50%',
                                                                        transform: 'translateX(-50%)',
                                                                        marginBottom: '8px',
                                                                        width: '280px',
                                                                        background: '#0F172A',
                                                                        color: '#FFFFFF',
                                                                        padding: '10px 12px',
                                                                        borderRadius: '8px',
                                                                        boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)',
                                                                        zIndex: 100,
                                                                        fontSize: '11.5px',
                                                                        lineHeight: '1.4',
                                                                        pointerEvents: 'none'
                                                                    }}>
                                                                        <strong style={{ color: '#F87171', display: 'block', marginBottom: '3px' }}>
                                                                            {r.errorName || (diag?.title) || 'Falha na Entrega'}
                                                                        </strong>
                                                                        <p style={{ margin: 0, color: '#E2E8F0', fontSize: '11px' }}>
                                                                            {r.errorReason || (diag?.description) || r.deliveryReason || 'Rejeitado pela operadora ou não entregue no handset.'}
                                                                        </p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <div style={{ display: 'inline-flex', flexDirection: 'column', gap: '2px' }}>
                                                                <span style={{
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '4px',
                                                                    background: '#EFF6FF',
                                                                    color: '#1D4ED8',
                                                                    border: '1px solid #BFDBFE',
                                                                    padding: '3px 8px',
                                                                    borderRadius: '4px',
                                                                    fontSize: '11px',
                                                                    fontWeight: 600
                                                                }}>
                                                                    <Clock size={12} /> Enviado
                                                                </span>
                                                                <span style={{ fontSize: '10px', color: '#64748b' }}>
                                                                    Aguardando handset
                                                                </span>
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Barra de Paginação Moderna e Responsiva */}
                        {filteredRecords.length > 0 && (
                            <div style={{
                                padding: '12px 18px',
                                background: '#F8FAFC',
                                borderTop: '1px solid var(--border-subtle)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                flexWrap: 'wrap',
                                gap: '12px',
                                fontSize: '12.5px',
                                color: 'var(--text-muted)'
                            }}>
                                {/* Lado Esquerdo: Resumo de itens e seletor de quantidade */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                                    <span>
                                        Exibindo <strong style={{ color: 'var(--text-main)' }}>{Math.min((currentPage - 1) * pageSize + 1, filteredRecords.length)}</strong> a <strong style={{ color: 'var(--text-main)' }}>{Math.min(currentPage * pageSize, filteredRecords.length)}</strong> de <strong style={{ color: 'var(--text-main)' }}>{filteredRecords.length}</strong> registros
                                    </span>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ fontSize: '12px' }}>Exibir:</span>
                                        <select
                                            value={pageSize}
                                            onChange={(e) => {
                                                setPageSize(Number(e.target.value));
                                                setCurrentPage(1);
                                            }}
                                            style={{
                                                height: '28px',
                                                fontSize: '12px',
                                                borderRadius: '4px',
                                                border: '1px solid #CBD5E1',
                                                background: '#FFFFFF',
                                                padding: '0 6px',
                                                fontWeight: 600,
                                                color: 'var(--text-main)',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <option value={25}>25 por pág</option>
                                            <option value={50}>50 por pág</option>
                                            <option value={100}>100 por pág</option>
                                            <option value={250}>250 por pág</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Lado Direito: Navegação de Páginas */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <button
                                        type="button"
                                        disabled={currentPage === 1}
                                        onClick={() => setCurrentPage(1)}
                                        style={{
                                            height: '30px',
                                            padding: '0 8px',
                                            borderRadius: '5px',
                                            border: '1px solid #E2E8F0',
                                            background: currentPage === 1 ? '#F1F5F9' : '#FFFFFF',
                                            color: currentPage === 1 ? '#94A3B8' : '#334155',
                                            cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                                            fontSize: '12px',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '2px',
                                            fontWeight: 500
                                        }}
                                        title="Primeira página"
                                    >
                                        <ChevronsLeft size={14} />
                                    </button>

                                    <button
                                        type="button"
                                        disabled={currentPage === 1}
                                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                        style={{
                                            height: '30px',
                                            padding: '0 10px',
                                            borderRadius: '5px',
                                            border: '1px solid #E2E8F0',
                                            background: currentPage === 1 ? '#F1F5F9' : '#FFFFFF',
                                            color: currentPage === 1 ? '#94A3B8' : '#334155',
                                            cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                                            fontSize: '12px',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            fontWeight: 500
                                        }}
                                        title="Página anterior"
                                    >
                                        <ChevronLeft size={14} /> Anterior
                                    </button>

                                    {/* Números das Páginas */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '3px', margin: '0 4px' }}>
                                        {(() => {
                                            const pageButtons = [];
                                            const maxVisiblePages = 5;
                                            let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
                                            let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
                                            if (endPage - startPage + 1 < maxVisiblePages) {
                                                startPage = Math.max(1, endPage - maxVisiblePages + 1);
                                            }

                                            for (let i = startPage; i <= endPage; i++) {
                                                const isCurrent = i === currentPage;
                                                pageButtons.push(
                                                    <button
                                                        key={i}
                                                        type="button"
                                                        onClick={() => setCurrentPage(i)}
                                                        style={{
                                                            height: '30px',
                                                            minWidth: '30px',
                                                            padding: '0 6px',
                                                            borderRadius: '5px',
                                                            border: isCurrent ? '1px solid #2563EB' : '1px solid #E2E8F0',
                                                            background: isCurrent ? '#2563EB' : '#FFFFFF',
                                                            color: isCurrent ? '#FFFFFF' : '#334155',
                                                            fontSize: '12px',
                                                            fontWeight: isCurrent ? 700 : 500,
                                                            cursor: 'pointer',
                                                            transition: 'all 0.15s ease'
                                                        }}
                                                    >
                                                        {i}
                                                    </button>
                                                );
                                            }
                                            return pageButtons;
                                        })()}
                                    </div>

                                    <button
                                        type="button"
                                        disabled={currentPage === totalPages}
                                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                        style={{
                                            height: '30px',
                                            padding: '0 10px',
                                            borderRadius: '5px',
                                            border: '1px solid #E2E8F0',
                                            background: currentPage === totalPages ? '#F1F5F9' : '#FFFFFF',
                                            color: currentPage === totalPages ? '#94A3B8' : '#334155',
                                            cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                                            fontSize: '12px',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            fontWeight: 500
                                        }}
                                        title="Próxima página"
                                    >
                                        Próxima <ChevronRight size={14} />
                                    </button>

                                    <button
                                        type="button"
                                        disabled={currentPage === totalPages}
                                        onClick={() => setCurrentPage(totalPages)}
                                        style={{
                                            height: '30px',
                                            padding: '0 8px',
                                            borderRadius: '5px',
                                            border: '1px solid #E2E8F0',
                                            background: currentPage === totalPages ? '#F1F5F9' : '#FFFFFF',
                                            color: currentPage === totalPages ? '#94A3B8' : '#334155',
                                            cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                                            fontSize: '12px',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '2px',
                                            fontWeight: 500
                                        }}
                                        title="Última página"
                                    >
                                        <ChevronsRight size={14} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ============================================================ */}
            {/* MODAL DETALHADO DO LOG DE FALHA                              */}
            {/* ============================================================ */}
            {selectedRecordForLog && (() => {
                const r = selectedRecordForLog;
                const diag = parseInfobipErrorDiagnostic(r.rawPayload);
                const title = r.errorName || diag.title || 'Falha no Disparo WhatsApp';
                const description = r.errorReason || diag.description || r.deliveryReason || 'A mensagem não foi entregue ao destinatário.';
                const rawJsonString = JSON.stringify(r.rawPayload || { error: description, reason: r.deliveryReason, code: r.errorName }, null, 2);

                return (
                    <div style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(15, 23, 42, 0.65)',
                        backdropFilter: 'blur(4px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 10000,
                        padding: '16px'
                    }}>
                        <div style={{
                            background: '#FFFFFF',
                            borderRadius: '10px',
                            border: '1px solid var(--border-subtle)',
                            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
                            maxWidth: '620px',
                            width: '100%',
                            maxHeight: '90vh',
                            overflowY: 'auto',
                            padding: '24px',
                            position: 'relative'
                        }}>
                            {/* Close */}
                            <button
                                type="button"
                                onClick={() => setSelectedRecordForLog(null)}
                                style={{
                                    position: 'absolute',
                                    top: '16px',
                                    right: '16px',
                                    background: '#F1F5F9',
                                    border: 'none',
                                    borderRadius: '6px',
                                    width: '28px',
                                    height: '28px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    color: 'var(--text-muted)'
                                }}
                            >
                                <X size={15} />
                            </button>

                            {/* Header */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                                <div style={{
                                    background: '#FEE2E2',
                                    color: '#DC2626',
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '6px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    <AlertTriangle size={18} />
                                </div>
                                <div>
                                    <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>
                                        Diagnóstico de Falha no Disparo
                                    </h3>
                                    <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                                        {r.timestamp ? new Date(r.timestamp).toLocaleString() : ''}
                                    </span>
                                </div>
                            </div>

                            {/* DIAGNÓSTICO EM LINGUAGEM CLARA */}
                            <div style={{
                                background: '#FEF2F2',
                                border: '1px solid #FECACA',
                                borderRadius: '8px',
                                padding: '14px',
                                marginBottom: '16px'
                            }}>
                                <strong style={{ color: '#991B1B', fontSize: '13.5px', display: 'block', marginBottom: '4px' }}>
                                    {title}
                                </strong>
                                <p style={{ fontSize: '13px', color: '#7F1D1D', margin: '0 0 6px 0', lineHeight: '1.4' }}>
                                    {description}
                                </p>
                                {r.deliveryReason && (
                                    <div style={{ fontSize: '11.5px', color: '#991B1B', marginTop: '4px', fontFamily: 'monospace' }}>
                                        <strong>Motivo Infobip:</strong> {r.deliveryReason}
                                    </div>
                                )}
                                <div style={{ fontSize: '12px', color: '#991B1B', borderTop: '1px dashed #FCA5A5', paddingTop: '6px', marginTop: '6px' }}>
                                    💡 <strong>Diagnóstico:</strong> {r.deliveryReason?.includes('REJECTED_OPERATOR') 
                                        ? 'O número de remetente (ex: WABA de teste internacional) não possui rota para esta operadora (Claro/TIM/Vivo) ou o número de destino está inoperante.' 
                                        : (diag.suggestion || 'Verifique se o remetente possui permissão de envio e template aprovado.')}
                                </div>
                            </div>

                            {/* JSON Bruto */}
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                    <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: 600 }}>Resposta da API:</span>
                                    <button
                                        type="button"
                                        onClick={() => handleCopyLog(rawJsonString)}
                                        style={{
                                            background: '#f1f5f9',
                                            border: '1px solid #cbd5e1',
                                            fontSize: '11px',
                                            fontWeight: 600,
                                            padding: '2px 8px',
                                            borderRadius: '4px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {copiedLog ? '✓ Copiado!' : 'Copiar JSON'}
                                    </button>
                                </div>
                                <pre style={{
                                    background: '#0F172A',
                                    color: '#F8FAFC',
                                    padding: '12px',
                                    borderRadius: '6px',
                                    fontSize: '11.5px',
                                    fontFamily: 'monospace',
                                    maxHeight: '180px',
                                    overflowY: 'auto',
                                    margin: 0
                                }}>
                                    {rawJsonString}
                                </pre>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                                <button
                                    className="btn-primary"
                                    onClick={() => setSelectedRecordForLog(null)}
                                    style={{ height: '34px', padding: '0 16px', fontSize: '13px', borderRadius: '6px' }}
                                >
                                    Fechar
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

        </div>
    );
};
