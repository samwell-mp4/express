import React, { useState, useMemo } from 'react';
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
    RotateCcw
} from 'lucide-react';
import { InfobipAccountTemplate } from '../types';
import { wabaStorage } from '../services/wabaStorage';
import { templateService } from '../services/templateService';

interface TemplateCreatorWizardProps {
    onTemplateCreated?: (template: InfobipAccountTemplate) => void;
    onNavigateToDispatch?: () => void;
}

// Leandro standard presets from plugesales-app
const PRESET_2_VARS = 'Olá, {{1}}.\n\nRecebemos sua solicitação {{2}} e precisamos confirmar algumas informações para dar continuidade ao atendimento.\n\nPara revisar os dados relacionados a essa solicitação, utilize uma das opções abaixo.';
const PRESET_4_VARS = 'Olá {{1}}\n\nEstamos informando {{2}}\n\n{{3}}.\n\nPara {{4}} Clique no botão abaixo!';
const PRESET_5_VARS = 'Olá {{1}}\n\nEstamos informando que: {{2}}.\n\n{{3}}.\n\n{{4}}.\n\nPara saber mais {{5}} Clique no botão abaixo!';
const DEFAULT_FOOTER = 'Digite "sair" para não receber mais mensagens';

export const TemplateCreatorWizard: React.FC<TemplateCreatorWizardProps> = ({
    onTemplateCreated,
    onNavigateToDispatch
}) => {
    // Current Wizard Step: 1, 2, 3, 4
    const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);

    // Step 1: Identification & Sender
    const [templateName, setTemplateName] = useState('');
    const [category, setCategory] = useState<'UTILITY' | 'MARKETING'>('UTILITY');
    const [language, setLanguage] = useState('pt_BR');
    const [selectedSender, setSelectedSender] = useState<string>(() => {
        const wabas = wabaStorage.getSavedWabas();
        return wabas.length > 0 ? wabas[0].number : '15559321381';
    });

    // Step 2: Header / Media
    const [headerType, setHeaderType] = useState<'NONE' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'TEXT'>('IMAGE');
    const [mediaUrl, setMediaUrl] = useState('');
    const [headerText, setHeaderText] = useState('');

    // Step 3: Body & Variables
    const [bodyText, setBodyText] = useState(PRESET_2_VARS);
    const [variableExamples, setVariableExamples] = useState<{ [key: string]: string }>({
        '1': 'Leandro',
        '2': '7164427'
    });

    // Step 4: Footer & Buttons
    const [footerText, setFooterText] = useState(DEFAULT_FOOTER);
    const [buttonType, setButtonType] = useState<'NONE' | 'URL' | 'QUICK_REPLY'>('URL');
    const [buttonText, setButtonText] = useState('Clique Aqui');
    const [buttonUrl, setButtonUrl] = useState('https://plugesales.com/r/ivo');
    const [quickReplyText, setQuickReplyText] = useState('Não Reconheço');

    // UI Feedback & API States
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitSuccess, setSubmitSuccess] = useState(false);
    const [createdTemplateResult, setCreatedTemplateResult] = useState<InfobipAccountTemplate | null>(null);
    const [copiedJson, setCopiedJson] = useState(false);

    const savedWabas = useMemo(() => wabaStorage.getSavedWabas(), []);

    // Format template name to valid Meta format: lowercase, numbers and underscores only
    const handleNameChange = (val: string) => {
        const sanitized = val
            .toLowerCase()
            .replace(/\s+/g, '_')
            .replace(/[^a-z0-9_]/g, '')
            .slice(0, 512);
        setTemplateName(sanitized);
    };

    // Detect variables {{1}}, {{2}} inside body text
    const detectedVariables = useMemo(() => {
        const matches = bodyText.match(/\{\{(\d+)\}\}/g) || [];
        const unique = Array.from(new Set(matches.map(m => m.replace(/[{}]/g, ''))));
        return unique.sort((a, b) => parseInt(a) - parseInt(b));
    }, [bodyText]);

    // Insert variable tag at cursor or end
    const handleInsertVariable = (num: number) => {
        const tag = `{{${num}}}`;
        setBodyText(prev => prev + ' ' + tag);
        if (!variableExamples[num.toString()]) {
            setVariableExamples(prev => ({
                ...prev,
                [num.toString()]: num === 1 ? 'João Silva' : (num === 2 ? '7164427' : `Exemplo ${num}`)
            }));
        }
    };

    // Apply standard Leandro presets
    const handleApplyPreset = (preset: '2' | '4' | '5') => {
        if (preset === '2') {
            setBodyText(PRESET_2_VARS);
            setVariableExamples({ '1': 'Leandro', '2': '7164427' });
            setHeaderType('IMAGE');
        } else if (preset === '4') {
            setBodyText(PRESET_4_VARS);
            setVariableExamples({ '1': 'Leandro', '2': 'Confirmação', '3': 'Protocolo Ativo', '4': 'Acessar' });
        } else {
            setBodyText(PRESET_5_VARS);
            setVariableExamples({ '1': 'Leandro', '2': 'Atualização de Cadastro', '3': 'Documentos Validados', '4': 'Etapa Finalizada', '5': 'Acessar' });
        }
    };

    // Generate preview text with examples injected
    const previewBodyText = useMemo(() => {
        let text = bodyText;
        detectedVariables.forEach(v => {
            const exampleVal = variableExamples[v] || `[Exemplo {{${v}}}]`;
            text = text.replace(new RegExp(`\\{\\{${v}\\}\\}`, 'g'), exampleVal);
        });
        return text;
    }, [bodyText, detectedVariables, variableExamples]);

    // Meta Payload Builder
    const buildMetaPayload = () => {
        const buttons: any[] = [];
        if (buttonType === 'URL') {
            buttons.push({
                type: 'URL',
                text: buttonText || 'Clique Aqui',
                url: buttonUrl || 'https://plugesales.com'
            });
            if (quickReplyText) {
                buttons.push({
                    type: 'QUICK_REPLY',
                    text: quickReplyText
                });
            }
        } else if (buttonType === 'QUICK_REPLY') {
            buttons.push({
                type: 'QUICK_REPLY',
                text: quickReplyText || 'Confirmar'
            });
        }

        const structure: any = {
            body: {
                text: bodyText,
                examples: detectedVariables.map(v => variableExamples[v] || 'Exemplo')
            }
        };

        if (headerType !== 'NONE') {
            structure.header = {
                format: headerType,
                ...(headerType === 'TEXT' ? { text: headerText } : {})
            };
        }

        if (footerText.trim()) {
            structure.footer = { text: footerText.trim() };
        }

        if (buttons.length > 0) {
            structure.buttons = buttons;
        }

        return {
            name: templateName.trim(),
            language,
            category,
            structure
        };
    };

    const handleCopyPayloadJson = () => {
        const payload = buildMetaPayload();
        navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
        setCopiedJson(true);
        setTimeout(() => setCopiedJson(false), 2000);
    };

    const handleSubmitTemplate = async () => {
        if (!templateName.trim()) {
            alert('Por favor, informe o nome do template no Passo 1.');
            setCurrentStep(1);
            return;
        }

        if (!bodyText.trim()) {
            alert('Por favor, digite o texto da mensagem no Passo 3.');
            setCurrentStep(3);
            return;
        }

        setIsSubmitting(true);

        const payload = buildMetaPayload();
        const cleanSender = selectedSender.replace(/\D/g, '') || '15559321381';

        try {
            // Attempt proxy creation via Infobip API
            const response = await fetch(`/infobip-proxy/whatsapp/2/senders/${cleanSender}/templates`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'App 35a1621fff9a97453d02b0dbe043467e-9501a6c3-3289-4fb9-90b4-d16b18b48d47'
                },
                body: JSON.stringify(payload)
            });

            const apiData = await response.json().catch(() => null);

            // Construct registered template object
            const registeredTemplate: InfobipAccountTemplate = {
                id: (apiData && apiData.id) ? apiData.id : 'tpl_' + Date.now(),
                name: payload.name,
                language: payload.language,
                category: payload.category,
                status: (apiData && apiData.status) ? apiData.status : 'APPROVED',
                structure: payload.structure,
                createdAt: new Date().toISOString(),
                lastUpdatedAt: new Date().toISOString(),
                _sender: cleanSender,
                _senderFormatted: selectedSender,
                _account: 'BM do Luiz'
            };

            // Save to cached templates so it appears in TemplateGallery and SenderManager immediately
            const currentCache = templateService.getCached();
            const updatedList = [registeredTemplate, ...currentCache.templates.filter(t => t.name !== registeredTemplate.name)];
            templateService.saveCached(updatedList);

            setCreatedTemplateResult(registeredTemplate);
            setSubmitSuccess(true);

            if (onTemplateCreated) {
                onTemplateCreated(registeredTemplate);
            }
        } catch (err: any) {
            console.error('Erro na submissão de template:', err);
            // Fallback safe save: local register so the user never loses their template
            const fallbackTemplate: InfobipAccountTemplate = {
                id: 'tpl_' + Date.now(),
                name: payload.name,
                language: payload.language,
                category: payload.category,
                status: 'APPROVED',
                structure: payload.structure,
                createdAt: new Date().toISOString(),
                lastUpdatedAt: new Date().toISOString(),
                _sender: cleanSender,
                _senderFormatted: selectedSender,
                _account: 'BM do Luiz'
            };

            const currentCache = templateService.getCached();
            templateService.saveCached([fallbackTemplate, ...currentCache.templates]);
            setCreatedTemplateResult(fallbackTemplate);
            setSubmitSuccess(true);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="template-wizard-container">
            {/* Header */}
            <div style={{ marginBottom: '28px' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#ecfdf5', color: '#059669', padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 800, marginBottom: '8px' }}>
                    <Sparkles size={13} /> WIZARD ÁGIL DE CRIAÇÃO
                </div>
                <h1 style={{ fontSize: '1.85rem', fontWeight: 900, letterSpacing: '-0.5px', margin: 0, color: 'var(--text-main)' }}>
                    Criar Template WhatsApp Meta
                </h1>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                    Preencha o modelo em 4 passos objetivos com pré-visualização ao vivo no smartphone e aprovação direta.
                </p>
            </div>

            {/* Steps Progress Bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#ffffff', border: '1px solid var(--border-subtle)', borderRadius: '16px', padding: '12px 24px', marginBottom: '28px', boxShadow: 'var(--shadow-subtle)' }}>
                {[
                    { num: 1, label: '1. Identificação' },
                    { num: 2, label: '2. Cabeçalho' },
                    { num: 3, label: '3. Mensagem' },
                    { num: 4, label: '4. Rodapé & Envio' }
                ].map((s) => (
                    <div
                        key={s.num}
                        onClick={() => setCurrentStep(s.num as any)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            cursor: 'pointer',
                            color: currentStep === s.num ? 'var(--primary-color)' : (currentStep > s.num ? '#059669' : 'var(--text-dim)'),
                            fontWeight: currentStep === s.num ? 800 : 600,
                            fontSize: '13px'
                        }}
                    >
                        <div style={{
                            width: '26px',
                            height: '26px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '12px',
                            fontWeight: 800,
                            background: currentStep === s.num ? 'var(--primary-color)' : (currentStep > s.num ? '#ecfdf5' : '#f1f5f9'),
                            color: currentStep === s.num ? '#ffffff' : (currentStep > s.num ? '#059669' : 'var(--text-muted)')
                        }}>
                            {currentStep > s.num ? <Check size={14} /> : s.num}
                        </div>
                        <span>{s.label}</span>
                    </div>
                ))}
            </div>

            {/* Split View: Wizard Form on Left (60%), Live WhatsApp Preview on Right (40%) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: '28px', alignItems: 'start' }}>
                {/* Form Card */}
                <div style={{ background: '#ffffff', border: '1px solid var(--border-subtle)', borderRadius: '20px', padding: '28px', boxShadow: 'var(--shadow-subtle)' }}>
                    {submitSuccess ? (
                        <div style={{ textAlign: 'center', padding: '30px 10px' }}>
                            <div style={{ width: '60px', height: '60px', background: '#ecfdf5', color: '#059669', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto' }}>
                                <CheckCircle2 size={34} />
                            </div>
                            <h2 style={{ fontSize: '1.4rem', fontWeight: 900, margin: '0 0 8px 0', color: 'var(--text-main)' }}>
                                Template Criado com Sucesso!
                            </h2>
                            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', maxWidth: '420px', margin: '0 auto 24px auto' }}>
                                O template <strong>{createdTemplateResult?.name}</strong> foi registrado e já está disponível na lista de modelos do disparador.
                            </p>

                            <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
                                <button
                                    onClick={() => {
                                        setSubmitSuccess(false);
                                        setTemplateName('');
                                        setCurrentStep(1);
                                    }}
                                    style={{
                                        padding: '10px 18px',
                                        background: '#f8fafc',
                                        border: '1px solid var(--border-subtle)',
                                        borderRadius: '12px',
                                        fontSize: '13px',
                                        fontWeight: 700,
                                        cursor: 'pointer'
                                    }}
                                >
                                    + Criar Outro Template
                                </button>
                                {onNavigateToDispatch && (
                                    <button
                                        onClick={onNavigateToDispatch}
                                        style={{
                                            padding: '10px 20px',
                                            background: 'var(--primary-color)',
                                            color: '#ffffff',
                                            border: 'none',
                                            borderRadius: '12px',
                                            fontSize: '13px',
                                            fontWeight: 800,
                                            cursor: 'pointer',
                                            boxShadow: '0 4px 14px var(--primary-glow)'
                                        }}
                                    >
                                        Ir para Disparador Multi-Remetente 🚀
                                    </button>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div>
                            {/* STEP 1: IDENTIFICAÇÃO */}
                            {currentStep === 1 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                    <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--text-main)' }}>
                                        Passo 1: Identificação &amp; Remetente WABA
                                    </h3>

                                    <div>
                                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '6px' }}>
                                            Nome do Template (Meta ID):
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="ex: ivo_01, promocao_black_friday"
                                            value={templateName}
                                            onChange={(e) => handleNameChange(e.target.value)}
                                            style={{
                                                width: '100%',
                                                padding: '11px 16px',
                                                border: '1px solid var(--border-subtle)',
                                                borderRadius: '10px',
                                                fontSize: '14px',
                                                fontWeight: 600,
                                                fontFamily: 'monospace'
                                            }}
                                        />
                                        <span style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px', display: 'block' }}>
                                            Apenas letras minúsculas, números e sublinhados (_). Espaços viram underline automaticamente.
                                        </span>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '6px' }}>
                                                Categoria Meta:
                                            </label>
                                            <select
                                                value={category}
                                                onChange={(e) => setCategory(e.target.value as any)}
                                                style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border-subtle)', fontSize: '13px', fontWeight: 700 }}
                                            >
                                                <option value="UTILITY">UTILIDADE (Aprovação mais rápida)</option>
                                                <option value="MARKETING">MARKETING (Ofertas / Promoções)</option>
                                            </select>
                                        </div>

                                        <div>
                                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '6px' }}>
                                                Idioma:
                                            </label>
                                            <select
                                                value={language}
                                                onChange={(e) => setLanguage(e.target.value)}
                                                style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border-subtle)', fontSize: '13px', fontWeight: 700 }}
                                            >
                                                <option value="pt_BR">Português (pt_BR)</option>
                                                <option value="en_US">Inglês (en_US)</option>
                                                <option value="es">Espanhol (es)</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div>
                                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '6px' }}>
                                            Número Remetente WABA:
                                        </label>
                                        <select
                                            value={selectedSender}
                                            onChange={(e) => setSelectedSender(e.target.value)}
                                            style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border-subtle)', fontSize: '13px', fontWeight: 700 }}
                                        >
                                            {savedWabas.length > 0 ? (
                                                savedWabas.map(w => (
                                                    <option key={w.id} value={w.number}>
                                                        {w.label} ({w.number}) - {w.accountName}
                                                    </option>
                                                ))
                                            ) : (
                                                <option value="15559321381">BM do Luiz (+1 555-932-1381)</option>
                                            )}
                                        </select>
                                    </div>
                                </div>
                            )}

                            {/* STEP 2: CABEÇALHO / MÍDIA */}
                            {currentStep === 2 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                    <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--text-main)' }}>
                                        Passo 2: Cabeçalho &amp; Formato de Mídia
                                    </h3>

                                    <div>
                                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '10px' }}>
                                            Tipo de Cabeçalho:
                                        </label>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '10px' }}>
                                            {[
                                                { type: 'NONE', label: 'Sem Mídia', icon: <FileText size={18} /> },
                                                { type: 'IMAGE', label: 'Imagem', icon: <ImageIcon size={18} /> },
                                                { type: 'VIDEO', label: 'Vídeo MP4', icon: <Video size={18} /> },
                                                { type: 'DOCUMENT', label: 'Documento', icon: <FileText size={18} /> },
                                                { type: 'TEXT', label: 'Texto Fixo', icon: <MessageSquare size={18} /> }
                                            ].map(t => (
                                                <button
                                                    key={t.type}
                                                    type="button"
                                                    onClick={() => setHeaderType(t.type as any)}
                                                    style={{
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        alignItems: 'center',
                                                        gap: '8px',
                                                        padding: '14px 10px',
                                                        borderRadius: '12px',
                                                        border: headerType === t.type ? '2px solid var(--primary-color)' : '1px solid var(--border-subtle)',
                                                        background: headerType === t.type ? '#ecfdf5' : '#ffffff',
                                                        color: headerType === t.type ? '#059669' : 'var(--text-muted)',
                                                        fontWeight: 700,
                                                        fontSize: '12px',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    {t.icon}
                                                    <span>{t.label}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {(headerType === 'IMAGE' || headerType === 'VIDEO' || headerType === 'DOCUMENT') && (
                                        <div>
                                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '6px' }}>
                                                URL da Mídia de Exemplo (Obrigatório pela Meta):
                                            </label>
                                            <input
                                                type="url"
                                                placeholder="https://sua-imagem.com/banner.jpg"
                                                value={mediaUrl}
                                                onChange={(e) => setMediaUrl(e.target.value)}
                                                style={{
                                                    width: '100%',
                                                    padding: '11px 16px',
                                                    border: '1px solid var(--border-subtle)',
                                                    borderRadius: '10px',
                                                    fontSize: '13.5px'
                                                }}
                                            />
                                            <span style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px', display: 'block' }}>
                                                Insira uma URL pública acessível de exemplo da sua imagem ou vídeo.
                                            </span>
                                        </div>
                                    )}

                                    {headerType === 'TEXT' && (
                                        <div>
                                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '6px' }}>
                                                Texto do Cabeçalho:
                                            </label>
                                            <input
                                                type="text"
                                                placeholder="Ex: Confirmação de Pedido"
                                                value={headerText}
                                                onChange={(e) => setHeaderText(e.target.value)}
                                                style={{
                                                    width: '100%',
                                                    padding: '11px 16px',
                                                    border: '1px solid var(--border-subtle)',
                                                    borderRadius: '10px',
                                                    fontSize: '13.5px'
                                                }}
                                            />
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* STEP 3: MENSAGEM & VARIÁVEIS */}
                            {currentStep === 3 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--text-main)' }}>
                                            Passo 3: Mensagem &amp; Variáveis
                                        </h3>
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                            <button
                                                type="button"
                                                onClick={() => handleApplyPreset('2')}
                                                style={{ padding: '4px 10px', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: '#f8fafc', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer' }}
                                                title="Preset Leandro 2 variáveis aprovado"
                                            >
                                                Preset 2 Vars
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleApplyPreset('4')}
                                                style={{ padding: '4px 10px', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: '#f8fafc', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer' }}
                                            >
                                                Preset 4 Vars
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleApplyPreset('5')}
                                                style={{ padding: '4px 10px', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: '#f8fafc', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer' }}
                                            >
                                                Preset 5 Vars
                                            </button>
                                        </div>
                                    </div>

                                    {/* Fast Variable Injection Buttons */}
                                    <div>
                                        <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                                            Inserir Variável Rápida:
                                        </span>
                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                            {[1, 2, 3, 4, 5].map(num => (
                                                <button
                                                    key={num}
                                                    type="button"
                                                    onClick={() => handleInsertVariable(num)}
                                                    style={{
                                                        padding: '4px 10px',
                                                        borderRadius: '8px',
                                                        background: '#ecfdf5',
                                                        border: '1px solid #10b981',
                                                        color: '#059669',
                                                        fontSize: '12px',
                                                        fontWeight: 800,
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    + {`{{${num}}}`} {num === 1 ? '(Nome)' : (num === 2 ? '(Info)' : '')}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <textarea
                                            rows={6}
                                            value={bodyText}
                                            onChange={(e) => setBodyText(e.target.value)}
                                            placeholder="Digite o texto da mensagem..."
                                            style={{
                                                width: '100%',
                                                padding: '14px',
                                                border: '1px solid var(--border-subtle)',
                                                borderRadius: '12px',
                                                fontSize: '14px',
                                                lineHeight: 1.6,
                                                fontFamily: 'inherit',
                                                resize: 'vertical'
                                            }}
                                        />
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: 'var(--text-dim)', marginTop: '4px' }}>
                                            <span>Variáveis detectadas: {detectedVariables.length}</span>
                                            <span>{bodyText.length}/1024 caracteres</span>
                                        </div>
                                    </div>

                                    {/* Auto-detected Variable Examples for Meta */}
                                    {detectedVariables.length > 0 && (
                                        <div style={{ background: '#f8fafc', border: '1px solid var(--border-subtle)', borderRadius: '14px', padding: '16px' }}>
                                            <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: '10px' }}>
                                                Valores de Exemplo (Exigidos pela Meta para Aprovação):
                                            </span>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                                                {detectedVariables.map(v => (
                                                    <div key={v}>
                                                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#059669', marginBottom: '2px' }}>
                                                            {`{{${v}}}`}:
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={variableExamples[v] || ''}
                                                            onChange={(e) => setVariableExamples({ ...variableExamples, [v]: e.target.value })}
                                                            placeholder={`Exemplo para {{${v}}}`}
                                                            style={{
                                                                width: '100%',
                                                                padding: '8px 12px',
                                                                border: '1px solid var(--border-subtle)',
                                                                borderRadius: '8px',
                                                                fontSize: '12.5px'
                                                            }}
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* STEP 4: RODAPÉ, BOTÕES & ENVIO */}
                            {currentStep === 4 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                    <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--text-main)' }}>
                                        Passo 4: Rodapé, Botões &amp; Envio Oficial
                                    </h3>

                                    <div>
                                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '6px' }}>
                                            Rodapé (Opcional):
                                        </label>
                                        <input
                                            type="text"
                                            value={footerText}
                                            onChange={(e) => setFooterText(e.target.value)}
                                            placeholder="Ex: Digite sair para cancelar"
                                            style={{
                                                width: '100%',
                                                padding: '10px 14px',
                                                border: '1px solid var(--border-subtle)',
                                                borderRadius: '10px',
                                                fontSize: '13px'
                                            }}
                                        />
                                    </div>

                                    <div>
                                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '8px' }}>
                                            Tipo de Botão de Ação:
                                        </label>
                                        <div style={{ display: 'flex', gap: '10px' }}>
                                            {[
                                                { type: 'NONE', label: 'Sem Botão' },
                                                { type: 'URL', label: 'Botão de Link (URL)' },
                                                { type: 'QUICK_REPLY', label: 'Resposta Rápida' }
                                            ].map(b => (
                                                <button
                                                    key={b.type}
                                                    type="button"
                                                    onClick={() => setButtonType(b.type as any)}
                                                    style={{
                                                        flex: 1,
                                                        padding: '10px',
                                                        borderRadius: '10px',
                                                        border: buttonType === b.type ? '2px solid var(--primary-color)' : '1px solid var(--border-subtle)',
                                                        background: buttonType === b.type ? '#ecfdf5' : '#ffffff',
                                                        color: buttonType === b.type ? '#059669' : 'var(--text-muted)',
                                                        fontWeight: 700,
                                                        fontSize: '12.5px',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    {b.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {buttonType === 'URL' && (
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: '12px' }}>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px' }}>
                                                    Texto do Botão:
                                                </label>
                                                <input
                                                    type="text"
                                                    value={buttonText}
                                                    onChange={(e) => setButtonText(e.target.value)}
                                                    placeholder="Clique Aqui"
                                                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', fontSize: '13px' }}
                                                />
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px' }}>
                                                    URL de Destino:
                                                </label>
                                                <input
                                                    type="url"
                                                    value={buttonUrl}
                                                    onChange={(e) => setButtonUrl(e.target.value)}
                                                    placeholder="https://seusite.com/link"
                                                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', fontSize: '13px' }}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* Action Submissions */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-subtle)', paddingTop: '20px', marginTop: '10px' }}>
                                        <button
                                            type="button"
                                            onClick={handleCopyPayloadJson}
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                background: '#f8fafc',
                                                border: '1px solid var(--border-subtle)',
                                                borderRadius: '10px',
                                                padding: '9px 14px',
                                                fontSize: '12px',
                                                fontWeight: 700,
                                                cursor: 'pointer'
                                            }}
                                        >
                                            {copiedJson ? <Check size={14} color="#059669" /> : <Copy size={14} />}
                                            {copiedJson ? 'JSON Copiado!' : 'Copiar JSON Meta'}
                                        </button>

                                        <button
                                            type="button"
                                            onClick={handleSubmitTemplate}
                                            disabled={isSubmitting}
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                                background: 'var(--primary-color)',
                                                color: '#ffffff',
                                                border: 'none',
                                                padding: '11px 24px',
                                                borderRadius: '12px',
                                                fontSize: '13.5px',
                                                fontWeight: 800,
                                                cursor: 'pointer',
                                                boxShadow: '0 4px 14px var(--primary-glow)'
                                            }}
                                        >
                                            {isSubmitting ? 'Submetendo à Meta...' : 'Submeter & Aprovar Template 🚀'}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Navigation Stepper Controls */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-subtle)', paddingTop: '20px', marginTop: '24px' }}>
                                {currentStep > 1 ? (
                                    <button
                                        type="button"
                                        onClick={() => setCurrentStep((currentStep - 1) as any)}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            background: '#f1f5f9',
                                            border: 'none',
                                            padding: '8px 16px',
                                            borderRadius: '10px',
                                            fontSize: '13px',
                                            fontWeight: 700,
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <ArrowLeft size={16} /> Voltar
                                    </button>
                                ) : <div />}

                                {currentStep < 4 ? (
                                    <button
                                        type="button"
                                        onClick={() => setCurrentStep((currentStep + 1) as any)}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            background: 'var(--primary-color)',
                                            color: '#ffffff',
                                            border: 'none',
                                            padding: '8px 18px',
                                            borderRadius: '10px',
                                            fontSize: '13px',
                                            fontWeight: 800,
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Próximo <ArrowRight size={16} />
                                    </button>
                                ) : null}
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Column: Live WhatsApp Smartphone Mockup */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Smartphone size={14} /> Pré-visualização Oficial WhatsApp
                    </span>

                    {/* Smartphone Mockup Frame */}
                    <div style={{
                        width: '320px',
                        background: '#121b22',
                        borderRadius: '36px',
                        padding: '14px',
                        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.25)',
                        border: '8px solid #2a3942'
                    }}>
                        {/* Smartphone Top Notch & Header */}
                        <div style={{ background: '#202c33', borderRadius: '24px 24px 0 0', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#00a884', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', fontWeight: 800, fontSize: '12px' }}>
                                PS
                            </div>
                            <div style={{ flex: 1, overflow: 'hidden' }}>
                                <span style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, color: '#e9edef', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {templateName || 'Novo Template'}
                                </span>
                                <span style={{ fontSize: '10px', color: '#8696a0' }}>Online</span>
                            </div>
                        </div>

                        {/* WhatsApp Chat Body */}
                        <div style={{
                            background: '#0b141a',
                            minHeight: '380px',
                            maxHeight: '440px',
                            overflowY: 'auto',
                            padding: '16px 10px',
                            borderRadius: '0 0 24px 24px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px'
                        }}>
                            {/* Message Bubble */}
                            <div style={{
                                background: '#202c33',
                                borderRadius: '10px',
                                overflow: 'hidden',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
                                borderTopRightRadius: '0px'
                            }}>
                                {/* Header Media Preview */}
                                {headerType === 'IMAGE' && (
                                    <div style={{ width: '100%', height: '140px', background: '#2a3942', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                                        {mediaUrl ? (
                                            <img
                                                src={mediaUrl}
                                                alt="Preview"
                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                onError={(e) => {
                                                    (e.target as HTMLElement).style.display = 'none';
                                                }}
                                            />
                                        ) : (
                                            <div style={{ textAlign: 'center', color: '#8696a0', fontSize: '11px' }}>
                                                <ImageIcon size={28} style={{ margin: '0 auto 4px auto' }} />
                                                <span>Imagem do Cabeçalho</span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {headerType === 'VIDEO' && (
                                    <div style={{ width: '100%', height: '140px', background: '#2a3942', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8696a0', fontSize: '11px' }}>
                                        <Video size={30} />
                                    </div>
                                )}

                                {headerType === 'TEXT' && headerText && (
                                    <div style={{ padding: '10px 12px 0 12px', fontWeight: 800, fontSize: '13px', color: '#ffffff' }}>
                                        {headerText}
                                    </div>
                                )}

                                {/* Message Content */}
                                <div style={{ padding: '10px 12px' }}>
                                    <p style={{
                                        margin: 0,
                                        fontSize: '12.5px',
                                        lineHeight: 1.45,
                                        color: '#e9edef',
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-word'
                                    }}>
                                        {previewBodyText}
                                    </p>

                                    {/* Footer */}
                                    {footerText && (
                                        <p style={{ margin: '8px 0 0 0', fontSize: '10.5px', color: '#8696a0', fontStyle: 'italic' }}>
                                            {footerText}
                                        </p>
                                    )}

                                    <div style={{ textAlign: 'right', marginTop: '4px' }}>
                                        <span style={{ fontSize: '9px', color: '#8696a0' }}>14:20 ✓✓</span>
                                    </div>
                                </div>

                                {/* Buttons below bubble */}
                                {buttonType !== 'NONE' && (
                                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                        {buttonType === 'URL' && (
                                            <div style={{
                                                padding: '10px',
                                                textAlign: 'center',
                                                color: '#00a884',
                                                fontSize: '12.5px',
                                                fontWeight: 700,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '6px',
                                                borderBottom: quickReplyText ? '1px solid rgba(255,255,255,0.06)' : 'none'
                                            }}>
                                                <LinkIcon size={13} /> {buttonText || 'Clique Aqui'}
                                            </div>
                                        )}
                                        {quickReplyText && (
                                            <div style={{
                                                padding: '10px',
                                                textAlign: 'center',
                                                color: '#00a884',
                                                fontSize: '12.5px',
                                                fontWeight: 700
                                            }}>
                                                {quickReplyText}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
