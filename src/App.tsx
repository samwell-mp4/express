import React, { useState, useEffect, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { WabaRegistry } from './components/WabaRegistry';
import { SenderManager } from './components/SenderManager';
import { VariableMapper } from './components/VariableMapper';
import { QueueConfirmModal } from './components/QueueConfirmModal';
import { RedisMonitor } from './components/RedisMonitor';
import { DispatchRecords } from './components/DispatchRecords';
import { BmControl } from './components/BmControl';
import { TemplateGallery } from './components/TemplateGallery';
import { ClientUpload } from './components/ClientUpload';
import { TemplateCreatorWizard } from './components/TemplateCreatorWizard';
import { SpreadsheetCleaner } from './components/SpreadsheetCleaner';
import { MediaHostingManager } from './components/MediaHostingManager';
import { LinkRotatorManager } from './components/LinkRotatorManager';
import { EmbeddedSenderSignup } from './components/EmbeddedSenderSignup';
import { FolderOpen, Bookmark, Copy, X, Search, CheckCircle2, Trash2 } from 'lucide-react';
import { ParsedContact, SenderConfig, PlaceholderMapping, RedisQueueStatus, AppTab, ClientSubmission } from './types';
import { api } from './services/api';
import { wabaStorage } from './services/wabaStorage';
import { bmSheetService } from './services/bmSheetService';
import { templateService } from './services/templateService';
import { templateHelper } from './services/templateHelper';
import { clientSubmissionStorage } from './services/clientSubmissionStorage';
import { Login } from './components/Login';

const isLocalhost = typeof window !== 'undefined' && (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname.endsWith('.local')
);

export const App: React.FC = () => {
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
        if (isLocalhost) return true;
        return !!localStorage.getItem('auth_token');
    });

    useEffect(() => {
        if (isLocalhost && !localStorage.getItem('auth_token')) {
            localStorage.setItem('auth_token', 'dev_localhost_token');
            localStorage.setItem('auth_user', JSON.stringify({
                id: 1,
                name: 'Desenvolvedor Local',
                email: 'dev@localhost',
                role: 'ADMIN',
                isAdmin: true
            }));
        }
    }, []);

    // Current Active View Tab: 'upload-clientes' | 'create-template' | 'spreadsheet-cleaner' | 'media-hosting' | 'bms' | 'registry' | 'dispatch' | 'monitor'
    const [activeTab, setActiveTab] = useState<AppTab>('upload-clientes');

    // Active Campaign / Contacts State
    const [contacts, setContacts] = useState<ParsedContact[]>([]);
    const [headers, setHeaders] = useState<string[]>([]);
    const [targetUrl, setTargetUrl] = useState('');
    const [mediaUrl, setMediaUrl] = useState('');
    const [selectedClient, setSelectedClient] = useState(() => {
        const now = new Date();
        const d = `${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        const t = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
        return `Campanha_${d}_${t}`;
    });

    // Senders Configuration (BM Luiz)
    const [senders, setSenders] = useState<SenderConfig[]>([
        {
            id: '1',
            label: 'Remetente 1',
            senderNumber: '',
            limit: 250,
            templateName: '',
            templateLanguage: 'pt_BR',
            templates: [],
            headerType: 'NONE',
            mediaUrl: ''
        }
    ]);

    // Variables Placeholders Mapping ({{1}}, {{2}})
    const [mappings, setMappings] = useState<PlaceholderMapping[]>([
        { id: 1, type: 'column', columnName: 'nome', fixedValue: '' },
        { id: 2, type: 'column', columnName: '', fixedValue: '' }
    ]);

    // Redis Queue Status State
    const [redisStatus, setRedisStatus] = useState<RedisQueueStatus>({
        queueLength: 0,
        isRunning: false,
        processed: 0
    });
    const pollingRef = useRef<any>(null);

    // Confirmation Modal State
    const [showConfirmModal, setShowConfirmModal] = useState(false);

    // Saved WABA Count State
    const [wabaCount, setWabaCount] = useState<number>(() => wabaStorage.getSavedWabas().length);

    // BM Records Count State
    const [bmCount, setBmCount] = useState<number>(() => {
        const cached = bmSheetService.getCached();
        return cached ? cached.records.length : 0;
    });

    // Meta Templates Count State
    const [templatesCount, setTemplatesCount] = useState<number>(() => {
        const cached = templateService.getCached();
        return cached ? cached.templates.length : 0;
    });

    // Initial Load & Event Listener for WABAs
    useEffect(() => {
        refreshRedisStatus();
        const saved = wabaStorage.getSavedWabas();
        setWabaCount(saved.length);

        if (saved.length > 0 && senders.length === 1 && !senders[0].senderNumber) {
            const first = saved[0];
            setSenders([{
                id: '1',
                label: first.label,
                senderNumber: first.number,
                limit: first.defaultLimit || 250,
                templateName: first.templateName || '',
                templateLanguage: 'pt_BR',
                templates: first.templates || [],
                headerType: first.headerType || 'NONE',
                mediaUrl: first.mediaUrl || ''
            }]);
        }

        const handleStorageUpdate = () => {
            const currentSaved = wabaStorage.getSavedWabas();
            setWabaCount(currentSaved.length);
        };

        window.addEventListener('waba_storage_updated', handleStorageUpdate);
        window.addEventListener('storage', handleStorageUpdate);

        return () => {
            window.removeEventListener('waba_storage_updated', handleStorageUpdate);
            window.removeEventListener('storage', handleStorageUpdate);
        };
    }, []);

    // Polling Redis status when active
    useEffect(() => {
        if (redisStatus.isRunning || redisStatus.queueLength > 0 || activeTab === 'redis') {
            if (!pollingRef.current) {
                pollingRef.current = setInterval(refreshRedisStatus, 3000);
            }
        } else {
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
            }
        }

        return () => {
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
            }
        };
    }, [redisStatus.isRunning, redisStatus.queueLength, activeTab]);

    const refreshRedisStatus = async () => {
        try {
            const st = await api.getRedisQueueStatus();
            setRedisStatus(st);
        } catch (err) {
            console.warn('Erro ao atualizar status Redis:', err);
        }
    };

    const handleQueueSuccess = () => {
        setShowConfirmModal(false);
        setActiveTab('monitor');
        refreshRedisStatus();
        const now = new Date();
        const d = `${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        const t = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
        setSelectedClient(`Campanha_${d}_${t}`);
    };

    const handleSelectNumberForDispatch = (number: string, bmName: string) => {
        setSenders(prev => {
            if (prev.length > 0) {
                const next = [...prev];
                next[0] = { ...next[0], senderNumber: number, label: bmName ? `BM ${bmName}` : next[0].label };
                return next;
            }
            return [{
                id: '1',
                label: bmName ? `BM ${bmName}` : 'Remetente 1',
                senderNumber: number,
                limit: 250,
                templateName: '',
                templateLanguage: 'pt_BR',
                templates: [],
                headerType: 'NONE',
                mediaUrl: ''
            }];
        });
        setActiveTab('dispatch');
    };

    const handleSelectNumberForRegistry = (_number: string, _bmName: string) => {
        setActiveTab('registry');
    };

    const currentActiveTemplate = senders[0]?.templateName || 'ivo_01';
    const currentHeaderType = senders[0]?.headerType || 'NONE';
    const availableTemplates = senders[0]?.templates || [];

    const handleSelectTemplateForDispatch = (templateName: string) => {
        const analysis = templateHelper.analyzeTemplate(templateName, null, availableTemplates);
        setSenders(prev => {
            if (prev.length > 0) {
                return prev.map(s => ({
                    ...s,
                    templateName,
                    headerType: analysis.headerType || 'NONE',
                    mediaUrl: s.mediaUrl || mediaUrl
                }));
            }
            return prev;
        });

        const newMappings = templateHelper.generateMappingsForVariables(analysis.variablesCount, mappings, headers);
        setMappings(newMappings);
        setActiveTab('dispatch');
    };

    const handleTemplateChangeFromMapper = (newTemplateName: string) => {
        const analysis = templateHelper.analyzeTemplate(newTemplateName, null, availableTemplates);
        setSenders(prev => prev.map(s => ({
            ...s,
            templateName: newTemplateName,
            headerType: analysis.headerType || 'NONE',
            mediaUrl: s.mediaUrl || mediaUrl
        })));
        const newMappings = templateHelper.generateMappingsForVariables(analysis.variablesCount, mappings, headers);
        setMappings(newMappings);
    };

    const handleHeaderTypeChangeFromMapper = (hType: 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'TEXT' | 'NONE') => {
        setSenders(prev => prev.map(s => ({ ...s, headerType: hType })));
    };

    const handleMediaUrlChange = (url: string) => {
        setMediaUrl(url);
        setSenders(prev => prev.map(s => ({ ...s, mediaUrl: url })));
    };

    const handleSenderTemplateSelected = (chosenName: string, _hType: 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'TEXT' | 'NONE') => {
        const analysis = templateHelper.analyzeTemplate(chosenName, null, availableTemplates);
        const newMappings = templateHelper.generateMappingsForVariables(analysis.variablesCount, mappings, headers);
        setMappings(newMappings);
    };

    const handleContactsFromUpload = (loadedContacts: ParsedContact[], loadedHeaders: string[], clientName: string) => {
        setContacts(loadedContacts);
        setHeaders(loadedHeaders);
        setSelectedClient(clientName || 'Lista de Clientes Sanitizada');
        const analysis = templateHelper.analyzeTemplate(currentActiveTemplate, null, availableTemplates);
        const newMappings = templateHelper.generateMappingsForVariables(analysis.variablesCount, mappings, loadedHeaders);
        setMappings(newMappings);
        setActiveTab('dispatch');
    };

    // Multi-Remetente Draft & Duplicate State
    const [showLoadDraftModal, setShowLoadDraftModal] = useState(false);
    const [savedDraftsList, setSavedDraftsList] = useState<ClientSubmission[]>([]);
    const [draftSearchQuery, setDraftSearchQuery] = useState('');
    const [draftTabFilter, setDraftTabFilter] = useState<'ALL' | 'RASCUNHO'>('ALL');
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    const showToast = (msg: string) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(null), 3500);
    };

    const handleSaveDraftFromDispatch = async () => {
        const campaignName = selectedClient.trim() || `Rascunho_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}_${new Date().toLocaleTimeString('pt-BR').slice(0, 5)}`;
        const primarySender = senders[0]?.senderNumber ? senders[0].senderNumber.replace(/\D/g, '') : '';
        const ddd = primarySender.length >= 4 ? primarySender.slice(2, 4) : '11';

        const newDraft: Partial<ClientSubmission> = {
            campaign_name: campaignName,
            profile_name: campaignName,
            client_name: campaignName,
            ddd,
            sender_phone: senders.map(s => s.senderNumber).filter(Boolean).join(', ') || primarySender,
            template_type: currentHeaderType === 'IMAGE' ? 'IMAGE' : (currentHeaderType === 'VIDEO' ? 'VIDEO' : 'TEXT'),
            media_url: mediaUrl,
            button_link: targetUrl || '',
            status: 'RASCUNHO',
            contacts,
            headers,
            validCount: contacts.length,
            totalRows: contacts.length,
            variables: mappings.map(m => m.columnName || m.fixedValue || ''),
            ads: [{
                id: '1',
                ad_name: campaignName,
                sender_phone: senders.map(s => s.senderNumber).filter(Boolean).join(', ') || primarySender,
                template_type: currentHeaderType === 'IMAGE' ? 'IMAGE' : (currentHeaderType === 'VIDEO' ? 'VIDEO' : 'TEXT'),
                message_mode: 'manual',
                media_url: mediaUrl,
                ad_copy: `Template: ${currentActiveTemplate}`,
                button_link: targetUrl || '',
                variables: mappings.map(m => m.columnName || m.fixedValue || '')
            }]
        };

        try {
            await clientSubmissionStorage.createSubmission(newDraft);
            showToast(`✓ Campanha "${campaignName}" salva como Rascunho com sucesso!`);
        } catch (e: any) {
            alert(`Erro ao salvar rascunho: ${e.message}`);
        }
    };

    const handleDuplicateFromDispatch = () => {
        const baseName = selectedClient.trim() || 'Campanha';
        const newClientName = baseName.includes('(Cópia)') ? `${baseName} 2` : `${baseName} (Cópia)`;
        setSelectedClient(newClientName);
        showToast(`✓ Configuração duplicada como "${newClientName}"!`);
    };

    const handleOpenLoadDraftModal = async () => {
        try {
            const list = await clientSubmissionStorage.getSubmissions();
            setSavedDraftsList(list);
            setShowLoadDraftModal(true);
        } catch (e) {
            console.warn('Erro ao carregar rascunhos:', e);
        }
    };

    const handleLoadSubmissionIntoDispatch = (sub: ClientSubmission) => {
        if (sub.contacts && sub.contacts.length > 0) {
            setContacts(sub.contacts);
            setHeaders(sub.headers || ['Telefone', 'Nome']);
        }
        setSelectedClient(sub.campaign_name || sub.profile_name || 'Campanha');
        if (sub.media_url) {
            setMediaUrl(sub.media_url);
            setSenders(prev => prev.map(s => ({ ...s, mediaUrl: sub.media_url })));
        }
        if (sub.button_link) {
            setTargetUrl(sub.button_link);
        }
        setShowLoadDraftModal(false);
        showToast(`✓ Campanha "${sub.campaign_name || sub.profile_name}" carregada no Multi-Remetente!`);
    };

    const savedWabas = wabaStorage.getSavedWabas();

    if (!isAuthenticated && !isLocalhost) {
        return (
            <Login onLoginSuccess={() => {
                setIsAuthenticated(true);
            }} />
        );
    }

    return (
        <div className="app-layout">
            {/* Sidebar Navigation */}
            <Sidebar 
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                redisStatus={redisStatus}
                onRefreshRedis={refreshRedisStatus}
                contactCount={contacts.length}
                wabaCount={wabaCount}
                bmCount={bmCount}
                templatesCount={templatesCount}
            />

            {/* Main Content Area */}
            <main className="main-content">
                {/* TAB: UPLOAD DE CLIENTES */}
                {activeTab === 'upload-clientes' && (
                    <ClientUpload 
                        onSendToDispatch={handleContactsFromUpload}
                    />
                )}

                {/* TAB: CRIAR TEMPLATE (WIZARD OBJETIVO) */}
                {activeTab === 'create-template' && (
                    <TemplateCreatorWizard 
                        onCreated={(tplName) => handleSelectTemplateForDispatch(tplName)}
                        onCancel={() => setActiveTab('templates')}
                    />
                )}

                {/* TAB: HIGIENIZADOR DE PLANILHAS (COM PURGA AUTOMÁTICA NO DOWNLOAD) */}
                {activeTab === 'spreadsheet-cleaner' && (
                    <SpreadsheetCleaner />
                )}

                {/* TAB: UPLOAD DE MÍDIAS (MEDIA HOSTING - ÚLTIMOS 5 COM COPYBOARD) */}
                {activeTab === 'media-hosting' && (
                    <MediaHostingManager 
                        onSelectMedia={(url) => {
                            setMediaUrl(url);
                            setActiveTab('create-template');
                        }}
                    />
                )}

                {/* TAB: ENCURTADOR & ROTATOR PRO */}
                {activeTab === 'rotator' && (
                    <LinkRotatorManager />
                )}

                {/* TAB: TEMPLATES META (WHATSAPP) */}
                {activeTab === 'templates' && (
                    <TemplateGallery 
                        onSelectTemplateForDispatch={handleSelectTemplateForDispatch}
                    />
                )}

                {/* TAB 0: CONTROLE DE BMS (GOOGLE SHEETS) */}
                {activeTab === 'bms' && (
                    <BmControl 
                        onSelectNumberForDispatch={handleSelectNumberForDispatch}
                        onSelectNumberForRegistry={handleSelectNumberForRegistry}
                    />
                )}

                {/* TAB 1: REGISTRAR WABA */}
                {activeTab === 'registry' && (
                    <WabaRegistry />
                )}

                {/* TAB: CADASTRAR REMETENTE (EMBEDDING) */}
                {activeTab === 'embedded-signup' && (
                    <EmbeddedSenderSignup 
                        onNavigateToDispatch={() => setActiveTab('dispatch')}
                        onNavigateToRegistry={() => setActiveTab('registry')}
                    />
                )}

                {/* TAB 2: MULTI-REMETENTE DISPATCHER */}
                {activeTab === 'dispatch' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                              {/* Header Bar */}
                        <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: '#fff' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '320px', flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary-color)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                        Campanha / Transmissão:
                                    </span>
                                    <span className="badge badge-approved" style={{ fontSize: '11px', height: '20px', padding: '0 6px', borderRadius: '4px', fontWeight: 500 }}>Multi-Remetente</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <input 
                                        type="text"
                                        value={selectedClient}
                                        onChange={(e) => setSelectedClient(e.target.value)}
                                        placeholder="Ex: JVL_Promotora_0510_05"
                                        style={{
                                            fontSize: '16px',
                                            fontWeight: 600,
                                            color: 'var(--text-main)',
                                            padding: '6px 12px',
                                            borderRadius: '6px',
                                            border: '1px solid var(--border-subtle)',
                                            background: '#f8fafc',
                                            width: '100%',
                                            maxWidth: '420px',
                                            outline: 'none'
                                        }}
                                        title="Nome da Campanha para os Relatórios do Monitor e Infobip"
                                    />
                                </div>
                                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                                    {contacts.length > 0 
                                        ? `${contacts.length} contatos carregados e prontos para envio na BM do Luiz.` 
                                        : 'Carregue sua planilha abaixo ou defina seus remetentes para iniciar.'}
                                </p>
                            </div>

                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                <button 
                                    className="btn-secondary" 
                                    onClick={handleOpenLoadDraftModal}
                                    style={{ height: '34px', fontSize: '13px', padding: '0 12px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}
                                    title="Carregar uma campanha ou rascunho salvo"
                                >
                                    <FolderOpen size={14} color="#0284c7" />
                                    Rascunhos & Salvos
                                </button>
                                <button 
                                    className="btn-secondary" 
                                    onClick={handleSaveDraftFromDispatch}
                                    style={{ height: '34px', fontSize: '13px', padding: '0 12px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}
                                    title="Salvar esta configuração como rascunho para continuar depois"
                                >
                                    <Bookmark size={14} color="#d97706" />
                                    Salvar Rascunho
                                </button>
                                <button 
                                    className="btn-secondary" 
                                    onClick={handleDuplicateFromDispatch}
                                    style={{ height: '34px', fontSize: '13px', padding: '0 12px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}
                                    title="Duplicar o nome da campanha e configuração"
                                >
                                    <Copy size={14} color="#059669" />
                                    Duplicar
                                </button>
                                <button 
                                    className="btn-secondary" 
                                    onClick={() => setActiveTab('registry')}
                                    style={{ height: '34px', fontSize: '13px', padding: '0 12px', borderRadius: '6px' }}
                                >
                                    Gerenciar WABAs
                                </button>
                                <button 
                                    className="btn-primary" 
                                    onClick={() => setShowConfirmModal(true)}
                                    disabled={contacts.length === 0}
                                    style={{ height: '34px', fontSize: '13px', padding: '0 14px', borderRadius: '6px' }}
                                >
                                    Revisar & Enfileirar
                                </button>
                            </div>
                        </div>

                        {/* Configuração de Variáveis do Modelo & Cabeçalho de Imagem (Padrão Infobip) */}
                        <VariableMapper 
                            mappings={mappings}
                            setMappings={setMappings}
                            headers={headers}
                            sampleContact={contacts[0]}
                            templateName={currentActiveTemplate}
                            onTemplateChange={handleTemplateChangeFromMapper}
                            availableTemplates={availableTemplates}
                            mediaUrl={mediaUrl}
                            onMediaUrlChange={handleMediaUrlChange}
                            headerType={currentHeaderType}
                            onHeaderTypeChange={handleHeaderTypeChangeFromMapper}
                        />

                        {/* Senders Configuration (Includes Direct Excel Uploader, Saved WABAs & Card/List Views) */}
                        <SenderManager 
                            senders={senders}
                            setSenders={setSenders}
                            contacts={contacts}
                            setContacts={setContacts}
                            setHeaders={setHeaders}
                            mediaUrl={mediaUrl}
                            onMediaUrlChange={handleMediaUrlChange}
                            onTemplateSelected={handleSenderTemplateSelected}
                            onAdvanceToReview={() => setShowConfirmModal(true)}
                        />
                    </div>
                )}

                {/* TAB: MONITOR (Fila Redis & Registros de Envios Unificados em uma página só) */}
                {(activeTab === 'monitor' || activeTab === 'records' || activeTab === 'redis') && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <RedisMonitor 
                            status={redisStatus}
                            onRefresh={refreshRedisStatus}
                        />
                        <DispatchRecords />
                    </div>
                )}

                {/* MODAL: Review & Redis Queue Confirmation */}
                {showConfirmModal && (
                    <QueueConfirmModal 
                        senders={senders}
                        contacts={contacts}
                        mappings={mappings}
                        targetUrl={targetUrl}
                        mediaUrl={mediaUrl}
                        campaignName={selectedClient}
                        onCampaignNameChange={setSelectedClient}
                        onClose={() => setShowConfirmModal(false)}
                        onSuccess={handleQueueSuccess}
                    />
                )}
                {/* MODAL: Carregar Rascunhos / Campanhas Salvas no Multi-Remetente */}
                {showLoadDraftModal && (
                    <div style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(15, 23, 42, 0.75)',
                        backdropFilter: 'blur(8px)',
                        zIndex: 9999,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '20px'
                    }}>
                        <div style={{
                            background: '#FFFFFF',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '12px',
                            width: '100%',
                            maxWidth: '780px',
                            maxHeight: '85vh',
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden',
                            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
                        }}>
                            {/* Modal Header */}
                            <div style={{
                                padding: '16px 20px',
                                borderBottom: '1px solid var(--border-subtle)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                background: '#F8FAFC'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <FolderOpen size={18} color="#0284c7" />
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>
                                            Rascunhos e Campanhas Salvas
                                        </h3>
                                        <p style={{ margin: 0, fontSize: '11.5px', color: '#64748B' }}>
                                            Selecione um rascunho para carregar no Multi-Remetente com contatos, variáveis e mídia.
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowLoadDraftModal(false)}
                                    style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: '4px' }}
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Search and Filter */}
                            <div style={{ padding: '12px 20px', borderBottom: '1px solid #F1F5F9', display: 'flex', gap: '10px', alignItems: 'center', background: '#FFFFFF' }}>
                                <div style={{ position: 'relative', flex: 1 }}>
                                    <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                                    <input
                                        type="text"
                                        placeholder="Buscar por nome da campanha..."
                                        value={draftSearchQuery}
                                        onChange={(e) => setDraftSearchQuery(e.target.value)}
                                        style={{
                                            width: '100%',
                                            height: '34px',
                                            paddingLeft: '32px',
                                            paddingRight: '12px',
                                            borderRadius: '6px',
                                            border: '1px solid #CBD5E1',
                                            fontSize: '12.5px',
                                            outline: 'none'
                                        }}
                                    />
                                </div>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <button
                                        type="button"
                                        onClick={() => setDraftTabFilter('ALL')}
                                        style={{
                                            padding: '0 12px',
                                            height: '34px',
                                            borderRadius: '6px',
                                            fontSize: '12px',
                                            fontWeight: 600,
                                            border: draftTabFilter === 'ALL' ? '1px solid #0284c7' : '1px solid #CBD5E1',
                                            background: draftTabFilter === 'ALL' ? '#F0F9FF' : '#FFFFFF',
                                            color: draftTabFilter === 'ALL' ? '#0369A1' : '#475569',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Todas ({savedDraftsList.length})
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setDraftTabFilter('RASCUNHO')}
                                        style={{
                                            padding: '0 12px',
                                            height: '34px',
                                            borderRadius: '6px',
                                            fontSize: '12px',
                                            fontWeight: 600,
                                            border: draftTabFilter === 'RASCUNHO' ? '1px solid #9333EA' : '1px solid #CBD5E1',
                                            background: draftTabFilter === 'RASCUNHO' ? '#FAF5FF' : '#FFFFFF',
                                            color: draftTabFilter === 'RASCUNHO' ? '#7E22CE' : '#475569',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        }}
                                    >
                                        <Bookmark size={13} color="#9333EA" />
                                        Rascunhos ({savedDraftsList.filter(s => s.status === 'RASCUNHO').length})
                                    </button>
                                </div>
                            </div>

                            {/* List of Submissions */}
                            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {(() => {
                                    const filtered = savedDraftsList.filter(s => {
                                        const matchFilter = draftTabFilter === 'ALL' || s.status === draftTabFilter;
                                        const name = (s.campaign_name || s.profile_name || '').toLowerCase();
                                        const matchSearch = !draftSearchQuery || name.includes(draftSearchQuery.toLowerCase());
                                        return matchFilter && matchSearch;
                                    });

                                    if (filtered.length === 0) {
                                        return (
                                            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94A3B8' }}>
                                                <FolderOpen size={36} color="#CBD5E1" style={{ margin: '0 auto 10px', display: 'block' }} />
                                                <p style={{ margin: 0, fontSize: '13px', fontWeight: 600 }}>Nenhum rascunho ou campanha encontrado.</p>
                                                <p style={{ margin: '4px 0 0', fontSize: '11.5px' }}>Use o botão "Salvar Rascunho" no Multi-Remetente para criar o seu primeiro!</p>
                                            </div>
                                        );
                                    }

                                    return filtered.map(sub => {
                                        const isDraft = sub.status === 'RASCUNHO';
                                        const contactsCount = (sub.contacts ? sub.contacts.length : 0) || sub.validCount || 0;
                                        return (
                                            <div
                                                key={sub.id}
                                                style={{
                                                    padding: '12px 16px',
                                                    borderRadius: '8px',
                                                    border: isDraft ? '1px solid #E9D5FF' : '1px solid #E2E8F0',
                                                    background: isDraft ? '#FAF5FF' : '#FFFFFF',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    gap: '12px'
                                                }}
                                            >
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <strong style={{ fontSize: '13.5px', color: '#0F172A' }}>
                                                            {sub.campaign_name || sub.profile_name}
                                                        </strong>
                                                        <span style={{
                                                            fontSize: '10.5px',
                                                            padding: '1px 7px',
                                                            borderRadius: '999px',
                                                            fontWeight: 700,
                                                            background: isDraft ? '#F3E8FF' : '#EFF6FF',
                                                            color: isDraft ? '#7E22CE' : '#1D4ED8',
                                                            border: isDraft ? '1px solid #D8B4FE' : '1px solid #BFDBFE'
                                                        }}>
                                                            {sub.status || 'PENDENTE'}
                                                        </span>
                                                    </div>
                                                    <span style={{ fontSize: '11px', color: '#64748B' }}>
                                                        {contactsCount} contatos • Criado em: {new Date(sub.timestamp || Date.now()).toLocaleDateString('pt-BR')} {sub.template_type ? `• Tipo: ${sub.template_type}` : ''}
                                                    </span>
                                                </div>

                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setSelectedClient(`${sub.campaign_name || sub.profile_name} (Cópia)`);
                                                            if (sub.contacts) setContacts(sub.contacts);
                                                            if (sub.headers) setHeaders(sub.headers);
                                                            if (sub.media_url) setMediaUrl(sub.media_url);
                                                            setShowLoadDraftModal(false);
                                                            showToast(`✓ Cópia da campanha criada no Multi-Remetente!`);
                                                        }}
                                                        style={{
                                                            height: '30px',
                                                            padding: '0 10px',
                                                            borderRadius: '5px',
                                                            border: '1px solid #CBD5E1',
                                                            background: '#FFFFFF',
                                                            color: '#475569',
                                                            fontSize: '11.5px',
                                                            fontWeight: 600,
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '4px'
                                                        }}
                                                        title="Duplicar esta configuração"
                                                    >
                                                        <Copy size={12} color="#059669" />
                                                        Duplicar
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleLoadSubmissionIntoDispatch(sub)}
                                                        style={{
                                                            height: '30px',
                                                            padding: '0 12px',
                                                            borderRadius: '5px',
                                                            border: 'none',
                                                            background: 'var(--primary-color)',
                                                            color: '#07090E',
                                                            fontSize: '11.5px',
                                                            fontWeight: 700,
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '5px'
                                                        }}
                                                    >
                                                        <CheckCircle2 size={13} />
                                                        Carregar no Multi-Remetente
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    });
                                })()}
                            </div>

                            {/* Modal Footer */}
                            <div style={{
                                padding: '12px 20px',
                                borderTop: '1px solid var(--border-subtle)',
                                background: '#F8FAFC',
                                display: 'flex',
                                justifyContent: 'flex-end'
                            }}>
                                <button
                                    type="button"
                                    onClick={() => setShowLoadDraftModal(false)}
                                    className="btn-secondary"
                                    style={{ height: '32px', padding: '0 14px', fontSize: '12px' }}
                                >
                                    Fechar
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Global Toast Notification */}
                {toastMessage && (
                    <div style={{
                        position: 'fixed',
                        bottom: '24px',
                        right: '24px',
                        background: '#0F172A',
                        color: '#FFFFFF',
                        padding: '12px 20px',
                        borderRadius: '8px',
                        boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
                        fontSize: '13px',
                        fontWeight: 600,
                        zIndex: 99999,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        border: '1px solid #334155'
                    }}>
                        <CheckCircle2 size={16} color="#10B981" />
                        {toastMessage}
                    </div>
                )}
            </main>
        </div>
    );
};

export default App;
