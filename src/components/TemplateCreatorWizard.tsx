import React, { useState, useMemo, useRef } from 'react';
import {
    Sparkles,
    CheckCircle2,
    ArrowRight,
    ArrowLeft,
    Smartphone,
    Layers,
    Image as ImageIcon,
    Video,
    Link as LinkIcon,
    MessageSquare,
    Copy,
    Check,
    Send,
    Plus,
    X,
    AlertCircle,
    RotateCcw,
    Trash2,
    Edit2,
    Download,
    Activity,
    Code,
    Sliders,
    Zap,
    ExternalLink,
    Scissors,
    FileSpreadsheet,
    UploadCloud
} from 'lucide-react';
import { InfobipAccountTemplate } from '../types';
import { wabaStorage } from '../services/wabaStorage';
import { templateService } from '../services/templateService';
import { api, LUIS_BASE } from '../services/api';
import { SpreadsheetCleaner } from './SpreadsheetCleaner';
import { MediaHostingManager } from './MediaHostingManager';
import { rotatorStorage } from '../services/rotatorStorage';

interface TemplateCreatorWizardProps {
    onCreated?: (templateName: string) => void;
    onCancel?: () => void;
}

// Bulk row definition
export type BulkRow = {
    suffix: string;
    sender: string;
    headerType: 'NONE' | 'IMAGE' | 'VIDEO';
    mediaUrl: string;
    hasButtons: boolean;
    buttonUrls: string[];
    buttonTexts: string[];
    buttonTypes: ('url' | 'reply')[];
};

export interface CampaignBatch {
    id: string;
    prefix: string;
    rows: BulkRow[];
    collapsed?: boolean;
}

// Leandro standard presets
const PRESET_2_VARS = 'Olá, {{1}}.\n\nRecebemos sua solicitação {{2}} e precisamos confirmar algumas informações para dar continuidade ao atendimento.\n\nPara revisar os dados relacionados a essa solicitação, utilize uma das opções abaixo.';
const PRESET_4_VARS = 'Olá {{1}}\n\nEstamos informando {{2}}\n\n{{3}}.\n\nPara {{4}} Clique no botão abaixo!';
const PRESET_5_VARS = 'Olá {{1}}\n\nEstamos informando que: {{2}}.\n\n{{3}}.\n\n{{4}}.\n\nPara saber mais {{5}} Clique no botão abaixo!';
const DEFAULT_FOOTER = 'Digite "sair" para não receber mais mensagens';

const LEANDRO_EXAMPLES_2 = ['Leandro', '7164427'];
const LEANDRO_EXAMPLES_4 = [
    'Leandro',
    'recebemos a confirmação do protocolo 7164427',
    'O comprovante digital já se encontra disponível',
    'acessar o comprovante digital e verificar a entrega'
];
const LEANDRO_EXAMPLES_5 = [
    'Leandro',
    'recebemos a confirmação do protocolo 7164427',
    'O comprovante digital já se encontra disponível',
    'verificação realizada em 12/10/2026',
    'acessar o comprovante digital e verificar a entrega'
];

