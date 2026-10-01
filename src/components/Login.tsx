import React, { useState } from 'react';
import { api } from '../services/api';

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
            display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', 
            background: 'linear-gradient(135deg, #0b0f19 0%, #111827 100%)', fontFamily: 'sans-serif'
        }}>
            <div style={{
                background: '#1f2937', padding: '40px', borderRadius: '16px', width: '100%', maxWidth: '400px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', border: '1px solid #374151'
            }}>
                <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                    <h1 style={{ color: '#fff', fontSize: '24px', margin: '0 0 8px 0', fontWeight: 600 }}>Plug&Sales</h1>
                    <p style={{ color: '#9ca3af', margin: 0, fontSize: '14px' }}>Acesso Restrito ao Sistema Administrativo</p>
                </div>

                {error && (
                    <div style={{
                        background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '12px',
                        borderRadius: '8px', fontSize: '14px', marginBottom: '24px', border: '1px solid rgba(239, 68, 68, 0.2)'
                    }}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div>
                        <label style={{ display: 'block', color: '#d1d5db', fontSize: '13px', marginBottom: '8px', fontWeight: 500 }}>Login (Admin)</label>
                        <input
                            type="text"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="Insira seu login"
                            required
                            style={{
                                width: '100%', padding: '12px 16px', background: '#111827', border: '1px solid #374151',
                                borderRadius: '8px', color: '#fff', fontSize: '14px', outline: 'none', transition: 'border-color 0.2s',
                                boxSizing: 'border-box'
                            }}
                        />
                    </div>
                    
                    <div>
                        <label style={{ display: 'block', color: '#d1d5db', fontSize: '13px', marginBottom: '8px', fontWeight: 500 }}>Senha</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Insira sua senha"
                            required
                            style={{
                                width: '100%', padding: '12px 16px', background: '#111827', border: '1px solid #374151',
                                borderRadius: '8px', color: '#fff', fontSize: '14px', outline: 'none', transition: 'border-color 0.2s',
                                boxSizing: 'border-box'
                            }}
                        />
                    </div>

                    <button 
                        type="submit" 
                        disabled={isLoading}
                        style={{
                            marginTop: '8px', background: '#acf800', color: '#0b0f19', padding: '14px', 
                            borderRadius: '8px', border: 'none', fontSize: '15px', fontWeight: 600, 
                            cursor: isLoading ? 'not-allowed' : 'pointer', opacity: isLoading ? 0.7 : 1,
                            transition: 'background 0.2s, transform 0.1s'
                        }}
                    >
                        {isLoading ? 'Autenticando...' : 'Entrar no Sistema'}
                    </button>
                </form>

                <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '12px', color: '#6b7280' }}>
                    Protegido pela arquitetura Security-First
                </div>
            </div>
        </div>
    );
};

export default Login;
