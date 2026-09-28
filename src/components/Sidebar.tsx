import React from 'react';
import { Zap, Smartphone, Activity, Database, ShieldCheck, RefreshCw, Layers, FileText } from 'lucide-react';
import { RedisQueueStatus, AppTab } from '../types';

interface SidebarProps {
    activeTab: AppTab;
    setActiveTab: (tab: AppTab) => void;
    redisStatus: RedisQueueStatus;
    onRefreshRedis: () => void;
    contactCount: number;
    wabaCount: number;
    bmCount?: number;
    templatesCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
    activeTab,
    setActiveTab,
    redisStatus,
    onRefreshRedis,
    contactCount,
    wabaCount,
    bmCount = 0,
    templatesCount = 0
}) => {
    return (
        <aside className="sidebar">
            {/* Brand Logo & Name */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px', padding: '0 4px' }}>
                <div style={{
                    background: 'var(--primary-color)',
                    color: '#ffffff',
                    width: '40px',
                    height: '40px',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 12px var(--primary-glow)',
                    flexShrink: 0
                }}>
                    <Zap size={22} strokeWidth={2.6} />
                </div>
                <div>
                    <h1 style={{ fontSize: '1.25rem', fontWeight: 900, letterSpacing: '-0.5px', lineHeight: 1.1 }}>
                        Plug &amp; Sales
                    </h1>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)', fontWeight: 600 }}>
                        Disparador &amp; Gestão Meta
                    </span>
                </div>
            </div>

            {/* Navigation Links */}
            <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {/* TAB: TEMPLATES META (WHATSAPP) */}
                <button
                    className={`sidebar-nav-item ${activeTab === 'templates' ? 'active' : ''}`}
                    onClick={() => setActiveTab('templates')}
                >
                    <FileText size={18} />
                    <span style={{ flex: 1 }}>Templates Meta</span>
                    <span style={{
                        background: activeTab === 'templates' ? 'var(--primary-color)' : '#ecfdf5',
                        color: activeTab === 'templates' ? '#fff' : '#059669',
                        padding: '2px 7px',
                        borderRadius: '999px',
                        fontSize: '0.68rem',
                        fontWeight: 800
                    }}>
                        {templatesCount > 0 ? templatesCount : 'Recentes'}
                    </span>
                </button>

                {/* TAB: CONTROLE DE BMS */}
                <button
                    className={`sidebar-nav-item ${activeTab === 'bms' ? 'active' : ''}`}
                    onClick={() => setActiveTab('bms')}
                >
                    <Layers size={18} />
                    <span style={{ flex: 1 }}>Controle de BMs</span>
                    {bmCount > 0 ? (
                        <span style={{
                            background: activeTab === 'bms' ? 'var(--primary-color)' : '#e0f2fe',
                            color: activeTab === 'bms' ? '#fff' : '#0369a1',
                            padding: '2px 8px',
                            borderRadius: '999px',
                            fontSize: '0.72rem',
                            fontWeight: 700
                        }}>
                            {bmCount}
                        </span>
                    ) : (
                        <span style={{
                            background: activeTab === 'bms' ? 'var(--primary-color)' : '#f1f5f9',
                            color: activeTab === 'bms' ? '#fff' : '#64748b',
                            padding: '1px 6px',
                            borderRadius: '6px',
                            fontSize: '0.66rem',
                            fontWeight: 700
                        }}>
                            14 abas
                        </span>
                    )}
                </button>

                <button
                    className={`sidebar-nav-item ${activeTab === 'registry' ? 'active' : ''}`}
                    onClick={() => setActiveTab('registry')}
                >
                    <Smartphone size={18} />
                    <span style={{ flex: 1 }}>Registrar WABA</span>
                    {wabaCount > 0 && (
                        <span style={{
                            background: activeTab === 'registry' ? 'var(--primary-color)' : '#e2e8f0',
                            color: activeTab === 'registry' ? '#fff' : 'var(--text-main)',
                            padding: '2px 8px',
                            borderRadius: '999px',
                            fontSize: '0.72rem',
                            fontWeight: 700
                        }}>
                            {wabaCount}
                        </span>
                    )}
                </button>

                <button
                    className={`sidebar-nav-item ${activeTab === 'dispatch' ? 'active' : ''}`}
                    onClick={() => setActiveTab('dispatch')}
                >
                    <Activity size={18} />
                    <span style={{ flex: 1 }}>Multi-Remetente</span>
                    {contactCount > 0 && (
                        <span style={{
                            background: activeTab === 'dispatch' ? 'var(--primary-color)' : '#e2e8f0',
                            color: activeTab === 'dispatch' ? '#fff' : 'var(--text-main)',
                            padding: '2px 8px',
                            borderRadius: '999px',
                            fontSize: '0.72rem',
                            fontWeight: 700
                        }}>
                            {contactCount}
                        </span>
                    )}
                </button>

                <button
                    className={`sidebar-nav-item ${activeTab === 'records' ? 'active' : ''}`}
                    onClick={() => setActiveTab('records')}
                >
                    <span style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: '#10b981',
                        boxShadow: '0 0 8px #10b981'
                    }} />
                    <span style={{ flex: 1 }}>Registro (Ao Vivo)</span>
                    <span style={{
                        background: activeTab === 'records' ? 'var(--primary-color)' : '#ecfdf5',
                        color: activeTab === 'records' ? '#fff' : '#059669',
                        padding: '2px 7px',
                        borderRadius: '999px',
                        fontSize: '0.68rem',
                        fontWeight: 800
                    }}>
                        LIVE
                    </span>
                </button>

                <button
                    className={`sidebar-nav-item ${activeTab === 'redis' ? 'active' : ''}`}
                    onClick={() => setActiveTab('redis')}
                >
                    <Database size={18} />
                    <span style={{ flex: 1 }}>Fila Redis</span>
                    {redisStatus.queueLength > 0 && (
                        <span style={{
                            background: '#dcfce7',
                            color: '#15803d',
                            padding: '2px 8px',
                            borderRadius: '999px',
                            fontSize: '0.72rem',
                            fontWeight: 700
                        }}>
                            {redisStatus.queueLength}
                        </span>
                    )}
                </button>
            </nav>

            {/* Bottom Meta & BM Card */}
            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* BM Luiz Info */}
                <div style={{
                    background: '#f8fafc',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '12px',
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                }}>
                    <ShieldCheck size={20} color="var(--primary-color)" />
                    <div style={{ fontSize: '0.78rem' }}>
                        <span style={{ color: 'var(--text-dim)', display: 'block' }}>Conta Oficial</span>
                        <strong style={{ color: 'var(--text-main)' }}>BM do Luiz</strong>
                    </div>
                </div>

                {/* Redis Real-time Status Card */}
                <div style={{
                    background: redisStatus.isRunning ? '#ecfdf5' : '#f8fafc',
                    border: `1px solid ${redisStatus.isRunning ? '#a7f3d0' : 'var(--border-subtle)'}`,
                    borderRadius: '12px',
                    padding: '12px 14px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                background: redisStatus.isRunning ? 'var(--status-approved)' : (redisStatus.queueLength > 0 ? 'var(--status-pending)' : '#94a3b8'),
                                boxShadow: redisStatus.isRunning ? '0 0 8px #16a34a' : 'none'
                            }} />
                            <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                                Fila Redis:
                            </span>
                        </div>
                        <button
                            onClick={onRefreshRedis}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}
                            title="Atualizar status do Redis"
                        >
                            <RefreshCw size={12} />
                        </button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--text-main)' }}>
                            {redisStatus.queueLength}
                        </span>
                        <span style={{ fontSize: '0.72rem', color: redisStatus.isRunning ? 'var(--status-approved)' : 'var(--text-dim)', fontWeight: 600 }}>
                            {redisStatus.isRunning ? 'Processando' : 'Ocioso'}
                        </span>
                    </div>
                </div>
            </div>
        </aside>
    );
};
