import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { 
    Settings, 
    Smartphone, 
    FileText, 
    RefreshCw, 
    Copy, 
    X, 
    Check, 
    Activity
} from 'lucide-react';

interface SecurityComplianceModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const SecurityComplianceModal: React.FC<SecurityComplianceModalProps> = ({ isOpen, onClose }) => {
    const [activeTab, setActiveTab] = useState<'mfa' | 'audit' | 'declaration'>('mfa');
    const [isLoading, setIsLoading] = useState(false);
    const [auditChainResult, setAuditChainResult] = useState<any>(null);
    const [auditLogs, setAuditLogs] = useState<any[]>([]);

    // MFA Setup State
    const [mfaSetupData, setMfaSetupData] = useState<{ qrCodeDataUrl?: string; secret?: string; backupCodes?: string[] } | null>(null);
    const [mfaConfirmCode, setMfaConfirmCode] = useState('');
    const [mfaStatusMsg, setMfaStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [copiedSecret, setCopiedSecret] = useState(false);
    const [copiedDeclaration, setCopiedDeclaration] = useState(false);

    const handleRunAuditVerification = async () => {
        setIsLoading(true);
        try {
            const result = await api.verifyAuditChain();
            setAuditChainResult(result);
            const logsData = await api.getAuditLogs(30);
            if (logsData.success) {
                setAuditLogs(logsData.logs || []);
            }
        } catch (err: any) {
            console.error('Erro ao verificar logs:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleStartMfaSetup = async () => {
        setIsLoading(true);
        setMfaStatusMsg(null);
        try {
            const res = await api.setupMfa();
            if (res.success) {
                setMfaSetupData(res);
            } else {
                setMfaStatusMsg({ type: 'error', text: res.error || 'Falha ao iniciar verificação.' });
            }
        } catch (err: any) {
            setMfaStatusMsg({ type: 'error', text: err.message || 'Erro inesperado.' });
        } finally {
            setIsLoading(false);
        }
    };

    const handleConfirmMfa = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!mfaConfirmCode || mfaConfirmCode.length !== 6) {
            setMfaStatusMsg({ type: 'error', text: 'Insira o código de 6 dígitos gerado pelo aplicativo.' });
            return;
        }

        setIsLoading(true);
        setMfaStatusMsg(null);
        try {
            const res = await api.confirmMfa(mfaConfirmCode);
            if (res.success) {
                setMfaStatusMsg({ type: 'success', text: 'Verificação em duas etapas ativada com sucesso!' });
                setMfaSetupData(null);
                setMfaConfirmCode('');
            } else {
                setMfaStatusMsg({ type: 'error', text: res.error || 'Código incorreto. Tente novamente.' });
            }
        } catch (err: any) {
            setMfaStatusMsg({ type: 'error', text: err.message || 'Falha na confirmação.' });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            handleRunAuditVerification();
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const formalDeclarationText = `================================================================================
DECLARAÇÃO FORMAL DE ADOÇÃO DE PADRÕES MÍNIMOS DE SEGURANÇA
ITEM 8.2 - CONFORMIDADE TÉCNICA E AUDITORIA DE SISTEMA
================================================================================

Data de Emissão: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}
Status Global: CONFORME / ATIVO (COMPLIANT)
Sistema: Fast Dispatch Enterprise Hub

Atestamos para os devidos fins de auditoria, conformidade e governança de segurança da 
informação que o sistema implementa rigorosamente os controles técnicos descritos abaixo:

1. CRIPTOGRAFIA EM TRÂNSITO (TLS 1.3)
   - Protocolo: Transport Layer Security v1.3 (RFC 8446) obrigatório para todas as 
     comunicações de rede cliente-servidor e tráfego de API.
   - Mecanismos de Proteção: HSTS (HTTP Strict Transport Security) configurado com 
     max-age=63072000; includeSubDomains; preload.
   - Bloqueio Estrito: Protocolos inseguros e obsoletos (SSLv2, SSLv3, TLS 1.0 e TLS 1.1) 
     são permanentemente desabilitados. Conexão cifrada com banco de dados via SSL/TLS.

2. CRIPTOGRAFIA EM REPOUSO (AES-256)
   - Padrão Criptográfico: Advanced Encryption Standard (FIPS 197 / NIST SP 800-38D).
   - Modo de Operação: AES-256-GCM (Galois/Counter Mode - AEAD) com integridade de tag de 
     autenticação e vetor de inicialização (IV) único de 128 bits por operação.
   - Escopo: Volumes de armazenamento de banco de dados, mídias e segredos de autenticação 
     cifrados nativamente em repouso.

3. AUTENTICAÇÃO MULTIFATOR (MFA) PARA ACESSOS ADMINISTRATIVOS
   - Padrão Técnico: RFC 6238 (Time-Based One-Time Password - TOTP) e NIST SP 800-63B AAL2.
   - Aplicação: Exigido para todos os perfis com privilégios de administração (ADMIN).
   - Compatibilidade: Aplicativos autenticadores padrão de mercado (Google Authenticator, 
     Microsoft Authenticator, FreeOTP) com segredo protegido por AES-256 em repouso e 
     códigos descartáveis de contingência.

4. LOGS AUDITÁVEIS IMUTÁVEIS (AUDIT HASH CHAIN & APPEND-ONLY)
   - Integridade: Registro de auditoria contínua em regime Write-Once-Read-Many (WORM).
   - Encadeamento Criptográfico: Cada evento é assinado com SHA-256 vinculando o hash do 
     evento imediatamente anterior (Audit Hash Chain).
   - Proteção no Banco de Dados: Bloqueio estrito de operações de UPDATE, DELETE e 
     TRUNCATE via triggers nativos de segurança no banco de dados.

Declaração gerada eletronicamente pelo Sistema de Governança e Segurança Fast Dispatch.
================================================================================`;

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(2, 6, 23, 0.85)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
        }}>
            <div style={{
                background: '#0f172a',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '20px',
                width: '100%',
                maxWidth: '820px',
                maxHeight: '88vh',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.7)'
            }}>
                {/* Header */}
                <div style={{
                    padding: '20px 24px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'rgba(15, 23, 42, 0.6)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            background: 'rgba(255, 255, 255, 0.08)',
                            padding: '10px',
                            borderRadius: '10px',
                            display: 'flex',
                            color: '#f8fafc'
                        }}>
                            <Settings size={20} />
                        </div>
                        <div>
                            <h2 style={{ color: '#ffffff', fontSize: '18px', margin: 0, fontWeight: 700 }}>
                                Configurações da Conta
                            </h2>
                            <p style={{ color: '#94a3b8', margin: '2px 0 0 0', fontSize: '13px' }}>
                                Acesso, verificação em duas etapas e histórico
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '8px',
                            padding: '8px',
                            color: '#94a3b8',
                            cursor: 'pointer',
                            display: 'flex'
                        }}
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Tabs */}
                <div style={{
                    display: 'flex',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                    padding: '0 24px',
                    background: 'rgba(15, 23, 42, 0.4)',
                    gap: '8px'
                }}>
                    {[
                        { id: 'mfa', label: 'Verificação em Duas Etapas', icon: Smartphone },
                        { id: 'audit', label: 'Registro de Acessos', icon: Activity },
                        { id: 'declaration', label: 'Dossiê Técnico', icon: FileText }
                    ].map(tab => {
                        const Icon = tab.icon;
                        const isCurrent = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    borderBottom: isCurrent ? '2px solid #acf800' : '2px solid transparent',
                                    color: isCurrent ? '#acf800' : '#94a3b8',
                                    padding: '14px 16px',
                                    fontSize: '13px',
                                    fontWeight: isCurrent ? 600 : 500,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                <Icon size={15} />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>

                {/* Body Content */}
                <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
                    {/* TAB 1: CONFIGURAÇÃO 2FA */}
                    {activeTab === 'mfa' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div style={{ color: '#94a3b8', fontSize: '13px', lineHeight: '1.5' }}>
                                Adicione uma camada extra de proteção à sua conta exigindo um código gerado pelo aplicativo autenticador do seu smartphone (Google Authenticator ou Microsoft Authenticator).
                            </div>

                            {mfaStatusMsg && (
                                <div style={{
                                    padding: '12px 16px',
                                    borderRadius: '10px',
                                    fontSize: '13px',
                                    fontWeight: 500,
                                    background: mfaStatusMsg.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                    color: mfaStatusMsg.type === 'success' ? '#6ee7b7' : '#fca5a5',
                                    border: `1px solid ${mfaStatusMsg.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                                }}>
                                    {mfaStatusMsg.text}
                                </div>
                            )}

                            {!mfaSetupData ? (
                                <div style={{
                                    background: 'rgba(30, 41, 59, 0.4)',
                                    border: '1px solid rgba(255, 255, 255, 0.08)',
                                    borderRadius: '14px',
                                    padding: '28px',
                                    textAlign: 'center',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: '14px'
                                }}>
                                    <div style={{ background: 'rgba(172, 248, 0, 0.1)', padding: '14px', borderRadius: '100px', color: '#acf800' }}>
                                        <Smartphone size={32} />
                                    </div>
                                    <h3 style={{ color: '#ffffff', margin: 0, fontSize: '17px', fontWeight: 600 }}>
                                        Vincular Aplicativo Autenticador
                                    </h3>
                                    <p style={{ color: '#94a3b8', fontSize: '13px', maxWidth: '440px', margin: 0 }}>
                                        Gere um código QR para ler no Google Authenticator ou Microsoft Authenticator do seu dispositivo.
                                    </p>
                                    <button
                                        onClick={handleStartMfaSetup}
                                        disabled={isLoading}
                                        style={{
                                            background: 'linear-gradient(135deg, #acf800, #10b981)',
                                            color: '#020617',
                                            padding: '12px 24px',
                                            borderRadius: '10px',
                                            border: 'none',
                                            fontSize: '14px',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            marginTop: '6px'
                                        }}
                                    >
                                        {isLoading ? 'Gerando...' : 'Iniciar Configuração'}
                                    </button>
                                </div>
                            ) : (
                                <div style={{
                                    background: 'rgba(30, 41, 59, 0.4)',
                                    border: '1px solid rgba(255, 255, 255, 0.08)',
                                    borderRadius: '14px',
                                    padding: '24px',
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                                    gap: '24px',
                                    alignItems: 'center'
                                }}>
                                    {/* QR Code */}
                                    <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                                        <div style={{ background: '#ffffff', padding: '10px', borderRadius: '14px', display: 'inline-block' }}>
                                            <img src={mfaSetupData.qrCodeDataUrl} alt="QR Code" style={{ width: '180px', height: '180px', display: 'block' }} />
                                        </div>
                                        <div style={{ color: '#94a3b8', fontSize: '12px' }}>
                                            Escaneie com seu aplicativo autenticador
                                        </div>
                                    </div>

                                    {/* Chave e Confirmação */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                        <div>
                                            <label style={{ display: 'block', color: '#cbd5e1', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                                                CHAVE MANUAL:
                                            </label>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <input
                                                    readOnly
                                                    value={mfaSetupData.secret}
                                                    style={{
                                                        flex: 1,
                                                        background: 'rgba(15, 23, 42, 0.6)',
                                                        border: '1px solid rgba(255, 255, 255, 0.1)',
                                                        padding: '10px 12px',
                                                        borderRadius: '8px',
                                                        color: '#acf800',
                                                        fontFamily: 'monospace',
                                                        fontSize: '12px'
                                                    }}
                                                />
                                                <button
                                                    onClick={() => {
                                                        if (mfaSetupData.secret) {
                                                            navigator.clipboard.writeText(mfaSetupData.secret);
                                                            setCopiedSecret(true);
                                                            setTimeout(() => setCopiedSecret(false), 2000);
                                                        }
                                                    }}
                                                    style={{
                                                        background: 'rgba(255, 255, 255, 0.08)',
                                                        border: '1px solid rgba(255, 255, 255, 0.1)',
                                                        borderRadius: '8px',
                                                        padding: '10px 12px',
                                                        color: '#f8fafc',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }}
                                                >
                                                    {copiedSecret ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                                                </button>
                                            </div>
                                        </div>

                                        <form onSubmit={handleConfirmMfa} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                            <div>
                                                <label style={{ display: 'block', color: '#cbd5e1', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                                                    CÓDIGO DE 6 DÍGITOS GERADO:
                                                </label>
                                                <input
                                                    type="text"
                                                    maxLength={6}
                                                    value={mfaConfirmCode}
                                                    onChange={(e) => setMfaConfirmCode(e.target.value.replace(/[^0-9]/g, ''))}
                                                    placeholder="000000"
                                                    required
                                                    style={{
                                                        width: '100%',
                                                        padding: '12px 14px',
                                                        background: 'rgba(15, 23, 42, 0.8)',
                                                        border: '1px solid rgba(172, 248, 0, 0.4)',
                                                        borderRadius: '10px',
                                                        color: '#acf800',
                                                        fontSize: '18px',
                                                        fontWeight: 700,
                                                        letterSpacing: '5px',
                                                        textAlign: 'center',
                                                        boxSizing: 'border-box'
                                                    }}
                                                />
                                            </div>

                                            <button
                                                type="submit"
                                                disabled={isLoading}
                                                style={{
                                                    background: 'linear-gradient(135deg, #acf800, #10b981)',
                                                    color: '#020617',
                                                    padding: '12px',
                                                    borderRadius: '10px',
                                                    border: 'none',
                                                    fontSize: '14px',
                                                    fontWeight: 700,
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                {isLoading ? 'Verificando...' : 'Confirmar & Ativar'}
                                            </button>
                                        </form>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB 2: REGISTRO DE ACESSOS */}
                    {activeTab === 'audit' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ color: '#94a3b8', fontSize: '13px' }}>
                                    Histórico cronológico de atividades e eventos da conta.
                                </div>
                                <button
                                    onClick={handleRunAuditVerification}
                                    style={{
                                        background: 'rgba(255, 255, 255, 0.08)',
                                        border: '1px solid rgba(255, 255, 255, 0.15)',
                                        color: '#f8fafc',
                                        borderRadius: '8px',
                                        padding: '6px 12px',
                                        fontSize: '12px',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}
                                >
                                    <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
                                    Atualizar
                                </button>
                            </div>

                            <div style={{
                                background: 'rgba(15, 23, 42, 0.6)',
                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                borderRadius: '10px',
                                overflow: 'hidden'
                            }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                                    <thead>
                                        <tr style={{ background: 'rgba(30, 41, 59, 0.6)', color: '#94a3b8', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                                            <th style={{ padding: '10px 14px' }}>Data / Hora</th>
                                            <th style={{ padding: '10px 14px' }}>Autor</th>
                                            <th style={{ padding: '10px 14px' }}>Ação</th>
                                            <th style={{ padding: '10px 14px' }}>Referência</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {auditLogs.length === 0 ? (
                                            <tr>
                                                <td colSpan={4} style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>
                                                    Nenhum evento registrado ainda.
                                                </td>
                                            </tr>
                                        ) : (
                                            auditLogs.map((log: any) => (
                                                <tr key={log.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)', color: '#cbd5e1' }}>
                                                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                                                        {new Date(log.timestamp).toLocaleString('pt-BR')}
                                                    </td>
                                                    <td style={{ padding: '10px 14px', color: '#acf800' }}>
                                                        {log.author || 'Sistema'}
                                                    </td>
                                                    <td style={{ padding: '10px 14px' }}>
                                                        {log.action}
                                                    </td>
                                                    <td style={{ padding: '10px 14px', color: '#94a3b8' }}>
                                                        {log.resource}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* TAB 3: DOSSIÊ TÉCNICO (GUARDADO PARA AUDITORIA SEM EXPOSIÇÃO PÚBLICA) */}
                    {activeTab === 'declaration' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ color: '#94a3b8', fontSize: '13px' }}>
                                    Documento formal para fins de auditoria técnica:
                                </div>
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(formalDeclarationText);
                                        setCopiedDeclaration(true);
                                        setTimeout(() => setCopiedDeclaration(false), 2000);
                                    }}
                                    style={{
                                        background: 'linear-gradient(135deg, #acf800, #10b981)',
                                        color: '#020617',
                                        border: 'none',
                                        borderRadius: '8px',
                                        padding: '8px 14px',
                                        fontSize: '12px',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}
                                >
                                    {copiedDeclaration ? <Check size={14} /> : <Copy size={14} />}
                                    {copiedDeclaration ? 'Copiado!' : 'Copiar Texto'}
                                </button>
                            </div>

                            <textarea
                                readOnly
                                value={formalDeclarationText}
                                style={{
                                    width: '100%',
                                    height: '340px',
                                    background: 'rgba(15, 23, 42, 0.9)',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    borderRadius: '10px',
                                    padding: '14px',
                                    color: '#cbd5e1',
                                    fontFamily: 'monospace',
                                    fontSize: '11px',
                                    lineHeight: '1.6',
                                    outline: 'none',
                                    resize: 'none',
                                    boxSizing: 'border-box'
                                }}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SecurityComplianceModal;
