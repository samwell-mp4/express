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
    FileText,
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
    ChevronDown,
    ChevronRight,
    Download,
    Activity,
    Code,
    Sliders,
    Zap
} from 'lucide-react';
import { InfobipAccountTemplate } from '../types';
import { wabaStorage } from '../services/wabaStorage';
import { templateService } from '../services/templateService';
import { api, LUIS_KEY, LUIS_BASE } from '../services/api';

interface TemplateCreatorWizardProps {
    onCreated?: (templateName: string) => void;
    onCancel?: () => void;
}

// Bulk row and campaign definitions
export type BulkRow = {
    suffix: string;
    sender: string;
    headerType: 'TEXT' | 'IMAGE' | 'VIDEO';
    mediaUrl: string;
    hasButtons: boolean;
    buttonUrls: string[];
    buttonTexts: string[];
    buttonTypes: ('url' | 'reply')[];
    originalButtonUrls?: string[];
    variables?: string[];
};

export interface CampaignBatch {
    id: string;
    prefix: string;
    rows: BulkRow[];
    collapsed?: boolean;
}

// Leandro standard presets from plugesales-app
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
    // Mode Switcher: 'WIZARD' (Individual ágil) vs 'BULK' (Gerar em massa)
    const [creationMode, setCreationMode] = useState<'WIZARD' | 'BULK'>('WIZARD');

    // Individual Wizard Steps: 1, 2, 3, 4
    const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);

    // ==========================================
    // BASE STATE (SHARED)
    // ==========================================
    const [templateName, setTemplateName] = useState('notificacao_cobranca_01');
    const [category, setCategory] = useState<'UTILITY' | 'MARKETING'>('UTILITY');
    const [language, setLanguage] = useState('pt_BR');

    // Senders list from saved WABAs
    const savedWabas = useMemo(() => wabaStorage.getSavedWabas(), []);
    const [selectedSender, setSelectedSender] = useState<string>(() => {
        return savedWabas.length > 0 ? savedWabas[0].number : '15559321381';
    });

    // Header & Media
    const [headerType, setHeaderType] = useState<'NONE' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'TEXT'>('IMAGE');
    const [mediaUrl, setMediaUrl] = useState('https://i.imgur.com/gZLbY6p.jpeg');
    const [headerText, setHeaderText] = useState('');

    // Message Body & Variables
    const [bodyText, setBodyText] = useState(PRESET_2_VARS);
    const [variableExamples, setVariableExamples] = useState<{ [key: string]: string }>({
        '1': 'Leandro',
        '2': '7164427'
    });

    // Footer & Buttons
    const [footerText, setFooterText] = useState(DEFAULT_FOOTER);
    const [buttonType, setButtonType] = useState<'NONE' | 'URL' | 'QUICK_REPLY'>('URL');
    const [buttonText, setButtonText] = useState('Clique Aqui');
    const [buttonUrl, setButtonUrl] = useState('https://plugesales.com/r/ivo');
    const [quickReplyText, setQuickReplyText] = useState('Não Reconheço');

    // Second button (optional)
    const [hasSecondButton, setHasSecondButton] = useState(false);
    const [button2Type, setButton2Type] = useState<'URL' | 'QUICK_REPLY'>('QUICK_REPLY');
    const [button2Text, setButton2Text] = useState('Não Reconheço');
    const [button2Url, setButton2Url] = useState('');

    // ==========================================
    // BULK GENERATION STATE (GERAR EM MASSA)
    // ==========================================
    const [campaigns, setCampaigns] = useState<CampaignBatch[]>([
        {
            id: 'camp_1',
            prefix: 'campanha_notificacao_1_',
            rows: [
                {
                    suffix: '001',
                    sender: selectedSender,
                    headerType: 'IMAGE',
                    mediaUrl: 'https://i.imgur.com/gZLbY6p.jpeg',
                    hasButtons: true,
                    buttonUrls: ['https://plugesales.com/r/ivo'],
                    buttonTexts: ['Clique Aqui'],
                    buttonTypes: ['url']
                },
                {
                    suffix: '002',
                    sender: selectedSender,
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
    const [currentPageByCampaign, setCurrentPageByCampaign] = useState<{ [campId: string]: number }>({});
    const rowsPerPage = 10;

    // Link Shortener state for bulk
    const [shortenerOriginal, setShortenerOriginal] = useState('');
    const [shortenerResult, setShortenerResult] = useState('');
    const [isShortening, setIsShortening] = useState(false);

    // Bulk execution & progress
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

    // Submission states
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

    // Detect variables {{1}}, {{2}}
    const detectedVariables = useMemo(() => {
        const matches = bodyText.match(/\{\{(\d+)\}\}/g) || [];
        const unique = Array.from(new Set(matches.map(m => m.replace(/[{}]/g, ''))));
        return unique.sort((a, b) => parseInt(a) - parseInt(b));
    }, [bodyText]);

    const handleInsertVariable = (num: number) => {
        const tag = `{{${num}}}`;
        setBodyText(prev => prev + ' ' + tag);
        if (!variableExamples[String(num)]) {
            setVariableExamples(prev => ({
                ...prev,
                [String(num)]: `Exemplo ${num}`
            }));
        }
    };

    const handleApplyPreset = (varsCount: 2 | 4 | 5) => {
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

    // Build buttons array for individual mode
    const effectiveButtons = useMemo(() => {
        const btns: { type: 'URL' | 'QUICK_REPLY'; text: string; url?: string }[] = [];
        if (buttonType === 'URL') {
            btns.push({ type: 'URL', text: buttonText || 'Clique Aqui', url: buttonUrl || 'https://site.com' });
        } else if (buttonType === 'QUICK_REPLY') {
            btns.push({ type: 'QUICK_REPLY', text: quickReplyText || 'Não Reconheço' });
        }
        if (hasSecondButton) {
            if (button2Type === 'URL') {
                btns.push({ type: 'URL', text: button2Text || 'Mais Informações', url: button2Url || 'https://site.com' });
            } else {
                btns.push({ type: 'QUICK_REPLY', text: button2Text || 'Cancelar' });
            }
        }
        return btns;
    }, [buttonType, buttonText, buttonUrl, quickReplyText, hasSecondButton, button2Type, button2Text, button2Url]);

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
        overrideHeaderType?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'NONE',
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

        if (finalHeader !== 'NONE' && finalHeader !== 'TEXT') {
            structure.header = {
                format: finalHeader,
                example: finalMedia || 'https://i.imgur.com/gZLbY6p.jpeg'
            };
        } else if (finalHeader === 'TEXT' && headerText) {
            structure.header = {
                format: 'TEXT',
                text: headerText
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
            language: language || 'pt_BR',
            category: category || 'UTILITY',
            structure
        };
    };

    const buildMetaDirectPayload = (
        name: string,
        overrideHeaderType?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'NONE',
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

        if (finalHeader !== 'NONE' && finalHeader !== 'TEXT') {
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
            language: language || 'pt_BR',
            category: category || 'UTILITY',
            components
        };
    };

    // Current active payload calculated dynamically
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
    }, [payloadViewFormat, isEditingPayload, manualPayloadStr, templateName, headerType, mediaUrl, headerText, bodyText, bodyExamplesArray, footerText, effectiveButtons, language, category]);

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
    // API CALLS (INFOBIP & META DIRECT)
    // ==========================================
    const callApiCreateTemplate = async (payload: any, senderNumber: string) => {
        const cleanSender = senderNumber.replace(/\D/g, '') || '15559321381';
        try {
            const proxyUrl = `/infobip-proxy/whatsapp/2/senders/${cleanSender}/templates`;
            const directUrl = `https://${LUIS_BASE}/whatsapp/2/senders/${cleanSender}/templates`;

            let response: Response;
            try {
                response = await fetch(proxyUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `App ${LUIS_KEY}`,
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });
            } catch {
                response = await fetch(directUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `App ${LUIS_KEY}`,
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });
            }

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

    // Submit single template from Wizard
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

        setIsSubmitting(true);
        const payload = isEditingPayload && manualPayloadStr.trim()
            ? JSON.parse(manualPayloadStr)
            : buildInfobipPayload(templateName);

        const cleanSender = selectedSender.replace(/\D/g, '') || '15559321381';

        const res = await callApiCreateTemplate(payload, cleanSender);

        const newTemplateObj: InfobipAccountTemplate = {
            id: res.data?.id || `tpl_${Date.now()}`,
            name: payload.name,
            language: payload.language,
            category: payload.category,
            status: res.success ? (res.data?.status || 'APPROVED') : 'APPROVED', // fallback to approved so it is usable immediately
            structure: payload.structure || { body: { text: bodyText } },
            createdAt: new Date().toISOString(),
            lastUpdatedAt: new Date().toISOString(),
            _sender: cleanSender,
            _senderFormatted: selectedSender,
            _account: 'BM do Luiz'
        };

        const currentCache = templateService.getCached();
        const updatedList = [newTemplateObj, ...currentCache.templates.filter(t => t.name !== newTemplateObj.name)];
        templateService.saveCached(updatedList);

        setIsSubmitting(false);
        setLastCreatedName(payload.name);
        setSubmitSuccess(true);

        if (!res.success) {
            alert(`⚠️ Aviso da API Infobip: ${res.error}\nO template foi salvo no cache local e já está disponível para envio na BM do Luiz.`);
        }
    };

    // ==========================================
    // BULK CAMPAIGN ACTIONS (MULTI-GERADOR)
    // ==========================================
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
                sender: c.rows[0]?.sender || selectedSender,
                headerType: (headerType === 'NONE' ? 'TEXT' : headerType) as 'TEXT' | 'IMAGE' | 'VIDEO',
                mediaUrl: mediaUrl || 'https://i.imgur.com/gZLbY6p.jpeg',
                hasButtons: buttonType !== 'NONE',
                buttonUrls: [buttonUrl || 'https://plugesales.com/r/ivo'],
                buttonTexts: [buttonText || 'Clique Aqui'],
                buttonTypes: [(buttonType === 'QUICK_REPLY' ? 'reply' : 'url') as 'url' | 'reply']
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

    const applySenderToAllRows = (campId: string, sender: string) => {
        setCampaigns(prev => prev.map(c => {
            if (c.id !== campId) return c;
            return {
                ...c,
                rows: c.rows.map(r => ({ ...r, sender }))
            };
        }));
    };

    const applySenderToAllCampaigns = () => {
        setCampaigns(prev => prev.map(c => ({
            ...c,
            rows: c.rows.map(r => ({ ...r, sender: selectedSender }))
        })));
    };

    const setCampaignButtonCount = (btnCount: 1 | 2, campId: string) => {
        setCampaigns(prev => prev.map(c => {
            if (c.id !== campId) return c;
            return {
                ...c,
                rows: c.rows.map(r => {
                    if (btnCount === 1) {
                        return {
                            ...r,
                            hasButtons: true,
                            buttonUrls: [r.buttonUrls[0] || 'https://site.com'],
                            buttonTexts: [r.buttonTexts[0] || 'Clique Aqui'],
                            buttonTypes: [r.buttonTypes[0] || 'url']
                        };
                    } else {
                        return {
                            ...r,
                            hasButtons: true,
                            buttonUrls: [r.buttonUrls[0] || 'https://site.com', r.buttonUrls[1] || 'https://site.com'],
                            buttonTexts: [r.buttonTexts[0] || 'Clique Aqui', r.buttonTexts[1] || 'Não Reconheço'],
                            buttonTypes: [r.buttonTypes[0] || 'url', r.buttonTypes[1] || 'reply']
                        };
                    }
                })
            };
        }));
    };

    const handleShortenLink = async () => {
        if (!shortenerOriginal.trim()) return alert('Cole um link para encurtar.');
        setIsShortening(true);
        try {
            const short = await api.shortenUrl(shortenerOriginal.trim());
            if (short) {
                setShortenerResult(short);
            } else {
                setShortenerResult(shortenerOriginal.trim());
            }
        } catch {
            setShortenerResult(shortenerOriginal.trim());
        } finally {
            setIsShortening(false);
        }
    };

    const applyShortUrlToAll = (btnIndex: number) => {
        if (!shortenerResult) return alert('Encurte um link primeiro.');
        setCampaigns(prev => prev.map(c => ({
            ...c,
            rows: c.rows.map(r => {
                const nextUrls = [...r.buttonUrls];
                nextUrls[btnIndex] = shortenerResult;
                return { ...r, buttonUrls: nextUrls };
            })
        })));
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

    // Execute Bulk Generation
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
                        message: `Processando Campanha ${cIdx + 1}/${campaigns.length}: ${fullTemplateName}...`
                    });

                    // Build row buttons
                    const rowButtons: { type: 'URL' | 'QUICK_REPLY'; text: string; url?: string }[] = [];
                    if (row.hasButtons && row.buttonUrls && row.buttonUrls.length > 0) {
                        row.buttonUrls.forEach((url, bIdx) => {
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

                    const rowSender = row.sender || selectedSender;
                    const res = await callApiCreateTemplate(payload, rowSender);

                    if (res.success) {
                        successCount++;
                        setOperationSuccesses(prev => [{ name: fullTemplateName, timestamp: new Date().toLocaleTimeString() }, ...prev]);

                        const tplObj: InfobipAccountTemplate = {
                            id: res.data?.id || `tpl_${Date.now()}_${currentOp}`,
                            name: fullTemplateName,
                            language: payload.language,
                            category: payload.category,
                            status: res.data?.status || 'APPROVED',
                            structure: payload.structure,
                            createdAt: new Date().toISOString(),
                            lastUpdatedAt: new Date().toISOString(),
                            _sender: rowSender.replace(/\D/g, ''),
                            _senderFormatted: rowSender,
                            _account: 'BM do Luiz'
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

                    // Gentle delay between API calls to avoid rate limits
                    if (currentOp < totalRows) {
                        await new Promise(r => setTimeout(r, 800));
                    }
                }
            }

            if (createdTemplatesToCache.length > 0) {
                const currentCache = templateService.getCached();
                templateService.saveCached([...createdTemplatesToCache, ...currentCache.templates]);
            }

            alert(`✅ Concluído! ${successCount} de ${totalRows} templates foram processados e registrados.`);
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
            <div className="glass-panel" style={{ padding: '24px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#ecfdf5', color: '#059669', padding: '4px 12px', borderRadius: '999px', fontSize: '11px', fontWeight: 800, marginBottom: '6px' }}>
                        <Sparkles size={13} /> HUB DE CRIAÇÃO META WABA
                    </div>
                    <h1 style={{ fontSize: '1.65rem', fontWeight: 900, color: 'var(--text-main)', margin: 0 }}>
                        Criador de Templates WhatsApp
                    </h1>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                        Criação individual guiada em passos ou gerador em massa multi-campanhas com visualizador de payload em tempo real.
                    </p>
                </div>

                {/* Mode Selector Tabs */}
                <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '14px', border: '1px solid var(--border-subtle)' }}>
                    <button
                        onClick={() => setCreationMode('WIZARD')}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '10px 18px',
                            borderRadius: '10px',
                            border: 'none',
                            fontSize: '0.82rem',
                            fontWeight: 800,
                            cursor: 'pointer',
                            background: creationMode === 'WIZARD' ? '#ffffff' : 'transparent',
                            color: creationMode === 'WIZARD' ? '#0f172a' : '#64748b',
                            boxShadow: creationMode === 'WIZARD' ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
                            transition: 'all 0.2s'
                        }}
                    >
                        <Zap size={16} color={creationMode === 'WIZARD' ? '#10b981' : '#64748b'} />
                        CRIAR INDIVIDUAL (WIZARD)
                    </button>
                    <button
                        onClick={() => setCreationMode('BULK')}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '10px 18px',
                            borderRadius: '10px',
                            border: 'none',
                            fontSize: '0.82rem',
                            fontWeight: 800,
                            cursor: 'pointer',
                            background: creationMode === 'BULK' ? '#ffffff' : 'transparent',
                            color: creationMode === 'BULK' ? '#0f172a' : '#64748b',
                            boxShadow: creationMode === 'BULK' ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
                            transition: 'all 0.2s'
                        }}
                    >
                        <Layers size={16} color={creationMode === 'BULK' ? '#3b82f6' : '#64748b'} />
                        GERAR EM MASSA (MULTI-CAMPANHAS)
                    </button>
                </div>
            </div>

            {/* Main Workspace Layout: Left Content, Right Live Phone & Payload */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 420px', gap: '24px', alignItems: 'start' }}>

                {/* LEFT COLUMN: ACTIVE MODE (WIZARD OR BULK) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                    {/* ========================================================= */}
                    {/* MODE 1: STEP-BY-STEP INDIVIDUAL WIZARD                     */}
                    {/* ========================================================= */}
                    {creationMode === 'WIZARD' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            {/* Step Indicator Bar */}
                            <div className="glass-panel" style={{ padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                                                gap: '8px',
                                                background: 'transparent',
                                                border: 'none',
                                                cursor: 'pointer',
                                                opacity: isActive || isDone ? 1 : 0.5
                                            }}
                                        >
                                            <span style={{
                                                width: '26px',
                                                height: '26px',
                                                borderRadius: '50%',
                                                background: isActive ? '#10b981' : isDone ? '#059669' : '#e2e8f0',
                                                color: isActive || isDone ? '#ffffff' : '#64748b',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: '12px',
                                                fontWeight: 900
                                            }}>
                                                {isDone ? <Check size={14} /> : s.num}
                                            </span>
                                            <span style={{ fontSize: '0.85rem', fontWeight: isActive ? 900 : 700, color: isActive ? 'var(--text-main)' : 'var(--text-muted)' }}>
                                                {s.label}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Wizard Body Cards */}
                            <div className="glass-panel" style={{ padding: '24px' }}>
                                {/* STEP 1 */}
                                {currentStep === 1 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                                        <h3 style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--text-main)', margin: 0 }}>
                                            Passo 1: Identificação & Remetente WABA
                                        </h3>

                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '6px' }}>
                                                NOME TÉCNICO DO TEMPLATE (SNAKE_CASE)
                                            </label>
                                            <input
                                                type="text"
                                                className="input-base"
                                                value={templateName}
                                                onChange={e => handleNameChange(e.target.value)}
                                                placeholder="ex: notificacao_cobranca_01"
                                                style={{ width: '100%', fontFamily: 'monospace', fontWeight: 700 }}
                                            />
                                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                                                Apenas letras minúsculas, números e sublinhados (_).
                                            </span>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '6px' }}>
                                                    CATEGORIA META
                                                </label>
                                                <select
                                                    className="input-base"
                                                    value={category}
                                                    onChange={e => setCategory(e.target.value as any)}
                                                    style={{ width: '100%', fontWeight: 700 }}
                                                >
                                                    <option value="UTILITY">UTILIDADE (UTILITY) - Alta taxa de aprovação</option>
                                                    <option value="MARKETING">MARKETING - Promoções e vendas</option>
                                                </select>
                                            </div>

                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '6px' }}>
                                                    REMETENTE WABA
                                                </label>
                                                <select
                                                    className="input-base"
                                                    value={selectedSender}
                                                    onChange={e => setSelectedSender(e.target.value)}
                                                    style={{ width: '100%', fontWeight: 700 }}
                                                >
                                                    {savedWabas.length > 0 ? (
                                                        savedWabas.map(w => (
                                                            <option key={w.number} value={w.number}>
                                                                {w.label} ({w.number})
                                                            </option>
                                                        ))
                                                    ) : (
                                                        <option value="15559321381">BM do Luiz (+1 555-932-1381)</option>
                                                    )}
                                                </select>
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                                            <button className="btn-primary" onClick={() => setCurrentStep(2)}>
                                                Avançar para Cabeçalho <ArrowRight size={16} />
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* STEP 2 */}
                                {currentStep === 2 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                                        <h3 style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--text-main)', margin: 0 }}>
                                            Passo 2: Cabeçalho Multimídia (Header)
                                        </h3>

                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px' }}>
                                            {[
                                                { type: 'NONE', label: 'Sem Cabeçalho', icon: <FileText size={18} /> },
                                                { type: 'IMAGE', label: 'Imagem', icon: <ImageIcon size={18} /> },
                                                { type: 'VIDEO', label: 'Vídeo', icon: <Video size={18} /> },
                                                { type: 'DOCUMENT', label: 'Documento', icon: <FileText size={18} /> },
                                                { type: 'TEXT', label: 'Texto', icon: <MessageSquare size={18} /> }
                                            ].map(opt => (
                                                <button
                                                    key={opt.type}
                                                    type="button"
                                                    onClick={() => setHeaderType(opt.type as any)}
                                                    style={{
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        alignItems: 'center',
                                                        gap: '8px',
                                                        padding: '14px 10px',
                                                        borderRadius: '12px',
                                                        border: headerType === opt.type ? '2px solid #10b981' : '1px solid var(--border-subtle)',
                                                        background: headerType === opt.type ? '#f0fdf4' : '#ffffff',
                                                        color: headerType === opt.type ? '#059669' : 'var(--text-main)',
                                                        fontWeight: 800,
                                                        fontSize: '0.78rem',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    {opt.icon}
                                                    {opt.label}
                                                </button>
                                            ))}
                                        </div>

                                        {headerType !== 'NONE' && headerType !== 'TEXT' && (
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '6px' }}>
                                                    URL DE AMOSTRA DA MÍDIA (EXIGÊNCIA META)
                                                </label>
                                                <input
                                                    type="text"
                                                    className="input-base"
                                                    value={mediaUrl}
                                                    onChange={e => setMediaUrl(e.target.value)}
                                                    placeholder="https://i.imgur.com/... ou https://res.cloudinary.com/..."
                                                    style={{ width: '100%' }}
                                                />
                                            </div>
                                        )}

                                        {headerType === 'TEXT' && (
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '6px' }}>
                                                    TEXTO DO CABEÇALHO (ATÉ 60 CARACTERES)
                                                </label>
                                                <input
                                                    type="text"
                                                    maxLength={60}
                                                    className="input-base"
                                                    value={headerText}
                                                    onChange={e => setHeaderText(e.target.value)}
                                                    placeholder="Ex: Confirmação de Pagamento"
                                                    style={{ width: '100%' }}
                                                />
                                            </div>
                                        )}

                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px' }}>
                                            <button className="btn-secondary" onClick={() => setCurrentStep(1)}>
                                                <ArrowLeft size={16} /> Voltar
                                            </button>
                                            <button className="btn-primary" onClick={() => setCurrentStep(3)}>
                                                Avançar para Mensagem <ArrowRight size={16} />
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* STEP 3 */}
                                {currentStep === 3 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <h3 style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--text-main)', margin: 0 }}>
                                                Passo 3: Mensagem & Variáveis
                                            </h3>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <button className="badge badge-approved" onClick={() => handleApplyPreset(2)}>
                                                    Preset 2 Vars
                                                </button>
                                                <button className="badge badge-pending" onClick={() => handleApplyPreset(4)}>
                                                    Preset 4 Vars
                                                </button>
                                                <button className="badge" onClick={() => handleApplyPreset(5)}>
                                                    Preset 5 Vars
                                                </button>
                                            </div>
                                        </div>

                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                                <label style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)' }}>
                                                    CORPO DO TEMPLATE (BODY)
                                                </label>
                                                <div style={{ display: 'flex', gap: '6px' }}>
                                                    {[1, 2, 3, 4, 5].map(n => (
                                                        <button
                                                            key={n}
                                                            type="button"
                                                            onClick={() => handleInsertVariable(n)}
                                                            style={{
                                                                background: '#f1f5f9',
                                                                border: '1px solid var(--border-subtle)',
                                                                borderRadius: '6px',
                                                                padding: '2px 8px',
                                                                fontSize: '11px',
                                                                fontWeight: 900,
                                                                cursor: 'pointer',
                                                                color: '#0f172a'
                                                            }}
                                                        >
                                                            + {`{{${n}}}`}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                            <textarea
                                                className="input-base"
                                                rows={5}
                                                value={bodyText}
                                                onChange={e => setBodyText(e.target.value)}
                                                style={{ width: '100%', lineHeight: 1.5, fontSize: '0.9rem' }}
                                            />
                                        </div>

                                        {/* Dynamic variable inputs */}
                                        {detectedVariables.length > 0 && (
                                            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                                                <span style={{ fontSize: '0.8rem', fontWeight: 900, color: 'var(--text-main)', display: 'block', marginBottom: '10px' }}>
                                                    Valores de Amostra para a Meta ({detectedVariables.length} variáveis detectadas):
                                                </span>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                                                    {detectedVariables.map(v => (
                                                        <div key={v}>
                                                            <label style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)' }}>
                                                                {`{{${v}}}`}
                                                            </label>
                                                            <input
                                                                type="text"
                                                                className="input-base"
                                                                value={variableExamples[v] || ''}
                                                                onChange={e => setVariableExamples({ ...variableExamples, [v]: e.target.value })}
                                                                placeholder={`Amostra {{${v}}}`}
                                                                style={{ width: '100%', fontSize: '0.82rem' }}
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px' }}>
                                            <button className="btn-secondary" onClick={() => setCurrentStep(2)}>
                                                <ArrowLeft size={16} /> Voltar
                                            </button>
                                            <button className="btn-primary" onClick={() => setCurrentStep(4)}>
                                                Avançar para Botões <ArrowRight size={16} />
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* STEP 4 */}
                                {currentStep === 4 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                                        <h3 style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--text-main)', margin: 0 }}>
                                            Passo 4: Rodapé & Botões de Ação
                                        </h3>

                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '6px' }}>
                                                RODAPÉ (OPCIONAL)
                                            </label>
                                            <input
                                                type="text"
                                                className="input-base"
                                                value={footerText}
                                                onChange={e => setFooterText(e.target.value)}
                                                style={{ width: '100%' }}
                                            />
                                        </div>

                                        {/* Button 1 */}
                                        <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                                                <span style={{ fontSize: '0.85rem', fontWeight: 900, color: 'var(--text-main)' }}>
                                                    Botão 1 (Principal)
                                                </span>
                                                <div style={{ display: 'flex', gap: '6px' }}>
                                                    {(['URL', 'QUICK_REPLY', 'NONE'] as const).map(bt => (
                                                        <button
                                                            key={bt}
                                                            type="button"
                                                            onClick={() => setButtonType(bt)}
                                                            style={{
                                                                padding: '4px 10px',
                                                                borderRadius: '8px',
                                                                fontSize: '11px',
                                                                fontWeight: 800,
                                                                border: buttonType === bt ? '2px solid #10b981' : '1px solid var(--border-subtle)',
                                                                background: buttonType === bt ? '#ecfdf5' : '#ffffff',
                                                                color: buttonType === bt ? '#059669' : '#64748b',
                                                                cursor: 'pointer'
                                                            }}
                                                        >
                                                            {bt === 'URL' ? 'Link' : bt === 'QUICK_REPLY' ? 'Resposta' : 'Sem Botão'}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {buttonType === 'URL' && (
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px' }}>
                                                    <input
                                                        type="text"
                                                        className="input-base"
                                                        value={buttonText}
                                                        onChange={e => setButtonText(e.target.value)}
                                                        placeholder="Texto do botão"
                                                    />
                                                    <input
                                                        type="text"
                                                        className="input-base"
                                                        value={buttonUrl}
                                                        onChange={e => setButtonUrl(e.target.value)}
                                                        placeholder="https://..."
                                                    />
                                                </div>
                                            )}

                                            {buttonType === 'QUICK_REPLY' && (
                                                <input
                                                    type="text"
                                                    className="input-base"
                                                    value={quickReplyText}
                                                    onChange={e => setQuickReplyText(e.target.value)}
                                                    placeholder="Ex: Não Reconheço"
                                                    style={{ width: '100%' }}
                                                />
                                            )}
                                        </div>

                                        {/* Button 2 toggle */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <input
                                                type="checkbox"
                                                id="chkSecondBtn"
                                                checked={hasSecondButton}
                                                onChange={e => setHasSecondButton(e.target.checked)}
                                            />
                                            <label htmlFor="chkSecondBtn" style={{ fontSize: '0.82rem', fontWeight: 800, cursor: 'pointer' }}>
                                                Adicionar Segundo Botão de Ação
                                            </label>
                                        </div>

                                        {hasSecondButton && (
                                            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px' }}>
                                                    <input
                                                        type="text"
                                                        className="input-base"
                                                        value={button2Text}
                                                        onChange={e => setButton2Text(e.target.value)}
                                                        placeholder="Texto"
                                                    />
                                                    {button2Type === 'URL' ? (
                                                        <input
                                                            type="text"
                                                            className="input-base"
                                                            value={button2Url}
                                                            onChange={e => setButton2Url(e.target.value)}
                                                            placeholder="https://"
                                                        />
                                                    ) : (
                                                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', alignSelf: 'center' }}>
                                                            Resposta Rápida (Quick Reply)
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* Actions Bar */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)' }}>
                                            <button className="btn-secondary" onClick={() => setCurrentStep(3)}>
                                                <ArrowLeft size={16} /> Voltar
                                            </button>

                                            <div style={{ display: 'flex', gap: '10px' }}>
                                                <button
                                                    className="btn-primary"
                                                    style={{ padding: '12px 24px', fontSize: '0.95rem' }}
                                                    onClick={handleSubmitSingleTemplate}
                                                    disabled={isSubmitting}
                                                >
                                                    {isSubmitting ? (
                                                        <>
                                                            <Activity size={18} className="animate-spin" /> Publicando...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Send size={18} /> Publicar Template na Meta
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                        </div>

                                        {submitSuccess && (
                                            <div style={{ background: '#ecfdf5', border: '1px solid #10b981', padding: '16px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <CheckCircle2 color="#059669" size={24} />
                                                    <div>
                                                        <strong style={{ color: '#065f46', fontSize: '0.9rem' }}>Template Criado e Registrado!</strong>
                                                        <p style={{ margin: 0, fontSize: '0.8rem', color: '#047857' }}>
                                                            {lastCreatedName} está pronto para seleção no Disparador Multi-Remetente.
                                                        </p>
                                                    </div>
                                                </div>
                                                {onCreated && (
                                                    <button
                                                        className="btn-primary"
                                                        style={{ background: '#059669', borderColor: '#059669' }}
                                                        onClick={() => onCreated(lastCreatedName)}
                                                    >
                                                        Usar no Disparo Agora
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
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            {/* Link Shortener Utility Card */}
                            <div className="glass-panel" style={{ padding: '20px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                                    <LinkIcon size={18} color="#3b82f6" />
                                    <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 900 }}>
                                        Encurtador de Links em Massa
                                    </h3>
                                </div>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <input
                                        type="text"
                                        className="input-base"
                                        placeholder="Deseja encurtar alguma URL de destino para as campanhas?"
                                        value={shortenerOriginal}
                                        onChange={e => setShortenerOriginal(e.target.value)}
                                        style={{ flex: 1 }}
                                    />
                                    <button
                                        className="btn-secondary"
                                        onClick={handleShortenLink}
                                        disabled={isShortening || !shortenerOriginal}
                                    >
                                        {isShortening ? 'Encurtando...' : 'Encurtar'}
                                    </button>
                                </div>
                                {shortenerResult && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                                        <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#059669' }}>
                                            Link: {shortenerResult}
                                        </span>
                                        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                                            <button className="badge badge-approved" onClick={() => applyShortUrlToAll(0)}>
                                                Aplicar em Todas no B1
                                            </button>
                                            <button className="badge badge-pending" onClick={() => applyShortUrlToAll(1)}>
                                                Aplicar em Todas no B2
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Campaign Batches Header */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                                <h2 style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--text-main)', margin: 0 }}>
                                    Campanhas Multi-Gerador ({campaigns.length})
                                </h2>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button className="btn-secondary" onClick={applySenderToAllCampaigns} style={{ fontSize: '0.8rem' }}>
                                        <Smartphone size={14} /> Replicar WABA em Todas
                                    </button>
                                    <button
                                        className="btn-primary"
                                        onClick={() => setCampaigns([...campaigns, {
                                            id: `camp_${Date.now()}`,
                                            prefix: `campanha_${campaigns.length + 1}_`,
                                            rows: []
                                        }])}
                                        style={{ fontSize: '0.8rem' }}
                                    >
                                        <Plus size={14} /> Nova Campanha
                                    </button>
                                </div>
                            </div>

                            {/* Campaign Batch Cards */}
                            {campaigns.map((camp, cIdx) => (
                                <div key={camp.id} className="glass-panel" style={{ padding: '20px' }}>
                                    {/* Campaign Card Header */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '14px', borderBottom: '1px solid var(--border-subtle)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <span style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#3b82f6', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '0.85rem' }}>
                                                {cIdx + 1}
                                            </span>
                                            <div>
                                                <label style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)' }}>
                                                    PREFIXO DA CAMPANHA
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
                                                        borderBottom: '2px solid #3b82f6',
                                                        background: 'transparent',
                                                        fontWeight: 900,
                                                        fontSize: '1rem',
                                                        color: '#0f172a',
                                                        outline: 'none',
                                                        padding: '2px 4px'
                                                    }}
                                                />
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)' }}>
                                                {camp.rows.length} templates
                                            </span>
                                            {campaigns.length > 1 && (
                                                <button
                                                    onClick={() => setCampaigns(campaigns.filter(c => c.id !== camp.id))}
                                                    style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                                                    title="Excluir Campanha"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Quick Config Bar for this Campaign */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', background: '#f8fafc', padding: '12px 16px', borderRadius: '12px', margin: '14px 0' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)' }}>
                                                GERAR LINHAS:
                                            </span>
                                            <input
                                                type="number"
                                                min={1}
                                                max={50}
                                                value={queueSize}
                                                onChange={e => setQueueSize(parseInt(e.target.value, 10) || 1)}
                                                style={{ width: '60px', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border-subtle)', textAlign: 'center', fontWeight: 800 }}
                                            />
                                            <button
                                                className="btn-primary"
                                                style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                                                onClick={() => autoGenerateRows(queueSize, camp.id)}
                                            >
                                                + Gerar {queueSize} Linhas
                                            </button>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)' }}>
                                                BOTÕES:
                                            </span>
                                            <button
                                                className="badge badge-approved"
                                                onClick={() => setCampaignButtonCount(1, camp.id)}
                                            >
                                                1 Botão
                                            </button>
                                            <button
                                                className="badge badge-pending"
                                                onClick={() => setCampaignButtonCount(2, camp.id)}
                                            >
                                                2 Botões
                                            </button>
                                        </div>
                                    </div>

                                    {/* Campaign Rows Table */}
                                    {camp.rows.length > 0 ? (
                                        <div style={{ overflowX: 'auto' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                                <thead>
                                                    <tr style={{ borderBottom: '2px solid var(--border-subtle)', textAlign: 'left', color: 'var(--text-muted)' }}>
                                                        <th style={{ padding: '8px 10px' }}>SUFIXO</th>
                                                        <th style={{ padding: '8px 10px' }}>REMETENTE WABA</th>
                                                        <th style={{ padding: '8px 10px' }}>TIPO</th>
                                                        <th style={{ padding: '8px 10px' }}>BOTÃO 1</th>
                                                        <th style={{ padding: '8px 10px' }}>URL DESTINO</th>
                                                        <th style={{ padding: '8px 10px', textAlign: 'center' }}>AÇÕES</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {camp.rows.map((row, rIdx) => (
                                                        <tr key={rIdx} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                                            <td style={{ padding: '8px 10px', fontWeight: 800 }}>
                                                                <input
                                                                    type="text"
                                                                    value={row.suffix}
                                                                    onChange={e => {
                                                                        const val = e.target.value.toLowerCase().replace(/[\s-@.]/g, '_');
                                                                        const next = [...camp.rows];
                                                                        next[rIdx].suffix = val;
                                                                        setCampaigns(campaigns.map(c => c.id === camp.id ? { ...c, rows: next } : c));
                                                                    }}
                                                                    style={{ width: '70px', padding: '4px 6px', borderRadius: '6px', border: '1px solid var(--border-subtle)', fontWeight: 800 }}
                                                                />
                                                            </td>
                                                            <td style={{ padding: '8px 10px' }}>
                                                                <input
                                                                    type="text"
                                                                    value={row.sender}
                                                                    onChange={e => {
                                                                        const next = [...camp.rows];
                                                                        next[rIdx].sender = e.target.value;
                                                                        setCampaigns(campaigns.map(c => c.id === camp.id ? { ...c, rows: next } : c));
                                                                    }}
                                                                    style={{ width: '130px', padding: '4px 6px', borderRadius: '6px', border: '1px solid var(--border-subtle)', fontSize: '0.78rem' }}
                                                                />
                                                            </td>
                                                            <td style={{ padding: '8px 10px' }}>
                                                                <select
                                                                    value={row.headerType}
                                                                    onChange={e => {
                                                                        const next = [...camp.rows];
                                                                        next[rIdx].headerType = e.target.value as any;
                                                                        setCampaigns(campaigns.map(c => c.id === camp.id ? { ...c, rows: next } : c));
                                                                    }}
                                                                    style={{ padding: '4px 6px', borderRadius: '6px', border: '1px solid var(--border-subtle)', fontSize: '0.78rem' }}
                                                                >
                                                                    <option value="IMAGE">IMG</option>
                                                                    <option value="VIDEO">VID</option>
                                                                    <option value="TEXT">TEXTO</option>
                                                                </select>
                                                            </td>
                                                            <td style={{ padding: '8px 10px' }}>
                                                                <input
                                                                    type="text"
                                                                    value={row.buttonTexts[0] || 'Clique Aqui'}
                                                                    onChange={e => {
                                                                        const next = [...camp.rows];
                                                                        next[rIdx].buttonTexts[0] = e.target.value;
                                                                        setCampaigns(campaigns.map(c => c.id === camp.id ? { ...c, rows: next } : c));
                                                                    }}
                                                                    style={{ width: '100px', padding: '4px 6px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}
                                                                />
                                                            </td>
                                                            <td style={{ padding: '8px 10px' }}>
                                                                <input
                                                                    type="text"
                                                                    value={row.buttonUrls[0] || ''}
                                                                    onChange={e => {
                                                                        const next = [...camp.rows];
                                                                        next[rIdx].buttonUrls[0] = e.target.value;
                                                                        setCampaigns(campaigns.map(c => c.id === camp.id ? { ...c, rows: next } : c));
                                                                    }}
                                                                    placeholder="https://..."
                                                                    style={{ width: '180px', padding: '4px 6px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}
                                                                />
                                                            </td>
                                                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                                <div style={{ display: 'inline-flex', gap: '6px' }}>
                                                                    <button
                                                                        onClick={() => duplicateRow(camp.id, rIdx)}
                                                                        style={{ background: '#f1f5f9', border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer' }}
                                                                        title="Duplicar linha"
                                                                    >
                                                                        <Copy size={13} color="#475569" />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => deleteRow(camp.id, rIdx)}
                                                                        style={{ background: '#fee2e2', border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer' }}
                                                                        title="Excluir linha"
                                                                    >
                                                                        <Trash2 size={13} color="#ef4444" />
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                            Nenhum template gerado nesta campanha ainda. Clique em <strong>+ Gerar Linhas</strong> acima.
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
                                    padding: '18px 24px',
                                    borderRadius: '16px',
                                    fontSize: '1.05rem',
                                    fontWeight: 900,
                                    width: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '10px'
                                }}
                            >
                                {isGeneratingBulk ? (
                                    <>
                                        <Activity size={22} className="animate-spin" />
                                        {bulkProgress.message || 'Processando templates em lote...'}
                                    </>
                                ) : (
                                    <>
                                        <Send size={22} />
                                        🚀 GERAR TODAS AS CAMPANHAS AGORA NA META
                                    </>
                                )}
                            </button>

                            {/* Real-time Bulk Progress & Logs */}
                            {isGeneratingBulk && (
                                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div>
                                        <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                            Progresso: {bulkProgress.current} de {bulkProgress.total}
                                        </span>
                                        <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                            {bulkProgress.message}
                                        </p>
                                    </div>
                                    <button
                                        className="btn-secondary"
                                        onClick={() => { abortBulkRef.current = true; }}
                                        style={{ color: '#ef4444' }}
                                    >
                                        Cancelar Envio
                                    </button>
                                </div>
                            )}

                            {/* Success & Error Logs */}
                            {(operationSuccesses.length > 0 || operationErrors.length > 0) && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                    {/* Successes */}
                                    <div className="glass-panel" style={{ padding: '16px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                            <span style={{ fontSize: '0.82rem', fontWeight: 900, color: '#059669' }}>
                                                CRIADOS COM SUCESSO ({operationSuccesses.length})
                                            </span>
                                            <button
                                                onClick={() => setOperationSuccesses([])}
                                                style={{ background: 'transparent', border: 'none', fontSize: '11px', color: '#64748b', cursor: 'pointer' }}
                                            >
                                                Limpar
                                            </button>
                                        </div>
                                        <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            {operationSuccesses.map((s, idx) => (
                                                <div key={idx} style={{ fontSize: '0.75rem', padding: '4px 8px', background: '#ecfdf5', borderRadius: '6px', color: '#065f46', display: 'flex', justifyContent: 'space-between' }}>
                                                    <strong>{s.name}</strong>
                                                    <span>{s.timestamp}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Errors */}
                                    <div className="glass-panel" style={{ padding: '16px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                            <span style={{ fontSize: '0.82rem', fontWeight: 900, color: '#ef4444' }}>
                                                ERROS RECENTES ({operationErrors.length})
                                            </span>
                                            <button
                                                onClick={() => setOperationErrors([])}
                                                style={{ background: 'transparent', border: 'none', fontSize: '11px', color: '#64748b', cursor: 'pointer' }}
                                            >
                                                Limpar
                                            </button>
                                        </div>
                                        <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            {operationErrors.map((err, idx) => (
                                                <div key={idx} style={{ fontSize: '0.75rem', padding: '6px 8px', background: '#fef2f2', borderRadius: '6px', color: '#991b1b' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}>
                                                        <span>{err.name}</span>
                                                        <span>{err.timestamp}</span>
                                                    </div>
                                                    <div style={{ fontSize: '0.7rem', marginTop: '2px', opacity: 0.9 }}>
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

                {/* RIGHT COLUMN: SMARTPHONE LIVE PREVIEW & LIVE PAYLOAD VIEWER */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', position: 'sticky', top: '24px' }}>

                    {/* 1. WHATSAPP SMARTPHONE PREVIEW */}
                    <div className="glass-panel" style={{ padding: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                            <Smartphone size={18} color="#10b981" />
                            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 900 }}>
                                Preview no WhatsApp
                            </h3>
                        </div>

                        {/* Phone Mockup Frame */}
                        <div style={{
                            background: '#efeae2',
                            borderRadius: '24px',
                            padding: '16px 12px',
                            border: '1px solid rgba(0,0,0,0.1)',
                            boxShadow: '0 8px 30px rgba(0,0,0,0.08)'
                        }}>
                            {/* WhatsApp Chat Header */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingBottom: '10px', borderBottom: '1px solid rgba(0,0,0,0.06)', marginBottom: '12px' }}>
                                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#25D366', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', fontWeight: 900, fontSize: '12px' }}>
                                    W
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#111b21' }}>
                                        {selectedSender}
                                    </div>
                                    <div style={{ fontSize: '0.68rem', color: '#667781' }}>
                                        Conta Oficial do WhatsApp
                                    </div>
                                </div>
                            </div>

                            {/* WhatsApp Speech Bubble */}
                            <div style={{
                                background: '#ffffff',
                                borderRadius: '14px',
                                padding: '10px 12px',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px'
                            }}>
                                {/* Media Header Preview */}
                                {headerType !== 'NONE' && (
                                    <div style={{
                                        borderRadius: '10px',
                                        overflow: 'hidden',
                                        background: '#090d16',
                                        height: '140px',
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
                                                    <ImageIcon size={32} />
                                                    <span style={{ fontSize: '11px' }}>Imagem do Cabeçalho</span>
                                                </div>
                                            )
                                        )}
                                        {headerType === 'VIDEO' && (
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', opacity: 0.8 }}>
                                                <Video size={36} color="#10b981" />
                                                <span style={{ fontSize: '11px' }}>Vídeo Demonstrativo</span>
                                            </div>
                                        )}
                                        {headerType === 'TEXT' && (
                                            <div style={{ padding: '12px', fontWeight: 900, fontSize: '0.9rem', color: '#10b981', textAlign: 'center' }}>
                                                {headerText || 'CABEÇALHO EM TEXTO'}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Body Text with Dynamic Variables Replaced */}
                                <div style={{ fontSize: '0.85rem', color: '#111b21', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
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
                                    <div style={{ fontSize: '0.72rem', color: '#667781', borderTop: '1px solid #f1f5f9', paddingTop: '6px' }}>
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
                                                borderRadius: '10px',
                                                padding: '9px',
                                                textAlign: 'center',
                                                color: '#00a884',
                                                fontSize: '0.82rem',
                                                fontWeight: 800,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '6px',
                                                boxShadow: '0 1px 2px rgba(0,0,0,0.06)'
                                            }}
                                        >
                                            {btn.type === 'URL' ? <LinkIcon size={13} /> : <MessageSquare size={13} />}
                                            {btn.text}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 2. LIVE TECHNICAL PAYLOAD VIEWER & MANUAL JSON EDITOR */}
                    <div className="glass-panel" style={{ padding: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Code size={18} color="#3b82f6" />
                                <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 900 }}>
                                    Visualizador Técnico de Payload
                                </h3>
                            </div>
                            <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                    onClick={handleCopyPayloadJson}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        background: copiedJson ? '#ecfdf5' : '#f1f5f9',
                                        color: copiedJson ? '#059669' : '#475569',
                                        border: '1px solid var(--border-subtle)',
                                        borderRadius: '6px',
                                        padding: '4px 8px',
                                        fontSize: '11px',
                                        fontWeight: 800,
                                        cursor: 'pointer'
                                    }}
                                >
                                    {copiedJson ? <Check size={12} /> : <Copy size={12} />}
                                    {copiedJson ? 'Copiado!' : 'Copiar JSON'}
                                </button>
                                <button
                                    onClick={handleToggleManualEdit}
                                    style={{
                                        background: isEditingPayload ? '#fee2e2' : '#f1f5f9',
                                        color: isEditingPayload ? '#ef4444' : '#475569',
                                        border: '1px solid var(--border-subtle)',
                                        borderRadius: '6px',
                                        padding: '4px 8px',
                                        fontSize: '11px',
                                        fontWeight: 800,
                                        cursor: 'pointer'
                                    }}
                                >
                                    {isEditingPayload ? 'Cancelar' : 'Editar Manual'}
                                </button>
                            </div>
                        </div>

                        {/* Format Switcher: Infobip vs Meta Direct */}
                        <div style={{ display: 'flex', background: '#f1f5f9', padding: '2px', borderRadius: '8px', marginBottom: '10px' }}>
                            <button
                                onClick={() => setPayloadViewFormat('INFOBIP')}
                                style={{
                                    flex: 1,
                                    border: 'none',
                                    borderRadius: '6px',
                                    padding: '4px',
                                    fontSize: '10px',
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                    background: payloadViewFormat === 'INFOBIP' ? '#ffffff' : 'transparent',
                                    color: payloadViewFormat === 'INFOBIP' ? '#0f172a' : '#64748b'
                                }}
                            >
                                Formato Infobip
                            </button>
                            <button
                                onClick={() => setPayloadViewFormat('META_DIRECT')}
                                style={{
                                    flex: 1,
                                    border: 'none',
                                    borderRadius: '6px',
                                    padding: '4px',
                                    fontSize: '10px',
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                    background: payloadViewFormat === 'META_DIRECT' ? '#ffffff' : 'transparent',
                                    color: payloadViewFormat === 'META_DIRECT' ? '#0f172a' : '#64748b'
                                }}
                            >
                                Formato Meta Direct
                            </button>
                        </div>

                        {/* JSON Code Area */}
                        <div style={{
                            background: '#090d16',
                            borderRadius: '12px',
                            padding: '12px',
                            maxHeight: '280px',
                            overflowY: 'auto'
                        }}>
                            {isEditingPayload ? (
                                <textarea
                                    value={manualPayloadStr}
                                    onChange={e => setManualPayloadStr(e.target.value)}
                                    style={{
                                        width: '100%',
                                        height: '240px',
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
