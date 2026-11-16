import React, { useState } from 'react';
import { api } from '../services/api';
import { safeStorage } from '../services/safeStorage';
import { Lock, Mail, ShieldAlert, ArrowRight, Zap, KeyRound, ArrowLeft } from 'lucide-react';

interface LoginProps {
    onLoginSuccess: (token: string, user: any) => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // Estado do fluxo de verificação em duas etapas
    const [step, setStep] = useState<'credentials' | 'mfa'>('credentials');
    const [mfaToken, setMfaToken] = useState('');
    const [mfaCode, setMfaCode] = useState('');

    const handleSubmitCredentials = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            // Garante espaço livre no navegador antes de tentar autenticar
            safeStorage.forceFreeQuota();

            const res = await api.login(email, password);
            if (res.success) {
                if (res.requireMfa && res.mfaToken) {
                    setMfaToken(res.mfaToken);
                    setStep('mfa');
                    setMfaCode('');
                } else if (res.token) {
                    onLoginSuccess(res.token, res.user);
                }
            } else {
                setError(res.error || 'Credenciais inválidas.');
            }
        } catch (err: any) {
            setError(err.message || 'Erro ao realizar login. Tente novamente.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmitMfa = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!mfaCode || mfaCode.trim().length < 6) {
            setError('Insira o código de 6 dígitos gerado pelo seu autenticador.');
            return;
        }

        setIsLoading(true);
        try {
            // Garante espaço livre no navegador antes de validar segundo fator
            safeStorage.forceFreeQuota();

            const res = await api.verifyMfa(mfaToken, mfaCode.trim());
            if (res.success && res.token) {
                onLoginSuccess(res.token, res.user);
            } else {
                setError(res.error || 'Código incorreto ou expirado.');
            }
        } catch (err: any) {
            setError(err.message || 'Falha na validação do código.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleBackToCredentials = () => {
        setStep('credentials');
        setMfaToken('');
        setMfaCode('');
        setError('');
    };

    return (
        <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh',
            background: 'radial-gradient(circle at 50% -20%, #1e293b 0%, #020617 100%)',
            fontFamily: "'Inter', sans-serif", padding: '20px', position: 'relative', overflow: 'hidden'
        }}>
            {/* Elementos decorativos de fundo */}
            <div style={{ position: 'absolute', top: '-10%', left: '-10%', width: '40%', height: '40%', background: 'radial-gradient(circle, rgba(172, 248, 0, 0.15) 0%, transparent 70%)', filter: 'blur(60px)', zIndex: 0 }}></div>
            <div style={{ position: 'absolute', bottom: '-10%', right: '-10%', width: '40%', height: '40%', background: 'radial-gradient(circle, rgba(16, 185, 129, 0.1) 0%, transparent 70%)', filter: 'blur(60px)', zIndex: 0 }}></div>

            <div style={{
                background: 'rgba(30, 41, 59, 0.4)', 
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                padding: '48px 40px', 
                borderRadius: '24px', 
                width: '100%', 
                maxWidth: '440px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1)',
                zIndex: 1,
                position: 'relative'
            }}>
                <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '16px' }}>
                        <div style={{ background: 'linear-gradient(135deg, #acf800, #10b981)', padding: '10px', borderRadius: '12px', display: 'flex' }}>
                            <Zap size={28} color="#020617" strokeWidth={2.5} />
                        </div>
                        <h1 style={{ color: '#ffffff', fontSize: '32px', margin: 0, fontWeight: 800, letterSpacing: '-0.5px' }}>
                            Fast Dispatch
                        </h1>
                    </div>
                    <p style={{ color: '#94a3b8', margin: 0, fontSize: '15px', fontWeight: 500 }}>
                        {step === 'credentials' 
                            ? 'Acesso Restrito ao Painel'
                            : 'Verificação em Duas Etapas'}
                    </p>
                </div>

                {error && (
                    <div style={{
                        background: 'rgba(239, 68, 68, 0.1)', color: '#fca5a5', padding: '14px 16px',
                        borderRadius: '12px', fontSize: '14px', marginBottom: '24px', border: '1px solid rgba(239, 68, 68, 0.2)',
                        display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 500
                    }}>
                        <ShieldAlert size={18} color="#ef4444" />
                        <span>{error}</span>
                    </div>
                )}

                {step === 'credentials' ? (
                    <form onSubmit={handleSubmitCredentials} style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
                        <div>
                            <label style={{ display: 'block', color: '#cbd5e1', fontSize: '13px', marginBottom: '8px', fontWeight: 600, letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                                Usuário
                            </label>
                            <div style={{ position: 'relative' }}>
                                <div style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', display: 'flex' }}>
                                    <Mail size={18} />
                                </div>
                                <input
                                    type="text"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="Insira seu identificador"
                                    required
                                    style={{
                                        width: '100%', padding: '14px 16px 14px 44px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255, 255, 255, 0.1)',
                                        borderRadius: '12px', color: '#f8fafc', fontSize: '15px', outline: 'none', transition: 'all 0.2s ease',
                                        boxSizing: 'border-box'
                                    }}
                                    onFocus={(e) => e.target.style.borderColor = '#acf800'}
                                    onBlur={(e) => e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)'}
                                />
                            </div>
                        </div>
                        
                        <div>
                            <label style={{ display: 'block', color: '#cbd5e1', fontSize: '13px', marginBottom: '8px', fontWeight: 600, letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                                Senha
                            </label>
                            <div style={{ position: 'relative' }}>
                                <div style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', display: 'flex' }}>
                                    <Lock size={18} />
                                </div>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Insira sua senha"
                                    required
                                    style={{
                                        width: '100%', padding: '14px 16px 14px 44px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255, 255, 255, 0.1)',
                                        borderRadius: '12px', color: '#f8fafc', fontSize: '15px', outline: 'none', transition: 'all 0.2s ease',
                                        boxSizing: 'border-box'
                                    }}
                                    onFocus={(e) => e.target.style.borderColor = '#acf800'}
                                    onBlur={(e) => e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)'}
                                />
                            </div>
                        </div>

                        <button 
                            type="submit" 
                            disabled={isLoading}
                            style={{
                                marginTop: '10px', background: 'linear-gradient(135deg, #acf800, #84cc00)', color: '#020617', padding: '16px', 
                                borderRadius: '12px', border: 'none', fontSize: '16px', fontWeight: 700, 
                                cursor: isLoading ? 'wait' : 'pointer', opacity: isLoading ? 0.7 : 1,
                                transition: 'all 0.2s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                boxShadow: '0 4px 14px 0 rgba(172, 248, 0, 0.39)'
                            }}
                        >
                            {isLoading ? 'Verificando...' : (
                                <>Avançar <ArrowRight size={18} strokeWidth={2.5} /></>
                            )}
                        </button>
                    </form>
                ) : (
                    <form onSubmit={handleSubmitMfa} style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
                        <div style={{
                            background: 'rgba(172, 248, 0, 0.05)',
                            border: '1px solid rgba(172, 248, 0, 0.2)',
                            borderRadius: '12px',
                            padding: '14px',
                            display: 'flex',
                            gap: '12px',
                            alignItems: 'center'
                        }}>
                            <div style={{ background: '#acf800', borderRadius: '8px', padding: '8px', color: '#020617', display: 'flex' }}>
                                <KeyRound size={20} />
                            </div>
                            <div style={{ color: '#cbd5e1', fontSize: '13px', lineHeight: '1.4' }}>
                                Digite o código de <strong>6 dígitos</strong> do seu aplicativo autenticador.
                            </div>
                        </div>

                        <div>
                            <label style={{ display: 'block', color: '#cbd5e1', fontSize: '13px', marginBottom: '8px', fontWeight: 600, letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                                Código de Verificação
                            </label>
                            <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                maxLength={6}
                                autoFocus
                                value={mfaCode}
                                onChange={(e) => setMfaCode(e.target.value.replace(/[^0-9]/g, ''))}
                                placeholder="000000"
                                required
                                style={{
                                    width: '100%', padding: '16px', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(172, 248, 0, 0.3)',
                                    borderRadius: '12px', color: '#acf800', fontSize: '28px', fontWeight: 800, textAlign: 'center',
                                    letterSpacing: '10px', outline: 'none', transition: 'all 0.2s ease', boxSizing: 'border-box'
                                }}
                            />
                        </div>

                        <button 
                            type="submit" 
                            disabled={isLoading}
                            style={{
                                marginTop: '10px', background: 'linear-gradient(135deg, #acf800, #84cc00)', color: '#020617', padding: '16px', 
                                borderRadius: '12px', border: 'none', fontSize: '16px', fontWeight: 700, 
                                cursor: isLoading ? 'wait' : 'pointer', opacity: isLoading ? 0.7 : 1,
                                transition: 'all 0.2s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                boxShadow: '0 4px 14px 0 rgba(172, 248, 0, 0.39)'
                            }}
                        >
                            {isLoading ? 'Validando...' : (
                                <>Entrar <ArrowRight size={18} strokeWidth={2.5} /></>
                            )}
                        </button>

                        <button
                            type="button"
                            onClick={handleBackToCredentials}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#94a3b8',
                                fontSize: '14px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                                marginTop: '4px'
                            }}
                        >
                            <ArrowLeft size={16} /> Voltar para login com senha
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
};

export default Login;
