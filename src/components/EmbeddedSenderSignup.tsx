import React, { useState, useEffect } from 'react';
import { 
    UserPlus, 
    Smartphone, 
    ShieldCheck, 
    CheckCircle2, 
    RefreshCw, 
    Send, 
    Phone, 
    MessageSquare, 
    ArrowRight, 
    Clock, 
    AlertCircle, 
    Info, 
    ExternalLink, 
    Check, 
    Copy, 
    ChevronRight,
    Sparkles,
    Activity,
    Layers,
    RotateCcw
} from 'lucide-react';
import { api } from '../services/api';
import { wabaStorage } from '../services/wabaStorage';
import { InfobipActiveSender, SavedWaba } from '../types';

interface EmbeddedSenderSignupProps {
    onNavigateToDispatch?: () => void;
    onNavigateToRegistry?: () => void;
}

export const EmbeddedSenderSignup: React.FC<EmbeddedSenderSignupProps> = ({
    onNavigateToDispatch,
    onNavigateToRegistry
}) => {
    // Sub-abas principais
    const [subTab, setSubTab] = useState<'register' | 'active_senders' | 'guide'>('register');

    // Fluxo de Cadastro (Passos 1: Form, 2: OTP, 3: Sucesso)
    const [step, setStep] = useState<1 | 2 | 3>(1);

    // Formulário de Cadastro
    const [businessAccountId, setBusinessAccountId] = useState('');
    const [countryCode, setCountryCode] = useState('55');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [verificationType, setVerificationType] = useState<'EXTERNAL_SMS' | 'EXTERNAL_VOICE'>('EXTERNAL_SMS');
    const [locale, setLocale] = useState('pt_BR');

    // Estado da Verificação OTP (Passo 2)
    const [otpCode, setOtpCode] = useState('');
    const [registeredSenderNumber, setRegisteredSenderNumber] = useState('');
    const [resendCooldown, setResendCooldown] = useState(0);

    // Estados de Loading & Feedback
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isVerifying, setIsVerifying] = useState(false);
    const [isResending, setIsResending] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Lista de Remetentes Ativos na Infobip
    const [activeSenders, setActiveSenders] = useState<InfobipActiveSender[]>([]);
    const [isLoadingSenders, setIsLoadingSenders] = useState(false);
    const [existingWabas, setExistingWabas] = useState<SavedWaba[]>([]);

    // Carregar WABAs salvas para auto-sugestão de WABA ID
    useEffect(() => {
        const saved = wabaStorage.getSavedWabas();
        setExistingWabas(saved);
        if (saved.length > 0 && !businessAccountId) {
            // Tentar extrair businessAccountId se disponível
            const found = saved.find(w => Boolean(w.businessAccountId));
            if (found && found.businessAccountId) {
                setBusinessAccountId(String(found.businessAccountId));
            }
        }
    }, []);

    // Timer regressivo para reenvio de OTP
    useEffect(() => {
        if (resendCooldown <= 0) return;
        const timer = setInterval(() => {
            setResendCooldown(prev => (prev > 0 ? prev - 1 : 0));
        }, 1000);
        return () => clearInterval(timer);
    }, [resendCooldown]);

    // Carregar remetentes da conta Infobip
    const fetchInfobipSenders = async () => {
        setIsLoadingSenders(true);
        try {
            const res = await api.getWhatsAppSenders();
            if (res && Array.isArray(res.senders)) {
                setActiveSenders(res.senders);
            }
        } catch (e: any) {
            console.warn('[EmbeddedSignup] Erro ao buscar remetentes:', e);
        } finally {
            setIsLoadingSenders(false);
        }
    };

    useEffect(() => {
        if (subTab === 'active_senders') {
            fetchInfobipSenders();
        }
    }, [subTab]);

    // Passo 1: Enviar Solicitação de Cadastro e Disparar OTP
    const handleRequestRegistration = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMessage(null);
        setSuccessMessage(null);

        const cleanWabaId = businessAccountId.trim();
        const cleanCountry = countryCode.replace(/\D/g, '');
        const cleanPhone = phoneNumber.replace(/\D/g, '');
        const cleanName = displayName.trim();

        if (!cleanWabaId) {
            setErrorMessage('Por favor, informe o WhatsApp Business Account ID (WABA ID).');
            return;
        }
        if (!cleanCountry) {
            setErrorMessage('Informe o código do país (ex: 55 para Brasil).');
            return;
        }
        if (!cleanPhone || cleanPhone.length < 8) {
            setErrorMessage('Informe um número de telefone válido com DDD (ex: 11987654321).');
            return;
        }
        if (!cleanName) {
            setErrorMessage('Informe o Nome de Exibição (Display Name) da empresa no WhatsApp.');
            return;
        }

        setIsSubmitting(true);
        try {
            const res = await api.addWhatsAppSender({
                businessAccountId: cleanWabaId,
                countryCode: cleanCountry,
                phoneNumber: cleanPhone,
                displayName: cleanName,
                type: verificationType,
                locale
            });

            if (!res.success) {
                setErrorMessage(res.error || 'Falha ao solicitar o código OTP na Infobip.');
                return;
            }

            const fullNumber = `${cleanCountry}${cleanPhone}`;
            setRegisteredSenderNumber(fullNumber);
            setStep(2);
            setResendCooldown(60);
            setSuccessMessage(`Código OTP solicitado com sucesso via ${verificationType === 'EXTERNAL_SMS' ? 'SMS' : 'Ligação'} para +${cleanCountry} ${cleanPhone}!`);
        } catch (err: any) {
            setErrorMessage(err.message || 'Erro inesperado ao registrar remetente.');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Passo 2: Confirmar Código OTP recebido
    const handleVerifyOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMessage(null);
        setSuccessMessage(null);

        const cleanCode = otpCode.replace(/\D/g, '').trim();
        if (!cleanCode || cleanCode.length < 4) {
            setErrorMessage('Informe o código de verificação recebido (geralmente 6 dígitos).');
            return;
        }

        setIsVerifying(true);
        try {
            const res = await api.verifyWhatsAppSender({
                sender: registeredSenderNumber,
                code: cleanCode
            });

            if (!res.success) {
                setErrorMessage(res.error || 'Código de verificação incorreto ou expirado. Tente novamente ou reenvie o código.');
                return;
            }

            // Salvar automaticamente no wabaStorage do app
            const formattedDisplay = `+${registeredSenderNumber}`;
            wabaStorage.saveWaba({
                label: displayName.trim() || `Remetente ${registeredSenderNumber}`,
                number: formattedDisplay,
                defaultLimit: 250,
                accountName: `WABA ${businessAccountId.trim()}`,
                headerType: 'NONE'
            });

            setStep(3);
            setSuccessMessage('🎉 Remetente verificado e registrado com sucesso na Infobip e salvo na sua lista de WABAs!');
        } catch (err: any) {
            setErrorMessage(err.message || 'Erro inesperado ao verificar código OTP.');
        } finally {
            setIsVerifying(false);
        }
    };

    // Reenviar Código OTP
    const handleRetryOtp = async () => {
        if (resendCooldown > 0 || isResending) return;
        setErrorMessage(null);
        setIsResending(true);

        try {
            const res = await api.retryWhatsAppSenderOtp({
                sender: registeredSenderNumber,
                type: verificationType,
                locale
            });

            if (!res.success) {
                setErrorMessage(res.error || 'Não foi possível reenviar o código. Aguarde alguns instantes.');
                return;
            }

            setResendCooldown(60);
            setSuccessMessage(`Novo código enviado via ${verificationType === 'EXTERNAL_SMS' ? 'SMS' : 'Ligação'}!`);
        } catch (err: any) {
            setErrorMessage(err.message || 'Erro ao solicitar reenvio do código OTP.');
        } finally {
            setIsResending(false);
        }
    };

    // Resetar para cadastrar outro número
    const handleResetFlow = () => {
        setStep(1);
        setPhoneNumber('');
        setOtpCode('');
        setErrorMessage(null);
        setSuccessMessage(null);
        setRegisteredSenderNumber('');
    };

    // Copiar texto para o clipboard
    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        alert(`Copiado: ${text}`);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
            {/* Header com Banner Premium */}
            <div className="glass-panel" style={{
                padding: '24px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(240, 253, 244, 0.95) 100%)',
                border: '1px solid rgba(167, 243, 208, 0.6)',
                boxShadow: '0 4px 20px -2px rgba(16, 185, 129, 0.08)'
            }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{
                            width: '46px',
                            height: '46px',
                            borderRadius: '10px',
                            background: '#10b981',
                            color: '#ffffff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
                        }}>
                            <UserPlus size={24} strokeWidth={2.2} />
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-main)', margin: 0, letterSpacing: '-0.02em' }}>
                                    Cadastrar Remetente WhatsApp (Embedding)
                                </h1>
                                <span style={{
                                    background: '#ecfdf5',
                                    color: '#059669',
                                    border: '1px solid #a7f3d0',
                                    padding: '2px 8px',
                                    borderRadius: '12px',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.04em'
                                }}>
                                    Infobip Bulk Registration v1
                                </span>
                            </div>
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                                Cadastre e ative novos números de telefone diretamente na sua Conta Comercial do WhatsApp (WABA) via verificação oficial por SMS ou Ligação Telefônica (OTP).
                            </p>
                        </div>
                    </div>

                    {/* Sub-nav Buttons */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255, 255, 255, 0.8)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                        <button
                            onClick={() => setSubTab('register')}
                            style={{
                                padding: '6px 14px',
                                borderRadius: '6px',
                                fontSize: '12.5px',
                                fontWeight: subTab === 'register' ? 600 : 500,
                                background: subTab === 'register' ? '#10b981' : 'transparent',
                                color: subTab === 'register' ? '#fff' : 'var(--text-main)',
                                border: 'none',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <Sparkles size={14} />
                            Novo Cadastro
                        </button>
                        <button
                            onClick={() => setSubTab('active_senders')}
                            style={{
                                padding: '6px 14px',
                                borderRadius: '6px',
                                fontSize: '12.5px',
                                fontWeight: subTab === 'active_senders' ? 600 : 500,
                                background: subTab === 'active_senders' ? '#10b981' : 'transparent',
                                color: subTab === 'active_senders' ? '#fff' : 'var(--text-main)',
                                border: 'none',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <Smartphone size={14} />
                            Remetentes Ativos
                        </button>
                        <button
                            onClick={() => setSubTab('guide')}
                            style={{
                                padding: '6px 14px',
                                borderRadius: '6px',
                                fontSize: '12.5px',
                                fontWeight: subTab === 'guide' ? 600 : 500,
                                background: subTab === 'guide' ? '#10b981' : 'transparent',
                                color: subTab === 'guide' ? '#fff' : 'var(--text-main)',
                                border: 'none',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <Info size={14} />
                            Guia & Dicas
                        </button>
                    </div>
                </div>

                {/* Stepper Visual (Quando na aba de Registro) */}
                {subTab === 'register' && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '24px',
                        marginTop: '24px',
                        paddingTop: '18px',
                        borderTop: '1px solid rgba(0, 0, 0, 0.05)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '50%',
                                background: step >= 1 ? '#10b981' : '#e5e7eb',
                                color: step >= 1 ? '#fff' : '#6b7280',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '12px',
                                fontWeight: 700
                            }}>
                                1
                            </div>
                            <span style={{ fontSize: '12.5px', fontWeight: step === 1 ? 700 : 500, color: step === 1 ? '#047857' : 'var(--text-muted)' }}>
                                Dados do Remetente
                            </span>
                        </div>

                        <ChevronRight size={16} color="#9ca3af" />

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '50%',
                                background: step >= 2 ? '#10b981' : '#e5e7eb',
                                color: step >= 2 ? '#fff' : '#6b7280',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '12px',
                                fontWeight: 700
                            }}>
                                2
                            </div>
                            <span style={{ fontSize: '12.5px', fontWeight: step === 2 ? 700 : 500, color: step === 2 ? '#047857' : 'var(--text-muted)' }}>
                                Verificação OTP (SMS/Voz)
                            </span>
                        </div>

                        <ChevronRight size={16} color="#9ca3af" />

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '50%',
                                background: step === 3 ? '#10b981' : '#e5e7eb',
                                color: step === 3 ? '#fff' : '#6b7280',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '12px',
                                fontWeight: 700
                            }}>
                                3
                            </div>
                            <span style={{ fontSize: '12.5px', fontWeight: step === 3 ? 700 : 500, color: step === 3 ? '#047857' : 'var(--text-muted)' }}>
                                Ativação & Prontidão
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* Mensagens de Alerta (Sucesso / Erro) */}
            {errorMessage && (
                <div style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    color: '#b91c1c',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    fontSize: '13px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <AlertCircle size={18} />
                        <span>{errorMessage}</span>
                    </div>
                    <button
                        onClick={() => setErrorMessage(null)}
                        style={{ background: 'none', border: 'none', color: '#b91c1c', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                    >
                        Fechar
                    </button>
                </div>
            )}

            {successMessage && (
                <div style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    background: '#ecfdf5',
                    border: '1px solid #a7f3d0',
                    color: '#047857',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    fontSize: '13px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <CheckCircle2 size={18} />
                        <span>{successMessage}</span>
                    </div>
                    <button
                        onClick={() => setSuccessMessage(null)}
                        style={{ background: 'none', border: 'none', color: '#047857', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                    >
                        Fechar
                    </button>
                </div>
            )}

            {/* ABA 1: NOVO CADASTRO */}
            {subTab === 'register' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* PASSO 1: DADOS DO REMETENTE */}
                    {step === 1 && (
                        <div className="glass-panel" style={{
                            padding: '24px',
                            borderRadius: '12px',
                            background: '#ffffff',
                            border: '1px solid var(--border-subtle)',
                            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)'
                        }}>
                            <div style={{ marginBottom: '20px' }}>
                                <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)', margin: '0 0 6px 0' }}>
                                    Passo 1: Detalhes do Novo Remetente
                                </h2>
                                <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
                                    Preencha o ID da conta do WhatsApp da sua empresa, o nome que aparecerá no perfil e o número de telefone a ser verificado.
                                </p>
                            </div>

                            <form onSubmit={handleRequestRegistration} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                                    {/* WABA ID */}
                                    <div>
                                        <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>
                                            WhatsApp Business Account ID (WABA ID) *
                                        </label>
                                        <div style={{ position: 'relative' }}>
                                            <input
                                                type="text"
                                                value={businessAccountId}
                                                onChange={(e) => setBusinessAccountId(e.target.value)}
                                                placeholder="Ex: 104829104829102"
                                                required
                                                style={{
                                                    width: '100%',
                                                    padding: '10px 12px',
                                                    borderRadius: '6px',
                                                    border: '1px solid var(--border-subtle)',
                                                    fontSize: '13.5px',
                                                    fontFamily: 'monospace',
                                                    background: '#fafafa'
                                                }}
                                            />
                                        </div>
                                        <span style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px', display: 'block' }}>
                                            Encontrado no Meta Business Suite em "Configurações do Negócio &gt; Contas do WhatsApp".
                                        </span>
                                    </div>

                                    {/* Display Name */}
                                    <div>
                                        <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>
                                            Nome de Exibição (Display Name) *
                                        </label>
                                        <input
                                            type="text"
                                            value={displayName}
                                            onChange={(e) => setDisplayName(e.target.value)}
                                            placeholder="Ex: Plug Sales Atendimento"
                                            required
                                            style={{
                                                width: '100%',
                                                padding: '10px 12px',
                                                borderRadius: '6px',
                                                border: '1px solid var(--border-subtle)',
                                                fontSize: '13.5px',
                                                background: '#fafafa'
                                            }}
                                        />
                                        <span style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px', display: 'block' }}>
                                            Deve representar a sua marca oficial ou departamento comercial.
                                        </span>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '12px' }}>
                                    {/* Country Code */}
                                    <div>
                                        <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>
                                            DDI (País) *
                                        </label>
                                        <div style={{ display: 'flex', alignItems: 'center' }}>
                                            <span style={{ padding: '0 8px', color: 'var(--text-muted)', fontSize: '13px' }}>+</span>
                                            <input
                                                type="text"
                                                value={countryCode}
                                                onChange={(e) => setCountryCode(e.target.value.replace(/\D/g, ''))}
                                                placeholder="55"
                                                maxLength={4}
                                                required
                                                style={{
                                                    width: '100%',
                                                    padding: '10px 8px',
                                                    borderRadius: '6px',
                                                    border: '1px solid var(--border-subtle)',
                                                    fontSize: '13.5px',
                                                    textAlign: 'center',
                                                    fontWeight: 600,
                                                    background: '#fafafa'
                                                }}
                                            />
                                        </div>
                                    </div>

                                    {/* Phone Number */}
                                    <div>
                                        <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>
                                            Número de Telefone com DDD (Sem o DDI) *
                                        </label>
                                        <input
                                            type="text"
                                            value={phoneNumber}
                                            onChange={(e) => setPhoneNumber(e.target.value)}
                                            placeholder="Ex: 11987654321"
                                            required
                                            style={{
                                                width: '100%',
                                                padding: '10px 12px',
                                                borderRadius: '6px',
                                                border: '1px solid var(--border-subtle)',
                                                fontSize: '13.5px',
                                                letterSpacing: '0.02em',
                                                background: '#fafafa'
                                            }}
                                        />
                                        <span style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px', display: 'block' }}>
                                            ⚠️ Importante: Este número NÃO pode estar ativo no aplicativo do WhatsApp tradicional ou WhatsApp Business.
                                        </span>
                                    </div>
                                </div>

                                {/* Método de Verificação (SMS vs Ligação Telefônica) */}
                                <div>
                                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '8px' }}>
                                        Método para Receber o Código de Verificação *
                                    </label>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                                        <div
                                            onClick={() => setVerificationType('EXTERNAL_SMS')}
                                            style={{
                                                padding: '14px',
                                                borderRadius: '8px',
                                                border: `2px solid ${verificationType === 'EXTERNAL_SMS' ? '#10b981' : 'var(--border-subtle)'}`,
                                                background: verificationType === 'EXTERNAL_SMS' ? '#f0fdf4' : '#fafafa',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '12px',
                                                transition: 'all 0.15s ease'
                                            }}
                                        >
                                            <div style={{
                                                width: '36px',
                                                height: '36px',
                                                borderRadius: '8px',
                                                background: verificationType === 'EXTERNAL_SMS' ? '#10b981' : '#e5e7eb',
                                                color: verificationType === 'EXTERNAL_SMS' ? '#fff' : '#4b5563',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                            }}>
                                                <MessageSquare size={18} />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)' }}>
                                                    SMS (EXTERNAL_SMS)
                                                </div>
                                                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                                                    Recebe SMS no celular com o código de 6 dígitos.
                                                </div>
                                            </div>
                                        </div>

                                        <div
                                            onClick={() => setVerificationType('EXTERNAL_VOICE')}
                                            style={{
                                                padding: '14px',
                                                borderRadius: '8px',
                                                border: `2px solid ${verificationType === 'EXTERNAL_VOICE' ? '#10b981' : 'var(--border-subtle)'}`,
                                                background: verificationType === 'EXTERNAL_VOICE' ? '#f0fdf4' : '#fafafa',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '12px',
                                                transition: 'all 0.15s ease'
                                            }}
                                        >
                                            <div style={{
                                                width: '36px',
                                                height: '36px',
                                                borderRadius: '8px',
                                                background: verificationType === 'EXTERNAL_VOICE' ? '#10b981' : '#e5e7eb',
                                                color: verificationType === 'EXTERNAL_VOICE' ? '#fff' : '#4b5563',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                            }}>
                                                <Phone size={18} />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)' }}>
                                                    Ligação Telefônica (EXTERNAL_VOICE)
                                                </div>
                                                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                                                    Recebe chamada automática ditando os dígitos.
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Idioma / Locale */}
                                <div style={{ maxWidth: '240px' }}>
                                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>
                                        Idioma da Verificação
                                    </label>
                                    <select
                                        value={locale}
                                        onChange={(e) => setLocale(e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            borderRadius: '6px',
                                            border: '1px solid var(--border-subtle)',
                                            fontSize: '13px',
                                            background: '#fafafa'
                                        }}
                                    >
                                        <option value="pt_BR">Português (Brasil) - pt_BR</option>
                                        <option value="en_US">Inglês (Estados Unidos) - en_US</option>
                                        <option value="es_ES">Espanhol - es_ES</option>
                                    </select>
                                </div>

                                {/* Botão de Submit */}
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        style={{
                                            padding: '12px 24px',
                                            borderRadius: '8px',
                                            background: '#10b981',
                                            color: '#ffffff',
                                            border: 'none',
                                            fontSize: '13.5px',
                                            fontWeight: 700,
                                            cursor: isSubmitting ? 'not-allowed' : 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
                                            opacity: isSubmitting ? 0.7 : 1,
                                            transition: 'all 0.15s ease'
                                        }}
                                    >
                                        {isSubmitting ? (
                                            <>
                                                <RefreshCw size={16} className="spin" />
                                                Solicitando Registro na Infobip...
                                            </>
                                        ) : (
                                            <>
                                                Solicitar Código OTP e Avançar
                                                <ArrowRight size={16} />
                                            </>
                                        )}
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}

                    {/* PASSO 2: VERIFICAÇÃO OTP */}
                    {step === 2 && (
                        <div className="glass-panel" style={{
                            padding: '30px',
                            borderRadius: '12px',
                            background: '#ffffff',
                            border: '1px solid var(--border-subtle)',
                            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.05)',
                            maxWidth: '540px',
                            margin: '0 auto',
                            width: '100%'
                        }}>
                            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                                <div style={{
                                    width: '56px',
                                    height: '56px',
                                    borderRadius: '50%',
                                    background: '#ecfdf5',
                                    color: '#10b981',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    margin: '0 auto 14px auto',
                                    border: '2px solid #a7f3d0'
                                }}>
                                    <ShieldCheck size={28} />
                                </div>
                                <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-main)', margin: '0 0 6px 0' }}>
                                    Confirmar Código de 6 Dígitos
                                </h2>
                                <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
                                    Enviamos o código OTP via <strong>{verificationType === 'EXTERNAL_SMS' ? 'SMS' : 'Ligação Telefônica'}</strong> para o número:
                                </p>
                                <div style={{
                                    fontSize: '17px',
                                    fontWeight: 700,
                                    color: '#059669',
                                    marginTop: '8px',
                                    letterSpacing: '0.04em'
                                }}>
                                    +{registeredSenderNumber}
                                </div>
                            </div>

                            <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-dim)', textAlign: 'center', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Digite o Código Recebido
                                    </label>
                                    <input
                                        type="text"
                                        value={otpCode}
                                        onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                        placeholder="123456"
                                        maxLength={6}
                                        autoFocus
                                        required
                                        style={{
                                            width: '100%',
                                            padding: '14px',
                                            borderRadius: '8px',
                                            border: '2px solid #10b981',
                                            fontSize: '28px',
                                            fontWeight: 700,
                                            textAlign: 'center',
                                            letterSpacing: '0.3em',
                                            fontFamily: 'monospace',
                                            background: '#f0fdf4',
                                            boxShadow: '0 0 0 4px rgba(16, 185, 129, 0.1)'
                                        }}
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={isVerifying || otpCode.length < 4}
                                    style={{
                                        padding: '14px',
                                        borderRadius: '8px',
                                        background: '#10b981',
                                        color: '#ffffff',
                                        border: 'none',
                                        fontSize: '14px',
                                        fontWeight: 700,
                                        cursor: isVerifying || otpCode.length < 4 ? 'not-allowed' : 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '8px',
                                        boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
                                        opacity: isVerifying || otpCode.length < 4 ? 0.6 : 1,
                                        transition: 'all 0.15s ease'
                                    }}
                                >
                                    {isVerifying ? (
                                        <>
                                            <RefreshCw size={16} className="spin" />
                                            Verificando Código com a Meta...
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle2 size={18} />
                                            Confirmar e Ativar Remetente
                                        </>
                                    )}
                                </button>

                                {/* Opções de Reenvio e Voltar */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #f3f4f6', paddingTop: '16px' }}>
                                    <button
                                        type="button"
                                        onClick={() => setStep(1)}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            color: 'var(--text-muted)',
                                            fontSize: '12.5px',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        }}
                                    >
                                        <RotateCcw size={13} />
                                        Corrigir Número
                                    </button>

                                    <button
                                        type="button"
                                        onClick={handleRetryOtp}
                                        disabled={resendCooldown > 0 || isResending}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            color: resendCooldown > 0 ? '#9ca3af' : '#059669',
                                            fontSize: '12.5px',
                                            fontWeight: 600,
                                            cursor: resendCooldown > 0 ? 'not-allowed' : 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        }}
                                    >
                                        <RefreshCw size={13} className={isResending ? 'spin' : ''} />
                                        {resendCooldown > 0 ? `Reenviar código em ${resendCooldown}s` : 'Reenviar Código OTP'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}

                    {/* PASSO 3: SUCESSO & ATIVAÇÃO */}
                    {step === 3 && (
                        <div className="glass-panel" style={{
                            padding: '36px',
                            borderRadius: '12px',
                            background: '#ffffff',
                            border: '1px solid #a7f3d0',
                            boxShadow: '0 6px 20px rgba(16, 185, 129, 0.08)',
                            textAlign: 'center',
                            maxWidth: '600px',
                            margin: '0 auto',
                            width: '100%'
                        }}>
                            <div style={{
                                width: '64px',
                                height: '64px',
                                borderRadius: '50%',
                                background: '#10b981',
                                color: '#ffffff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                margin: '0 auto 16px auto',
                                boxShadow: '0 6px 16px rgba(16, 185, 129, 0.35)'
                            }}>
                                <Check size={34} strokeWidth={2.8} />
                            </div>

                            <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-main)', margin: '0 0 8px 0' }}>
                                Remetente WhatsApp Registrado com Sucesso!
                            </h2>
                            <p style={{ fontSize: '13.5px', color: 'var(--text-muted)', margin: '0 0 20px 0', lineHeight: 1.5 }}>
                                O número <strong>+{registeredSenderNumber}</strong> ({displayName}) foi registrado oficialmente na sua conta WABA e já está salvo na plataforma pronto para disparos.
                            </p>

                            <div style={{
                                background: '#f8fafc',
                                border: '1px solid #e2e8f0',
                                borderRadius: '8px',
                                padding: '16px',
                                marginBottom: '24px',
                                textAlign: 'left',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px',
                                fontSize: '13px'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Status de Registro:</span>
                                    <span style={{ fontWeight: 700, color: '#059669' }}>● REGISTRADO & ATIVO</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Nome de Exibição:</span>
                                    <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{displayName}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Número do Remetente:</span>
                                    <span style={{ fontWeight: 600, fontFamily: 'monospace', color: 'var(--text-main)' }}>+{registeredSenderNumber}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>WABA ID:</span>
                                    <span style={{ fontWeight: 600, fontFamily: 'monospace', color: 'var(--text-main)' }}>{businessAccountId}</span>
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
                                {onNavigateToDispatch && (
                                    <button
                                        onClick={onNavigateToDispatch}
                                        style={{
                                            padding: '12px 20px',
                                            borderRadius: '8px',
                                            background: '#10b981',
                                            color: '#ffffff',
                                            border: 'none',
                                            fontSize: '13.5px',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
                                        }}
                                    >
                                        <Activity size={16} />
                                        Ir para Multi-Remetente e Disparar
                                    </button>
                                )}

                                <button
                                    onClick={handleResetFlow}
                                    style={{
                                        padding: '12px 18px',
                                        borderRadius: '8px',
                                        background: '#f3f4f6',
                                        color: 'var(--text-main)',
                                        border: '1px solid var(--border-subtle)',
                                        fontSize: '13.5px',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}
                                >
                                    <UserPlus size={16} />
                                    Cadastrar Outro Remetente
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ABA 2: REMETENTES ATIVOS NA INFOBIP */}
            {subTab === 'active_senders' && (
                <div className="glass-panel" style={{
                    padding: '24px',
                    borderRadius: '12px',
                    background: '#ffffff',
                    border: '1px solid var(--border-subtle)',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                        <div>
                            <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)', margin: '0 0 4px 0' }}>
                                Remetentes Registrados na sua Conta Infobip
                            </h2>
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
                                Lista sincronizada diretamente da API da Infobip com status operacional de cada número.
                            </p>
                        </div>

                        <button
                            onClick={fetchInfobipSenders}
                            disabled={isLoadingSenders}
                            style={{
                                padding: '8px 14px',
                                borderRadius: '6px',
                                background: '#f3f4f6',
                                border: '1px solid var(--border-subtle)',
                                color: 'var(--text-main)',
                                fontSize: '12.5px',
                                fontWeight: 600,
                                cursor: isLoadingSenders ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}
                        >
                            <RefreshCw size={14} className={isLoadingSenders ? 'spin' : ''} />
                            Atualizar Lista
                        </button>
                    </div>

                    {isLoadingSenders ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                            <RefreshCw size={24} className="spin" style={{ margin: '0 auto 10px auto', display: 'block', color: '#10b981' }} />
                            Consultando remetentes ativos na Infobip...
                        </div>
                    ) : activeSenders.length === 0 ? (
                        <div style={{
                            padding: '36px',
                            textAlign: 'center',
                            borderRadius: '8px',
                            background: '#f9fafb',
                            border: '1px dashed #d1d5db',
                            color: 'var(--text-muted)'
                        }}>
                            <Smartphone size={28} style={{ margin: '0 auto 10px auto', display: 'block', color: '#9ca3af' }} />
                            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                                Nenhum remetente retornado pela API ou remetentes gerenciados localmente
                            </div>
                            <div style={{ fontSize: '12.5px', maxWidth: '420px', margin: '0 auto 16px auto' }}>
                                Você possui <strong>{existingWabas.length} WABA(s)</strong> cadastradas no armazenamento local do Fast Dispatch.
                            </div>
                            <button
                                onClick={() => setSubTab('register')}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '6px',
                                    background: '#10b981',
                                    color: '#ffffff',
                                    border: 'none',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                            >
                                <UserPlus size={14} />
                                Cadastrar Novo Remetente
                            </button>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '14px' }}>
                            {activeSenders.map((s, idx) => (
                                <div
                                    key={s.sender || idx}
                                    style={{
                                        padding: '16px',
                                        borderRadius: '8px',
                                        border: '1px solid var(--border-subtle)',
                                        background: '#fafafa',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '10px'
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <div style={{
                                                width: '28px',
                                                height: '28px',
                                                borderRadius: '6px',
                                                background: '#ecfdf5',
                                                color: '#059669',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                            }}>
                                                <Smartphone size={16} />
                                            </div>
                                            <span style={{ fontSize: '13.5px', fontWeight: 700, fontFamily: 'monospace' }}>
                                                +{s.sender}
                                            </span>
                                        </div>
                                        <span style={{
                                            fontSize: '11px',
                                            fontWeight: 600,
                                            padding: '2px 6px',
                                            borderRadius: '4px',
                                            background: '#ecfdf5',
                                            color: '#059669'
                                        }}>
                                            {s.status || 'ACTIVE'}
                                        </span>
                                    </div>

                                    {s.displayName && (
                                        <div style={{ fontSize: '12.5px', color: 'var(--text-main)', fontWeight: 500 }}>
                                            {s.displayName}
                                        </div>
                                    )}

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: 'auto', paddingTop: '8px', borderTop: '1px solid #f3f4f6' }}>
                                        <button
                                            onClick={() => {
                                                wabaStorage.saveWaba({
                                                    label: s.displayName || `Remetente +${s.sender}`,
                                                    number: `+${s.sender}`,
                                                    defaultLimit: 250,
                                                    accountName: 'Infobip WABA',
                                                    headerType: 'NONE'
                                                });
                                                alert(`Remetente +${s.sender} adicionado à lista local de WABAs!`);
                                            }}
                                            style={{
                                                fontSize: '12px',
                                                padding: '4px 10px',
                                                borderRadius: '4px',
                                                background: '#10b981',
                                                color: '#fff',
                                                border: 'none',
                                                cursor: 'pointer',
                                                fontWeight: 600,
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}
                                        >
                                            <Check size={12} />
                                            Sincronizar no App
                                        </button>

                                        <button
                                            onClick={() => copyToClipboard(`+${s.sender}`)}
                                            style={{
                                                fontSize: '12px',
                                                padding: '4px 8px',
                                                borderRadius: '4px',
                                                background: '#e5e7eb',
                                                color: '#374151',
                                                border: 'none',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}
                                        >
                                            <Copy size={12} />
                                            Copiar
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ABA 3: GUIA & DOCUMENTAÇÃO OFICIAL */}
            {subTab === 'guide' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div className="glass-panel" style={{
                        padding: '24px',
                        borderRadius: '12px',
                        background: '#ffffff',
                        border: '1px solid var(--border-subtle)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                            <Info size={20} color="#10b981" />
                            <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
                                Documentação Oficial Infobip: WhatsApp Bulk Sender Registration
                            </h2>
                        </div>

                        <p style={{ fontSize: '13.5px', color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 16px 0' }}>
                            A API de <strong>Bulk Sender Registration</strong> e <strong>Embedded Signup</strong> da Infobip permite que parceiros e empresas registrem seus próprios números de WhatsApp Business através de uma chamada segura à API da Meta, realizando o desafio de OTP (One-Time Password) por SMS ou Chamada de Voz para confirmar a titularidade da linha.
                        </p>

                        <div style={{
                            padding: '14px',
                            borderRadius: '8px',
                            background: '#f0fdf4',
                            border: '1px solid #bbf7d0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '10px',
                            marginBottom: '20px'
                        }}>
                            <div style={{ fontSize: '13px', color: '#166534', fontWeight: 600 }}>
                                Link da documentação oficial da Infobip consultada para este módulo:
                            </div>
                            <a
                                href="https://www.infobip.com/docs/api/channels/whatsapp/whatsapp-service-management/whatsapp-bulk-sender-registration/add-whatsapp-sender"
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    color: '#059669',
                                    fontSize: '12.5px',
                                    fontWeight: 700,
                                    textDecoration: 'underline'
                                }}
                            >
                                Abrir Documentação Infobip
                                <ExternalLink size={14} />
                            </a>
                        </div>

                        <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '10px' }}>
                            Passo a Passo de Boas Práticas (Checklist):
                        </h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                <div style={{ minWidth: '22px', height: '22px', borderRadius: '50%', background: '#10b981', color: '#fff', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    1
                                </div>
                                <div style={{ fontSize: '13px', color: 'var(--text-main)' }}>
                                    <strong>Desvincular do WhatsApp Pessoal/Business:</strong> Antes de registrar o número na API, certifique-se de que a conta não esteja ativa em nenhum celular pelo aplicativo comum. Se estiver, acesse as Configurações do WhatsApp e clique em "Apagar Minha Conta".
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                <div style={{ minWidth: '22px', height: '22px', borderRadius: '50%', background: '#10b981', color: '#fff', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    2
                                </div>
                                <div style={{ fontSize: '13px', color: 'var(--text-main)' }}>
                                    <strong>Recepção de SMS ou Ligação:</strong> O chip ou linha física/VoIP deve estar apto a receber SMS ou chamada telefônica com os 6 dígitos emitidos pela Meta.
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                <div style={{ minWidth: '22px', height: '22px', borderRadius: '50%', background: '#10b981', color: '#fff', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    3
                                </div>
                                <div style={{ fontSize: '13px', color: 'var(--text-main)' }}>
                                    <strong>Nome de Exibição (Display Name):</strong> O nome precisa estar de acordo com as regras de nomes comerciais da Meta (não usar todas maiúsculas sem ser sigla, não usar pontuação excessiva e corresponder à sua identidade comercial).
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                <div style={{ minWidth: '22px', height: '22px', borderRadius: '50%', background: '#10b981', color: '#fff', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    4
                                </div>
                                <div style={{ fontSize: '13px', color: 'var(--text-main)' }}>
                                    <strong>Disparos Imediatos:</strong> Uma vez inserido o código OTP de 6 dígitos no Passo 2, a Meta e a Infobip liberam a rota e você já pode selecionar esse novo remetente imediatamente no Multi-Remetente para envios!
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
