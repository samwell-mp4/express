import React, { useState, useMemo } from 'react';
import { Search, RefreshCw, LayoutGrid, List as ListIcon, User, Clock, Smartphone, AlertCircle, FileText, CheckCircle2, ChevronRight } from 'lucide-react';
import { WebhookItem } from '../types';

interface TriageBoardProps {
    items: WebhookItem[];
    isLoading: boolean;
    error: string;
    onRefresh: () => void;
    onSelectItem: (item: WebhookItem) => void;
}

export const TriageBoard: React.FC<TriageBoardProps> = ({
    items,
    isLoading,
    error,
    onRefresh,
    onSelectItem
}) => {
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [searchQuery, setSearchQuery] = useState('');
    const [filterDisparador, setFilterDisparador] = useState('ALL');
    const [filterStatus, setFilterStatus] = useState('ALL');
    const [filterWaba, setFilterWaba] = useState('ALL');
    const [filterHorario, setFilterHorario] = useState('ALL');

    // Extract unique values for filter dropdowns
    const uniqueResponsaveis = useMemo(() => {
        const set = new Set<string>();
        items.forEach(i => {
            if (i.responsavel_disparo && i.responsavel_disparo.trim()) set.add(i.responsavel_disparo.trim());
        });
        return Array.from(set).sort();
    }, [items]);

    const uniqueStatuses = useMemo(() => {
        const set = new Set<string>();
        items.forEach(i => {
            if (i.status && i.status.trim()) set.add(i.status.trim());
        });
        return Array.from(set).sort();
    }, [items]);

    const uniqueWabas = useMemo(() => {
        const set = new Set<string>();
        items.forEach(i => {
            if (i.waba && i.waba.trim()) set.add(i.waba.trim());
        });
        return Array.from(set).sort();
    }, [items]);

    const uniqueHorarios = useMemo(() => {
        const set = new Set<string>();
        items.forEach(i => {
            if (i.horario_disparo && i.horario_disparo.trim()) set.add(i.horario_disparo.trim());
        });
        return Array.from(set).sort();
    }, [items]);

    // Late report logic: if status is ENVIAR RELATÓRIO and time > 1h
    const isReportLate = (item: WebhookItem) => {
        const s = (item.status || '').trim().toUpperCase();
        if (s !== 'ENVIAR RELATÓRIO' && s !== 'ENVIAR RELATORIO') return false;
        if (!item.data_disparo || !item.horario_disparo) return false;

        const dateParts = item.data_disparo.split('/');
        const timeParts = item.horario_disparo.split(':');
        if (dateParts.length < 2 || timeParts.length < 2) return false;

        const day = parseInt(dateParts[0], 10);
        const month = parseInt(dateParts[1], 10);
        let year = dateParts.length === 3 ? parseInt(dateParts[2], 10) : new Date().getFullYear();
        if (year < 100) year += 2000;

        const hour = parseInt(timeParts[0], 10);
        const minute = parseInt(timeParts[1], 10);
        if (isNaN(day) || isNaN(month) || isNaN(hour) || isNaN(minute)) return false;

        const disparoDate = new Date(year, month - 1, day, hour, minute);
        const oneHourLater = new Date(disparoDate.getTime() + 60 * 60 * 1000);
        return new Date() > oneHourLater;
    };

    const getStatusStyle = (item: WebhookItem) => {
        const status = item.status;
        if (!status) return { text: 'PENDENTE', className: 'badge-pending' };
        const s = status.trim().toUpperCase();
        if (s === 'RELATÓRIO ENVIADO' || s === 'RELATORIO ENVIADO') {
            return { text: status.toUpperCase(), className: 'badge-approved' };
        }
        if (s === 'CANCELADO') {
            return { text: status.toUpperCase(), className: 'badge-late' };
        }
        if (s === 'ENVIAR RELATÓRIO' || s === 'ENVIAR RELATORIO') {
            if (isReportLate(item)) {
                return { text: 'RELATÓRIO ATRASADO', className: 'badge-late' };
            }
            return { text: status.toUpperCase(), className: 'badge-pending' };
        }
        return { text: status.toUpperCase(), className: 'badge-pending' };
    };

    // Filter items
    const filteredItems = useMemo(() => {
        return items.filter(item => {
            const q = searchQuery.toLowerCase();
            const matchesSearch = !q ||
                (item.cliente || '').toLowerCase().includes(q) ||
                (item.numero_disparo || '').toLowerCase().includes(q) ||
                (item.waba || '').toLowerCase().includes(q);

            const matchesDisparador = filterDisparador === 'ALL' || (item.responsavel_disparo || '').trim() === filterDisparador;
            const matchesStatus = filterStatus === 'ALL' || (item.status || '').trim() === filterStatus;
            const matchesWaba = filterWaba === 'ALL' || (item.waba || '').trim() === filterWaba;
            const matchesHorario = filterHorario === 'ALL' || (item.horario_disparo || '').trim() === filterHorario;

            return matchesSearch && matchesDisparador && matchesStatus && matchesWaba && matchesHorario;
        });
    }, [items, searchQuery, filterDisparador, filterStatus, filterWaba, filterHorario]);

    return (
        <div>
            {/* Header with Title and Refresh Action */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                    <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Disparos Pendentes (Triagem n8n)</h2>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        Selecione um cliente para carregar contatos, configurar múltiplos remetentes e iniciar a fila
                    </p>
                </div>

                <button 
                    className="btn-primary"
                    onClick={onRefresh}
                    disabled={isLoading}
                >
                    <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
                    {isLoading ? 'Sincronizando...' : 'Atualizar Dados'}
                </button>
            </div>

            {/* Error Banner */}
            {error && (
                <div style={{ 
                    background: '#fef2f2', 
                    border: '1px solid #fecaca', 
                    padding: '14px 18px', 
                    borderRadius: '12px', 
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    color: '#b91c1c'
                }}>
                    <AlertCircle size={20} />
                    <span>{error}</span>
                </div>
            )}

            {/* Filter Toolbar */}
            <div className="glass-panel" style={{ padding: '16px', marginBottom: '24px' }}>
                {/* Search Bar */}
                <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '10px', 
                    background: '#f8fafc', 
                    padding: '10px 14px', 
                    borderRadius: '10px', 
                    border: '1px solid var(--border-subtle)',
                    marginBottom: '12px'
                }}>
                    <Search size={18} color="var(--text-dim)" />
                    <input 
                        type="text"
                        placeholder="Buscar por cliente, número ou WABA..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', outline: 'none', width: '100%', fontSize: '0.9rem' }}
                    />
                    {searchQuery && (
                        <button 
                            onClick={() => setSearchQuery('')}
                            style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '0.8rem' }}
                        >
                            Limpar
                        </button>
                    )}
                </div>

                {/* Dropdowns & View Toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <select 
                        className="form-select"
                        value={filterDisparador}
                        onChange={(e) => setFilterDisparador(e.target.value)}
                        style={{ flex: '1 1 160px' }}
                    >
                        <option value="ALL">Responsável (Todos)</option>
                        {uniqueResponsaveis.map(resp => <option key={resp} value={resp}>{resp}</option>)}
                    </select>

                    <select 
                        className="form-select"
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        style={{ flex: '1 1 160px' }}
                    >
                        <option value="ALL">Status (Todos)</option>
                        {uniqueStatuses.map(st => <option key={st} value={st}>{st}</option>)}
                    </select>

                    <select 
                        className="form-select"
                        value={filterWaba}
                        onChange={(e) => setFilterWaba(e.target.value)}
                        style={{ flex: '1 1 160px' }}
                    >
                        <option value="ALL">WABA (Todos)</option>
                        {uniqueWabas.map(wb => <option key={wb} value={wb}>{wb}</option>)}
                    </select>

                    <select 
                        className="form-select"
                        value={filterHorario}
                        onChange={(e) => setFilterHorario(e.target.value)}
                        style={{ flex: '1 1 160px' }}
                    >
                        <option value="ALL">Horário (Todos)</option>
                        {uniqueHorarios.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>

                    {/* View Switcher */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#f1f5f9', padding: '3px', borderRadius: '8px', marginLeft: 'auto' }}>
                        <button 
                            onClick={() => setViewMode('grid')}
                            style={{
                                padding: '6px 10px',
                                borderRadius: '6px',
                                background: viewMode === 'grid' ? '#ffffff' : 'transparent',
                                color: viewMode === 'grid' ? 'var(--primary-color)' : 'var(--text-muted)',
                                border: 'none',
                                cursor: 'pointer',
                                boxShadow: viewMode === 'grid' ? 'var(--shadow-subtle)' : 'none'
                            }}
                        >
                            <LayoutGrid size={16} />
                        </button>
                        <button 
                            onClick={() => setViewMode('list')}
                            style={{
                                padding: '6px 10px',
                                borderRadius: '6px',
                                background: viewMode === 'list' ? '#ffffff' : 'transparent',
                                color: viewMode === 'list' ? 'var(--primary-color)' : 'var(--text-muted)',
                                border: 'none',
                                cursor: 'pointer',
                                boxShadow: viewMode === 'list' ? 'var(--shadow-subtle)' : 'none'
                            }}
                        >
                            <ListIcon size={16} />
                        </button>
                    </div>
                </div>
            </div>

            {/* List or Grid Display */}
            {isLoading && items.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
                    <RefreshCw size={36} className="animate-spin" style={{ color: 'var(--primary-color)', margin: '0 auto 16px' }} />
                    <p style={{ fontWeight: 600 }}>Sincronizando triagem do n8n...</p>
                </div>
            ) : filteredItems.length === 0 ? (
                <div className="glass-card" style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
                    <AlertCircle size={36} style={{ color: 'var(--text-dim)', margin: '0 auto 16px' }} />
                    <p style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-main)' }}>Nenhum disparo encontrado</p>
                    <p style={{ fontSize: '0.85rem', marginTop: '6px' }}>Tente alterar os filtros ou clique em "Atualizar Dados".</p>
                </div>
            ) : viewMode === 'grid' ? (
                <div className="grid-cols-auto">
                    {filteredItems.map((item, idx) => {
                        const statusObj = getStatusStyle(item);
                        return (
                            <div 
                                key={idx}
                                className="glass-card"
                                onClick={() => onSelectItem(item)}
                                style={{ padding: '22px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '14px', background: '#fff' }}
                            >
                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                                    <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                        {item.cliente || 'Cliente Sem Nome'}
                                    </h3>
                                    <span className={`badge ${statusObj.className}`}>
                                        {statusObj.text}
                                    </span>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Clock size={15} color="var(--primary-color)" />
                                        <span>{item.data_disparo || '--/--'} às {item.horario_disparo || '--:--'}</span>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Smartphone size={15} color="var(--accent-cyan)" />
                                        <span>Remetente: <strong style={{ color: 'var(--text-main)' }}>{item.numero_disparo || 'Pendente'}</strong></span>
                                    </div>

                                    {item.responsavel_disparo && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <User size={15} color="#9333ea" />
                                            <span>Resp: {item.responsavel_disparo}</span>
                                        </div>
                                    )}

                                    {item.waba && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <FileText size={15} color="#d97706" />
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>WABA: {item.waba}</span>
                                        </div>
                                    )}
                                </div>

                                <div style={{ 
                                    marginTop: 'auto', 
                                    paddingTop: '14px', 
                                    borderTop: '1px solid var(--border-subtle)', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'space-between' 
                                }}>
                                    <div style={{ fontSize: '0.85rem' }}>
                                        <span style={{ color: 'var(--text-dim)' }}>Leads: </span>
                                        <strong style={{ color: 'var(--primary-color)', fontSize: '1.05rem' }}>
                                            {item.quantidade_lead || 0}
                                        </strong>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--primary-color)', fontSize: '0.85rem', fontWeight: 700 }}>
                                        <span>Configurar</span>
                                        <ChevronRight size={15} />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="glass-panel" style={{ overflowX: 'auto', padding: '8px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-dim)' }}>
                                <th style={{ padding: '12px 16px' }}>CLIENTE</th>
                                <th style={{ padding: '12px 16px' }}>DATA & HORÁRIO</th>
                                <th style={{ padding: '12px 16px' }}>REMETENTE WABA</th>
                                <th style={{ padding: '12px 16px' }}>RESPONSÁVEL</th>
                                <th style={{ padding: '12px 16px' }}>STATUS</th>
                                <th style={{ padding: '12px 16px', textAlign: 'right' }}>LEADS</th>
                                <th style={{ padding: '12px 16px', textAlign: 'center' }}>AÇÃO</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredItems.map((item, idx) => {
                                const statusObj = getStatusStyle(item);
                                return (
                                    <tr 
                                        key={idx}
                                        onClick={() => onSelectItem(item)}
                                        style={{ borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer', transition: 'background 0.18s' }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                    >
                                        <td style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--text-main)' }}>{item.cliente || 'Sem Nome'}</td>
                                        <td style={{ padding: '14px 16px', color: 'var(--text-muted)' }}>{item.data_disparo} {item.horario_disparo}</td>
                                        <td style={{ padding: '14px 16px' }}>{item.numero_disparo || '--'}</td>
                                        <td style={{ padding: '14px 16px', color: 'var(--text-muted)' }}>{item.responsavel_disparo || '--'}</td>
                                        <td style={{ padding: '14px 16px' }}>
                                            <span className={`badge ${statusObj.className}`}>{statusObj.text}</span>
                                        </td>
                                        <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--primary-color)' }}>
                                            {item.quantidade_lead || 0}
                                        </td>
                                        <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                                            <button className="btn-secondary" style={{ padding: '4px 12px', fontSize: '0.78rem' }}>
                                                Disparar
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};
