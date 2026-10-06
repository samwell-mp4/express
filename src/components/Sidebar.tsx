import React, { useState } from 'react';
import { Zap, Smartphone, Activity, Layers, UploadCloud, PlusCircle, FileSpreadsheet, Image as ImageIcon, Link as LinkIcon, User, LogOut, UserPlus } from 'lucide-react';
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
    bmCount = 0
}) => {
    // Current user profile state
    const [user] = useState<{ name: string; email: string }>(() => {
        try {
            const raw = localStorage.getItem('auth_user') || localStorage.getItem('pns_user');
            if (raw) {
                const parsed = JSON.parse(raw);
                return {
                    name: parsed.name || parsed.nome || 'Meu Perfil',
                    email: parsed.email || 'operador@fastdispatch.com.br'
                };
            }
        } catch {}
        return {
            name: 'Meu Perfil',
            email: 'operador@fastdispatch.com.br'
        };
    });

    const handleLogout = () => {
        if (!window.confirm('Deseja realmente sair da sua conta?')) return;
        localStorage.removeItem('auth_user');
        localStorage.removeItem('auth_token');
        localStorage.removeItem('pns_user');
        if (window.location.pathname.startsWith('/')) {
            window.location.href = '/login';
        } else {
            window.location.reload();
        }
    };

    return (
        <aside className="sidebar">
            {/* Brand Logo & Name */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', padding: '4px 6px' }}>
                <div style={{
                    background: '#f2f7f5',
                    border: '1px solid #bbf7d0',
                    color: '#059669',
                    width: '32px',
                    height: '32px',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                }}>
                    <Zap size={16} strokeWidth={2.2} />
                </div>
                <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontSize: '14.5px', fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.2, color: 'var(--text-main)' }}>
                        Fast Dispatch
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 400 }}>
                        Operacional Meta
                    </span>
                </div>
            </div>

            {/* Navigation Links */}
            <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {/* TAB: UPLOAD CLIENTES */}
                <button
                    className={`sidebar-nav-item ${activeTab === 'upload-clientes' ? 'active' : ''}`}
                    onClick={() => setActiveTab('upload-clientes')}
                >
                    <UploadCloud size={16} />
                    <span style={{ flex: 1 }}>Upload Clientes</span>
                    <span style={{
                        background: '#f3f4f6',
                        color: '#4b5563',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 500
                    }}>
                        Leads
                    </span>
                </button>

                {/* TAB: CRIAR TEMPLATE */}
                <button
                    className={`sidebar-nav-item ${activeTab === 'create-template' ? 'active' : ''}`}
                    onClick={() => setActiveTab('create-template')}
                >
                    <PlusCircle size={16} />
                    <span style={{ flex: 1 }}>Criar Template</span>
                    <span style={{
                        background: '#fef3c7',
                        color: '#92400e',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 500
                    }}>
                        Novo
                    </span>
                </button>

                {/* TAB: HIGIENIZADOR DE PLANILHAS */}
                <button
                    className={`sidebar-nav-item ${activeTab === 'spreadsheet-cleaner' ? 'active' : ''}`}
                    onClick={() => setActiveTab('spreadsheet-cleaner')}
                >
                    <FileSpreadsheet size={16} />
                    <span style={{ flex: 1 }}>Higienizar Planilha</span>
                    <span style={{
                        background: '#f3f4f6',
                        color: '#4b5563',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 500
                    }}>
                        Limpador
                    </span>
                </button>

                {/* TAB: UPLOAD DE MÍDIAS (MEDIA HOSTING) */}
                <button
                    className={`sidebar-nav-item ${activeTab === 'media-hosting' ? 'active' : ''}`}
                    onClick={() => setActiveTab('media-hosting')}
                >
                    <ImageIcon size={16} />
                    <span style={{ flex: 1 }}>Upload de Mídias</span>
                    <span style={{
                        background: '#eff6ff',
                        color: '#1d4ed8',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 500
                    }}>
                        Hosting
                    </span>
                </button>

                {/* TAB: ENCURTADOR & ROTATOR PRO */}
                <button
                    className={`sidebar-nav-item ${activeTab === 'rotator' ? 'active' : ''}`}
                    onClick={() => setActiveTab('rotator')}
                >
                    <LinkIcon size={16} />
                    <span style={{ flex: 1 }}>Encurtador &amp; Rotator</span>
                    <span style={{
                        background: '#eff6ff',
                        color: '#1d4ed8',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 500
                    }}>
                        PRO
                    </span>
                </button>

                {/* TAB: CONTROLE DE BMS */}
                <button
                    className={`sidebar-nav-item ${activeTab === 'bms' ? 'active' : ''}`}
                    onClick={() => setActiveTab('bms')}
                >
                    <Layers size={16} />
                    <span style={{ flex: 1 }}>Controle de BMs</span>
                    <span style={{
                        background: bmCount > 0 ? '#eff6ff' : '#f3f4f6',
                        color: bmCount > 0 ? '#1d4ed8' : '#6b7280',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 500
                    }}>
                        {bmCount > 0 ? bmCount : '14 abas'}
                    </span>
                </button>

                {/* TAB: REGISTRAR WABA */}
                <button
                    className={`sidebar-nav-item ${activeTab === 'registry' ? 'active' : ''}`}
                    onClick={() => setActiveTab('registry')}
                >
                    <Smartphone size={16} />
                    <span style={{ flex: 1 }}>Registrar WABA</span>
                    {wabaCount > 0 && (
                        <span style={{
                            background: '#f3f4f6',
                            color: '#4b5563',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 500
                        }}>
                            {wabaCount}
                        </span>
                    )}
                </button>

                {/* TAB: CADASTRAR REMETENTE (EMBEDDING) */}
                <button
                    className={`sidebar-nav-item ${activeTab === 'embedded-signup' ? 'active' : ''}`}
                    onClick={() => setActiveTab('embedded-signup')}
                >
                    <UserPlus size={16} />
                    <span style={{ flex: 1 }}>Cadastrar Remetente</span>
                    <span style={{
                        background: '#ecfdf5',
                        color: '#059669',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 600,
                        border: '1px solid #a7f3d0'
                    }}>
                        Embedding
                    </span>
                </button>

                {/* TAB: MULTI-REMETENTE */}
                <button
                    className={`sidebar-nav-item ${activeTab === 'dispatch' ? 'active' : ''}`}
                    onClick={() => setActiveTab('dispatch')}
                >
                    <Activity size={16} />
                    <span style={{ flex: 1 }}>Multi-Remetente</span>
                    {contactCount > 0 && (
                        <span style={{
                            background: '#f3f4f6',
                            color: '#4b5563',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 500
                        }}>
                            {contactCount}
                        </span>
                    )}
                </button>

                {/* TAB: MONITOR (FILA REDIS + REGISTRO UNIFICADOS) */}
                <button
                    className={`sidebar-nav-item ${activeTab === 'monitor' || activeTab === 'records' || activeTab === 'redis' ? 'active' : ''}`}
                    onClick={() => setActiveTab('monitor')}
                >
                    <Activity size={16} />
                    <span style={{ flex: 1 }}>Monitor</span>
                    <span style={{
                        background: redisStatus.isRunning ? '#ecfdf5' : '#f3f4f6',
                        color: redisStatus.isRunning ? '#059669' : '#4b5563',
                        border: `1px solid ${redisStatus.isRunning ? '#a7f3d0' : '#e5e7eb'}`,
                        padding: '1px 6px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 500,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                    }}>
                        <span style={{
                            width: '5px',
                            height: '5px',
                            borderRadius: '50%',
                            background: redisStatus.isRunning ? '#10b981' : '#9ca3af'
                        }} />
                        {redisStatus.queueLength > 0 ? `${redisStatus.queueLength}` : (redisStatus.isRunning ? 'LIVE' : 'Ativo')}
                    </span>
                </button>
            </nav>

            {/* Bottom: Meu Perfil & Botão Sair */}
            <div style={{ marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)' }}>
                <div style={{
                    background: '#ffffff',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        <div style={{
                            width: '30px',
                            height: '30px',
                            borderRadius: '6px',
                            background: '#f3f4f6',
                            border: '1px solid var(--border-subtle)',
                            color: 'var(--text-muted)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                        }}>
                            <User size={15} />
                        </div>
                        <div style={{ minWidth: 0, overflow: 'hidden' }}>
                            <div style={{
                                fontSize: '12.5px',
                                fontWeight: 600,
                                color: 'var(--text-main)',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                lineHeight: 1.2
                            }}>
                                {user.name}
                            </div>
                            <span style={{
                                fontSize: '10.5px',
                                color: 'var(--text-dim)',
                                display: 'block',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                            }}>
                                {user.email}
                            </span>
                        </div>
                    </div>

                    <button
                        onClick={handleLogout}
                        title="Sair da conta"
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            padding: '6px',
                            borderRadius: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            transition: 'all 0.15s'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.color = '#dc2626';
                            e.currentTarget.style.background = '#fef2f2';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.color = 'var(--text-muted)';
                            e.currentTarget.style.background = 'transparent';
                        }}
                    >
                        <LogOut size={15} />
                    </button>
                </div>
            </div>
        </aside>
    );
};
