import React, { useState, useEffect, useRef } from 'react';
import { 
    Activity, CheckCircle2, Clock, AlertTriangle, RefreshCw, 
    Search, Filter, Smartphone, Trash2, ArrowUpRight, Send, Check, 
    Radio, ShieldCheck, Download, ExternalLink, Zap
} from 'lucide-react';
import { DispatchRecord } from '../types';
import { api } from '../services/api';

export const DispatchRecords: React.FC = () => {
    const [records, setRecords] = useState<DispatchRecord[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'DELIVERED' | 'SENT' | 'FAILED'>('ALL');
    const timerRef = useRef<any>(null);

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

                {/* Entregues */}
                <div style={{ background: '#FFFFFF', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '14px 16px' }}>
                    <span style={{ fontSize: '11px', color: '#16A34A', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>
                        Entregues
                    </span>
                    <strong style={{ fontSize: '20px', fontWeight: 600, color: '#16A34A', display: 'block', margin: '4px 0 2px' }}>
                        {deliveredCount}
                    </strong>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Confirmados pela Meta</span>
                </div>

                {/* Enviados / Em Rota */}
                <div style={{ background: '#FFFFFF', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '14px 16px' }}>
                    <span style={{ fontSize: '11px', color: '#2563EB', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>
                        Em Rota
                    </span>
                    <strong style={{ fontSize: '20px', fontWeight: 600, color: '#2563EB', display: 'block', margin: '4px 0 2px' }}>
                        {sentCount}
                    </strong>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Aguardando confirmação</span>
                </div>

                {/* Falhas */}
                <div style={{ background: '#FFFFFF', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '14px 16px' }}>
                    <span style={{ fontSize: '11px', color: '#DC2626', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>
                        Falhas / Rejeitados
                    </span>
                    <strong style={{ fontSize: '20px', fontWeight: 600, color: '#DC2626', display: 'block', margin: '4px 0 2px' }}>
                        {failedCount}
                    </strong>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Erros de número ou limite</span>
                </div>

                {/* Taxa de Entrega */}
                <div style={{ background: '#FFFFFF', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '14px 16px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>
                        Taxa de Entrega
                    </span>
                    <strong style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-main)', display: 'block', margin: '4px 0 6px' }}>
                        {successRate}%
                    </strong>
                    <div style={{ width: '100%', height: '4px', background: '#E5E7EB', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{ width: `${successRate}%`, height: '100%', background: '#16A34A', borderRadius: '2px' }} />
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '240px' }}>
                    <Search size={15} color="var(--text-dim)" />
                    <input 
                        type="text"
                        placeholder="Buscar destinatário, remetente ou template..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                            height: '34px',
                            border: '1px solid #D1D5DB',
                            borderRadius: '6px',
                            background: '#FFFFFF',
                            padding: '0 12px',
                            fontSize: '13px',
                            width: '100%',
                            maxWidth: '440px',
                            color: 'var(--text-main)'
                        }}
                    />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Filter size={14} color="var(--text-muted)" />
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>Status:</span>
                    <select
                        value={statusFilter}
                        onChange={(e: any) => setStatusFilter(e.target.value)}
                        style={{
                            height: '34px',
                            border: '1px solid #D1D5DB',
                            borderRadius: '6px',
                            background: '#FFFFFF',
                            padding: '0 10px',
                            fontSize: '13px',
                            fontWeight: 500,
                            color: 'var(--text-main)'
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
                    overflow: 'hidden'
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

                                        {/* Status Badge */}
                                        <td style={{ padding: '10px 14px' }}>
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
                                                <span 
                                                    title={r.errorReason || 'Erro retornado pela API da Infobip/Meta'}
                                                    style={{
                                                        background: '#FEF2F2',
                                                        color: '#B91C1C',
                                                        border: '1px solid #FECACA',
                                                        padding: '2px 8px',
                                                        borderRadius: '4px',
                                                        fontSize: '11px',
                                                        fontWeight: 600,
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        cursor: 'help'
                                                    }}
                                                >
                                                    <AlertTriangle size={11} />
                                                    FALHA
                                                </span>
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

        </div>
    );
};
