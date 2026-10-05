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
import { ParsedContact, SenderConfig, PlaceholderMapping, RedisQueueStatus, AppTab } from './types';
import { api } from './services/api';
import { wabaStorage } from './services/wabaStorage';
import { bmSheetService } from './services/bmSheetService';
import { templateService } from './services/templateService';
import { templateHelper } from './services/templateHelper';
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
    const [selectedClient, setSelectedClient] = useState('Campanha Multi-WABA');

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
                    headerType: analysis.headerType === 'IMAGE' ? 'IMAGE' : (analysis.headerType === 'VIDEO' ? 'VIDEO' : 'NONE'),
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
            headerType: analysis.headerType === 'IMAGE' ? 'IMAGE' : (analysis.headerType === 'VIDEO' ? 'VIDEO' : 'NONE'),
            mediaUrl: s.mediaUrl || mediaUrl
        })));
        const newMappings = templateHelper.generateMappingsForVariables(analysis.variablesCount, mappings, headers);
        setMappings(newMappings);
    };

    const handleHeaderTypeChangeFromMapper = (hType: 'IMAGE' | 'VIDEO' | 'TEXT' | 'NONE') => {
        setSenders(prev => prev.map(s => ({ ...s, headerType: hType })));
    };

    const handleMediaUrlChange = (url: string) => {
        setMediaUrl(url);
        setSenders(prev => prev.map(s => ({ ...s, mediaUrl: url })));
    };

    const handleSenderTemplateSelected = (chosenName: string, _hType: 'IMAGE' | 'VIDEO' | 'TEXT' | 'NONE') => {
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

                {/* TAB 2: MULTI-REMETENTE DISPATCHER */}
                {activeTab === 'dispatch' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                              {/* Header Bar */}
                        <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: '#fff' }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                    <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-main)', margin: 0, letterSpacing: '-0.01em' }}>
                                        {selectedClient}
                                    </h2>
                                    <span className="badge badge-approved" style={{ fontSize: '11px', height: '20px', padding: '0 6px', borderRadius: '4px', fontWeight: 500 }}>Painel de Disparo</span>
                                </div>
                                <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
                                    {contacts.length > 0 
                                        ? `${contacts.length} contatos carregados e prontos para envio na BM do Luiz.` 
                                        : 'Carregue sua planilha abaixo ou defina seus remetentes para iniciar.'}
                                </p>
                            </div>

                            <div style={{ display: 'flex', gap: '8px' }}>
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
                        onClose={() => setShowConfirmModal(false)}
                        onSuccess={handleQueueSuccess}
                    />
                )}
            </main>
        </div>
    );
};

export default App;
