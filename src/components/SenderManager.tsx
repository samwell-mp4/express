import React, { useState, useEffect, useRef } from 'react';
import { 
    Smartphone, Plus, Trash2, Copy, Sliders, ShieldCheck, RefreshCw, Check, 
    AlertTriangle, Layers, Split, CheckCircle2, LayoutGrid, List as ListIcon, 
    FileSpreadsheet, Download, Sparkles, FolderPlus, Upload, X, HelpCircle,
    ArrowRight, CheckSquare, Eye
} from 'lucide-react';
import { SenderConfig, ParsedContact, SavedWaba, InfobipTemplateSummary } from '../types';
import { api, LUIS_BASE } from '../services/api';
import { excelService, SpreadsheetAnalysis } from '../services/excelService';
import { wabaStorage } from '../services/wabaStorage';

interface SenderManagerProps {
    senders: SenderConfig[];
    setSenders: React.Dispatch<React.SetStateAction<SenderConfig[]>>;
    contacts: ParsedContact[];
    setContacts: React.Dispatch<React.SetStateAction<ParsedContact[]>>;
    setHeaders: React.Dispatch<React.SetStateAction<string[]>>;
    mediaUrl: string;
    onMediaUrlChange?: (url: string) => void;
    onTemplateSelected?: (templateName: string, headerType: 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'TEXT' | 'NONE') => void;
    onAdvanceToReview: () => void;
}

