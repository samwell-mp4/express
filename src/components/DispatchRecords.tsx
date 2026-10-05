import React, { useState, useEffect, useRef } from 'react';
import { 
    Activity, CheckCircle2, Clock, AlertTriangle, RefreshCw, 
    Search, Filter, Smartphone, Trash2, ArrowUpRight, Send, Check, 
    Radio, ShieldCheck, Download, ExternalLink, Zap, Copy, X, Info, FileText
} from 'lucide-react';
import { DispatchRecord } from '../types';
import { api, parseInfobipErrorDiagnostic, DiagnosticError } from '../services/api';

export const DispatchRecords: React.FC = () => {
    const [records, setRecords] = useState<DispatchRecord[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'DELIVERED' | 'SENT' | 'FAILED'>('ALL');
    const timerRef = useRef<any>(null);

    // Modal de Log de Falha
    const [selectedRecordForLog, setSelectedRecordForLog] = useState<DispatchRecord | null>(null);
    const [copiedLog, setCopiedLog] = useState(false);

    // Hover Tooltip State
    const [hoveredRecordId, setHoveredRecordId] = useState<string | null>(null);

    // Initial load & Polling
    useEffect(() => {
        loadRecords();

        if (autoRefresh) {
            timerRef.current = setInterval(loadRecords, 2000);
        }

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [autoRefresh]);

    const loadRecords = async () => {
        try {
            // 1. Try fetching from server API
            const serverLogs = await api.getDispatchLogs();
            
            // 2. Read local recorded dispatches from localStorage
            const localRaw = localStorage.getItem('express_live_dispatch_records');
            const localLogs: DispatchRecord[] = localRaw ? JSON.parse(localRaw) : [];

            // Combine and deduplicate by id
            const combinedMap = new Map<string, DispatchRecord>();
            localLogs.forEach(r => combinedMap.set(r.id, r));
            serverLogs.forEach(r => combinedMap.set(r.id, r));

            const sorted = Array.from(combinedMap.values()).sort((a, b) => 
                new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            );

            setRecords(sorted);
        } catch (e) {
            console.warn('Erro ao atualizar registros:', e);
        }
    };

    const handleClearLogs = () => {
        if (!window.confirm('Deseja limpar todos os registros locais de envios?')) return;
        localStorage.removeItem('express_live_dispatch_records');
        setRecords([]);
    };

    const handleCopyLog = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopiedLog(true);
        setTimeout(() => setCopiedLog(false), 2000);
    };

    // Filtered records
    const filteredRecords = records.filter(r => {
        const matchesStatus = statusFilter === 'ALL' || r.status === statusFilter;
        const q = searchQuery.toLowerCase().trim();
        const matchesSearch = !q || 
            r.recipient.toLowerCase().includes(q) || 
            r.senderNumber.toLowerCase().includes(q) || 
            r.templateName.toLowerCase().includes(q) ||
            (r.messageId && r.messageId.toLowerCase().includes(q));
        return matchesStatus && matchesSearch;
    });

    // Metrics Calculations
    const totalCount = records.length;
    const deliveredCount = records.filter(r => r.status === 'DELIVERED').length;
    const sentCount = records.filter(r => r.status === 'SENT').length;
    const failedCount = records.filter(r => r.status === 'FAILED').length;
    const successRate = totalCount > 0 
        ? Math.round(((deliveredCount + sentCount) / totalCount) * 100) 
        : 100;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Top Header Bar */}
            <div style={{
                background: '#FFFFFF',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                        background: '#F0FDF4',
                        color: '#16A34A',
                        border: '1px solid #DCFCE7',
                        width: '32px',
                        height: '32px',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                    }}>
                        <Radio size={16} />
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-main)', letterSpacing: '-0.01em', margin: 0 }}>
                                Registro de Envios em Tempo Real
                            </h2>
                            <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                background: autoRefresh ? '#ECFDF5' : '#F3F4F6',
                                color: autoRefresh ? '#065F46' : '#6B7280',
                                border: `1px solid ${autoRefresh ? '#A7F3D0' : '#E5E7EB'}`,
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 600
                            }}>
                                <span style={{
                                    width: '6px',
                                    height: '6px',
                                    borderRadius: '50%',
                                    background: autoRefresh ? '#10B981' : '#9CA3AF'
                                }} />
                                {autoRefresh ? 'Ao Vivo (2s)' : 'Pausado'}
                            </span>
                        </div>
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                            Acompanhamento de mensagens disparadas e confirmações de entrega da Meta/Infobip.
                        </p>
                    </div>
                </div>

                {/* Right controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                        className="btn-secondary"
                        onClick={() => setAutoRefresh(!autoRefresh)}
                        style={{ height: '34px', fontSize: '13px', padding: '0 12px', borderRadius: '6px' }}
                    >
                        <RefreshCw size={13} className={autoRefresh ? 'animate-spin' : ''} />
                        {autoRefresh ? 'Pausar Atualização' : 'Retomar Ao Vivo'}
                    </button>

                    <button
                        className="btn-secondary"
                        onClick={loadRecords}
                        style={{ height: '34px', fontSize: '13px', padding: '0 12px', borderRadius: '6px' }}
                        title="Atualizar manualmente"
                    >
                        Atualizar Agora
                    </button>

                    {records.length > 0 && (
                        <button
                            onClick={handleClearLogs}
                            style={{
                                height: '34px',
                                background: '#FEF2F2',
                                border: '1px solid #FECACA',
                                color: '#DC2626',
                                padding: '0 12px',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '13px',
                                fontWeight: 500,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}
                            title="Limpar registros"
                        >
                            <Trash2 size={13} />
                            Limpar
                        </button>
                    )}
                </div>
            </div>

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
                        Entregues
                    </span>
                    <strong style={{ fontSize: '20px', fontWeight: 600, color: '#16A34A', display: 'block', margin: '4px 0 2px' }}>
                        {deliveredCount}
                    </strong>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Confirmados pela Meta</span>
                </div>

                {/* Sent / In Route */}
                <div style={{ background: '#FFFFFF', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '14px 16px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>
                        Em Rota
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
                    <strong style={{ fontSize: '20px', fontWeight: 600, color: successRate >= 80 ? '#16A34A' : '#DC2626', display: 'block', margin: '4px 0 2px' }}>
                        {successRate}%
                    </strong>
                    <div style={{ height: '4px', background: '#F3F4F6', borderRadius: '2px', overflow: 'hidden', marginTop: '6px' }}>
                        <div style={{ height: '100%', width: `${successRate}%`, background: successRate >= 80 ? '#16A34A' : '#DC2626' }} />
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
                        placeholder="Buscar destinatário, remetente ou template..."
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
                            minWidth: '120px'
                        }}
                    >
                        <option value="ALL">Todos ({records.length})</option>
                        <option value="DELIVERED">Entregues ({deliveredCount})</option>
                        <option value="SENT">Enviados ({sentCount})</option>
                        <option value="FAILED">Falhas ({failedCount})</option>
                    </select>
                </div>
            </div>

            {/* Live Table */}
            {filteredRecords.length === 0 ? (
                <div style={{
                    background: '#FFFFFF',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '8px',
                    padding: '48px 20px',
                    textAlign: 'center'
                }}>
                    <Activity size={32} color="#9CA3AF" style={{ margin: '0 auto 10px' }} />
                    <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-main)', margin: '0 0 4px' }}>
                        Nenhum envio registrado no momento
                    </h3>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '420px', margin: '0 auto' }}>
                        Quando você disparar uma campanha, cada mensagem aparecerá aqui em tempo real com seu número e status de entrega.
                    </p>
                </div>
            ) : (
                <div style={{
                    background: '#FFFFFF',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '8px',
                    overflow: 'visible'
                }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-subtle)', background: '#F9FAFB' }}>
                                <th style={{ padding: '9px 14px', fontSize: '11px', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Horário</th>
                                <th style={{ padding: '9px 14px', fontSize: '11px', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Destinatário</th>
                                <th style={{ padding: '9px 14px', fontSize: '11px', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Remetente (WABA)</th>
                                <th style={{ padding: '9px 14px', fontSize: '11px', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Template</th>
                                <th style={{ padding: '9px 14px', fontSize: '11px', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Status</th>
                                <th style={{ padding: '9px 14px', fontSize: '11px', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>ID da Mensagem</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRecords.map((r, i) => {
                                const timeStr = new Date(r.timestamp).toLocaleTimeString('pt-BR');
                                const dateStr = new Date(r.timestamp).toLocaleDateString('pt-BR');
                                const diagnostic = r.status === 'FAILED' ? parseInfobipErrorDiagnostic(r.rawPayload, r.errorReason) : null;
                                const isHovered = hoveredRecordId === r.id;

                                return (
                                    <tr key={r.id || i} style={{ borderBottom: '1px solid #F3F4F6', transition: 'background 0.15s' }}>
                                        {/* Timestamp */}
                                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                                            <span style={{ fontWeight: 600, color: 'var(--text-main)', display: 'block' }}>{timeStr}</span>
                                            <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{dateStr}</span>
                                        </td>

                                        {/* Recipient */}
                                        <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-main)', fontFamily: 'monospace' }}>
                                            {r.recipient}
                                        </td>

                                        {/* Sender WABA */}
                                        <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#F9FAFB', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border-subtle)', fontFamily: 'monospace', fontSize: '12px' }}>
                                                <Smartphone size={12} color="var(--primary-color)" />
                                                {r.senderNumber || 'BM Luiz'}
                                            </span>
                                        </td>

                                        {/* Template */}
                                        <td style={{ padding: '10px 14px', fontWeight: 500, color: 'var(--text-main)' }}>
                                            {r.templateName || '—'}
                                        </td>

                                        {/* Status Badge com Hover Tooltip & Popup de Log */}
                                        <td style={{ padding: '10px 14px', position: 'relative' }}>
                                            {r.status === 'DELIVERED' ? (
                                                <span style={{
                                                    background: '#ECFDF5',
                                                    color: '#065F46',
                                                    border: '1px solid #A7F3D0',
                                                    padding: '2px 8px',
                                                    borderRadius: '4px',
                                                    fontSize: '11px',
                                                    fontWeight: 600,
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px'
                                                }}>
                                                    <Check size={11} strokeWidth={2.5} />
                                                    ENTREGUE
                                                </span>
                                            ) : r.status === 'SENT' ? (
                                                <span style={{
                                                    background: '#EFF6FF',
                                                    color: '#1E40AF',
                                                    border: '1px solid #BFDBFE',
                                                    padding: '2px 8px',
                                                    borderRadius: '4px',
                                                    fontSize: '11px',
                                                    fontWeight: 600,
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px'
                                                }}>
                                                    <Send size={11} />
                                                    ENVIADO
                                                </span>
                                            ) : (
                                                /* BADGE DE FALHA INTERATIVO */
                                                <div 
                                                    style={{ position: 'relative', display: 'inline-block' }}
                                                    onMouseEnter={() => setHoveredRecordId(r.id)}
                                                    onMouseLeave={() => setHoveredRecordId(null)}
                                                >
                                                    <button
                                                        type="button"
                                                        onClick={() => setSelectedRecordForLog(r)}
                                                        style={{
                                                            background: '#FEF2F2',
                                                            color: '#B91C1C',
                                                            border: '1px solid #FECACA',
                                                            padding: '3px 8px',
                                                            borderRadius: '4px',
                                                            fontSize: '11px',
                                                            fontWeight: 600,
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '5px',
                                                            cursor: 'pointer',
                                                            boxShadow: '0 1px 2px rgba(220, 38, 38, 0.08)',
                                                            transition: 'all 0.15s ease'
                                                        }}
                                                        title="Clique para ver o log completo da falha"
                                                    >
                                                        <AlertTriangle size={11} color="#DC2626" />
                                                        <span>FALHA</span>
                                                        <Info size={11} color="#EF4444" style={{ marginLeft: '1px', opacity: 0.8 }} />
                                                    </button>

                                                    {/* Resumo do motivo logo abaixo do badge */}
                                                    {diagnostic && (
                                                        <div 
                                                            onClick={() => setSelectedRecordForLog(r)}
                                                            style={{
                                                                fontSize: '10.5px',
                                                                color: '#DC2626',
                                                                marginTop: '2px',
                                                                maxWidth: '160px',
                                                                overflow: 'hidden',
                                                                textOverflow: 'ellipsis',
                                                                whiteSpace: 'nowrap',
                                                                cursor: 'pointer',
                                                                fontWeight: 500
                                                            }}
                                                            title={diagnostic.description}
                                                        >
                                                            {diagnostic.title !== 'Erro na Transmissão' ? diagnostic.title : diagnostic.description}
                                                        </div>
                                                    )}

                                                    {/* HOVER TOOLTIP FLUTUANTE */}
                                                    {isHovered && diagnostic && (
                                                        <div style={{
                                                            position: 'absolute',
                                                            bottom: '100%',
                                                            left: '0',
                                                            marginBottom: '8px',
                                                            background: '#1e293b',
                                                            color: '#f8fafc',
                                                            padding: '10px 14px',
                                                            borderRadius: '8px',
                                                            fontSize: '12px',
                                                            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.2)',
                                                            zIndex: 9999,
                                                            minWidth: '260px',
                                                            maxWidth: '340px',
                                                            pointerEvents: 'none',
                                                            border: '1px solid #334155',
                                                            lineHeight: '1.4'
                                                        }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                                                <AlertTriangle size={13} color="#f87171" />
                                                                <strong style={{ color: '#fca5a5', fontSize: '12.5px' }}>
                                                                    {diagnostic.title}
                                                                </strong>
                                                            </div>
                                                            <div style={{ color: '#e2e8f0', fontSize: '11.5px', marginBottom: '6px' }}>
                                                                {diagnostic.description}
                                                            </div>
                                                            {diagnostic.code && (
                                                                <div style={{ 
                                                                    fontFamily: 'monospace', 
                                                                    fontSize: '10.5px', 
                                                                    color: '#94a3b8', 
                                                                    background: '#0f172a', 
                                                                    padding: '2px 6px', 
                                                                    borderRadius: '4px',
                                                                    display: 'inline-block',
                                                                    marginBottom: '6px'
                                                                }}>
                                                                    Código: {diagnostic.code}
                                                                </div>
                                                            )}
                                                            <div style={{ fontSize: '10.5px', color: '#38bdf8', borderTop: '1px solid #334155', paddingTop: '4px', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <span>💡 Clique no botão para abrir o relatório completo</span>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </td>

                                        {/* Message ID */}
                                        <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: '12px', color: 'var(--text-dim)' }}>
                                            {r.messageId || '—'}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* ======================================================== */}
            {/* MODAL POPUP: DIAGNÓSTICO DO DISPARO & LOG DA FALHA      */}
            {/* ======================================================== */}
            {selectedRecordForLog && (() => {
                const r = selectedRecordForLog;
                const diag = parseInfobipErrorDiagnostic(r.rawPayload, r.errorReason);
                const rawJsonString = typeof r.rawPayload === 'string' 
                    ? r.rawPayload 
                    : JSON.stringify(r.rawPayload || { error: r.errorReason || 'Erro no envio' }, null, 2);

                return (
                    <div style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(15, 23, 42, 0.5)',
                        backdropFilter: 'blur(3px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1300,
                        padding: '16px'
                    }}>
                        <div className="glass-panel" style={{
                            width: '100%',
                            maxWidth: '680px',
                            maxHeight: '90vh',
                            overflowY: 'auto',
                            background: '#ffffff',
                            borderRadius: '10px',
                            border: '1px solid var(--border-subtle)',
                            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                            padding: '24px',
                            position: 'relative'
                        }}>
                            {/* Close Button */}
                            <button
                                onClick={() => setSelectedRecordForLog(null)}
                                style={{
                                    position: 'absolute',
                                    top: '18px',
                                    right: '18px',
                                    background: '#f1f5f9',
                                    border: 'none',
                                    color: 'var(--text-muted)',
                                    width: '30px',
                                    height: '30px',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                            >
                                <X size={16} />
                            </button>

                            {/* Header */}
                            <div style={{ marginBottom: '16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                    <span style={{
                                        background: '#FEF2F2',
                                        color: '#B91C1C',
                                        border: '1px solid #FECACA',
                                        padding: '2px 8px',
                                        borderRadius: '4px',
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}>
                                        <AlertTriangle size={11} /> FALHA NO DISPARO
                                    </span>
                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                        {new Date(r.timestamp).toLocaleString('pt-BR')}
                                    </span>
                                </div>
                                <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-main)', margin: 0, letterSpacing: '-0.01em' }}>
                                    Diagnóstico & Detalhes da Falha
                                </h3>
                                <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                                    Informações detalhadas retornadas pelo servidor da Infobip/Meta para este destinatário.
                                </p>
                            </div>

                            {/* CARTÃO DE DIAGNÓSTICO EM DESTAQUE */}
                            <div style={{
                                background: '#FEF2F2',
                                border: '1.5px solid #F87171',
                                borderRadius: '8px',
                                padding: '14px 16px',
                                marginBottom: '16px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                    <div style={{
                                        background: '#FEE2E2',
                                        color: '#DC2626',
                                        width: '28px',
                                        height: '28px',
                                        borderRadius: '6px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0,
                                        marginTop: '2px'
                                    }}>
                                        <AlertTriangle size={16} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                            <strong style={{ fontSize: '14px', color: '#991B1B' }}>
                                                {diag.title}
                                            </strong>
                                            {diag.code && (
                                                <span style={{
                                                    fontFamily: 'monospace',
                                                    fontSize: '11px',
                                                    background: '#ffffff',
                                                    border: '1px solid #FECACA',
                                                    color: '#B91C1C',
                                                    padding: '1px 6px',
                                                    borderRadius: '4px',
                                                    fontWeight: 600
                                                }}>
                                                    {diag.code}
                                                </span>
                                            )}
                                        </div>
                                        <p style={{ fontSize: '13px', color: '#7F1D1D', margin: '4px 0 0 0', lineHeight: '1.4' }}>
                                            {diag.description}
                                        </p>

                                        {/* Sugestão de resolução */}
                                        {diag.suggestion && (
                                            <div style={{
                                                marginTop: '8px',
                                                paddingTop: '8px',
                                                borderTop: '1px dashed #FCA5A5',
                                                fontSize: '12px',
                                                color: '#991B1B',
                                                display: 'flex',
                                                alignItems: 'flex-start',
                                                gap: '6px'
                                            }}>
                                                <span style={{ fontWeight: 600 }}>💡 Como resolver:</span>
                                                <span>{diag.suggestion}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* TABELA DE DADOS DO DISPARO */}
                            <div style={{
                                background: '#F8FAFC',
                                border: '1px solid var(--border-subtle)',
                                borderRadius: '8px',
                                padding: '12px 14px',
                                marginBottom: '16px',
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr',
                                gap: '10px',
                                fontSize: '12.5px'
                            }}>
                                <div>
                                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>Destinatário:</span>
                                    <strong style={{ fontFamily: 'monospace', color: 'var(--text-main)', fontSize: '13.5px' }}>{r.recipient}</strong>
                                </div>
                                <div>
                                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>Remetente (WABA):</span>
                                    <strong style={{ fontFamily: 'monospace', color: 'var(--text-main)', fontSize: '13px' }}>{r.senderNumber || '—'}</strong>
                                </div>
                                <div>
                                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>Template Escolhido:</span>
                                    <strong style={{ color: 'var(--text-main)' }}>{r.templateName || '—'}</strong>
                                </div>
                                <div>
                                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>ID da Mensagem / Tx:</span>
                                    <span style={{ fontFamily: 'monospace', color: 'var(--text-dim)', fontSize: '11.5px' }}>{r.messageId || r.transmissionId || '—'}</span>
                                </div>
                            </div>

                            {/* RESPOSTA TÉCNICA BRUTA (JSON) */}
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                    <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <FileText size={12} /> Resposta Bruta da API Infobip (JSON):
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => handleCopyLog(rawJsonString)}
                                        style={{
                                            background: '#f1f5f9',
                                            border: '1px solid #cbd5e1',
                                            color: 'var(--text-main)',
                                            padding: '3px 8px',
                                            borderRadius: '4px',
                                            fontSize: '11px',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        }}
                                    >
                                        {copiedLog ? <Check size={11} color="#16a34a" /> : <Copy size={11} />}
                                        {copiedLog ? 'Copiado!' : 'Copiar JSON'}
                                    </button>
                                </div>

                                <pre style={{
                                    background: '#0f172a',
                                    color: '#f8fafc',
                                    padding: '12px',
                                    borderRadius: '6px',
                                    fontSize: '11.5px',
                                    fontFamily: 'monospace',
                                    maxHeight: '180px',
                                    overflowY: 'auto',
                                    margin: 0,
                                    border: '1px solid #334155',
                                    lineHeight: '1.4'
                                }}>
                                    {rawJsonString}
                                </pre>
                            </div>

                            {/* Modal Footer */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '18px' }}>
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
