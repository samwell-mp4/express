import React, { useState, useEffect, useRef } from 'react';
import { 
    Smartphone, Plus, Trash2, Copy, Sliders, ShieldCheck, RefreshCw, Check, 
    AlertTriangle, Layers, Split, CheckCircle2, LayoutGrid, List as ListIcon, 
    FileSpreadsheet, Download, Sparkles, FolderPlus, Upload, X, HelpCircle,
    ArrowRight, CheckSquare, Eye
} from 'lucide-react';
import { SenderConfig, ParsedContact, SavedWaba, InfobipTemplateSummary } from '../types';
import { api, LUIS_KEY, LUIS_BASE } from '../services/api';
import { excelService, SpreadsheetAnalysis } from '../services/excelService';
import { wabaStorage } from '../services/wabaStorage';

interface SenderManagerProps {
    senders: SenderConfig[];
    setSenders: React.Dispatch<React.SetStateAction<SenderConfig[]>>;
    contacts: ParsedContact[];
    setContacts: React.Dispatch<React.SetStateAction<ParsedContact[]>>;
    setHeaders: React.Dispatch<React.SetStateAction<string[]>>;
    mediaUrl: string;
    onAdvanceToReview: () => void;
}

export const SenderManager: React.FC<SenderManagerProps> = ({
    senders,
    setSenders,
    contacts,
    setContacts,
    setHeaders,
    mediaUrl,
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
                    let detectedHeaderType = s.headerType;
                    if (selectedTemplateObj?.structure?.header?.format) {
                        const fmt = selectedTemplateObj.structure.header.format;
                        if (fmt === 'IMAGE') detectedHeaderType = 'IMAGE';
                        else if (fmt === 'VIDEO') detectedHeaderType = 'VIDEO';
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Notification Toast */}
            {bannerMessage && (
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
                    <span>{bannerMessage}</span>
                </div>
            )}

            {/* DIRECT SPREADSHEET UPLOADER PANEL */}
            <div className="glass-panel" style={{ padding: '22px 26px', background: '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ 
                            background: '#ecfdf5', 
                            color: 'var(--primary-color)', 
                            width: '42px', 
                            height: '42px', 
                            borderRadius: '10px', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            boxShadow: '0 2px 8px rgba(5, 150, 105, 0.15)'
                        }}>
                            <FileSpreadsheet size={24} />
                        </div>
                        <div>
                            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1.2 }}>
                                Planilha de Contatos (Excel / CSV)
                            </h3>
                            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                Envie sua lista de contatos em formato .xlsx ou .csv com higienização automática para 13 dígitos Brasil (55 + DDD + 9 + 8 dígitos).
                            </p>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button 
                            className="btn-secondary"
                            onClick={() => setShowManualPasteModal(true)}
                            style={{ fontSize: '0.8rem', padding: '7px 12px' }}
                            title="Colar lista de telefones do clipboard"
                        >
                            <Sparkles size={14} />
                            Colar Telefones
                        </button>

                        {contacts.length > 0 && (
                            <>
                                <button 
                                    className="btn-secondary"
                                    onClick={handleDownloadCleanCsv}
                                    style={{ fontSize: '0.8rem', padding: '7px 12px' }}
                                    title="Baixar arquivo higienizado"
                                >
                                    <Download size={14} />
                                    Baixar CSV (13D)
                                </button>
                                <button 
                                    onClick={handleClearSpreadsheet}
                                    style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '7px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
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
                        border: `2px dashed ${isDraggingFile ? 'var(--primary-color)' : '#cbd5e1'}`,
                        borderRadius: '14px',
                        padding: '24px 20px',
                        textAlign: 'center',
                        background: isDraggingFile ? '#ecfdf5' : '#f8fafc',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
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
                        size={36} 
                        color={isDraggingFile ? 'var(--primary-color)' : '#64748b'} 
                        style={{ margin: '0 auto 10px' }} 
                    />
                    
                    <p style={{ fontWeight: 800, fontSize: '0.96rem', color: 'var(--text-main)' }}>
                        {uploadedFileName ? `Arquivo Carregado: ${uploadedFileName}` : 'Clique para selecionar ou arraste uma planilha Excel (.xlsx) ou CSV aqui'}
                    </p>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                        {isParsingExcel 
                            ? 'Lendo linhas e higienizando telefones para 13 dígitos...' 
                            : 'Identifica colunas de telefone e nome automaticamente em qualquer posição'}
                    </p>
                </div>

                {/* Metrics & Column Selectors Bar if spreadsheet loaded */}
                {contacts.length > 0 && excelAnalysis && (
                    <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        
                        {/* Statistics Badges */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                            <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', display: 'block' }}>Total de Linhas</span>
                                <strong style={{ fontSize: '1.25rem', color: 'var(--text-main)' }}>{excelAnalysis.stats.totalRows}</strong>
                            </div>
                            <div style={{ background: '#ecfdf5', padding: '10px 14px', borderRadius: '10px', border: '1px solid #bbf7d0' }}>
                                <span style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: 700, display: 'block' }}>Válidos (13D Brasil)</span>
                                <strong style={{ fontSize: '1.25rem', color: 'var(--primary-color)' }}>{contacts.length}</strong>
                            </div>
                            <div style={{ background: '#fefce8', padding: '10px 14px', borderRadius: '10px', border: '1px solid #fef08a' }}>
                                <span style={{ fontSize: '0.72rem', color: '#b45309', fontWeight: 700, display: 'block' }}>Duplicados Removidos</span>
                                <strong style={{ fontSize: '1.25rem', color: '#d97706' }}>{excelAnalysis.stats.duplicateCount}</strong>
                            </div>
                            <div style={{ background: '#fef2f2', padding: '10px 14px', borderRadius: '10px', border: '1px solid #fecaca' }}>
                                <span style={{ fontSize: '0.72rem', color: '#dc2626', fontWeight: 700, display: 'block' }}>Inválidos Descartados</span>
                                <strong style={{ fontSize: '1.25rem', color: '#dc2626' }}>{excelAnalysis.stats.invalidCount}</strong>
                            </div>
                        </div>

                        {/* Column Mappings Override */}
                        {excelAnalysis.headers.length > 1 && (
                            <div style={{ 
                                background: '#f8fafc', 
                                border: '1px solid var(--border-subtle)', 
                                borderRadius: '10px', 
                                padding: '12px 16px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                flexWrap: 'wrap',
                                gap: '12px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Sliders size={16} color="var(--primary-color)" />
                                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)' }}>
                                        Mapeamento de Colunas da Planilha:
                                    </span>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>Coluna Telefone:</label>
                                        <select 
                                            className="form-select"
                                            value={selectedPhoneCol}
                                            onChange={(e) => handleColumnChange(Number(e.target.value), selectedNameCol)}
                                            style={{ padding: '4px 8px', fontSize: '0.8rem', minWidth: '130px' }}
                                        >
                                            {excelAnalysis.headers.map((h, idx) => (
                                                <option key={idx} value={idx}>{h || `Coluna ${idx + 1}`}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>Coluna Nome / Info 2:</label>
                                        <select 
                                            className="form-select"
                                            value={selectedNameCol}
                                            onChange={(e) => handleColumnChange(selectedPhoneCol, Number(e.target.value))}
                                            style={{ padding: '4px 8px', fontSize: '0.8rem', minWidth: '130px' }}
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
                        <div style={{ border: '1px solid var(--border-subtle)', borderRadius: '10px', overflow: 'hidden' }}>
                            <div style={{ padding: '8px 14px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Eye size={14} />
                                    Amostra dos Primeiros Contatos Higienizados (Padrão 13D Brasil):
                                </span>
                                <span>Mostrando {Math.min(5, contacts.length)} de {contacts.length}</span>
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left', background: '#fff' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid #e2e8f0', color: 'var(--text-dim)' }}>
                                        <th style={{ padding: '8px 14px' }}>#</th>
                                        <th style={{ padding: '8px 14px' }}>TELEFONE (13 DÍGITOS)</th>
                                        <th style={{ padding: '8px 14px' }}>NOME / INFO 2</th>
                                        <th style={{ padding: '8px 14px' }}>STATUS</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {contacts.slice(0, 5).map((c, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '8px 14px', color: 'var(--text-dim)' }}>{idx + 1}</td>
                                            <td style={{ padding: '8px 14px', fontWeight: 700, color: 'var(--text-main)', fontFamily: 'monospace' }}>
                                                {c.telefone}
                                            </td>
                                            <td style={{ padding: '8px 14px', color: 'var(--text-muted)' }}>
                                                {c.nome || '—'}
                                            </td>
                                            <td style={{ padding: '8px 14px' }}>
                                                <span className="badge badge-approved" style={{ fontSize: '0.68rem', padding: '2px 8px' }}>
                                                    ✓ Válido (13D)
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                    </div>
                )}
            </div>

            {/* ACTION TOOLBAR: ADD SENDER, SAVED WABAS, CARDS/LIST SWITCHER */}
            <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', background: '#fff' }}>
                
                {/* Left Action Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    
                    {/* NOVO REMETENTE (Opens the requested Modal to pick saved BMs or create new) */}
                    <button 
                        className="btn-primary" 
                        onClick={() => {
                            setAddSenderTab('saved');
                            setShowAddSenderModal(true);
                        }}
                        style={{ fontSize: '0.86rem', padding: '8px 16px', gap: '6px' }}
                    >
                        <Plus size={16} strokeWidth={2.4} />
                        Novo Remetente
                    </button>

                    <button 
                        className="btn-secondary" 
                        onClick={handleReplicateTemplate} 
                        style={{ fontSize: '0.82rem', padding: '8px 12px' }}
                        title="Replicar o template do Remetente 1 para todos"
                    >
                        <Copy size={14} />
                        Replicar Template 1
                    </button>

                    <button 
                        className="btn-secondary" 
                        onClick={handleDistributeEqually} 
                        style={{ fontSize: '0.82rem', padding: '8px 12px' }}
                        title="Dividir total de contatos igualmente entre os remetentes"
                    >
                        <Split size={14} />
                        Dividir Igualmente
                    </button>

                    <button 
                        className="btn-secondary" 
                        onClick={() => handleAutoPartitionQuota(250)} 
                        style={{ fontSize: '0.82rem', padding: '8px 12px' }}
                        title="Ajustar limites para 250 mensagens cada"
                    >
                        <Layers size={14} />
                        Cotas de 250
                    </button>
                </div>

                {/* Right: View Switcher (Card / List) & Allocation Progress */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    
                    {/* CARD & LIST VIEW TOGGLE */}
                    <div style={{ display: 'flex', alignItems: 'center', background: '#f1f5f9', padding: '3px', borderRadius: '8px' }}>
                        <button 
                            onClick={() => setViewMode('card')}
                            style={{
                                padding: '5px 12px',
                                borderRadius: '6px',
                                background: viewMode === 'card' ? '#ffffff' : 'transparent',
                                color: viewMode === 'card' ? 'var(--primary-color)' : 'var(--text-muted)',
                                border: 'none',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px',
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                boxShadow: viewMode === 'card' ? 'var(--shadow-subtle)' : 'none'
                            }}
                        >
                            <LayoutGrid size={14} />
                            Cards
                        </button>
                        <button 
                            onClick={() => setViewMode('list')}
                            style={{
                                padding: '5px 12px',
                                borderRadius: '6px',
                                background: viewMode === 'list' ? '#ffffff' : 'transparent',
                                color: viewMode === 'list' ? 'var(--primary-color)' : 'var(--text-muted)',
                                border: 'none',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px',
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                boxShadow: viewMode === 'list' ? 'var(--shadow-subtle)' : 'none'
                            }}
                        >
                            <ListIcon size={14} />
                            Lista
                        </button>
                    </div>

                    {/* Capacity Allocated */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.84rem' }}>
                        <span style={{ color: 'var(--text-dim)' }}>Alocação:</span>
                        <strong style={{ 
                            color: contacts.length > 0 && totalAllocated >= contacts.length ? 'var(--status-approved)' : 'var(--status-pending)' 
                        }}>
                            {totalAllocated} / {contacts.length}
                        </strong>
                    </div>

                </div>

            </div>

            {/* SENDERS VIEW: CARDS OR LIST */}
            {viewMode === 'card' ? (
                /* CARD VIEW */
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '18px' }}>
                    {senders.map((s, idx) => (
                        <div 
                            key={s.id} 
                            className="glass-card" 
                            style={{ 
                                padding: '22px', 
                                display: 'flex', 
                                flexDirection: 'column', 
                                gap: '14px', 
                                borderTop: '4px solid var(--primary-color)',
                                background: '#ffffff'
                            }}
                        >
                            
                            {/* Card Header */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Smartphone size={18} color="var(--primary-color)" />
                                    <strong style={{ color: 'var(--text-main)', fontSize: '1.02rem' }}>{s.label}</strong>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    {/* DUPLICAR REMETENTE BUTTON */}
                                    <button
                                        className="btn-secondary"
                                        onClick={() => handleDuplicateSender(s.id)}
                                        title="Duplicar este remetente"
                                        style={{ padding: '5px 10px', fontSize: '0.76rem', gap: '4px' }}
                                    >
                                        <Copy size={13} />
                                        Duplicar
                                    </button>

                                    {senders.length > 1 && (
                                        <button 
                                            onClick={() => handleRemoveSender(s.id)}
                                            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '5px', borderRadius: '6px' }}
                                            title="Remover remetente"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Remetente Phone Number Input */}
                            <div>
                                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                                    Número do Remetente (WABA Oficial)
                                </label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <input 
                                        type="text"
                                        placeholder="Ex: 5511999990001"
                                        className="form-input"
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
                                        style={{ padding: '8px 14px', whiteSpace: 'nowrap', fontSize: '0.8rem' }}
                                    >
                                        <RefreshCw size={14} className={s.isLoadingTemplates ? 'animate-spin' : ''} />
                                        {s.isLoadingTemplates ? 'Buscando...' : 'Buscar'}
                                    </button>
                                </div>
                            </div>

                            {/* Template Select Dropdown */}
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                        Template Aprovado (Meta / Infobip)
                                    </label>
                                    {s.templates && s.templates.length > 0 && (
                                        <span style={{ fontSize: '0.72rem', color: 'var(--status-approved)', fontWeight: 700 }}>
                                            {s.templates.length} disponíveis
                                        </span>
                                    )}
                                </div>

                                {s.isLoadingTemplates ? (
                                    <div style={{
                                        background: '#f8fafc',
                                        border: '1px solid var(--border-subtle)',
                                        borderRadius: '10px',
                                        padding: '10px 14px',
                                        fontSize: '0.82rem',
                                        color: 'var(--text-muted)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px'
                                    }}>
                                        <RefreshCw size={14} className="animate-spin" color="var(--primary-color)" />
                                        <span>Carregando templates da Meta...</span>
                                    </div>
                                ) : s.templates && s.templates.length > 0 ? (
                                    <select 
                                        className="form-select"
                                        value={s.templateName}
                                        onChange={(e) => {
                                            const chosen = e.target.value;
                                            const tObj = s.templates.find(t => t.name === chosen);
                                            let hType = s.headerType;
                                            if (tObj?.structure?.header?.format) {
                                                const fmt = tObj.structure.header.format;
                                                if (fmt === 'IMAGE') hType = 'IMAGE';
                                                else if (fmt === 'VIDEO') hType = 'VIDEO';
                                            }
                                            updateSender(s.id, { 
                                                templateName: chosen,
                                                headerType: hType
                                            });
                                        }}
                                        style={{ fontWeight: 600 }}
                                    >
                                        <option value="">Selecione um template aprovado...</option>
                                        {s.templates.map(t => (
                                            <option key={t.name} value={t.name}>
                                                {t.name} ({t.language || 'pt_BR'}) {t.category ? `• ${t.category}` : ''}
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <input 
                                            type="text"
                                            placeholder="Nome do template ou clique em 'Buscar' acima"
                                            className="form-input"
                                            value={s.templateName}
                                            onChange={(e) => updateSender(s.id, { templateName: e.target.value })}
                                        />
                                        <span style={{ fontSize: '0.72rem', color: '#b45309' }}>
                                            ⚠️ Digite o número acima e clique em "Buscar" para listar os templates da Meta.
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Cota e Cabeçalho */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                <div>
                                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                                        Cota / Limite
                                    </label>
                                    <input 
                                        type="number"
                                        min="1"
                                        className="form-input"
                                        value={s.limit}
                                        onChange={(e) => updateSender(s.id, { limit: parseInt(e.target.value, 10) || 0 })}
                                        style={{ fontWeight: 700 }}
                                    />
                                </div>

                                <div>
                                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                                        Cabeçalho
                                    </label>
                                    <select 
                                        className="form-select"
                                        value={s.headerType}
                                        onChange={(e: any) => updateSender(s.id, { headerType: e.target.value })}
                                    >
                                        <option value="NONE">Sem Mídia</option>
                                        <option value="IMAGE">Imagem</option>
                                        <option value="VIDEO">Vídeo</option>
                                    </select>
                                </div>
                            </div>

                            {/* Footer indicator */}
                            <div style={{ 
                                marginTop: 'auto', 
                                paddingTop: '12px', 
                                borderTop: '1px solid var(--border-subtle)', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'space-between', 
                                fontSize: '0.82rem' 
                            }}>
                                <span style={{ color: 'var(--text-dim)' }}>Capacidade Alocada:</span>
                                <span style={{ color: 'var(--primary-color)', fontWeight: 800 }}>
                                    Até {s.limit} mensagens
                                </span>
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
                                <th style={{ padding: '12px 16px' }}>REMETENTE</th>
                                <th style={{ padding: '12px 16px' }}>NÚMERO WABA</th>
                                <th style={{ padding: '12px 16px' }}>TEMPLATE META</th>
                                <th style={{ padding: '12px 16px', textAlign: 'right' }}>COTA</th>
                                <th style={{ padding: '12px 16px', textAlign: 'center' }}>AÇÕES</th>
                            </tr>
                        </thead>
                        <tbody>
                            {senders.map(s => (
                                <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--text-main)' }}>
                                        {s.label}
                                    </td>
                                    <td style={{ padding: '14px 16px', fontWeight: 600 }}>
                                        {s.senderNumber || <span style={{ color: 'var(--text-dim)' }}>Pendente</span>}
                                    </td>
                                    <td style={{ padding: '14px 16px', color: 'var(--text-muted)' }}>
                                        {s.templateName || <span style={{ color: 'var(--text-dim)' }}>Nenhum selecionado</span>}
                                    </td>
                                    <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--primary-color)' }}>
                                        {s.limit}
                                    </td>
                                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                            <button 
                                                className="btn-secondary"
                                                onClick={() => handleDuplicateSender(s.id)}
                                                style={{ padding: '4px 10px', fontSize: '0.74rem' }}
                                                title="Duplicar remetente"
                                            >
                                                <Copy size={12} />
                                                Duplicar
                                            </button>
                                            {senders.length > 1 && (
                                                <button 
                                                    onClick={() => handleRemoveSender(s.id)}
                                                    style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
                                                    title="Excluir"
                                                >
                                                    <Trash2 size={15} />
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
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                <button 
                    className="btn-primary"
                    onClick={onAdvanceToReview}
                    style={{ padding: '12px 28px', fontSize: '0.95rem' }}
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
                    background: 'rgba(15, 23, 42, 0.65)',
                    backdropFilter: 'blur(5px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1150,
                    padding: '20px'
                }}>
                    <div className="glass-panel" style={{ width: '100%', maxWidth: '720px', padding: '26px', background: '#fff', maxHeight: '90vh', overflowY: 'auto' }}>
                        
                        {/* Modal Header */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                            <div>
                                <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                    Adicionar Remetente (WABA)
                                </h3>
                                <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                                    Selecione das BMs salvas no navegador ou registre uma nova para salvar permanentemente.
                                </p>
                            </div>
                            <button 
                                onClick={() => setShowAddSenderModal(false)}
                                style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {/* Modal Tabs Header */}
                        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px', marginBottom: '18px' }}>
                            <button
                                onClick={() => setAddSenderTab('saved')}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '8px',
                                    background: addSenderTab === 'saved' ? 'var(--primary-color)' : '#f1f5f9',
                                    color: addSenderTab === 'saved' ? '#ffffff' : 'var(--text-main)',
                                    fontWeight: 700,
                                    fontSize: '0.84rem',
                                    border: 'none',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                            >
                                <FolderPlus size={15} />
                                WABAs / BMs Salvas ({savedWabas.length})
                            </button>

                            <button
                                onClick={() => setAddSenderTab('create_new')}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '8px',
                                    background: addSenderTab === 'create_new' ? 'var(--primary-color)' : '#f1f5f9',
                                    color: addSenderTab === 'create_new' ? '#ffffff' : 'var(--text-main)',
                                    fontWeight: 700,
                                    fontSize: '0.84rem',
                                    border: 'none',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                            >
                                <Plus size={15} />
                                Criar Nova WABA
                            </button>

                            <button
                                onClick={handleAddBlankSender}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '8px',
                                    background: '#f1f5f9',
                                    color: 'var(--text-muted)',
                                    fontWeight: 600,
                                    fontSize: '0.84rem',
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
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                                    <span style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                                        WABAs cadastradas na BM do Luiz (salvas no navegador permanentemente):
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
                                                    color: savedWabaViewMode === 'card' ? 'var(--primary-color)' : 'var(--text-muted)',
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    fontSize: '0.74rem',
                                                    fontWeight: 600
                                                }}
                                            >
                                                <LayoutGrid size={13} />
                                                Cards
                                            </button>
                                            <button 
                                                onClick={() => setSavedWabaViewMode('list')}
                                                style={{
                                                    padding: '4px 8px',
                                                    borderRadius: '4px',
                                                    background: savedWabaViewMode === 'list' ? '#ffffff' : 'transparent',
                                                    color: savedWabaViewMode === 'list' ? 'var(--primary-color)' : 'var(--text-muted)',
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    fontSize: '0.74rem',
                                                    fontWeight: 600
                                                }}
                                            >
                                                <ListIcon size={13} />
                                                Lista
                                            </button>
                                        </div>

                                        {savedWabas.length > 0 && (
                                            <button className="btn-secondary" onClick={handleImportAllSavedWabas} style={{ fontSize: '0.76rem', padding: '5px 10px' }}>
                                                Importar Todas ({savedWabas.length})
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {savedWabas.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '40px 10px', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                                        <Smartphone size={32} color="#94a3b8" style={{ margin: '0 auto 10px' }} />
                                        <p style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.96rem' }}>Nenhuma WABA salva encontrada no navegador</p>
                                        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', maxWidth: '380px', margin: '4px auto 14px' }}>
                                            Você pode cadastrar uma agora mesmo clicando na aba "Criar Nova WABA" acima ou acessando o menu "Registrar WABA".
                                        </p>
                                        <button className="btn-primary" onClick={() => setAddSenderTab('create_new')} style={{ fontSize: '0.82rem', padding: '6px 14px' }}>
                                            <Plus size={14} />
                                            Cadastrar Agora
                                        </button>
                                    </div>
                                ) : savedWabaViewMode === 'card' ? (
                                    /* CARDS MODE IN MODAL */
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px', maxHeight: '380px', overflowY: 'auto' }}>
                                        {savedWabas.map(w => (
                                            <div 
                                                key={w.id}
                                                style={{
                                                    background: '#ffffff',
                                                    border: '1px solid var(--border-subtle)',
                                                    borderLeft: '4px solid var(--primary-color)',
                                                    borderRadius: '10px',
                                                    padding: '14px',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: '10px',
                                                    boxShadow: 'var(--shadow-subtle)'
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                                    <div>
                                                        <strong style={{ fontSize: '0.94rem', color: 'var(--text-main)', display: 'block' }}>{w.label}</strong>
                                                        <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                            <ShieldCheck size={12} color="var(--primary-color)" />
                                                            {w.accountName || 'BM do Luiz'}
                                                        </span>
                                                    </div>
                                                    <span style={{ fontSize: '0.72rem', background: '#ecfdf5', color: 'var(--primary-color)', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                                                        Cota: {w.defaultLimit}
                                                    </span>
                                                </div>

                                                <div style={{ background: '#f8fafc', padding: '6px 10px', borderRadius: '6px', fontSize: '0.85rem', fontFamily: 'monospace', fontWeight: 700 }}>
                                                    {w.number}
                                                </div>

                                                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                                                    Template: <strong>{w.templateName || 'Não definido'}</strong>
                                                </div>

                                                <button 
                                                    className="btn-primary"
                                                    onClick={() => handleAddSavedWabaToDispatches(w)}
                                                    style={{ width: '100%', fontSize: '0.8rem', padding: '6px 10px', justifyContent: 'center' }}
                                                >
                                                    <Plus size={13} />
                                                    Usar este Remetente
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    /* LIST MODE IN MODAL */
                                    <div style={{ maxHeight: '380px', overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: '8px' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
                                            <thead>
                                                <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-dim)' }}>
                                                    <th style={{ padding: '10px 12px' }}>RÓTULO</th>
                                                    <th style={{ padding: '10px 12px' }}>NÚMERO</th>
                                                    <th style={{ padding: '10px 12px' }}>CONTA</th>
                                                    <th style={{ padding: '10px 12px' }}>COTA</th>
                                                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>AÇÃO</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {savedWabas.map(w => (
                                                    <tr key={w.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                        <td style={{ padding: '10px 12px', fontWeight: 700 }}>{w.label}</td>
                                                        <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 600 }}>{w.number}</td>
                                                        <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>{w.accountName || 'BM do Luiz'}</td>
                                                        <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--primary-color)' }}>{w.defaultLimit}</td>
                                                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                                                            <button 
                                                                className="btn-secondary"
                                                                onClick={() => handleAddSavedWabaToDispatches(w)}
                                                                style={{ padding: '4px 10px', fontSize: '0.74rem' }}
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
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                <div>
                                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                                        Nome / Rótulo da Nova WABA
                                    </label>
                                    <input 
                                        type="text"
                                        placeholder="Ex: WABA Vendas 02"
                                        className="form-input"
                                        value={newWabaLabel}
                                        onChange={(e) => setNewWabaLabel(e.target.value)}
                                    />
                                </div>

                                <div>
                                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                                        Número de WhatsApp Oficial (com DDD)
                                    </label>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <input 
                                            type="text"
                                            placeholder="Ex: 5511999990002"
                                            className="form-input"
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
                                            style={{ whiteSpace: 'nowrap', fontSize: '0.8rem', padding: '8px 14px' }}
                                        >
                                            <RefreshCw size={14} className={isLoadingNewWabaTemplates ? 'animate-spin' : ''} />
                                            {isLoadingNewWabaTemplates ? 'Buscando...' : 'Buscar Templates'}
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                                        Template Aprovado (Meta / Infobip)
                                    </label>
                                    {isLoadingNewWabaTemplates ? (
                                        <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                                            Carregando templates da Meta...
                                        </div>
                                    ) : newWabaTemplatesList.length > 0 ? (
                                        <select 
                                            className="form-select"
                                            value={newWabaTemplate}
                                            onChange={(e) => setNewWabaTemplate(e.target.value)}
                                            style={{ fontWeight: 600 }}
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
                                            value={newWabaTemplate}
                                            onChange={(e) => setNewWabaTemplate(e.target.value)}
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
                                            value={newWabaLimit}
                                            onChange={(e) => setNewWabaLimit(Number(e.target.value))}
                                        />
                                    </div>

                                    <div>
                                        <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                                            Cabeçalho
                                        </label>
                                        <select 
                                            className="form-select"
                                            value={newWabaHeaderType}
                                            onChange={(e: any) => setNewWabaHeaderType(e.target.value)}
                                        >
                                            <option value="NONE">Sem Mídia</option>
                                            <option value="IMAGE">Imagem</option>
                                            <option value="VIDEO">Vídeo</option>
                                        </select>
                                    </div>
                                </div>

                                <div style={{ background: '#ecfdf5', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 14px', fontSize: '0.8rem', color: '#065f46' }}>
                                    ✓ Esta WABA será salva no navegador permanentemente (sobrevive ao F5) e já ficará disponível na lista de remetentes.
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                                    <button className="btn-secondary" onClick={() => setShowAddSenderModal(false)}>
                                        Cancelar
                                    </button>
                                    <button className="btn-primary" onClick={handleSaveNewWabaAndAdd}>
                                        <Plus size={15} />
                                        Salvar WABA e Adicionar ao Disparo
                                    </button>
                                </div>
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                            <button className="btn-secondary" onClick={() => setShowAddSenderModal(false)}>
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
                    background: 'rgba(15, 23, 42, 0.65)',
                    backdropFilter: 'blur(5px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1150,
                    padding: '20px'
                }}>
                    <div className="glass-panel" style={{ width: '100%', maxWidth: '520px', padding: '24px', background: '#fff' }}>
                        <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '6px' }}>
                            Colar Lista de Telefones
                        </h3>
                        <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                            Cole os telefones abaixo (um por linha ou separados por vírgula/ponto e vírgula). Telefones no formato "Telefone, Nome" também são suportados.
                        </p>

                        <textarea 
                            className="form-input"
                            rows={8}
                            placeholder="5511999990001, João Silva&#10;11988887777, Maria Oliveira&#10;5521977776666"
                            value={manualPasteText}
                            onChange={(e) => setManualPasteText(e.target.value)}
                            style={{ fontFamily: 'monospace', fontSize: '0.85rem', marginBottom: '18px' }}
                        />

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button className="btn-secondary" onClick={() => setShowManualPasteModal(false)}>
                                Cancelar
                            </button>
                            <button className="btn-primary" onClick={handleApplyManualPaste}>
                                Processar e Higienizar (13D)
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};