export const SenderManager: React.FC<SenderManagerProps> = ({
    senders,
    setSenders,
    contacts,
    setContacts,
    setHeaders,
    mediaUrl,
    onMediaUrlChange,
    onTemplateSelected,
    onAdvanceToReview
}) => {
    // Views
    const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
    const [savedWabaViewMode, setSavedWabaViewMode] = useState<'card' | 'list'>('card');

    // Modals
    const [showAddSenderModal, setShowAddSenderModal] = useState(false);
    const [addSenderTab, setAddSenderTab] = useState<'saved' | 'create_new' | 'paste'>('saved');
    const [showManualPasteModal, setShowManualPasteModal] = useState(false);
    const [manualPasteText, setManualPasteText] = useState('');
    const [showParameterInspector, setShowParameterInspector] = useState(false);

    // Form inside "Criar Nova WABA" modal
    const [newWabaLabel, setNewWabaLabel] = useState('');
    const [newWabaNumber, setNewWabaNumber] = useState('');
    const [newWabaLimit, setNewWabaLimit] = useState(250);
    const [newWabaTemplate, setNewWabaTemplate] = useState('');
    const [newWabaHeaderType, setNewWabaHeaderType] = useState<'NONE' | 'IMAGE' | 'VIDEO'>('NONE');
    const [newWabaTemplatesList, setNewWabaTemplatesList] = useState<InfobipTemplateSummary[]>([]);
    const [isLoadingNewWabaTemplates, setIsLoadingNewWabaTemplates] = useState(false);

    // Spreadsheet State
    const [isParsingExcel, setIsParsingExcel] = useState(false);
    const [excelAnalysis, setExcelAnalysis] = useState<SpreadsheetAnalysis | null>(null);
    const [uploadedFileName, setUploadedFileName] = useState('');
    const [isDraggingFile, setIsDraggingFile] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    // Selected Column Overrides
    const [selectedPhoneCol, setSelectedPhoneCol] = useState<number>(0);
    const [selectedNameCol, setSelectedNameCol] = useState<number>(-1);

    // Saved WABAs from localStorage
    const [savedWabas, setSavedWabas] = useState<SavedWaba[]>([]);
    const [bannerMessage, setBannerMessage] = useState<string | null>(null);

    // Load saved WABAs and listen for updates
    useEffect(() => {
        loadSavedWabas();

        const handleStorageChange = () => {
            loadSavedWabas();
        };

        window.addEventListener('waba_storage_updated', handleStorageChange);
        window.addEventListener('storage', handleStorageChange);

        return () => {
            window.removeEventListener('waba_storage_updated', handleStorageChange);
            window.removeEventListener('storage', handleStorageChange);
        };
    }, []);

    const loadSavedWabas = () => {
        setSavedWabas(wabaStorage.getSavedWabas());
    };

    const showNotification = (msg: string) => {
        setBannerMessage(msg);
        setTimeout(() => setBannerMessage(null), 4000);
    };

    // Helper de auditoria detalhada de parâmetros do template por remetente (Prevenção Erro 7008 Meta)
    const getSenderTemplateDetails = (s: SenderConfig) => {
        const clean = (s.senderNumber || '').replace(/\D/g, '');
        const tObj = s.templates?.find(t => t.name === s.templateName);

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

        let bodyPlaceholders: string[] = [];
        const bodyText = tObj?.structure?.body?.text || '';
        if (bodyText) {
            bodyPlaceholders = bodyText.match(/\{\{\d+\}\}/g) || [];
        }

        const templateButtons = tObj?.structure?.buttons || [];
        const dynamicButtons: any[] = [];
        templateButtons.forEach((b: any) => {
            const bType = String(b.type || '').toUpperCase();
            if (bType === 'QUICK_REPLY') {
                dynamicButtons.push({
                    type: 'QUICK_REPLY',
                    parameter: b.text || b.payload || 'Não Reconheço'
                });
            } else if (bType === 'URL' && b.url && (b.url.includes('{{') || b.url.includes('{1}'))) {
                dynamicButtons.push({
                    type: 'URL',
                    parameter: b.parameter || ''
                });
            }
        });

        const effectiveMedia = s.mediaUrl || mediaUrl || '';
        const isMediaRequired = headerFormat === 'IMAGE' || headerFormat === 'VIDEO' || headerFormat === 'DOCUMENT';
        const hasMedia = !isMediaRequired || Boolean(effectiveMedia.trim());

        return {
            senderId: s.id,
            senderNumber: clean,
            label: s.label,
            templateName: s.templateName,
            templateObj: tObj,
            headerFormat,
            isMediaRequired,
            hasMedia,
            effectiveMedia,
            varCount: bodyPlaceholders.length,
            bodyPlaceholders,
            bodyText,
            buttons: dynamicButtons,
            rawButtons: templateButtons
        };
    };

    // Load templates for senders that already have numbers
    useEffect(() => {
        senders.forEach(s => {
            if (s.senderNumber && (!s.templates || s.templates.length === 0)) {
                loadTemplatesForSender(s.id, s.senderNumber);
            }
        });
    }, []);

    // Fetch approved templates for a specific sender
    const loadTemplatesForSender = async (senderId: string, number: string) => {
        const clean = number.replace(/\D/g, '');
        if (!clean || clean.length < 8) return;

        setSenders(prev => prev.map(s => s.id === senderId ? { ...s, isLoadingTemplates: true } : s));
        try {
            const templates = await api.fetchSenderTemplates(clean);
            setSenders(prev => prev.map(s => {
                if (s.id === senderId) {
                    const currentValid = templates.some(t => t.name === s.templateName);
                    const selectedName = currentValid ? s.templateName : (templates[0]?.name || s.templateName || '');
                    
                    const selectedTemplateObj = templates.find(t => t.name === selectedName);
                    let detectedHeaderType: 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'TEXT' | 'NONE' = 'NONE';
                    if (selectedTemplateObj?.structure?.header?.format) {
                        const fmt = String(selectedTemplateObj.structure.header.format).toUpperCase();
                        if (fmt === 'IMAGE') detectedHeaderType = 'IMAGE';
                        else if (fmt === 'VIDEO') detectedHeaderType = 'VIDEO';
                        else if (fmt === 'DOCUMENT') detectedHeaderType = 'DOCUMENT';
                        else if (fmt === 'TEXT') detectedHeaderType = 'TEXT';
                    } else if (s.headerType && s.headerType !== 'NONE') {
                        detectedHeaderType = s.headerType;
                    }

                    return {
                        ...s,
                        templates,
                        isLoadingTemplates: false,
                        templateName: selectedName,
                        headerType: detectedHeaderType
                    };
                }
                return s;
            }));

            if (templates.length > 0) {
                showNotification(`✓ ${templates.length} templates aprovados carregados para ${clean}!`);
            } else {
                showNotification(`⚠️ Nenhum template retornado para o número ${clean}. Verifique se pertence à BM do Luiz.`);
            }
        } catch (err: any) {
            console.error('Erro ao carregar templates:', err);
            setSenders(prev => prev.map(s => s.id === senderId ? { ...s, isLoadingTemplates: false } : s));
            showNotification(`Erro ao carregar templates: ${err.message}`);
        }
    };

    // --- SPREADSHEET PROCESSOR ---
    const processFile = async (file: File) => {
        setUploadedFileName(file.name);
        setIsParsingExcel(true);

        try {
            const result = await excelService.parseFile(file);
            setExcelAnalysis(result);
            setSelectedPhoneCol(result.detectedPhoneCol);
            setSelectedNameCol(result.detectedNameCol);
            setContacts(result.contacts);
            setHeaders(result.headers);

            showNotification(`✓ Planilha processada: ${result.contacts.length} contatos válidos (13D Brasil) encontrados!`);
        } catch (err: any) {
            alert(`Erro ao ler planilha: ${err.message}`);
        } finally {
            setIsParsingExcel(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) processFile(file);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDraggingFile(true);
    };

    const handleDragLeave = () => {
        setIsDraggingFile(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDraggingFile(false);
        const file = e.dataTransfer.files?.[0];
        if (file) processFile(file);
    };

    // Re-extract contacts when changing column dropdowns
    const handleColumnChange = (phoneCol: number, nameCol: number) => {
        if (!excelAnalysis) return;
        setSelectedPhoneCol(phoneCol);
        setSelectedNameCol(nameCol);

        const updated = excelService.reExtractWithColumns(excelAnalysis, phoneCol, nameCol);
        setExcelAnalysis(updated);
        setContacts(updated.contacts);
        showNotification(`✓ Contatos reprocessados com a nova coluna: ${updated.contacts.length} válidos.`);
    };

    // Clear current spreadsheet
    const handleClearSpreadsheet = () => {
        setUploadedFileName('');
        setExcelAnalysis(null);
        setContacts([]);
        setHeaders([]);
        if (fileInputRef.current) fileInputRef.current.value = '';
        showNotification('Planilha desanexada.');
    };

    // Download sanitized CSV
    const handleDownloadCleanCsv = () => {
        if (!contacts || contacts.length === 0) return;
        const url = excelService.generateSanitizedCsvUrl(contacts);
        const a = document.createElement('a');
        a.href = url;
        a.download = `contatos_higienizados_13D_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    // Parse plain pasted numbers
    const handleApplyManualPaste = () => {
        if (!manualPasteText.trim()) return;
        const res = excelService.parsePastedText(manualPasteText);
        if (res.contacts.length === 0) {
            alert('Nenhum número válido encontrado no texto colado.');
            return;
        }

        setExcelAnalysis(res);
        setContacts(res.contacts);
        setHeaders(res.headers);
        setUploadedFileName(`Lista_Colada_${res.contacts.length}_contatos.csv`);
        setShowManualPasteModal(false);
        setManualPasteText('');
        showNotification(`✓ ${res.contacts.length} contatos válidos adicionados da lista colada!`);
    };

    // --- SENDER ACTIONS ---

    // 1. DUPLICAR REMETENTE (Botão Duplicar)
    const handleDuplicateSender = (senderId: string) => {
        const target = senders.find(s => s.id === senderId);
        if (!target) return;

        const nextIdx = senders.length + 1;
        const duplicated: SenderConfig = {
            ...target,
            id: String(Date.now() + Math.random()),
            label: `${target.label} (Cópia)`,
            templates: target.templates ? [...target.templates] : []
        };

        const targetIndex = senders.findIndex(s => s.id === senderId);
        const newSenders = [...senders];
        newSenders.splice(targetIndex + 1, 0, duplicated);

        setSenders(newSenders);
        showNotification(`✓ Remetente "${target.label}" duplicado com sucesso!`);
    };

    // 2. Remove sender
    const handleRemoveSender = (id: string) => {
        if (senders.length <= 1) {
            alert('Você precisa manter pelo menos 1 remetente configurado.');
            return;
        }
        setSenders(prev => prev.filter(s => s.id !== id));
    };

    // 3. Update sender
    const updateSender = (id: string, updates: Partial<SenderConfig>) => {
        setSenders(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
    };

    // 4. Import single saved WABA
    const handleAddSavedWabaToDispatches = (waba: SavedWaba) => {
        const newSender: SenderConfig = {
            id: String(Date.now() + Math.random()),
            label: waba.label,
            senderNumber: waba.number,
            limit: waba.defaultLimit || 250,
            templateName: waba.templateName || '',
            templateLanguage: 'pt_BR',
            templates: waba.templates || [],
            headerType: waba.headerType || (mediaUrl ? 'IMAGE' : 'NONE'),
            mediaUrl: waba.mediaUrl || mediaUrl || ''
        };

        setSenders(prev => {
            if (prev.length === 1 && !prev[0].senderNumber) {
                return [newSender];
            }
            return [...prev, newSender];
        });

        setShowAddSenderModal(false);
        showNotification(`✓ WABA "${waba.label}" (${waba.number}) adicionada aos remetentes!`);
        loadTemplatesForSender(newSender.id, waba.number);
    };

    // 5. Import ALL saved WABAs at once
    const handleImportAllSavedWabas = () => {
        if (savedWabas.length === 0) {
            alert('Nenhuma WABA cadastrada ainda. Crie uma na aba "Registrar WABA".');
            return;
        }

        const converted: SenderConfig[] = savedWabas.map(waba => ({
            id: String(Date.now() + Math.random()),
            label: waba.label,
            senderNumber: waba.number,
            limit: waba.defaultLimit || 250,
            templateName: waba.templateName || '',
            templateLanguage: 'pt_BR',
            templates: waba.templates || [],
            headerType: waba.headerType || (mediaUrl ? 'IMAGE' : 'NONE'),
            mediaUrl: waba.mediaUrl || mediaUrl || ''
        }));

        setSenders(converted);
        setShowAddSenderModal(false);
        showNotification(`✓ Todas as ${converted.length} WABAs salvas foram importadas com sucesso!`);

        converted.forEach(s => loadTemplatesForSender(s.id, s.senderNumber));
    };

    // 6. Create brand new WABA directly from the modal, SAVE it to localStorage, and add to senders
    const handleFetchTemplatesForNewWaba = async () => {
        const clean = newWabaNumber.replace(/\D/g, '');
        if (!clean || clean.length < 8) {
            alert('Informe um número de WhatsApp com DDD para buscar os templates.');
            return;
        }

        setIsLoadingNewWabaTemplates(true);
        try {
            const list = await api.fetchSenderTemplates(clean);
            setNewWabaTemplatesList(list);
            if (list.length > 0) {
                if (!newWabaTemplate) setNewWabaTemplate(list[0].name);
                showNotification(`✓ ${list.length} templates aprovados encontrados para ${clean}!`);
            } else {
                alert(`Nenhum template aprovado retornado pela Meta para ${clean}. Verifique se o número pertence à BM do Luiz.`);
            }
        } catch (e: any) {
            console.error('Erro ao buscar templates:', e);
            alert(`Erro ao buscar templates: ${e.message}`);
        } finally {
            setIsLoadingNewWabaTemplates(false);
        }
    };

    const handleSaveNewWabaAndAdd = () => {
        const cleanNum = excelService.normalizePhone(newWabaNumber);
        if (!cleanNum || cleanNum.length < 10) {
            alert('Por favor, informe um número de WhatsApp válido com DDD.');
            return;
        }

        const label = newWabaLabel.trim() || `WABA ${cleanNum.slice(-4)}`;

        // 1. Save permanently in localStorage (survives F5)
        const saved = wabaStorage.saveWaba({
            label,
            number: cleanNum,
            defaultLimit: Number(newWabaLimit) || 250,
            accountName: 'BM do Luiz',
            templateName: newWabaTemplate,
            templateLanguage: 'pt_BR',
            templates: newWabaTemplatesList,
            headerType: newWabaHeaderType
        });

        // 2. Add directly to active senders list
        const newSender: SenderConfig = {
            id: String(Date.now()),
            label: saved.label,
            senderNumber: saved.number,
            limit: saved.defaultLimit,
            templateName: saved.templateName || '',
            templateLanguage: 'pt_BR',
            templates: saved.templates || [],
            headerType: saved.headerType || (mediaUrl ? 'IMAGE' : 'NONE'),
            mediaUrl: saved.mediaUrl || mediaUrl || ''
        };

        setSenders(prev => {
            if (prev.length === 1 && !prev[0].senderNumber) {
                return [newSender];
            }
            return [...prev, newSender];
        });

        // Reset form & close modal
        setNewWabaLabel('');
        setNewWabaNumber('');
        setNewWabaLimit(250);
        setNewWabaTemplate('');
        setNewWabaTemplatesList([]);
        setShowAddSenderModal(false);

        showNotification(`✓ WABA "${label}" salva no navegador (F5 permanente) e adicionada ao disparo!`);
    };

    // 7. Add quick blank sender
    const handleAddBlankSender = () => {
        const nextIdx = senders.length + 1;
        const newSender: SenderConfig = {
            id: String(Date.now()),
            label: `Remetente ${nextIdx}`,
            senderNumber: '',
            limit: 250,
            templateName: senders[0]?.templateName || '',
            templateLanguage: 'pt_BR',
            templates: senders[0]?.templates ? [...senders[0].templates] : [],
            headerType: mediaUrl ? 'IMAGE' : 'NONE',
            mediaUrl: mediaUrl || ''
        };
        setSenders(prev => [...prev, newSender]);
        setShowAddSenderModal(false);
    };

    // 8. Distribute contacts equally
    const handleDistributeEqually = () => {
        if (contacts.length === 0 || senders.length === 0) return;
        const base = Math.floor(contacts.length / senders.length);
        const remainder = contacts.length % senders.length;

        setSenders(prev => prev.map((s, i) => ({
            ...s,
            limit: base + (i < remainder ? 1 : 0)
        })));
        showNotification(`✓ Contatos divididos igualmente entre os ${senders.length} remetentes.`);
    };

    // 9. Replicate template 1
    const handleReplicateTemplate = () => {
        if (senders.length <= 1) return;
        const source = senders[0];
        if (!source.templateName) {
            alert('Selecione um template no Remetente 1 antes de replicar.');
            return;
        }

        setSenders(prev => prev.map((s, idx) => idx === 0 ? s : {
            ...s,
            templateName: source.templateName,
            templateLanguage: source.templateLanguage,
            templates: (s.templates && s.templates.length > 0) ? s.templates : [...source.templates],
            headerType: source.headerType,
            mediaUrl: source.mediaUrl
        }));

        showNotification(`✓ Template "${source.templateName}" replicado para todos os remetentes!`);
    };

    // 10. Auto partition by quota (e.g. 250)
    const handleAutoPartitionQuota = (quota = 250) => {
        if (contacts.length === 0) return;
        const needed = Math.max(1, Math.ceil(contacts.length / quota));

        setSenders(prev => {
            const result: SenderConfig[] = [];
            for (let i = 0; i < needed; i++) {
                const existing = prev[i];
                if (existing) {
                    result.push({ ...existing, limit: quota });
                } else {
                    result.push({
                        id: String(Date.now() + i),
                        label: `Remetente ${i + 1}`,
                        senderNumber: prev[0]?.senderNumber || '',
                        limit: quota,
                        templateName: prev[0]?.templateName || '',
                        templateLanguage: 'pt_BR',
                        templates: prev[0]?.templates || [],
                        headerType: mediaUrl ? 'IMAGE' : 'NONE',
                        mediaUrl: mediaUrl || ''
                    });
                }
            }
            return result;
        });
        showNotification(`✓ Lista particionada em cotas de ${quota} contatos.`);
    };

    const totalAllocated = senders.reduce((acc, s) => acc + (s.limit || 0), 0);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Notification Toast */}
            {bannerMessage && (
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
                    <span>{bannerMessage}</span>
                </div>
            )}

            {/* DIRECT SPREADSHEET UPLOADER PANEL */}
            <div className="glass-panel" style={{ padding: '18px 22px', background: '#fff', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ 
                            background: '#ecfdf5', 
                            color: 'var(--primary-color)', 
                            width: '36px', 
                            height: '36px', 
                            borderRadius: '6px', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center'
                        }}>
                            <FileSpreadsheet size={18} />
                        </div>
                        <div>
                            <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>
                                Planilha de Contatos (Excel / CSV)
                            </h3>
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px', margin: 0 }}>
                                Envie sua lista de contatos (.xlsx ou .csv) com higienização automática para 13 dígitos Brasil (55 + DDD + 9 + 8 dígitos).
                            </p>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button 
                            className="btn-secondary"
                            onClick={() => setShowManualPasteModal(true)}
                            style={{ fontSize: '12.5px', height: '34px', padding: '0 12px', borderRadius: '6px' }}
                            title="Colar lista de telefones do clipboard"
                        >
                            <Sparkles size={13} />
                            Colar Telefones
                        </button>

                        {contacts.length > 0 && (
                            <>
                                <button 
                                    className="btn-secondary"
                                    onClick={handleDownloadCleanCsv}
                                    style={{ fontSize: '12.5px', height: '34px', padding: '0 12px', borderRadius: '6px' }}
                                    title="Baixar arquivo higienizado"
                                >
                                    <Download size={13} />
                                    Baixar CSV (13D)
                                </button>
                                <button 
                                    onClick={handleClearSpreadsheet}
                                    style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', height: '34px', padding: '0 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12.5px', fontWeight: 500 }}
                                    title="Remover planilha atual"
                                >
                                    Trocar Planilha
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* Upload Drag & Drop Area */}
                <div 
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                        border: `1.5px dashed ${isDraggingFile ? 'var(--primary-color)' : '#cbd5e1'}`,
                        borderRadius: '8px',
                        padding: '20px 16px',
                        textAlign: 'center',
                        background: isDraggingFile ? '#ecfdf5' : '#f8fafc',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        position: 'relative'
                    }}
                >
                    <input 
                        ref={fileInputRef}
                        type="file"
                        accept=".xlsx, .xls, .csv, .tsv"
                        onChange={handleFileChange}
                        style={{ display: 'none' }}
                    />
                    
                    <FileSpreadsheet 
                        size={28} 
                        color={isDraggingFile ? 'var(--primary-color)' : '#64748b'} 
                        style={{ margin: '0 auto 8px' }} 
                    />
                    
                    <p style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-main)', margin: '0 0 4px 0' }}>
                        {uploadedFileName ? `Arquivo Carregado: ${uploadedFileName}` : 'Clique para selecionar ou arraste uma planilha Excel (.xlsx) ou CSV aqui'}
                    </p>
                    <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', margin: 0 }}>
                        {isParsingExcel 
                            ? 'Lendo linhas e higienizando telefones para 13 dígitos...' 
                            : 'Identifica colunas de telefone e nome automaticamente em qualquer posição'}
                    </p>
                </div>

                {/* Metrics & Column Selectors Bar if spreadsheet loaded */}
                {contacts.length > 0 && excelAnalysis && (
                    <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        
                        {/* Statistics Badges */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
                            <div style={{ background: '#f8fafc', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                                <span style={{ fontSize: '11px', color: 'var(--text-dim)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total de Linhas</span>
                                <strong style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-main)' }}>{excelAnalysis.stats.totalRows}</strong>
                            </div>
                            <div style={{ background: '#ecfdf5', padding: '8px 12px', borderRadius: '6px', border: '1px solid #bbf7d0' }}>
                                <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: 600, display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Válidos (13D)</span>
                                <strong style={{ fontSize: '18px', fontWeight: 600, color: 'var(--primary-color)' }}>{contacts.length}</strong>
                            </div>
                            <div style={{ background: '#fefce8', padding: '8px 12px', borderRadius: '6px', border: '1px solid #fef08a' }}>
                                <span style={{ fontSize: '11px', color: '#b45309', fontWeight: 600, display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Duplicados</span>
                                <strong style={{ fontSize: '18px', fontWeight: 600, color: '#d97706' }}>{excelAnalysis.stats.duplicateCount}</strong>
                            </div>
                            <div style={{ background: '#fef2f2', padding: '8px 12px', borderRadius: '6px', border: '1px solid #fecaca' }}>
                                <span style={{ fontSize: '11px', color: '#dc2626', fontWeight: 600, display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Inválidos</span>
                                <strong style={{ fontSize: '18px', fontWeight: 600, color: '#dc2626' }}>{excelAnalysis.stats.invalidCount}</strong>
                            </div>
                        </div>

                        {/* Column Mappings Override */}
                        {excelAnalysis.headers.length > 1 && (
                            <div style={{ 
                                background: '#f8fafc', 
                                border: '1px solid var(--border-subtle)', 
                                borderRadius: '6px', 
                                padding: '10px 14px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                flexWrap: 'wrap',
                                gap: '10px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Sliders size={14} color="var(--primary-color)" />
                                    <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-main)' }}>
                                        Mapeamento de Colunas da Planilha:
                                    </span>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>Coluna Telefone:</label>
                                        <select 
                                            className="form-select"
                                            value={selectedPhoneCol}
                                            onChange={(e) => handleColumnChange(Number(e.target.value), selectedNameCol)}
                                            style={{ height: '32px', padding: '0 8px', fontSize: '12.5px', minWidth: '130px', borderRadius: '6px' }}
                                        >
                                            {excelAnalysis.headers.map((h, idx) => (
                                                <option key={idx} value={idx}>{h || `Coluna ${idx + 1}`}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>Coluna Nome / Info 2:</label>
                                        <select 
                                            className="form-select"
                                            value={selectedNameCol}
                                            onChange={(e) => handleColumnChange(selectedPhoneCol, Number(e.target.value))}
                                            style={{ height: '32px', padding: '0 8px', fontSize: '12.5px', minWidth: '130px', borderRadius: '6px' }}
                                        >
                                            <option value={-1}>Nenhuma (Vazio)</option>
                                            {excelAnalysis.headers.map((h, idx) => (
                                                <option key={idx} value={idx}>{h || `Coluna ${idx + 1}`}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Sample Preview Table */}
                        <div style={{ border: '1px solid var(--border-subtle)', borderRadius: '6px', overflow: 'hidden' }}>
                            <div style={{ padding: '6px 12px', background: '#f8fafc', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Eye size={13} />
                                    Amostra dos Primeiros Contatos Higienizados (Padrão 13D Brasil & Colunas da Planilha):
                                </span>
                                <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>Mostrando {Math.min(5, contacts.length)} de {contacts.length}</span>
                            </div>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'left', background: '#fff' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', background: '#F8FAFC' }}>
                                            <th style={{ padding: '8px 12px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>#</th>
                                            <th style={{ padding: '8px 12px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>TELEFONE (13 DÍGITOS)</th>
                                            <th style={{ padding: '8px 12px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>NOME / INFO 2</th>
                                            {(excelAnalysis.headers || [])
                                                .filter((h, idx) => idx !== selectedPhoneCol && idx !== selectedNameCol && h.toLowerCase() !== 'telefone' && h.toLowerCase() !== 'nome')
                                                .map((eh, i) => (
                                                    <th key={i} style={{ padding: '8px 12px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#0284c7' }}>
                                                        {eh}
                                                    </th>
                                                ))
                                            }
                                            <th style={{ padding: '8px 12px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>STATUS</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {contacts.slice(0, 5).map((c, idx) => {
                                            const extraCols = (excelAnalysis.headers || []).filter(
                                                (h, cIdx) => cIdx !== selectedPhoneCol && cIdx !== selectedNameCol && h.toLowerCase() !== 'telefone' && h.toLowerCase() !== 'nome'
                                            );
                                            return (
                                                <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                    <td style={{ padding: '8px 12px', color: 'var(--text-dim)' }}>{idx + 1}</td>
                                                    <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text-main)', fontFamily: 'monospace' }}>
                                                        {c.telefone}
                                                    </td>
                                                    <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>
                                                        {c.nome || '—'}
                                                    </td>
                                                    {extraCols.map((eh, i) => (
                                                        <td key={i} style={{ padding: '8px 12px', color: '#334155' }}>
                                                            {c[eh] || c[eh.toLowerCase()] || '—'}
                                                        </td>
                                                    ))}
                                                    <td style={{ padding: '8px 12px' }}>
                                                        <span className="badge badge-approved" style={{ fontSize: '11px', height: '20px', padding: '0 6px', borderRadius: '4px', fontWeight: 500 }}>
                                                            ✓ Válido (13D)
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                    </div>
                )}
            </div>

            {/* ACTION TOOLBAR: ADD SENDER, SAVED WABAS, CARDS/LIST SWITCHER */}
            <div className="glass-panel" style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', background: '#fff', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                
                {/* Left Action Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    
                    {/* NOVO REMETENTE (Opens the requested Modal to pick saved BMs or create new) */}
                    <button 
                        className="btn-primary" 
                        onClick={() => {
                            setAddSenderTab('saved');
                            setShowAddSenderModal(true);
                        }}
                        style={{ fontSize: '13px', height: '34px', padding: '0 12px', gap: '5px', borderRadius: '6px' }}
                    >
                        <Plus size={15} />
                        Novo Remetente
                    </button>

                    <button 
                        className="btn-secondary" 
                        onClick={handleReplicateTemplate} 
                        style={{ fontSize: '12.5px', height: '34px', padding: '0 10px', borderRadius: '6px' }}
                        title="Replicar o template do Remetente 1 para todos"
                    >
                        <Copy size={13} />
                        Replicar Template 1
                    </button>

                    <button 
                        className="btn-secondary" 
                        onClick={handleDistributeEqually} 
                        style={{ fontSize: '12.5px', height: '34px', padding: '0 10px', borderRadius: '6px' }}
                        title="Dividir total de contatos igualmente entre os remetentes"
                    >
                        <Split size={13} />
                        Dividir Igualmente
                    </button>

                    <button 
                        className="btn-secondary" 
                        onClick={() => handleAutoPartitionQuota(250)} 
                        style={{ fontSize: '12.5px', height: '34px', padding: '0 10px', borderRadius: '6px' }}
                        title="Ajustar limites para 250 mensagens cada"
                    >
                        <Layers size={13} />
                        Cotas de 250
                    </button>
                </div>

                {/* Right: View Switcher (Card / List) & Allocation Progress */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    
                    {/* CARD & LIST VIEW TOGGLE */}
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
                            <LayoutGrid size={13} />
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
                            <ListIcon size={13} />
                            Lista
                        </button>
                    </div>

                    {/* Capacity Allocated */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Alocação:</span>
                        <strong style={{ 
                            color: contacts.length > 0 && totalAllocated >= contacts.length ? 'var(--status-approved)' : 'var(--status-pending)',
                            fontWeight: 600
                        }}>
                            {totalAllocated} / {contacts.length}
                        </strong>
                    </div>

                </div>

            </div>

            {/* PAINEL DE CONFERÊNCIA DE PARÂMETROS E TEMPLATES ENTRE WABAS (PREVENÇÃO ERRO 7008 META) */}
            {(() => {
                const sendersWithTemplates = senders.filter(s => s.senderNumber && s.templateName);
                if (sendersWithTemplates.length === 0) return null;

                const analyses = sendersWithTemplates.map(getSenderTemplateDetails);
                const uniqueVars = Array.from(new Set(analyses.map(a => a.varCount)));
                const hasVarDivergence = uniqueVars.length > 1;
                const sendersMissingMedia = analyses.filter(a => a.isMediaRequired && !a.hasMedia);
                const hasMediaIssue = sendersMissingMedia.length > 0;

                return (
                    <div style={{
                        background: hasMediaIssue ? '#fffbeb' : hasVarDivergence ? '#eff6ff' : '#f0fdf4',
                        border: hasMediaIssue ? '1.5px solid #f59e0b' : hasVarDivergence ? '1.5px solid #60a5fa' : '1.5px solid #86efac',
                        borderRadius: '10px',
                        padding: '14px 16px',
                        marginBottom: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <ShieldCheck size={18} color={hasMediaIssue ? '#d97706' : hasVarDivergence ? '#2563eb' : '#16a34a'} />
                                <div>
                                    <strong style={{ fontSize: '13.5px', color: hasMediaIssue ? '#92400e' : hasVarDivergence ? '#1e40af' : '#166534' }}>
                                        Conferência de Parâmetros e Templates entre WABAs (Prevenção Erro 7008 Meta)
                                    </strong>
                                    <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                                        Auditoria automática de variáveis do corpo e formato de cabeçalho para garantir entrega sem falhas.
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <button
                                    className="btn-secondary"
                                    onClick={() => setShowParameterInspector(!showParameterInspector)}
                                    style={{ height: '28px', padding: '0 10px', fontSize: '11.5px', gap: '4px', borderRadius: '5px' }}
                                >
                                    <Eye size={12} />
                                    {showParameterInspector ? 'Ocultar Detalhes dos Templates' : 'Visualizar Texto e Parâmetros'}
                                </button>

                                {hasVarDivergence ? (
                                    <span style={{ fontSize: '11px', background: '#dbeafe', color: '#1d4ed8', padding: '3px 8px', borderRadius: '5px', fontWeight: 700 }}>
                                        ⚡ Auto-Adaptação Ativa
                                    </span>
                                ) : (
                                    <span style={{ fontSize: '11px', background: '#dcfce7', color: '#15803d', padding: '3px 8px', borderRadius: '5px', fontWeight: 700 }}>
                                        ✓ 100% Compatível
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* CARDS COMPARATIVOS DE CADA WABA */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
                            {analyses.map(a => (
                                <div key={a.senderId} style={{
                                    background: '#ffffff',
                                    border: '1px solid var(--border-subtle)',
                                    borderRadius: '7px',
                                    padding: '10px 12px',
                                    fontSize: '12px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '6px'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <span style={{ fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-main)' }}>
                                            +{a.senderNumber} ({a.label})
                                        </span>
                                        <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600 }}>
                                            {a.templateName}
                                        </span>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #f1f5f9', paddingTop: '4px' }}>
                                        <span style={{ color: 'var(--text-muted)' }}>Variáveis de Corpo:</span>
                                        <span style={{
                                            fontWeight: 700,
                                            color: '#0284c7',
                                            background: '#e0f2fe',
                                            padding: '1px 6px',
                                            borderRadius: '4px',
                                            fontFamily: 'monospace'
                                        }}>
                                            {a.varCount} {a.varCount === 1 ? 'parâmetro' : 'parâmetros'} {a.bodyPlaceholders.length > 0 ? `(${a.bodyPlaceholders.join(', ')})` : ''}
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
                                            <span style={{ color: 'var(--text-muted)' }}>Status da Imagem:</span>
                                            <span style={{
                                                fontWeight: 700,
                                                color: a.hasMedia ? '#16a34a' : '#dc2626'
                                            }}>
                                                {a.hasMedia ? '✓ URL Informada' : '❌ Falta URL!'}
                                            </span>
                                        </div>
                                    )}

                                    {a.rawButtons && a.rawButtons.length > 0 && (
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #f1f5f9', paddingTop: '4px' }}>
                                            <span style={{ color: 'var(--text-muted)' }}>Botões / Payload:</span>
                                            <span style={{
                                                fontWeight: 600,
                                                color: '#0f766e',
                                                background: '#ccfbf1',
                                                padding: '1px 6px',
                                                borderRadius: '4px',
                                                fontSize: '11px'
                                            }}>
                                                {a.rawButtons.map((b: any) => `${b.text || b.type}`).join(', ')}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* MENSAGEM EXPLICATIVA / STATUS */}
                        {hasVarDivergence ? (
                            <div style={{ fontSize: '12px', color: '#1e40af', background: 'rgba(255,255,255,0.7)', padding: '8px 12px', borderRadius: '6px', borderLeft: '3px solid #2563eb' }}>
                                💡 <strong>Proteção Multi-WABA Ativa:</strong> As WABAs estão configuradas com templates com números diferentes de variáveis. O despachador auto-alinhará os parâmetros de cada contato especificamente para o template de cada WABA (ex: cortando para 2 variáveis na WABA que espera 2), eliminando o risco do <strong>Erro 7008 da Meta</strong>.
                            </div>
                        ) : (
                            <div style={{ fontSize: '12px', color: '#15803d', background: 'rgba(255,255,255,0.7)', padding: '8px 12px', borderRadius: '6px', borderLeft: '3px solid #16a34a' }}>
                                ✓ Todas as WABAs ativas utilizam templates compatíveis com exatamente {uniqueVars[0] || 0} variáveis.
                            </div>
                        )}

                        {/* INSPEÇÃO DETALHADA EXPANSÍVEL DO TEXTO DO TEMPLATE */}
                        {showParameterInspector && (
                            <div style={{
                                background: '#ffffff',
                                border: '1px solid var(--border-subtle)',
                                borderRadius: '8px',
                                padding: '12px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '10px'
                            }}>
                                <strong style={{ fontSize: '12.5px', color: 'var(--text-main)' }}>
                                    Prévia do Texto Oficial Aprovado na Meta por Remetente:
                                </strong>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '10px' }}>
                                    {analyses.map(a => (
                                        <div key={a.senderId} style={{
                                            background: '#f8fafc',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '6px',
                                            padding: '10px',
                                            fontSize: '12px'
                                        }}>
                                            <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                                                +{a.senderNumber} — <em>{a.templateName}</em>
                                            </div>
                                            <p style={{
                                                margin: 0,
                                                whiteSpace: 'pre-wrap',
                                                color: '#334155',
                                                lineHeight: 1.45,
                                                background: '#ffffff',
                                                border: '1px solid #e2e8f0',
                                                borderRadius: '4px',
                                                padding: '8px',
                                                fontFamily: 'system-ui, sans-serif'
                                            }}>
                                                {a.bodyText || '(Texto do corpo indisponível na listagem da Meta)'}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                );
            })()}

            {/* SENDERS VIEW: CARDS OR LIST */}
            {viewMode === 'card' ? (
                /* CARD VIEW */
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '14px' }}>
                    {senders.map((s, idx) => (
                        <div 
                            key={s.id} 
                            className="glass-card" 
                            style={{ 
                                padding: '16px', 
                                display: 'flex', 
                                flexDirection: 'column', 
                                gap: '12px', 
                                borderRadius: '8px',
                                border: '1px solid var(--border-subtle)',
                                background: '#ffffff'
                            }}
                        >
                            
                            {/* Card Header */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                                    <Smartphone size={16} color="var(--primary-color)" />
                                    <strong style={{ color: 'var(--text-main)', fontSize: '14px', fontWeight: 600 }}>{s.label}</strong>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    {/* DUPLICAR REMETENTE BUTTON */}
                                    <button
                                        className="btn-secondary"
                                        onClick={() => handleDuplicateSender(s.id)}
                                        title="Duplicar este remetente"
                                        style={{ height: '28px', padding: '0 8px', fontSize: '12px', gap: '4px', borderRadius: '4px' }}
                                    >
                                        <Copy size={12} />
                                        Duplicar
                                    </button>

                                    {senders.length > 1 && (
                                        <button 
                                            onClick={() => handleRemoveSender(s.id)}
                                            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', height: '28px', width: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}
                                            title="Remover remetente"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Remetente Phone Number Input */}
                            <div>
                                <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500, display: 'block', marginBottom: '4px' }}>
                                    Número do Remetente (WABA Oficial)
                                </label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <input 
                                        type="text"
                                        placeholder="Ex: 5511999990001"
                                        className="form-input"
                                        style={{ height: '36px', fontSize: '13.5px', borderRadius: '6px' }}
                                        value={s.senderNumber}
                                        onChange={(e) => {
                                            const cleanVal = e.target.value;
                                            updateSender(s.id, { senderNumber: cleanVal });
                                            const numsOnly = cleanVal.replace(/\D/g, '');
                                            if (numsOnly.length >= 10 && numsOnly !== s.senderNumber) {
                                                loadTemplatesForSender(s.id, numsOnly);
                                            }
                                        }}
                                        onBlur={() => loadTemplatesForSender(s.id, s.senderNumber)}
                                    />
                                    <button 
                                        className="btn-secondary"
                                        onClick={() => loadTemplatesForSender(s.id, s.senderNumber)}
                                        title="Buscar templates aprovados na Infobip para este número"
                                        disabled={s.isLoadingTemplates || !s.senderNumber}
                                        style={{ height: '36px', padding: '0 12px', whiteSpace: 'nowrap', fontSize: '12.5px', borderRadius: '6px' }}
                                    >
                                        <RefreshCw size={13} className={s.isLoadingTemplates ? 'animate-spin' : ''} />
                                        {s.isLoadingTemplates ? 'Buscando...' : 'Buscar'}
                                    </button>
                                </div>
                            </div>

                            {/* Template Select Dropdown */}
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                    <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>
                                        Template Aprovado (Meta / Infobip)
                                    </label>
                                    {s.templates && s.templates.length > 0 && (
                                        <span style={{ fontSize: '11px', color: 'var(--status-approved)', fontWeight: 600 }}>
                                            {s.templates.length} disponíveis
                                        </span>
                                    )}
                                </div>

                                {s.isLoadingTemplates ? (
                                    <div style={{
                                        background: '#f8fafc',
                                        border: '1px solid var(--border-subtle)',
                                        borderRadius: '6px',
                                        padding: '8px 12px',
                                        fontSize: '12px',
                                        color: 'var(--text-muted)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}>
                                        <RefreshCw size={13} className="animate-spin" color="var(--primary-color)" />
                                        <span>Carregando templates da Meta...</span>
                                    </div>
                                ) : s.templates && s.templates.length > 0 ? (
                                    <select 
                                        className="form-select"
                                        value={s.templateName}
                                        onChange={(e) => {
                                            const chosen = e.target.value;
                                            const tObj = s.templates.find(t => t.name === chosen);
                                            let hType: 'NONE' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'TEXT' = 'NONE';
                                            if (tObj?.structure?.header?.format) {
                                                const fmt = String(tObj.structure.header.format).toUpperCase();
                                                if (fmt === 'IMAGE') hType = 'IMAGE';
                                                else if (fmt === 'VIDEO') hType = 'VIDEO';
                                                else if (fmt === 'DOCUMENT') hType = 'DOCUMENT';
                                                else if (fmt === 'TEXT') hType = 'TEXT';
                                                else hType = 'NONE';
                                            } else if (s.headerType && s.headerType !== 'NONE') {
                                                hType = s.headerType;
                                            }
                                            updateSender(s.id, { 
                                                templateName: chosen,
                                                headerType: hType,
                                                mediaUrl: s.mediaUrl || mediaUrl
                                            });
                                            if (onTemplateSelected) {
                                                onTemplateSelected(chosen, hType);
                                            }
                                        }}
                                        style={{ height: '36px', fontSize: '13px', borderRadius: '6px', fontWeight: 500 }}
                                    >
                                        <option value="">Selecione um template aprovado...</option>
                                        {s.templates.map(t => (
                                            <option key={t.name} value={t.name}>
                                                {t.name} ({t.language || 'pt_BR'}) {t.category ? `• ${t.category}` : ''}
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <input 
                                            type="text"
                                            placeholder="Nome do template ou clique em 'Buscar' acima"
                                            className="form-input"
                                            style={{ height: '36px', fontSize: '13px', borderRadius: '6px' }}
                                            value={s.templateName}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                updateSender(s.id, { templateName: val });
                                                if (onTemplateSelected && val) {
                                                    onTemplateSelected(val, s.headerType);
                                                }
                                            }}
                                        />
                                        <span style={{ fontSize: '11px', color: '#b45309' }}>
                                            ⚠️ Digite o número acima e clique em "Buscar" para listar os templates da Meta.
                                        </span>
                                    </div>
                                )}

                                {/* Preview de parâmetros do template selecionado */}
                                {s.templateName && (() => {
                                    const details = getSenderTemplateDetails(s);
                                    return (
                                        <div style={{
                                            marginTop: '6px',
                                            background: '#f8fafc',
                                            border: '1px solid var(--border-subtle)',
                                            borderRadius: '6px',
                                            padding: '6px 8px',
                                            fontSize: '11px',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '4px'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <span style={{ color: 'var(--text-muted)' }}>Variáveis do Corpo:</span>
                                                <span style={{ 
                                                    fontWeight: 700, 
                                                    color: details.varCount > 0 ? '#0284c7' : 'var(--text-muted)',
                                                    background: details.varCount > 0 ? '#e0f2fe' : '#f1f5f9',
                                                    padding: '1px 5px',
                                                    borderRadius: '4px',
                                                    fontFamily: 'monospace'
                                                }}>
                                                    {details.varCount} {details.varCount === 1 ? 'parâmetro' : 'parâmetros'} {details.bodyPlaceholders.length > 0 ? `(${details.bodyPlaceholders.join(', ')})` : ''}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <span style={{ color: 'var(--text-muted)' }}>Cabeçalho Meta:</span>
                                                <span style={{ 
                                                    fontWeight: 600,
                                                    color: details.headerFormat === 'IMAGE' ? '#7c3aed' : details.headerFormat === 'VIDEO' ? '#d97706' : 'var(--text-main)'
                                                }}>
                                                    {details.headerFormat === 'IMAGE' ? '🖼️ Imagem (IMAGE)' : details.headerFormat === 'VIDEO' ? '🎥 Vídeo (VIDEO)' : 'Nenhum (Texto)'}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>

                            {/* Cota e Cabeçalho */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                <div>
                                    <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500, display: 'block', marginBottom: '4px' }}>
                                        Cota / Limite
                                    </label>
                                    <input 
                                        type="number"
                                        min="1"
                                        className="form-input"
                                        value={s.limit}
                                        onChange={(e) => updateSender(s.id, { limit: parseInt(e.target.value, 10) || 0 })}
                                        style={{ height: '36px', fontSize: '13.5px', borderRadius: '6px', fontWeight: 600 }}
                                    />
                                </div>

                                <div>
                                    <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500, display: 'block', marginBottom: '4px' }}>
                                        Cabeçalho
                                    </label>
                                    <select 
                                        className="form-select"
                                        value={s.headerType}
                                        onChange={(e: any) => {
                                            const hVal = e.target.value;
                                            updateSender(s.id, { headerType: hVal });
                                            if (onTemplateSelected && s.templateName) {
                                                onTemplateSelected(s.templateName, hVal);
                                            }
                                        }}
                                        style={{ height: '36px', fontSize: '13px', borderRadius: '6px' }}
                                    >
                                        <option value="NONE">Sem Mídia</option>
                                        <option value="IMAGE">Imagem</option>
                                        <option value="VIDEO">Vídeo</option>
                                    </select>
                                </div>
                            </div>

                            {/* URL da Mídia Original se Cabeçalho for Imagem ou Vídeo */}
                            {(s.headerType === 'IMAGE' || s.headerType === 'VIDEO') && (
                                <div style={{ 
                                    background: (s.mediaUrl || mediaUrl) ? '#f0f9ff' : '#fffbeb', 
                                    border: (s.mediaUrl || mediaUrl) ? '1px solid #bae6fd' : '1.5px solid #f59e0b', 
                                    borderRadius: '6px', 
                                    padding: '8px 10px' 
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
                                        <label style={{ fontSize: '11px', color: (s.mediaUrl || mediaUrl) ? '#0369a1' : '#92400e', fontWeight: 600 }}>
                                            URL da Mídia ({s.headerType === 'IMAGE' ? 'Imagem' : 'Vídeo'}):
                                        </label>
                                        {!(s.mediaUrl || mediaUrl) && (
                                            <span style={{ fontSize: '10px', background: '#fef3c7', color: '#b45309', padding: '1px 5px', borderRadius: '3px', fontWeight: 700 }}>
                                                Obrigatório
                                            </span>
                                        )}
                                    </div>
                                    <input 
                                        type="url"
                                        placeholder={`https://exemplo.com/${s.headerType === 'IMAGE' ? 'imagem.jpg' : 'video.mp4'}`}
                                        className="form-input"
                                        value={s.mediaUrl || mediaUrl || ''}
                                        onChange={(e) => {
                                            const url = e.target.value;
                                            updateSender(s.id, { mediaUrl: url });
                                            if (onMediaUrlChange && !mediaUrl) {
                                                onMediaUrlChange(url);
                                            }
                                        }}
                                        style={{ height: '30px', fontSize: '11.5px', borderRadius: '4px' }}
                                    />
                                    {(s.mediaUrl || mediaUrl) && (
                                        <span style={{ fontSize: '10.5px', color: '#16a34a', display: 'inline-block', marginTop: '2px', fontWeight: 500 }}>
                                            ✓ Mídia vinculada ao envio
                                        </span>
                                    )}
                                </div>
                            )}

                            {/* Footer indicator */}
                            <div style={{ 
                                marginTop: 'auto', 
                                paddingTop: '10px', 
                                borderTop: '1px solid var(--border-subtle)', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'space-between', 
                                fontSize: '12px' 
                            }}>
                                <span style={{ color: 'var(--text-muted)' }}>Capacidade Alocada:</span>
                                <span style={{ color: 'var(--primary-color)', fontWeight: 600 }}>
                                    Até {s.limit} mensagens
                                </span>
                            </div>

                        </div>
                    ))}
                </div>
            ) : (
                /* LIST VIEW */
                <div className="glass-panel" style={{ overflowX: 'auto', padding: 0, background: '#fff', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', background: '#F8FAFC' }}>
                                <th style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>REMETENTE</th>
                                <th style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>NÚMERO WABA</th>
                                <th style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>TEMPLATE META</th>
                                <th style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'right' }}>COTA</th>
                                <th style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center' }}>AÇÕES</th>
                            </tr>
                        </thead>
                        <tbody>
                            {senders.map(s => (
                                <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s' }}>
                                    <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-main)' }}>
                                        {s.label}
                                    </td>
                                    <td style={{ padding: '10px 14px', fontWeight: 500, fontFamily: 'monospace' }}>
                                        {s.senderNumber || <span style={{ color: 'var(--text-dim)' }}>Pendente</span>}
                                    </td>
                                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>
                                        {s.templateName || <span style={{ color: 'var(--text-dim)' }}>Nenhum selecionado</span>}
                                    </td>
                                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: 'var(--text-main)' }}>
                                        {s.limit}
                                    </td>
                                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                            <button 
                                                className="btn-secondary" 
                                                onClick={() => handleDuplicateSender(s.id)}
                                                style={{ height: '28px', padding: '0 8px', fontSize: '12px', borderRadius: '4px' }}
                                                title="Duplicar remetente"
                                            >
                                                <Copy size={11} />
                                                Duplicar
                                            </button>
                                            {senders.length > 1 && (
                                                <button 
                                                    onClick={() => handleRemoveSender(s.id)}
                                                    style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', height: '28px', width: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                    title="Excluir"
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Bottom Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button 
                    className="btn-primary"
                    onClick={onAdvanceToReview}
                    style={{ height: '38px', padding: '0 20px', fontSize: '13.5px', borderRadius: '6px', fontWeight: 600 }}
                    disabled={contacts.length === 0}
                >
                    Revisar & Enfileirar no Redis
                </button>
            </div>

            {/* ======================================================== */}
            {/* MODAL: "NOVO REMETENTE" (Pick Saved BMs or Create New)  */}
            {/* ======================================================== */}
            {showAddSenderModal && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(15, 23, 42, 0.45)',
                    backdropFilter: 'blur(3px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1150,
                    padding: '16px'
                }}>
                    <div className="glass-panel" style={{ width: '100%', maxWidth: '680px', padding: '22px', background: '#fff', borderRadius: '8px', border: '1px solid var(--border-subtle)', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }}>
                        
                        {/* Modal Header */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                            <div>
                                <h3 style={{ fontSize: '17px', fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>
                                    Adicionar Remetente (WABA)
                                </h3>
                                <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                                    Selecione das BMs salvas no navegador ou registre uma nova para salvar permanentemente.
                                </p>
                            </div>
                            <button 
                                onClick={() => setShowAddSenderModal(false)}
                                style={{ background: '#f1f5f9', border: 'none', borderRadius: '6px', width: '28px', height: '28px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}
                            >
                                <X size={15} />
                            </button>
                        </div>

                        {/* Modal Tabs Header */}
                        <div style={{ display: 'flex', gap: '6px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px', marginBottom: '16px' }}>
                            <button
                                onClick={() => setAddSenderTab('saved')}
                                style={{
                                    height: '34px',
                                    padding: '0 12px',
                                    borderRadius: '6px',
                                    background: addSenderTab === 'saved' ? 'var(--primary-color)' : '#f1f5f9',
                                    color: addSenderTab === 'saved' ? '#ffffff' : 'var(--text-main)',
                                    fontWeight: 500,
                                    fontSize: '13px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                            >
                                <FolderPlus size={14} />
                                WABAs / BMs Salvas ({savedWabas.length})
                            </button>

                            <button
                                onClick={() => setAddSenderTab('create_new')}
                                style={{
                                    height: '34px',
                                    padding: '0 12px',
                                    borderRadius: '6px',
                                    background: addSenderTab === 'create_new' ? 'var(--primary-color)' : '#f1f5f9',
                                    color: addSenderTab === 'create_new' ? '#ffffff' : 'var(--text-main)',
                                    fontWeight: 500,
                                    fontSize: '13px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                            >
                                <Plus size={14} />
                                Criar Nova WABA
                            </button>

                            <button
                                onClick={handleAddBlankSender}
                                style={{
                                    height: '34px',
                                    padding: '0 12px',
                                    borderRadius: '6px',
                                    background: '#f1f5f9',
                                    color: 'var(--text-muted)',
                                    fontWeight: 500,
                                    fontSize: '12.5px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    marginLeft: 'auto'
                                }}
                            >
                                + Remetente Rápido Avulso
                            </button>
                        </div>

                        {/* TAB 1: SAVED WABAS (With CARD and LIST view mode) */}
                        {addSenderTab === 'saved' && (
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                                        WABAs cadastradas na BM do Luiz (salvas no navegador):
                                    </span>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        {/* Toggle CARD / LIST in modal */}
                                        <div style={{ display: 'flex', alignItems: 'center', background: '#f1f5f9', padding: '2px', borderRadius: '6px' }}>
                                            <button 
                                                onClick={() => setSavedWabaViewMode('card')}
                                                style={{
                                                    padding: '4px 8px',
                                                    borderRadius: '4px',
                                                    background: savedWabaViewMode === 'card' ? '#ffffff' : 'transparent',
                                                    color: savedWabaViewMode === 'card' ? 'var(--text-main)' : 'var(--text-muted)',
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    fontSize: '12px',
                                                    fontWeight: 500
                                                }}
                                            >
                                                <LayoutGrid size={12} />
                                                Cards
                                            </button>
                                            <button 
                                                onClick={() => setSavedWabaViewMode('list')}
                                                style={{
                                                    padding: '4px 8px',
                                                    borderRadius: '4px',
                                                    background: savedWabaViewMode === 'list' ? '#ffffff' : 'transparent',
                                                    color: savedWabaViewMode === 'list' ? 'var(--text-main)' : 'var(--text-muted)',
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    fontSize: '12px',
                                                    fontWeight: 500
                                                }}
                                            >
                                                <ListIcon size={12} />
                                                Lista
                                            </button>
                                        </div>

                                        {savedWabas.length > 0 && (
                                            <button className="btn-secondary" onClick={handleImportAllSavedWabas} style={{ height: '28px', fontSize: '12px', padding: '0 8px', borderRadius: '4px' }}>
                                                Importar Todas ({savedWabas.length})
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {savedWabas.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '36px 10px', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
                                        <Smartphone size={28} color="#94a3b8" style={{ margin: '0 auto 8px' }} />
                                        <p style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '14px', margin: '0 0 4px 0' }}>Nenhuma WABA salva encontrada no navegador</p>
                                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '380px', margin: '0 auto 12px' }}>
                                            Você pode cadastrar uma agora mesmo clicando na aba "Criar Nova WABA" acima ou acessando o menu "Registrar WABA".
                                        </p>
                                        <button className="btn-primary" onClick={() => setAddSenderTab('create_new')} style={{ height: '32px', fontSize: '12.5px', padding: '0 12px', borderRadius: '6px' }}>
                                            <Plus size={13} />
                                            Cadastrar Agora
                                        </button>
                                    </div>
                                ) : savedWabaViewMode === 'card' ? (
                                    /* CARDS MODE IN MODAL */
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px', maxHeight: '380px', overflowY: 'auto' }}>
                                        {savedWabas.map(w => (
                                            <div 
                                                key={w.id}
                                                style={{
                                                    background: '#ffffff',
                                                    border: '1px solid var(--border-subtle)',
                                                    borderRadius: '6px',
                                                    padding: '12px',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: '8px'
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                                    <div>
                                                        <strong style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-main)', display: 'block' }}>{w.label}</strong>
                                                        <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '3px', marginTop: '2px' }}>
                                                            <ShieldCheck size={11} color="var(--primary-color)" />
                                                            {w.accountName || 'BM do Luiz'}
                                                        </span>
                                                    </div>
                                                    <span style={{ fontSize: '11px', background: '#ecfdf5', color: 'var(--primary-color)', padding: '2px 6px', borderRadius: '4px', fontWeight: 500 }}>
                                                        Cota: {w.defaultLimit}
                                                    </span>
                                                </div>

                                                <div style={{ background: '#f8fafc', padding: '5px 8px', borderRadius: '4px', fontSize: '12.5px', fontFamily: 'monospace', fontWeight: 600, border: '1px solid var(--border-subtle)' }}>
                                                    {w.number}
                                                </div>

                                                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                                    Template: <strong>{w.templateName || 'Não definido'}</strong>
                                                </div>

                                                <button 
                                                    className="btn-primary"
                                                    onClick={() => handleAddSavedWabaToDispatches(w)}
                                                    style={{ width: '100%', height: '32px', fontSize: '12.5px', padding: '0 8px', justifyContent: 'center', borderRadius: '6px' }}
                                                >
                                                    <Plus size={13} />
                                                    Usar este Remetente
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    /* LIST MODE IN MODAL */
                                    <div style={{ maxHeight: '380px', overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: '6px' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'left' }}>
                                            <thead>
                                                <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                                                    <th style={{ padding: '8px 12px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>RÓTULO</th>
                                                    <th style={{ padding: '8px 12px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>NÚMERO</th>
                                                    <th style={{ padding: '8px 12px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>CONTA</th>
                                                    <th style={{ padding: '8px 12px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>COTA</th>
                                                    <th style={{ padding: '8px 12px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'right' }}>AÇÃO</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {savedWabas.map(w => (
                                                    <tr key={w.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                        <td style={{ padding: '8px 12px', fontWeight: 600 }}>{w.label}</td>
                                                        <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontWeight: 500 }}>{w.number}</td>
                                                        <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{w.accountName || 'BM do Luiz'}</td>
                                                        <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--primary-color)' }}>{w.defaultLimit}</td>
                                                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                                                            <button 
                                                                className="btn-secondary"
                                                                onClick={() => handleAddSavedWabaToDispatches(w)}
                                                                style={{ height: '28px', padding: '0 8px', fontSize: '12px', borderRadius: '4px' }}
                                                            >
                                                                + Usar
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* TAB 2: CREATE NEW WABA AND SAVE */}
                        {addSenderTab === 'create_new' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                                        Nome / Rótulo da Nova WABA
                                    </label>
                                    <input 
                                        type="text"
                                        placeholder="Ex: WABA Vendas 02"
                                        className="form-input"
                                        style={{ height: '36px', fontSize: '13.5px', borderRadius: '6px' }}
                                        value={newWabaLabel}
                                        onChange={(e) => setNewWabaLabel(e.target.value)}
                                    />
                                </div>

                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                                        Número de WhatsApp Oficial (com DDD)
                                    </label>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <input 
                                            type="text"
                                            placeholder="Ex: 5511999990002"
                                            className="form-input"
                                            style={{ height: '36px', fontSize: '13.5px', borderRadius: '6px' }}
                                            value={newWabaNumber}
                                            onChange={(e) => {
                                                setNewWabaNumber(e.target.value);
                                                const clean = e.target.value.replace(/\D/g, '');
                                                if (clean.length >= 10) {
                                                    // optional auto fetch
                                                }
                                            }}
                                        />
                                        <button 
                                            className="btn-secondary"
                                            onClick={handleFetchTemplatesForNewWaba}
                                            disabled={isLoadingNewWabaTemplates || !newWabaNumber}
                                            style={{ whiteSpace: 'nowrap', fontSize: '12.5px', height: '36px', padding: '0 12px', borderRadius: '6px' }}
                                        >
                                            <RefreshCw size={13} className={isLoadingNewWabaTemplates ? 'animate-spin' : ''} />
                                            {isLoadingNewWabaTemplates ? 'Buscando...' : 'Buscar Templates'}
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                                        Template Aprovado (Meta / Infobip)
                                    </label>
                                    {isLoadingNewWabaTemplates ? (
                                        <div style={{ background: '#f8fafc', padding: '8px 12px', borderRadius: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
                                            Carregando templates da Meta...
                                        </div>
                                    ) : newWabaTemplatesList.length > 0 ? (
                                        <select 
                                            className="form-select"
                                            value={newWabaTemplate}
                                            onChange={(e) => setNewWabaTemplate(e.target.value)}
                                            style={{ height: '36px', fontSize: '13px', borderRadius: '6px', fontWeight: 500 }}
                                        >
                                            <option value="">Selecione um template aprovado...</option>
                                            {newWabaTemplatesList.map(t => (
                                                <option key={t.name} value={t.name}>
                                                    {t.name} ({t.language || 'pt_BR'})
                                                </option>
                                            ))}
                                        </select>
                                    ) : (
                                        <input 
                                            type="text"
                                            placeholder="Digite o nome do template aprovado"
                                            className="form-input"
                                            style={{ height: '36px', fontSize: '13.5px', borderRadius: '6px' }}
                                            value={newWabaTemplate}
                                            onChange={(e) => setNewWabaTemplate(e.target.value)}
                                        />
                                    )}
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                    <div>
                                        <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                                            Cota Padrão
                                        </label>
                                        <input 
                                            type="number"
                                            min="1"
                                            className="form-input"
                                            style={{ height: '36px', fontSize: '13.5px', borderRadius: '6px' }}
                                            value={newWabaLimit}
                                            onChange={(e) => setNewWabaLimit(Number(e.target.value))}
                                        />
                                    </div>

                                    <div>
                                        <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                                            Cabeçalho
                                        </label>
                                        <select 
                                            className="form-select"
                                            value={newWabaHeaderType}
                                            onChange={(e: any) => setNewWabaHeaderType(e.target.value)}
                                            style={{ height: '36px', fontSize: '13px', borderRadius: '6px' }}
                                        >
                                            <option value="NONE">Sem Mídia</option>
                                            <option value="IMAGE">Imagem</option>
                                            <option value="VIDEO">Vídeo</option>
                                        </select>
                                    </div>
                                </div>

                                <div style={{ background: '#ecfdf5', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '8px 12px', fontSize: '12.5px', color: '#065f46' }}>
                                    ✓ Esta WABA será salva no navegador permanentemente (sobrevive ao F5) e já ficará disponível na lista de remetentes.
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                                    <button className="btn-secondary" onClick={() => setShowAddSenderModal(false)} style={{ height: '34px', fontSize: '13px', borderRadius: '6px' }}>
                                        Cancelar
                                    </button>
                                    <button className="btn-primary" onClick={handleSaveNewWabaAndAdd} style={{ height: '34px', fontSize: '13px', borderRadius: '6px' }}>
                                        <Plus size={14} />
                                        Salvar WABA e Adicionar
                                    </button>
                                </div>
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                            <button className="btn-secondary" onClick={() => setShowAddSenderModal(false)} style={{ height: '34px', fontSize: '13px', borderRadius: '6px' }}>
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ======================================================== */}
            {/* MODAL: MANUAL PASTE NUMBERS                             */}
            {/* ======================================================== */}
            {showManualPasteModal && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(15, 23, 42, 0.45)',
                    backdropFilter: 'blur(3px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1150,
                    padding: '16px'
                }}>
                    <div className="glass-panel" style={{ width: '100%', maxWidth: '480px', padding: '22px', background: '#fff', borderRadius: '8px', border: '1px solid var(--border-subtle)', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }}>
                        <h3 style={{ fontSize: '17px', fontWeight: 600, color: 'var(--text-main)', margin: '0 0 4px 0' }}>
                            Colar Lista de Telefones
                        </h3>
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 14px 0' }}>
                            Cole os telefones abaixo (um por linha ou separados por vírgula/ponto e vírgula). Telefones no formato "Telefone, Nome" também são suportados.
                        </p>

                        <textarea 
                            className="form-input"
                            rows={8}
                            placeholder="5511999990001, João Silva&#10;11988887777, Maria Oliveira&#10;5521977776666"
                            value={manualPasteText}
                            onChange={(e) => setManualPasteText(e.target.value)}
                            style={{ fontFamily: 'monospace', fontSize: '13px', marginBottom: '14px', borderRadius: '6px', padding: '10px' }}
                        />

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            <button className="btn-secondary" onClick={() => setShowManualPasteModal(false)} style={{ height: '36px', fontSize: '13px', borderRadius: '6px' }}>
                                Cancelar
                            </button>
                            <button className="btn-primary" onClick={handleApplyManualPaste} style={{ height: '36px', fontSize: '13px', borderRadius: '6px' }}>
                                Processar e Higienizar (13D)
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};
