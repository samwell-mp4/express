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
import { ParsedContact, SenderConfig, PlaceholderMapping, RedisQueueStatus, AppTab } from './types';
import { api } from './services/api';
import { wabaStorage } from './services/wabaStorage';
import { bmSheetService } from './services/bmSheetService';
import { templateService } from './services/templateService';

export const App: React.FC = () => {
    // Current Active View Tab: 'registry' | 'dispatch' | 'records' | 'redis' | 'bms' | 'templates'
    const [activeTab, setActiveTab] = useState<AppTab>('templates');

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
        setActiveTab('records');
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

    const handleSelectTemplateForDispatch = (templateName: string) => {
        setSenders(prev => {
            if (prev.length > 0) {
                const next = [...prev];
                next[0] = { ...next[0], templateName };
                return next;
            }
            return prev;
        });
        setActiveTab('dispatch');
    };

    const handleContactsFromUpload = (loadedContacts: ParsedContact[], loadedHeaders: string[], clientName: string) => {
        setContacts(loadedContacts);
        setHeaders(loadedHeaders);
        setSelectedClient(clientName || 'Lista de Clientes Sanitizada');
        setActiveTab('dispatch');
    };

    const savedWabas = wabaStorage.getSavedWabas();

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
                        <div className="glass-panel" style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
                            <div>
                                <span className="badge badge-approved" style={{ marginBottom: '6px' }}>Painel de Disparo</span>
                                <h2 style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--text-main)' }}>
                                    {selectedClient}
                                </h2>
                                <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                                    {contacts.length > 0 
                                        ? `${contacts.length} contatos carregados e prontos para envio na BM do Luiz.` 
                                        : 'Carregue sua planilha abaixo ou defina seus remetentes para iniciar.'}
                                </p>
                            </div>

                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button 
                                    className="btn-secondary" 
                                    onClick={() => setActiveTab('registry')}
                                >
                                    Gerenciar WABAs
                                </button>
                                <button 
                                    className="btn-primary"
                                    onClick={() => setShowConfirmModal(true)}
                                    disabled={contacts.length === 0}
                                >
                                    Revisar & Enfileirar
                                </button>
                            </div>
                        </div>

                        {/* Senders Configuration (Includes Direct Excel Uploader, Saved WABAs & Card/List Views) */}
                        <SenderManager 
                            senders={senders}
                            setSenders={setSenders}
                            contacts={contacts}
                            setContacts={setContacts}
                            setHeaders={setHeaders}
                            mediaUrl={mediaUrl}
                            onAdvanceToReview={() => setShowConfirmModal(true)}
                        />

                        {/* Variable Mapper ({{1}}, {{2}}) */}
                        {contacts.length > 0 && (
                            <VariableMapper 
                                mappings={mappings}
                                setMappings={setMappings}
                                headers={headers}
                                sampleContact={contacts[0]}
                            />
                        )}
                    </div>
                )}

                {/* TAB 3: REGISTRO DE ENVIOS EM TEMPO REAL */}
                {activeTab === 'records' && (
                    <DispatchRecords />
                )}

                {/* TAB 4: FILA REDIS (HUD MONITOR) */}
                {activeTab === 'redis' && (
                    <RedisMonitor 
                        status={redisStatus}
                        onRefresh={refreshRedisStatus}
                    />
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
