import React, { useState } from 'react';
import { X, Database, CheckCircle2, AlertTriangle, ArrowRight, ShieldCheck, Smartphone, Send } from 'lucide-react';
import { SenderConfig, ParsedContact, PlaceholderMapping, InfobipQueueMessage } from '../types';
import { api, LUIS_KEY, LUIS_BASE } from '../services/api';
import { excelService } from '../services/excelService';

interface QueueConfirmModalProps {
    senders: SenderConfig[];
    contacts: ParsedContact[];
    mappings: PlaceholderMapping[];
    targetUrl: string;
    mediaUrl: string;
    onClose: () => void;
    onSuccess: () => void;
}

export const QueueConfirmModal: React.FC<QueueConfirmModalProps> = ({
    senders,
    contacts,
    mappings,
    targetUrl,
    mediaUrl,
    onClose,
    onSuccess
}) => {
    const [isEnqueuing, setIsEnqueuing] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const [errorMsg, setErrorMsg] = useState('');
    const [isDone, setIsDone] = useState(false);
    const [selectedRateLimit, setSelectedRateLimit] = useState(0.5);

    // Compute partitions
    const partitionedSenders = excelService.partitionContacts(contacts, senders);
    const activePartitions = partitionedSenders.filter(s => s.allocatedContacts && s.allocatedContacts.length > 0);
    const totalAllocated = activePartitions.reduce((acc, s) => acc + (s.allocatedContacts?.length || 0), 0);

    // Build all queue messages
    const buildMessages = (): InfobipQueueMessage[] => {
        const messages: InfobipQueueMessage[] = [];

        activePartitions.forEach(s => {
            const senderNum = s.senderNumber.replace(/\D/g, '');
            const contactsList = s.allocatedContacts || [];

            contactsList.forEach(c => {
                const placeholders = mappings.map(m => {
                    if (m.type === 'column') {
                        if (m.columnName === 'nome') return c.nome || 'Cliente';
                        if (m.columnName === 'telefone') return c.telefone;
                        return c[m.columnName] || '';
                    }
                    return m.fixedValue || '';
                });

                const templateData: any = {};
                if (placeholders.length > 0) {
                    templateData.body = { placeholders };
                }
                if (s.headerType !== 'NONE' && (s.mediaUrl || mediaUrl)) {
                    templateData.header = {
                        type: s.headerType,
                        mediaUrl: s.mediaUrl || mediaUrl
                    };
                }

                messages.push({
                    from: senderNum,
                    to: c.telefone,
                    content: {
                        templateName: s.templateName || 'template_padrao',
                        templateData: Object.keys(templateData).length > 0 ? templateData : undefined,
                        language: s.templateLanguage || 'pt_BR'
                    },
                    _apiKey: LUIS_KEY,
                    _baseUrl: LUIS_BASE
                });
            });
        });

        return messages;
    };

    const handleConfirmDispatch = async () => {
        setErrorMsg('');
        const allMessages = buildMessages();

        if (allMessages.length === 0) {
            setErrorMsg('Nenhuma mensagem para enfileirar. Verifique os remetentes e a lista de contatos.');
            return;
        }

        setIsEnqueuing(true);
        setProgress({ current: 0, total: allMessages.length });

        // 1. Set Rate Limit in Redis (e.g. 0.5s)
        try {
            await api.setRedisRateLimit(selectedRateLimit);
        } catch (e) {
            console.warn('Erro ao salvar rate limit:', e);
        }

        // 2. Enqueue in batches of 200 for optimal throughput
        const batchSize = 200;
        let sent = 0;

        try {
            for (let i = 0; i < allMessages.length; i += batchSize) {
                const batch = allMessages.slice(i, i + batchSize);
                await api.enqueueMessages(batch, LUIS_KEY, LUIS_BASE);
                sent += batch.length;
                setProgress({ current: sent, total: allMessages.length });
            }

            // 3. Save to live records in localStorage for the "Registro" tab
            try {
                const newRecords = allMessages.map((m, idx) => ({
                    id: `disp_${Date.now()}_${idx}`,
                    timestamp: new Date().toISOString(),
                    recipient: m.to,
                    senderNumber: m.from,
                    templateName: m.content.templateName,
                    status: 'SENT' as const
                }));

                const existingRaw = localStorage.getItem('express_live_dispatch_records');
                const existing = existingRaw ? JSON.parse(existingRaw) : [];
                localStorage.setItem('express_live_dispatch_records', JSON.stringify([...newRecords, ...existing].slice(0, 1000)));
            } catch (storageErr) {
                console.warn('Erro ao salvar registros locais:', storageErr);
            }

            setIsDone(true);
        } catch (err: any) {
            console.error('Queue error:', err);
            setErrorMsg(err.message || 'Falha ao conectar com o endpoint de fila Redis (/api/dispatch/queue).');
        } finally {
            setIsEnqueuing(false);
        }
    };

    const sampleMessage = buildMessages()[0];

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '20px'
        }}>
            <div className="glass-panel" style={{
                width: '100%',
                maxWidth: '720px',
                maxHeight: '90vh',
                overflowY: 'auto',
                padding: '28px',
                position: 'relative',
                background: '#ffffff',
                boxShadow: 'var(--shadow-float)'
            }}>
                
                {/* Close Button */}
                <button 
                    onClick={onClose}
                    disabled={isEnqueuing}
                    style={{
                        position: 'absolute',
                        top: '20px',
                        right: '20px',
                        background: '#f1f5f9',
                        border: 'none',
                        color: 'var(--text-muted)',
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >
                    <X size={18} />
                </button>

                {/* Modal Title */}
                <div style={{ marginBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="badge badge-approved">Etapa Final</span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontWeight: 600 }}>Confirmação de Fila</span>
                    </div>
                    <h2 style={{ fontSize: '1.45rem', fontWeight: 900, marginTop: '6px', color: 'var(--text-main)' }}>
                        Confirmar Envio para a Fila Redis
                    </h2>
                    <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                        Os disparos serão enfileirados e enviados sequencialmente pelo worker via Infobip.
                    </p>
                </div>

                {/* Error Banner */}
                {errorMsg && (
                    <div style={{ 
                        background: '#fef2f2', 
                        border: '1px solid #fecaca', 
                        padding: '12px 16px', 
                        borderRadius: '10px', 
                        marginBottom: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        color: '#dc2626',
                        fontSize: '0.85rem'
                    }}>
                        <AlertTriangle size={18} />
                        <span>{errorMsg}</span>
                    </div>
                )}

                {/* Success Banner */}
                {isDone ? (
                    <div style={{ textAlign: 'center', padding: '30px 10px' }}>
                        <div style={{ 
                            background: '#dcfce7', 
                            color: '#15803d', 
                            width: '64px', 
                            height: '64px', 
                            borderRadius: '50%', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            margin: '0 auto 16px' 
                        }}>
                            <CheckCircle2 size={36} />
                        </div>
                        <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-main)' }}>
                            {progress.current} Mensagens Enfileiradas com Sucesso!
                        </h3>
                        <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginTop: '8px', maxWidth: '480px', margin: '8px auto 24px' }}>
                            Os disparos estão alocados na fila <code>dispatch_queue</code> do Redis e serão enviados na BM do Luiz com intervalo de 1.5s.
                        </p>
                        <button className="btn-primary" onClick={onSuccess} style={{ padding: '12px 28px', fontSize: '0.95rem' }}>
                            Acompanhar no Monitor de Fila
                        </button>
                    </div>
                ) : (
                    <>
                        {/* Summary Stats Grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '18px' }}>
                            <div className="glass-card" style={{ padding: '14px', background: '#f8fafc' }}>
                                <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)', display: 'block' }}>Total de Mensagens</span>
                                <strong style={{ fontSize: '1.35rem', color: 'var(--primary-color)' }}>{totalAllocated}</strong>
                            </div>

                            <div className="glass-card" style={{ padding: '14px', background: '#f8fafc' }}>
                                <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)', display: 'block' }}>Remetentes Ativos</span>
                                <strong style={{ fontSize: '1.35rem', color: 'var(--text-main)' }}>{activePartitions.length}</strong>
                            </div>

                            <div className="glass-card" style={{ padding: '14px', background: '#f8fafc' }}>
                                <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)', display: 'block' }}>Conta Destino</span>
                                <strong style={{ fontSize: '0.95rem', color: 'var(--accent-cyan)', display: 'block', marginTop: '4px' }}>BM do Luiz</strong>
                            </div>
                        </div>

                        {/* Remetentes Allocation Table */}
                        <div className="glass-card" style={{ padding: '14px', marginBottom: '18px', maxHeight: '180px', overflowY: 'auto' }}>
                            <h4 style={{ fontSize: '0.82rem', color: 'var(--text-dim)', marginBottom: '8px', textTransform: 'uppercase', fontWeight: 700 }}>
                                Distribuição de Cargas por Remetente
                            </h4>
                            <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse', textAlign: 'left' }}>
                                <thead>
                                    <tr style={{ color: 'var(--text-dim)', borderBottom: '1px solid var(--border-subtle)' }}>
                                        <th style={{ padding: '6px 8px' }}>REMETENTE (FROM)</th>
                                        <th style={{ padding: '6px 8px' }}>TEMPLATE</th>
                                        <th style={{ padding: '6px 8px', textAlign: 'right' }}>MENSAGENS</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {activePartitions.map((p, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '8px', color: 'var(--text-main)', fontWeight: 600 }}>{p.senderNumber}</td>
                                            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>{p.templateName || 'Padrão'}</td>
                                            <td style={{ padding: '8px', textAlign: 'right', color: 'var(--primary-color)', fontWeight: 700 }}>
                                                {p.allocatedContacts?.length || 0}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Payload Preview */}
                        {sampleMessage && (
                            <div style={{ marginBottom: '18px' }}>
                                <span style={{ fontSize: '0.76rem', color: 'var(--text-dim)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>
                                    Amostra do Payload Enviado à Infobip (1º Contato):
                                </span>
                                <pre style={{
                                    background: '#0f172a',
                                    padding: '12px',
                                    borderRadius: '10px',
                                    fontSize: '0.74rem',
                                    fontFamily: 'monospace',
                                    color: '#cbd5e1',
                                    overflowX: 'auto'
                                }}>
                                    {JSON.stringify({
                                        from: sampleMessage.from,
                                        to: sampleMessage.to,
                                        content: sampleMessage.content
                                    }, null, 2)}
                                </pre>
                            </div>
                        )}

                        {/* Progress Bar while enqueuing */}
                        {isEnqueuing && (
                            <div style={{ marginBottom: '18px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                                    <span>Enfileirando no Redis...</span>
                                    <span>{progress.current} / {progress.total}</span>
                                </div>
                                <div style={{ height: '8px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden' }}>
                                    <div style={{ 
                                        height: '100%', 
                                        width: `${(progress.current / (progress.total || 1)) * 100}%`,
                                        background: 'var(--primary-color)',
                                        transition: 'width 0.2s'
                                    }} />
                                </div>
                            </div>
                        )}

                        {/* Rate Limit Selector */}
                        <div style={{
                            background: '#f8fafc',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '10px',
                            padding: '12px 16px',
                            marginBottom: '18px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '10px'
                        }}>
                            <div>
                                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)', display: 'block' }}>
                                    ⚡ Velocidade do Disparo (Rate Limit):
                                </span>
                                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                                    Intervalo entre o envio de cada mensagem na fila
                                </span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ display: 'flex', gap: '4px' }}>
                                    {[0.5, 1.0, 1.5].map((val) => (
                                        <button
                                            key={val}
                                            type="button"
                                            onClick={() => setSelectedRateLimit(val)}
                                            style={{
                                                padding: '4px 10px',
                                                borderRadius: '6px',
                                                border: selectedRateLimit === val ? '2px solid var(--primary-color)' : '1px solid var(--border-subtle)',
                                                background: selectedRateLimit === val ? '#ecfdf5' : '#ffffff',
                                                color: selectedRateLimit === val ? 'var(--primary-color)' : 'var(--text-main)',
                                                fontSize: '0.76rem',
                                                fontWeight: 700,
                                                cursor: 'pointer'
                                            }}
                                        >
                                            {val === 0.5 ? '⚡ 0.5s Turbo' : `${val}s`}
                                        </button>
                                    ))}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <input 
                                        type="number"
                                        min="0.1"
                                        max="5.0"
                                        step="0.1"
                                        className="form-input"
                                        value={selectedRateLimit}
                                        onChange={(e) => setSelectedRateLimit(parseFloat(e.target.value) || 0.5)}
                                        style={{ width: '65px', padding: '4px 8px', fontSize: '0.8rem', textAlign: 'center', fontWeight: 700 }}
                                    />
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>s</span>
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px' }}>
                            <button className="btn-secondary" onClick={onClose} disabled={isEnqueuing}>
                                Cancelar
                            </button>
                            <button 
                                className="btn-primary" 
                                onClick={handleConfirmDispatch} 
                                disabled={isEnqueuing || totalAllocated === 0}
                                style={{ padding: '12px 24px' }}
                            >
                                <Send size={16} />
                                {isEnqueuing ? 'Enfileirando...' : 'Iniciar Envio para o Redis'}
                            </button>
                        </div>
                    </>
                )}

            </div>
        </div>
    );
};
