import React, { useState } from 'react';
import { api } from '../services/api';
import { Lock, Mail, ShieldAlert, ArrowRight, Zap } from 'lucide-react';

interface LoginProps {
    onLoginSuccess: (token: string, user: any) => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const res = await api.login(email, password);
            if (res.success && res.token) {
                onLoginSuccess(res.token, res.user);
            } else {
                setError(res.error || 'Credenciais inválidas.');
            }
        } catch (err: any) {
            setError(err.message || 'Erro ao realizar login. Tente novamente.');
        } finally {
            setIsLoading(false);
        }
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
                <div style={{ textAlign: 'center', marginBottom: '40px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '16px' }}>
                        <div style={{ background: 'linear-gradient(135deg, #acf800, #10b981)', padding: '10px', borderRadius: '12px', display: 'flex' }}>
                            <Zap size={28} color="#020617" strokeWidth={2.5} />
                        </div>
                        <h1 style={{ color: '#ffffff', fontSize: '32px', margin: 0, fontWeight: 800, letterSpacing: '-0.5px' }}>
                            Fast Plug
                        </h1>
                    </div>
                    <p style={{ color: '#94a3b8', margin: 0, fontSize: '15px', fontWeight: 500 }}>
                        Acesso Restrito ao Sistema Administrativo
                    </p>
                </div>

                {error && (
                    <div style={{
                        background: 'rgba(239, 68, 68, 0.1)', color: '#fca5a5', padding: '14px 16px',
                        borderRadius: '12px', fontSize: '14px', marginBottom: '28px', border: '1px solid rgba(239, 68, 68, 0.2)',
                        display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 500
                    }}>
                        <ShieldAlert size={18} color="#ef4444" />
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    <div>
                        <label style={{ display: 'block', color: '#cbd5e1', fontSize: '13px', marginBottom: '8px', fontWeight: 600, letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                            Login (Admin)
                        </label>
                        <div style={{ position: 'relative' }}>
                            <div style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', display: 'flex' }}>
                                <Mail size={18} />
                            </div>
                            <input
                                type="text"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="Insira seu login"
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
                            marginTop: '12px', background: 'linear-gradient(135deg, #acf800, #84cc00)', color: '#020617', padding: '16px', 
                            borderRadius: '12px', border: 'none', fontSize: '16px', fontWeight: 700, 
                            cursor: isLoading ? 'wait' : 'pointer', opacity: isLoading ? 0.7 : 1,
                            transition: 'all 0.2s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                            boxShadow: '0 4px 14px 0 rgba(172, 248, 0, 0.39)'
                        }}
                        onMouseEnter={(e) => !isLoading && (e.currentTarget.style.transform = 'translateY(-2px)', e.currentTarget.style.boxShadow = '0 6px 20px rgba(172, 248, 0, 0.5)')}
                        onMouseLeave={(e) => !isLoading && (e.currentTarget.style.transform = 'translateY(0)', e.currentTarget.style.boxShadow = '0 4px 14px 0 rgba(172, 248, 0, 0.39)')}
                    >
                        {isLoading ? 'Autenticando...' : (
                            <>Entrar no Sistema <ArrowRight size={18} strokeWidth={2.5} /></>
                        )}
                    </button>
                </form>

                <div style={{ marginTop: '32px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10b981', fontSize: '12px', fontWeight: 600, background: 'rgba(16, 185, 129, 0.1)', padding: '6px 12px', borderRadius: '100px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                        <ShieldAlert size={14} /> Security-First Architecture
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;
