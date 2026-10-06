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
        if (!window.confirm("Deseja pausar o processamento da fila Redis? Os envios serão suspensos até você clicar em Retomar.")) return;
        setIsActionLoading(true);
        try {
            await api.pauseRedisQueue();
            showToast("Fila do Redis pausada com sucesso.");
            onRefresh();
        } catch (err: any) {
            alert(`Erro ao pausar fila: ${err.message}`);
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleResumeQueue = async () => {
        setIsActionLoading(true);
        try {
            await api.resumeRedisQueue();
            showToast("Fila do Redis retomada com sucesso. Processamento reativado.");
            onRefresh();
        } catch (err: any) {
            alert(`Erro ao retomar fila: ${err.message}`);
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {/* Top Overview Banner */}
            <div className="glass-panel" style={{ padding: '18px 22px', background: '#fff', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ background: '#ecfdf5', color: 'var(--primary-color)', width: '36px', height: '36px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Database size={18} />
                        </div>
                        <div>
                            <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-main)', margin: 0, letterSpacing: '-0.01em' }}>Monitor de Fila Redis (Infobip Dispatcher)</h2>
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                                Fila FIFO inteligente para envios controlados com proteção anti-bloqueio Meta e Rate Limit ajustável.
                            </p>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button 
                            className="btn-secondary"
                            onClick={onRefresh}
                            disabled={isActionLoading}
                            style={{ height: '34px', fontSize: '13px', padding: '0 12px', borderRadius: '6px' }}
                        >
                            <RefreshCw size={13} className={isActionLoading ? 'animate-spin' : ''} />
                            Atualizar
                        </button>

                        {status.isPaused ? (
                            <button 
                                className="btn-primary"
                                onClick={handleResumeQueue}
                                disabled={isActionLoading}
                                style={{ background: '#16a34a', height: '34px', fontSize: '13px', padding: '0 12px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                            >
                                <Play size={13} />
                                Retomar Fila
                            </button>
                        ) : (
                            <button 
                                className="btn-danger"
                                onClick={handleStopQueue}
                                disabled={isActionLoading || (status.queueLength === 0 && !status.isRunning)}
                                style={{ height: '34px', fontSize: '13px', padding: '0 12px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                            >
                                <Pause size={13} />
                                Pausar Fila
                            </button>
                        )}

                        <button 
                            className="btn-danger"
                            onClick={handleClearQueue}
                            disabled={isActionLoading || status.queueLength === 0}
                            style={{ background: '#fee2e2', height: '34px', fontSize: '13px', padding: '0 12px', borderRadius: '6px' }}
                        >
                            <Trash2 size={13} />
                            Limpar Fila
                        </button>
                    </div>
                </div>

                {/* Status Alert if Redis warning exists */}
                {status.warning && (
                    <div style={{ 
                        background: '#fefce8', 
                        border: '1px solid #fef08a', 
                        borderRadius: '6px', 
                        padding: '10px 14px', 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '8px',
                        marginBottom: '16px',
                        color: '#a16207'
                    }}>
                        <AlertTriangle size={16} />
                        <span style={{ fontSize: '13px' }}>{status.warning}</span>
                    </div>
                )}

                {/* Feedback Message */}
                {actionMessage && (
                    <div style={{ 
                        background: '#ecfdf5', 
                        border: '1px solid #a7f3d0', 
                        borderRadius: '6px', 
                        padding: '10px 14px', 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '8px',
                        marginBottom: '16px',
                        color: '#065f46'
                    }}>
                        <CheckCircle2 size={16} />
                        <span style={{ fontSize: '13px' }}>{actionMessage}</span>
                    </div>
                )}

                {/* Stat Cards Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                    
                    {/* Card 1: Fila Pendente */}
                    <div className="glass-card" style={{ padding: '14px 16px', background: '#ffffff', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Fila Pendente</span>
                            <Clock size={15} color="var(--primary-color)" />
                        </div>
                        <div style={{ fontSize: '22px', fontWeight: 600, color: status.queueLength > 0 ? 'var(--primary-color)' : 'var(--text-main)' }}>
                            {status.queueLength.toLocaleString('pt-BR')}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '2px' }}>
                            Mensagens na fila <code>dispatch_queue</code>
                        </div>
                    </div>

                    {/* Card 2: Estado do Worker */}
                    <div className="glass-card" style={{ padding: '14px 16px', background: '#ffffff', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Worker Status</span>
                            <Zap size={15} color={status.isPaused ? '#d97706' : status.isRunning ? 'var(--status-approved)' : '#94a3b8'} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                            <span style={{ 
                                width: '8px', 
                                height: '8px', 
                                borderRadius: '50%', 
                                background: status.isPaused ? '#f59e0b' : status.isRunning ? 'var(--status-approved)' : '#94a3b8'
                            }} />
                            <span style={{ fontSize: '15px', fontWeight: 600, color: status.isPaused ? '#d97706' : status.isRunning ? 'var(--status-approved)' : 'var(--text-muted)' }}>
                                {status.isPaused ? '⏸️ PAUSADO' : status.isRunning ? 'EM DISPARO' : 'OCIOSO / AGUARDANDO'}
                            </span>
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '4px' }}>
                            Delay atual: <strong>{effectiveRate}s</strong> por mensagem
                        </div>
                    </div>

                    {/* Card 3: Mensagens Processadas */}
                    <div className="glass-card" style={{ padding: '14px 16px', background: '#ffffff', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Processado</span>
                            <CheckCircle2 size={15} color="var(--status-approved)" />
                        </div>
                        <div style={{ fontSize: '22px', fontWeight: 600, color: 'var(--text-main)' }}>
                            {status.processed.toLocaleString('pt-BR')}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '2px' }}>
                            Gravadas em <code>engine_logs</code>
                        </div>
                    </div>

                    {/* Card 4: Rate Limit Aberto */}
                    <div className="glass-card" style={{ padding: '14px 16px', background: '#ffffff', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Taxa de Disparo</span>
                            <Gauge size={15} color="#3b82f6" />
                        </div>
                        <div style={{ fontSize: '22px', fontWeight: 600, color: 'var(--text-main)', marginTop: '2px' }}>
                            {effectiveRate}s <span style={{ fontSize: '13px', fontWeight: 400, color: 'var(--text-dim)' }}>/ msg</span>
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '2px' }}>
                            ~{msgsPerMinute} mensagens por minuto
                        </div>
                    </div>

                </div>

                {/* RATE LIMIT OPEN CONTROLLER PANEL */}
                <div style={{
                    background: '#f8fafc',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '8px',
                    padding: '14px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px'
                }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Sliders size={15} color="var(--primary-color)" />
                            <strong style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)' }}>
                                Controle de Rate Limit (Delay entre Mensagens)
                            </strong>
                        </div>
                        <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '2px', margin: 0 }}>
                            Defina o intervalo em segundos entre cada disparo do worker (ex: 0.5s Turbo, 1.0s, 1.5s).
                        </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        {/* Preset buttons */}
                        <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                                onClick={() => handleSaveRateLimit(0.5)}
                                style={{
                                    padding: '5px 10px',
                                    borderRadius: '6px',
                                    border: effectiveRate === 0.5 ? '1px solid var(--primary-color)' : '1px solid var(--border-subtle)',
                                    background: effectiveRate === 0.5 ? '#ecfdf5' : '#ffffff',
                                    color: effectiveRate === 0.5 ? 'var(--primary-color)' : 'var(--text-main)',
                                    fontSize: '12px',
                                    fontWeight: 500,
                                    cursor: 'pointer'
                                }}
                            >
                                ⚡ 0.5s (Turbo)
                            </button>

                            <button
                                onClick={() => handleSaveRateLimit(1.0)}
                                style={{
                                    padding: '5px 10px',
                                    borderRadius: '6px',
                                    border: effectiveRate === 1.0 ? '1px solid var(--primary-color)' : '1px solid var(--border-subtle)',
                                    background: effectiveRate === 1.0 ? '#ecfdf5' : '#ffffff',
                                    color: effectiveRate === 1.0 ? 'var(--primary-color)' : 'var(--text-main)',
                                    fontSize: '12px',
                                    fontWeight: 500,
                                    cursor: 'pointer'
                                }}
                            >
                                1.0s
                            </button>

                            <button
                                onClick={() => handleSaveRateLimit(1.5)}
                                style={{
                                    padding: '5px 10px',
                                    borderRadius: '6px',
                                    border: effectiveRate === 1.5 ? '1px solid var(--primary-color)' : '1px solid var(--border-subtle)',
                                    background: effectiveRate === 1.5 ? '#ecfdf5' : '#ffffff',
                                    color: effectiveRate === 1.5 ? 'var(--primary-color)' : 'var(--text-main)',
                                    fontSize: '12px',
                                    fontWeight: 500,
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
                                style={{ width: '60px', height: '32px', padding: '0 6px', textAlign: 'center', fontWeight: 600, fontSize: '13px', borderRadius: '6px' }}
                            />
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>seg</span>
                            
                            <button
                                className="btn-primary"
                                onClick={() => handleSaveRateLimit(customRateLimit)}
                                disabled={isSavingRateLimit}
                                style={{ height: '32px', fontSize: '12.5px', padding: '0 12px', borderRadius: '6px' }}
                            >
                                {isSavingRateLimit ? 'Salvando...' : 'Aplicar'}
                            </button>
                        </div>
                    </div>
                </div>

            </div>

            {/* Architecture Details Box */}
            <div className="glass-card" style={{ padding: '16px 20px', fontSize: '13px', lineHeight: '1.6', color: 'var(--text-muted)', background: '#ffffff', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                <h3 style={{ color: 'var(--text-main)', fontSize: '14.5px', fontWeight: 600, marginBottom: '6px', margin: 0 }}>
                    Sobre o Rate Limit Dinâmico:
                </h3>
                <p style={{ margin: '4px 0' }}>
                    • <strong>0.5 segundos:</strong> Dispara aproximadamente ~120 mensagens por minuto. Ideal para campanhas com alto volume quando os números possuem boa reputação na Meta.
                </p>
                <p style={{ margin: '4px 0' }}>
                    • <strong>1.0 a 1.5 segundos:</strong> Intervalo seguro recomendado para evitar bloqueios ou "throttling" da API da Meta/Infobip.
                </p>
                <p style={{ margin: '4px 0' }}>
                    • O valor é salvo instantaneamente na chave <code>dispatch_rate_limit</code> do Redis e aplicado em tempo real pelo worker sem necessidade de reiniciar.
                </p>
            </div>

        </div>
    );
};