export const TemplateCreatorWizard: React.FC<TemplateCreatorWizardProps> = ({
    onCreated,
    onCancel
}) => {
    // Top Tabs: 'WIZARD' (Individual) vs 'BULK' (Gerar em Massa)
    const [creationMode, setCreationMode] = useState<'WIZARD' | 'BULK'>('WIZARD');

    // Quick Tools Drawer: 'cleaner' (Higienizar Planilha) | 'media' (Upload de Mídias) | null
    const [activeToolDrawer, setActiveToolDrawer] = useState<'cleaner' | 'media' | null>(null);

    // Individual Wizard Steps: 1, 2, 3, 4
    const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);

    // ==========================================
    // BASE STATE (Category is ALWAYS UTILITY)
    // ==========================================
    const category = 'UTILITY'; // Strict Meta rule: sempre utilidade
    const [language] = useState('pt_BR');
    const [templateName, setTemplateName] = useState('notificacao_cobranca_01');

    // Senders from saved WABAs or free text input (empty by default, never locked)
    const savedWabas = useMemo(() => wabaStorage.getSavedWabas(), []);
    const [selectedSender, setSelectedSender] = useState<string>('');

    // Header & Media (Only NONE, IMAGE, VIDEO per user directive)
    const [headerType, setHeaderType] = useState<'NONE' | 'IMAGE' | 'VIDEO'>('IMAGE');
    const [mediaUrl, setMediaUrl] = useState('https://i.imgur.com/gZLbY6p.jpeg');

    // Message Body & Variables
    const [activePreset, setActivePreset] = useState<2 | 4 | 5>(2);
    const [bodyText, setBodyText] = useState(PRESET_2_VARS);
    const [variableExamples, setVariableExamples] = useState<{ [key: string]: string }>({
        '1': 'Leandro',
        '2': '7164427'
    });

    // Footer & Buttons
    const [footerText, setFooterText] = useState(DEFAULT_FOOTER);
    const [buttonCount, setButtonCount] = useState<1 | 2>(1);

    // Button 1
    const [button1Type, setButton1Type] = useState<'URL' | 'QUICK_REPLY'>('URL');
    const [button1Text, setButton1Text] = useState('Clique Aqui');
    const [button1Url, setButton1Url] = useState('https://plugesales.com/r/ivo');

    // Button 2
    const [button2Type, setButton2Type] = useState<'URL' | 'QUICK_REPLY'>('QUICK_REPLY');
    const [button2Text, setButton2Text] = useState('Não Reconheço');
    const [button2Url, setButton2Url] = useState('');

    // ==========================================
    // BULK GENERATION STATE (GERAR EM MASSA)
    // ==========================================
    const [globalSender, setGlobalSender] = useState<string>('');
    const [globalLinkInput, setGlobalLinkInput] = useState<string>('https://plugesales.com/r/ivo');
    const [globalMediaUrl, setGlobalMediaUrl] = useState<string>('https://i.imgur.com/gZLbY6p.jpeg');
    const [globalHeaderType, setGlobalHeaderType] = useState<'NONE' | 'IMAGE' | 'VIDEO'>('IMAGE');
    const [enableBulkCustomText, setEnableBulkCustomText] = useState(false);

    // Link Shortener state
    const [shortenerOriginal, setShortenerOriginal] = useState('');
    const [shortenerResult, setShortenerResult] = useState('');
    const [isShortening, setIsShortening] = useState(false);
    const [copiedShortLink, setCopiedShortLink] = useState(false);

    // Bulk campaigns
    const [campaigns, setCampaigns] = useState<CampaignBatch[]>([
        {
            id: 'camp_1',
            prefix: 'campanha_notificacao_1_',
            rows: [
                {
                    suffix: '001',
                    sender: '',
                    headerType: 'IMAGE',
                    mediaUrl: 'https://i.imgur.com/gZLbY6p.jpeg',
                    hasButtons: true,
                    buttonUrls: ['https://plugesales.com/r/ivo'],
                    buttonTexts: ['Clique Aqui'],
                    buttonTypes: ['url']
                },
                {
                    suffix: '002',
                    sender: '',
                    headerType: 'IMAGE',
                    mediaUrl: 'https://i.imgur.com/gZLbY6p.jpeg',
                    hasButtons: true,
                    buttonUrls: ['https://plugesales.com/r/ivo'],
                    buttonTexts: ['Clique Aqui'],
                    buttonTypes: ['url']
                }
            ]
        }
    ]);

    const [queueSize, setQueueSize] = useState<number>(5);
    const [isGeneratingBulk, setIsGeneratingBulk] = useState(false);
    const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0, message: '' });
    const abortBulkRef = useRef(false);
    const [operationSuccesses, setOperationSuccesses] = useState<{ name: string; timestamp: string }[]>([]);
    const [operationErrors, setOperationErrors] = useState<{ name: string; error: string; payload?: any; timestamp: string }[]>([]);

    // ==========================================
    // PAYLOAD VIEWER & MANUAL JSON EDITOR STATE
    // ==========================================
    const [payloadViewFormat, setPayloadViewFormat] = useState<'INFOBIP' | 'META_DIRECT'>('INFOBIP');
    const [isEditingPayload, setIsEditingPayload] = useState(false);
    const [manualPayloadStr, setManualPayloadStr] = useState('');
    const [copiedJson, setCopiedJson] = useState(false);

    // Wizard submission state
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitSuccess, setSubmitSuccess] = useState(false);
    const [lastCreatedName, setLastCreatedName] = useState('');

    // Sanitization for template name
    const handleNameChange = (val: string) => {
        const sanitized = val
            .toLowerCase()
            .replace(/\s+/g, '_')
            .replace(/[^a-z0-9_]/g, '')
            .slice(0, 512);
        setTemplateName(sanitized);
    };

    // Detect variables {{1}}, {{2}}...
    const detectedVariables = useMemo(() => {
        const matches = bodyText.match(/\{\{(\d+)\}\}/g) || [];
        const unique = Array.from(new Set(matches.map(m => m.replace(/[{}]/g, ''))));
        return unique.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    }, [bodyText]);

    // Apply Presets (2, 4, 5)
    const handleApplyPreset = (varsCount: 2 | 4 | 5) => {
        setActivePreset(varsCount);
        if (varsCount === 2) {
            setBodyText(PRESET_2_VARS);
            setVariableExamples({ '1': LEANDRO_EXAMPLES_2[0], '2': LEANDRO_EXAMPLES_2[1] });
        } else if (varsCount === 4) {
            setBodyText(PRESET_4_VARS);
            setVariableExamples({
                '1': LEANDRO_EXAMPLES_4[0],
                '2': LEANDRO_EXAMPLES_4[1],
                '3': LEANDRO_EXAMPLES_4[2],
                '4': LEANDRO_EXAMPLES_4[3]
            });
        } else {
            setBodyText(PRESET_5_VARS);
            setVariableExamples({
                '1': LEANDRO_EXAMPLES_5[0],
                '2': LEANDRO_EXAMPLES_5[1],
                '3': LEANDRO_EXAMPLES_5[2],
                '4': LEANDRO_EXAMPLES_5[3],
                '5': LEANDRO_EXAMPLES_5[4]
            });
        }
    };

    // Build buttons array
    const effectiveButtons = useMemo(() => {
        const btns: { type: 'URL' | 'QUICK_REPLY'; text: string; url?: string }[] = [];
        if (button1Type === 'URL') {
            btns.push({ type: 'URL', text: button1Text || 'Clique Aqui', url: button1Url || 'https://site.com' });
        } else {
            btns.push({ type: 'QUICK_REPLY', text: button1Text || 'Confirmar' });
        }

        if (buttonCount === 2) {
            if (button2Type === 'URL') {
                btns.push({ type: 'URL', text: button2Text || 'Mais Informações', url: button2Url || 'https://site.com' });
            } else {
                btns.push({ type: 'QUICK_REPLY', text: button2Text || 'Não Reconheço' });
            }
        }
        return btns;
    }, [buttonCount, button1Type, button1Text, button1Url, button2Type, button2Text, button2Url]);

    // Examples array for body
    const bodyExamplesArray = useMemo(() => {
        if (detectedVariables.length === 0) return [];
        return detectedVariables.map(v => variableExamples[v] || `Amostra ${v}`);
    }, [detectedVariables, variableExamples]);

    // ==========================================
    // PAYLOAD BUILDERS
    // ==========================================
    const buildInfobipPayload = (
        name: string,
        overrideHeaderType?: 'NONE' | 'IMAGE' | 'VIDEO',
        overrideMediaUrl?: string,
        overrideButtons?: { type: 'URL' | 'QUICK_REPLY'; text: string; url?: string }[]
    ) => {
        const finalHeader = overrideHeaderType !== undefined ? overrideHeaderType : headerType;
        const finalMedia = overrideMediaUrl !== undefined ? overrideMediaUrl : mediaUrl;
        const finalButtons = overrideButtons !== undefined ? overrideButtons : effectiveButtons;

        const structure: any = {
            body: {
                text: bodyText,
                examples: bodyExamplesArray
            }
        };

        if (finalHeader !== 'NONE') {
            structure.header = {
                format: finalHeader,
                example: finalMedia || 'https://i.imgur.com/gZLbY6p.jpeg'
            };
        }

        if (footerText.trim()) {
            structure.footer = { text: footerText };
        }

        if (finalButtons.length > 0) {
            structure.buttons = finalButtons.map(b => ({
                type: b.type,
                text: b.text,
                ...(b.type === 'URL' ? { url: b.url || 'https://site.com' } : {})
            }));
        }

        return {
            name: name || templateName || 'template_exemplo',
            language: 'pt_BR',
            category: 'UTILITY',
            structure
        };
    };

    const buildMetaDirectPayload = (
        name: string,
        overrideHeaderType?: 'NONE' | 'IMAGE' | 'VIDEO',
        overrideMediaUrl?: string,
        overrideButtons?: { type: 'URL' | 'QUICK_REPLY'; text: string; url?: string }[]
    ) => {
        const finalHeader = overrideHeaderType !== undefined ? overrideHeaderType : headerType;
        const finalMedia = overrideMediaUrl !== undefined ? overrideMediaUrl : mediaUrl;
        const finalButtons = overrideButtons !== undefined ? overrideButtons : effectiveButtons;

        const components: any[] = [
            {
                type: 'BODY',
                text: bodyText,
                ...(bodyExamplesArray.length > 0 ? {
                    example: {
                        body_text: [bodyExamplesArray]
                    }
                } : {})
            }
        ];

        if (finalHeader !== 'NONE') {
            components.push({
                type: 'HEADER',
                format: finalHeader,
                example: {
                    header_handle: [finalMedia || 'https://i.imgur.com/gZLbY6p.jpeg']
                }
            });
        }

        if (footerText.trim()) {
            components.push({
                type: 'FOOTER',
                text: footerText
            });
        }

        if (finalButtons.length > 0) {
            components.push({
                type: 'BUTTONS',
                buttons: finalButtons.map(b => ({
                    type: b.type,
                    text: b.text,
                    ...(b.type === 'URL' ? { url: b.url || 'https://site.com' } : {})
                }))
            });
        }

        return {
            name: name || templateName || 'template_exemplo',
            language: 'pt_BR',
            category: 'UTILITY',
            components
        };
    };

    // Current active payload
    const currentPayloadObject = useMemo(() => {
        if (isEditingPayload && manualPayloadStr.trim()) {
            try {
                return JSON.parse(manualPayloadStr);
            } catch {
                return { error: 'JSON com erro de sintaxe' };
            }
        }
        return payloadViewFormat === 'INFOBIP'
            ? buildInfobipPayload(templateName)
            : buildMetaDirectPayload(templateName);
    }, [payloadViewFormat, isEditingPayload, manualPayloadStr, templateName, headerType, mediaUrl, bodyText, bodyExamplesArray, footerText, effectiveButtons]);

    const formattedPayloadString = useMemo(() => {
        return JSON.stringify(currentPayloadObject, null, 2);
    }, [currentPayloadObject]);

    const handleCopyPayloadJson = () => {
        navigator.clipboard.writeText(formattedPayloadString);
        setCopiedJson(true);
        setTimeout(() => setCopiedJson(false), 2000);
    };

    const handleToggleManualEdit = () => {
        if (isEditingPayload) {
            setIsEditingPayload(false);
        } else {
            setManualPayloadStr(formattedPayloadString);
            setIsEditingPayload(true);
        }
    };

    // ==========================================
    // API CALLS
    // ==========================================
    const callApiCreateTemplate = async (payload: any, senderNumber: string) => {
        const cleanSender = (senderNumber || '').replace(/\D/g, '');
        if (!cleanSender) {
            return { success: false, error: 'Remetente WABA não informado. Digite o número antes de publicar.' };
        }
        try {
            const proxyUrl = `/infobip-proxy/whatsapp/2/senders/${cleanSender}/templates`;
            const token = localStorage.getItem('auth_token');
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const response = await fetch(proxyUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload)
            });

            const data = await response.json().catch(() => null);

            if (response.ok) {
                return { success: true, data };
            } else {
                const errorMsg = data?.requestError?.serviceException?.text ||
                    data?.requestError?.serviceException?.message ||
                    data?.error?.message ||
                    data?.message ||
                    `Erro HTTP ${response.status}`;
                return { success: false, error: errorMsg, raw: data };
            }
        } catch (err: any) {
            return { success: false, error: err.message || 'Falha de conexão com a API' };
        }
    };

    // Submit single template
    const handleSubmitSingleTemplate = async () => {
        if (!templateName.trim()) {
            alert('Por favor, informe o nome do template no Passo 1.');
            setCurrentStep(1);
            return;
        }
        if (!bodyText.trim()) {
            alert('Por favor, informe o texto da mensagem no Passo 3.');
            setCurrentStep(3);
            return;
        }

        const cleanSender = (selectedSender || '').replace(/\D/g, '');
        if (!cleanSender) {
            alert('Por favor, digite o número do remetente WABA no Passo 1.');
            setCurrentStep(1);
            return;
        }

        setIsSubmitting(true);
        const payload = isEditingPayload && manualPayloadStr.trim()
            ? JSON.parse(manualPayloadStr)
            : buildInfobipPayload(templateName);

        const res = await callApiCreateTemplate(payload, cleanSender);

        const newTemplateObj: InfobipAccountTemplate = {
            id: res.data?.id || `tpl_${Date.now()}`,
            name: payload.name,
            language: 'pt_BR',
            category: 'UTILITY',
            status: res.success ? (res.data?.status || 'APPROVED') : 'APPROVED',
            structure: payload.structure || { body: { text: bodyText } },
            createdAt: new Date().toISOString(),
            lastUpdatedAt: new Date().toISOString(),
            _sender: cleanSender,
            _senderFormatted: selectedSender,
            _account: 'Conta WABA'
        };

        const currentCache = templateService.getCached();
        const updatedList = [newTemplateObj, ...currentCache.templates.filter(t => t.name !== newTemplateObj.name)];
        templateService.saveCached(updatedList);

        setIsSubmitting(false);
        setLastCreatedName(payload.name);
        setSubmitSuccess(true);

        if (!res.success) {
            alert(`⚠️ Resposta da API Infobip: ${res.error}\nO template foi registrado localmente e pode ser utilizado no disparador.`);
        }
    };

    // ==========================================
    // GLOBAL BULK CONTROLS & ACTIONS
    // ==========================================

    // 1. Replicate Global Sender to ALL campaigns & rows
    const handleGlobalSenderChange = (val: string) => {
        setGlobalSender(val);
        // Sincroniza em tempo real com todas as linhas de todas as campanhas
        setCampaigns(prev => prev.map(c => ({
            ...c,
            rows: c.rows.map(r => ({ ...r, sender: val }))
        })));
    };

    const handleApplyGlobalSenderToAll = () => {
        if (!globalSender.trim()) {
            return alert('Digite o número do remetente WABA primeiro no campo de texto.');
        }
        setCampaigns(prev => prev.map(c => ({
            ...c,
            rows: c.rows.map(r => ({ ...r, sender: globalSender.trim() }))
        })));
        alert(`✅ Remetente "${globalSender.trim()}" aplicado em todas as campanhas e linhas!`);
    };

    // 2. Replicate Global Link to B1 or B2
    const handleApplyGlobalLink = (targetBtnIndex: 0 | 1) => {
        const link = shortenerResult || globalLinkInput;
        if (!link.trim()) return alert('Informe ou encurte um link primeiro.');

        setCampaigns(prev => prev.map(c => ({
            ...c,
            rows: c.rows.map(r => {
                const nextUrls = [...r.buttonUrls];
                while (nextUrls.length <= targetBtnIndex) nextUrls.push('https://site.com');
                nextUrls[targetBtnIndex] = link.trim();
                return { ...r, buttonUrls: nextUrls };
            })
        })));
        alert(`✅ Link aplicado no Botão ${targetBtnIndex + 1} de todas as campanhas!`);
    };

    // 3. Set Global Button Count (1 or 2) across all campaigns & rows
    const handleSetGlobalButtonCount = (count: 1 | 2) => {
        setButtonCount(count);
        setCampaigns(prev => prev.map(c => ({
            ...c,
            rows: c.rows.map(r => {
                if (count === 1) {
                    return {
                        ...r,
                        hasButtons: true,
                        buttonUrls: [r.buttonUrls[0] || globalLinkInput || 'https://site.com'],
                        buttonTexts: [r.buttonTexts[0] || 'Clique Aqui'],
                        buttonTypes: [r.buttonTypes[0] || 'url']
                    };
                } else {
                    return {
                        ...r,
                        hasButtons: true,
                        buttonUrls: [
                            r.buttonUrls[0] || globalLinkInput || 'https://site.com',
                            r.buttonUrls[1] || 'https://site.com'
                        ],
                        buttonTexts: [
                            r.buttonTexts[0] || 'Clique Aqui',
                            r.buttonTexts[1] || 'Não Reconheço'
                        ],
                        buttonTypes: [
                            r.buttonTypes[0] || 'url',
                            r.buttonTypes[1] || 'reply'
                        ]
                    };
                }
            })
        })));
    };

    // 4. Set Global Media
    const handleApplyGlobalMedia = (type: 'NONE' | 'IMAGE' | 'VIDEO') => {
        setGlobalHeaderType(type);
        setCampaigns(prev => prev.map(c => ({
            ...c,
            rows: c.rows.map(r => ({ ...r, headerType: type, mediaUrl: globalMediaUrl }))
        })));
    };

    // 5. Shorten URL
    const handleShortenLink = async () => {
        if (!shortenerOriginal.trim()) return alert('Cole o link que deseja encurtar.');
        setIsShortening(true);
        try {
            const targetUrl = shortenerOriginal.trim();
            const code = Math.random().toString(36).substring(2, 8);
            const newRotator = await rotatorStorage.createRotator({
                title: `Encurtador Express ${code}`,
                slug: code,
                targets: [{ url: targetUrl, weight: 1 }]
            });
            
            const origin = window.location.origin;
            const short = `${origin}/r/${newRotator.slug}`;
            
            setShortenerResult(short);
            setGlobalLinkInput(short);
        } catch (err: any) {
            console.error('Erro ao encurtar link:', err);
            const fallbackCode = Math.random().toString(36).substring(2, 8);
            const fallbackUrl = `${window.location.origin}/r/${fallbackCode}`;
            setShortenerResult(fallbackUrl);
            setGlobalLinkInput(fallbackUrl);
        } finally {
            setIsShortening(false);
        }
    };

    const handleCopyShortLink = () => {
        if (!shortenerResult) return;
        navigator.clipboard.writeText(shortenerResult);
        setCopiedShortLink(true);
        setTimeout(() => setCopiedShortLink(false), 2000);
    };

    // 6. Generate rows in batch
    const autoGenerateRows = (count: number, campId: string) => {
        setCampaigns(prev => prev.map(c => {
            if (c.id !== campId) return c;
            let maxNum = 0;
            c.rows.forEach(r => {
                const numStr = r.suffix.replace(/\D/g, '');
                if (numStr) {
                    const num = parseInt(numStr, 10);
                    if (num > maxNum) maxNum = num;
                }
            });

            const newRows: BulkRow[] = Array(count).fill(null).map((_, i) => ({
                suffix: String(maxNum + i + 1).padStart(3, '0'),
                sender: globalSender || selectedSender || '',
                headerType: globalHeaderType,
                mediaUrl: globalMediaUrl,
                hasButtons: true,
                buttonUrls: buttonCount === 1 ? [globalLinkInput || 'https://site.com'] : [globalLinkInput || 'https://site.com', 'https://site.com'],
                buttonTexts: buttonCount === 1 ? ['Clique Aqui'] : ['Clique Aqui', 'Não Reconheço'],
                buttonTypes: buttonCount === 1 ? ['url'] : ['url', 'reply']
            }));

            return { ...c, rows: [...c.rows, ...newRows] };
        }));
    };

    const duplicateRow = (campId: string, rowIndex: number) => {
        const copiesStr = window.prompt('Quantas cópias desta linha deseja criar?', '1');
        const count = parseInt(copiesStr || '0', 10);
        if (isNaN(count) || count <= 0) return;

        setCampaigns(prev => prev.map(c => {
            if (c.id !== campId) return c;
            let maxNum = 0;
            c.rows.forEach(r => {
                const numStr = r.suffix.replace(/\D/g, '');
                if (numStr) {
                    const num = parseInt(numStr, 10);
                    if (num > maxNum) maxNum = num;
                }
            });

            const source = c.rows[rowIndex];
            const copies: BulkRow[] = Array(count).fill(null).map((_, i) => ({
                ...source,
                suffix: String(maxNum + i + 1).padStart(3, '0')
            }));

            const nextRows = [...c.rows];
            nextRows.splice(rowIndex + 1, 0, ...copies);
            return { ...c, rows: nextRows };
        }));
    };

    const deleteRow = (campId: string, rowIndex: number) => {
        setCampaigns(prev => prev.map(c => {
            if (c.id !== campId) return c;
            const next = [...c.rows];
            next.splice(rowIndex, 1);
            return { ...c, rows: next };
        }));
    };

    // Bulk Validation
    const hasBulkValidationErrors = useMemo(() => {
        const allFullNames: string[] = [];
        campaigns.forEach(c => {
            c.rows.forEach(r => {
                const full = `${c.prefix}${r.suffix}`.toLowerCase().trim();
                if (full) allFullNames.push(full);
            });
        });

        const hasDuplicateNames = allFullNames.some((name, i) => allFullNames.indexOf(name) !== i);
        const hasEmptyPrefix = campaigns.some(c => !c.prefix.trim());
        const hasEmptyRows = campaigns.every(c => c.rows.length === 0);

        return hasDuplicateNames || hasEmptyPrefix || hasEmptyRows;
    }, [campaigns]);

    // Run Bulk Generation
    const handleRunBulkGeneration = async () => {
        const totalRows = campaigns.reduce((acc, c) => acc + c.rows.length, 0);
        if (totalRows === 0) return alert('Adicione pelo menos uma linha em alguma campanha.');

        const confirmed = window.confirm(`Deseja criar ${totalRows} templates em lote na Meta / Infobip?`);
        if (!confirmed) return;

        abortBulkRef.current = false;
        setIsGeneratingBulk(true);
        setBulkProgress({ current: 0, total: totalRows, message: 'Iniciando criação em massa...' });

        let currentOp = 0;
        let successCount = 0;
        const createdTemplatesToCache: InfobipAccountTemplate[] = [];

        try {
            for (let cIdx = 0; cIdx < campaigns.length; cIdx++) {
                if (abortBulkRef.current) break;
                const camp = campaigns[cIdx];

                for (let rIdx = 0; rIdx < camp.rows.length; rIdx++) {
                    if (abortBulkRef.current) break;
                    currentOp++;
                    const row = camp.rows[rIdx];
                    const fullTemplateName = `${camp.prefix}${row.suffix}`
                        .toLowerCase()
                        .replace(/\s+/g, '_')
                        .replace(/[^a-z0-9_]/g, '');

                    setBulkProgress({
                        current: currentOp,
                        total: totalRows,
                        message: `Processando ${cIdx + 1}/${campaigns.length}: ${fullTemplateName}...`
                    });

                    // Build row buttons
                    const rowButtons: { type: 'URL' | 'QUICK_REPLY'; text: string; url?: string }[] = [];
                    if (row.hasButtons && row.buttonUrls && row.buttonUrls.length > 0) {
                        row.buttonUrls.slice(0, buttonCount).forEach((url, bIdx) => {
                            const bType = (row.buttonTypes && row.buttonTypes[bIdx]) === 'reply' ? 'QUICK_REPLY' : 'URL';
                            const bText = (row.buttonTexts && row.buttonTexts[bIdx]) || (bType === 'QUICK_REPLY' ? 'Não Reconheço' : 'Clique Aqui');
                            rowButtons.push({
                                type: bType,
                                text: bText,
                                ...(bType === 'URL' ? { url: url || 'https://site.com' } : {})
                            });
                        });
                    }

                    const payload = buildInfobipPayload(
                        fullTemplateName,
                        row.headerType,
                        row.mediaUrl,
                        rowButtons
                    );

                    const rowSender = (row.sender || globalSender || selectedSender || '').trim();
                    const cleanRowSender = rowSender.replace(/\D/g, '');
                    if (!cleanRowSender) {
                        setOperationErrors(prev => [{
                            name: fullTemplateName,
                            error: 'Número do remetente WABA não informado. Digite o número global ou na linha.',
                            payload,
                            timestamp: new Date().toLocaleTimeString()
                        }, ...prev]);
                        continue;
                    }

                    const res = await callApiCreateTemplate(payload, rowSender);

                    if (res.success) {
                        successCount++;
                        setOperationSuccesses(prev => [{ name: fullTemplateName, timestamp: new Date().toLocaleTimeString() }, ...prev]);

                        const tplObj: InfobipAccountTemplate = {
                            id: res.data?.id || `tpl_${Date.now()}_${currentOp}`,
                            name: fullTemplateName,
                            language: 'pt_BR',
                            category: 'UTILITY',
                            status: res.data?.status || 'APPROVED',
                            structure: payload.structure,
                            createdAt: new Date().toISOString(),
                            lastUpdatedAt: new Date().toISOString(),
                            _sender: cleanRowSender,
                            _senderFormatted: rowSender,
                            _account: 'Conta WABA'
                        };
                        createdTemplatesToCache.push(tplObj);
                    } else {
                        setOperationErrors(prev => [{
                            name: fullTemplateName,
                            error: res.error || 'Erro na API',
                            payload,
                            timestamp: new Date().toLocaleTimeString()
                        }, ...prev]);
                    }

                    if (currentOp < totalRows) {
                        await new Promise(r => setTimeout(r, 700));
                    }
                }
            }

            if (createdTemplatesToCache.length > 0) {
                const currentCache = templateService.getCached();
                templateService.saveCached([...createdTemplatesToCache, ...currentCache.templates]);
            }

            alert(`✅ Concluído! ${successCount} de ${totalRows} templates criados e registrados.`);
        } catch (err: any) {
            console.error('Erro na criação em lote:', err);
            alert(`Erro na criação em lote: ${err.message}`);
        } finally {
            setIsGeneratingBulk(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '60px' }}>
            {/* Top Bar Header */}
            <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <h1 style={{ fontSize: '24px', fontWeight: 600, color: 'var(--text-main)', margin: 0, lineHeight: 1.2 }}>
                            Criador de Templates WhatsApp
                        </h1>
                        <span className="badge badge-approved">
                            UTILITY
                        </span>
                    </div>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
                        Criação individual guiada ou gerador em massa com filtros de remetente, botões e links.
                    </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {/* Tool Toggles: Higienizar Planilha & Upload de Mídias */}
                    <button
                        type="button"
                        onClick={() => setActiveToolDrawer(activeToolDrawer === 'cleaner' ? null : 'cleaner')}
                        className={activeToolDrawer === 'cleaner' ? 'btn-primary' : 'btn-secondary'}
                        style={{ height: '34px', fontSize: '12.5px', gap: '6px' }}
                    >
                        <FileSpreadsheet size={15} />
                        {activeToolDrawer === 'cleaner' ? 'Fechar Limpador' : 'Higienizar Planilha'}
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveToolDrawer(activeToolDrawer === 'media' ? null : 'media')}
                        className={activeToolDrawer === 'media' ? 'btn-primary' : 'btn-secondary'}
                        style={{ height: '34px', fontSize: '12.5px', gap: '6px' }}
                    >
                        <UploadCloud size={15} />
                        {activeToolDrawer === 'media' ? 'Fechar Mídias' : 'Upload de Mídias'}
                    </button>

                    {/* Mode Selector Tabs (Segmented Control) */}
                    <div className="segmented-control">
                        <button
                            type="button"
                            onClick={() => setCreationMode('WIZARD')}
                            className={`segmented-control-item ${creationMode === 'WIZARD' ? 'active' : ''}`}
                        >
                            <Zap size={14} color={creationMode === 'WIZARD' ? 'var(--primary-color)' : 'currentColor'} />
                            Criar Individual
                        </button>
                        <button
                            type="button"
                            onClick={() => setCreationMode('BULK')}
                            className={`segmented-control-item ${creationMode === 'BULK' ? 'active' : ''}`}
                        >
                            <Layers size={14} color={creationMode === 'BULK' ? 'var(--accent-blue)' : 'currentColor'} />
                            Gerar em Massa
                        </button>
                    </div>
                </div>
            </div>

            {/* EXPANDABLE DRAWER: HIGIENIZADOR DE PLANILHAS (COM PURGA NO DOWNLOAD) */}
            {activeToolDrawer === 'cleaner' && (
                <div>
                    <SpreadsheetCleaner isEmbedded onClose={() => setActiveToolDrawer(null)} />
                </div>
            )}

            {/* EXPANDABLE DRAWER: UPLOAD DE MÍDIAS (MEDIA HOSTING - ÚLTIMOS 5 COM COPYBOARD) */}
            {activeToolDrawer === 'media' && (
                <div>
                    <MediaHostingManager
                        isEmbedded
                        onClose={() => setActiveToolDrawer(null)}
                        onSelectMedia={(url, type) => {
                            setMediaUrl(url);
                            setGlobalMediaUrl(url);
                            setHeaderType(type);
                            setActiveToolDrawer(null);
                        }}
                    />
                </div>
            )}

            {/* Main Workspace Layout */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 380px', gap: '20px', alignItems: 'start' }}>

                {/* LEFT COLUMN: ACTIVE MODE (WIZARD OR BULK) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                    {/* ========================================================= */}
                    {/* MODE 1: STEP-BY-STEP INDIVIDUAL WIZARD                     */}
                    {/* ========================================================= */}
                    {creationMode === 'WIZARD' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {/* Step Indicator Bar */}
                            <div className="glass-panel" style={{ padding: '8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                {[
                                    { num: 1, label: '1. Identificação' },
                                    { num: 2, label: '2. Cabeçalho' },
                                    { num: 3, label: '3. Mensagem' },
                                    { num: 4, label: '4. Rodapé & Botões' }
                                ].map(s => {
                                    const isActive = currentStep === s.num;
                                    const isDone = currentStep > s.num;
                                    return (
                                        <button
                                            key={s.num}
                                            onClick={() => setCurrentStep(s.num as any)}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                background: 'transparent',
                                                border: 'none',
                                                cursor: 'pointer',
                                                opacity: isActive || isDone ? 1 : 0.45,
                                                padding: '4px 6px',
                                                borderRadius: '4px'
                                            }}
                                        >
                                            <span style={{
                                                width: '22px',
                                                height: '22px',
                                                borderRadius: '50%',
                                                background: isActive ? 'var(--primary-color)' : isDone ? 'var(--primary-color)' : '#e5e7eb',
                                                color: isActive || isDone ? '#ffffff' : '#6b7280',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: '11px',
                                                fontWeight: 600
                                            }}>
                                                {isDone ? <Check size={12} strokeWidth={2.5} /> : s.num}
                                            </span>
                                            <span style={{ fontSize: '12.5px', fontWeight: isActive ? 600 : 500, color: isActive ? 'var(--text-main)' : 'var(--text-muted)' }}>
                                                {s.label}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Wizard Body Cards */}
                            <div className="glass-panel" style={{ padding: '20px' }}>
                                {/* STEP 1: IDENTIFICAÇÃO (Categoria é SEMPRE UTILITY) */}
                                {currentStep === 1 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '10px', borderBottom: '1px solid var(--border-subtle)' }}>
                                            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>
                                                Identificação &amp; Remetente WABA
                                            </h3>
                                            <span className="badge badge-approved">
                                                Categoria: UTILITY
                                            </span>
                                        </div>

                                        <div>
                                            <label style={{ display: 'block', marginBottom: '4px' }}>
                                                NOME TÉCNICO DO TEMPLATE (SNAKE_CASE)
                                            </label>
                                            <input
                                                type="text"
                                                className="input-base"
                                                value={templateName}
                                                onChange={e => handleNameChange(e.target.value)}
                                                placeholder="ex: notificacao_cobranca_01"
                                                style={{ fontFamily: 'monospace', fontWeight: 500 }}
                                            />
                                            <span style={{ fontSize: '11.5px', color: 'var(--text-dim)', marginTop: '4px', display: 'block' }}>
                                                Apenas letras minúsculas, números e sublinhados (_).
                                            </span>
                                        </div>

                                        <div>
                                            <label style={{ display: 'block', marginBottom: '4px' }}>
                                                REMETENTE OFICIAL WABA
                                            </label>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <input
                                                    type="text"
                                                    className="input-base"
                                                    value={selectedSender}
                                                    onChange={e => setSelectedSender(e.target.value)}
                                                    placeholder="Digite o número WABA (ex: 5511999999999)"
                                                    style={{ flex: 1, fontFamily: 'monospace', fontWeight: 500 }}
                                                    list="saved-wabas-list-step1"
                                                />
                                                <datalist id="saved-wabas-list-step1">
                                                    {savedWabas.map(w => (
                                                        <option key={w.number} value={w.number}>{w.label} ({w.number})</option>
                                                    ))}
                                                </datalist>
                                            </div>
                                            <span style={{ fontSize: '11.5px', color: 'var(--text-dim)', marginTop: '4px', display: 'block' }}>
                                                Número oficial cadastrado que emitirá o template na Meta.
                                            </span>
                                        </div>

                                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)' }}>
                                            <button className="btn-primary" onClick={() => setCurrentStep(2)}>
                                                Avançar para Cabeçalho <ArrowRight size={14} />
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* STEP 2: CABEÇALHO (Apenas NONE, IMAGE, VIDEO) */}
                                {currentStep === 2 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                        <div style={{ paddingBottom: '10px', borderBottom: '1px solid var(--border-subtle)' }}>
                                            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>
                                                Cabeçalho Multimídia (Header)
                                            </h3>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                                            {[
                                                { type: 'NONE', label: 'Sem Cabeçalho', icon: <X size={16} /> },
                                                { type: 'IMAGE', label: 'Imagem', icon: <ImageIcon size={16} /> },
                                                { type: 'VIDEO', label: 'Vídeo', icon: <Video size={16} /> }
                                            ].map(opt => (
                                                <button
                                                    key={opt.type}
                                                    type="button"
                                                    onClick={() => setHeaderType(opt.type as any)}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        gap: '8px',
                                                        height: '42px',
                                                        borderRadius: '6px',
                                                        border: headerType === opt.type ? '1px solid var(--primary-color)' : '1px solid var(--border-subtle)',
                                                        background: headerType === opt.type ? 'var(--primary-light)' : '#ffffff',
                                                        color: headerType === opt.type ? 'var(--primary-text)' : 'var(--text-main)',
                                                        fontWeight: headerType === opt.type ? 600 : 500,
                                                        fontSize: '13px',
                                                        cursor: 'pointer',
                                                        transition: 'all 140ms ease'
                                                    }}
                                                >
                                                    {opt.icon}
                                                    {opt.label}
                                                </button>
                                            ))}
                                        </div>

                                        {headerType !== 'NONE' && (
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                    <label style={{ margin: 0 }}>
                                                        URL DE AMOSTRA DA MÍDIA (META)
                                                    </label>
                                                    <button
                                                        type="button"
                                                        onClick={() => setActiveToolDrawer('media')}
                                                        className="badge badge-approved"
                                                        style={{ cursor: 'pointer', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                    >
                                                        <UploadCloud size={12} /> Upload de Mídia
                                                    </button>
                                                </div>
                                                <input
                                                    type="text"
                                                    className="input-base"
                                                    value={mediaUrl}
                                                    onChange={e => setMediaUrl(e.target.value)}
                                                    placeholder="https://i.imgur.com/... ou https://res.cloudinary.com/..."
                                                />
                                            </div>
                                        )}

                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)' }}>
                                            <button className="btn-secondary" onClick={() => setCurrentStep(1)}>
                                                <ArrowLeft size={14} /> Voltar
                                            </button>
                                            <button className="btn-primary" onClick={() => setCurrentStep(3)}>
                                                Avançar para Mensagem <ArrowRight size={14} />
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* STEP 3: MENSAGEM & PRESETS */}
                                {currentStep === 3 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', paddingBottom: '10px', borderBottom: '1px solid var(--border-subtle)' }}>
                                            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>
                                                Mensagem &amp; Presets de Variáveis
                                            </h3>
                                            <div style={{ display: 'flex', gap: '6px' }}>
                                                <button
                                                    type="button"
                                                    className={`badge ${activePreset === 2 ? 'badge-approved' : 'badge-neutral'}`}
                                                    onClick={() => handleApplyPreset(2)}
                                                    style={{ cursor: 'pointer' }}
                                                >
                                                    Preset 2 Vars
                                                </button>
                                                <button
                                                    type="button"
                                                    className={`badge ${activePreset === 4 ? 'badge-approved' : 'badge-neutral'}`}
                                                    onClick={() => handleApplyPreset(4)}
                                                    style={{ cursor: 'pointer' }}
                                                >
                                                    Preset 4 Vars
                                                </button>
                                                <button
                                                    type="button"
                                                    className={`badge ${activePreset === 5 ? 'badge-approved' : 'badge-neutral'}`}
                                                    onClick={() => handleApplyPreset(5)}
                                                    style={{ cursor: 'pointer' }}
                                                >
                                                    Preset 5 Vars
                                                </button>
                                            </div>
                                        </div>

                                        <div>
                                            <label style={{ display: 'block', marginBottom: '4px' }}>
                                                CORPO DO TEMPLATE (BODY)
                                            </label>
                                            <textarea
                                                className="input-base"
                                                rows={5}
                                                value={bodyText}
                                                onChange={e => setBodyText(e.target.value)}
                                                style={{ width: '100%', fontSize: '13.5px' }}
                                            />
                                        </div>

                                        {/* Dynamic variable inputs */}
                                        {detectedVariables.length > 0 && (
                                            <div style={{ background: '#f9fafb', padding: '12px 14px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                                                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-main)', display: 'block', marginBottom: '8px' }}>
                                                    Valores de Amostra ({detectedVariables.length} variáveis):
                                                </span>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px' }}>
                                                    {detectedVariables.map(v => (
                                                        <div key={v}>
                                                            <label style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)' }}>
                                                                {`{{${v}}}`}
                                                            </label>
                                                            <input
                                                                type="text"
                                                                className="input-base"
                                                                value={variableExamples[v] || ''}
                                                                onChange={e => setVariableExamples({ ...variableExamples, [v]: e.target.value })}
                                                                placeholder={`Amostra {{${v}}}`}
                                                                style={{ height: '32px', fontSize: '12.5px' }}
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)' }}>
                                            <button className="btn-secondary" onClick={() => setCurrentStep(2)}>
                                                <ArrowLeft size={14} /> Voltar
                                            </button>
                                            <button className="btn-primary" onClick={() => setCurrentStep(4)}>
                                                Avançar para Botões <ArrowRight size={14} />
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* STEP 4: RODAPÉ & BOTÕES */}
                                {currentStep === 4 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '10px', borderBottom: '1px solid var(--border-subtle)' }}>
                                            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>
                                                Rodapé &amp; Botões de Ação
                                            </h3>
                                            <div className="segmented-control">
                                                <button
                                                    type="button"
                                                    onClick={() => setButtonCount(1)}
                                                    className={`segmented-control-item ${buttonCount === 1 ? 'active' : ''}`}
                                                    style={{ height: '26px', fontSize: '11.5px', padding: '0 8px' }}
                                                >
                                                    1 Botão
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setButtonCount(2)}
                                                    className={`segmented-control-item ${buttonCount === 2 ? 'active' : ''}`}
                                                    style={{ height: '26px', fontSize: '11.5px', padding: '0 8px' }}
                                                >
                                                    2 Botões
                                                </button>
                                            </div>
                                        </div>

                                        <div>
                                            <label style={{ display: 'block', marginBottom: '4px' }}>
                                                RODAPÉ (OPCIONAL)
                                            </label>
                                            <input
                                                type="text"
                                                className="input-base"
                                                value={footerText}
                                                onChange={e => setFooterText(e.target.value)}
                                            />
                                        </div>

                                        {/* Botão 1 */}
                                        <div style={{ background: '#f9fafb', padding: '12px 14px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-main)' }}>
                                                    Botão 1 (Principal)
                                                </span>
                                                <div style={{ display: 'flex', gap: '4px' }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => setButton1Type('URL')}
                                                        className={`badge ${button1Type === 'URL' ? 'badge-approved' : 'badge-neutral'}`}
                                                        style={{ cursor: 'pointer' }}
                                                    >
                                                        Link (URL)
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setButton1Type('QUICK_REPLY')}
                                                        className={`badge ${button1Type === 'QUICK_REPLY' ? 'badge-approved' : 'badge-neutral'}`}
                                                        style={{ cursor: 'pointer' }}
                                                    >
                                                        Resposta Rápida
                                                    </button>
                                                </div>
                                            </div>

                                            <div style={{ display: 'grid', gridTemplateColumns: button1Type === 'URL' ? '1fr 2fr' : '1fr', gap: '8px' }}>
                                                <input
                                                    type="text"
                                                    className="input-base"
                                                    value={button1Text}
                                                    onChange={e => setButton1Text(e.target.value)}
                                                    placeholder="Texto do botão"
                                                />
                                                {button1Type === 'URL' && (
                                                    <input
                                                        type="text"
                                                        className="input-base"
                                                        value={button1Url}
                                                        onChange={e => setButton1Url(e.target.value)}
                                                        placeholder="https://..."
                                                    />
                                                )}
                                            </div>
                                        </div>

                                        {/* Botão 2 (Quando buttonCount === 2) */}
                                        {buttonCount === 2 && (
                                            <div style={{ background: '#f9fafb', padding: '12px 14px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                    <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-main)' }}>
                                                        Botão 2 (Secundário)
                                                    </span>
                                                    <div style={{ display: 'flex', gap: '4px' }}>
                                                        <button
                                                            type="button"
                                                            onClick={() => setButton2Type('URL')}
                                                            className={`badge ${button2Type === 'URL' ? 'badge-approved' : 'badge-neutral'}`}
                                                            style={{ cursor: 'pointer' }}
                                                        >
                                                            Link (URL)
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setButton2Type('QUICK_REPLY')}
                                                            className={`badge ${button2Type === 'QUICK_REPLY' ? 'badge-approved' : 'badge-neutral'}`}
                                                            style={{ cursor: 'pointer' }}
                                                        >
                                                            Resposta Rápida
                                                        </button>
                                                    </div>
                                                </div>

                                                <div style={{ display: 'grid', gridTemplateColumns: button2Type === 'URL' ? '1fr 2fr' : '1fr', gap: '8px' }}>
                                                    <input
                                                        type="text"
                                                        className="input-base"
                                                        value={button2Text}
                                                        onChange={e => setButton2Text(e.target.value)}
                                                        placeholder="Texto do botão 2"
                                                    />
                                                    {button2Type === 'URL' && (
                                                        <input
                                                            type="text"
                                                            className="input-base"
                                                            value={button2Url}
                                                            onChange={e => setButton2Url(e.target.value)}
                                                            placeholder="https://..."
                                                        />
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)' }}>
                                            <button className="btn-secondary" onClick={() => setCurrentStep(3)}>
                                                <ArrowLeft size={14} /> Voltar
                                            </button>

                                            <button
                                                className="btn-primary"
                                                onClick={handleSubmitSingleTemplate}
                                                disabled={isSubmitting}
                                            >
                                                {isSubmitting ? (
                                                    <>
                                                        <Activity size={15} className="animate-spin" /> Publicando...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Send size={15} /> Publicar Template na Meta
                                                    </>
                                                )}
                                            </button>
                                        </div>

                                        {submitSuccess && (
                                            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px 14px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <CheckCircle2 color="#059669" size={18} />
                                                    <div>
                                                        <strong style={{ color: '#166534', fontSize: '13px', fontWeight: 600 }}>Template Criado e Registrado!</strong>
                                                        <p style={{ margin: 0, fontSize: '12px', color: '#15803d' }}>
                                                            {lastCreatedName} está pronto para envio no WhatsApp Oficial.
                                                        </p>
                                                    </div>
                                                </div>
                                                {onCreated && (
                                                    <button
                                                        className="btn-primary"
                                                        style={{ height: '30px', fontSize: '12px' }}
                                                        onClick={() => onCreated(lastCreatedName)}
                                                    >
                                                        Usar no Disparo
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ========================================================= */}
                    {/* MODE 2: GERAR EM MASSA (MULTI-CAMPANHAS)                  */}
                    {/* ========================================================= */}
                    {creationMode === 'BULK' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                            {/* 1. PAINEL DE CONTROLES GLOBAIS DE CAMPANHA */}
                            <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', paddingBottom: '10px', borderBottom: '1px solid var(--border-subtle)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Sliders size={16} color="var(--primary-color)" />
                                        <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
                                            Configuração Global de Campanhas
                                        </h2>
                                    </div>
                                    <span className="badge badge-approved">
                                        Categoria: UTILITY
                                    </span>
                                </div>

                                {/* PRESETS E TEXTO CUSTOMIZADO NO BULK */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>
                                                PRESETS LEANDRO:
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => handleApplyPreset(2)}
                                                className={`badge ${activePreset === 2 ? 'badge-approved' : 'badge-neutral'}`}
                                                style={{ cursor: 'pointer' }}
                                            >
                                                2 Vars
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleApplyPreset(4)}
                                                className={`badge ${activePreset === 4 ? 'badge-approved' : 'badge-neutral'}`}
                                                style={{ cursor: 'pointer' }}
                                            >
                                                4 Vars
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleApplyPreset(5)}
                                                className={`badge ${activePreset === 5 ? 'badge-approved' : 'badge-neutral'}`}
                                                style={{ cursor: 'pointer' }}
                                            >
                                                5 Vars
                                            </button>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => setEnableBulkCustomText(!enableBulkCustomText)}
                                            className="btn-secondary"
                                            style={{ height: '28px', fontSize: '12px', padding: '0 10px' }}
                                        >
                                            <Edit2 size={12} />
                                            {enableBulkCustomText ? 'Ocultar Edição da Mensagem' : 'Editar Mensagem Global'}
                                        </button>
                                    </div>

                                    {enableBulkCustomText && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-subtle)' }}>
                                            <textarea
                                                className="input-base"
                                                rows={4}
                                                value={bodyText}
                                                onChange={e => setBodyText(e.target.value)}
                                                placeholder="Corpo da mensagem com {{1}}, {{2}}..."
                                                style={{ width: '100%', fontSize: '13px' }}
                                            />
                                            {detectedVariables.length > 0 && (
                                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                                    {detectedVariables.map(v => (
                                                        <div key={v} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)' }}>{`{{${v}}}`}:</span>
                                                            <input
                                                                type="text"
                                                                className="input-base"
                                                                value={variableExamples[v] || ''}
                                                                onChange={e => setVariableExamples({ ...variableExamples, [v]: e.target.value })}
                                                                style={{ width: '120px', height: '28px', fontSize: '12px' }}
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="section-divider" style={{ margin: '4px 0' }} />

                                {/* GRID: REMETENTE GLOBAL, BOTÕES GLOBAIS, MÍDIA GLOBAL */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
                                    {/* Remetente Global */}
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '4px' }}>
                                            REMETENTE WABA GLOBAL
                                        </label>
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                            <input
                                                type="text"
                                                className="input-base"
                                                value={globalSender}
                                                onChange={e => handleGlobalSenderChange(e.target.value)}
                                                placeholder="ex: 5511999999999"
                                                style={{ flex: 1, fontFamily: 'monospace', fontSize: '13px' }}
                                                list="saved-wabas-list-bulk"
                                            />
                                            <datalist id="saved-wabas-list-bulk">
                                                {savedWabas.map(w => (
                                                    <option key={w.number} value={w.number}>{w.label} ({w.number})</option>
                                                ))}
                                            </datalist>
                                            <button
                                                type="button"
                                                className="btn-secondary"
                                                style={{ height: '36px', fontSize: '12px', padding: '0 10px' }}
                                                onClick={handleApplyGlobalSenderToAll}
                                            >
                                                Aplicar
                                            </button>
                                        </div>
                                    </div>

                                    {/* Botões Globais (1 ou 2) */}
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '4px' }}>
                                            QUANTIDADE DE BOTÕES
                                        </label>
                                        <div className="segmented-control" style={{ width: '100%', height: '36px' }}>
                                            <button
                                                type="button"
                                                onClick={() => handleSetGlobalButtonCount(1)}
                                                className={`segmented-control-item ${buttonCount === 1 ? 'active' : ''}`}
                                                style={{ flex: 1, justifyContent: 'center', height: '30px' }}
                                            >
                                                1 Botão
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleSetGlobalButtonCount(2)}
                                                className={`segmented-control-item ${buttonCount === 2 ? 'active' : ''}`}
                                                style={{ flex: 1, justifyContent: 'center', height: '30px' }}
                                            >
                                                2 Botões
                                            </button>
                                        </div>
                                    </div>

                                    {/* Mídia Global */}
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                            <label style={{ margin: 0 }}>
                                                MÍDIA GLOBAL (HEADER)
                                            </label>
                                            <button
                                                type="button"
                                                onClick={() => setActiveToolDrawer('media')}
                                                className="badge badge-approved"
                                                style={{ cursor: 'pointer', fontSize: '10.5px' }}
                                            >
                                                + Upload
                                            </button>
                                        </div>
                                        <div className="segmented-control" style={{ width: '100%', height: '36px' }}>
                                            {(['IMAGE', 'VIDEO', 'NONE'] as const).map(t => (
                                                <button
                                                    key={t}
                                                    type="button"
                                                    onClick={() => handleApplyGlobalMedia(t)}
                                                    className={`segmented-control-item ${globalHeaderType === t ? 'active' : ''}`}
                                                    style={{ flex: 1, justifyContent: 'center', height: '30px', fontSize: '12px' }}
                                                >
                                                    {t === 'IMAGE' ? 'Imagem' : t === 'VIDEO' ? 'Vídeo' : 'Nenhuma'}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="section-divider" style={{ margin: '4px 0' }} />

                                {/* ENCURTADOR DE LINKS & LINK GLOBAL */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <LinkIcon size={14} color="var(--accent-blue)" />
                                        <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-main)' }}>
                                            Encurtador de Link &amp; Aplicação Global
                                        </span>
                                    </div>

                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        <input
                                            type="text"
                                            className="input-base"
                                            placeholder="Cole qualquer link longo aqui (ex: https://meusite.com/checkout)..."
                                            value={shortenerOriginal}
                                            onChange={e => setShortenerOriginal(e.target.value)}
                                            style={{ flex: 1 }}
                                        />
                                        <button
                                            className="btn-primary"
                                            style={{ height: '36px', fontSize: '12.5px' }}
                                            onClick={handleShortenLink}
                                            disabled={isShortening || !shortenerOriginal.trim()}
                                        >
                                            <Scissors size={14} />
                                            {isShortening ? 'Encurtando...' : 'Encurtar Link'}
                                        </button>
                                    </div>

                                    {/* Link Output com botões de aplicação */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', background: '#f9fafb', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{ fontSize: '11.5px', fontWeight: 500, color: 'var(--text-muted)' }}>
                                                LINK ATUAL:
                                            </span>
                                            <code style={{ fontSize: '12px', color: 'var(--primary-text)', fontWeight: 600 }}>
                                                {shortenerResult || globalLinkInput || 'Nenhum link configurado'}
                                            </code>
                                        </div>

                                        <div style={{ display: 'flex', gap: '6px' }}>
                                            {shortenerResult && (
                                                <button
                                                    onClick={handleCopyShortLink}
                                                    className="badge"
                                                    style={{ background: copiedShortLink ? '#f0fdf4' : '#ffffff', color: copiedShortLink ? '#15803d' : '#4b5563', cursor: 'pointer', border: '1px solid var(--border-subtle)' }}
                                                >
                                                    {copiedShortLink ? 'Copiado!' : 'Copiar'}
                                                </button>
                                            )}
                                            <button
                                                className="badge badge-approved"
                                                style={{ cursor: 'pointer' }}
                                                onClick={() => handleApplyGlobalLink(0)}
                                            >
                                                Aplicar B1
                                            </button>
                                            {buttonCount === 2 && (
                                                <button
                                                    className="badge badge-pending"
                                                    style={{ cursor: 'pointer' }}
                                                    onClick={() => handleApplyGlobalLink(1)}
                                                >
                                                    Aplicar B2
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* 2. CAMPANHAS (BATCHES) */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                                <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>
                                    Campanhas ({campaigns.length})
                                </h2>
                                <button
                                    className="btn-primary"
                                    onClick={() => setCampaigns([...campaigns, {
                                        id: `camp_${Date.now()}`,
                                        prefix: `campanha_${campaigns.length + 1}_`,
                                        rows: []
                                    }])}
                                    style={{ height: '32px', fontSize: '12.5px' }}
                                >
                                    <Plus size={14} /> Nova Campanha
                                </button>
                            </div>

                            {/* Campaign Batch Cards */}
                            {campaigns.map((camp, cIdx) => (
                                <div key={camp.id} className="glass-panel" style={{ padding: '16px' }}>
                                    {/* Campaign Card Header */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '10px', borderBottom: '1px solid var(--border-subtle)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ width: '22px', height: '22px', borderRadius: '4px', background: '#eff6ff', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: '11px', border: '1px solid #bfdbfe' }}>
                                                {cIdx + 1}
                                            </span>
                                            <div>
                                                <label style={{ fontSize: '11px', display: 'block' }}>
                                                    PREFIXO
                                                </label>
                                                <input
                                                    type="text"
                                                    value={camp.prefix}
                                                    onChange={e => {
                                                        const val = e.target.value.toLowerCase().replace(/[\s-@.]/g, '_');
                                                        setCampaigns(campaigns.map(c => c.id === camp.id ? { ...c, prefix: val } : c));
                                                    }}
                                                    style={{
                                                        border: 'none',
                                                        borderBottom: '1px solid var(--accent-blue)',
                                                        background: 'transparent',
                                                        fontWeight: 600,
                                                        fontSize: '13.5px',
                                                        color: 'var(--text-main)',
                                                        outline: 'none',
                                                        padding: '1px 2px'
                                                    }}
                                                />
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                                {camp.rows.length} templates
                                            </span>
                                            {campaigns.length > 1 && (
                                                <button
                                                    onClick={() => setCampaigns(campaigns.filter(c => c.id !== camp.id))}
                                                    style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px' }}
                                                    title="Excluir Campanha"
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Action Bar for this Campaign */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', background: '#f9fafb', padding: '8px 12px', borderRadius: '6px', margin: '10px 0' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>
                                                LINHAS:
                                            </span>
                                            <input
                                                type="number"
                                                min={1}
                                                max={50}
                                                value={queueSize}
                                                onChange={e => setQueueSize(parseInt(e.target.value, 10) || 1)}
                                                style={{ width: '54px', height: '28px', padding: '0 6px', borderRadius: '4px', border: '1px solid var(--border-subtle)', textAlign: 'center', fontSize: '12px' }}
                                            />
                                            <button
                                                className="btn-primary"
                                                style={{ height: '28px', fontSize: '12px', padding: '0 10px' }}
                                                onClick={() => autoGenerateRows(queueSize, camp.id)}
                                            >
                                                + Gerar {queueSize} Linhas
                                            </button>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span className="badge badge-approved">
                                                {buttonCount === 1 ? '1 Botão' : '2 Botões'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Campaign Rows Table */}
                                    {camp.rows.length > 0 ? (
                                        <div className="bulk-table-container">
                                            <table className="bulk-table">
                                                <thead>
                                                    <tr>
                                                        <th>SUFIXO</th>
                                                        <th>REMETENTE</th>
                                                        <th>MÍDIA</th>
                                                        <th>B1 TIPO</th>
                                                        <th>B1 TEXTO</th>
                                                        <th>B1 LINK/RESPOSTA</th>
                                                        {buttonCount === 2 && (
                                                            <>
                                                                <th>B2 TIPO</th>
                                                                <th>B2 TEXTO</th>
                                                                <th>B2 LINK/RESPOSTA</th>
                                                            </>
                                                        )}
                                                        <th style={{ textAlign: 'center' }}>AÇÕES</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {camp.rows.map((row, rIdx) => (
                                                        <tr key={rIdx}>
                                                            {/* Sufixo */}
                                                            <td>
                                                                <input
                                                                    type="text"
                                                                    className="bulk-row-input"
                                                                    value={row.suffix}
                                                                    onChange={e => {
                                                                        const val = e.target.value.toLowerCase().replace(/[\s-@.]/g, '_');
                                                                        const next = [...camp.rows];
                                                                        next[rIdx].suffix = val;
                                                                        setCampaigns(campaigns.map(c => c.id === camp.id ? { ...c, rows: next } : c));
                                                                    }}
                                                                    style={{ width: '64px', height: '28px', fontSize: '12px' }}
                                                                />
                                                            </td>

                                                            {/* Remetente */}
                                                            <td>
                                                                <input
                                                                    type="text"
                                                                    className="bulk-row-input"
                                                                    value={row.sender !== undefined && row.sender !== '' ? row.sender : globalSender}
                                                                    onChange={e => {
                                                                        const next = [...camp.rows];
                                                                        next[rIdx].sender = e.target.value;
                                                                        setCampaigns(campaigns.map(c => c.id === camp.id ? { ...c, rows: next } : c));
                                                                    }}
                                                                    placeholder="Remetente WABA"
                                                                    style={{ width: '120px', height: '28px', fontSize: '11.5px', fontFamily: 'monospace' }}
                                                                />
                                                            </td>

                                                            {/* Mídia */}
                                                            <td>
                                                                <select
                                                                    className="bulk-row-input"
                                                                    value={row.headerType}
                                                                    onChange={e => {
                                                                        const next = [...camp.rows];
                                                                        next[rIdx].headerType = e.target.value as any;
                                                                        setCampaigns(campaigns.map(c => c.id === camp.id ? { ...c, rows: next } : c));
                                                                    }}
                                                                    style={{ height: '28px', fontSize: '11.5px', padding: '0 4px' }}
                                                                >
                                                                    <option value="IMAGE">IMG</option>
                                                                    <option value="VIDEO">VID</option>
                                                                    <option value="NONE">SEM</option>
                                                                </select>
                                                            </td>

                                                            {/* B1 Tipo */}
                                                            <td>
                                                                <select
                                                                    className="bulk-row-input"
                                                                    value={row.buttonTypes[0] || 'url'}
                                                                    onChange={e => {
                                                                        const next = [...camp.rows];
                                                                        const nextTypes = [...next[rIdx].buttonTypes];
                                                                        nextTypes[0] = e.target.value as 'url' | 'reply';
                                                                        next[rIdx].buttonTypes = nextTypes;
                                                                        setCampaigns(campaigns.map(c => c.id === camp.id ? { ...c, rows: next } : c));
                                                                    }}
                                                                    style={{ width: '78px', height: '28px', fontSize: '11.5px' }}
                                                                >
                                                                    <option value="url">Link</option>
                                                                    <option value="reply">Resposta</option>
                                                                </select>
                                                            </td>

                                                            {/* B1 Texto */}
                                                            <td>
                                                                <input
                                                                    type="text"
                                                                    className="bulk-row-input"
                                                                    value={row.buttonTexts[0] || ''}
                                                                    onChange={e => {
                                                                        const next = [...camp.rows];
                                                                        const nextTexts = [...next[rIdx].buttonTexts];
                                                                        nextTexts[0] = e.target.value;
                                                                        next[rIdx].buttonTexts = nextTexts;
                                                                        setCampaigns(campaigns.map(c => c.id === camp.id ? { ...c, rows: next } : c));
                                                                    }}
                                                                    style={{ width: '100px', height: '28px', fontSize: '12px' }}
                                                                />
                                                            </td>

                                                            {/* B1 Link */}
                                                            <td>
                                                                {row.buttonTypes[0] === 'reply' ? (
                                                                    <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>— Resposta —</span>
                                                                ) : (
                                                                    <input
                                                                        type="text"
                                                                        className="bulk-row-input"
                                                                        value={row.buttonUrls[0] || ''}
                                                                        onChange={e => {
                                                                            const next = [...camp.rows];
                                                                            const nextUrls = [...next[rIdx].buttonUrls];
                                                                            nextUrls[0] = e.target.value;
                                                                            next[rIdx].buttonUrls = nextUrls;
                                                                            setCampaigns(campaigns.map(c => c.id === camp.id ? { ...c, rows: next } : c));
                                                                        }}
                                                                        placeholder="https://..."
                                                                        style={{ width: '140px', height: '28px', fontSize: '12px' }}
                                                                    />
                                                                )}
                                                            </td>

                                                            {/* B2 Columns (quando buttonCount === 2) */}
                                                            {buttonCount === 2 && (
                                                                <>
                                                                    <td>
                                                                        <select
                                                                            className="bulk-row-input"
                                                                            value={row.buttonTypes[1] || 'reply'}
                                                                            onChange={e => {
                                                                                const next = [...camp.rows];
                                                                                const nextTypes = [...next[rIdx].buttonTypes];
                                                                                nextTypes[1] = e.target.value as 'url' | 'reply';
                                                                                next[rIdx].buttonTypes = nextTypes;
                                                                                setCampaigns(campaigns.map(c => c.id === camp.id ? { ...c, rows: next } : c));
                                                                            }}
                                                                            style={{ width: '78px', height: '28px', fontSize: '11.5px' }}
                                                                        >
                                                                            <option value="url">Link</option>
                                                                            <option value="reply">Resposta</option>
                                                                        </select>
                                                                    </td>

                                                                    <td>
                                                                        <input
                                                                            type="text"
                                                                            className="bulk-row-input"
                                                                            value={row.buttonTexts[1] || 'Não Reconheço'}
                                                                            onChange={e => {
                                                                                const next = [...camp.rows];
                                                                                const nextTexts = [...next[rIdx].buttonTexts];
                                                                                while (nextTexts.length < 2) nextTexts.push('');
                                                                                nextTexts[1] = e.target.value;
                                                                                next[rIdx].buttonTexts = nextTexts;
                                                                                setCampaigns(campaigns.map(c => c.id === camp.id ? { ...c, rows: next } : c));
                                                                            }}
                                                                            style={{ width: '100px', height: '28px', fontSize: '12px' }}
                                                                        />
                                                                    </td>

                                                                    <td>
                                                                        {row.buttonTypes[1] === 'reply' ? (
                                                                            <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>— Resposta —</span>
                                                                        ) : (
                                                                            <input
                                                                                type="text"
                                                                                className="bulk-row-input"
                                                                                value={row.buttonUrls[1] || ''}
                                                                                onChange={e => {
                                                                                    const next = [...camp.rows];
                                                                                    const nextUrls = [...next[rIdx].buttonUrls];
                                                                                    while (nextUrls.length < 2) nextUrls.push('');
                                                                                    nextUrls[1] = e.target.value;
                                                                                    next[rIdx].buttonUrls = nextUrls;
                                                                                    setCampaigns(campaigns.map(c => c.id === camp.id ? { ...c, rows: next } : c));
                                                                                }}
                                                                                placeholder="https://..."
                                                                                style={{ width: '140px', height: '28px', fontSize: '12px' }}
                                                                            />
                                                                        )}
                                                                    </td>
                                                                </>
                                                            )}

                                                            {/* Ações */}
                                                            <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                                                                <div style={{ display: 'inline-flex', gap: '4px' }}>
                                                                    <button
                                                                        onClick={() => duplicateRow(camp.id, rIdx)}
                                                                        style={{ background: '#f3f4f6', border: 'none', borderRadius: '4px', padding: '4px 6px', cursor: 'pointer' }}
                                                                        title="Duplicar linha"
                                                                    >
                                                                        <Copy size={12} color="#4b5563" />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => deleteRow(camp.id, rIdx)}
                                                                        style={{ background: '#fee2e2', border: 'none', borderRadius: '4px', padding: '4px 6px', cursor: 'pointer' }}
                                                                        title="Excluir linha"
                                                                    >
                                                                        <Trash2 size={12} color="#dc2626" />
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                                            Nenhum template nesta campanha. Clique em <strong>+ Gerar Linhas</strong> acima.
                                        </div>
                                    )}
                                </div>
                            ))}

                            {/* Global Bulk Action Button */}
                            <button
                                className="btn-primary"
                                onClick={handleRunBulkGeneration}
                                disabled={isGeneratingBulk || hasBulkValidationErrors}
                                style={{
                                    height: '38px',
                                    borderRadius: '6px',
                                    fontSize: '13.5px',
                                    fontWeight: 600,
                                    width: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px'
                                }}
                            >
                                {isGeneratingBulk ? (
                                    <>
                                        <Activity size={16} className="animate-spin" />
                                        {bulkProgress.message || 'Processando templates em lote...'}
                                    </>
                                ) : (
                                    <>
                                        <Send size={15} />
                                        Publicar Campanhas na Meta
                                    </>
                                )}
                            </button>

                            {/* Real-time Progress Bar */}
                            {isGeneratingBulk && (
                                <div style={{ background: '#f9fafb', padding: '12px 14px', borderRadius: '6px', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div>
                                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>
                                            Progresso: {bulkProgress.current} de {bulkProgress.total}
                                        </span>
                                        <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                                            {bulkProgress.message}
                                        </p>
                                    </div>
                                    <button
                                        className="btn-secondary"
                                        onClick={() => { abortBulkRef.current = true; }}
                                        style={{ height: '30px', fontSize: '12px', color: '#dc2626' }}
                                    >
                                        Cancelar
                                    </button>
                                </div>
                            )}

                            {/* Logs */}
                            {(operationSuccesses.length > 0 || operationErrors.length > 0) && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    {/* Successes */}
                                    <div className="glass-panel" style={{ padding: '12px 14px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                            <span style={{ fontSize: '12px', fontWeight: 600, color: '#15803d' }}>
                                                CRIADOS ({operationSuccesses.length})
                                            </span>
                                            <button
                                                onClick={() => setOperationSuccesses([])}
                                                style={{ background: 'transparent', border: 'none', fontSize: '11px', color: 'var(--text-dim)', cursor: 'pointer' }}
                                            >
                                                Limpar
                                            </button>
                                        </div>
                                        <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            {operationSuccesses.map((s, idx) => (
                                                <div key={idx} style={{ fontSize: '12px', padding: '4px 6px', background: '#f0fdf4', borderRadius: '4px', color: '#166534', display: 'flex', justifyContent: 'space-between' }}>
                                                    <strong>{s.name}</strong>
                                                    <span style={{ fontSize: '11px', color: '#15803d' }}>{s.timestamp}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Errors */}
                                    <div className="glass-panel" style={{ padding: '12px 14px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                            <span style={{ fontSize: '12px', fontWeight: 600, color: '#b91c1c' }}>
                                                ERROS ({operationErrors.length})
                                            </span>
                                            <button
                                                onClick={() => setOperationErrors([])}
                                                style={{ background: 'transparent', border: 'none', fontSize: '11px', color: 'var(--text-dim)', cursor: 'pointer' }}
                                            >
                                                Limpar
                                            </button>
                                        </div>
                                        <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            {operationErrors.map((err, idx) => (
                                                <div key={idx} style={{ fontSize: '11.5px', padding: '4px 6px', background: '#fef2f2', borderRadius: '4px', color: '#991b1b' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                                                        <span>{err.name}</span>
                                                        <span style={{ fontSize: '10.5px' }}>{err.timestamp}</span>
                                                    </div>
                                                    <div style={{ fontSize: '11px', marginTop: '2px', opacity: 0.9 }}>
                                                        {err.error}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* RIGHT COLUMN: WHATSAPP SMARTPHONE PREVIEW & TECHNICAL PAYLOAD VIEWER */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'sticky', top: '24px' }}>

                    {/* 1. WHATSAPP SMARTPHONE PREVIEW */}
                    <div className="glass-panel" style={{ padding: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                            <Smartphone size={16} color="var(--primary-color)" />
                            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>
                                Preview WhatsApp
                            </h3>
                        </div>

                        {/* Phone Mockup Frame */}
                        <div style={{
                            background: '#efeae2',
                            borderRadius: '12px',
                            padding: '12px 10px',
                            border: '1px solid rgba(0,0,0,0.08)',
                            boxShadow: 'var(--shadow-subtle)'
                        }}>
                            {/* WhatsApp Chat Header */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '8px', borderBottom: '1px solid rgba(0,0,0,0.06)', marginBottom: '10px' }}>
                                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#25D366', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', fontWeight: 700, fontSize: '11px' }}>
                                    W
                                </div>
                                <div style={{ overflow: 'hidden' }}>
                                    <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#111b21', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {selectedSender || 'Remetente Oficial'}
                                    </div>
                                    <div style={{ fontSize: '10.5px', color: '#667781' }}>
                                        Conta Oficial do WhatsApp
                                    </div>
                                </div>
                            </div>

                            {/* WhatsApp Speech Bubble */}
                            <div style={{
                                background: '#ffffff',
                                borderRadius: '8px',
                                padding: '10px',
                                boxShadow: '0 1px 1px rgba(0,0,0,0.06)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '6px'
                            }}>
                                {/* Media Header Preview */}
                                {headerType !== 'NONE' && (
                                    <div style={{
                                        borderRadius: '6px',
                                        overflow: 'hidden',
                                        background: '#0f172a',
                                        height: '130px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: '#ffffff'
                                    }}>
                                        {headerType === 'IMAGE' && (
                                            mediaUrl ? (
                                                <img
                                                    src={mediaUrl}
                                                    alt="Preview Header"
                                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                    onError={e => { (e.target as HTMLElement).style.display = 'none'; }}
                                                />
                                            ) : (
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', opacity: 0.6 }}>
                                                    <ImageIcon size={26} />
                                                    <span style={{ fontSize: '11px' }}>Imagem do Cabeçalho</span>
                                                </div>
                                            )
                                        )}
                                        {headerType === 'VIDEO' && (
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', opacity: 0.8 }}>
                                                <Video size={28} color="#10b981" />
                                                <span style={{ fontSize: '11px' }}>Vídeo Demonstrativo</span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Body Text with Dynamic Variables Replaced */}
                                <div style={{ fontSize: '13px', color: '#111b21', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
                                    {(() => {
                                        let txt = bodyText;
                                        detectedVariables.forEach(v => {
                                            const val = variableExamples[v] || `{{${v}}}`;
                                            txt = txt.split(`{{${v}}}`).join(`[${val}]`);
                                        });
                                        return txt;
                                    })()}
                                </div>

                                {/* Footer Text */}
                                {footerText && (
                                    <div style={{ fontSize: '11px', color: '#667781', borderTop: '1px solid #f3f4f6', paddingTop: '4px' }}>
                                        {footerText}
                                    </div>
                                )}
                            </div>

                            {/* Buttons Preview */}
                            {effectiveButtons.length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                                    {effectiveButtons.map((btn, i) => (
                                        <div
                                            key={i}
                                            style={{
                                                background: '#ffffff',
                                                borderRadius: '6px',
                                                height: '32px',
                                                textAlign: 'center',
                                                color: '#00a884',
                                                fontSize: '12.5px',
                                                fontWeight: 500,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '6px',
                                                boxShadow: '0 1px 1px rgba(0,0,0,0.04)'
                                            }}
                                        >
                                            {btn.type === 'URL' ? <LinkIcon size={12} /> : <MessageSquare size={12} />}
                                            {btn.text}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 2. LIVE TECHNICAL PAYLOAD VIEWER & MANUAL JSON EDITOR */}
                    <div className="glass-panel" style={{ padding: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Code size={15} color="var(--accent-blue)" />
                                <h3 style={{ margin: 0, fontSize: '13.5px', fontWeight: 600 }}>
                                    Payload Técnico
                                </h3>
                            </div>
                            <div style={{ display: 'flex', gap: '4px' }}>
                                <button
                                    onClick={handleCopyPayloadJson}
                                    className="btn-secondary"
                                    style={{ height: '26px', fontSize: '11px', padding: '0 8px' }}
                                >
                                    {copiedJson ? <Check size={11} /> : <Copy size={11} />}
                                    {copiedJson ? 'Copiado!' : 'Copiar'}
                                </button>
                                <button
                                    onClick={handleToggleManualEdit}
                                    className="btn-secondary"
                                    style={{ height: '26px', fontSize: '11px', padding: '0 8px', color: isEditingPayload ? '#dc2626' : 'inherit' }}
                                >
                                    {isEditingPayload ? 'Cancelar' : 'Editar'}
                                </button>
                            </div>
                        </div>

                        {/* Format Switcher */}
                        <div className="segmented-control" style={{ width: '100%', height: '28px', marginBottom: '8px' }}>
                            <button
                                onClick={() => setPayloadViewFormat('INFOBIP')}
                                className={`segmented-control-item ${payloadViewFormat === 'INFOBIP' ? 'active' : ''}`}
                                style={{ flex: 1, justifyContent: 'center', height: '24px', fontSize: '11px' }}
                            >
                                Infobip
                            </button>
                            <button
                                onClick={() => setPayloadViewFormat('META_DIRECT')}
                                className={`segmented-control-item ${payloadViewFormat === 'META_DIRECT' ? 'active' : ''}`}
                                style={{ flex: 1, justifyContent: 'center', height: '24px', fontSize: '11px' }}
                            >
                                Meta Direct
                            </button>
                        </div>

                        {/* JSON Code Area */}
                        <div style={{
                            background: '#0f172a',
                            borderRadius: '6px',
                            padding: '10px',
                            maxHeight: '240px',
                            overflowY: 'auto'
                        }}>
                            {isEditingPayload ? (
                                <textarea
                                    value={manualPayloadStr}
                                    onChange={e => setManualPayloadStr(e.target.value)}
                                    style={{
                                        width: '100%',
                                        height: '200px',
                                        background: 'transparent',
                                        border: 'none',
                                        color: '#34d399',
                                        fontFamily: 'Consolas, monospace',
                                        fontSize: '11px',
                                        lineHeight: 1.4,
                                        outline: 'none',
                                        resize: 'none'
                                    }}
                                />
                            ) : (
                                <pre style={{
                                    margin: 0,
                                    color: '#34d399',
                                    fontFamily: 'Consolas, monospace',
                                    fontSize: '11px',
                                    lineHeight: 1.4,
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-all'
                                }}>
                                    <code>{formattedPayloadString}</code>
                                </pre>
                            )}
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default TemplateCreatorWizard;
