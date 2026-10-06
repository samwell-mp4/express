import React, { useState } from 'react';
import { X, Database, CheckCircle2, AlertTriangle, ArrowRight, ShieldCheck, Smartphone, Send, Image as ImageIcon, ExternalLink, Type, FileText } from 'lucide-react';
import { SenderConfig, ParsedContact, PlaceholderMapping, InfobipQueueMessage, DispatchRecord } from '../types';
import { api } from '../services/api';
import { excelService } from '../services/excelService';

interface QueueConfirmModalProps {
    senders: SenderConfig[];
    contacts: ParsedContact[];
    mappings: PlaceholderMapping[];
    targetUrl: string;
    mediaUrl: string;
    campaignName?: string;
    onCampaignNameChange?: (name: string) => void;
    listName?: string;
    onClose: () => void;
    onSuccess: () => void;
}

export const QueueConfirmModal: React.FC<QueueConfirmModalProps> = ({
    senders,
    contacts,
    mappings,
    targetUrl,
    mediaUrl: initialMediaUrl,
    campaignName: propCampaignName,
    onCampaignNameChange,
    listName = 'Lista_Principal',
    onClose,
    onSuccess
}) => {
    const [isEnqueuing, setIsEnqueuing] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const [errorMsg, setErrorMsg] = useState('');
    const [isDone, setIsDone] = useState(false);
    const [selectedRateLimit, setSelectedRateLimit] = useState(0.5);
    const [currentMediaUrl, setCurrentMediaUrl] = useState(initialMediaUrl || '');
    const [campaignName, setCampaignName] = useState(() => {
        return propCampaignName?.trim() || `Campanha_${new Date().toISOString().slice(5, 10).replace('-', '')}_${Math.floor(Math.random() * 90 + 10)}`;
    });
    const [localMappings, setLocalMappings] = useState<PlaceholderMapping[]>(() => {
        return mappings.map(m => ({ ...m }));
    });

    // Compute partitions
    const partitionedSenders = excelService.partitionContacts(contacts, senders);
    const activePartitions = partitionedSenders.filter(s => s.allocatedContacts && s.allocatedContacts.length > 0);
    const totalAllocated = activePartitions.reduce((acc, s) => acc + (s.allocatedContacts?.length || 0), 0);

    // Função de auditoria e inspeção rigorosa do template de cada remetente (Prevenção Erro 7008 Meta)
    const getSenderTemplateDetails = (s: SenderConfig) => {
        const clean = s.senderNumber.replace(/\D/g, '');
        const tObj = s.templates?.find(t => t.name === s.templateName);
        
        // 1. Formato de cabeçalho exigido pelo template aprovado
        let headerFormat: 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'TEXT' | 'NONE' = 'NONE';
        if (tObj?.structure?.header?.format) {
            const fmt = String(tObj.structure.header.format).toUpperCase();
            if (fmt === 'IMAGE' || fmt === 'VIDEO' || fmt === 'DOCUMENT') {
                headerFormat = fmt as any;
            } else if (fmt === 'TEXT') {
                headerFormat = 'TEXT';
            }
        } else if (s.headerType && s.headerType !== 'NONE') {
            headerFormat = s.headerType;
        }

        // 2. Contagem de variáveis aprovadas no corpo do template
        let varCount = localMappings.length;
        let bodyPlaceholders: string[] = [];
        if (tObj?.structure?.body?.text) {
            const matches = tObj.structure.body.text.match(/\{\{\d+\}\}/g) || [];
            varCount = matches.length;
            bodyPlaceholders = matches;
        } else {
            bodyPlaceholders = localMappings.map(m => `{{${m.id}}}`);
        }

        const effectiveMedia = s.mediaUrl || currentMediaUrl || '';
        const isMediaRequired = headerFormat === 'IMAGE' || headerFormat === 'VIDEO' || headerFormat === 'DOCUMENT';
        const hasMedia = !isMediaRequired || Boolean(effectiveMedia.trim());

        return {
            senderNumber: clean,
            label: s.label,
            templateName: s.templateName,
            templateObj: tObj,
            headerFormat,
            isMediaRequired,
            hasMedia,
            effectiveMedia,
            varCount,
            bodyPlaceholders
        };
    };

    // Auditoria de todas as WABAs ativas
    const senderAnalyses = activePartitions.map(getSenderTemplateDetails);

    // Detecção de divergências ou mídia ausente
    const sendersMissingMedia = senderAnalyses.filter(a => a.isMediaRequired && !a.hasMedia);
    const requiresAnyMedia = senderAnalyses.some(a => a.isMediaRequired);
    const isImageMissing = sendersMissingMedia.length > 0;

    // Divergência de contagem de variáveis entre remetentes
    const uniqueVarCounts = Array.from(new Set(senderAnalyses.map(a => a.varCount)));
    const hasVarDivergence = uniqueVarCounts.length > 1;

    // Divergência de tipo de cabeçalho entre remetentes
    const uniqueHeaderFormats = Array.from(new Set(senderAnalyses.map(a => a.headerFormat)));
    const hasHeaderDivergence = uniqueHeaderFormats.length > 1;

    // Detectar se alguma variável mapeada está sem preenchimento
    const unconfiguredVariables = localMappings.filter(m => {
        if (m.type === 'fixed') return !m.fixedValue || !m.fixedValue.trim();
        if (m.type === 'column') return !m.columnName;
        return false;
    });

    const updateLocalMapping = (id: number, updates: Partial<PlaceholderMapping>) => {
        setLocalMappings(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
    };

    // Helper para obter valor de variável do contato de maneira segura e tolerante
    const resolveContactVar = (c: ParsedContact, colName: string, fallback: string): string => {
        if (!colName) return fallback;
        const trimmed = colName.trim();
        const lower = trimmed.toLowerCase();

        if (lower === 'nome' || lower === 'cliente' || lower === 'destinatario') {
            return c.nome || c[trimmed] || c[lower] || fallback;
        }
        if (lower === 'telefone' || lower === 'celular' || lower === 'whatsapp') {
            return c.telefone || c[trimmed] || c[lower] || fallback;
        }
        if (c[trimmed] !== undefined && c[trimmed] !== null && String(c[trimmed]).trim() !== '') {
            return String(c[trimmed]).trim();
        }
        if (c[lower] !== undefined && c[lower] !== null && String(c[lower]).trim() !== '') {
            return String(c[lower]).trim();
        }
        const matchingKey = Object.keys(c).find(k => k.trim().toLowerCase() === lower);
        if (matchingKey && c[matchingKey] !== undefined && c[matchingKey] !== null && String(c[matchingKey]).trim() !== '') {
            return String(c[matchingKey]).trim();
        }
        return fallback;
    };

    // Build all queue messages com auto-correção estrita por WABA
    const buildMessages = (batchCampaignId?: string): InfobipQueueMessage[] => {
        const messages: InfobipQueueMessage[] = [];
        const effectiveBatchId = batchCampaignId || `cmp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

        activePartitions.forEach(s => {
            const senderNum = s.senderNumber.replace(/\D/g, '');
            const contactsList = s.allocatedContacts || [];
            const analysis = getSenderTemplateDetails(s);
            const expectedVarsCount = analysis.varCount;
            const requiredHeader = analysis.headerFormat;
            const effectiveMediaUrl = analysis.effectiveMedia;

            contactsList.forEach(c => {
                // Coleta de valores mapeados
                const rawValues = localMappings.map((m, idx) => {
                    let val = '';
                    const safeFallback = m.fixedValue?.trim() || (idx === 0 ? (c.nome || 'Cliente') : `Valor ${idx + 1}`);

                    if (m.type === 'column') {
                        val = resolveContactVar(c, m.columnName, safeFallback);
                    } else {
                        val = m.fixedValue?.trim() || safeFallback;
                    }

                    if (!val || !val.trim()) {
                        val = safeFallback;
                    }

                    return val.trim();
                });

                // AUTO-CORREÇÃO DE PARÂMETROS POR REMETENTE (Prevenção definitiva do Erro 7008):
                // Corta ou completa os placeholders para bater EXATAMENTE com a quantidade que o template desta WABA exige!
                let finalPlaceholders: string[] = [];
                if (expectedVarsCount > 0) {
                    finalPlaceholders = rawValues.slice(0, expectedVarsCount);
                    while (finalPlaceholders.length < expectedVarsCount) {
                        const nextId = finalPlaceholders.length + 1;
                        finalPlaceholders.push(`Valor ${nextId}`);
                    }
                }

                const templateData: any = {};
                if (finalPlaceholders.length > 0) {
                    templateData.body = { placeholders: finalPlaceholders };
                }

                // Envia cabeçalho apenas se o template daquele remetente exigir e houver URL
                if ((requiredHeader === 'IMAGE' || requiredHeader === 'VIDEO' || requiredHeader === 'DOCUMENT') && effectiveMediaUrl) {
                    templateData.header = {
                        type: requiredHeader,
                        mediaUrl: effectiveMediaUrl
                    };
                }

                messages.push({
                    from: senderNum,
                    to: c.telefone,
                    campaignId: effectiveBatchId,
                    campaign_id: effectiveBatchId,
                    campaignName: campaignName.trim(),
                    campaign_name: campaignName.trim(),
                    listName: listName || 'Lista_Principal',
                    mediaUrl: effectiveMediaUrl,
                    headerType: requiredHeader,
                    content: {
                        templateName: s.templateName || 'template_padrao',
                        templateData: Object.keys(templateData).length > 0 ? templateData : undefined,
                        language: s.templateLanguage || 'pt_BR'
                    }
                });
            });
        });

        return messages;
    };

    const handleConfirmDispatch = async () => {
        setErrorMsg('');

        if (isImageMissing) {
            const missingNumbers = sendersMissingMedia.map(s => `${s.senderNumber} (${s.headerFormat})`).join(', ');
            setErrorMsg(`O template selecionado requer mídia de cabeçalho. O(s) remetente(s) [${missingNumbers}] estão sem URL de mídia. Por favor, preencha a URL da Imagem/Mídia abaixo antes de enviar.`);
            return;
        }

        if (unconfiguredVariables.length > 0) {
            const varsList = unconfiguredVariables.map(v => `{{${v.id}}}`).join(', ');
            setErrorMsg(`Atenção: A variável ${varsList} está vazia. O WhatsApp rejeita o envio de templates com variáveis vazias ("must not be empty"). Preencha abaixo.`);
            return;
        }

        const campaignBatchId = `cmp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const allMessages = buildMessages(campaignBatchId);

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
                await api.enqueueMessages(batch);
                sent += batch.length;
                setProgress({ current: sent, total: allMessages.length });
            }

            // 3. Save to live records in localStorage for the "Registro" tab
            try {
                const newRecords: DispatchRecord[] = allMessages.map((m, idx) => ({
                    id: `disp_${Date.now()}_${idx}`,
                    transmissionId: `tx_${Date.now()}_${idx}`,
                    campaignId: campaignBatchId,
                    campaignName: campaignName.trim(),
                    listName: listName || 'Lista_Principal',
                    timestamp: new Date().toISOString(),
                    recipient: m.to,
                    senderNumber: m.from,
                    templateName: m.content.templateName,
                    status: 'SENT' as const,
                    deliveryReason: 'SENT_TO_NETWORK',
                    errorGroup: 'No Errors',
                    errorName: 'No Error (code 0)',
                    operator: api.detectOperator(m.to),
                    mediaUrl: m.mediaUrl || currentMediaUrl || '',
                    headerType: m.headerType || 'NONE'
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
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '16px'
        }}>
            <div className="glass-panel" style={{
                width: '100%',
                maxWidth: '720px',
                maxHeight: '90vh',
                overflowY: 'auto',
                padding: '24px',
                position: 'relative',
                background: '#ffffff',
                borderRadius: '10px',
                border: '1px solid var(--border-subtle)',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)'
            }}>
                
                {/* Close Button */}
                <button 
                    onClick={onClose}
                    disabled={isEnqueuing}
                    style={{
                        position: 'absolute',
                        top: '16px',
                        right: '16px',
                        background: '#f1f5f9',
                        border: 'none',
                        color: 'var(--text-muted)',
                        width: '28px',
                        height: '28px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >
                    <X size={15} />
                </button>

                {/* Modal Title */}
                <div style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span className="badge badge-approved" style={{ fontSize: '11px', height: '20px', padding: '0 6px', borderRadius: '4px', fontWeight: 600 }}>Etapa Final</span>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>Confirmação de Transmissão</span>
                    </div>
                    <h2 style={{ fontSize: '18px', fontWeight: 600, marginTop: '4px', margin: '4px 0 0 0', color: 'var(--text-main)', letterSpacing: '-0.01em' }}>
                        Revisar & Enfileirar Disparos no Redis
                    </h2>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                        Os disparos serão enfileirados e enviados sequencialmente pelo worker via Infobip com as variáveis e mídia mapeadas.
                    </p>
                </div>

                {/* Identificação da Campanha */}
                <div style={{ 
                    background: '#f8fafc', 
                    border: '1px solid #e2e8f0', 
                    borderRadius: '8px', 
                    padding: '12px 14px', 
                    marginBottom: '16px' 
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <FileText size={15} color="var(--primary-color)" />
                            Nome da Campanha / Transmissão:
                        </label>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            Para relatórios no Monitor (Estilo Infobip)
                        </span>
                    </div>
                    <input 
                        type="text"
                        className="form-input"
                        value={campaignName}
                        onChange={(e) => {
                            setCampaignName(e.target.value);
                            if (onCampaignNameChange) onCampaignNameChange(e.target.value);
                        }}
                        placeholder="Ex: JVL_Promotora_0510_05"
                        style={{ width: '100%', height: '36px', fontSize: '13px', borderRadius: '6px', fontWeight: 600, fontFamily: 'inherit' }}
                    />
                </div>

                {/* Error Banner */}
                {errorMsg && (
                    <div style={{ 
                        background: '#fef2f2', 
                        border: '1px solid #fecaca', 
                        padding: '10px 14px', 
                        borderRadius: '6px', 
                        marginBottom: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        color: '#dc2626',
                        fontSize: '13px'
                    }}>
                        <AlertTriangle size={16} />
                        <span>{errorMsg}</span>
                    </div>
                )}

                {/* Success Banner */}
                {isDone ? (
                    <div style={{ textAlign: 'center', padding: '24px 10px' }}>
                        <div style={{ 
                            background: '#dcfce7', 
                            color: '#15803d', 
                            width: '48px', 
                            height: '48px', 
                            borderRadius: '50%', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            margin: '0 auto 12px' 
                        }}>
                            <CheckCircle2 size={24} />
                        </div>
                        <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-main)', margin: '0 0 6px 0' }}>
                            {progress.current} Mensagens Enfileiradas com Sucesso!
                        </h3>
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '440px', margin: '0 auto 18px' }}>
                            Os disparos estão alocados na fila <code>dispatch_queue</code> do Redis e serão enviados na BM do Luiz com intervalo de {selectedRateLimit}s.
                        </p>
                        <button className="btn-primary" onClick={onSuccess} style={{ height: '36px', padding: '0 18px', fontSize: '13px', borderRadius: '6px' }}>
                            Acompanhar no Monitor de Fila
                        </button>
                    </div>
                ) : (
                    <>
                        {/* Summary Stats Grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', marginBottom: '14px' }}>
                            <div className="glass-card" style={{ padding: '10px 12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                                <span style={{ fontSize: '11px', color: 'var(--text-dim)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total de Mensagens</span>
                                <strong style={{ fontSize: '18px', fontWeight: 600, color: 'var(--primary-color)' }}>{totalAllocated}</strong>
                            </div>

                            <div className="glass-card" style={{ padding: '10px 12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                                <span style={{ fontSize: '11px', color: 'var(--text-dim)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Remetentes Ativos</span>
                                <strong style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-main)' }}>{activePartitions.length}</strong>
                            </div>

                            <div className="glass-card" style={{ padding: '10px 12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                                <span style={{ fontSize: '11px', color: 'var(--text-dim)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Variáveis</span>
                                <strong style={{ fontSize: '16px', color: '#0284c7', display: 'block', marginTop: '2px', fontWeight: 600 }}>
                                    {localMappings.length} {localMappings.length === 1 ? 'Variável' : 'Variáveis'}
                                </strong>
                            </div>

                            <div className="glass-card" style={{ padding: '10px 12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                                <span style={{ fontSize: '11px', color: 'var(--text-dim)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Cabeçalho</span>
                                <strong style={{ fontSize: '14px', color: requiresAnyMedia ? '#0369a1' : 'var(--text-main)', display: 'block', marginTop: '2px', fontWeight: 600 }}>
                                    {requiresAnyMedia ? '🖼️ Mídia (Imagem/Vídeo)' : 'Nenhum (Texto)'}
                                </strong>
                            </div>
                        </div>

                        {/* PAINEL DE CONFERÊNCIA DE PARÂMETROS ENTRE WABAS (Prevenção Erro 7008 Meta) */}
                        <div style={{
                            background: '#ffffff',
                            border: `1.5px solid ${isImageMissing ? '#ef4444' : hasVarDivergence ? '#f59e0b' : '#10b981'}`,
                            borderRadius: '8px',
                            padding: '14px',
                            marginBottom: '14px',
                            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.04)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {isImageMissing ? (
                                        <AlertTriangle size={18} color="#ef4444" />
                                    ) : hasVarDivergence ? (
                                        <AlertTriangle size={18} color="#f59e0b" />
                                    ) : (
                                        <CheckCircle2 size={18} color="#10b981" />
                                    )}
                                    <strong style={{ fontSize: '13px', color: 'var(--text-main)' }}>
                                        Conferência de Parâmetros entre WABAs (Prevenção Erro 7008 Meta)
                                    </strong>
                                </div>

                                <span style={{
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    padding: '3px 8px',
                                    borderRadius: '12px',
                                    background: isImageMissing ? '#fef2f2' : hasVarDivergence ? '#fffbeb' : '#ecfdf5',
                                    color: isImageMissing ? '#dc2626' : hasVarDivergence ? '#d97706' : '#059669',
                                    border: `1px solid ${isImageMissing ? '#fca5a5' : hasVarDivergence ? '#fcd34d' : '#a7f3d0'}`
                                }}>
                                    {isImageMissing ? '❌ Ação: Imagem Obrigatória' : hasVarDivergence ? '⚡ Auto-Adaptação Ativa' : '✓ 100% Compatível'}
                                </span>
                            </div>

                            {/* Cards comparativos para cada WABA ativa */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '10px', marginBottom: '8px' }}>
                                {senderAnalyses.map((a, i) => (
                                    <div key={i} style={{
                                        background: '#f8fafc',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '6px',
                                        padding: '10px 12px',
                                        fontSize: '12px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '5px'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <span style={{ fontWeight: 700, color: 'var(--text-main)', fontFamily: 'monospace' }}>
                                                +{a.senderNumber} ({a.label})
                                            </span>
                                            <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                                                Template: <strong>{a.templateName}</strong>
                                            </span>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #f1f5f9', paddingTop: '4px' }}>
                                            <span style={{ color: 'var(--text-muted)' }}>Variáveis no Corpo:</span>
                                            <span style={{ 
                                                fontWeight: 700, 
                                                color: '#0284c7', 
                                                background: '#e0f2fe', 
                                                padding: '1px 6px', 
                                                borderRadius: '4px',
                                                fontFamily: 'monospace'
                                            }}>
                                                {a.varCount} {a.varCount === 1 ? 'variável' : 'variáveis'} ({a.bodyPlaceholders.join(', ') || 'Nenhuma'})
                                            </span>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <span style={{ color: 'var(--text-muted)' }}>Cabeçalho:</span>
                                            <span style={{ 
                                                fontWeight: 600, 
                                                color: a.headerFormat === 'IMAGE' ? '#7c3aed' : a.headerFormat === 'VIDEO' ? '#d97706' : 'var(--text-main)'
                                            }}>
                                                {a.headerFormat === 'IMAGE' ? '🖼️ Imagem (IMAGE)' : a.headerFormat === 'VIDEO' ? '🎥 Vídeo (VIDEO)' : 'Nenhum'}
                                            </span>
                                        </div>

                                        {a.isMediaRequired && (
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <span style={{ color: 'var(--text-muted)' }}>Status da Mídia:</span>
                                                <span style={{ 
                                                    fontWeight: 700, 
                                                    color: a.hasMedia ? '#059669' : '#dc2626'
                                                }}>
                                                    {a.hasMedia ? '✓ Mídia Configurada' : '❌ Falta Imagem!'}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {hasVarDivergence ? (
                                <p style={{ fontSize: '11.5px', color: '#b45309', margin: '4px 0 0 0', lineHeight: 1.4 }}>
                                    💡 <strong>Auto-Correção Ativa:</strong> As WABAs possuem quantidades diferentes de variáveis no template. O sistema ajustará dinamicamente os parâmetros de cada envio (ex: cortando para 2 variáveis na WABA que espera 2), eliminando o risco do erro 7008 da Meta.
                                </p>
                            ) : (
                                <p style={{ fontSize: '11.5px', color: '#059669', margin: '4px 0 0 0', lineHeight: 1.4 }}>
                                    ✓ Todas as WABAs ativas estão com o mesmo número de parâmetros ({uniqueVarCounts[0] || 0} variáveis).
                                </p>
                            )}
                        </div>

                        {/* BLOCO DE VALIDAÇÃO DE VARIÁVEIS PENDENTES */}
                        {unconfiguredVariables.length > 0 && (
                            <div style={{
                                background: '#fffbeb',
                                border: '1.5px solid #f59e0b',
                                borderRadius: '8px',
                                padding: '12px 14px',
                                marginBottom: '14px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                                    <AlertTriangle size={15} color="#d97706" />
                                    <strong style={{ fontSize: '13px', color: '#92400e' }}>
                                        Variáveis Obrigatórias Pendentes ({unconfiguredVariables.length})
                                    </strong>
                                </div>
                                <p style={{ fontSize: '12px', color: '#78350f', margin: '0 0 10px 0' }}>
                                    A Meta/Infobip rejeita mensagens com variáveis vazias (<code>must not be empty</code>). Preencha o valor fixo abaixo:
                                </p>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {unconfiguredVariables.map(v => (
                                        <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ 
                                                background: '#0284c7', 
                                                color: '#fff', 
                                                padding: '2px 6px', 
                                                borderRadius: '4px', 
                                                fontFamily: 'monospace', 
                                                fontSize: '11.5px', 
                                                fontWeight: 700 
                                            }}>
                                                {`{{${v.id}}}`}
                                            </span>
                                            <input 
                                                type="text"
                                                placeholder={`Digite o valor fixo para a variável {{${v.id}}}...`}
                                                className="form-input"
                                                value={v.fixedValue || ''}
                                                onChange={(e) => updateLocalMapping(v.id, { type: 'fixed', fixedValue: e.target.value })}
                                                style={{ flex: 1, height: '32px', fontSize: '12.5px', borderRadius: '6px' }}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* BLOCO DE VALIDAÇÃO DE IMAGEM / MÍDIA SE OBRIGATÓRIA */}
                        {requiresAnyMedia && (
                            <div style={{
                                background: isImageMissing ? '#fffbeb' : '#f0f9ff',
                                border: isImageMissing ? '1.5px solid #f59e0b' : '1px solid #bae6fd',
                                borderRadius: '8px',
                                padding: '12px 14px',
                                marginBottom: '14px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <ImageIcon size={15} color={isImageMissing ? '#d97706' : '#0284c7'} />
                                        <strong style={{ fontSize: '13px', color: isImageMissing ? '#92400e' : '#0369a1' }}>
                                            URL da Imagem Original (Cabeçalho da Infobip)
                                        </strong>
                                    </div>
                                    {isImageMissing && (
                                        <span style={{ fontSize: '10.5px', background: '#fef3c7', color: '#b45309', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                                            Obrigatório
                                        </span>
                                    )}
                                </div>

                                <input 
                                    type="url"
                                    placeholder="https://exemplo.com/imagem-original.jpg"
                                    className="form-input"
                                    value={currentMediaUrl}
                                    onChange={(e) => setCurrentMediaUrl(e.target.value)}
                                    style={{ width: '100%', height: '34px', fontSize: '12.5px', borderRadius: '6px' }}
                                />

                                {currentMediaUrl && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', fontSize: '11.5px' }}>
                                        <span style={{ color: '#16a34a', fontWeight: 600 }}>✓ Imagem configurada</span>
                                        <a href={currentMediaUrl} target="_blank" rel="noreferrer" style={{ color: '#0284c7', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                            Abrir link <ExternalLink size={10} />
                                        </a>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Remetentes Allocation Table */}
                        <div className="glass-card" style={{ padding: '12px', marginBottom: '14px', maxHeight: '140px', overflowY: 'auto', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                            <h4 style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.04em', margin: '0 0 6px 0' }}>
                                Distribuição de Cargas por Remetente
                            </h4>
                            <table style={{ width: '100%', fontSize: '12.5px', borderCollapse: 'collapse', textAlign: 'left' }}>
                                <thead>
                                    <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)', background: '#F8FAFC' }}>
                                        <th style={{ padding: '6px 8px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>REMETENTE (FROM)</th>
                                        <th style={{ padding: '6px 8px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>TEMPLATE</th>
                                        <th style={{ padding: '6px 8px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'right' }}>MENSAGENS</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {activePartitions.map((p, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '6px 8px', color: 'var(--text-main)', fontWeight: 500, fontFamily: 'monospace' }}>{p.senderNumber}</td>
                                            <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{p.templateName || 'Padrão'}</td>
                                            <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-main)', fontWeight: 600 }}>
                                                {p.allocatedContacts?.length || 0}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Payload Preview */}
                        {sampleMessage && (
                            <div style={{ marginBottom: '14px' }}>
                                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    Amostra do Payload Infobip (1º Contato):
                                </span>
                                <pre style={{
                                    background: '#0f172a',
                                    padding: '10px 12px',
                                    borderRadius: '6px',
                                    fontSize: '11.5px',
                                    fontFamily: 'monospace',
                                    color: '#cbd5e1',
                                    overflowX: 'auto',
                                    margin: 0,
                                    maxHeight: '140px'
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
                            <div style={{ marginBottom: '14px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                                    <span>Enfileirando no Redis...</span>
                                    <span>{progress.current} / {progress.total}</span>
                                </div>
                                <div style={{ height: '6px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                                    <div style={{ 
                                        height: '100%', 
                                        width: `${(progress.current / (progress.total || 1)) * 100}%`,
                                        background: 'var(--primary-color)',
                                        transition: 'width 0.15s ease'
                                    }} />
                                </div>
                            </div>
                        )}

                        {/* Rate Limit Selector */}
                        <div style={{
                            background: '#f8fafc',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '6px',
                            padding: '10px 14px',
                            marginBottom: '16px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '8px'
                        }}>
                            <div>
                                <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-main)', display: 'block' }}>
                                    Velocidade do Disparo (Rate Limit):
                                </span>
                                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                    Intervalo entre o envio de cada mensagem na fila
                                </span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <div style={{ display: 'flex', gap: '4px' }}>
                                    {[0.5, 1.0, 1.5].map((val) => (
                                        <button
                                            key={val}
                                            type="button"
                                            onClick={() => setSelectedRateLimit(val)}
                                            style={{
                                                padding: '4px 8px',
                                                borderRadius: '4px',
                                                border: selectedRateLimit === val ? '1px solid var(--primary-color)' : '1px solid var(--border-subtle)',
                                                background: selectedRateLimit === val ? '#ecfdf5' : '#ffffff',
                                                color: selectedRateLimit === val ? 'var(--primary-color)' : 'var(--text-main)',
                                                fontSize: '12px',
                                                fontWeight: 500,
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
                                        style={{ width: '56px', height: '28px', padding: '0 4px', fontSize: '12px', textAlign: 'center', fontWeight: 600, borderRadius: '4px' }}
                                    />
                                    <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>s</span>
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                            <button className="btn-secondary" onClick={onClose} disabled={isEnqueuing} style={{ height: '36px', fontSize: '13px', borderRadius: '6px' }}>
                                Cancelar
                            </button>
                            <button 
                                className="btn-primary" 
                                onClick={handleConfirmDispatch} 
                                disabled={isEnqueuing || totalAllocated === 0 || isImageMissing || unconfiguredVariables.length > 0}
                                style={{ height: '36px', padding: '0 16px', fontSize: '13px', borderRadius: '6px' }}
                                title={isImageMissing ? 'Insira a URL da Imagem Original antes de continuar' : unconfiguredVariables.length > 0 ? 'Preencha as variáveis pendentes' : 'Iniciar disparo'}
                            >
                                <Send size={14} />
                                {isEnqueuing ? 'Enfileirando...' : 'Iniciar Envio para o Redis'}
                            </button>
                        </div>
                    </>
                )}

            </div>
        </div>
    );
};
