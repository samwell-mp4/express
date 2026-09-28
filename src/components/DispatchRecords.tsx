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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Top Header Bar */}
            <div className="glass-panel" style={{ padding: '22px 26px', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            background: 'var(--primary-color)',
                            color: '#fff',
                            width: '36px',
                            height: '36px',
                            borderRadius: '10px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 2px 8px var(--primary-glow)'
                        }}>
                            <Radio size={20} />
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <h2 style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--text-main)', lineHeight: 1.1 }}>
                                    Registro de Envios em Tempo Real
                                </h2>
                                <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    background: autoRefresh ? '#ecfdf5' : '#f1f5f9',
                                    color: autoRefresh ? '#059669' : '#64748b',
                                    border: `1px solid ${autoRefresh ? '#a7f3d0' : '#cbd5e1'}`,
                                    padding: '2px 8px',
                                    borderRadius: '999px',
                                    fontSize: '0.72rem',
                                    fontWeight: 700
                                }}>
                                    <span style={{
                                        width: '6px',
                                        height: '6px',
                                        borderRadius: '50%',
                                        background: autoRefresh ? '#10b981' : '#94a3b8',
                                        boxShadow: autoRefresh ? '0 0 6px #10b981' : 'none'
                                    }} />
                                    {autoRefresh ? 'Ao Vivo (2s)' : 'Pausado'}
                                </span>
                            </div>
                            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                                Acompanhe exatamente os números que estão sendo disparados pela BM e o status de entrega de cada mensagem.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Right controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <button
                        className="btn-secondary"
                        onClick={() => setAutoRefresh(!autoRefresh)}
                        style={{ fontSize: '0.82rem', padding: '7px 12px' }}
                    >
                        <RefreshCw size={13} className={autoRefresh ? 'animate-spin' : ''} />
                        {autoRefresh ? 'Pausar Atualização' : 'Retomar Ao Vivo'}
                    </button>

                    <button
                        className="btn-secondary"
                        onClick={loadRecords}
                        style={{ fontSize: '0.82rem', padding: '7px 12px' }}
                        title="Atualizar manualmente"
                    >
                        Atualizar Agora
                    </button>

                    {records.length > 0 && (
                        <button
                            onClick={handleClearLogs}
                            style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '7px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}
                            title="Limpar registros"
                        >
                            <Trash2 size={13} />
                            Limpar
                        </button>
                    )}
                </div>
            </div>

            {/* Metrics HUD */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
                
                {/* Total */}
                <div className="glass-card" style={{ padding: '18px', background: '#fff', borderTop: '3px solid #64748b' }}>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)', fontWeight: 600, display: 'block' }}>Total de Disparos</span>
                    <strong style={{ fontSize: '1.6rem', color: 'var(--text-main)', display: 'block', margin: '4px 0' }}>
                        {totalCount}
                    </strong>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Mensagens registradas</span>
                </div>

                {/* Entregues */}
                <div className="glass-card" style={{ padding: '18px', background: '#fff', borderTop: '3px solid #10b981' }}>
                    <span style={{ fontSize: '0.74rem', color: '#16a34a', fontWeight: 700, display: 'block' }}>Entregues com Sucesso</span>
                    <strong style={{ fontSize: '1.6rem', color: '#059669', display: 'block', margin: '4px 0' }}>
                        {deliveredCount}
                    </strong>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Confirmados pela Meta/Infobip</span>
                </div>

                {/* Enviados / Em Rota */}
                <div className="glass-card" style={{ padding: '18px', background: '#fff', borderTop: '3px solid #3b82f6' }}>
                    <span style={{ fontSize: '0.74rem', color: '#2563eb', fontWeight: 700, display: 'block' }}>Enviados / Em Rota</span>
                    <strong style={{ fontSize: '1.6rem', color: '#1d4ed8', display: 'block', margin: '4px 0' }}>
                        {sentCount}
                    </strong>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Aguardando confirmação</span>
                </div>

                {/* Falhas */}
                <div className="glass-card" style={{ padding: '18px', background: '#fff', borderTop: '3px solid #ef4444' }}>
                    <span style={{ fontSize: '0.74rem', color: '#dc2626', fontWeight: 700, display: 'block' }}>Falhas / Rejeitados</span>
                    <strong style={{ fontSize: '1.6rem', color: '#dc2626', display: 'block', margin: '4px 0' }}>
                        {failedCount}
                    </strong>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Erros de número ou limite</span>
                </div>

                {/* Taxa de Entrega */}
                <div className="glass-card" style={{ padding: '18px', background: '#fff', borderTop: '3px solid var(--primary-color)' }}>
                    <span style={{ fontSize: '0.74rem', color: 'var(--primary-color)', fontWeight: 700, display: 'block' }}>Taxa de Entrega</span>
                    <strong style={{ fontSize: '1.6rem', color: 'var(--text-main)', display: 'block', margin: '4px 0' }}>
                        {successRate}%
                    </strong>
                    {/* Mini progress bar */}
                    <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden', marginTop: '6px' }}>
                        <div style={{ width: `${successRate}%`, height: '100%', background: 'linear-gradient(90deg, #10b981, #059669)', borderRadius: '999px' }} />
                    </div>
                </div>

            </div>

            {/* Filter & Search Bar */}
            <div className="glass-panel" style={{ padding: '14px 20px', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '240px' }}>
                    <Search size={16} color="var(--text-dim)" />
                    <input 
                        type="text"
                        placeholder="Buscar por número destinatário, remetente ou template..."
                        className="form-input"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{ border: 'none', background: '#f8fafc', padding: '8px 12px', fontSize: '0.84rem' }}
                    />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Filter size={15} color="var(--text-muted)" />
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>Status:</span>
                    <select
                        className="form-select"
                        value={statusFilter}
                        onChange={(e: any) => setStatusFilter(e.target.value)}
                        style={{ padding: '6px 12px', fontSize: '0.8rem', fontWeight: 600 }}
                    >
                        <option value="ALL">Todos ({records.length})</option>
                        <option value="DELIVERED">✓ Entregues ({deliveredCount})</option>
                        <option value="SENT">✈️ Enviados ({sentCount})</option>
                        <option value="FAILED">⚠️ Falhas ({failedCount})</option>
                    </select>
                </div>
            </div>

            {/* Live Table */}
            {filteredRecords.length === 0 ? (
                <div className="glass-card" style={{ padding: '60px 20px', textAlign: 'center', background: '#fff' }}>
                    <Activity size={36} color="var(--primary-color)" style={{ margin: '0 auto 12px', opacity: 0.8 }} />
                    <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)' }}>
                        Nenhum envio registrado no momento
                    </h3>
                    <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', maxWidth: '420px', margin: '6px auto 16px' }}>
                        Quando você disparar uma campanha na aba <strong>Multi-Remetente</strong>, cada mensagem aparecerá aqui em tempo real com seu número e status de entrega.
                    </p>
                </div>
            ) : (
                <div className="glass-panel" style={{ overflowX: 'auto', padding: '8px', background: '#fff' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-dim)', background: '#f8fafc' }}>
                                <th style={{ padding: '12px 16px' }}>HORÁRIO</th>
                                <th style={{ padding: '12px 16px' }}>DESTINATÁRIO (CLIENTE)</th>
                                <th style={{ padding: '12px 16px' }}>REMETENTE (WABA)</th>
                                <th style={{ padding: '12px 16px' }}>TEMPLATE</th>
                                <th style={{ padding: '12px 16px' }}>STATUS DE ENTREGA</th>
                                <th style={{ padding: '12px 16px' }}>ID DA MENSAGEM</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRecords.map((r, i) => {
                                const timeStr = new Date(r.timestamp).toLocaleTimeString('pt-BR');
                                const dateStr = new Date(r.timestamp).toLocaleDateString('pt-BR');

                                return (
                                    <tr key={r.id || i} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s' }}>
                                        {/* Timestamp */}
                                        <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                                            <span style={{ fontWeight: 700, color: 'var(--text-main)', display: 'block' }}>{timeStr}</span>
                                            <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{dateStr}</span>
                                        </td>

                                        {/* Recipient */}
                                        <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-main)', fontFamily: 'monospace' }}>
                                            {r.recipient}
                                        </td>

                                        {/* Sender WABA */}
                                        <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#f8fafc', padding: '3px 8px', borderRadius: '6px', border: '1px solid var(--border-subtle)', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                                                <Smartphone size={13} color="var(--primary-color)" />
                                                {r.senderNumber || 'BM Luiz'}
                                            </span>
                                        </td>

                                        {/* Template */}
                                        <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-main)' }}>
                                            {r.templateName || '—'}
                                        </td>

                                        {/* Status Badge */}
                                        <td style={{ padding: '12px 16px' }}>
                                            {r.status === 'DELIVERED' ? (
                                                <span style={{
                                                    background: '#ecfdf5',
                                                    color: '#065f46',
                                                    border: '1px solid #a7f3d0',
                                                    padding: '4px 10px',
                                                    borderRadius: '999px',
                                                    fontSize: '0.74rem',
                                                    fontWeight: 700,
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '5px'
                                                }}>
                                                    <Check size={12} strokeWidth={3} />
                                                    ENTREGUE
                                                </span>
                                            ) : r.status === 'SENT' ? (
                                                <span style={{
                                                    background: '#eff6ff',
                                                    color: '#1e40af',
                                                    border: '1px solid #bfdbfe',
                                                    padding: '4px 10px',
                                                    borderRadius: '999px',
                                                    fontSize: '0.74rem',
                                                    fontWeight: 700,
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '5px'
                                                }}>
                                                    <Send size={12} />
                                                    ENVIADO
                                                </span>
                                            ) : (
                                                <span 
                                                    title={r.errorReason || 'Erro retornado pela API da Infobip/Meta'}
                                                    style={{
                                                        background: '#fef2f2',
                                                        color: '#dc2626',
                                                        border: '1px solid #fecaca',
                                                        padding: '4px 10px',
                                                        borderRadius: '999px',
                                                        fontSize: '0.74rem',
                                                        fontWeight: 700,
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '5px',
                                                        cursor: 'help'
                                                    }}
                                                >
                                                    <AlertTriangle size={12} />
                                                    FALHA
                                                </span>
                                            )}
                                        </td>

                                        {/* Message ID */}
                                        <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: '0.74rem', color: 'var(--text-dim)' }}>
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
