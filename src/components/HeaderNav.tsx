import React from 'react';
import { Zap, ShieldCheck, Activity, Layers, Database, RefreshCw } from 'lucide-react';
import { RedisQueueStatus } from '../types';

interface HeaderNavProps {
    activeTab: 'triage' | 'dispatch' | 'redis';
    setActiveTab: (tab: 'triage' | 'dispatch' | 'redis') => void;
    redisStatus: RedisQueueStatus;
    onRefreshRedis: () => void;
    contactCount: number;
}

export const HeaderNav: React.FC<HeaderNavProps> = ({
    activeTab,
    setActiveTab,
    redisStatus,
    onRefreshRedis,
    contactCount
}) => {
    return (
        <header className="glass-panel" style={{ padding: '16px 24px', marginBottom: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
                
                {/* Logo & Brand */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ 
                        background: 'var(--primary-color)', 
                        color: '#07090e', 
                        width: '42px', 
                        height: '42px', 
                        borderRadius: '12px', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        boxShadow: '0 4px 16px var(--primary-glow)'
                    }}>
                        <Zap size={24} strokeWidth={2.6} />
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h1 style={{ fontSize: '1.35rem', fontWeight: 800, letterSpacing: '-0.5px' }}>Plug &amp; Sales</h1>
                            <span className="badge badge-approved" style={{ fontSize: '0.68rem', padding: '2px 8px' }}>
                                Standalone Engine
                            </span>
                        </div>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            Disparo em Massa Multi-Remetente Infobip com Fila Redis
                        </p>
                    </div>
                </div>

                {/* Central Status: BM Luiz & Redis Pill */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    {/* BM Luiz Badge */}
                    <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '8px', 
                        background: 'rgba(255, 255, 255, 0.04)', 
                        padding: '6px 14px', 
                        borderRadius: '999px',
                        border: '1px solid var(--border-subtle)',
                        fontSize: '0.8rem'
                    }}>
                        <ShieldCheck size={16} color="var(--primary-color)" />
                        <span style={{ color: 'var(--text-muted)' }}>Conta Meta:</span>
                        <strong style={{ color: '#fff' }}>BM do Luiz</strong>
                        <span style={{ opacity: 0.4 }}>|</span>
                        <code style={{ fontSize: '0.72rem', color: 'var(--primary-color)' }}>4k3e4p.api-us</code>
                    </div>

                    {/* Live Redis Status Pill */}
                    <button 
                        onClick={onRefreshRedis}
                        title="Clique para atualizar status do Redis"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            background: redisStatus.isRunning ? 'rgba(34, 197, 94, 0.12)' : 'rgba(255, 255, 255, 0.04)',
                            border: `1px solid ${redisStatus.isRunning ? 'rgba(34, 197, 94, 0.3)' : 'var(--border-subtle)'}`,
                            padding: '6px 14px',
                            borderRadius: '999px',
                            color: redisStatus.isRunning ? 'var(--status-approved)' : 'var(--text-muted)',
                            fontSize: '0.8rem',
                            cursor: 'pointer'
                        }}
                    >
                        <span style={{ 
                            width: '8px', 
                            height: '8px', 
                            borderRadius: '50%', 
                            background: redisStatus.isRunning ? 'var(--status-approved)' : (redisStatus.queueLength > 0 ? '#eab308' : '#64748b'),
                            boxShadow: redisStatus.isRunning ? '0 0 8px #22c55e' : 'none'
                        }} />
                        <span>Fila Redis:</span>
                        <strong style={{ color: '#fff' }}>{redisStatus.queueLength}</strong>
                        {redisStatus.isRunning && <span style={{ fontSize: '0.72rem', color: 'var(--status-approved)' }}>(Ativa)</span>}
                        <RefreshCw size={12} className="opacity-50" />
                    </button>
                </div>

                {/* Navigation Tabs */}
                <nav style={{ display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.5)', padding: '4px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                    <button
                        onClick={() => setActiveTab('triage')}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '8px',
                            background: activeTab === 'triage' ? 'var(--primary-color)' : 'transparent',
                            color: activeTab === 'triage' ? '#07090e' : 'var(--text-muted)',
                            fontWeight: 700,
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '0.86rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            transition: 'all 0.2s'
                        }}
                    >
                        <Layers size={16} />
                        Triagem n8n
                    </button>

                    <button
                        onClick={() => setActiveTab('dispatch')}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '8px',
                            background: activeTab === 'dispatch' ? 'var(--primary-color)' : 'transparent',
                            color: activeTab === 'dispatch' ? '#07090e' : 'var(--text-muted)',
                            fontWeight: 700,
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '0.86rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            transition: 'all 0.2s'
                        }}
                    >
                        <Activity size={16} />
                        Multi-Remetente
                        {contactCount > 0 && (
                            <span style={{ 
                                background: activeTab === 'dispatch' ? '#000' : 'rgba(172, 248, 0, 0.2)', 
                                color: activeTab === 'dispatch' ? 'var(--primary-color)' : '#fff',
                                padding: '1px 6px', 
                                borderRadius: '999px', 
                                fontSize: '0.7rem' 
                            }}>
                                {contactCount}
                            </span>
                        )}
                    </button>

                    <button
                        onClick={() => setActiveTab('redis')}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '8px',
                            background: activeTab === 'redis' ? 'var(--primary-color)' : 'transparent',
                            color: activeTab === 'redis' ? '#07090e' : 'var(--text-muted)',
                            fontWeight: 700,
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '0.86rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            transition: 'all 0.2s'
                        }}
                    >
                        <Database size={16} />
                        Fila Redis
                    </button>
                </nav>

            </div>
        </header>
    );
};
