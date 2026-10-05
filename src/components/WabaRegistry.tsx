import React, { useState, useEffect } from 'react';
import { Smartphone, Plus, Trash2, Copy, Edit3, RefreshCw, LayoutGrid, List as ListIcon, ShieldCheck, CheckCircle2, AlertTriangle, Layers, Save, X } from 'lucide-react';
import { SavedWaba, InfobipTemplateSummary } from '../types';
import { wabaStorage } from '../services/wabaStorage';
import { api, LUIS_BASE } from '../services/api';
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
    const [formHeaderType, setFormHeaderType] = useState<'NONE' | 'IMAGE' | 'VIDEO' | 'TEXT'>('NONE');
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
                    padding: '10px 16px',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '13px',
                    fontWeight: 500,
                    boxShadow: 'var(--shadow-subtle)'
                }}>
                    <CheckCircle2 size={16} color="#059669" />
                    <span>{feedbackMsg}</span>
                </div>
            )}

            {/* Top Bar with Title and Actions */}
            <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px', borderRadius: '8px', background: '#FFFFFF', border: '1px solid var(--border-subtle)' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-main)', letterSpacing: '-0.01em', margin: 0 }}>
                            Registrar WABA
                        </h2>
                        <span className="badge badge-approved" style={{ fontSize: '11px', height: '20px', padding: '0 8px', borderRadius: '4px', fontWeight: 500 }}>
                            {wabas.length} {wabas.length === 1 ? 'Salva' : 'Salvas'}
                        </span>
                    </div>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '3px', margin: 0 }}>
                        Gerencie e salve seus números oficiais de WhatsApp. Registros preservados no navegador.
                    </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {/* View Switcher: Card or List */}
                    <div style={{ display: 'flex', alignItems: 'center', background: '#f1f5f9', padding: '2px', borderRadius: '6px' }}>
                        <button 
                            onClick={() => setViewMode('card')}
                            style={{
                                padding: '5px 10px',
                                borderRadius: '4px',
                                background: viewMode === 'card' ? '#ffffff' : 'transparent',
                                color: viewMode === 'card' ? 'var(--text-main)' : 'var(--text-muted)',
                                border: 'none',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px',
                                fontSize: '12px',
                                fontWeight: 500,
                                boxShadow: viewMode === 'card' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
                            }}
                        >
                            <LayoutGrid size={14} />
                            Cards
                        </button>
                        <button 
                            onClick={() => setViewMode('list')}
                            style={{
                                padding: '5px 10px',
                                borderRadius: '4px',
                                background: viewMode === 'list' ? '#ffffff' : 'transparent',
                                color: viewMode === 'list' ? 'var(--text-main)' : 'var(--text-muted)',
                                border: 'none',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px',
                                fontSize: '12px',
                                fontWeight: 500,
                                boxShadow: viewMode === 'list' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
                            }}
                        >
                            <ListIcon size={14} />
                            Lista
                        </button>
                    </div>

                    <button className="btn-primary" onClick={handleOpenCreate} style={{ height: '34px', fontSize: '13px', padding: '0 12px', borderRadius: '6px' }}>
                        <Plus size={15} />
                        Nova WABA
                    </button>
                </div>
            </div>

            {/* Empty State */}
            {wabas.length === 0 ? (
                <div className="glass-card" style={{ padding: '48px 20px', textAlign: 'center', background: '#fff', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                    <Smartphone size={32} color="var(--primary-color)" style={{ margin: '0 auto 12px', opacity: 0.8 }} />
                    <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-main)', margin: '0 0 6px 0' }}>
                        Nenhuma WABA registrada ainda
                    </h3>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '400px', margin: '0 auto 16px' }}>
                        Cadastre suas WABAs oficiais para que fiquem salvas permanentemente e prontas para uso no disparador em massa.
                    </p>
                    <button className="btn-primary" onClick={handleOpenCreate} style={{ height: '34px', fontSize: '13px', padding: '0 14px', borderRadius: '6px' }}>
                        <Plus size={15} />
                        Cadastrar Primeira WABA
                    </button>
                </div>
            ) : viewMode === 'card' ? (
                /* CARD VIEW */
                <div className="grid-cols-auto">
                    {wabas.map(waba => (
                        <div key={waba.id} className="glass-card" style={{ padding: '16px', background: '#fff', borderRadius: '8px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            
                            {/* Card Header */}
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                                <div>
                                    <h4 style={{ fontSize: '14.5px', fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>
                                        {waba.label}
                                    </h4>
                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '3px' }}>
                                        <ShieldCheck size={13} color="var(--primary-color)" />
                                        {waba.accountName || 'BM do Luiz'}
                                    </span>
                                </div>

                                <span className="badge badge-approved" style={{ fontSize: '11px', height: '20px', padding: '0 6px', borderRadius: '4px', fontWeight: 500 }}>
                                    Salvo
                                </span>
                            </div>

                            {/* Phone number display */}
                            <div style={{ background: '#f8fafc', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                                <span style={{ fontSize: '11px', color: 'var(--text-dim)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Número Remetente</span>
                                <strong style={{ fontSize: '14px', color: 'var(--text-main)', letterSpacing: '0.3px', fontWeight: 600 }}>
                                    {waba.number}
                                </strong>
                            </div>

                            {/* Details */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
                                <div style={{ background: '#f8fafc', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                                    <span style={{ color: 'var(--text-dim)', fontSize: '11px', display: 'block' }}>Cota Padrão:</span>
                                    <strong style={{ color: 'var(--text-main)', fontSize: '13px', fontWeight: 600 }}>{waba.defaultLimit} msgs</strong>
                                </div>

                                <div style={{ background: '#f8fafc', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                                    <span style={{ color: 'var(--text-dim)', fontSize: '11px', display: 'block' }}>Template:</span>
                                    <strong style={{ color: 'var(--text-main)', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', fontWeight: 500 }}>
                                        {waba.templateName || 'Não definido'}
                                    </strong>
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div style={{ 
                                marginTop: 'auto', 
                                paddingTop: '10px', 
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
                                    style={{ padding: '4px 10px', height: '30px', fontSize: '12px', gap: '4px', borderRadius: '6px' }}
                                >
                                    <Copy size={12} />
                                    Duplicar
                                </button>

                                <div style={{ display: 'flex', gap: '4px' }}>
                                    <button 
                                        className="btn-secondary"
                                        onClick={() => handleOpenEdit(waba)}
                                        title="Editar WABA"
                                        style={{ height: '30px', width: '30px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px' }}
                                    >
                                        <Edit3 size={13} />
                                    </button>

                                    <button 
                                        onClick={() => handleDelete(waba.id)}
                                        style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', height: '30px', width: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px' }}
                                        title="Remover WABA"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>

                        </div>
                    ))}
                </div>
            ) : (
                /* LIST VIEW */
                <div className="glass-panel" style={{ overflowX: 'auto', padding: '0', background: '#fff', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', background: '#F8FAFC' }}>
                                <th style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>RÓTULO</th>
                                <th style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>NÚMERO WHATSAPP</th>
                                <th style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>CONTA BM</th>
                                <th style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>TEMPLATE PADRÃO</th>
                                <th style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'right' }}>COTA</th>
                                <th style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center' }}>AÇÕES</th>
                            </tr>
                        </thead>
                        <tbody>
                            {wabas.map(waba => (
                                <tr key={waba.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s' }}>
                                    <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-main)' }}>
                                        {waba.label}
                                    </td>
                                    <td style={{ padding: '10px 14px', fontWeight: 500, fontFamily: 'monospace', fontSize: '12.5px' }}>
                                        {waba.number}
                                    </td>
                                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>
                                        {waba.accountName || 'BM do Luiz'}
                                    </td>
                                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>
                                        {waba.templateName || '—'}
                                    </td>
                                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: 'var(--text-main)' }}>
                                        {waba.defaultLimit}
                                    </td>
                                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                            <button 
                                                className="btn-secondary" 
                                                onClick={() => handleDuplicate(waba.id)}
                                                style={{ height: '28px', padding: '0 8px', fontSize: '12px', borderRadius: '4px' }}
                                            >
                                                <Copy size={11} />
                                                Duplicar
                                            </button>
                                            <button 
                                                className="btn-secondary" 
                                                onClick={() => handleOpenEdit(waba)}
                                                style={{ height: '28px', width: '28px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}
                                                title="Editar"
                                            >
                                                <Edit3 size={12} />
                                            </button>
                                            <button 
                                                onClick={() => handleDelete(waba.id)}
                                                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', height: '28px', width: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                title="Excluir"
                                            >
                                                <Trash2 size={13} />
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
                    background: 'rgba(15, 23, 42, 0.45)',
                    backdropFilter: 'blur(3px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1100,
                    padding: '16px'
                }}>
                    <div className="glass-panel" style={{ width: '100%', maxWidth: '480px', padding: '22px', background: '#fff', borderRadius: '8px', border: '1px solid var(--border-subtle)', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)', position: 'relative' }}>
                        
                        <button 
                            onClick={() => setShowModal(false)}
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

                        <h3 style={{ fontSize: '17px', fontWeight: 600, color: 'var(--text-main)', margin: '0 0 3px 0' }}>
                            {editingWabaId ? 'Editar WABA' : 'Nova WABA Oficial'}
                        </h3>
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 16px 0' }}>
                            Preencha os dados do número de WhatsApp para salvá-lo permanentemente.
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div>
                                <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                                    Nome / Rótulo da WABA
                                </label>
                                <input 
                                    type="text"
                                    placeholder="Ex: WABA Vendas 01"
                                    className="form-input"
                                    style={{ height: '36px', fontSize: '13.5px', borderRadius: '6px' }}
                                    value={formLabel}
                                    onChange={(e) => setFormLabel(e.target.value)}
                                />
                            </div>

                            <div>
                                <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                                    Número de WhatsApp Oficial (com DDD)
                                </label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <input 
                                        type="text"
                                        placeholder="Ex: 5511999990001"
                                        className="form-input"
                                        style={{ height: '36px', fontSize: '13.5px', borderRadius: '6px' }}
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
                                        style={{ whiteSpace: 'nowrap', fontSize: '13px', height: '36px', padding: '0 12px', borderRadius: '6px' }}
                                    >
                                        <RefreshCw size={13} className={isLoadingTemplates ? 'animate-spin' : ''} />
                                        {isLoadingTemplates ? 'Buscando...' : 'Buscar'}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                                    Template Aprovado (Infobip / Meta)
                                </label>
                                {isLoadingTemplates ? (
                                    <div style={{ background: '#f8fafc', padding: '8px 12px', borderRadius: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
                                        Carregando templates aprovados...
                                    </div>
                                ) : templatesList.length > 0 ? (
                                    <select 
                                        className="form-select"
                                        value={formTemplate}
                                        onChange={(e) => setFormTemplate(e.target.value)}
                                        style={{ height: '36px', fontSize: '13.5px', borderRadius: '6px', fontWeight: 500 }}
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
                                        style={{ height: '36px', fontSize: '13.5px', borderRadius: '6px' }}
                                        value={formTemplate}
                                        onChange={(e) => setFormTemplate(e.target.value)}
                                    />
                                )}
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                                        Cota Padrão
                                    </label>
                                    <input 
                                        type="number"
                                        min="1"
                                        className="form-input"
                                        style={{ height: '36px', fontSize: '13.5px', borderRadius: '6px' }}
                                        value={formLimit}
                                        onChange={(e) => setFormLimit(Number(e.target.value))}
                                    />
                                </div>

                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                                        Cabeçalho
                                    </label>
                                    <select 
                                        className="form-select"
                                        value={formHeaderType}
                                        onChange={(e: any) => setFormHeaderType(e.target.value)}
                                        style={{ height: '36px', fontSize: '13.5px', borderRadius: '6px' }}
                                    >
                                        <option value="NONE">Sem Mídia</option>
                                        <option value="IMAGE">Imagem</option>
                                        <option value="VIDEO">Vídeo</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
                            <button className="btn-secondary" onClick={() => setShowModal(false)} style={{ height: '36px', fontSize: '13px', borderRadius: '6px' }}>
                                Cancelar
                            </button>
                            <button className="btn-primary" onClick={handleSaveWaba} style={{ height: '36px', fontSize: '13px', borderRadius: '6px' }}>
                                <Save size={14} />
                                Salvar WABA
                            </button>
                        </div>

                    </div>
                </div>
            )}

        </div>
    );
};
