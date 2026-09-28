import React, { useState, useEffect } from 'react';
import { Smartphone, Plus, Trash2, Copy, Edit3, RefreshCw, LayoutGrid, List as ListIcon, ShieldCheck, CheckCircle2, AlertTriangle, Layers, Save, X } from 'lucide-react';
import { SavedWaba, InfobipTemplateSummary } from '../types';
import { wabaStorage } from '../services/wabaStorage';
import { api, LUIS_KEY, LUIS_BASE } from '../services/api';
import { excelService } from '../services/excelService';

export const WabaRegistry: React.FC = () => {
    const [wabas, setWabas] = useState<SavedWaba[]>([]);
    const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
    const [showModal, setShowModal] = useState(false);
    const [editingWabaId, setEditingWabaId] = useState<string | null>(null);

    // Form State
    const [formLabel, setFormLabel] = useState('');
    const [formNumber, setFormNumber] = useState('');
    const [formLimit, setFormLimit] = useState(250);
    const [formAccount, setFormAccount] = useState('BM do Luiz');
    const [formTemplate, setFormTemplate] = useState('');
    const [formHeaderType, setFormHeaderType] = useState<'NONE' | 'IMAGE' | 'VIDEO'>('NONE');
    const [templatesList, setTemplatesList] = useState<InfobipTemplateSummary[]>([]);
    const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
    const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

    // Load saved WABAs from localStorage on mount (survives F5)
    useEffect(() => {
        loadWabas();
    }, []);

    const loadWabas = () => {
        const saved = wabaStorage.getSavedWabas();
        setWabas(saved);
    };

    const showToast = (msg: string) => {
        setFeedbackMsg(msg);
        setTimeout(() => setFeedbackMsg(null), 3500);
    };

    // Open modal to create
    const handleOpenCreate = () => {
        setEditingWabaId(null);
        setFormLabel(`WABA Remetente ${wabas.length + 1}`);
        setFormNumber('');
        setFormLimit(250);
        setFormAccount('BM do Luiz');
        setFormTemplate('');
        setFormHeaderType('NONE');
        setTemplatesList([]);
        setShowModal(true);
    };

    // Open modal to edit
    const handleOpenEdit = (waba: SavedWaba) => {
        setEditingWabaId(waba.id);
        setFormLabel(waba.label);
        setFormNumber(waba.number);
        setFormLimit(waba.defaultLimit);
        setFormAccount(waba.accountName || 'BM do Luiz');
        setFormTemplate(waba.templateName || '');
        setFormHeaderType(waba.headerType || 'NONE');
        setTemplatesList(waba.templates || []);
        setShowModal(true);

        if (waba.number) {
            handleFetchTemplates(waba.number);
        }
    };

    // Fetch templates from Infobip
    const handleFetchTemplates = async (num: string) => {
        const clean = num.replace(/\D/g, '');
        if (!clean || clean.length < 8) return;

        setIsLoadingTemplates(true);
        try {
            const list = await api.fetchSenderTemplates(clean);
            setTemplatesList(list);
            if (list.length > 0) {
                if (!formTemplate) setFormTemplate(list[0].name);
                showToast(`✓ ${list.length} templates aprovados encontrados!`);
            } else {
                showToast(`⚠️ Nenhum template retornado para ${clean} nas BMs.`);
            }
        } catch (e: any) {
            console.error('Erro ao buscar templates:', e);
            showToast(`Erro na busca: ${e.message}`);
        } finally {
            setIsLoadingTemplates(false);
        }
    };

    // Save or update WABA
    const handleSaveWaba = () => {
        const cleanNum = excelService.normalizePhone(formNumber);
        if (!cleanNum || cleanNum.length < 10) {
            alert('Por favor, informe um número de WhatsApp válido com DDD.');
            return;
        }

        wabaStorage.saveWaba({
            id: editingWabaId || undefined,
            label: formLabel || `WABA ${cleanNum.slice(-4)}`,
            number: cleanNum,
            defaultLimit: Number(formLimit) || 250,
            accountName: formAccount,
            templateName: formTemplate,
            templateLanguage: 'pt_BR',
            templates: templatesList,
            headerType: formHeaderType
        });

        loadWabas();
        setShowModal(false);
        showToast(editingWabaId ? '✓ WABA atualizada e salva permanentemente!' : '✓ Nova WABA registrada com sucesso!');
    };

    // Duplicate WABA
    const handleDuplicate = (id: string) => {
        const dup = wabaStorage.duplicateWaba(id);
        if (dup) {
            loadWabas();
            showToast(`✓ WABA "${dup.label}" duplicada e salva!`);
        }
    };

    // Delete WABA
    const handleDelete = (id: string) => {
        if (!window.confirm('Tem certeza que deseja remover esta WABA dos seus registros?')) return;
        wabaStorage.deleteWaba(id);
        loadWabas();
        showToast('WABA removida dos registros.');
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Toast feedback */}
            {feedbackMsg && (
                <div style={{
                    background: '#ecfdf5',
                    border: '1px solid #a7f3d0',
                    color: '#065f46',
                    padding: '12px 18px',
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    boxShadow: 'var(--shadow-subtle)'
                }}>
                    <CheckCircle2 size={18} color="#059669" />
                    <span>{feedbackMsg}</span>
                </div>
            )}

            {/* Top Bar with Title and Actions */}
            <div className="glass-panel" style={{ padding: '22px 26px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <h2 style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--text-main)' }}>
                            Registrar WABA
                        </h2>
                        <span className="badge badge-approved" style={{ fontSize: '0.72rem' }}>
                            {wabas.length} {wabas.length === 1 ? 'Salva' : 'Salvas'}
                        </span>
                    </div>
                    <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Gerencie e salve seus números oficiais de WhatsApp. Os registros são preservados no navegador mesmo ao dar F5.
                    </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {/* View Switcher: Card or List */}
                    <div style={{ display: 'flex', alignItems: 'center', background: '#f1f5f9', padding: '3px', borderRadius: '8px' }}>
                        <button 
                            onClick={() => setViewMode('card')}
                            style={{
                                padding: '6px 12px',
                                borderRadius: '6px',
                                background: viewMode === 'card' ? '#ffffff' : 'transparent',
                                color: viewMode === 'card' ? 'var(--primary-color)' : 'var(--text-muted)',
                                border: 'none',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                boxShadow: viewMode === 'card' ? 'var(--shadow-subtle)' : 'none'
                            }}
                        >
                            <LayoutGrid size={15} />
                            Cards
                        </button>
                        <button 
                            onClick={() => setViewMode('list')}
                            style={{
                                padding: '6px 12px',
                                borderRadius: '6px',
                                background: viewMode === 'list' ? '#ffffff' : 'transparent',
                                color: viewMode === 'list' ? 'var(--primary-color)' : 'var(--text-muted)',
                                border: 'none',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                boxShadow: viewMode === 'list' ? 'var(--shadow-subtle)' : 'none'
                            }}
                        >
                            <ListIcon size={15} />
                            Lista
                        </button>
                    </div>

                    <button className="btn-primary" onClick={handleOpenCreate}>
                        <Plus size={16} />
                        Nova WABA
                    </button>
                </div>
            </div>

            {/* Empty State */}
            {wabas.length === 0 ? (
                <div className="glass-card" style={{ padding: '60px 20px', textAlign: 'center', background: '#fff' }}>
                    <Smartphone size={42} color="var(--primary-color)" style={{ margin: '0 auto 16px', opacity: 0.8 }} />
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)' }}>
                        Nenhuma WABA registrada ainda
                    </h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '420px', margin: '8px auto 20px' }}>
                        Cadastre suas WABAs oficiais para que fiquem salvas permanentemente e prontas para uso no disparador em massa.
                    </p>
                    <button className="btn-primary" onClick={handleOpenCreate}>
                        <Plus size={16} />
                        Cadastrar Primeira WABA
                    </button>
                </div>
            ) : viewMode === 'card' ? (
                /* CARD VIEW */
                <div className="grid-cols-auto">
                    {wabas.map(waba => (
                        <div key={waba.id} className="glass-card" style={{ padding: '22px', background: '#fff', borderTop: '4px solid var(--primary-color)', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            
                            {/* Card Header */}
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                                <div>
                                    <h4 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                        {waba.label}
                                    </h4>
                                    <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                                        <ShieldCheck size={13} color="var(--primary-color)" />
                                        {waba.accountName || 'BM do Luiz'}
                                    </span>
                                </div>

                                <span className="badge badge-approved" style={{ fontSize: '0.68rem' }}>
                                    Salvo
                                </span>
                            </div>

                            {/* Phone number display */}
                            <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', display: 'block' }}>Número Remetente</span>
                                <strong style={{ fontSize: '1.15rem', color: 'var(--text-main)', letterSpacing: '0.5px' }}>
                                    {waba.number}
                                </strong>
                            </div>

                            {/* Details */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.8rem' }}>
                                <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                                    <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem', display: 'block' }}>Cota Padrão:</span>
                                    <strong style={{ color: 'var(--primary-color)', fontSize: '0.92rem' }}>{waba.defaultLimit} msgs</strong>
                                </div>

                                <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                                    <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem', display: 'block' }}>Template:</span>
                                    <strong style={{ color: 'var(--text-main)', fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                                        {waba.templateName || 'Não definido'}
                                    </strong>
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div style={{ 
                                marginTop: 'auto', 
                                paddingTop: '12px', 
                                borderTop: '1px solid var(--border-subtle)', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'space-between',
                                gap: '8px'
                            }}>
                                <button
                                    className="btn-secondary"
                                    onClick={() => handleDuplicate(waba.id)}
                                    title="Duplicar WABA"
                                    style={{ padding: '6px 12px', fontSize: '0.78rem', gap: '4px' }}
                                >
                                    <Copy size={13} />
                                    Duplicar
                                </button>

                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <button 
                                        className="btn-secondary"
                                        onClick={() => handleOpenEdit(waba)}
                                        title="Editar WABA"
                                        style={{ padding: '6px 10px' }}
                                    >
                                        <Edit3 size={14} />
                                    </button>

                                    <button 
                                        onClick={() => handleDelete(waba.id)}
                                        style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '6px' }}
                                        title="Remover WABA"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>

                        </div>
                    ))}
                </div>
            ) : (
                /* LIST VIEW */
                <div className="glass-panel" style={{ overflowX: 'auto', padding: '8px', background: '#fff' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-dim)' }}>
                                <th style={{ padding: '12px 16px' }}>RÓTULO</th>
                                <th style={{ padding: '12px 16px' }}>NÚMERO WHATSAPP</th>
                                <th style={{ padding: '12px 16px' }}>CONTA BM</th>
                                <th style={{ padding: '12px 16px' }}>TEMPLATE PADRÃO</th>
                                <th style={{ padding: '12px 16px', textAlign: 'right' }}>COTA</th>
                                <th style={{ padding: '12px 16px', textAlign: 'center' }}>AÇÕES</th>
                            </tr>
                        </thead>
                        <tbody>
                            {wabas.map(waba => (
                                <tr key={waba.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.18s' }}>
                                    <td style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--text-main)' }}>
                                        {waba.label}
                                    </td>
                                    <td style={{ padding: '14px 16px', fontWeight: 600 }}>
                                        {waba.number}
                                    </td>
                                    <td style={{ padding: '14px 16px', color: 'var(--text-muted)' }}>
                                        {waba.accountName || 'BM do Luiz'}
                                    </td>
                                    <td style={{ padding: '14px 16px', color: 'var(--text-muted)' }}>
                                        {waba.templateName || '—'}
                                    </td>
                                    <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--primary-color)' }}>
                                        {waba.defaultLimit}
                                    </td>
                                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                            <button 
                                                className="btn-secondary" 
                                                onClick={() => handleDuplicate(waba.id)}
                                                style={{ padding: '4px 10px', fontSize: '0.74rem' }}
                                            >
                                                <Copy size={12} />
                                                Duplicar
                                            </button>
                                            <button 
                                                className="btn-secondary" 
                                                onClick={() => handleOpenEdit(waba)}
                                                style={{ padding: '4px 8px' }}
                                                title="Editar"
                                            >
                                                <Edit3 size={13} />
                                            </button>
                                            <button 
                                                onClick={() => handleDelete(waba.id)}
                                                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
                                                title="Excluir"
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modal: Criar ou Editar WABA */}
            {showModal && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(15, 23, 42, 0.65)',
                    backdropFilter: 'blur(5px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1100,
                    padding: '20px'
                }}>
                    <div className="glass-panel" style={{ width: '100%', maxWidth: '540px', padding: '28px', background: '#fff', boxShadow: 'var(--shadow-float)', position: 'relative' }}>
                        
                        <button 
                            onClick={() => setShowModal(false)}
                            style={{
                                position: 'absolute',
                                top: '20px',
                                right: '20px',
                                background: '#f1f5f9',
                                border: 'none',
                                color: 'var(--text-muted)',
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                        >
                            <X size={16} />
                        </button>

                        <h3 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '4px' }}>
                            {editingWabaId ? 'Editar WABA' : 'Nova WABA Oficial'}
                        </h3>
                        <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
                            Preencha os dados do número de WhatsApp para salvá-lo permanentemente.
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div>
                                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                                    Nome / Rótulo da WABA
                                </label>
                                <input 
                                    type="text"
                                    placeholder="Ex: WABA Vendas 01"
                                    className="form-input"
                                    value={formLabel}
                                    onChange={(e) => setFormLabel(e.target.value)}
                                />
                            </div>

                            <div>
                                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                                    Número de WhatsApp Oficial (com DDD)
                                </label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <input 
                                        type="text"
                                        placeholder="Ex: 5511999990001"
                                        className="form-input"
                                        value={formNumber}
                                        onChange={(e) => {
                                            setFormNumber(e.target.value);
                                            const clean = e.target.value.replace(/\D/g, '');
                                            if (clean.length >= 10) {
                                                handleFetchTemplates(clean);
                                            }
                                        }}
                                    />
                                    <button 
                                        className="btn-secondary"
                                        onClick={() => handleFetchTemplates(formNumber)}
                                        disabled={isLoadingTemplates || !formNumber}
                                        style={{ whiteSpace: 'nowrap', fontSize: '0.8rem', padding: '8px 14px' }}
                                    >
                                        <RefreshCw size={14} className={isLoadingTemplates ? 'animate-spin' : ''} />
                                        {isLoadingTemplates ? 'Buscando...' : 'Buscar'}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                                    Template Aprovado (Infobip / Meta)
                                </label>
                                {isLoadingTemplates ? (
                                    <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                                        Carregando templates aprovados...
                                    </div>
                                ) : templatesList.length > 0 ? (
                                    <select 
                                        className="form-select"
                                        value={formTemplate}
                                        onChange={(e) => setFormTemplate(e.target.value)}
                                        style={{ fontWeight: 600 }}
                                    >
                                        <option value="">Selecione o template...</option>
                                        {templatesList.map(t => (
                                            <option key={t.name} value={t.name}>
                                                {t.name} ({t.language || 'pt_BR'})
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    <input 
                                        type="text"
                                        placeholder="Nome exato do template aprovado"
                                        className="form-input"
                                        value={formTemplate}
                                        onChange={(e) => setFormTemplate(e.target.value)}
                                    />
                                )}
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                                        Cota Padrão
                                    </label>
                                    <input 
                                        type="number"
                                        min="1"
                                        className="form-input"
                                        value={formLimit}
                                        onChange={(e) => setFormLimit(Number(e.target.value))}
                                    />
                                </div>

                                <div>
                                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                                        Cabeçalho
                                    </label>
                                    <select 
                                        className="form-select"
                                        value={formHeaderType}
                                        onChange={(e: any) => setFormHeaderType(e.target.value)}
                                    >
                                        <option value="NONE">Sem Mídia</option>
                                        <option value="IMAGE">Imagem</option>
                                        <option value="VIDEO">Vídeo</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
                            <button className="btn-secondary" onClick={() => setShowModal(false)}>
                                Cancelar
                            </button>
                            <button className="btn-primary" onClick={handleSaveWaba}>
                                <Save size={15} />
                                Salvar WABA
                            </button>
                        </div>

                    </div>
                </div>
            )}

        </div>
    );
};
