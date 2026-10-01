import React, { useState, useEffect } from 'react';
import {
    UploadCloud,
    FileSpreadsheet,
    CheckCircle2,
    AlertCircle,
    Trash2,
    Download,
    Send,
    RefreshCw,
    Users,
    Clock,
    Search,
    ChevronRight,
    ChevronLeft,
    Sparkles,
    Calendar,
    Eye,
    Plus,
    Copy,
    Edit3,
    Layers,
    MessageSquare,
    ImageIcon,
    Video,
    ExternalLink,
    X,
    Filter,
    ArrowRight,
    ArrowLeft,
    Globe,
    User,
    Check,
    SlidersHorizontal,
    ChevronDown,
    ChevronUp,
    CheckSquare,
    Square,
    Link as LinkIcon,
    Zap
} from 'lucide-react';
import { ParsedContact, ClientSubmission, SubmissionAd, RotatorTarget } from '../types';
import { excelService, SpreadsheetAnalysis } from '../services/excelService';
import { clientSubmissionStorage } from '../services/clientSubmissionStorage';
import { rotatorStorage } from '../services/rotatorStorage';

interface ClientUploadProps {
    onSendToDispatch: (contacts: ParsedContact[], headers: string[], clientName: string) => void;
}

const TEMPLATE_PRESETS: Record<'2' | '4' | '5', {
    label: string;
    variablesCount: number;
    showFifth: boolean;
    defaultText: string;
    placeholders: string[];
}> = {
    '2': {
        label: '2 Variáveis',
        variablesCount: 2,
        showFifth: false,
        defaultText: 'Olá {{1}}!\n\nEstamos informando que {{2}}.\n\nPara aproveitar agora, clique no botão abaixo!',
        placeholders: [
            'Ex: Nome do Contato ({{1}})',
            'Ex: Assunto / Informação ({{2}})'
        ]
    },
    '4': {
        label: '4 Variáveis',
        variablesCount: 4,
        showFifth: false,
        defaultText: 'Olá {{1}}!\n\nEstamos informando que {{2}}.\n\nMais detalhes: {{3}}\n\nPara {{4}}, clique no botão abaixo!',
        placeholders: [
            'Ex: Nome do Contato ({{1}})',
            'Ex: Assunto / Informação ({{2}})',
            'Ex: Detalhes ou Desconto ({{3}})',
            'Ex: Ação / Aproveitar ({{4}})'
        ]
    },
    '5': {
        label: '5 Variáveis',
        variablesCount: 5,
        showFifth: true,
        defaultText: 'Olá {{1}}, tudo bem?\n\nEstamos passando por aqui para informar que {{2}}.\n\nMais detalhes: {{3}}\n\nObservação importante: {{4}}\n\nPara {{5}}, clique no botão abaixo 👇',
        placeholders: [
            'Ex: Nome do Contato ({{1}})',
            'Ex: Assunto / Informação ({{2}})',
            'Ex: Detalhes ou Desconto ({{3}})',
            'Ex: Observação Importante ({{4}})',
            'Ex: Benefício / Link Especial ({{5}})'
        ]
    }
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
    PENDENTE: { label: 'Pendente', color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
    'EM ANDAMENTO': { label: 'Em Andamento', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
    GERADO: { label: 'Gerado', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
    AGENDADO: { label: 'Agendado', color: '#0284c7', bg: '#f0f9ff', border: '#bae6fd' },
    CONCLUIDO: { label: 'Concluído', color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' },
    CANCELADO: { label: 'Cancelado', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' }
};

export const ClientUpload: React.FC<ClientUploadProps> = ({ onSendToDispatch }) => {
    // View Toggle: 'cards' | 'schedule' | 'quick_upload'
    const [viewMode, setViewMode] = useState<'cards' | 'schedule' | 'quick_upload'>('cards');

    // Submissions List
    const [submissions, setSubmissions] = useState<ClientSubmission[]>([]);
    const [isLoadingSubmissions, setIsLoadingSubmissions] = useState(true);

    // Smart Filters State
    const [searchQuery, setSearchQuery] = useState('');
    const [showSmartFilters, setShowSmartFilters] = useState(false);
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [typeFilter, setTypeFilter] = useState('ALL');
    const [dddFilter, setDddFilter] = useState('ALL');
    const [startDateFilter, setStartDateFilter] = useState('');
    const [endDateFilter, setEndDateFilter] = useState('');
    const [onlyUpcomingFilter, setOnlyUpcomingFilter] = useState(false);

    // Bulk Selection State
    const [selectedIds, setSelectedIds] = useState<(number | string)[]>([]);
    const [showBulkScheduleModal, setShowBulkScheduleModal] = useState(false);
    const [bulkScheduleDate, setBulkScheduleDate] = useState('');

    // Schedule / Calendar View State
    const [agendaSelectedDate, setAgendaSelectedDate] = useState<string>(() => {
        return new Date().toLocaleDateString('en-CA');
    });

    // Smartphone Preview Modal State (for viewing any campaign)
    const [previewModalSubmission, setPreviewModalSubmission] = useState<ClientSubmission | null>(null);

    // Toast Feedback
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    // -------------------------------------------------------------
    // WIZARD / CREATE NEW MODAL STATE
    // -------------------------------------------------------------
    const [showNewModal, setShowNewModal] = useState(false);
    const [wizardStep, setWizardStep] = useState<number>(1);
    const [isSavingSubmission, setIsSavingSubmission] = useState(false);

    // Form fields for Creation
    const [formCampaignName, setFormCampaignName] = useState('');
    const [formSenderPhone, setFormSenderPhone] = useState('');
    const [formProfileName, setFormProfileName] = useState('');
    const [formDdd, setFormDdd] = useState('11');
    const [formProfilePhoto, setFormProfilePhoto] = useState('');
    const [formDispatchDate, setFormDispatchDate] = useState('');
    const [formNotes, setFormNotes] = useState('');

    // Creative & Message
    const [formTemplateType, setFormTemplateType] = useState<'TEXT' | 'IMAGE' | 'VIDEO'>('TEXT');
    const [formMediaUrl, setFormMediaUrl] = useState('');
    const [formButtonLink, setFormButtonLink] = useState('');

    // Variable Presets (2 / 4 / 5 or custom) & Individual Variable Inputs
    const [formVariablePreset, setFormVariablePreset] = useState<'2' | '4' | '5' | 'custom'>('4');
    const [formVariables, setFormVariables] = useState<string[]>(['', '', '', '', '']);
    const [formShowFifthVar, setFormShowFifthVar] = useState(false);
    const [formAdCopy, setFormAdCopy] = useState(TEMPLATE_PRESETS['4'].defaultText);

    // Multi-Link & Rotator PRO for Creation
    const [formCtaTargets, setFormCtaTargets] = useState<RotatorTarget[]>([{ url: '', weight: 1 }]);
    const [formRotatorSlug, setFormRotatorSlug] = useState('');
    const [isGeneratingFormRotator, setIsGeneratingFormRotator] = useState(false);

    // Uploaded spreadsheet within wizard
    const [wizardFile, setWizardFile] = useState<File | null>(null);
    const [wizardAnalysis, setWizardAnalysis] = useState<SpreadsheetAnalysis | null>(null);
    const [isProcessingWizardSheet, setIsProcessingWizardSheet] = useState(false);

    // -------------------------------------------------------------
    // EDIT MODAL STATE (EDIT EVERYTHING)
    // -------------------------------------------------------------
    const [editingSubmission, setEditingSubmission] = useState<ClientSubmission | null>(null);
    const [editCampaignName, setEditCampaignName] = useState('');
    const [editSenderPhone, setEditSenderPhone] = useState('');
    const [editProfileName, setEditProfileName] = useState('');
    const [editDdd, setEditDdd] = useState('11');
    const [editStatus, setEditStatus] = useState('PENDENTE');
    const [editProfilePhoto, setEditProfilePhoto] = useState('');
    const [editDispatchDate, setEditDispatchDate] = useState('');
    const [editTemplateType, setEditTemplateType] = useState<'TEXT' | 'IMAGE' | 'VIDEO'>('TEXT');
    const [editMediaUrl, setEditMediaUrl] = useState('');
    const [editButtonLink, setEditButtonLink] = useState('');
    const [editNotes, setEditNotes] = useState('');
    const [isSavingEdit, setIsSavingEdit] = useState(false);

    // Variable Presets & Inputs for Edit
    const [editVariablePreset, setEditVariablePreset] = useState<'2' | '4' | '5' | 'custom'>('4');
    const [editVariables, setEditVariables] = useState<string[]>(['', '', '', '', '']);
    const [editShowFifthVar, setEditShowFifthVar] = useState(false);
    const [editAdCopy, setEditAdCopy] = useState('');

    // Multi-Link & Rotator PRO for Edit
    const [editCtaTargets, setEditCtaTargets] = useState<RotatorTarget[]>([{ url: '', weight: 1 }]);
    const [editRotatorSlug, setEditRotatorSlug] = useState('');
    const [isGeneratingEditRotator, setIsGeneratingEditRotator] = useState(false);

    // -------------------------------------------------------------
    // QUICK UPLOAD VIEW STATE
    // -------------------------------------------------------------
    const [quickClientName, setQuickClientName] = useState('');
    const [quickFile, setQuickFile] = useState<File | null>(null);
    const [isProcessingQuick, setIsProcessingQuick] = useState(false);
    const [quickAnalysis, setQuickAnalysis] = useState<SpreadsheetAnalysis | null>(null);
    const [quickPhoneCol, setQuickPhoneCol] = useState('');
    const [quickNameCol, setQuickNameCol] = useState('');
    const [quickRemoveDupes, setQuickRemoveDupes] = useState(true);
    const [quickDiscardNoName, setQuickDiscardNoName] = useState(false);

    useEffect(() => {
        loadSubmissions();
        const handleSubmissionsUpdated = () => {
            loadSubmissions();
        };
        window.addEventListener('client_submissions_updated', handleSubmissionsUpdated);
        return () => window.removeEventListener('client_submissions_updated', handleSubmissionsUpdated);
    }, []);

    const showToast = (msg: string) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(null), 3500);
    };

    const loadSubmissions = async () => {
        setIsLoadingSubmissions(true);
        try {
            const data = await clientSubmissionStorage.getSubmissions();
            setSubmissions(data || []);
        } catch (err) {
            console.error('Error loading submissions:', err);
        } finally {
            setIsLoadingSubmissions(false);
        }
    };

    const ensureProtocol = (url: string) => {
        if (!url) return '';
        const trimmed = url.trim();
        if (/^https?:\/\//i.test(trimmed)) return trimmed;
        return `https://${trimmed}`;
    };

    // Helper: update message copy when 5th variable is toggled
    const handleToggleFifthVar = (checked: boolean, isEdit = false) => {
        if (isEdit) {
            setEditShowFifthVar(checked);
            if (checked) {
                setEditVariablePreset('5');
                handleSelectPreset('5', true);
            } else if (editVariablePreset === '5') {
                setEditVariablePreset('4');
                handleSelectPreset('4', true);
            }
        } else {
            setFormShowFifthVar(checked);
            if (checked) {
                setFormVariablePreset('5');
                handleSelectPreset('5', false);
            } else if (formVariablePreset === '5') {
                setFormVariablePreset('4');
                handleSelectPreset('4', false);
            }
        }
    };

    // Helper: select variable presets (2, 4, 5 variables or custom)
    const handleSelectPreset = (presetKey: '2' | '4' | '5' | 'custom', isEdit = false) => {
        if (presetKey === 'custom') {
            if (isEdit) setEditVariablePreset('custom');
            else setFormVariablePreset('custom');
            return;
        }

        const preset = TEMPLATE_PRESETS[presetKey];
        if (isEdit) {
            setEditVariablePreset(presetKey);
            setEditShowFifthVar(preset.showFifth);
            const v1 = editVariables[0] || '{{1}}';
            const v2 = editVariables[1] || '{{2}}';
            const v3 = editVariables[2] || '{{3}}';
            const v4 = editVariables[3] || '{{4}}';
            const v5 = editVariables[4] || '{{5}}';

            if (presetKey === '2') {
                setEditAdCopy(`Olá ${v1}!\n\nEstamos informando que ${v2}.\n\nPara aproveitar agora, clique no botão abaixo!`);
            } else if (presetKey === '5') {
                setEditAdCopy(`Olá ${v1}, tudo bem?\n\nEstamos passando por aqui para informar que ${v2}.\n\nMais detalhes: ${v3}\n\nObservação importante: ${v4}\n\nPara ${v5}, clique no botão abaixo 👇`);
            } else {
                setEditAdCopy(`Olá ${v1}!\n\nEstamos informando que ${v2}.\n\nMais detalhes: ${v3}\n\nPara ${v4}, clique no botão abaixo!`);
            }
        } else {
            setFormVariablePreset(presetKey);
            setFormShowFifthVar(preset.showFifth);
            const v1 = formVariables[0] || '{{1}}';
            const v2 = formVariables[1] || '{{2}}';
            const v3 = formVariables[2] || '{{3}}';
            const v4 = formVariables[3] || '{{4}}';
            const v5 = formVariables[4] || '{{5}}';

            if (presetKey === '2') {
                setFormAdCopy(`Olá ${v1}!\n\nEstamos informando que ${v2}.\n\nPara aproveitar agora, clique no botão abaixo!`);
            } else if (presetKey === '5') {
                setFormAdCopy(`Olá ${v1}, tudo bem?\n\nEstamos passando por aqui para informar que ${v2}.\n\nMais detalhes: ${v3}\n\nObservação importante: ${v4}\n\nPara ${v5}, clique no botão abaixo 👇`);
            } else {
                setFormAdCopy(`Olá ${v1}!\n\nEstamos informando que ${v2}.\n\nMais detalhes: ${v3}\n\nPara ${v4}, clique no botão abaixo!`);
            }
        }
    };

    // Helper: handle individual variable input edits with real-time text sync
    const handleVariableInputChange = (idx: number, val: string, isEdit = false) => {
        if (isEdit) {
            const updated = [...editVariables];
            updated[idx] = val;
            setEditVariables(updated);

            // If a standard template is selected, update copy dynamically
            if (editVariablePreset !== 'custom') {
                const v1 = updated[0] || '{{1}}';
                const v2 = updated[1] || '{{2}}';
                const v3 = updated[2] || '{{3}}';
                const v4 = updated[3] || '{{4}}';
                const v5 = updated[4] || '{{5}}';

                if (editVariablePreset === '2') {
                    setEditAdCopy(`Olá ${v1}!\n\nEstamos informando que ${v2}.\n\nPara aproveitar agora, clique no botão abaixo!`);
                } else if (editVariablePreset === '5' || editShowFifthVar) {
                    setEditAdCopy(`Olá ${v1}, tudo bem?\n\nEstamos passando por aqui para informar que ${v2}.\n\nMais detalhes: ${v3}\n\nObservação importante: ${v4}\n\nPara ${v5}, clique no botão abaixo 👇`);
                } else {
                    setEditAdCopy(`Olá ${v1}!\n\nEstamos informando que ${v2}.\n\nMais detalhes: ${v3}\n\nPara ${v4}, clique no botão abaixo!`);
                }
            }
        } else {
            const updated = [...formVariables];
            updated[idx] = val;
            setFormVariables(updated);

            // If a standard template is selected, update copy dynamically
            if (formVariablePreset !== 'custom') {
                const v1 = updated[0] || '{{1}}';
                const v2 = updated[1] || '{{2}}';
                const v3 = updated[2] || '{{3}}';
                const v4 = updated[3] || '{{4}}';
                const v5 = updated[4] || '{{5}}';

                if (formVariablePreset === '2') {
                    setFormAdCopy(`Olá ${v1}!\n\nEstamos informando que ${v2}.\n\nPara aproveitar agora, clique no botão abaixo!`);
                } else if (formVariablePreset === '5' || formShowFifthVar) {
                    setFormAdCopy(`Olá ${v1}, tudo bem?\n\nEstamos passando por aqui para informar que ${v2}.\n\nMais detalhes: ${v3}\n\nObservação importante: ${v4}\n\nPara ${v5}, clique no botão abaixo 👇`);
                } else {
                    setFormAdCopy(`Olá ${v1}!\n\nEstamos informando que ${v2}.\n\nMais detalhes: ${v3}\n\nPara ${v4}, clique no botão abaixo!`);
                }
            }
        }
    };

    // Helper: calculate distribution percentage for Rotator targets
    const calculateTargetPercentage = (weight: number, list: RotatorTarget[]) => {
        const total = list.reduce((sum, t) => sum + (Number(t.weight) || 1), 0);
        return total === 0 ? '0.0' : ((weight / total) * 100).toFixed(1);
    };

    const handleAddCtaTarget = (isEdit = false) => {
        if (isEdit) setEditCtaTargets(prev => [...prev, { url: '', weight: 1 }]);
        else setFormCtaTargets(prev => [...prev, { url: '', weight: 1 }]);
    };

    const handleRemoveCtaTarget = (index: number, isEdit = false) => {
        if (isEdit) {
            if (editCtaTargets.length > 1) {
                setEditCtaTargets(prev => prev.filter((_, i) => i !== index));
            }
        } else {
            if (formCtaTargets.length > 1) {
                setFormCtaTargets(prev => prev.filter((_, i) => i !== index));
            }
        }
    };

    const handleCtaTargetChange = (index: number, field: 'url' | 'weight', val: any, isEdit = false) => {
        const updater = (list: RotatorTarget[]) => list.map((t, idx) => {
            if (idx === index) {
                return { ...t, [field]: field === 'weight' ? (parseInt(val) || 1) : val };
            }
            return t;
        });

        if (isEdit) setEditCtaTargets(prev => updater(prev));
        else setFormCtaTargets(prev => updater(prev));
    };

    // Helper: create short link or Rotator PRO directly via rotatorStorage
    const handleGenerateCtaLink = async (isEdit = false) => {
        const targets = isEdit ? editCtaTargets : formCtaTargets;
        const slug = isEdit ? editRotatorSlug : formRotatorSlug;
        const title = isEdit ? (editCampaignName || 'Link Campanha') : (formCampaignName || 'Link Campanha');

        const validTargets = targets
            .filter(t => t.url && t.url.trim() !== '')
            .map(t => ({
                url: ensureProtocol(t.url.trim()),
                weight: Number(t.weight) > 0 ? Number(t.weight) : 1
            }));

        if (validTargets.length === 0) {
            alert('Por favor, informe ao menos uma URL de destino para criar no encurtador / rotacionador.');
            return;
        }

        if (isEdit) setIsGeneratingEditRotator(true);
        else setIsGeneratingFormRotator(true);

        try {
            const isMultiple = validTargets.length > 1;
            const created = await rotatorStorage.createRotator({
                title: isMultiple ? `Rotacionador: ${title}` : `Encurtador: ${title}`,
                slug: slug.trim() || undefined,
                targets: validTargets
            });

            const fullShortUrl = `${window.location.origin}/r/${created.slug}`;
            if (isEdit) {
                setEditButtonLink(fullShortUrl);
                setEditRotatorSlug(created.slug);
                setEditCtaTargets(validTargets);
            } else {
                setFormButtonLink(fullShortUrl);
                setFormRotatorSlug(created.slug);
                setFormCtaTargets(validTargets);
            }

            showToast(isMultiple
                ? `✓ Rotacionador PRO ativado com ${validTargets.length} links! Aplicado ao botão CTA.`
                : `✓ Link encurtado gerado com sucesso! Aplicado ao botão CTA.`
            );
        } catch (err: any) {
            alert(`Erro ao gerar link no encurtador: ${err.message}`);
        } finally {
            if (isEdit) setIsGeneratingEditRotator(false);
            else setIsGeneratingFormRotator(false);
        }
    };

    // File handler for wizard profile photo
    const handlePhotoUpload = (f: File, isEdit = false) => {
        if (!f) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const val = String(e.target?.result || '');
            if (isEdit) setEditProfilePhoto(val);
            else setFormProfilePhoto(val);
        };
        reader.readAsDataURL(f);
    };

    // File handler for media upload (image or video)
    const handleMediaFileUpload = (f: File, isEdit = false) => {
        if (!f) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const val = String(e.target?.result || '');
            if (isEdit) setEditMediaUrl(val);
            else setFormMediaUrl(val);
        };
        reader.readAsDataURL(f);
    };

    // File handler for wizard spreadsheet
    const handleWizardSheetUpload = async (f: File) => {
        if (!f) return;
        setWizardFile(f);
        setIsProcessingWizardSheet(true);
        try {
            const result = await excelService.parseFile(f);
            setWizardAnalysis(result);
            showToast(`✓ Planilha analisada: ${result.totalRows || result.stats.totalRows} linhas lidas.`);
        } catch (err: any) {
            alert(`Erro ao analisar planilha: ${err.message}`);
            setWizardFile(null);
            setWizardAnalysis(null);
        } finally {
            setIsProcessingWizardSheet(false);
        }
    };

    // Save wizard submission
    const handleSaveWizardSubmission = async (dispatchImmediately = false) => {
        if (!formCampaignName.trim()) {
            alert('Por favor, informe o Nome da Campanha.');
            setWizardStep(1);
            return;
        }
        if (!formProfileName.trim()) {
            alert('Por favor, informe o Nome do Atendimento.');
            setWizardStep(1);
            return;
        }
        if (!formDdd.trim()) {
            alert('Por favor, informe o DDD regional.');
            setWizardStep(1);
            return;
        }

        setIsSavingSubmission(true);
        try {
            const contacts = wizardAnalysis ? wizardAnalysis.contacts : [];
            const headers = wizardAnalysis ? wizardAnalysis.headers : ['Telefone', 'Nome'];

            // Prepare button link and auto-create rotator if multiple targets provided
            let finalButtonLink = ensureProtocol(formButtonLink);
            let finalSlug = formRotatorSlug;
            const validTargets = formCtaTargets
                .filter(t => t.url && t.url.trim() !== '')
                .map(t => ({
                    url: ensureProtocol(t.url.trim()),
                    weight: Number(t.weight) > 0 ? Number(t.weight) : 1
                }));

            if (validTargets.length > 1 && (!finalButtonLink || !finalButtonLink.includes('/r/'))) {
                try {
                    const rot = await rotatorStorage.createRotator({
                        title: `Rotacionador: ${formCampaignName.trim()}`,
                        slug: formRotatorSlug || undefined,
                        targets: validTargets
                    });
                    finalButtonLink = `${window.location.origin}/r/${rot.slug}`;
                    finalSlug = rot.slug;
                } catch (e) {
                    console.warn('Auto-create rotator error:', e);
                }
            } else if (validTargets.length === 1 && !finalButtonLink) {
                finalButtonLink = validTargets[0].url;
            }

            const newSub: Partial<ClientSubmission> = {
                campaign_name: formCampaignName.trim(),
                sender_phone: formSenderPhone.trim(),
                profile_name: formProfileName.trim(),
                client_name: formCampaignName.trim(),
                ddd: formDdd.trim().replace(/\D/g, '').substring(0, 2) || '11',
                profile_photo: formProfilePhoto,
                dispatch_date: formDispatchDate || '',
                notes: formNotes.trim(),
                template_type: formTemplateType,
                media_url: formMediaUrl.trim(),
                button_link: finalButtonLink,
                ad_copy: formAdCopy.trim(),
                variables: formVariables,
                showFifthVariable: formShowFifthVar,
                cta_targets: validTargets,
                rotator_slug: finalSlug,
                status: formDispatchDate ? 'AGENDADO' : 'PENDENTE',
                fileName: wizardFile ? wizardFile.name : 'sem_planilha.xlsx',
                validCount: contacts.length,
                totalRows: wizardAnalysis ? (wizardAnalysis.totalRows || wizardAnalysis.stats.totalRows) : contacts.length,
                contacts,
                headers,
                ads: [{
                    id: '1',
                    ad_name: formCampaignName.trim(),
                    sender_phone: formSenderPhone.trim(),
                    template_type: formTemplateType,
                    message_mode: 'manual',
                    media_url: formMediaUrl.trim(),
                    button_link: finalButtonLink,
                    ad_copy: formAdCopy.trim(),
                    variables: formVariables,
                    showFifthVariable: formShowFifthVar,
                    cta_targets: validTargets,
                    rotator_slug: finalSlug,
                    scheduled_at: formDispatchDate || ''
                }]
            };

            const created = await clientSubmissionStorage.createSubmission(newSub);
            showToast('✓ Campanha cadastrada com sucesso!');
            setShowNewModal(false);
            resetWizardForm();
            await loadSubmissions();

            if (dispatchImmediately && contacts.length > 0) {
                onSendToDispatch(contacts, headers, formCampaignName.trim());
            }
        } catch (err: any) {
            alert(`Erro ao salvar campanha: ${err.message}`);
        } finally {
            setIsSavingSubmission(false);
        }
    };

    const resetWizardForm = () => {
        setWizardStep(1);
        setFormCampaignName('');
        setFormSenderPhone('');
        setFormProfileName('');
        setFormDdd('11');
        setFormProfilePhoto('');
        setFormDispatchDate('');
        setFormNotes('');
        setFormTemplateType('TEXT');
        setFormMediaUrl('');
        setFormButtonLink('');
        setFormVariablePreset('4');
        setFormVariables(['', '', '', '', '']);
        setFormShowFifthVar(false);
        setFormAdCopy(TEMPLATE_PRESETS['4'].defaultText);
        setFormCtaTargets([{ url: '', weight: 1 }]);
        setFormRotatorSlug('');
        setWizardFile(null);
        setWizardAnalysis(null);
    };

    // -------------------------------------------------------------
    // EDIT SUBMISSION LOGIC (EDIT ALL FIELDS)
    // -------------------------------------------------------------
    const handleOpenEdit = (sub: ClientSubmission) => {
        setEditingSubmission(sub);
        setEditCampaignName(sub.campaign_name || sub.client_name || sub.profile_name || '');
        setEditSenderPhone(sub.sender_phone || (sub.ads && sub.ads[0]?.sender_phone) || '');
        setEditProfileName(sub.profile_name || '');
        setEditDdd(sub.ddd || '11');
        setEditStatus(sub.status || 'PENDENTE');
        setEditProfilePhoto(sub.profile_photo || '');
        setEditDispatchDate(sub.dispatch_date || '');
        setEditTemplateType(sub.template_type || 'TEXT');
        setEditMediaUrl(sub.media_url || '');
        setEditButtonLink(sub.button_link || '');
        setEditAdCopy(sub.ad_copy || '');
        setEditNotes(sub.notes || '');

        // Initialize variables
        const initialVars = (sub.variables && sub.variables.length > 0)
            ? [...sub.variables, '', '', '', ''].slice(0, 5)
            : (sub.ads && sub.ads[0]?.variables && sub.ads[0].variables.length > 0)
                ? [...sub.ads[0].variables, '', '', '', ''].slice(0, 5)
                : ['', '', '', '', ''];
        setEditVariables(initialVars);

        // Detect fifth variable
        const isFifth = sub.showFifthVariable ?? (sub.ads && sub.ads[0]?.showFifthVariable) ?? (sub.ad_copy?.includes('{{5}}'));
        setEditShowFifthVar(!!isFifth);

        // Detect preset
        if (sub.ad_copy?.includes('{{5}}')) setEditVariablePreset('5');
        else if (sub.ad_copy?.includes('{{3}}') || sub.ad_copy?.includes('{{4}}')) setEditVariablePreset('4');
        else if (sub.ad_copy?.includes('{{1}}') || sub.ad_copy?.includes('{{2}}')) setEditVariablePreset('2');
        else setEditVariablePreset('custom');

        // Multi-link & rotator targets
        const initialTargets = sub.cta_targets && sub.cta_targets.length > 0
            ? sub.cta_targets
            : (sub.ads && sub.ads[0]?.cta_targets && sub.ads[0].cta_targets.length > 0)
                ? sub.ads[0].cta_targets
                : sub.button_link
                    ? [{ url: sub.button_link, weight: 1 }]
                    : [{ url: '', weight: 1 }];
        setEditCtaTargets(initialTargets);
        setEditRotatorSlug(sub.rotator_slug || sub.ads?.[0]?.rotator_slug || '');
    };

    const handleSaveEdit = async () => {
        if (!editingSubmission) return;
        if (!editCampaignName.trim()) return alert('Informe o Nome da Campanha.');
        if (!editProfileName.trim()) return alert('Informe o Nome do Atendimento.');

        setIsSavingEdit(true);
        try {
            // Auto-create / update rotator if multiple targets
            let finalEditButtonLink = ensureProtocol(editButtonLink);
            let finalEditSlug = editRotatorSlug;
            const validEditTargets = editCtaTargets
                .filter(t => t.url && t.url.trim() !== '')
                .map(t => ({
                    url: ensureProtocol(t.url.trim()),
                    weight: Number(t.weight) > 0 ? Number(t.weight) : 1
                }));

            if (validEditTargets.length > 1 && (!finalEditButtonLink || !finalEditButtonLink.includes('/r/'))) {
                try {
                    const rot = await rotatorStorage.createRotator({
                        title: `Rotacionador: ${editCampaignName.trim()}`,
                        slug: editRotatorSlug || undefined,
                        targets: validEditTargets
                    });
                    finalEditButtonLink = `${window.location.origin}/r/${rot.slug}`;
                    finalEditSlug = rot.slug;
                } catch (e) {
                    console.warn('Auto-create rotator error:', e);
                }
            } else if (validEditTargets.length === 1 && !finalEditButtonLink) {
                finalEditButtonLink = validEditTargets[0].url;
            }

            const updatedAds = (editingSubmission.ads || []).map(ad => ({
                ...ad,
                ad_name: editCampaignName.trim(),
                sender_phone: editSenderPhone.trim(),
                template_type: editTemplateType,
                media_url: editMediaUrl.trim(),
                button_link: finalEditButtonLink,
                ad_copy: editAdCopy.trim(),
                variables: editVariables,
                showFifthVariable: editShowFifthVar,
                cta_targets: validEditTargets,
                rotator_slug: finalEditSlug,
                scheduled_at: editDispatchDate || ''
            }));

            await clientSubmissionStorage.updateSubmission(editingSubmission.id, {
                campaign_name: editCampaignName.trim(),
                sender_phone: editSenderPhone.trim(),
                profile_name: editProfileName.trim(),
                client_name: editCampaignName.trim(),
                ddd: editDdd.trim().replace(/\D/g, '').substring(0, 2) || '11',
                status: editStatus,
                profile_photo: editProfilePhoto,
                dispatch_date: editDispatchDate || '',
                template_type: editTemplateType,
                media_url: editMediaUrl.trim(),
                button_link: finalEditButtonLink,
                ad_copy: editAdCopy.trim(),
                notes: editNotes.trim(),
                variables: editVariables,
                showFifthVariable: editShowFifthVar,
                cta_targets: validEditTargets,
                rotator_slug: finalEditSlug,
                ads: updatedAds.length > 0 ? updatedAds : [{
                    id: '1',
                    ad_name: editCampaignName.trim(),
                    sender_phone: editSenderPhone.trim(),
                    template_type: editTemplateType,
                    message_mode: 'manual',
                    media_url: editMediaUrl.trim(),
                    button_link: finalEditButtonLink,
                    ad_copy: editAdCopy.trim(),
                    variables: editVariables,
                    showFifthVariable: editShowFifthVar,
                    cta_targets: validEditTargets,
                    rotator_slug: finalEditSlug
                }]
            });

            showToast('✓ Campanha atualizada com sucesso!');
            setEditingSubmission(null);
            await loadSubmissions();
        } catch (err: any) {
            alert(`Erro ao atualizar: ${err.message}`);
        } finally {
            setIsSavingEdit(false);
        }
    };

    // -------------------------------------------------------------
    // BULK SELECTION & OPERATIONS
    // -------------------------------------------------------------
    const toggleSelectAll = () => {
        if (selectedIds.length === filteredSubmissions.length && filteredSubmissions.length > 0) {
            setSelectedIds([]);
        } else {
            setSelectedIds(filteredSubmissions.map(s => s.id));
        }
    };

    const toggleSelectSubmission = (id: number | string) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const handleBulkStatusChange = async (newStatus: string) => {
        if (selectedIds.length === 0) return;
        await clientSubmissionStorage.bulkUpdateStatus(selectedIds, newStatus);
        showToast(`Status atualizado para "${newStatus}" em ${selectedIds.length} campanhas.`);
        setSelectedIds([]);
        await loadSubmissions();
    };

    const handleBulkScheduleSubmit = async () => {
        if (selectedIds.length === 0 || !bulkScheduleDate) return;
        await clientSubmissionStorage.bulkUpdateDispatchDate(selectedIds, bulkScheduleDate);
        showToast(`Data/Horário de disparo definido para ${selectedIds.length} campanhas.`);
        setShowBulkScheduleModal(false);
        setBulkScheduleDate('');
        setSelectedIds([]);
        await loadSubmissions();
    };

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return;
        if (!window.confirm(`Deseja excluir permanentemente ${selectedIds.length} campanhas selecionadas?`)) return;
        await clientSubmissionStorage.bulkDelete(selectedIds);
        showToast('Campanhas selecionadas excluídas.');
        setSelectedIds([]);
        await loadSubmissions();
    };

    const handleBulkSendToDispatch = () => {
        if (selectedIds.length === 0) return;
        const selected = submissions.filter(s => selectedIds.includes(s.id));
        const allContacts: ParsedContact[] = [];
        let firstHeaders: string[] = ['Telefone', 'Nome'];

        selected.forEach(s => {
            if (s.contacts && s.contacts.length > 0) {
                allContacts.push(...s.contacts);
                if (s.headers && s.headers.length > 0) firstHeaders = s.headers;
            }
        });

        if (allContacts.length === 0) {
            alert('Nenhum contato encontrado nas campanhas selecionadas.');
            return;
        }

        // Deduplicate numbers
        const seen = new Set<string>();
        const uniqueContacts = allContacts.filter(c => {
            if (seen.has(c.telefone)) return false;
            seen.add(c.telefone);
            return true;
        });

        showToast(`✓ ${uniqueContacts.length} contatos únicos carregados para o disparador!`);
        onSendToDispatch(uniqueContacts, firstHeaders, `Lote Múltiplo (${selected.length} campanhas)`);
    };

    // Quick upload parsing
    const handleQuickFileChange = async (selectedFile: File) => {
        if (!selectedFile) return;
        setQuickFile(selectedFile);
        setIsProcessingQuick(true);

        try {
            const result = await excelService.parseFile(selectedFile);
            setQuickAnalysis(result);
            setQuickPhoneCol(result.detectedPhoneColumn || (result.headers[result.detectedPhoneCol] ?? ''));
            setQuickNameCol(result.detectedNameColumn || (result.detectedNameCol !== -1 ? result.headers[result.detectedNameCol] : ''));

            if (!quickClientName.trim()) {
                const cleanName = selectedFile.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
                setQuickClientName(cleanName);
            }
        } catch (err: any) {
            console.error('Erro ao analisar planilha:', err);
            alert(`Erro ao processar planilha: ${err.message || 'Formato incompatível'}`);
            setQuickFile(null);
            setQuickAnalysis(null);
        } finally {
            setIsProcessingQuick(false);
        }
    };

    const handleQuickColumnChange = (newPhone: string, newName: string) => {
        if (!quickAnalysis) return;
        setQuickPhoneCol(newPhone);
        setQuickNameCol(newName);
        const updated = excelService.reExtractWithColumns(quickAnalysis, newPhone, newName);
        setQuickAnalysis(updated);
    };

    const getFilteredQuickContacts = (): ParsedContact[] => {
        if (!quickAnalysis) return [];
        let list = [...quickAnalysis.contacts];

        if (quickDiscardNoName) {
            list = list.filter(c => c.nome && c.nome.trim() !== '' && c.nome !== 'Sem Nome');
        }

        if (quickRemoveDupes) {
            const seen = new Set<string>();
            list = list.filter(c => {
                if (seen.has(c.telefone)) return false;
                seen.add(c.telefone);
                return true;
            });
        }

        return list;
    };

    const handleSendQuickToDispatch = () => {
        if (!quickAnalysis || !quickFile) return;
        const finalContacts = getFilteredQuickContacts();
        if (finalContacts.length === 0) {
            alert('Nenhum contato válido encontrado para envio.');
            return;
        }

        const effectiveClient = quickClientName.trim() || 'Lote ' + new Date().toLocaleDateString('pt-BR');
        
        clientSubmissionStorage.createSubmission({
            campaign_name: effectiveClient,
            profile_name: effectiveClient,
            client_name: effectiveClient,
            ddd: '11',
            template_type: 'TEXT',
            ad_copy: 'Olá {{1}}!',
            status: 'CONCLUIDO',
            fileName: quickFile.name,
            validCount: finalContacts.length,
            totalRows: quickAnalysis.totalRows || quickAnalysis.stats.totalRows,
            contacts: finalContacts,
            headers: quickAnalysis.headers,
            ads: [{
                id: '1',
                ad_name: effectiveClient,
                template_type: 'TEXT',
                message_mode: 'manual',
                ad_copy: 'Olá {{1}}!',
                variables: ['Nome']
            }]
        });

        showToast('✓ Lote enviado ao disparador multi-remetente!');
        onSendToDispatch(finalContacts, quickAnalysis.headers, effectiveClient);
    };

    const handleQuickDownloadSanitized = () => {
        const contacts = getFilteredQuickContacts();
        if (contacts.length === 0) return;
        const url = excelService.generateSanitizedCsvUrl(contacts);
        const a = document.createElement('a');
        a.href = url;
        a.download = `leads_higienizados_${(quickClientName || 'cliente').replace(/\s+/g, '_')}.csv`;
        a.click();
    };

    const handleDeleteSubmission = async (id: number | string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm('Deseja realmente excluir este cadastro / campanha?')) return;
        await clientSubmissionStorage.deleteSubmission(id);
        showToast('Campanha excluída.');
        loadSubmissions();
    };

    const handleDuplicate = async (sub: ClientSubmission, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm(`Deseja duplicar a campanha de ${sub.profile_name}?`)) return;
        await clientSubmissionStorage.duplicateSubmission(sub);
        showToast('Campanha duplicada com sucesso!');
        loadSubmissions();
    };

    // -------------------------------------------------------------
    // PREVIEW POPUP HELPERS (COPYBOARD, STATUS, SPREADSHEET 3X, MEDIA)
    // -------------------------------------------------------------
    const [copiedField, setCopiedField] = useState<string | null>(null);

    const handleCopyText = (text: string, fieldId: string) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        setCopiedField(fieldId);
        showToast('✓ Conteúdo copiado para a área de transferência!');
        setTimeout(() => {
            setCopiedField(prev => prev === fieldId ? null : prev);
        }, 2000);
    };

    const handlePreviewChangeStatus = async (newStatus: string) => {
        if (!previewModalSubmission) return;
        try {
            await clientSubmissionStorage.updateSubmission(previewModalSubmission.id, { status: newStatus });
            const updated: ClientSubmission = { ...previewModalSubmission, status: newStatus };
            setPreviewModalSubmission(updated);
            setSubmissions(prev => prev.map(s => String(s.id) === String(previewModalSubmission.id) ? updated : s));
            showToast(`✓ Status da campanha alterado para "${newStatus}"!`);
        } catch (err: any) {
            alert(`Erro ao atualizar status: ${err.message}`);
        }
    };

    const handleDownloadMedia = async (url: string, defaultFilename: string) => {
        if (!url) return;
        try {
            if (url.startsWith('data:')) {
                const a = document.createElement('a');
                a.href = url;
                a.download = defaultFilename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                showToast('✓ Download da mídia iniciado!');
                return;
            }
            const res = await fetch(url);
            const blob = await res.blob();
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = defaultFilename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);
            showToast('✓ Download da mídia iniciado!');
        } catch (e) {
            const a = document.createElement('a');
            a.href = url;
            a.download = defaultFilename;
            a.target = '_blank';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }
    };

    const handleDownloadSpreadsheetWithLimit = async (sub: ClientSubmission) => {
        const currentDownloads = Number(sub.download_count) || 0;
        if (currentDownloads >= 3) {
            alert('Aviso de Segurança: Esta planilha já atingiu o limite máximo de 3 downloads e foi excluída permanentemente.');
            return;
        }

        if (!sub.contacts || sub.contacts.length === 0) {
            alert('Nenhum contato disponível nesta planilha.');
            return;
        }

        // 1. Verificação Server-Side de Segurança (SECURITY-FIRST)
        const token = localStorage.getItem('auth_token');
        try {
            const serverCheck = await fetch(`/api/client-submissions/${sub.id}/download-spreadsheet`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                }
            });
            if (serverCheck.status === 410) {
                alert('Aviso de Segurança: Esta planilha já atingiu o limite máximo de 3 downloads e foi excluída permanentemente pelo servidor.');
                return;
            }
        } catch (netErr) {
            console.warn('[Security] Verificação de download offline:', netErr);
        }

        const url = excelService.generateSanitizedCsvUrl(sub.contacts);
        const a = document.createElement('a');
        a.href = url;
        const baseName = (sub.campaign_name || sub.profile_name || 'leads').replace(/[^\w\d]/g, '_');
        a.download = `planilha_${baseName}_download_${currentDownloads + 1}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        const newDownloadCount = currentDownloads + 1;
        const isExhausted = newDownloadCount >= 3;

        const updateData: Partial<ClientSubmission> = {
            download_count: newDownloadCount
        };

        if (isExhausted) {
            updateData.contacts = [];
            updateData.headers = [];
            updateData.fileName = 'Planilha Excluída (Limite de 3 downloads atingido)';
        }

        await clientSubmissionStorage.updateSubmission(sub.id, updateData);

        const updatedSub: ClientSubmission = {
            ...sub,
            ...updateData
        };

        setPreviewModalSubmission(updatedSub);
        setSubmissions(prev => prev.map(s => String(s.id) === String(sub.id) ? updatedSub : s));

        if (isExhausted) {
            alert('🔒 Diretriz de Segurança: Este foi o 3º download. A planilha foi baixada e excluída permanentemente do sistema!');
            showToast('⚠️ Planilha excluída automaticamente após o 3º download.');
        } else {
            showToast(`✓ Planilha baixada! Restam ${3 - newDownloadCount} download(s) permitidos.`);
        }
    };

    // Helper: format message copy for smartphone preview
    const renderPreviewText = (text: string, customVars?: string[]) => {
        if (!text) return 'Olá João!\n\nEstamos informando uma condição especial para você hoje.\n\nClique no botão abaixo!';
        const v1 = (customVars && customVars[0]) ? customVars[0] : 'João Silva';
        const v2 = (customVars && customVars[1]) ? customVars[1] : 'Sua oferta especial foi ativada';
        const v3 = (customVars && customVars[2]) ? customVars[2] : 'Válido até hoje às 23:59';
        const v4 = (customVars && customVars[3]) ? customVars[3] : 'Aproveitar agora';
        const v5 = (customVars && customVars[4]) ? customVars[4] : 'Garantir desconto';

        return text
            .replace(/\{\{1\}\}/g, v1)
            .replace(/\{\{2\}\}/g, v2)
            .replace(/\{\{3\}\}/g, v3)
            .replace(/\{\{4\}\}/g, v4)
            .replace(/\{\{5\}\}/g, v5);
    };

    // -------------------------------------------------------------
    // SMARTPHONE MOCKUP COMPONENT
    // -------------------------------------------------------------
    const renderPhoneMockup = (
        profileName: string,
        profilePhoto: string,
        templateType: 'TEXT' | 'IMAGE' | 'VIDEO',
        mediaUrl: string,
        adCopy: string,
        buttonLink: string,
        dispatchDate?: string,
        customVars?: string[]
    ) => {
        const timeDisplay = dispatchDate
            ? new Date(dispatchDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
            : '12:00';

        return (
            <div style={{
                width: '300px',
                height: '560px',
                background: '#0F172A',
                borderRadius: '38px',
                border: '8px solid #1E293B',
                boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                position: 'relative',
                flexShrink: 0
            }}>
                {/* Dynamic Island */}
                <div style={{
                    width: '90px',
                    height: '20px',
                    background: '#000000',
                    borderRadius: '12px',
                    margin: '6px auto 0 auto',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-around',
                    padding: '0 8px',
                    zIndex: 20
                }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#1E293B' }} />
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#090D16' }} />
                </div>

                {/* WhatsApp Top Header Bar */}
                <div style={{
                    background: '#1F2937',
                    padding: '10px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid #374151',
                    zIndex: 10
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        <div style={{
                            width: '34px',
                            height: '34px',
                            borderRadius: '50%',
                            background: '#374151',
                            overflow: 'hidden',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            border: '1.5px solid #10B981'
                        }}>
                            {profilePhoto ? (
                                <img src={profilePhoto} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                                <User size={18} color="#9CA3AF" />
                            )}
                        </div>
                        <div style={{ minWidth: 0, overflow: 'hidden' }}>
                            <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#F9FAFB', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {profileName || 'Nome do Atendimento'}
                            </p>
                            <p style={{ margin: 0, fontSize: '9.5px', color: '#10B981', fontWeight: 600 }}>
                                ● online
                            </p>
                        </div>
                    </div>
                    <span style={{ fontSize: '9px', fontWeight: 800, background: '#374151', color: '#10B981', padding: '2px 6px', borderRadius: '4px' }}>
                        {templateType}
                    </span>
                </div>

                {/* Chat Canvas (WhatsApp Background feel) */}
                <div style={{
                    flex: 1,
                    background: '#0B141A',
                    padding: '14px 10px',
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                }}>
                    {/* Date Pill */}
                    <div style={{ alignSelf: 'center', background: '#182229', color: '#8696A0', padding: '3px 10px', borderRadius: '6px', fontSize: '9.5px', fontWeight: 600 }}>
                        HOJE
                    </div>

                    {/* WhatsApp Balloon */}
                    <div style={{
                        alignSelf: 'flex-start',
                        maxWidth: '92%',
                        background: '#1F2C34',
                        color: '#E9EDEF',
                        borderRadius: '0px 10px 10px 10px',
                        overflow: 'hidden',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
                        fontSize: '11.5px',
                        lineHeight: 1.45
                    }}>
                        {/* Media Header (Image / Video) */}
                        {templateType === 'IMAGE' && (
                            <div style={{ width: '100%', height: '130px', background: '#2A3942', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                                {mediaUrl ? (
                                    <img src={mediaUrl} alt="Mídia" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    <div style={{ textAlign: 'center', color: '#8696A0' }}>
                                        <ImageIcon size={26} style={{ margin: '0 auto 4px auto' }} />
                                        <span style={{ fontSize: '10px', display: 'block' }}>Prévia de Imagem</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {templateType === 'VIDEO' && (
                            <div style={{ width: '100%', height: '130px', background: '#2A3942', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                                {mediaUrl ? (
                                    <video src={mediaUrl} controls style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    <div style={{ textAlign: 'center', color: '#8696A0' }}>
                                        <Video size={26} style={{ margin: '0 auto 4px auto' }} />
                                        <span style={{ fontSize: '10px', display: 'block' }}>Prévia de Vídeo</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Copy Text with variables replaced */}
                        <div style={{ padding: '8px 10px 4px 10px', whiteSpace: 'pre-wrap' }}>
                            {renderPreviewText(adCopy, customVars)}
                        </div>

                        {/* CTA Button */}
                        {buttonLink ? (
                            <div style={{
                                borderTop: '1px solid rgba(255,255,255,0.08)',
                                padding: '8px 10px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                                color: '#00A884',
                                fontWeight: 700,
                                fontSize: '11.5px',
                                background: 'rgba(0,0,0,0.1)'
                            }}>
                                <ExternalLink size={12} />
                                <span>Acessar Link</span>
                            </div>
                        ) : (
                            <div style={{
                                borderTop: '1px solid rgba(255,255,255,0.08)',
                                padding: '7px 10px',
                                textAlign: 'center',
                                color: '#8696A0',
                                fontSize: '10.5px'
                            }}>
                                <span>Acessar Link</span>
                            </div>
                        )}

                        {/* Time & Double Blue Checks */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '4px', padding: '0 8px 4px 8px', fontSize: '9px', color: '#8696A0' }}>
                            <span>{timeDisplay}</span>
                            <span style={{ color: '#53BDEB' }}>✓✓</span>
                        </div>
                    </div>
                </div>

                {/* WhatsApp Fake Input Footer */}
                <div style={{
                    background: '#1F2937',
                    padding: '8px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    borderTop: '1px solid #374151'
                }}>
                    <div style={{ flex: 1, background: '#2A3942', borderRadius: '16px', padding: '6px 12px', fontSize: '11px', color: '#8696A0' }}>
                        Mensagem
                    </div>
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#00A884', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Send size={13} color="#000" />
                    </div>
                </div>
            </div>
        );
    };

    // -------------------------------------------------------------
    // CALENDAR VIEW CALCULATIONS
    // -------------------------------------------------------------
    const dispatchesByDate: Record<string, ClientSubmission[]> = {};
    submissions.forEach(s => {
        const raw = s.dispatch_date || s.timestamp;
        if (raw) {
            try {
                const key = new Date(raw).toLocaleDateString('en-CA');
                if (!dispatchesByDate[key]) dispatchesByDate[key] = [];
                dispatchesByDate[key].push(s);
            } catch (e) {}
        }
    });

    const dayDispatches = [...(dispatchesByDate[agendaSelectedDate] || [])].sort((a, b) => {
        const tA = new Date(a.dispatch_date || a.timestamp).getTime();
        const tB = new Date(b.dispatch_date || b.timestamp).getTime();
        return tA - tB;
    });

    const todayObj = new Date();
    const todayKey = todayObj.toLocaleDateString('en-CA');
    const stripDates: { dateKey: string; weekday: string; dayMonth: string; count: number; isToday: boolean; isSelected: boolean }[] = [];

    for (let i = -3; i <= 10; i++) {
        const cur = new Date(todayObj);
        cur.setDate(todayObj.getDate() + i);
        const key = cur.toLocaleDateString('en-CA');
        const weekday = cur.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').toUpperCase();
        const dayMonth = cur.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        stripDates.push({
            dateKey: key,
            weekday,
            dayMonth,
            count: (dispatchesByDate[key] || []).length,
            isToday: key === todayKey,
            isSelected: key === agendaSelectedDate
        });
    }

    const jumpDay = (days: number) => {
        const parts = agendaSelectedDate.split('-');
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        d.setDate(d.getDate() + days);
        setAgendaSelectedDate(d.toLocaleDateString('en-CA'));
    };

    const formatLongDate = (key: string) => {
        try {
            const parts = key.split('-');
            const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
            const str = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
            return str.charAt(0).toUpperCase() + str.slice(1);
        } catch {
            return key;
        }
    };

    // Extract dynamic list of DDDs present in submissions
    const availableDdds = Array.from(new Set(submissions.map(s => s.ddd).filter(Boolean))).sort();

    // -------------------------------------------------------------
    // SMART FILTERING ENGINE
    // -------------------------------------------------------------
    const filteredSubmissions = submissions.filter(s => {
        const q = searchQuery.toLowerCase().trim();
        const matchesSearch = !q ||
            (s.campaign_name || '').toLowerCase().includes(q) ||
            (s.profile_name || '').toLowerCase().includes(q) ||
            (s.client_name || '').toLowerCase().includes(q) ||
            (s.ddd || '').includes(q) ||
            (s.ad_copy || '').toLowerCase().includes(q);

        const matchesStatus = statusFilter === 'ALL' || s.status === statusFilter;
        const matchesType = typeFilter === 'ALL' || s.template_type === typeFilter;
        const matchesDdd = dddFilter === 'ALL' || s.ddd === dddFilter;

        // Date range
        const dispatchTime = s.dispatch_date ? new Date(s.dispatch_date).getTime() : (s.timestamp ? new Date(s.timestamp).getTime() : 0);
        const matchesStart = !startDateFilter || dispatchTime >= new Date(startDateFilter + 'T00:00:00').getTime();
        const matchesEnd = !endDateFilter || dispatchTime <= new Date(endDateFilter + 'T23:59:59').getTime();

        // Upcoming only
        const isUpcoming = s.dispatch_date ? new Date(s.dispatch_date).getTime() > Date.now() : false;
        const matchesUpcoming = !onlyUpcomingFilter || isUpcoming;

        return matchesSearch && matchesStatus && matchesType && matchesDdd && matchesStart && matchesEnd && matchesUpcoming;
    });

    const hasActiveFilters = statusFilter !== 'ALL' || typeFilter !== 'ALL' || dddFilter !== 'ALL' || startDateFilter || endDateFilter || onlyUpcomingFilter || searchQuery.trim() !== '';

    const resetFilters = () => {
        setSearchQuery('');
        setStatusFilter('ALL');
        setTypeFilter('ALL');
        setDddFilter('ALL');
        setStartDateFilter('');
        setEndDateFilter('');
        setOnlyUpcomingFilter(false);
    };

    const activeQuickContacts = getFilteredQuickContacts();

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Notification Toast */}
            {toastMessage && (
                <div style={{
                    background: '#ECFDF5',
                    border: '1px solid #A7F3D0',
                    color: '#065F46',
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
                    <span>{toastMessage}</span>
                </div>
            )}

            {/* Top Control & Navigation Header */}
            <div style={{
                background: '#FFFFFF',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '14px'
            }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                        <Users size={18} color="var(--primary-color)" />
                        <h1 style={{ fontSize: '18px', fontWeight: 600, margin: 0, color: 'var(--text-main)' }}>
                            Upload de Clientes &amp; Campanhas
                        </h1>
                        <span style={{
                            background: '#F0FDF4',
                            border: '1px solid #BBF7D0',
                            color: '#166534',
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: '4px'
                        }}>
                            {submissions.length} cadastradas
                        </span>
                    </div>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
                        Gerenciamento completo de campanhas, filtros inteligentes, edição total, agendamentos e envio multi-remetente.
                    </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    {/* View Mode Toggle Buttons */}
                    <div style={{ display: 'flex', background: 'var(--bg-subtle)', padding: '3px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                        <button
                            type="button"
                            onClick={() => setViewMode('cards')}
                            style={{
                                padding: '6px 12px',
                                fontSize: '12px',
                                fontWeight: 600,
                                borderRadius: '4px',
                                border: 'none',
                                cursor: 'pointer',
                                background: viewMode === 'cards' ? '#FFFFFF' : 'transparent',
                                color: viewMode === 'cards' ? 'var(--text-main)' : 'var(--text-muted)',
                                boxShadow: viewMode === 'cards' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}
                        >
                            <Layers size={13} />
                            Campanhas ({submissions.length})
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode('schedule')}
                            style={{
                                padding: '6px 12px',
                                fontSize: '12px',
                                fontWeight: 600,
                                borderRadius: '4px',
                                border: 'none',
                                cursor: 'pointer',
                                background: viewMode === 'schedule' ? '#FFFFFF' : 'transparent',
                                color: viewMode === 'schedule' ? 'var(--text-main)' : 'var(--text-muted)',
                                boxShadow: viewMode === 'schedule' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}
                        >
                            <Calendar size={13} />
                            Agenda de Disparos
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode('quick_upload')}
                            style={{
                                padding: '6px 12px',
                                fontSize: '12px',
                                fontWeight: 600,
                                borderRadius: '4px',
                                border: 'none',
                                cursor: 'pointer',
                                background: viewMode === 'quick_upload' ? '#FFFFFF' : 'transparent',
                                color: viewMode === 'quick_upload' ? 'var(--text-main)' : 'var(--text-muted)',
                                boxShadow: viewMode === 'quick_upload' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}
                        >
                            <UploadCloud size={13} />
                            Upload Rápido
                        </button>
                    </div>

                    {/* New Campaign Button */}
                    <button
                        type="button"
                        onClick={() => {
                            resetWizardForm();
                            setShowNewModal(true);
                        }}
                        className="btn-primary"
                        style={{ height: '36px', padding: '0 14px', fontSize: '12.5px', gap: '6px' }}
                    >
                        <Plus size={15} /> Novo Cadastro de Campanha
                    </button>
                </div>
            </div>

            {/* ========================================================= */}
            {/* VIEW 1: CARDS INDIVIDUAIS DE CLIENTES & CAMPANHAS         */}
            {/* ========================================================= */}
            {viewMode === 'cards' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

                    {/* Search & Smart Filters Bar */}
                    <div style={{
                        background: '#FFFFFF',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '8px',
                        padding: '12px 16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px'
                    }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '12px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '260px' }}>
                                {/* Search input */}
                                <div style={{ position: 'relative', width: '100%', maxWidth: '340px' }}>
                                    <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: '#9CA3AF' }} />
                                    <input
                                        type="text"
                                        placeholder="Buscar por campanha, atendimento, DDD ou texto..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        style={{
                                            width: '100%',
                                            height: '34px',
                                            padding: '0 10px 0 30px',
                                            borderRadius: '6px',
                                            border: '1px solid #D1D5DB',
                                            fontSize: '12.5px',
                                            outline: 'none'
                                        }}
                                    />
                                </div>

                                {/* Smart Filters Toggle Button */}
                                <button
                                    type="button"
                                    onClick={() => setShowSmartFilters(!showSmartFilters)}
                                    style={{
                                        height: '34px',
                                        padding: '0 12px',
                                        borderRadius: '6px',
                                        border: `1px solid ${showSmartFilters || hasActiveFilters ? '#059669' : '#D1D5DB'}`,
                                        background: showSmartFilters || hasActiveFilters ? '#ECFDF5' : '#FFFFFF',
                                        color: showSmartFilters || hasActiveFilters ? '#065F46' : 'var(--text-main)',
                                        fontSize: '12.5px',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}
                                >
                                    <SlidersHorizontal size={14} />
                                    <span>Filtros Inteligentes</span>
                                    {showSmartFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                    {hasActiveFilters && (
                                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#059669' }} />
                                    )}
                                </button>

                                {hasActiveFilters && (
                                    <button
                                        type="button"
                                        onClick={resetFilters}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            color: '#DC2626',
                                            fontSize: '12px',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            textDecoration: 'underline'
                                        }}
                                    >
                                        Limpar Filtros
                                    </button>
                                )}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <button
                                    type="button"
                                    onClick={toggleSelectAll}
                                    style={{
                                        background: 'none',
                                        border: '1px solid var(--border-subtle)',
                                        borderRadius: '5px',
                                        padding: '5px 10px',
                                        fontSize: '11.5px',
                                        fontWeight: 600,
                                        color: 'var(--text-muted)',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '5px'
                                    }}
                                >
                                    {selectedIds.length === filteredSubmissions.length && filteredSubmissions.length > 0 ? (
                                        <>
                                            <CheckSquare size={13} color="var(--primary-color)" /> Desmarcar Todos
                                        </>
                                    ) : (
                                        <>
                                            <Square size={13} /> Selecionar Todos
                                        </>
                                    )}
                                </button>

                                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                    Exibindo <strong>{filteredSubmissions.length}</strong> de {submissions.length}
                                </span>
                            </div>
                        </div>

                        {/* Collapsible Smart Filter Options */}
                        {showSmartFilters && (
                            <div style={{
                                borderTop: '1px solid var(--border-subtle)',
                                paddingTop: '12px',
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                                gap: '10px',
                                alignItems: 'end'
                            }}>
                                {/* Filter 1: Status */}
                                <div>
                                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '3px' }}>
                                        Status da Campanha
                                    </label>
                                    <select
                                        value={statusFilter}
                                        onChange={(e) => setStatusFilter(e.target.value)}
                                        style={{ width: '100%', height: '32px', padding: '0 8px', borderRadius: '5px', border: '1px solid #D1D5DB', fontSize: '12px', background: '#FFFFFF' }}
                                    >
                                        <option value="ALL">Todos os Status</option>
                                        <option value="PENDENTE">Pendente</option>
                                        <option value="AGENDADO">Agendado</option>
                                        <option value="EM ANDAMENTO">Em Andamento</option>
                                        <option value="GERADO">Gerado</option>
                                        <option value="CONCLUIDO">Concluído</option>
                                        <option value="CANCELADO">Cancelado</option>
                                    </select>
                                </div>

                                {/* Filter 2: Tipo de Template */}
                                <div>
                                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '3px' }}>
                                        Formato do Criativo
                                    </label>
                                    <select
                                        value={typeFilter}
                                        onChange={(e) => setTypeFilter(e.target.value)}
                                        style={{ width: '100%', height: '32px', padding: '0 8px', borderRadius: '5px', border: '1px solid #D1D5DB', fontSize: '12px', background: '#FFFFFF' }}
                                    >
                                        <option value="ALL">Todos os Formatos</option>
                                        <option value="TEXT">Apenas Texto</option>
                                        <option value="IMAGE">Imagem + Texto</option>
                                        <option value="VIDEO">Vídeo + Texto</option>
                                    </select>
                                </div>

                                {/* Filter 3: DDD Regional */}
                                <div>
                                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '3px' }}>
                                        DDD Regional
                                    </label>
                                    <select
                                        value={dddFilter}
                                        onChange={(e) => setDddFilter(e.target.value)}
                                        style={{ width: '100%', height: '32px', padding: '0 8px', borderRadius: '5px', border: '1px solid #D1D5DB', fontSize: '12px', background: '#FFFFFF' }}
                                    >
                                        <option value="ALL">Todos os DDDs</option>
                                        {availableDdds.map(d => (
                                            <option key={d} value={d}>DDD {d}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Filter 4: Data Início */}
                                <div>
                                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '3px' }}>
                                        A partir de (Data)
                                    </label>
                                    <input
                                        type="date"
                                        value={startDateFilter}
                                        onChange={(e) => setStartDateFilter(e.target.value)}
                                        style={{ width: '100%', height: '32px', padding: '0 8px', borderRadius: '5px', border: '1px solid #D1D5DB', fontSize: '12px', background: '#FFFFFF' }}
                                    />
                                </div>

                                {/* Filter 5: Data Fim */}
                                <div>
                                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '3px' }}>
                                        Até (Data)
                                    </label>
                                    <input
                                        type="date"
                                        value={endDateFilter}
                                        onChange={(e) => setEndDateFilter(e.target.value)}
                                        style={{ width: '100%', height: '32px', padding: '0 8px', borderRadius: '5px', border: '1px solid #D1D5DB', fontSize: '12px', background: '#FFFFFF' }}
                                    />
                                </div>

                                {/* Filter 6: Próximos Agendados */}
                                <div style={{ paddingBottom: '4px' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--text-main)', cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={onlyUpcomingFilter}
                                            onChange={(e) => setOnlyUpcomingFilter(e.target.checked)}
                                            style={{ accentColor: '#059669', width: '15px', height: '15px' }}
                                        />
                                        <span>Somente Disparos Futuros</span>
                                    </label>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* BULK ACTIONS TOOLBAR (WHEN CAMPANHAS SÃO SELECIONADAS) */}
                    {selectedIds.length > 0 && (
                        <div style={{
                            background: '#F0FDF4',
                            border: '1px solid #86EFAC',
                            borderRadius: '8px',
                            padding: '12px 18px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '12px',
                            boxShadow: 'var(--shadow-subtle)',
                            animation: 'fadeIn 0.2s ease-out'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <CheckSquare size={16} color="#166534" />
                                <span style={{ fontSize: '13px', fontWeight: 700, color: '#166534' }}>
                                    {selectedIds.length} {selectedIds.length === 1 ? 'campanha selecionada' : 'campanhas selecionadas'}
                                </span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                {/* Bulk Status Select */}
                                <select
                                    onChange={(e) => e.target.value && handleBulkStatusChange(e.target.value)}
                                    value=""
                                    style={{
                                        height: '32px',
                                        padding: '0 8px',
                                        borderRadius: '5px',
                                        border: '1px solid #86EFAC',
                                        fontSize: '12px',
                                        fontWeight: 600,
                                        background: '#FFFFFF',
                                        color: '#166534'
                                    }}
                                >
                                    <option value="" disabled>Alterar Status em Massa...</option>
                                    <option value="PENDENTE">Marcar como Pendente</option>
                                    <option value="AGENDADO">Marcar como Agendado</option>
                                    <option value="EM ANDAMENTO">Marcar como Em Andamento</option>
                                    <option value="GERADO">Marcar como Gerado</option>
                                    <option value="CONCLUIDO">Marcar como Concluído</option>
                                    <option value="CANCELADO">Marcar como Cancelado</option>
                                </select>

                                {/* Bulk Schedule Button */}
                                <button
                                    type="button"
                                    onClick={() => setShowBulkScheduleModal(true)}
                                    style={{
                                        background: '#FFFFFF',
                                        border: '1px solid #86EFAC',
                                        color: '#166534',
                                        borderRadius: '5px',
                                        padding: '0 10px',
                                        height: '32px',
                                        fontSize: '12px',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}
                                >
                                    <Calendar size={13} /> Agendar em Massa
                                </button>

                                {/* Bulk Dispatch Button */}
                                <button
                                    type="button"
                                    onClick={handleBulkSendToDispatch}
                                    className="btn-primary"
                                    style={{ height: '32px', padding: '0 12px', fontSize: '12px', gap: '5px' }}
                                >
                                    <Send size={12} /> Disparar Selecionadas
                                </button>

                                {/* Bulk Delete Button */}
                                <button
                                    type="button"
                                    onClick={handleBulkDelete}
                                    style={{
                                        background: '#FEE2E2',
                                        border: '1px solid #FCA5A5',
                                        color: '#991B1B',
                                        borderRadius: '5px',
                                        padding: '0 10px',
                                        height: '32px',
                                        fontSize: '12px',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}
                                >
                                    <Trash2 size={13} /> Excluir Selecionadas
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Cards Grid */}
                    {isLoadingSubmissions ? (
                        <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                            <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px auto' }} />
                            <p style={{ fontSize: '13px' }}>Carregando cadastros...</p>
                        </div>
                    ) : filteredSubmissions.length === 0 ? (
                        <div style={{
                            background: '#FFFFFF',
                            border: '1px dashed var(--border-subtle)',
                            borderRadius: '8px',
                            padding: '60px 20px',
                            textAlign: 'center'
                        }}>
                            <Users size={36} style={{ color: '#9CA3AF', margin: '0 auto 10px auto' }} />
                            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-main)', margin: '0 0 4px 0' }}>
                                Nenhuma campanha encontrada
                            </h3>
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 16px 0' }}>
                                {hasActiveFilters ? 'Nenhum resultado corresponde aos filtros aplicados.' : 'Cadastre a primeira campanha com etapas e preview de celular.'}
                            </p>
                            {hasActiveFilters ? (
                                <button
                                    type="button"
                                    onClick={resetFilters}
                                    className="btn-secondary"
                                    style={{ height: '34px', padding: '0 14px', fontSize: '12.5px' }}
                                >
                                    Limpar Filtros Inteligentes
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => {
                                        resetWizardForm();
                                        setShowNewModal(true);
                                    }}
                                    className="btn-primary"
                                    style={{ height: '34px', padding: '0 14px', fontSize: '12.5px' }}
                                >
                                    <Plus size={14} /> Cadastrar Nova Campanha
                                </button>
                            )}
                        </div>
                    ) : (
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))',
                            gap: '14px'
                        }}>
                            {filteredSubmissions.map(sub => {
                                const statusCfg = STATUS_CONFIG[sub.status] || STATUS_CONFIG['PENDENTE'];
                                const leadsCount = sub.validCount || (sub.contacts ? sub.contacts.length : 0);
                                const hasScheduledDate = !!sub.dispatch_date;
                                const isChecked = selectedIds.includes(sub.id);

                                return (
                                    <div
                                        key={sub.id}
                                        style={{
                                            background: '#FFFFFF',
                                            border: `1.5px solid ${isChecked ? 'var(--primary-color)' : 'var(--border-subtle)'}`,
                                            borderRadius: '8px',
                                            padding: '16px',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            justifyContent: 'space-between',
                                            gap: '12px',
                                            boxShadow: isChecked ? '0 0 0 1px var(--primary-color)' : 'var(--shadow-subtle)',
                                            transition: 'border-color 150ms ease, box-shadow 150ms ease',
                                            position: 'relative'
                                        }}
                                    >
                                        {/* Top Card Row */}
                                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                                                {/* Checkbox */}
                                                <div
                                                    onClick={() => toggleSelectSubmission(sub.id)}
                                                    style={{
                                                        width: '20px',
                                                        height: '20px',
                                                        borderRadius: '4px',
                                                        border: `1.5px solid ${isChecked ? 'var(--primary-color)' : '#D1D5DB'}`,
                                                        background: isChecked ? 'var(--primary-color)' : '#FFFFFF',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        cursor: 'pointer',
                                                        flexShrink: 0
                                                    }}
                                                >
                                                    {isChecked && <Check size={13} color="#FFFFFF" strokeWidth={3} />}
                                                </div>

                                                <div style={{
                                                    width: '40px',
                                                    height: '40px',
                                                    borderRadius: '8px',
                                                    background: 'var(--bg-subtle)',
                                                    border: '1px solid var(--border-subtle)',
                                                    overflow: 'hidden',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    flexShrink: 0
                                                }}>
                                                    {sub.profile_photo ? (
                                                        <img src={sub.profile_photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                    ) : (
                                                        <User size={18} color="#9CA3AF" />
                                                    )}
                                                </div>

                                                <div style={{ minWidth: 0 }}>
                                                    {/* Campaign Name */}
                                                    <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {sub.campaign_name || sub.client_name || sub.profile_name}
                                                    </h3>
                                                    {/* Profile Name & DDD & Remetente */}
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px', flexWrap: 'wrap' }}>
                                                        <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                                                            {sub.profile_name}
                                                        </span>
                                                        <span style={{
                                                            fontSize: '10px',
                                                            fontWeight: 700,
                                                            color: 'var(--primary-color)',
                                                            background: 'var(--primary-light)',
                                                            padding: '1px 5px',
                                                            borderRadius: '3px'
                                                        }}>
                                                            DDD {sub.ddd}
                                                        </span>
                                                        {sub.sender_phone && (
                                                            <span style={{
                                                                fontSize: '10px',
                                                                fontWeight: 600,
                                                                color: '#047857',
                                                                background: '#ECFDF5',
                                                                border: '1px solid #A7F3D0',
                                                                padding: '1px 5px',
                                                                borderRadius: '3px'
                                                            }} title={`Remetente: ${sub.sender_phone}`}>
                                                                📱 {sub.sender_phone}
                                                            </span>
                                                        )}
                                                        {sub.origin === 'TEMPLATE_CREATOR' && (
                                                            <span style={{
                                                                fontSize: '10px',
                                                                fontWeight: 600,
                                                                color: '#4F46E5',
                                                                background: '#EEF2FF',
                                                                border: '1px solid #C7D2FE',
                                                                padding: '1px 5px',
                                                                borderRadius: '3px'
                                                            }}>
                                                                Criador de Templates
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Status Badge */}
                                            <span style={{
                                                fontSize: '11px',
                                                fontWeight: 600,
                                                padding: '2px 8px',
                                                borderRadius: '4px',
                                                background: statusCfg.bg,
                                                color: statusCfg.color,
                                                border: `1px solid ${statusCfg.border}`,
                                                flexShrink: 0
                                            }}>
                                                {statusCfg.label}
                                            </span>
                                        </div>

                                        {/* Scheduled Date Pill */}
                                        {hasScheduledDate && (
                                            <div style={{
                                                background: '#F0FDF4',
                                                border: '1px solid #BBF7D0',
                                                color: '#166534',
                                                borderRadius: '6px',
                                                padding: '5px 9px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                fontSize: '11.5px',
                                                fontWeight: 600
                                            }}>
                                                <Calendar size={13} color="#16A34A" />
                                                <span>
                                                    📅 DISPARO: {new Date(sub.dispatch_date!).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                        )}

                                        {/* Badges: Format & Leads */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                                            <span style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                background: 'var(--bg-subtle)',
                                                padding: '2px 8px',
                                                borderRadius: '4px',
                                                fontSize: '11px',
                                                fontWeight: 500
                                            }}>
                                                {sub.template_type === 'IMAGE' && <ImageIcon size={12} color="#0284C7" />}
                                                {sub.template_type === 'VIDEO' && <Video size={12} color="#7C3AED" />}
                                                {sub.template_type === 'TEXT' && <MessageSquare size={12} color="#059669" />}
                                                {sub.template_type}
                                            </span>

                                            <span style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                background: '#F8FAFC',
                                                border: '1px solid var(--border-subtle)',
                                                padding: '2px 8px',
                                                borderRadius: '4px',
                                                fontSize: '11px',
                                                fontWeight: 600,
                                                color: leadsCount > 0 ? '#16A34A' : 'var(--text-muted)'
                                            }}>
                                                <Users size={12} />
                                                {leadsCount.toLocaleString('pt-BR')} leads
                                            </span>

                                            {sub.fileName && (
                                                <span style={{ fontSize: '11px', color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>
                                                    {sub.fileName}
                                                </span>
                                            )}
                                        </div>

                                        {/* Message Snippet */}
                                        {sub.ad_copy && (
                                            <div style={{
                                                background: 'var(--bg-subtle)',
                                                borderRadius: '6px',
                                                padding: '8px 10px',
                                                fontSize: '11.5px',
                                                color: 'var(--text-muted)',
                                                lineHeight: 1.4,
                                                maxHeight: '44px',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis'
                                            }}>
                                                {sub.ad_copy.substring(0, 95)}...
                                            </div>
                                        )}

                                        {/* Card Actions Bottom */}
                                        <div style={{
                                            borderTop: '1px solid var(--border-subtle)',
                                            paddingTop: '10px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            gap: '6px'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => setPreviewModalSubmission(sub)}
                                                    style={{
                                                        background: 'none',
                                                        border: '1px solid var(--border-subtle)',
                                                        borderRadius: '5px',
                                                        padding: '4px 8px',
                                                        fontSize: '11px',
                                                        fontWeight: 600,
                                                        color: 'var(--text-main)',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }}
                                                    title="Visualizar no Celular"
                                                >
                                                    <Eye size={12} color="#0284C7" />
                                                    Preview
                                                </button>

                                                {/* Edit Button */}
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenEdit(sub)}
                                                    style={{
                                                        background: '#F1F5F9',
                                                        border: '1px solid #CBD5E1',
                                                        borderRadius: '5px',
                                                        padding: '4px 8px',
                                                        fontSize: '11px',
                                                        fontWeight: 600,
                                                        color: '#334155',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }}
                                                    title="Editar Tudo"
                                                >
                                                    <Edit3 size={12} color="#059669" />
                                                    Editar
                                                </button>
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <button
                                                    type="button"
                                                    onClick={(e) => handleDuplicate(sub, e)}
                                                    style={{ background: 'none', border: 'none', color: '#6B7280', cursor: 'pointer', padding: '4px' }}
                                                    title="Duplicar Campanha"
                                                >
                                                    <Copy size={13} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(e) => handleDeleteSubmission(sub.id, e)}
                                                    style={{ background: 'none', border: 'none', color: '#DC2626', cursor: 'pointer', padding: '4px' }}
                                                    title="Excluir Campanha"
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                                {leadsCount > 0 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => onSendToDispatch(sub.contacts || [], sub.headers || ['Telefone', 'Nome'], sub.campaign_name || sub.profile_name)}
                                                        className="btn-primary"
                                                        style={{ height: '28px', padding: '0 9px', fontSize: '11px', gap: '4px' }}
                                                        title="Carregar no Disparador"
                                                    >
                                                        <Send size={11} /> Disparar
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ========================================================= */}
            {/* VIEW 2: AGENDA DE DISPAROS / CALENDÁRIO                   */}
            {/* ========================================================= */}
            {viewMode === 'schedule' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{
                        background: '#FFFFFF',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '8px',
                        padding: '16px 20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '12px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', gap: '4px' }}>
                                <button
                                    type="button"
                                    onClick={() => jumpDay(-1)}
                                    className="btn-secondary"
                                    style={{ height: '34px', width: '34px', padding: 0, justifyContent: 'center' }}
                                    title="Dia Anterior"
                                >
                                    <ChevronLeft size={16} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => jumpDay(1)}
                                    className="btn-secondary"
                                    style={{ height: '34px', width: '34px', padding: 0, justifyContent: 'center' }}
                                    title="Próximo Dia"
                                >
                                    <ChevronRight size={16} />
                                </button>
                            </div>

                            {agendaSelectedDate !== todayKey && (
                                <button
                                    type="button"
                                    onClick={() => setAgendaSelectedDate(todayKey)}
                                    style={{
                                        background: '#ECFDF5',
                                        color: '#059669',
                                        border: '1px solid #A7F3D0',
                                        padding: '0 10px',
                                        height: '34px',
                                        borderRadius: '6px',
                                        fontSize: '11.5px',
                                        fontWeight: 600,
                                        cursor: 'pointer'
                                    }}
                                >
                                    IR PARA HOJE
                                </button>
                            )}

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Calendar size={18} color="var(--primary-color)" />
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text-main)' }}>
                                        {formatLongDate(agendaSelectedDate)}
                                    </h3>
                                    <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                                        {dayDispatches.length} disparo(s) agendado(s) para este dia
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div>
                            <input
                                type="date"
                                value={agendaSelectedDate}
                                onChange={(e) => e.target.value && setAgendaSelectedDate(e.target.value)}
                                style={{
                                    height: '34px',
                                    padding: '0 10px',
                                    border: '1px solid #D1D5DB',
                                    borderRadius: '6px',
                                    fontSize: '12.5px',
                                    outline: 'none',
                                    background: '#FFFFFF'
                                }}
                            />
                        </div>
                    </div>

                    {/* 14-Day Date Strip */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        overflowX: 'auto',
                        paddingBottom: '4px'
                    }}>
                        {stripDates.map(d => (
                            <button
                                key={d.dateKey}
                                type="button"
                                onClick={() => setAgendaSelectedDate(d.dateKey)}
                                style={{
                                    flex: '0 0 auto',
                                    width: '78px',
                                    padding: '10px 6px',
                                    background: d.isSelected ? '#059669' : '#FFFFFF',
                                    color: d.isSelected ? '#FFFFFF' : 'var(--text-main)',
                                    border: `1px solid ${d.isSelected ? '#059669' : (d.isToday ? '#10B981' : 'var(--border-subtle)')}`,
                                    borderRadius: '8px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: '3px',
                                    cursor: 'pointer',
                                    transition: 'all 120ms ease',
                                    boxShadow: d.isSelected ? '0 2px 4px rgba(5,150,105,0.2)' : 'none'
                                }}
                            >
                                <span style={{ fontSize: '10px', fontWeight: 700, opacity: d.isSelected ? 0.9 : 0.6 }}>
                                    {d.weekday}
                                </span>
                                <span style={{ fontSize: '13.5px', fontWeight: 700 }}>
                                    {d.dayMonth}
                                </span>
                                {d.count > 0 ? (
                                    <span style={{
                                        fontSize: '10px',
                                        fontWeight: 700,
                                        background: d.isSelected ? 'rgba(255,255,255,0.25)' : '#F0FDF4',
                                        color: d.isSelected ? '#FFFFFF' : '#16A34A',
                                        padding: '1px 6px',
                                        borderRadius: '999px',
                                        marginTop: '2px'
                                    }}>
                                        {d.count} {d.count === 1 ? 'envio' : 'envios'}
                                    </span>
                                ) : (
                                    <span style={{ fontSize: '10px', color: d.isSelected ? 'rgba(255,255,255,0.6)' : '#9CA3AF' }}>
                                        —
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Timeline of the Day */}
                    <div style={{
                        background: '#FFFFFF',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '8px',
                        padding: '20px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Clock size={16} color="var(--primary-color)" />
                                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text-main)' }}>
                                    Linha do Tempo de Envios • {formatLongDate(agendaSelectedDate)}
                                </h3>
                            </div>
                            <span className="badge">
                                {dayDispatches.length} programado(s)
                            </span>
                        </div>

                        {dayDispatches.length === 0 ? (
                            <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                <Calendar size={32} style={{ opacity: 0.3, margin: '0 auto 8px auto' }} />
                                <p style={{ fontSize: '13px', margin: '0 0 12px 0' }}>
                                    Nenhum disparo agendado para {formatLongDate(agendaSelectedDate)}.
                                </p>
                                <button
                                    type="button"
                                    onClick={() => {
                                        resetWizardForm();
                                        setFormDispatchDate(`${agendaSelectedDate}T10:00`);
                                        setShowNewModal(true);
                                    }}
                                    className="btn-secondary"
                                    style={{ height: '32px', padding: '0 12px', fontSize: '12px' }}
                                >
                                    <Plus size={13} /> Agendar Disparo para Este Dia
                                </button>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {dayDispatches.map((sub, idx) => {
                                    const timeStr = sub.dispatch_date
                                        ? new Date(sub.dispatch_date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                                        : 'Horário Livre';
                                    const leads = sub.validCount || (sub.contacts ? sub.contacts.length : 0);

                                    return (
                                        <div
                                            key={sub.id || idx}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                padding: '12px 16px',
                                                borderRadius: '6px',
                                                border: '1px solid var(--border-subtle)',
                                                background: '#F9FAFB',
                                                gap: '12px'
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                                                <div style={{
                                                    background: '#1F2937',
                                                    color: '#F9FAFB',
                                                    padding: '6px 10px',
                                                    borderRadius: '6px',
                                                    fontSize: '12px',
                                                    fontWeight: 700,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '5px',
                                                    flexShrink: 0
                                                }}>
                                                    <Clock size={12} color="#10B981" />
                                                    {timeStr}
                                                </div>

                                                <div style={{ minWidth: 0 }}>
                                                    <h4 style={{ margin: 0, fontSize: '13.5px', fontWeight: 600, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {sub.campaign_name || sub.profile_name}
                                                    </h4>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                        <span>Atend: {sub.profile_name}</span>
                                                        <span>•</span>
                                                        <span>DDD {sub.ddd}</span>
                                                        <span>•</span>
                                                        <span style={{ fontWeight: 600, color: '#16A34A' }}>{leads.toLocaleString('pt-BR')} contatos</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenEdit(sub)}
                                                    className="btn-secondary"
                                                    style={{ height: '30px', padding: '0 10px', fontSize: '11.5px', gap: '4px' }}
                                                >
                                                    <Edit3 size={11} color="#059669" /> Editar
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setPreviewModalSubmission(sub)}
                                                    style={{
                                                        background: '#FFFFFF',
                                                        border: '1px solid var(--border-subtle)',
                                                        borderRadius: '5px',
                                                        padding: '5px 10px',
                                                        fontSize: '11.5px',
                                                        fontWeight: 600,
                                                        color: 'var(--text-main)',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }}
                                                >
                                                    <Eye size={12} color="#0284C7" /> Preview
                                                </button>
                                                {leads > 0 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => onSendToDispatch(sub.contacts || [], sub.headers || ['Telefone', 'Nome'], sub.campaign_name || sub.profile_name)}
                                                        className="btn-primary"
                                                        style={{ height: '30px', padding: '0 12px', fontSize: '11.5px', gap: '4px' }}
                                                    >
                                                        <Send size={11} /> Disparar
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ========================================================= */}
            {/* VIEW 3: UPLOAD RÁPIDO & HIGIENIZAÇÃO DE PLANILHA          */}
            {/* ========================================================= */}
            {viewMode === 'quick_upload' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {!quickAnalysis ? (
                        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '16px', alignItems: 'start' }}>
                            <div className="glass-panel" style={{ padding: '20px 24px', borderRadius: '8px' }}>
                                <div style={{ marginBottom: '16px' }}>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', marginBottom: '4px' }}>
                                        Nome da Campanha ou Cliente
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Ex: Lote Black Friday WhatsApp"
                                        value={quickClientName}
                                        onChange={(e) => setQuickClientName(e.target.value)}
                                        style={{
                                            width: '100%',
                                            height: '36px',
                                            padding: '0 12px',
                                            border: '1px solid #D1D5DB',
                                            borderRadius: '6px',
                                            fontSize: '13.5px',
                                            color: 'var(--text-main)',
                                            outline: 'none',
                                            background: '#FFFFFF'
                                        }}
                                    />
                                </div>

                                <div
                                    onDragOver={(e) => e.preventDefault()}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                                            handleQuickFileChange(e.dataTransfer.files[0]);
                                        }
                                    }}
                                    onClick={() => document.getElementById('quick-file-input')?.click()}
                                    style={{
                                        border: '1px dashed #CBD5E1',
                                        borderRadius: '8px',
                                        padding: '36px 20px',
                                        textAlign: 'center',
                                        background: '#F8FAFC',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: '8px'
                                    }}
                                >
                                    <input
                                        id="quick-file-input"
                                        type="file"
                                        accept=".xlsx, .xls, .csv"
                                        style={{ display: 'none' }}
                                        onChange={(e) => e.target.files && handleQuickFileChange(e.target.files[0])}
                                    />
                                    <div style={{ width: '38px', height: '38px', background: '#F1F5F9', color: '#475569', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <UploadCloud size={20} />
                                    </div>
                                    <h3 style={{ fontSize: '14px', fontWeight: 600, margin: 0, color: 'var(--text-main)' }}>
                                        {isProcessingQuick ? 'Processando planilha...' : 'Arraste a planilha Excel (.xlsx, .xls) ou CSV aqui'}
                                    </h3>
                                    <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', margin: 0 }}>
                                        Clique para selecionar o arquivo no seu computador
                                    </p>
                                    {isProcessingQuick && (
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#16A34A', fontSize: '12px', fontWeight: 500, marginTop: '8px' }}>
                                            <RefreshCw size={13} className="animate-spin" /> Normalizando telefones DDI 55...
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="glass-panel" style={{ padding: '18px 20px', borderRadius: '8px' }}>
                                <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 10px 0', color: 'var(--text-main)' }}>
                                    Regras de Higienização Automática:
                                </h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12.5px', color: '#475569' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <CheckCircle2 size={14} color="#16A34A" /> Inserção de DDI 55 caso ausente
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <CheckCircle2 size={14} color="#16A34A" /> Formatação do 9º dígito móvel celular
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <CheckCircle2 size={14} color="#16A34A" /> Remoção de parênteses, traços e espaços
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <CheckCircle2 size={14} color="#16A34A" /> Deduplicação por número de telefone
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text-main)' }}>
                                        Arquivo: {quickFile?.name}
                                    </h3>
                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                        Campanha: <strong>{quickClientName || 'Geral'}</strong>
                                    </span>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setQuickFile(null);
                                            setQuickAnalysis(null);
                                        }}
                                        className="btn-secondary"
                                        style={{ height: '34px', padding: '0 12px', fontSize: '12.5px' }}
                                    >
                                        <Trash2 size={13} /> Limpar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleQuickDownloadSanitized}
                                        className="btn-secondary"
                                        style={{ height: '34px', padding: '0 12px', fontSize: '12.5px' }}
                                    >
                                        <Download size={13} /> Baixar CSV Limpo
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleSendQuickToDispatch}
                                        className="btn-primary"
                                        style={{ height: '34px', padding: '0 14px', fontSize: '12.5px' }}
                                    >
                                        <Send size={13} /> Enviar para Disparador ({activeQuickContacts.length})
                                    </button>
                                </div>
                            </div>

                            {/* Safe Metrics Grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                                <div className="glass-panel" style={{ padding: '14px 16px', borderRadius: '8px' }}>
                                    <span style={{ fontSize: '11px', fontWeight: 500, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Total Lidos</span>
                                    <div style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-main)', marginTop: '2px' }}>
                                        {(quickAnalysis.totalRows || quickAnalysis.stats?.totalRows || 0).toLocaleString('pt-BR')}
                                    </div>
                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Linhas brutas na planilha</span>
                                </div>

                                <div className="glass-panel" style={{ padding: '14px 16px', borderRadius: '8px' }}>
                                    <span style={{ fontSize: '11px', fontWeight: 500, textTransform: 'uppercase', color: '#16A34A' }}>Leads Válidos</span>
                                    <div style={{ fontSize: '20px', fontWeight: 600, color: '#16A34A', marginTop: '2px' }}>
                                        {activeQuickContacts.length.toLocaleString('pt-BR')}
                                    </div>
                                    <span style={{ fontSize: '12px', color: '#16A34A' }}>Prontos para envio</span>
                                </div>

                                <div className="glass-panel" style={{ padding: '14px 16px', borderRadius: '8px' }}>
                                    <span style={{ fontSize: '11px', fontWeight: 500, textTransform: 'uppercase', color: '#D97706' }}>Duplicados</span>
                                    <div style={{ fontSize: '20px', fontWeight: 600, color: '#D97706', marginTop: '2px' }}>
                                        {(quickAnalysis.duplicateCount || quickAnalysis.stats?.duplicateCount || 0).toLocaleString('pt-BR')}
                                    </div>
                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Removidos da lista</span>
                                </div>

                                <div className="glass-panel" style={{ padding: '14px 16px', borderRadius: '8px' }}>
                                    <span style={{ fontSize: '11px', fontWeight: 500, textTransform: 'uppercase', color: '#DC2626' }}>Inválidos</span>
                                    <div style={{ fontSize: '20px', fontWeight: 600, color: '#DC2626', marginTop: '2px' }}>
                                        {(quickAnalysis.invalidCount || quickAnalysis.stats?.invalidCount || 0).toLocaleString('pt-BR')}
                                    </div>
                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Formato incorreto</span>
                                </div>
                            </div>

                            {/* Column Mapping Controls */}
                            <div className="glass-panel" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px', borderRadius: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 500, color: 'var(--text-muted)', marginBottom: '3px' }}>
                                            Coluna de Telefone:
                                        </label>
                                        <select
                                            value={quickPhoneCol}
                                            onChange={(e) => handleQuickColumnChange(e.target.value, quickNameCol)}
                                            style={{ height: '34px', padding: '0 10px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '12.5px', background: '#FFFFFF' }}
                                        >
                                            {quickAnalysis.headers.map(h => (
                                                <option key={h} value={h}>{h}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 500, color: 'var(--text-muted)', marginBottom: '3px' }}>
                                            Coluna de Nome:
                                        </label>
                                        <select
                                            value={quickNameCol}
                                            onChange={(e) => handleQuickColumnChange(quickPhoneCol, e.target.value)}
                                            style={{ height: '34px', padding: '0 10px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '12.5px', background: '#FFFFFF' }}
                                        >
                                            <option value="">-- Sem Nome / Fixo --</option>
                                            {quickAnalysis.headers.map(h => (
                                                <option key={h} value={h}>{h}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingTop: '14px' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: 500, cursor: 'pointer' }}>
                                            <input
                                                type="checkbox"
                                                checked={quickRemoveDupes}
                                                onChange={(e) => setQuickRemoveDupes(e.target.checked)}
                                            />
                                            Deduplicar números
                                        </label>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: 500, cursor: 'pointer' }}>
                                            <input
                                                type="checkbox"
                                                checked={quickDiscardNoName}
                                                onChange={(e) => setQuickDiscardNoName(e.target.checked)}
                                            />
                                            Descartar sem nome
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ========================================================= */}
            {/* MODAL 1: NOVO CADASTRO DE CAMPANHA (COM NOME DA CAMPANHA) */}
            {/* ========================================================= */}
            {showNewModal && (
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
                        maxWidth: '980px',
                        maxHeight: '92vh',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
                    }}>
                        <div style={{
                            padding: '16px 24px',
                            borderBottom: '1px solid var(--border-subtle)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            background: '#F9FAFB'
                        }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text-main)' }}>
                                    Novo Cadastro de Campanha / Envio
                                </h2>
                                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
                                    Defina nome da campanha, dados do atendimento, mensagem e horário com preview em tempo real.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowNewModal(false)}
                                style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', padding: '4px' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Stepper Navigation */}
                        <div style={{
                            padding: '12px 24px',
                            borderBottom: '1px solid var(--border-subtle)',
                            display: 'flex',
                            gap: '12px',
                            background: '#FFFFFF'
                        }}>
                            {[
                                { step: 1, title: '1. Identidade', desc: 'Campanha, Atendimento & Horário' },
                                { step: 2, title: '2. Criativo & Mensagem', desc: 'Mídia, Variáveis & Planilha' },
                                { step: 3, title: '3. Revisão & Envio', desc: 'Resumo e Confirmação' }
                            ].map(s => {
                                const isActive = wizardStep === s.step;
                                const isPassed = wizardStep > s.step;
                                return (
                                    <div
                                        key={s.step}
                                        onClick={() => setWizardStep(s.step)}
                                        style={{
                                            flex: 1,
                                            padding: '8px 12px',
                                            borderRadius: '6px',
                                            background: isActive ? '#F0FDF4' : 'transparent',
                                            border: `1px solid ${isActive ? '#10B981' : (isPassed ? '#D1D5DB' : '#E5E7EB')}`,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px'
                                        }}
                                    >
                                        <div style={{
                                            width: '22px',
                                            height: '22px',
                                            borderRadius: '50%',
                                            background: isPassed ? '#10B981' : (isActive ? '#059669' : '#E5E7EB'),
                                            color: isPassed || isActive ? '#FFFFFF' : '#6B7280',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '11px',
                                            fontWeight: 700
                                        }}>
                                            {isPassed ? <Check size={12} strokeWidth={3} /> : s.step}
                                        </div>
                                        <div>
                                            <p style={{ margin: 0, fontSize: '12px', fontWeight: 600, color: isActive ? '#065F46' : 'var(--text-main)' }}>
                                                {s.title}
                                            </p>
                                            <p style={{ margin: 0, fontSize: '10.5px', color: 'var(--text-muted)' }}>
                                                {s.desc}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Modal Body: Split Form + Phone Preview */}
                        <div style={{
                            flex: 1,
                            overflowY: 'auto',
                            padding: '24px',
                            display: 'grid',
                            gridTemplateColumns: '1.25fr 300px',
                            gap: '24px',
                            alignItems: 'start'
                        }}>
                            {/* FORM STEPS CONTENT */}
                            <div>
                                {/* STEP 1: IDENTIDADE */}
                                {wizardStep === 1 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                        <h3 style={{ margin: 0, fontSize: '14.5px', fontWeight: 600, color: 'var(--text-main)' }}>
                                            Identidade &amp; Agendamento do Atendimento
                                        </h3>

                                        {/* NOME DA CAMPANHA (SOLICITADO PELO USUÁRIO) */}
                                        <div>
                                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '4px' }}>
                                                Nome da Campanha *
                                            </label>
                                            <input
                                                type="text"
                                                placeholder="Ex: Black Friday 2026, Reativação Base VIP, Lançamento Curso"
                                                value={formCampaignName}
                                                onChange={(e) => setFormCampaignName(e.target.value)}
                                                style={{
                                                    width: '100%',
                                                    height: '36px',
                                                    padding: '0 12px',
                                                    border: '1.5px solid #059669',
                                                    borderRadius: '6px',
                                                    fontSize: '13px',
                                                    background: '#F0FDF4'
                                                }}
                                            />
                                            <span style={{ fontSize: '11px', color: '#166534' }}>
                                                Identificador da campanha para busca, relatórios e filtros.
                                            </span>
                                        </div>

                                        {/* NÚMERO DO REMETENTE (SOLICITADO PELO USUÁRIO) */}
                                        <div>
                                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                                                Número do Remetente
                                            </label>
                                            <input
                                                type="text"
                                                placeholder="Ex: 5511999998888 ou +55 (11) 99999-8888"
                                                value={formSenderPhone}
                                                onChange={(e) => setFormSenderPhone(e.target.value)}
                                                style={{
                                                    width: '100%',
                                                    height: '36px',
                                                    padding: '0 12px',
                                                    border: '1px solid #D1D5DB',
                                                    borderRadius: '6px',
                                                    fontSize: '13px'
                                                }}
                                            />
                                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                Número ou identificador da linha remetente autorizada para este envio.
                                            </span>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: '12px' }}>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                                                    Nome do Atendimento *
                                                </label>
                                                <input
                                                    type="text"
                                                    placeholder="Ex: Suporte VIP, Central de Ofertas, Dra. Ana"
                                                    value={formProfileName}
                                                    onChange={(e) => setFormProfileName(e.target.value)}
                                                    style={{
                                                        width: '100%',
                                                        height: '36px',
                                                        padding: '0 12px',
                                                        border: '1px solid #D1D5DB',
                                                        borderRadius: '6px',
                                                        fontSize: '13px'
                                                    }}
                                                />
                                                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                    Nome visível no topo do WhatsApp do lead.
                                                </span>
                                            </div>

                                            <div>
                                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                                                    DDD *
                                                </label>
                                                <input
                                                    type="text"
                                                    maxLength={2}
                                                    placeholder="11"
                                                    value={formDdd}
                                                    onChange={(e) => setFormDdd(e.target.value.replace(/\D/g, ''))}
                                                    style={{
                                                        width: '100%',
                                                        height: '36px',
                                                        padding: '0 12px',
                                                        border: '1px solid #D1D5DB',
                                                        borderRadius: '6px',
                                                        fontSize: '13px',
                                                        textAlign: 'center',
                                                        fontWeight: 700
                                                    }}
                                                />
                                            </div>
                                        </div>

                                        {/* Avatar Photo Upload */}
                                        <div>
                                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                                                Foto ou Logo do Perfil
                                            </label>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <div style={{
                                                    width: '54px',
                                                    height: '54px',
                                                    borderRadius: '50%',
                                                    background: '#F3F4F6',
                                                    border: '1.5px dashed #D1D5DB',
                                                    overflow: 'hidden',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    flexShrink: 0
                                                }}>
                                                    {formProfilePhoto ? (
                                                        <img src={formProfilePhoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                    ) : (
                                                        <User size={22} color="#9CA3AF" />
                                                    )}
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        id="wizard-photo-input"
                                                        style={{ display: 'none' }}
                                                        onChange={(e) => e.target.files?.[0] && handlePhotoUpload(e.target.files[0])}
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => document.getElementById('wizard-photo-input')?.click()}
                                                        className="btn-secondary"
                                                        style={{ height: '32px', padding: '0 12px', fontSize: '12px' }}
                                                    >
                                                        Selecionar Imagem do Computador
                                                    </button>
                                                    {formProfilePhoto && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setFormProfilePhoto('')}
                                                            style={{ marginLeft: '8px', background: 'none', border: 'none', color: '#DC2626', fontSize: '11px', cursor: 'pointer' }}
                                                        >
                                                            Remover
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Agendamento: Data e Horário */}
                                        <div style={{
                                            background: '#F0FDF4',
                                            border: '1px solid #BBF7D0',
                                            borderRadius: '8px',
                                            padding: '14px'
                                        }}>
                                            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#166534', marginBottom: '4px' }}>
                                                📅 Data e Horário Programado para o Disparo
                                            </label>
                                            <input
                                                type="datetime-local"
                                                value={formDispatchDate}
                                                onChange={(e) => setFormDispatchDate(e.target.value)}
                                                style={{
                                                    width: '100%',
                                                    height: '36px',
                                                    padding: '0 10px',
                                                    border: '1px solid #86EFAC',
                                                    borderRadius: '6px',
                                                    fontSize: '13px',
                                                    background: '#FFFFFF'
                                                }}
                                            />
                                            <span style={{ fontSize: '11px', color: '#15803D', display: 'block', marginTop: '4px' }}>
                                                Defina para aparecer no calendário ou deixe em branco para disparo imediato.
                                            </span>
                                        </div>

                                        {/* Observações */}
                                        <div>
                                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                                                Observações Internas (Opcional)
                                            </label>
                                            <textarea
                                                rows={2}
                                                placeholder="Instruções para os operadores ou equipe..."
                                                value={formNotes}
                                                onChange={(e) => setFormNotes(e.target.value)}
                                                style={{
                                                    width: '100%',
                                                    padding: '8px 12px',
                                                    border: '1px solid #D1D5DB',
                                                    borderRadius: '6px',
                                                    fontSize: '12.5px',
                                                    resize: 'vertical'
                                                }}
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* STEP 2: CRIATIVO & MENSAGEM */}
                                {wizardStep === 2 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                        <h3 style={{ margin: 0, fontSize: '14.5px', fontWeight: 600, color: 'var(--text-main)' }}>
                                            Formato do Criativo &amp; Mensagem
                                        </h3>

                                        {/* Format Selector */}
                                        <div>
                                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>
                                                Formato da Mensagem
                                            </label>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                                                {[
                                                    { type: 'TEXT' as const, label: 'Apenas Texto', icon: MessageSquare },
                                                    { type: 'IMAGE' as const, label: 'Imagem + Texto', icon: ImageIcon },
                                                    { type: 'VIDEO' as const, label: 'Vídeo + Texto', icon: Video }
                                                ].map(item => {
                                                    const isSel = formTemplateType === item.type;
                                                    const Icon = item.icon;
                                                    return (
                                                        <div
                                                            key={item.type}
                                                            onClick={() => setFormTemplateType(item.type)}
                                                            style={{
                                                                padding: '10px 8px',
                                                                borderRadius: '6px',
                                                                border: `1.5px solid ${isSel ? 'var(--primary-color)' : '#D1D5DB'}`,
                                                                background: isSel ? 'var(--primary-light)' : '#FFFFFF',
                                                                cursor: 'pointer',
                                                                textAlign: 'center',
                                                                display: 'flex',
                                                                flexDirection: 'column',
                                                                alignItems: 'center',
                                                                gap: '4px'
                                                            }}
                                                        >
                                                            <Icon size={18} color={isSel ? 'var(--primary-color)' : '#6B7280'} />
                                                            <span style={{ fontSize: '11.5px', fontWeight: 600, color: isSel ? 'var(--primary-text)' : 'var(--text-main)' }}>
                                                                {item.label}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Media URL if not TEXT */}
                                        {formTemplateType !== 'TEXT' && (
                                            <div>
                                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                                                    Arquivo de Mídia ({formTemplateType === 'IMAGE' ? 'Imagem' : 'Vídeo'})
                                                </label>
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    <input
                                                        type="url"
                                                        placeholder="URL da mídia ou selecione arquivo ao lado..."
                                                        value={formMediaUrl}
                                                        onChange={(e) => setFormMediaUrl(e.target.value)}
                                                        style={{
                                                            flex: 1,
                                                            height: '36px',
                                                            padding: '0 12px',
                                                            border: '1px solid #D1D5DB',
                                                            borderRadius: '6px',
                                                            fontSize: '12.5px'
                                                        }}
                                                    />
                                                    <input
                                                        type="file"
                                                        accept={formTemplateType === 'IMAGE' ? 'image/*' : 'video/*'}
                                                        id="wizard-media-file-input"
                                                        style={{ display: 'none' }}
                                                        onChange={(e) => e.target.files?.[0] && handleMediaFileUpload(e.target.files[0])}
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => document.getElementById('wizard-media-file-input')?.click()}
                                                        className="btn-secondary"
                                                        style={{ height: '36px', padding: '0 12px', fontSize: '12px' }}
                                                    >
                                                        Subir Arquivo
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* Botão CTA Link com Adicionar Mais Links + Encurtador / Rotacionador PRO */}
                                        <div style={{
                                            background: '#F8FAFC',
                                            border: '1px solid #E2E8F0',
                                            borderRadius: '8px',
                                            padding: '14px',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '12px'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <Globe size={14} color="#0284C7" />
                                                        <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
                                                            Link do Botão CTA (WhatsApp Acessar Link)
                                                        </label>
                                                    </div>
                                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                        Adicione 1 destino para encurtar ou múltiplos links para ativar o <strong>Rotacionador PRO com pesos</strong>.
                                                    </span>
                                                </div>

                                                <span style={{
                                                    fontSize: '11px',
                                                    fontWeight: 700,
                                                    padding: '2px 8px',
                                                    borderRadius: '4px',
                                                    background: formCtaTargets.length > 1 ? '#F0FDF4' : '#EFF6FF',
                                                    color: formCtaTargets.length > 1 ? '#15803D' : '#1D4ED8',
                                                    border: `1px solid ${formCtaTargets.length > 1 ? '#BBF7D0' : '#BFDBFE'}`,
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px'
                                                }}>
                                                    {formCtaTargets.length > 1 ? (
                                                        <>
                                                            <Zap size={11} color="#16A34A" />
                                                            Rotacionador PRO Ativo ({formCtaTargets.length} Links)
                                                        </>
                                                    ) : (
                                                        <>
                                                            <LinkIcon size={11} color="#2563EB" />
                                                            Encurtador de Link Pro
                                                        </>
                                                    )}
                                                </span>
                                            </div>

                                            {/* Destination Links List */}
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                {formCtaTargets.map((target, idx) => {
                                                    const pct = calculateTargetPercentage(Number(target.weight) || 1, formCtaTargets);
                                                    return (
                                                        <div key={idx} style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '8px',
                                                            background: '#FFFFFF',
                                                            border: '1px solid #CBD5E1',
                                                            borderRadius: '6px',
                                                            padding: '6px 10px'
                                                        }}>
                                                            <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', width: '24px' }}>
                                                                #{idx + 1}
                                                            </span>

                                                            <input
                                                                type="url"
                                                                placeholder="https://seusite.com.br/destino"
                                                                value={target.url}
                                                                onChange={(e) => handleCtaTargetChange(idx, 'url', e.target.value, false)}
                                                                style={{
                                                                    flex: 1,
                                                                    height: '32px',
                                                                    border: '1px solid #E2E8F0',
                                                                    borderRadius: '4px',
                                                                    padding: '0 8px',
                                                                    fontSize: '12px'
                                                                }}
                                                            />

                                                            {formCtaTargets.length > 1 && (
                                                                <>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                        <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Peso:</span>
                                                                        <input
                                                                            type="number"
                                                                            min="1"
                                                                            max="100"
                                                                            value={target.weight}
                                                                            onChange={(e) => handleCtaTargetChange(idx, 'weight', e.target.value, false)}
                                                                            style={{
                                                                                width: '52px',
                                                                                height: '32px',
                                                                                textAlign: 'center',
                                                                                border: '1px solid #E2E8F0',
                                                                                borderRadius: '4px',
                                                                                fontSize: '12px',
                                                                                fontWeight: 700
                                                                            }}
                                                                        />
                                                                    </div>

                                                                    <span style={{
                                                                        fontSize: '10.5px',
                                                                        fontWeight: 700,
                                                                        color: '#0369A1',
                                                                        background: '#E0F2FE',
                                                                        padding: '3px 7px',
                                                                        borderRadius: '4px',
                                                                        minWidth: '45px',
                                                                        textAlign: 'center'
                                                                    }}>
                                                                        {pct}%
                                                                    </span>

                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleRemoveCtaTarget(idx, false)}
                                                                        style={{
                                                                            background: 'none',
                                                                            border: 'none',
                                                                            color: '#EF4444',
                                                                            cursor: 'pointer',
                                                                            padding: '4px'
                                                                        }}
                                                                        title="Remover Link"
                                                                    >
                                                                        <Trash2 size={14} />
                                                                    </button>
                                                                </>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                            {/* Buttons: Add More Links + Generate in Rotator */}
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => handleAddCtaTarget(false)}
                                                    style={{
                                                        background: '#FFFFFF',
                                                        border: '1px solid #94A3B8',
                                                        borderRadius: '5px',
                                                        padding: '0 10px',
                                                        height: '30px',
                                                        fontSize: '11.5px',
                                                        fontWeight: 600,
                                                        color: '#334155',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '5px'
                                                    }}
                                                >
                                                    <Plus size={13} /> Adicionar Mais Links (Rotacionador PRO)
                                                </button>

                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <input
                                                        type="text"
                                                        placeholder="Slug opcional (ex: blackfriday)"
                                                        value={formRotatorSlug}
                                                        onChange={(e) => setFormRotatorSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                                                        style={{
                                                            height: '30px',
                                                            padding: '0 8px',
                                                            border: '1px solid #CBD5E1',
                                                            borderRadius: '5px',
                                                            fontSize: '11.5px',
                                                            width: '170px'
                                                        }}
                                                    />
                                                    <button
                                                        type="button"
                                                        disabled={isGeneratingFormRotator}
                                                        onClick={() => handleGenerateCtaLink(false)}
                                                        className="btn-primary"
                                                        style={{ height: '30px', padding: '0 10px', fontSize: '11.5px', gap: '4px' }}
                                                    >
                                                        {isGeneratingFormRotator ? (
                                                            <RefreshCw size={12} className="animate-spin" />
                                                        ) : (
                                                            <Zap size={12} />
                                                        )}
                                                        {formCtaTargets.length > 1 ? 'Gerar Rotacionador PRO' : 'Gerar Encurtador'}
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Resulting Button Link display */}
                                            {formButtonLink && (
                                                <div style={{
                                                    background: '#F0FDF4',
                                                    border: '1px solid #BBF7D0',
                                                    borderRadius: '6px',
                                                    padding: '8px 12px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    gap: '8px'
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                                                        <CheckCircle2 size={14} color="#16A34A" />
                                                        <span style={{ fontSize: '11px', color: '#166534', fontWeight: 600 }}>Link Aplicado ao Botão:</span>
                                                        <a
                                                            href={formButtonLink}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            style={{ fontSize: '11px', color: '#0284C7', textDecoration: 'underline', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                                        >
                                                            {formButtonLink}
                                                        </a>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            navigator.clipboard.writeText(formButtonLink);
                                                            showToast('Link do botão copiado!');
                                                        }}
                                                        style={{
                                                            background: '#FFFFFF',
                                                            border: '1px solid #86EFAC',
                                                            borderRadius: '4px',
                                                            padding: '3px 8px',
                                                            fontSize: '10.5px',
                                                            fontWeight: 600,
                                                            color: '#15803D',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '4px',
                                                            flexShrink: 0
                                                        }}
                                                    >
                                                        <Copy size={11} /> Copiar
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {/* PADRÕES DE VARIÁVEIS (2 / 4 / 5 VARIÁVEIS OU ABERTO) ACIMA DO TEXTO */}
                                        <div style={{
                                            background: '#FFFFFF',
                                            border: '1px solid #E2E8F0',
                                            borderRadius: '8px',
                                            padding: '12px 14px',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '8px'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-main)' }}>
                                                    Padrões de Variáveis Fast Dispatch:
                                                </span>
                                                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                    Selecione o padrão desejado ou edite livremente abaixo
                                                </span>
                                            </div>

                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                                                {[
                                                    { key: '2' as const, label: '2 Variáveis' },
                                                    { key: '4' as const, label: '4 Variáveis' },
                                                    { key: '5' as const, label: '5 Variáveis' },
                                                    { key: 'custom' as const, label: 'Texto Aberto' }
                                                ].map(item => {
                                                    const isSel = formVariablePreset === item.key;
                                                    return (
                                                        <button
                                                            key={item.key}
                                                            type="button"
                                                            onClick={() => handleSelectPreset(item.key, false)}
                                                            style={{
                                                                padding: '7px 8px',
                                                                borderRadius: '6px',
                                                                border: `1.5px solid ${isSel ? 'var(--primary-color)' : '#D1D5DB'}`,
                                                                background: isSel ? 'var(--primary-light)' : '#FFFFFF',
                                                                color: isSel ? 'var(--primary-text)' : '#374151',
                                                                fontSize: '11.5px',
                                                                fontWeight: 700,
                                                                cursor: 'pointer',
                                                                textAlign: 'center',
                                                                transition: 'all 150ms ease'
                                                            }}
                                                        >
                                                            {item.label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Textarea da Mensagem */}
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-main)' }}>
                                                    Texto da Mensagem (WhatsApp Copy)
                                                </label>
                                                <span style={{ fontSize: '11px', color: 'var(--primary-color)', fontWeight: 600 }}>
                                                    {formVariablePreset === 'custom' ? 'Modo Texto Aberto' : `Padrão ${formVariablePreset} Variáveis Ativo`}
                                                </span>
                                            </div>
                                            <textarea
                                                rows={5}
                                                value={formAdCopy}
                                                onChange={(e) => {
                                                    setFormAdCopy(e.target.value);
                                                    setFormVariablePreset('custom');
                                                }}
                                                style={{
                                                    width: '100%',
                                                    padding: '10px 12px',
                                                    border: '1px solid #D1D5DB',
                                                    borderRadius: '6px',
                                                    fontSize: '13px',
                                                    lineHeight: 1.5,
                                                    resize: 'vertical'
                                                }}
                                            />
                                        </div>

                                        {/* EDITAR VARIÁVEIS INDIVIDUALMENTE COM INPUTS ABAIXO DO TEXTO */}
                                        <div style={{
                                            background: '#F8FAFC',
                                            border: '1px solid #E2E8F0',
                                            borderRadius: '8px',
                                            padding: '14px',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '10px'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <div>
                                                    <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-main)', display: 'block' }}>
                                                        Editar Variáveis Individualmente:
                                                    </span>
                                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                        Digite os valores abaixo para atualizar o texto da mensagem e a prévia do celular em tempo real.
                                                    </span>
                                                </div>
                                                <span style={{
                                                    fontSize: '10.5px',
                                                    fontWeight: 700,
                                                    background: '#ECFDF5',
                                                    color: '#065F46',
                                                    border: '1px solid #A7F3D0',
                                                    padding: '2px 8px',
                                                    borderRadius: '4px'
                                                }}>
                                                    Sincronizado com Celular
                                                </span>
                                            </div>

                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                                                {[1, 2, 3, 4, 5].map(vNum => {
                                                    if (formVariablePreset === '2' && vNum > 2) return null;
                                                    if (formVariablePreset === '4' && vNum > 4) return null;
                                                    if (!formShowFifthVar && formVariablePreset !== '5' && vNum === 5) return null;

                                                    const presetCfg = TEMPLATE_PRESETS[formVariablePreset === 'custom' ? '5' : (formVariablePreset as '2' | '4' | '5')];
                                                    const placeholder = (presetCfg && presetCfg.placeholders[vNum - 1]) || `Ex: Conteúdo da Variável {{${vNum}}}`;

                                                    return (
                                                        <div key={vNum} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                                <label style={{ fontSize: '11.5px', fontWeight: 600, color: '#334155' }}>
                                                                    Variável {vNum}:
                                                                </label>
                                                                <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--primary-color)', fontFamily: 'monospace' }}>
                                                                    {`{{${vNum}}}`}
                                                                </span>
                                                            </div>
                                                            <input
                                                                type="text"
                                                                placeholder={placeholder}
                                                                value={formVariables[vNum - 1] || ''}
                                                                onChange={(e) => handleVariableInputChange(vNum - 1, e.target.value, false)}
                                                                style={{
                                                                    height: '32px',
                                                                    padding: '0 10px',
                                                                    border: '1px solid #D1D5DB',
                                                                    borderRadius: '5px',
                                                                    fontSize: '12px'
                                                                }}
                                                            />
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Planilha de Destinatários */}
                                        <div style={{
                                            border: '1px dashed #CBD5E1',
                                            borderRadius: '8px',
                                            padding: '14px',
                                            background: '#F8FAFC'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-main)' }}>
                                                    Planilha de Contatos (.xlsx, .csv)
                                                </span>
                                                {wizardAnalysis && (
                                                    <span style={{ fontSize: '11px', color: '#16A34A', fontWeight: 700 }}>
                                                        ✓ {(wizardAnalysis.totalRows || wizardAnalysis.stats.totalRows)} contatos
                                                    </span>
                                                )}
                                            </div>
                                            <input
                                                type="file"
                                                accept=".xlsx, .xls, .csv"
                                                id="wizard-sheet-input"
                                                style={{ display: 'none' }}
                                                onChange={(e) => e.target.files?.[0] && handleWizardSheetUpload(e.target.files[0])}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => document.getElementById('wizard-sheet-input')?.click()}
                                                className="btn-secondary"
                                                style={{ width: '100%', height: '36px', fontSize: '12.5px', justifyContent: 'center' }}
                                            >
                                                <FileSpreadsheet size={15} />
                                                {isProcessingWizardSheet ? 'Processando...' : (wizardFile ? `Arquivo: ${wizardFile.name}` : 'Selecionar Planilha Excel / CSV')}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* STEP 3: REVISÃO & CONFIRMAÇÃO */}
                                {wizardStep === 3 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                        <h3 style={{ margin: 0, fontSize: '14.5px', fontWeight: 600, color: 'var(--text-main)' }}>
                                            Revisão Geral da Campanha
                                        </h3>

                                        <div style={{
                                            background: '#F9FAFB',
                                            border: '1px solid #E5E7EB',
                                            borderRadius: '8px',
                                            padding: '16px',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '10px',
                                            fontSize: '12.5px'
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <span style={{ color: 'var(--text-muted)' }}>Nome da Campanha:</span>
                                                <strong style={{ color: 'var(--text-main)' }}>{formCampaignName || '—'}</strong>
                                            </div>
                                            {formSenderPhone && (
                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                    <span style={{ color: 'var(--text-muted)' }}>Número Remetente:</span>
                                                    <strong style={{ color: '#047857' }}>{formSenderPhone}</strong>
                                                </div>
                                            )}
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <span style={{ color: 'var(--text-muted)' }}>Nome do Atendimento:</span>
                                                <strong style={{ color: 'var(--text-main)' }}>{formProfileName || '—'}</strong>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <span style={{ color: 'var(--text-muted)' }}>DDD Regional:</span>
                                                <strong style={{ color: 'var(--primary-color)' }}>DDD {formDdd}</strong>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <span style={{ color: 'var(--text-muted)' }}>Data e Horário de Disparo:</span>
                                                <strong style={{ color: formDispatchDate ? '#16A34A' : '#6B7280' }}>
                                                    {formDispatchDate ? new Date(formDispatchDate).toLocaleString('pt-BR') : 'Imediato / Pendente'}
                                                </strong>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <span style={{ color: 'var(--text-muted)' }}>Formato:</span>
                                                <strong>{formTemplateType}</strong>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <span style={{ color: 'var(--text-muted)' }}>Link do Botão CTA:</span>
                                                <span style={{ color: '#0284C7', textDecoration: 'underline', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {formButtonLink || 'Nenhum'}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <span style={{ color: 'var(--text-muted)' }}>Contatos na Planilha:</span>
                                                <strong style={{ color: '#16A34A' }}>
                                                    {wizardAnalysis ? (wizardAnalysis.totalRows || wizardAnalysis.stats.totalRows) : 0} contatos
                                                </strong>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Stepper Action Buttons */}
                                <div style={{
                                    marginTop: '20px',
                                    paddingTop: '16px',
                                    borderTop: '1px solid var(--border-subtle)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: '10px'
                                }}>
                                    {wizardStep > 1 ? (
                                        <button
                                            type="button"
                                            onClick={() => setWizardStep(p => p - 1)}
                                            className="btn-secondary"
                                            style={{ height: '36px', padding: '0 14px', fontSize: '12.5px' }}
                                        >
                                            <ArrowLeft size={14} /> Voltar
                                        </button>
                                    ) : <div />}

                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        {wizardStep < 3 ? (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (wizardStep === 1 && !formCampaignName.trim()) {
                                                        alert('Informe o Nome da Campanha.');
                                                        return;
                                                    }
                                                    if (wizardStep === 1 && !formProfileName.trim()) {
                                                        alert('Informe o Nome do Atendimento.');
                                                        return;
                                                    }
                                                    setWizardStep(p => p + 1);
                                                }}
                                                className="btn-primary"
                                                style={{ height: '36px', padding: '0 16px', fontSize: '12.5px' }}
                                            >
                                                Próxima Etapa <ArrowRight size={14} />
                                            </button>
                                        ) : (
                                            <>
                                                <button
                                                    type="button"
                                                    disabled={isSavingSubmission}
                                                    onClick={() => handleSaveWizardSubmission(false)}
                                                    className="btn-secondary"
                                                    style={{ height: '36px', padding: '0 16px', fontSize: '12.5px' }}
                                                >
                                                    {isSavingSubmission ? 'Salvando...' : 'Salvar Campanha'}
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={isSavingSubmission}
                                                    onClick={() => handleSaveWizardSubmission(true)}
                                                    className="btn-primary"
                                                    style={{ height: '36px', padding: '0 16px', fontSize: '12.5px', gap: '6px' }}
                                                >
                                                    <Send size={14} />
                                                    {isSavingSubmission ? 'Processando...' : 'Salvar & Carregar no Disparador'}
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* RIGHT COLUMN: REALTIME SMARTPHONE MOCKUP PREVIEW */}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Eye size={12} color="#10B981" />
                                    Preview em Tempo Real
                                </div>
                                {renderPhoneMockup(
                                    formProfileName,
                                    formProfilePhoto,
                                    formTemplateType,
                                    formMediaUrl,
                                    formAdCopy,
                                    formButtonLink,
                                    formDispatchDate,
                                    formVariables
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ========================================================= */}
            {/* MODAL 2: EDITAR CAMPANHA COMPLETA (EDITAR TUDO)           */}
            {/* ========================================================= */}
            {editingSubmission && (
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
                        maxWidth: '980px',
                        maxHeight: '92vh',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
                    }}>
                        {/* Header */}
                        <div style={{
                            padding: '16px 24px',
                            borderBottom: '1px solid var(--border-subtle)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            background: '#F9FAFB'
                        }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text-main)' }}>
                                    Editar Campanha &amp; Atendimento
                                </h2>
                                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
                                    Altere qualquer dado da campanha: status, nomes, data/horário, fotos, mídia e mensagem.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setEditingSubmission(null)}
                                style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', padding: '4px' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Edit Body */}
                        <div style={{
                            flex: 1,
                            overflowY: 'auto',
                            padding: '24px',
                            display: 'grid',
                            gridTemplateColumns: '1.25fr 300px',
                            gap: '24px',
                            alignItems: 'start'
                        }}>
                            {/* Left Edit Inputs */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                {/* Campaign Name & Status */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '4px' }}>
                                            Nome da Campanha
                                        </label>
                                        <input
                                            type="text"
                                            value={editCampaignName}
                                            onChange={(e) => setEditCampaignName(e.target.value)}
                                            style={{ width: '100%', height: '36px', padding: '0 12px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '4px' }}>
                                            Status da Campanha
                                        </label>
                                        <select
                                            value={editStatus}
                                            onChange={(e) => setEditStatus(e.target.value)}
                                            style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px', background: '#FFFFFF' }}
                                        >
                                            <option value="PENDENTE">Pendente</option>
                                            <option value="AGENDADO">Agendado</option>
                                            <option value="EM ANDAMENTO">Em Andamento</option>
                                            <option value="GERADO">Gerado</option>
                                            <option value="CONCLUIDO">Concluído</option>
                                            <option value="CANCELADO">Cancelado</option>
                                        </select>
                                    </div>
                                </div>

                                {/* NÚMERO DO REMETENTE NA EDIÇÃO */}
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                                        Número do Remetente
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Ex: 5511999998888 ou +55 (11) 99999-8888"
                                        value={editSenderPhone}
                                        onChange={(e) => setEditSenderPhone(e.target.value)}
                                        style={{ width: '100%', height: '36px', padding: '0 12px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px' }}
                                    />
                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                        Número ou identificador da linha remetente autorizada para este envio.
                                    </span>
                                </div>

                                {/* Profile Name & DDD */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: '12px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                                            Nome do Atendimento
                                        </label>
                                        <input
                                            type="text"
                                            value={editProfileName}
                                            onChange={(e) => setEditProfileName(e.target.value)}
                                            style={{ width: '100%', height: '36px', padding: '0 12px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                                            DDD
                                        </label>
                                        <input
                                            type="text"
                                            maxLength={2}
                                            value={editDdd}
                                            onChange={(e) => setEditDdd(e.target.value.replace(/\D/g, ''))}
                                            style={{ width: '100%', height: '36px', padding: '0 12px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px', textAlign: 'center', fontWeight: 700 }}
                                        />
                                    </div>
                                </div>

                                {/* Date / Time */}
                                <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '8px', padding: '12px' }}>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#166534', marginBottom: '4px' }}>
                                        📅 Data e Horário Programado
                                    </label>
                                    <input
                                        type="datetime-local"
                                        value={editDispatchDate}
                                        onChange={(e) => setEditDispatchDate(e.target.value)}
                                        style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #86EFAC', borderRadius: '6px', fontSize: '13px', background: '#FFFFFF' }}
                                    />
                                </div>

                                {/* Photo / Avatar */}
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                                        Foto do Perfil (Upload ou URL)
                                    </label>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            id="edit-photo-input"
                                            style={{ display: 'none' }}
                                            onChange={(e) => e.target.files?.[0] && handlePhotoUpload(e.target.files[0], true)}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => document.getElementById('edit-photo-input')?.click()}
                                            className="btn-secondary"
                                            style={{ height: '34px', padding: '0 12px', fontSize: '12px' }}
                                        >
                                            Trocar Foto
                                        </button>
                                        <input
                                            type="url"
                                            placeholder="Ou cole a URL da foto..."
                                            value={editProfilePhoto}
                                            onChange={(e) => setEditProfilePhoto(e.target.value)}
                                            style={{ flex: 1, height: '34px', padding: '0 10px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '12px' }}
                                        />
                                    </div>
                                </div>

                                {/* Format Selector */}
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                                        Formato
                                    </label>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                                        {(['TEXT', 'IMAGE', 'VIDEO'] as const).map(fmt => (
                                            <div
                                                key={fmt}
                                                onClick={() => setEditTemplateType(fmt)}
                                                style={{
                                                    padding: '8px',
                                                    borderRadius: '6px',
                                                    border: `1.5px solid ${editTemplateType === fmt ? 'var(--primary-color)' : '#D1D5DB'}`,
                                                    background: editTemplateType === fmt ? 'var(--primary-light)' : '#FFFFFF',
                                                    cursor: 'pointer',
                                                    textAlign: 'center',
                                                    fontSize: '12px',
                                                    fontWeight: 600
                                                }}
                                            >
                                                {fmt === 'TEXT' ? 'Apenas Texto' : (fmt === 'IMAGE' ? 'Imagem + Texto' : 'Vídeo + Texto')}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Media File if not TEXT */}
                                {editTemplateType !== 'TEXT' && (
                                    <div>
                                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                                            Mídia (Imagem ou Vídeo)
                                        </label>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <input
                                                type="url"
                                                placeholder="URL da mídia..."
                                                value={editMediaUrl}
                                                onChange={(e) => setEditMediaUrl(e.target.value)}
                                                style={{ flex: 1, height: '34px', padding: '0 10px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '12px' }}
                                            />
                                            <input
                                                type="file"
                                                accept={editTemplateType === 'IMAGE' ? 'image/*' : 'video/*'}
                                                id="edit-media-file-input"
                                                style={{ display: 'none' }}
                                                onChange={(e) => e.target.files?.[0] && handleMediaFileUpload(e.target.files[0], true)}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => document.getElementById('edit-media-file-input')?.click()}
                                                className="btn-secondary"
                                                style={{ height: '34px', padding: '0 12px', fontSize: '12px' }}
                                            >
                                                Subir Arquivo
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Botão CTA Link com Adicionar Mais Links + Encurtador / Rotacionador PRO */}
                                <div style={{
                                    background: '#F8FAFC',
                                    border: '1px solid #E2E8F0',
                                    borderRadius: '8px',
                                    padding: '12px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '10px'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Globe size={13} color="#0284C7" />
                                                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
                                                    Link do Botão CTA (WhatsApp Acessar Link)
                                                </label>
                                            </div>
                                            <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                                                1 link para encurtar ou múltiplos destinos com <strong>pesos no Rotacionador PRO</strong>.
                                            </span>
                                        </div>

                                        <span style={{
                                            fontSize: '10.5px',
                                            fontWeight: 700,
                                            padding: '2px 7px',
                                            borderRadius: '4px',
                                            background: editCtaTargets.length > 1 ? '#F0FDF4' : '#EFF6FF',
                                            color: editCtaTargets.length > 1 ? '#15803D' : '#1D4ED8',
                                            border: `1px solid ${editCtaTargets.length > 1 ? '#BBF7D0' : '#BFDBFE'}`,
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        }}>
                                            {editCtaTargets.length > 1 ? (
                                                <>
                                                    <Zap size={11} color="#16A34A" />
                                                    Rotacionador PRO ({editCtaTargets.length} Links)
                                                </>
                                            ) : (
                                                <>
                                                    <LinkIcon size={11} color="#2563EB" />
                                                    Encurtador de Link Pro
                                                </>
                                            )}
                                        </span>
                                    </div>

                                    {/* Destination Links List */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        {editCtaTargets.map((target, idx) => {
                                            const pct = calculateTargetPercentage(Number(target.weight) || 1, editCtaTargets);
                                            return (
                                                <div key={idx} style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    background: '#FFFFFF',
                                                    border: '1px solid #CBD5E1',
                                                    borderRadius: '6px',
                                                    padding: '5px 8px'
                                                }}>
                                                    <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748B', width: '22px' }}>
                                                        #{idx + 1}
                                                    </span>

                                                    <input
                                                        type="url"
                                                        placeholder="https://seusite.com.br/destino"
                                                        value={target.url}
                                                        onChange={(e) => handleCtaTargetChange(idx, 'url', e.target.value, true)}
                                                        style={{
                                                            flex: 1,
                                                            height: '30px',
                                                            border: '1px solid #E2E8F0',
                                                            borderRadius: '4px',
                                                            padding: '0 8px',
                                                            fontSize: '11.5px'
                                                        }}
                                                    />

                                                    {editCtaTargets.length > 1 && (
                                                        <>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                                <span style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 600 }}>Peso:</span>
                                                                <input
                                                                    type="number"
                                                                    min="1"
                                                                    max="100"
                                                                    value={target.weight}
                                                                    onChange={(e) => handleCtaTargetChange(idx, 'weight', e.target.value, true)}
                                                                    style={{
                                                                        width: '48px',
                                                                        height: '30px',
                                                                        textAlign: 'center',
                                                                        border: '1px solid #E2E8F0',
                                                                        borderRadius: '4px',
                                                                        fontSize: '11.5px',
                                                                        fontWeight: 700
                                                                    }}
                                                                />
                                                            </div>

                                                            <span style={{
                                                                fontSize: '10px',
                                                                fontWeight: 700,
                                                                color: '#0369A1',
                                                                background: '#E0F2FE',
                                                                padding: '2px 6px',
                                                                borderRadius: '4px',
                                                                minWidth: '40px',
                                                                textAlign: 'center'
                                                            }}>
                                                                {pct}%
                                                            </span>

                                                            <button
                                                                type="button"
                                                                onClick={() => handleRemoveCtaTarget(idx, true)}
                                                                style={{
                                                                    background: 'none',
                                                                    border: 'none',
                                                                    color: '#EF4444',
                                                                    cursor: 'pointer',
                                                                    padding: '3px'
                                                                }}
                                                                title="Remover Link"
                                                            >
                                                                <Trash2 size={13} />
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Buttons: Add More Links + Generate in Rotator */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                                        <button
                                            type="button"
                                            onClick={() => handleAddCtaTarget(true)}
                                            style={{
                                                background: '#FFFFFF',
                                                border: '1px solid #94A3B8',
                                                borderRadius: '4px',
                                                padding: '0 8px',
                                                height: '28px',
                                                fontSize: '11px',
                                                fontWeight: 600,
                                                color: '#334155',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}
                                        >
                                            <Plus size={12} /> Adicionar Link (Rotacionador PRO)
                                        </button>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <input
                                                type="text"
                                                placeholder="Slug opcional"
                                                value={editRotatorSlug}
                                                onChange={(e) => setEditRotatorSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                                                style={{
                                                    height: '28px',
                                                    padding: '0 6px',
                                                    border: '1px solid #CBD5E1',
                                                    borderRadius: '4px',
                                                    fontSize: '11px',
                                                    width: '140px'
                                                }}
                                            />
                                            <button
                                                type="button"
                                                disabled={isGeneratingEditRotator}
                                                onClick={() => handleGenerateCtaLink(true)}
                                                className="btn-primary"
                                                style={{ height: '28px', padding: '0 9px', fontSize: '11px', gap: '3px' }}
                                            >
                                                {isGeneratingEditRotator ? (
                                                    <RefreshCw size={11} className="animate-spin" />
                                                ) : (
                                                    <Zap size={11} />
                                                )}
                                                {editCtaTargets.length > 1 ? 'Gerar Rotacionador PRO' : 'Gerar Encurtador'}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Resulting Button Link display */}
                                    {editButtonLink && (
                                        <div style={{
                                            background: '#F0FDF4',
                                            border: '1px solid #BBF7D0',
                                            borderRadius: '5px',
                                            padding: '6px 10px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            gap: '6px'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0 }}>
                                                <CheckCircle2 size={13} color="#16A34A" />
                                                <span style={{ fontSize: '10.5px', color: '#166534', fontWeight: 600 }}>Link do Botão:</span>
                                                <a
                                                    href={editButtonLink}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    style={{ fontSize: '10.5px', color: '#0284C7', textDecoration: 'underline', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                                >
                                                    {editButtonLink}
                                                </a>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    navigator.clipboard.writeText(editButtonLink);
                                                    showToast('Link do botão copiado!');
                                                }}
                                                style={{
                                                    background: '#FFFFFF',
                                                    border: '1px solid #86EFAC',
                                                    borderRadius: '4px',
                                                    padding: '2px 6px',
                                                    fontSize: '10px',
                                                    fontWeight: 600,
                                                    color: '#15803D',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '3px',
                                                    flexShrink: 0
                                                }}
                                            >
                                                <Copy size={10} /> Copiar
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* PADRÕES DE VARIÁVEIS ACIMA DO TEXTO NA EDIÇÃO */}
                                <div style={{
                                    background: '#FFFFFF',
                                    border: '1px solid #E2E8F0',
                                    borderRadius: '8px',
                                    padding: '10px 12px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '6px'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-main)' }}>
                                            Padrões de Variáveis Fast Dispatch:
                                        </span>
                                        <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                                            Atualiza o texto padrão ou mantenha aberto
                                        </span>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                                        {[
                                            { key: '2' as const, label: '2 Variáveis' },
                                            { key: '4' as const, label: '4 Variáveis' },
                                            { key: '5' as const, label: '5 Variáveis' },
                                            { key: 'custom' as const, label: 'Texto Aberto' }
                                        ].map(item => {
                                            const isSel = editVariablePreset === item.key;
                                            return (
                                                <button
                                                    key={item.key}
                                                    type="button"
                                                    onClick={() => handleSelectPreset(item.key, true)}
                                                    style={{
                                                        padding: '6px 6px',
                                                        borderRadius: '5px',
                                                        border: `1.5px solid ${isSel ? 'var(--primary-color)' : '#D1D5DB'}`,
                                                        background: isSel ? 'var(--primary-light)' : '#FFFFFF',
                                                        color: isSel ? 'var(--primary-text)' : '#374151',
                                                        fontSize: '11px',
                                                        fontWeight: 700,
                                                        cursor: 'pointer',
                                                        textAlign: 'center',
                                                        transition: 'all 150ms ease'
                                                    }}
                                                >
                                                    {item.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Message Copy */}
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                        <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-main)' }}>
                                            Texto da Mensagem (WhatsApp Copy)
                                        </label>
                                        <span style={{ fontSize: '10.5px', color: 'var(--primary-color)', fontWeight: 600 }}>
                                            {editVariablePreset === 'custom' ? 'Modo Texto Aberto' : `Padrão ${editVariablePreset} Variáveis Ativo`}
                                        </span>
                                    </div>
                                    <textarea
                                        rows={4}
                                        value={editAdCopy}
                                        onChange={(e) => {
                                            setEditAdCopy(e.target.value);
                                            setEditVariablePreset('custom');
                                        }}
                                        style={{ width: '100%', padding: '8px 10px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '12.5px', resize: 'vertical' }}
                                    />
                                </div>

                                {/* EDITAR VARIÁVEIS INDIVIDUALMENTE ABAIXO DO TEXTO NA EDIÇÃO */}
                                <div style={{
                                    background: '#F8FAFC',
                                    border: '1px solid #E2E8F0',
                                    borderRadius: '8px',
                                    padding: '12px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '8px'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div>
                                            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-main)', display: 'block' }}>
                                                Editar Variáveis Individualmente:
                                            </span>
                                            <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                                                Altere os campos para refletir na mensagem e no celular instantaneamente.
                                            </span>
                                        </div>
                                        <span style={{
                                            fontSize: '10px',
                                            fontWeight: 700,
                                            background: '#ECFDF5',
                                            color: '#065F46',
                                            border: '1px solid #A7F3D0',
                                            padding: '2px 6px',
                                            borderRadius: '4px'
                                        }}>
                                            Prévia ao Vivo
                                        </span>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                                        {[1, 2, 3, 4, 5].map(vNum => {
                                            if (editVariablePreset === '2' && vNum > 2) return null;
                                            if (editVariablePreset === '4' && vNum > 4) return null;
                                            if (!editShowFifthVar && editVariablePreset !== '5' && vNum === 5) return null;

                                            const presetCfg = TEMPLATE_PRESETS[editVariablePreset === 'custom' ? '5' : (editVariablePreset as '2' | '4' | '5')];
                                            const placeholder = (presetCfg && presetCfg.placeholders[vNum - 1]) || `Ex: Variável {{${vNum}}}`;

                                            return (
                                                <div key={vNum} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                        <label style={{ fontSize: '11px', fontWeight: 600, color: '#334155' }}>
                                                            Variável {vNum}:
                                                        </label>
                                                        <span style={{ fontSize: '9.5px', fontWeight: 700, color: 'var(--primary-color)', fontFamily: 'monospace' }}>
                                                            {`{{${vNum}}}`}
                                                        </span>
                                                    </div>
                                                    <input
                                                        type="text"
                                                        placeholder={placeholder}
                                                        value={editVariables[vNum - 1] || ''}
                                                        onChange={(e) => handleVariableInputChange(vNum - 1, e.target.value, true)}
                                                        style={{
                                                            height: '30px',
                                                            padding: '0 8px',
                                                            border: '1px solid #D1D5DB',
                                                            borderRadius: '4px',
                                                            fontSize: '11.5px'
                                                        }}
                                                    />
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Notes */}
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                                        Observações da Equipe
                                    </label>
                                    <textarea
                                        rows={2}
                                        value={editNotes}
                                        onChange={(e) => setEditNotes(e.target.value)}
                                        style={{ width: '100%', padding: '8px 10px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '12px', resize: 'vertical' }}
                                    />
                                </div>
                            </div>

                            {/* Right Live Preview */}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
                                    Prévia da Edição
                                </div>
                                {renderPhoneMockup(
                                    editProfileName,
                                    editProfilePhoto,
                                    editTemplateType,
                                    editMediaUrl,
                                    editAdCopy,
                                    editButtonLink,
                                    editDispatchDate,
                                    editVariables
                                )}
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div style={{
                            padding: '14px 24px',
                            borderTop: '1px solid var(--border-subtle)',
                            background: '#F9FAFB',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            gap: '10px'
                        }}>
                            <button
                                type="button"
                                onClick={() => setEditingSubmission(null)}
                                className="btn-secondary"
                                style={{ height: '36px', padding: '0 16px', fontSize: '12.5px' }}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                disabled={isSavingEdit}
                                onClick={handleSaveEdit}
                                className="btn-primary"
                                style={{ height: '36px', padding: '0 18px', fontSize: '12.5px', gap: '6px' }}
                            >
                                <Check size={14} />
                                {isSavingEdit ? 'Salvando...' : 'Salvar Alterações'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ========================================================= */}
            {/* MODAL 3: AGENDAMENTO EM MASSA (BULK SCHEDULE MODAL)       */}
            {/* ========================================================= */}
            {showBulkScheduleModal && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(15, 23, 42, 0.75)',
                    backdropFilter: 'blur(6px)',
                    zIndex: 10000,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '20px'
                }}>
                    <div style={{
                        background: '#FFFFFF',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '10px',
                        padding: '20px',
                        maxWidth: '420px',
                        width: '100%',
                        boxShadow: 'var(--shadow-dropdown)'
                    }}>
                        <h3 style={{ margin: '0 0 6px 0', fontSize: '15px', fontWeight: 600 }}>
                            Agendamento em Massa
                        </h3>
                        <p style={{ margin: '0 0 14px 0', fontSize: '12.5px', color: 'var(--text-muted)' }}>
                            Defina uma mesma data e horário de disparo para as <strong>{selectedIds.length}</strong> campanhas selecionadas.
                        </p>

                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                                Data e Horário
                            </label>
                            <input
                                type="datetime-local"
                                value={bulkScheduleDate}
                                onChange={(e) => setBulkScheduleDate(e.target.value)}
                                style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px' }}
                            />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            <button
                                type="button"
                                onClick={() => setShowBulkScheduleModal(false)}
                                className="btn-secondary"
                                style={{ height: '34px', padding: '0 12px', fontSize: '12px' }}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                disabled={!bulkScheduleDate}
                                onClick={handleBulkScheduleSubmit}
                                className="btn-primary"
                                style={{ height: '34px', padding: '0 14px', fontSize: '12px' }}
                            >
                                Aplicar a Todas
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ========================================================= */}
            {/* MODAL 4: FULL PREVIEW & CAMPAIGN INSPECTION MODAL         */}
            {/* ========================================================= */}
            {previewModalSubmission && (() => {
                const sub = previewModalSubmission;
                const statusCfg = STATUS_CONFIG[sub.status] || STATUS_CONFIG.PENDENTE;
                const currentDownloads = Number(sub.download_count) || 0;
                const downloadsRemaining = Math.max(0, 3 - currentDownloads);
                const hasContacts = sub.contacts && sub.contacts.length > 0;
                const isPlanilhaExhausted = currentDownloads >= 3 || (!hasContacts && currentDownloads > 0);

                // Variables list
                const vars = (sub.variables && sub.variables.length > 0)
                    ? sub.variables
                    : (sub.ads && sub.ads[0]?.variables && sub.ads[0].variables.length > 0)
                        ? sub.ads[0].variables
                        : [];

                // Resolved copy
                const resolvedText = renderPreviewText(sub.ad_copy, vars);

                return (
                    <div style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(15, 23, 42, 0.85)',
                        backdropFilter: 'blur(8px)',
                        zIndex: 10000,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '16px'
                    }}>
                        <div style={{
                            background: '#FFFFFF',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '16px',
                            maxWidth: '980px',
                            width: '100%',
                            maxHeight: '94vh',
                            display: 'flex',
                            flexDirection: 'column',
                            boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
                            overflow: 'hidden',
                            position: 'relative'
                        }}>
                            {/* POPUP HEADER */}
                            <div style={{
                                padding: '16px 20px',
                                borderBottom: '1px solid var(--border-subtle)',
                                background: '#F8FAFC',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '16px',
                                flexWrap: 'wrap'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{
                                        width: '38px',
                                        height: '38px',
                                        borderRadius: '50%',
                                        background: '#E2E8F0',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        overflow: 'hidden',
                                        flexShrink: 0,
                                        border: '1.5px solid #CBD5E1'
                                    }}>
                                        {sub.profile_photo ? (
                                            <img src={sub.profile_photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        ) : (
                                            <User size={20} color="#64748B" />
                                        )}
                                    </div>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-main)' }}>
                                                {sub.campaign_name || sub.profile_name}
                                            </h3>
                                            <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--primary-color)', background: 'var(--primary-light)', padding: '2px 6px', borderRadius: '4px' }}>
                                                DDD {sub.ddd}
                                            </span>
                                            {sub.sender_phone && (
                                                <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#047857', background: '#ECFDF5', border: '1px solid #A7F3D0', padding: '2px 6px', borderRadius: '4px' }}>
                                                    📱 Remetente: {sub.sender_phone}
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                            <span>Atendimento: <strong>{sub.profile_name}</strong></span>
                                            {sub.dispatch_date && (
                                                <span>• 📅 Disparo: <strong>{new Date(sub.dispatch_date).toLocaleString('pt-BR')}</strong></span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* STATUS SELECTOR DIRECTLY IN HEADER */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#FFFFFF', padding: '4px 10px', borderRadius: '8px', border: '1px solid #CBD5E1' }}>
                                        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
                                            Status:
                                        </span>
                                        <select
                                            value={sub.status}
                                            onChange={(e) => handlePreviewChangeStatus(e.target.value)}
                                            style={{
                                                background: statusCfg.bg,
                                                color: statusCfg.color,
                                                border: `1px solid ${statusCfg.border}`,
                                                borderRadius: '5px',
                                                padding: '3px 8px',
                                                fontSize: '11.5px',
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                                outline: 'none'
                                            }}
                                        >
                                            <option value="PENDENTE">Pendente</option>
                                            <option value="AGENDADO">Agendado</option>
                                            <option value="EM ANDAMENTO">Em Andamento</option>
                                            <option value="GERADO">Gerado</option>
                                            <option value="CONCLUIDO">Concluído</option>
                                            <option value="CANCELADO">Cancelado</option>
                                        </select>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => setPreviewModalSubmission(null)}
                                        style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', padding: '6px', borderRadius: '6px' }}
                                        title="Fechar"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>
                            </div>

                            {/* POPUP BODY: 2 COLUMNS */}
                            <div style={{
                                flex: 1,
                                overflowY: 'auto',
                                padding: '20px',
                                display: 'grid',
                                gridTemplateColumns: 'minmax(0, 1fr) 300px',
                                gap: '20px',
                                alignItems: 'start'
                            }}>
                                {/* LEFT COLUMN: ALL CAMPAIGN DETAILS & DOWNLOADS */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                                    {/* 1. TEXTO DA MENSAGEM COM COPYBOARD */}
                                    <div className="glass-panel" style={{ padding: '14px 16px', borderRadius: '10px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <MessageSquare size={14} color="var(--primary-color)" />
                                                <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-main)' }}>
                                                    Texto da Mensagem (WhatsApp Copy)
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => handleCopyText(sub.ad_copy, 'raw_copy')}
                                                    style={{
                                                        background: copiedField === 'raw_copy' ? '#ECFDF5' : '#F1F5F9',
                                                        border: `1px solid ${copiedField === 'raw_copy' ? '#86EFAC' : '#CBD5E1'}`,
                                                        color: copiedField === 'raw_copy' ? '#15803D' : '#334155',
                                                        borderRadius: '5px',
                                                        padding: '3px 8px',
                                                        fontSize: '10.5px',
                                                        fontWeight: 600,
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }}
                                                >
                                                    {copiedField === 'raw_copy' ? <Check size={11} color="#15803D" /> : <Copy size={11} />}
                                                    {copiedField === 'raw_copy' ? 'Copiado!' : 'Copiar Modelo'}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleCopyText(resolvedText, 'resolved_copy')}
                                                    style={{
                                                        background: copiedField === 'resolved_copy' ? '#ECFDF5' : '#F1F5F9',
                                                        border: `1px solid ${copiedField === 'resolved_copy' ? '#86EFAC' : '#CBD5E1'}`,
                                                        color: copiedField === 'resolved_copy' ? '#15803D' : '#334155',
                                                        borderRadius: '5px',
                                                        padding: '3px 8px',
                                                        fontSize: '10.5px',
                                                        fontWeight: 600,
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }}
                                                >
                                                    {copiedField === 'resolved_copy' ? <Check size={11} color="#15803D" /> : <Copy size={11} />}
                                                    {copiedField === 'resolved_copy' ? 'Copiado!' : 'Copiar Texto Final'}
                                                </button>
                                            </div>
                                        </div>
                                        <div style={{
                                            background: '#F8FAFC',
                                            border: '1px solid #E2E8F0',
                                            borderRadius: '6px',
                                            padding: '10px 12px',
                                            fontSize: '12px',
                                            lineHeight: 1.5,
                                            color: '#1E293B',
                                            whiteSpace: 'pre-wrap',
                                            maxHeight: '140px',
                                            overflowY: 'auto'
                                        }}>
                                            {sub.ad_copy || 'Sem mensagem cadastrada.'}
                                        </div>
                                    </div>

                                    {/* 2. VARIÁVEIS INDIVIDUAIS COM COPYBOARD */}
                                    <div className="glass-panel" style={{ padding: '14px 16px', borderRadius: '10px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Sparkles size={14} color="#7C3AED" />
                                                <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-main)' }}>
                                                    Variáveis Individuais ({vars.filter(v => v && v.trim()).length} preenchidas)
                                                </span>
                                            </div>
                                            {vars.some(v => v && v.trim()) && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleCopyText(vars.filter(Boolean).join('\n'), 'all_vars')}
                                                    style={{
                                                        background: copiedField === 'all_vars' ? '#ECFDF5' : '#FFFFFF',
                                                        border: '1px solid #CBD5E1',
                                                        color: copiedField === 'all_vars' ? '#15803D' : '#334155',
                                                        borderRadius: '5px',
                                                        padding: '2px 8px',
                                                        fontSize: '10.5px',
                                                        fontWeight: 600,
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }}
                                                >
                                                    {copiedField === 'all_vars' ? <Check size={11} color="#15803D" /> : <Copy size={11} />}
                                                    Copiar Todas
                                                </button>
                                            )}
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '8px' }}>
                                            {[1, 2, 3, 4, 5].map(vNum => {
                                                const val = vars[vNum - 1] || '';
                                                const fieldId = `var_${vNum}`;
                                                const isCopied = copiedField === fieldId;

                                                return (
                                                    <div key={vNum} style={{
                                                        background: '#FFFFFF',
                                                        border: '1px solid #E2E8F0',
                                                        borderRadius: '6px',
                                                        padding: '6px 10px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                        gap: '6px'
                                                    }}>
                                                        <div style={{ minWidth: 0 }}>
                                                            <span style={{ fontSize: '9.5px', fontWeight: 700, color: 'var(--primary-color)', fontFamily: 'monospace' }}>
                                                                {`{{${vNum}}}`}
                                                            </span>
                                                            <div style={{ fontSize: '11.5px', fontWeight: 600, color: val ? '#1E293B' : '#94A3B8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                {val || '— (não definida)'}
                                                            </div>
                                                        </div>
                                                        {val && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleCopyText(val, fieldId)}
                                                                style={{
                                                                    background: isCopied ? '#ECFDF5' : '#F1F5F9',
                                                                    border: 'none',
                                                                    color: isCopied ? '#15803D' : '#64748B',
                                                                    borderRadius: '4px',
                                                                    padding: '4px 6px',
                                                                    cursor: 'pointer',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '2px',
                                                                    flexShrink: 0
                                                                }}
                                                                title="Copiar Variável"
                                                            >
                                                                {isCopied ? <Check size={11} color="#15803D" /> : <Copy size={11} />}
                                                                <span style={{ fontSize: '9.5px', fontWeight: 600 }}>{isCopied ? 'OK' : 'Copiar'}</span>
                                                            </button>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* 3. PLANILHA DE CONTATOS (DOWNLOAD COM LIMITE DE 3 VEZES E AUTO-EXCLUSÃO) */}
                                    <div className="glass-panel" style={{ padding: '14px 16px', borderRadius: '10px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <FileSpreadsheet size={15} color="#16A34A" />
                                                <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-main)' }}>
                                                    Planilha de Contatos
                                                </span>
                                            </div>
                                            {!isPlanilhaExhausted && (
                                                <span style={{
                                                    fontSize: '10.5px',
                                                    fontWeight: 700,
                                                    color: downloadsRemaining === 1 ? '#DC2626' : (downloadsRemaining === 2 ? '#D97706' : '#16A34A'),
                                                    background: downloadsRemaining === 1 ? '#FEF2F2' : (downloadsRemaining === 2 ? '#FFFBEB' : '#F0FDF4'),
                                                    border: `1px solid ${downloadsRemaining === 1 ? '#FECACA' : (downloadsRemaining === 2 ? '#FDE68A' : '#BBF7D0')}`,
                                                    padding: '2px 8px',
                                                    borderRadius: '4px'
                                                }}>
                                                    {downloadsRemaining} download(s) restante(s) de 3
                                                </span>
                                            )}
                                        </div>

                                        {isPlanilhaExhausted ? (
                                            <div style={{
                                                background: '#FEF2F2',
                                                border: '1px dashed #F87171',
                                                borderRadius: '6px',
                                                padding: '10px 12px',
                                                fontSize: '11.5px',
                                                color: '#991B1B',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px'
                                            }}>
                                                <AlertCircle size={16} color="#DC2626" style={{ flexShrink: 0 }} />
                                                <div>
                                                    <strong>Planilha Excluída Permanentemente:</strong> O limite de segurança de 3 downloads foi atingido. Os contatos foram excluídos da base para proteger a privacidade dos dados.
                                                </div>
                                            </div>
                                        ) : hasContacts ? (
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '10px 12px', borderRadius: '6px', flexWrap: 'wrap' }}>
                                                <div>
                                                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#1E293B', display: 'block' }}>
                                                        {sub.fileName || 'contatos_campanha.csv'}
                                                    </span>
                                                    <span style={{ fontSize: '11px', color: '#16A34A', fontWeight: 600 }}>
                                                        ✓ {(sub.contacts?.length || sub.validCount || 0).toLocaleString('pt-BR')} contatos disponíveis
                                                    </span>
                                                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginTop: '2px' }}>
                                                        Baixada {currentDownloads} de 3 vezes. Será excluída automaticamente após o 3º download.
                                                    </span>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDownloadSpreadsheetWithLimit(sub)}
                                                    className="btn-primary"
                                                    style={{ height: '32px', padding: '0 12px', fontSize: '11.5px', gap: '6px', flexShrink: 0 }}
                                                >
                                                    <Download size={13} /> Baixar Planilha ({downloadsRemaining} restam)
                                                </button>
                                            </div>
                                        ) : (
                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', background: '#F8FAFC', padding: '10px 12px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                                                Nenhum arquivo de planilha anexado a este envio.
                                            </div>
                                        )}
                                    </div>

                                    {/* 4. MÍDIA DO CRIATIVO & FOTO DE PERFIL PARA DOWNLOAD */}
                                    <div className="glass-panel" style={{ padding: '14px 16px', borderRadius: '10px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                                            <ImageIcon size={14} color="#0284C7" />
                                            <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-main)' }}>
                                                Mídias e Anexos da Campanha
                                            </span>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
                                            {/* Creative Media */}
                                            {sub.media_url ? (
                                                <div style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#334155' }}>
                                                            Criativo: {sub.template_type}
                                                        </span>
                                                        <span style={{ fontSize: '10px', fontWeight: 700, color: '#0284C7', background: '#E0F2FE', padding: '1px 5px', borderRadius: '3px' }}>
                                                            Anexo
                                                        </span>
                                                    </div>
                                                    <div style={{ width: '100%', height: '80px', background: '#0F172A', borderRadius: '4px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        {sub.template_type === 'IMAGE' ? (
                                                            <img src={sub.media_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                        ) : (
                                                            <video src={sub.media_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                        )}
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDownloadMedia(sub.media_url!, `midia_campanha_${sub.id}.${sub.template_type === 'VIDEO' ? 'mp4' : 'jpg'}`)}
                                                        className="btn-secondary"
                                                        style={{ height: '28px', fontSize: '11px', justifyContent: 'center', gap: '4px' }}
                                                    >
                                                        <Download size={12} /> Baixar {sub.template_type === 'VIDEO' ? 'Vídeo' : 'Imagem'}
                                                    </button>
                                                </div>
                                            ) : (
                                                <div style={{ background: '#F8FAFC', border: '1px dashed #CBD5E1', borderRadius: '8px', padding: '12px', fontSize: '11.5px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <MessageSquare size={14} /> Campanha no formato texto (sem criativo de mídia).
                                                </div>
                                            )}

                                            {/* Profile Photo */}
                                            {sub.profile_photo && (
                                                <div style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#334155' }}>
                                                            Foto / Logo do Atendimento
                                                        </span>
                                                        <span style={{ fontSize: '10px', fontWeight: 700, color: '#16A34A', background: '#DCFCE7', padding: '1px 5px', borderRadius: '3px' }}>
                                                            Avatar
                                                        </span>
                                                    </div>
                                                    <div style={{ width: '48px', height: '48px', borderRadius: '50%', margin: '0 auto', overflow: 'hidden', border: '1px solid #CBD5E1' }}>
                                                        <img src={sub.profile_photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDownloadMedia(sub.profile_photo!, `perfil_${sub.profile_name || 'avatar'}.png`)}
                                                        className="btn-secondary"
                                                        style={{ height: '28px', fontSize: '11px', justifyContent: 'center', gap: '4px' }}
                                                    >
                                                        <Download size={12} /> Baixar Foto de Perfil
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* 5. LINK DO BOTÃO CTA (WHATSAPP ACESSAR LINK) */}
                                    {sub.button_link && (
                                        <div className="glass-panel" style={{ padding: '12px 16px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                                            <div style={{ minWidth: 0 }}>
                                                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>
                                                    Link do Botão CTA (WhatsApp Acessar Link):
                                                </span>
                                                <a
                                                    href={sub.button_link}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    style={{ fontSize: '12px', fontWeight: 600, color: '#0284C7', textDecoration: 'underline', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', maxWidth: '380px' }}
                                                >
                                                    {sub.button_link}
                                                </a>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => handleCopyText(sub.button_link!, 'btn_link')}
                                                    style={{
                                                        background: copiedField === 'btn_link' ? '#ECFDF5' : '#FFFFFF',
                                                        border: '1px solid #CBD5E1',
                                                        color: copiedField === 'btn_link' ? '#15803D' : '#334155',
                                                        borderRadius: '5px',
                                                        padding: '4px 8px',
                                                        fontSize: '11px',
                                                        fontWeight: 600,
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }}
                                                >
                                                    {copiedField === 'btn_link' ? <Check size={11} color="#15803D" /> : <Copy size={11} />}
                                                    {copiedField === 'btn_link' ? 'Copiado!' : 'Copiar Link'}
                                                </button>
                                                <a
                                                    href={sub.button_link}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="btn-secondary"
                                                    style={{ height: '28px', padding: '0 8px', fontSize: '11px', gap: '4px' }}
                                                >
                                                    <ExternalLink size={11} /> Testar
                                                </a>
                                            </div>
                                        </div>
                                    )}

                                </div>

                                {/* RIGHT COLUMN: REALTIME SMARTPHONE MOCKUP */}
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <Eye size={12} color="#10B981" /> Prévia em Tempo Real
                                    </span>
                                    {renderPhoneMockup(
                                        sub.profile_name,
                                        sub.profile_photo || '',
                                        sub.template_type,
                                        sub.media_url || '',
                                        sub.ad_copy,
                                        sub.button_link || '',
                                        sub.dispatch_date,
                                        sub.variables
                                    )}
                                </div>
                            </div>

                            {/* POPUP FOOTER */}
                            <div style={{
                                padding: '12px 20px',
                                borderTop: '1px solid var(--border-subtle)',
                                background: '#F8FAFC',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '10px'
                            }}>
                                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                                    ID: <strong>#{sub.id}</strong> • Criado em: {new Date(sub.timestamp || Date.now()).toLocaleDateString('pt-BR')}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            handleOpenEdit(sub);
                                            setPreviewModalSubmission(null);
                                        }}
                                        className="btn-secondary"
                                        style={{ height: '32px', padding: '0 12px', fontSize: '12px', gap: '4px' }}
                                    >
                                        <Edit3 size={12} color="#059669" /> Editar Campanha
                                    </button>
                                    {(hasContacts && !isPlanilhaExhausted) && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                onSendToDispatch(sub.contacts || [], sub.headers || ['Telefone', 'Nome'], sub.campaign_name || sub.profile_name);
                                                setPreviewModalSubmission(null);
                                            }}
                                            className="btn-primary"
                                            style={{ height: '32px', padding: '0 14px', fontSize: '12px', gap: '4px' }}
                                        >
                                            <Send size={12} /> Carregar no Disparador
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => setPreviewModalSubmission(null)}
                                        className="btn-secondary"
                                        style={{ height: '32px', padding: '0 12px', fontSize: '12px' }}
                                    >
                                        Fechar
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}

        </div>
    );
};
