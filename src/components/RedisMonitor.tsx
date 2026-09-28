import React, { useState } from 'react';
import { Database, Play, Pause, Trash2, RefreshCw, AlertTriangle, CheckCircle2, Clock, ShieldCheck, Zap, Sliders, Gauge } from 'lucide-react';
import { RedisQueueStatus } from '../types';
import { api } from '../services/api';

interface RedisMonitorProps {
    status: RedisQueueStatus;
    onRefresh: () => void;
}

export const RedisMonitor: React.FC<RedisMonitorProps> = ({ status, onRefresh }) => {
    const [isActionLoading, setIsActionLoading] = useState(false);
    const [actionMessage, setActionMessage] = useState<string | null>(null);

    // Rate Limit open controller (user can set 0.5, 1.0, 1.5, etc.)
    const [customRateLimit, setCustomRateLimit] = useState<number>(status.rateLimit || 1.0);
    const [isSavingRateLimit, setIsSavingRateLimit] = useState(false);

    const showToast = (msg: string) => {
        setActionMessage(msg);
        setTimeout(() => setActionMessage(null), 4000);
    };

    const handleSaveRateLimit = async (limitToSet: number) => {
        setIsSavingRateLimit(true);
        try {
            await api.setRedisRateLimit(limitToSet);
            setCustomRateLimit(limitToSet);
            showToast(`✓ Rate Limit atualizado para ${limitToSet}s por mensagem no Redis!`);
            onRefresh();
        } catch (err: any) {
            alert(`Erro ao salvar Rate Limit: ${err.message}`);
        } finally {
            setIsSavingRateLimit(false);
        }
    };

    const handleStopQueue = async () => {
        if (!window.confirm("Deseja realmente sinalizar a pausa imediata do processamento da fila Redis?")) return;
        setIsActionLoading(true);
        try {
            await api.stopRedisQueue();
            showToast("Sinal de parada enviado com sucesso. O worker finalizará a mensagem atual e entrará em pausa.");
            onRefresh();
        } catch (err: any) {
            alert(`Erro ao pausar fila: ${err.message}`);
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleClearQueue = async () => {
        if (!window.confirm("ATENÇÃO: Deseja realmente esvaziar TODA a fila pendente do Redis? As mensagens não enviadas serão descartadas.")) return;
        setIsActionLoading(true);
        try {
            await api.clearRedisQueue();
            showToast("Fila do Redis esvaziada e contadores zerados.");
            onRefresh();
        } catch (err: any) {
            alert(`Erro ao limpar fila: ${err.message}`);
        } finally {
            setIsActionLoading(false);
        }
    };

    const effectiveRate = status.rateLimit || customRateLimit || 1.0;
    const msgsPerMinute = Math.round(60 / effectiveRate);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Top Overview Banner */}
            <div className="glass-panel" style={{ padding: '24px', background: '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ background: '#ecfdf5', color: 'var(--primary-color)', padding: '10px', borderRadius: '12px' }}>
                            <Database size={24} />
                        </div>
                        <div>
                            <h2 style={{ fontSize: '1.3rem', fontWeight: 800 }}>Monitor de Fila Redis (Infobip Dispatcher)</h2>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                Fila FIFO inteligente para envios controlados com proteção anti-bloqueio Meta e Rate Limit ajustável.
                            </p>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button 
                            className="btn-secondary"
                            onClick={onRefresh}
                            disabled={isActionLoading}
                        >
                            <RefreshCw size={16} className={isActionLoading ? 'animate-spin' : ''} />
                            Atualizar Status
                        </button>

                        <button 
                            className="btn-danger"
                            onClick={handleStopQueue}
                            disabled={isActionLoading || status.queueLength === 0}
                        >
                            <Pause size={16} />
                            Pausar Fila
                        </button>

                        <button 
                            className="btn-danger"
                            onClick={handleClearQueue}
                            disabled={isActionLoading || status.queueLength === 0}
                            style={{ background: '#fee2e2' }}
                        >
                            <Trash2 size={16} />
                            Limpar Fila
                        </button>
                    </div>
                </div>

                {/* Status Alert if Redis warning exists */}
                {status.warning && (
                    <div style={{ 
                        background: '#fefce8', 
                        border: '1px solid #fef08a', 
                        borderRadius: '12px', 
                        padding: '12px 16px', 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '10px',
                        marginBottom: '20px',
                        color: '#a16207'
                    }}>
                        <AlertTriangle size={18} />
                        <span style={{ fontSize: '0.85rem' }}>{status.warning}</span>
                    </div>
                )}

                {/* Feedback Message */}
                {actionMessage && (
                    <div style={{ 
                        background: '#ecfdf5', 
                        border: '1px solid #a7f3d0', 
                        borderRadius: '12px', 
                        padding: '12px 16px', 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '10px',
                        marginBottom: '20px',
                        color: '#065f46'
                    }}>
                        <CheckCircle2 size={18} />
                        <span style={{ fontSize: '0.85rem' }}>{actionMessage}</span>
                    </div>
                )}

                {/* Stat Cards Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                    
                    {/* Card 1: Fila Pendente */}
                    <div className="glass-card" style={{ padding: '20px', background: '#ffffff', borderTop: '3px solid var(--primary-color)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Fila Pendente</span>
                            <Clock size={18} color="var(--primary-color)" />
                        </div>
                        <div style={{ fontSize: '2.2rem', fontWeight: 900, color: status.queueLength > 0 ? 'var(--primary-color)' : 'var(--text-main)' }}>
                            {status.queueLength.toLocaleString('pt-BR')}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                            Mensagens na fila <code>dispatch_queue</code>
                        </div>
                    </div>

                    {/* Card 2: Estado do Worker */}
                    <div className="glass-card" style={{ padding: '20px', background: '#ffffff', borderTop: `3px solid ${status.isRunning ? 'var(--status-approved)' : '#94a3b8'}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Worker Status</span>
                            <Zap size={18} color={status.isRunning ? 'var(--status-approved)' : '#94a3b8'} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
                            <span style={{ 
                                width: '12px', 
                                height: '12px', 
                                borderRadius: '50%', 
                                background: status.isRunning ? 'var(--status-approved)' : '#94a3b8',
                                boxShadow: status.isRunning ? '0 0 10px #16a34a' : 'none'
                            }} />
                            <span style={{ fontSize: '1.25rem', fontWeight: 800, color: status.isRunning ? 'var(--status-approved)' : 'var(--text-muted)' }}>
                                {status.isRunning ? 'EM DISPARO' : 'OCIOSO / AGUARDANDO'}
                            </span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '8px' }}>
                            Delay atual: <strong>{effectiveRate}s</strong> por mensagem
                        </div>
                    </div>

                    {/* Card 3: Mensagens Processadas */}
                    <div className="glass-card" style={{ padding: '20px', background: '#ffffff', borderTop: '3px solid #10b981' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Total Processado</span>
                            <CheckCircle2 size={18} color="var(--status-approved)" />
                        </div>
                        <div style={{ fontSize: '2.2rem', fontWeight: 900, color: 'var(--text-main)' }}>
                            {status.processed.toLocaleString('pt-BR')}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                            Gravadas em <code>engine_logs</code>
                        </div>
                    </div>

                    {/* Card 4: Rate Limit Aberto */}
                    <div className="glass-card" style={{ padding: '20px', background: '#ffffff', borderTop: '3px solid #3b82f6' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Taxa de Disparo</span>
                            <Gauge size={18} color="#3b82f6" />
                        </div>
                        <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#1d4ed8', marginTop: '2px' }}>
                            {effectiveRate}s <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-dim)' }}>/ msg</span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '6px' }}>
                            ~{msgsPerMinute} mensagens por minuto
                        </div>
                    </div>

                </div>

                {/* RATE LIMIT OPEN CONTROLLER PANEL (Solicitado pelo usuário: em aberto, suporte a 0.5s) */}
                <div style={{
                    background: '#f8fafc',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '12px',
                    padding: '18px 22px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '16px'
                }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Sliders size={18} color="var(--primary-color)" />
                            <strong style={{ fontSize: '1rem', color: 'var(--text-main)' }}>
                                Controle de Rate Limit (Delay entre Mensagens)
                            </strong>
                        </div>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                            Defina o intervalo em segundos entre cada disparo do worker. Você pode usar valores rápidos como <strong>0.5s</strong> ou intervalos mais seguros.
                        </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        {/* Preset buttons */}
                        <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                                onClick={() => handleSaveRateLimit(0.5)}
                                style={{
                                    padding: '6px 12px',
                                    borderRadius: '8px',
                                    border: effectiveRate === 0.5 ? '2px solid var(--primary-color)' : '1px solid var(--border-subtle)',
                                    background: effectiveRate === 0.5 ? '#ecfdf5' : '#ffffff',
                                    color: effectiveRate === 0.5 ? 'var(--primary-color)' : 'var(--text-main)',
                                    fontSize: '0.8rem',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                }}
                            >
                                ⚡ 0.5s (Turbo)
                            </button>

                            <button
                                onClick={() => handleSaveRateLimit(1.0)}
                                style={{
                                    padding: '6px 12px',
                                    borderRadius: '8px',
                                    border: effectiveRate === 1.0 ? '2px solid var(--primary-color)' : '1px solid var(--border-subtle)',
                                    background: effectiveRate === 1.0 ? '#ecfdf5' : '#ffffff',
                                    color: effectiveRate === 1.0 ? 'var(--primary-color)' : 'var(--text-main)',
                                    fontSize: '0.8rem',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                }}
                            >
                                1.0s
                            </button>

                            <button
                                onClick={() => handleSaveRateLimit(1.5)}
                                style={{
                                    padding: '6px 12px',
                                    borderRadius: '8px',
                                    border: effectiveRate === 1.5 ? '2px solid var(--primary-color)' : '1px solid var(--border-subtle)',
                                    background: effectiveRate === 1.5 ? '#ecfdf5' : '#ffffff',
                                    color: effectiveRate === 1.5 ? 'var(--primary-color)' : 'var(--text-main)',
                                    fontSize: '0.8rem',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                }}
                            >
                                1.5s (Padrão)
                            </button>
                        </div>

                        {/* Custom Input */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <input 
                                type="number"
                                min="0.1"
                                max="10.0"
                                step="0.1"
                                className="form-input"
                                value={customRateLimit}
                                onChange={(e) => setCustomRateLimit(parseFloat(e.target.value) || 0.5)}
                                style={{ width: '80px', padding: '6px 10px', textAlign: 'center', fontWeight: 800 }}
                            />
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>segundos</span>
                            
                            <button
                                className="btn-primary"
                                onClick={() => handleSaveRateLimit(customRateLimit)}
                                disabled={isSavingRateLimit}
                                style={{ fontSize: '0.8rem', padding: '6px 14px' }}
                            >
                                {isSavingRateLimit ? 'Salvando...' : 'Aplicar'}
                            </button>
                        </div>
                    </div>
                </div>

            </div>

            {/* Architecture Details Box */}
            <div className="glass-card" style={{ padding: '20px', fontSize: '0.85rem', lineHeight: '1.6', color: 'var(--text-muted)', background: '#ffffff' }}>
                <h3 style={{ color: 'var(--text-main)', fontSize: '0.98rem', fontWeight: 700, marginBottom: '8px' }}>
                    💡 Sobre o Rate Limit Dinâmico:
                </h3>
                <p>
                    • <strong>0.5 segundos:</strong> Dispara aproximadamente ~120 mensagens por minuto. Ideal para campanhas com alto volume quando os números possuem boa reputação na Meta.
                </p>
                <p>
                    • <strong>1.0 a 1.5 segundos:</strong> Intervalo seguro recomendado para evitar bloqueios ou "throttling" da API da Meta/Infobip.
                </p>
                <p>
                    • O valor é salvo instantaneamente na chave <code>dispatch_rate_limit</code> do Redis e aplicado em tempo real pelo worker sem necessidade de reiniciar.
                </p>
            </div>

        </div>
    );
};
