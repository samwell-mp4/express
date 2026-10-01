import React, { useState, useEffect } from 'react';
import { 
    Plus, Trash2, Copy, Link as LinkIcon, Zap, Search, Globe, 
    ExternalLink, BarChart3, Check, Edit2, X, RefreshCw, 
    Smartphone, Laptop, ArrowRight, Layers, Sliders, CheckCircle2, ChevronRight
} from 'lucide-react';
import { ProRotator, RotatorTarget, RotatorStats } from '../types';
import { rotatorStorage } from '../services/rotatorStorage';

export interface LinkRotatorManagerProps {
    isEmbedded?: boolean;
    onClose?: () => void;
    onSelectRotator?: (url: string) => void;
}

export const LinkRotatorManager: React.FC<LinkRotatorManagerProps> = ({ isEmbedded, onClose, onSelectRotator }) => {
    // Rotators List State
    const [rotators, setRotators] = useState<ProRotator[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [copySuccessSlug, setCopySuccessSlug] = useState<string | null>(null);

    // Create State
    const [title, setTitle] = useState('');
    const [slug, setSlug] = useState('');
    const [targets, setTargets] = useState<RotatorTarget[]>([{ url: '', weight: 1 }]);
    const [isCreating, setIsCreating] = useState(false);

    // Edit Modal State
    const [editingRotator, setEditingRotator] = useState<ProRotator | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [editSlug, setEditSlug] = useState('');
    const [editTargets, setEditTargets] = useState<RotatorTarget[]>([]);
    const [isSavingEdit, setIsSavingEdit] = useState(false);

    // Details/Stats Modal State
    const [statsModalRotatorId, setStatsModalRotatorId] = useState<number | string | null>(null);
    const [stats, setStats] = useState<RotatorStats | null>(null);
    const [isLoadingStats, setIsLoadingStats] = useState(false);

    // Bulk Selection State
    const [selectedIds, setSelectedIds] = useState<(number | string)[]>([]);
    const [showBulkAddModal, setShowBulkAddModal] = useState(false);
    const [showBulkResetModal, setShowBulkResetModal] = useState(false);
    const [bulkTargetUrl, setBulkTargetUrl] = useState('');
    const [bulkTargetWeight, setBulkTargetWeight] = useState(1);
    const [isBulkProcessing, setIsBulkProcessing] = useState(false);

    // Toast Feedback
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(8);
    const [expandedTargets, setExpandedTargets] = useState<Record<string | number, boolean>>({});

    useEffect(() => {
        loadRotators();
        const handleSync = () => loadRotators();
        window.addEventListener('rotators_updated', handleSync);
        window.addEventListener('storage', handleSync);
        return () => {
            window.removeEventListener('rotators_updated', handleSync);
            window.removeEventListener('storage', handleSync);
        };
    }, []);

    const showToast = (msg: string) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(null), 3000);
    };

    const loadRotators = async () => {
        setIsLoading(true);
        try {
            const data = await rotatorStorage.getRotators();
            setRotators(data || []);
        } catch (err) {
            console.error('Error loading rotators:', err);
        } finally {
            setIsLoading(false);
        }
    };

    // Helper: calculate distribution percentage
    const calculatePercentage = (weight: number, list: RotatorTarget[] = targets) => {
        const total = list.reduce((sum, t) => sum + (Number(t.weight) || 1), 0);
        return total === 0 ? '0.0' : ((weight / total) * 100).toFixed(1);
    };

    const ensureProtocol = (url: string) => {
        if (!url) return '';
        const trimmed = url.trim();
        if (!/^https?:\/\//i.test(trimmed)) {
            return `https://${trimmed}`;
        }
        return trimmed;
    };

    // -------------------------------------------------------------
    // CREATE ROTATOR
    // -------------------------------------------------------------
    const handleAddTarget = () => {
        setTargets(prev => [...prev, { url: '', weight: 1 }]);
    };

    const handleRemoveTarget = (index: number) => {
        if (targets.length > 1) {
            setTargets(prev => prev.filter((_, i) => i !== index));
        }
    };

    const handleTargetChange = (index: number, field: 'url' | 'weight', value: any) => {
        setTargets(prev => prev.map((t, idx) => {
            if (idx === index) {
                return { ...t, [field]: field === 'weight' ? (parseInt(value) || 1) : value };
            }
            return t;
        }));
    };

    const handleCreateRotator = async (e: React.FormEvent) => {
        e.preventDefault();
        const validTargets = targets.filter(t => t.url.trim() !== '');
        if (validTargets.length === 0) {
            alert('Adicione pelo menos uma URL de destino válida.');
            return;
        }

        setIsCreating(true);
        try {
            const normalizedTargets = validTargets.map(t => ({
                ...t,
                url: ensureProtocol(t.url),
                weight: Number(t.weight) || 1
            }));

            await rotatorStorage.createRotator({
                title: title.trim() || 'Rotacionador PRO',
                slug: slug.trim() || undefined,
                targets: normalizedTargets
            });

            setTitle('');
            setSlug('');
            setTargets([{ url: '', weight: 1 }]);
            showToast('✓ Link Rotator criado com sucesso!');
            await loadRotators();
        } catch (err: any) {
            alert(`Erro ao criar rotacionador: ${err.message}`);
        } finally {
            setIsCreating(false);
        }
    };

    // -------------------------------------------------------------
    // EDIT ROTATOR
    // -------------------------------------------------------------
    const handleOpenEdit = (r: ProRotator) => {
        setEditingRotator(r);
        setEditTitle(r.title || '');
        setEditSlug(r.slug || '');
        setEditTargets(r.targets.map(t => ({ url: t.url, weight: Number(t.weight) || 1 })));
    };

    const handleEditAddTarget = () => {
        setEditTargets(prev => [...prev, { url: '', weight: 1 }]);
    };

    const handleEditRemoveTarget = (index: number) => {
        if (editTargets.length > 1) {
            setEditTargets(prev => prev.filter((_, i) => i !== index));
        }
    };

    const handleEditTargetChange = (index: number, field: 'url' | 'weight', value: any) => {
        setEditTargets(prev => prev.map((t, idx) => {
            if (idx === index) {
                return { ...t, [field]: field === 'weight' ? (parseInt(value) || 1) : value };
            }
            return t;
        }));
    };

    const handleSaveEdit = async () => {
        if (!editingRotator) return;
        if (!editTitle.trim()) return alert('O título não pode ser vazio.');
        if (!editSlug.trim()) return alert('O slug não pode ser vazio.');

        const validTargets = editTargets.filter(t => t.url.trim() !== '');
        if (validTargets.length === 0) return alert('Adicione pelo menos um link de destino válido.');

        setIsSavingEdit(true);
        try {
            const formattedTargets = validTargets.map(t => ({
                url: ensureProtocol(t.url),
                weight: Number(t.weight) || 1
            }));

            await rotatorStorage.updateRotator(editingRotator.id, {
                title: editTitle.trim(),
                slug: editSlug.trim(),
                targets: formattedTargets
            });

            showToast('✓ Rotacionador atualizado com sucesso!');
            setEditingRotator(null);
            await loadRotators();
        } catch (err: any) {
            alert(`Erro ao atualizar rotacionador: ${err.message}`);
        } finally {
            setIsSavingEdit(false);
        }
    };

    // -------------------------------------------------------------
    // DELETE ROTATOR
    // -------------------------------------------------------------
    const handleDeleteRotator = async (id: number | string) => {
        if (!window.confirm('Deseja realmente excluir este rotacionador?')) return;
        try {
            await rotatorStorage.deleteRotator(id);
            showToast('Rotacionador excluído.');
            await loadRotators();
        } catch (err: any) {
            alert(`Erro ao excluir: ${err.message}`);
        }
    };

    // -------------------------------------------------------------
    // STATS / INDIVIDUAL VIEW
    // -------------------------------------------------------------
    const handleOpenStats = async (id: number | string) => {
        setStatsModalRotatorId(id);
        setIsLoadingStats(true);
        try {
            const data = await rotatorStorage.getRotatorStats(id);
            setStats(data);
        } catch (err) {
            console.error('Error loading stats:', err);
        } finally {
            setIsLoadingStats(false);
        }
    };

    // -------------------------------------------------------------
    // COPY URL
    // -------------------------------------------------------------
    const copyToClipboard = (shortSlug: string) => {
        const origin = window.location.origin;
        const fullUrl = `${origin}/r/${shortSlug}`;
        navigator.clipboard.writeText(fullUrl);
        setCopySuccessSlug(shortSlug);
        showToast(`Link copiado: ${fullUrl}`);
        setTimeout(() => setCopySuccessSlug(null), 2500);
    };

    // -------------------------------------------------------------
    // BULK ACTIONS
    // -------------------------------------------------------------
    const toggleSelectAll = () => {
        if (selectedIds.length === filteredRotators.length && filteredRotators.length > 0) {
            setSelectedIds([]);
        } else {
            setSelectedIds(filteredRotators.map(r => r.id));
        }
    };

    const toggleSelectRotator = (id: number | string) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const handleBulkDelete = async () => {
        if (!window.confirm(`Deseja excluir permanentemente ${selectedIds.length} rotacionadores selecionados?`)) return;
        setIsBulkProcessing(true);
        try {
            await rotatorStorage.bulkDelete(selectedIds);
            setSelectedIds([]);
            showToast('Rotacionadores excluídos com sucesso.');
            await loadRotators();
        } catch (err: any) {
            alert(`Erro ao excluir: ${err.message}`);
        } finally {
            setIsBulkProcessing(false);
        }
    };

    const handleBulkAddTarget = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!bulkTargetUrl.trim()) return alert('Informe a URL de destino.');
        setIsBulkProcessing(true);
        try {
            await rotatorStorage.bulkAddTarget(selectedIds, {
                url: ensureProtocol(bulkTargetUrl),
                weight: Number(bulkTargetWeight) || 1
            });
            setBulkTargetUrl('');
            setBulkTargetWeight(1);
            setShowBulkAddModal(false);
            setSelectedIds([]);
            showToast('Destino adicionado a todos os rotacionadores selecionados.');
            await loadRotators();
        } catch (err: any) {
            alert(`Erro: ${err.message}`);
        } finally {
            setIsBulkProcessing(false);
        }
    };

    const handleBulkResetTargets = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!bulkTargetUrl.trim()) return alert('Informe a URL de destino.');
        setIsBulkProcessing(true);
        try {
            await rotatorStorage.bulkResetTargets(selectedIds, {
                url: ensureProtocol(bulkTargetUrl),
                weight: Number(bulkTargetWeight) || 1
            });
            setBulkTargetUrl('');
            setBulkTargetWeight(1);
            setShowBulkResetModal(false);
            setSelectedIds([]);
            showToast('Destinos redefinidos com sucesso para os selecionados.');
            await loadRotators();
        } catch (err: any) {
            alert(`Erro: ${err.message}`);
        } finally {
            setIsBulkProcessing(false);
        }
    };

    // Filter list
    const filteredRotators = rotators.filter(r => {
        const q = searchTerm.toLowerCase().trim();
        if (!q) return true;
        const matchesTitle = (r.title || '').toLowerCase().includes(q);
        const matchesSlug = (r.slug || '').toLowerCase().includes(q);
        const matchesTargets = (r.targets || []).some(t => (t.url || '').toLowerCase().includes(q));
        return matchesTitle || matchesSlug || matchesTargets;
    });

    // Pagination calculation
    const totalItems = filteredRotators.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const safePage = Math.min(Math.max(1, currentPage), totalPages);
    const paginatedRotators = filteredRotators.slice((safePage - 1) * pageSize, safePage * pageSize);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Notification Toast */}
            {toastMessage && (
                <div style={{
                    background: '#ECFDF5',
                    border: '1px solid #A7F3D0',
                    color: '#065F46',
                    padding: '10px 16px',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '13px',
                    fontWeight: 500,
                    boxShadow: 'var(--shadow-subtle)'
                }}>
                    <CheckCircle2 size={16} color="#059669" />
                    <span>{toastMessage}</span>
                </div>
            )}

            {/* Top Header */}
            <div style={{
                background: '#FFFFFF',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                        background: '#EFF6FF',
                        color: '#2563EB',
                        border: '1px solid #BFDBFE',
                        width: '32px',
                        height: '32px',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                    }}>
                        <LinkIcon size={16} />
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-main)', letterSpacing: '-0.01em', margin: 0 }}>
                                Encurtador &amp; Rotator PRO
                            </h2>
                            <span style={{
                                background: '#EFF6FF',
                                color: '#1E40AF',
                                border: '1px solid #BFDBFE',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 600
                            }}>
                                {rotators.length} Links
                            </span>
                        </div>
                        <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                            Crie URLs encurtadas inteligentes com rotação dinâmica e distribuição ponderada de pesos de tráfego.
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                        className="btn-secondary"
                        onClick={loadRotators}
                        style={{ height: '34px', fontSize: '13px', padding: '0 12px', borderRadius: '6px' }}
                    >
                        <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
                        Atualizar
                    </button>
                    {isEmbedded && onClose && (
                        <button
                            type="button"
                            onClick={onClose}
                            className="btn-secondary"
                            style={{ height: '34px', padding: '0 12px', fontSize: '13px' }}
                        >
                            <X size={14} /> Fechar
                        </button>
                    )}
                </div>
            </div>

            {/* Split Layout: Creation Panel + List of Rotators */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 380px) 1fr', gap: '16px', alignItems: 'start' }}>

                {/* --- LEFT: CREATE ROTATOR FORM --- */}
                <div style={{
                    background: '#FFFFFF',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '8px',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px' }}>
                        <Plus size={16} color="var(--primary-color)" />
                        <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>
                            Novo Rotacionador
                        </h3>
                    </div>

                    <form onSubmit={handleCreateRotator} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        {/* Title */}
                        <div>
                            <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-main)', display: 'block', marginBottom: '4px' }}>
                                Título da Campanha
                            </label>
                            <input 
                                type="text"
                                className="form-input"
                                placeholder="Ex: Vendas WhatsApp Oficial"
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                style={{ height: '36px', borderRadius: '6px', fontSize: '13px' }}
                            />
                        </div>

                        {/* Slug */}
                        <div>
                            <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-main)', display: 'block', marginBottom: '4px' }}>
                                Identificador (Slug Personalizado)
                            </label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '12px', color: 'var(--text-dim)', fontFamily: 'monospace' }}>/r/</span>
                                <input 
                                    type="text"
                                    className="form-input"
                                    placeholder="whatsapp-loja (ou automático)"
                                    value={slug}
                                    onChange={e => setSlug(e.target.value)}
                                    style={{ height: '36px', borderRadius: '6px', fontSize: '13px', flex: 1 }}
                                />
                            </div>
                        </div>

                        {/* Destinations & Weights */}
                        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>
                                    Destinos &amp; Pesos ({targets.length})
                                </label>
                                <button 
                                    type="button" 
                                    onClick={handleAddTarget}
                                    className="btn-secondary"
                                    style={{ height: '28px', padding: '0 8px', fontSize: '11.5px', borderRadius: '4px' }}
                                >
                                    <Plus size={12} />
                                    Adicionar Link
                                </button>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '340px', overflowY: 'auto', paddingRight: '2px' }}>
                                {targets.map((target, idx) => (
                                    <div key={idx} style={{
                                        background: '#F9FAFB',
                                        border: '1px solid var(--border-subtle)',
                                        borderRadius: '6px',
                                        padding: '10px'
                                    }}>
                                        <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                                            <input 
                                                className="form-input"
                                                style={{ height: '32px', fontSize: '12px', flex: 1 }}
                                                placeholder="https://wa.me/5511..."
                                                value={target.url}
                                                onChange={e => handleTargetChange(idx, 'url', e.target.value)}
                                            />
                                            {targets.length > 1 && (
                                                <button 
                                                    type="button" 
                                                    onClick={() => handleRemoveTarget(idx)} 
                                                    style={{
                                                        width: '32px',
                                                        height: '32px',
                                                        background: '#FEF2F2',
                                                        border: '1px solid #FECACA',
                                                        color: '#DC2626',
                                                        borderRadius: '4px',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center'
                                                    }}
                                                    title="Remover destino"
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            )}
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Peso:</span>
                                            <input 
                                                type="range"
                                                min="1"
                                                max="100"
                                                style={{ flex: 1, accentColor: 'var(--primary-color)' }}
                                                value={target.weight}
                                                onChange={e => handleTargetChange(idx, 'weight', e.target.value)}
                                            />
                                            <input 
                                                type="number"
                                                min="1"
                                                max="100"
                                                className="form-input"
                                                style={{ width: '48px', height: '28px', textAlign: 'center', fontSize: '12px', padding: '0 4px', borderRadius: '4px' }}
                                                value={target.weight}
                                                onChange={e => handleTargetChange(idx, 'weight', e.target.value)}
                                            />
                                            <span style={{
                                                fontSize: '11px',
                                                fontWeight: 600,
                                                color: 'var(--primary-color)',
                                                minWidth: '42px',
                                                textAlign: 'right'
                                            }}>
                                                {calculatePercentage(target.weight)}%
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Submit Button */}
                        <button 
                            type="submit" 
                            disabled={isCreating} 
                            className="btn-primary" 
                            style={{ height: '36px', fontSize: '13px', borderRadius: '6px', fontWeight: 600, width: '100%', marginTop: '4px' }}
                        >
                            <Zap size={14} />
                            {isCreating ? 'Criando...' : 'Salvar Rotacionador'}
                        </button>
                    </form>
                </div>

                {/* --- RIGHT: ROTATORS LIST & CONTROLS --- */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

                    {/* Filter & Bulk Bar */}
                    <div style={{
                        background: '#FFFFFF',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '8px',
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '10px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '220px' }}>
                            <Search size={15} color="var(--text-dim)" />
                            <input 
                                type="text"
                                placeholder="Buscar por título, slug ou URL..."
                                value={searchTerm}
                                onChange={e => {
                                    setSearchTerm(e.target.value);
                                    setCurrentPage(1);
                                }}
                                style={{
                                    height: '34px',
                                    border: '1px solid #D1D5DB',
                                    borderRadius: '6px',
                                    background: '#FFFFFF',
                                    padding: '0 10px',
                                    fontSize: '13px',
                                    width: '100%',
                                    maxWidth: '320px',
                                    color: 'var(--text-main)'
                                }}
                            />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {filteredRotators.length > 0 && (
                                <button
                                    onClick={toggleSelectAll}
                                    className="btn-secondary"
                                    style={{ height: '34px', fontSize: '12.5px', padding: '0 10px', borderRadius: '6px' }}
                                >
                                    {selectedIds.length === filteredRotators.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Bulk Selection Actions Bar */}
                    {selectedIds.length > 0 && (
                        <div style={{
                            background: '#F0FDF4',
                            border: '1px solid #BBF7D0',
                            borderRadius: '8px',
                            padding: '10px 16px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '8px'
                        }}>
                            <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#166534' }}>
                                {selectedIds.length} selecionado{selectedIds.length > 1 ? 's' : ''}
                            </span>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                <button 
                                    onClick={() => setShowBulkAddModal(true)}
                                    className="btn-secondary"
                                    style={{ height: '30px', fontSize: '12px', padding: '0 10px', borderRadius: '4px' }}
                                >
                                    Adicionar Destino
                                </button>
                                <button 
                                    onClick={() => setShowBulkResetModal(true)}
                                    className="btn-secondary"
                                    style={{ height: '30px', fontSize: '12px', padding: '0 10px', borderRadius: '4px' }}
                                >
                                    Resetar p/ Único
                                </button>
                                <button 
                                    onClick={handleBulkDelete}
                                    style={{
                                        height: '30px',
                                        fontSize: '12px',
                                        padding: '0 10px',
                                        borderRadius: '4px',
                                        background: '#FEF2F2',
                                        border: '1px solid #FECACA',
                                        color: '#DC2626',
                                        cursor: 'pointer',
                                        fontWeight: 500
                                    }}
                                >
                                    Excluir Selecionados
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Rotators Cards List */}
                    {isLoading ? (
                        <div style={{ padding: '60px 20px', textAlign: 'center', background: '#FFFFFF', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                            <RefreshCw size={24} className="animate-spin" color="var(--primary-color)" style={{ margin: '0 auto 8px' }} />
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>Carregando rotacionadores...</p>
                        </div>
                    ) : filteredRotators.length === 0 ? (
                        <div style={{ padding: '48px 20px', textAlign: 'center', background: '#FFFFFF', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                            <Globe size={32} color="#9CA3AF" style={{ margin: '0 auto 10px' }} />
                            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-main)', margin: '0 0 4px' }}>
                                Nenhum rotacionador encontrado
                            </h3>
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
                                Use o painel à esquerda para criar seu primeiro link rotacionador inteligente.
                            </p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {paginatedRotators.map((r) => {
                                const isChecked = selectedIds.includes(r.id);
                                const totalClicks = r.total_clicks || 0;
                                const isExp = !!expandedTargets[r.id];
                                const allTargets = r.targets || [];
                                const displayTargets = isExp ? allTargets : allTargets.slice(0, 3);
                                const remainingTargets = allTargets.length - 3;

                                return (
                                    <div 
                                        key={r.id} 
                                        style={{
                                            background: '#FFFFFF',
                                            border: isChecked ? '1px solid var(--primary-color)' : '1px solid var(--border-subtle)',
                                            borderRadius: '8px',
                                            padding: '14px 16px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '14px',
                                            transition: 'border-color 0.15s'
                                        }}
                                    >
                                        {/* Selection Checkbox */}
                                        <div 
                                            onClick={() => toggleSelectRotator(r.id)}
                                            style={{
                                                width: '18px',
                                                height: '18px',
                                                borderRadius: '4px',
                                                border: isChecked ? '1px solid var(--primary-color)' : '1px solid #D1D5DB',
                                                background: isChecked ? 'var(--primary-color)' : '#FFFFFF',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                flexShrink: 0
                                            }}
                                        >
                                            {isChecked && <Check size={12} color="#FFFFFF" strokeWidth={3} />}
                                        </div>

                                        {/* Link Icon Badge */}
                                        <div style={{
                                            width: '36px',
                                            height: '36px',
                                            borderRadius: '6px',
                                            background: '#F0FDF4',
                                            color: '#16A34A',
                                            border: '1px solid #DCFCE7',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            flexShrink: 0
                                        }}>
                                            <Zap size={16} />
                                        </div>

                                        {/* Main Content */}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                                                <h4 style={{ fontSize: '14.5px', fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>
                                                    {r.title}
                                                </h4>
                                                <span style={{
                                                    fontSize: '11px',
                                                    fontFamily: 'monospace',
                                                    fontWeight: 600,
                                                    color: 'var(--primary-color)',
                                                    background: '#F0FDF4',
                                                    padding: '1px 6px',
                                                    borderRadius: '4px',
                                                    border: '1px solid #DCFCE7'
                                                }}>
                                                    /r/{r.slug}
                                                </span>
                                                <span style={{
                                                    fontSize: '11px',
                                                    color: 'var(--text-dim)',
                                                    background: '#F3F4F6',
                                                    padding: '1px 6px',
                                                    borderRadius: '4px'
                                                }}>
                                                    {allTargets.length} destino{allTargets.length > 1 ? 's' : ''}
                                                </span>
                                            </div>

                                            {/* Targets Breakdown Chips */}
                                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                                                {displayTargets.map((t, idx) => (
                                                    <div 
                                                        key={idx}
                                                        title={t.url}
                                                        style={{
                                                            fontSize: '11px',
                                                            background: '#F9FAFB',
                                                            border: '1px solid var(--border-subtle)',
                                                            padding: '2px 8px',
                                                            borderRadius: '4px',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '6px',
                                                            maxWidth: '220px'
                                                        }}
                                                    >
                                                        <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>
                                                            %{calculatePercentage(t.weight, allTargets)}
                                                        </span>
                                                        <span style={{
                                                            color: 'var(--text-muted)',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap'
                                                        }}>
                                                            {t.url.replace(/^https?:\/\//, '')}
                                                        </span>
                                                    </div>
                                                ))}
                                                {remainingTargets > 0 && (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setExpandedTargets(prev => ({ ...prev, [r.id]: !prev[r.id] }));
                                                        }}
                                                        style={{
                                                            fontSize: '11px',
                                                            fontWeight: 600,
                                                            background: isExp ? '#EFF6FF' : '#F3F4F6',
                                                            color: isExp ? '#2563EB' : 'var(--text-muted)',
                                                            border: '1px solid var(--border-subtle)',
                                                            padding: '2px 8px',
                                                            borderRadius: '4px',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        {isExp ? 'Recolher destinos' : `+${remainingTargets} outro${remainingTargets > 1 ? 's' : ''}`}
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Clicks Metric */}
                                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                            <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-main)', lineHeight: 1.2 }}>
                                                {totalClicks}
                                            </div>
                                            <span style={{ fontSize: '10.5px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                                Cliques
                                            </span>
                                        </div>

                                        {/* Action Buttons */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                            <button 
                                                onClick={() => handleOpenStats(r.id)}
                                                className="btn-secondary"
                                                style={{ height: '32px', width: '32px', padding: 0, borderRadius: '6px' }}
                                                title="Visualizar Estatísticas Individuais"
                                            >
                                                <BarChart3 size={14} color="#2563EB" />
                                            </button>

                                            <button 
                                                onClick={() => handleOpenEdit(r)}
                                                className="btn-secondary"
                                                style={{ height: '32px', width: '32px', padding: 0, borderRadius: '6px' }}
                                                title="Editar Rotacionador (Título, Slug, Pesos)"
                                            >
                                                <Edit2 size={14} color="var(--text-main)" />
                                            </button>

                                            <button 
                                                onClick={() => copyToClipboard(r.slug)}
                                                className="btn-secondary"
                                                style={{ height: '32px', width: '32px', padding: 0, borderRadius: '6px' }}
                                                title="Copiar Link /r/slug"
                                            >
                                                {copySuccessSlug === r.slug ? <Check size={14} color="#16A34A" /> : <Copy size={14} />}
                                            </button>

                                            <button 
                                                onClick={() => handleDeleteRotator(r.id)}
                                                style={{
                                                    height: '32px',
                                                    width: '32px',
                                                    padding: 0,
                                                    borderRadius: '6px',
                                                    background: '#FEF2F2',
                                                    border: '1px solid #FECACA',
                                                    color: '#DC2626',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }}
                                                title="Excluir"
                                            >
                                                <Trash2 size={13} />
                                            </button>

                                            {isEmbedded && onSelectRotator && (
                                                <button
                                                    onClick={() => onSelectRotator(`${window.location.origin}/r/${r.slug}`)}
                                                    className="badge badge-approved"
                                                    style={{ cursor: 'pointer', height: '32px', padding: '0 12px', fontSize: '12px', fontWeight: 600, border: 'none' }}
                                                >
                                                    Usar
                                                </button>
                                            )}
                                        </div>

                                    </div>
                                );
                            })}

                            {/* Pagination Controls */}
                            {totalPages > 1 && (
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    flexWrap: 'wrap',
                                    gap: '12px',
                                    padding: '12px 16px',
                                    background: '#FFFFFF',
                                    border: '1px solid var(--border-subtle)',
                                    borderRadius: '8px',
                                    marginTop: '6px'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                            Mostrando <b>{(safePage - 1) * pageSize + 1}</b> a <b>{Math.min(safePage * pageSize, totalItems)}</b> de <b>{totalItems}</b>
                                        </span>
                                        <select
                                            value={pageSize}
                                            onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                                            style={{
                                                height: '28px',
                                                fontSize: '11.5px',
                                                padding: '0 6px',
                                                borderRadius: '4px',
                                                border: '1px solid var(--border-subtle)',
                                                background: '#FFFFFF',
                                                color: 'var(--text-main)',
                                                outline: 'none',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <option value={5}>5 por pág.</option>
                                            <option value={8}>8 por pág.</option>
                                            <option value={15}>15 por pág.</option>
                                            <option value={25}>25 por pág.</option>
                                        </select>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <button
                                            type="button"
                                            className="btn-secondary"
                                            disabled={safePage <= 1}
                                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                            style={{ height: '28px', padding: '0 10px', fontSize: '11.5px', opacity: safePage <= 1 ? 0.4 : 1 }}
                                        >
                                            Anterior
                                        </button>

                                        {Array.from({ length: totalPages }).map((_, pIdx) => {
                                            const pNum = pIdx + 1;
                                            if (pNum === 1 || pNum === totalPages || Math.abs(pNum - safePage) <= 1) {
                                                return (
                                                    <button
                                                        key={pNum}
                                                        type="button"
                                                        onClick={() => setCurrentPage(pNum)}
                                                        style={{
                                                            height: '28px',
                                                            minWidth: '28px',
                                                            padding: '0 6px',
                                                            fontSize: '11.5px',
                                                            fontWeight: pNum === safePage ? 700 : 500,
                                                            borderRadius: '4px',
                                                            border: '1px solid',
                                                            borderColor: pNum === safePage ? 'var(--primary-color)' : 'var(--border-subtle)',
                                                            background: pNum === safePage ? 'var(--primary-color)' : '#FFFFFF',
                                                            color: pNum === safePage ? '#000000' : 'var(--text-main)',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        {pNum}
                                                    </button>
                                                );
                                            }
                                            if (pNum === safePage - 2 || pNum === safePage + 2) {
                                                return <span key={pNum} style={{ padding: '0 2px', color: 'var(--text-muted)', fontSize: '11px' }}>...</span>;
                                            }
                                            return null;
                                        })}

                                        <button
                                            type="button"
                                            className="btn-secondary"
                                            disabled={safePage >= totalPages}
                                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                            style={{ height: '28px', padding: '0 10px', fontSize: '11.5px', opacity: safePage >= totalPages ? 0.4 : 1 }}
                                        >
                                            Próxima
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                </div>
            </div>

            {/* ========================================================= */}
            {/* MODAL: EDIT ROTATOR (TITLE, SLUG, TARGETS & WEIGHTS)     */}
            {/* ========================================================= */}
            {editingRotator && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(17, 24, 39, 0.4)',
                    backdropFilter: 'blur(4px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1100,
                    padding: '20px'
                }}>
                    <div style={{
                        width: '100%',
                        maxWidth: '560px',
                        maxHeight: '90vh',
                        overflowY: 'auto',
                        padding: '22px',
                        position: 'relative',
                        background: '#FFFFFF',
                        borderRadius: '8px',
                        border: '1px solid var(--border-subtle)',
                        boxShadow: 'var(--shadow-modal)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Edit2 size={16} color="var(--primary-color)" />
                                <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>
                                    Editar Rotacionador
                                </h3>
                            </div>
                            <button 
                                onClick={() => setEditingRotator(null)}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            {/* Title */}
                            <div>
                                <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-main)', display: 'block', marginBottom: '4px' }}>
                                    Título da Campanha
                                </label>
                                <input 
                                    type="text"
                                    className="form-input"
                                    value={editTitle}
                                    onChange={e => setEditTitle(e.target.value)}
                                    style={{ height: '36px', borderRadius: '6px', fontSize: '13px' }}
                                />
                            </div>

                            {/* Slug */}
                            <div>
                                <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-main)', display: 'block', marginBottom: '4px' }}>
                                    Identificador (Slug)
                                </label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '12px', color: 'var(--text-dim)', fontFamily: 'monospace' }}>/r/</span>
                                    <input 
                                        type="text"
                                        className="form-input"
                                        value={editSlug}
                                        onChange={e => setEditSlug(e.target.value)}
                                        style={{ height: '36px', borderRadius: '6px', fontSize: '13px', flex: 1 }}
                                    />
                                </div>
                            </div>

                            {/* Targets & Weights */}
                            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>
                                        Destinos &amp; Pesos ({editTargets.length})
                                    </label>
                                    <button 
                                        type="button" 
                                        onClick={handleEditAddTarget}
                                        className="btn-secondary"
                                        style={{ height: '28px', padding: '0 8px', fontSize: '11.5px', borderRadius: '4px' }}
                                    >
                                        <Plus size={12} />
                                        Adicionar Link
                                    </button>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto' }}>
                                    {editTargets.map((target, idx) => (
                                        <div key={idx} style={{
                                            background: '#F9FAFB',
                                            border: '1px solid var(--border-subtle)',
                                            borderRadius: '6px',
                                            padding: '10px'
                                        }}>
                                            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                                                <input 
                                                    className="form-input"
                                                    style={{ height: '32px', fontSize: '12px', flex: 1 }}
                                                    placeholder="https://..."
                                                    value={target.url}
                                                    onChange={e => handleEditTargetChange(idx, 'url', e.target.value)}
                                                />
                                                {editTargets.length > 1 && (
                                                    <button 
                                                        type="button" 
                                                        onClick={() => handleEditRemoveTarget(idx)} 
                                                        style={{
                                                            width: '32px',
                                                            height: '32px',
                                                            background: '#FEF2F2',
                                                            border: '1px solid #FECACA',
                                                            color: '#DC2626',
                                                            borderRadius: '4px',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center'
                                                        }}
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                )}
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Peso:</span>
                                                <input 
                                                    type="range"
                                                    min="1"
                                                    max="100"
                                                    style={{ flex: 1, accentColor: 'var(--primary-color)' }}
                                                    value={target.weight}
                                                    onChange={e => handleEditTargetChange(idx, 'weight', e.target.value)}
                                                />
                                                <input 
                                                    type="number"
                                                    min="1"
                                                    max="100"
                                                    className="form-input"
                                                    style={{ width: '48px', height: '28px', textAlign: 'center', fontSize: '12px', padding: '0 4px', borderRadius: '4px' }}
                                                    value={target.weight}
                                                    onChange={e => handleEditTargetChange(idx, 'weight', e.target.value)}
                                                />
                                                <span style={{
                                                    fontSize: '11px',
                                                    fontWeight: 600,
                                                    color: 'var(--primary-color)',
                                                    minWidth: '42px',
                                                    textAlign: 'right'
                                                }}>
                                                    {calculatePercentage(target.weight, editTargets)}%
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Actions */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                                <button 
                                    className="btn-secondary" 
                                    onClick={() => setEditingRotator(null)}
                                    style={{ height: '34px', fontSize: '13px', borderRadius: '6px' }}
                                >
                                    Cancelar
                                </button>
                                <button 
                                    className="btn-primary" 
                                    onClick={handleSaveEdit}
                                    disabled={isSavingEdit}
                                    style={{ height: '34px', fontSize: '13px', borderRadius: '6px' }}
                                >
                                    {isSavingEdit ? 'Salvando...' : 'Salvar Alterações'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ========================================================= */}
            {/* MODAL: INDIVIDUAL STATS & DETAILS VIEW                   */}
            {/* ========================================================= */}
            {statsModalRotatorId && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(17, 24, 39, 0.4)',
                    backdropFilter: 'blur(4px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1100,
                    padding: '20px'
                }}>
                    <div style={{
                        width: '100%',
                        maxWidth: '680px',
                        maxHeight: '90vh',
                        overflowY: 'auto',
                        padding: '24px',
                        position: 'relative',
                        background: '#FFFFFF',
                        borderRadius: '8px',
                        border: '1px solid var(--border-subtle)',
                        boxShadow: 'var(--shadow-modal)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                            <div>
                                <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 500, textTransform: 'uppercase' }}>
                                    Análise Individual
                                </span>
                                <h3 style={{ fontSize: '17px', fontWeight: 600, color: 'var(--text-main)', margin: '2px 0 0 0' }}>
                                    {stats?.rotator?.title || 'Rotacionador'}
                                </h3>
                            </div>
                            <button 
                                onClick={() => { setStatsModalRotatorId(null); setStats(null); }}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {isLoadingStats ? (
                            <div style={{ padding: '40px', textAlign: 'center' }}>
                                <RefreshCw size={24} className="animate-spin" color="var(--primary-color)" style={{ margin: '0 auto 8px' }} />
                                <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Carregando métricas...</p>
                            </div>
                        ) : !stats ? (
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Estatísticas não encontradas.</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                {/* Metrics Cards */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                                    <div style={{ background: '#F9FAFB', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '12px' }}>
                                        <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 500, display: 'block' }}>Total de Cliques</span>
                                        <strong style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-main)' }}>
                                            {stats.rotator.total_clicks || 0}
                                        </strong>
                                    </div>

                                    <div style={{ background: '#F9FAFB', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '12px' }}>
                                        <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 500, display: 'block' }}>Destinos Ativos</span>
                                        <strong style={{ fontSize: '20px', fontWeight: 600, color: 'var(--primary-color)' }}>
                                            {stats.rotator.targets?.length || 0}
                                        </strong>
                                    </div>

                                    <div style={{ background: '#F9FAFB', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '12px' }}>
                                        <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 500, display: 'block' }}>Link Redirecionador</span>
                                        <button 
                                            onClick={() => copyToClipboard(stats.rotator.slug)}
                                            style={{
                                                background: '#FFFFFF',
                                                border: '1px solid var(--border-subtle)',
                                                borderRadius: '4px',
                                                padding: '2px 6px',
                                                fontSize: '11px',
                                                fontFamily: 'monospace',
                                                color: 'var(--primary-color)',
                                                cursor: 'pointer',
                                                marginTop: '4px',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}
                                        >
                                            <Copy size={11} />
                                            /r/{stats.rotator.slug}
                                        </button>
                                    </div>
                                </div>

                                {/* Targets Breakdown Table */}
                                <div>
                                    <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '8px' }}>
                                        Desempenho por Destino
                                    </h4>
                                    <div style={{ border: '1px solid var(--border-subtle)', borderRadius: '6px', overflow: 'hidden' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'left' }}>
                                            <thead>
                                                <tr style={{ background: '#F9FAFB', borderBottom: '1px solid var(--border-subtle)' }}>
                                                    <th style={{ padding: '8px 12px', fontSize: '11px', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase' }}>Destino</th>
                                                    <th style={{ padding: '8px 12px', fontSize: '11px', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', width: '80px' }}>Peso</th>
                                                    <th style={{ padding: '8px 12px', fontSize: '11px', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', width: '90px' }}>% Tráfego</th>
                                                    <th style={{ padding: '8px 12px', fontSize: '11px', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', width: '80px' }}>Cliques</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(stats.rotator.targets || []).map((t, idx) => {
                                                    const statTarget = stats.targets?.find(st => st.target_url === t.url || st.target_index === idx);
                                                    const clicks = statTarget ? statTarget.clicks : 0;
                                                    const pct = calculatePercentage(t.weight, stats.rotator.targets);

                                                    return (
                                                        <tr key={idx} style={{ borderBottom: '1px solid #F3F4F6' }}>
                                                            <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: '12px', color: 'var(--text-main)' }}>
                                                                {t.url}
                                                            </td>
                                                            <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>
                                                                {t.weight}
                                                            </td>
                                                            <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--primary-color)' }}>
                                                                {pct}%
                                                            </td>
                                                            <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text-main)' }}>
                                                                {clicks}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                                    <button 
                                        className="btn-secondary" 
                                        onClick={() => { setStatsModalRotatorId(null); setStats(null); }}
                                        style={{ height: '34px', fontSize: '13px', borderRadius: '6px' }}
                                    >
                                        Fechar
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ========================================================= */}
            {/* MODAL: BULK ADD TARGET                                   */}
            {/* ========================================================= */}
            {showBulkAddModal && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(17, 24, 39, 0.4)',
                    backdropFilter: 'blur(4px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1150,
                    padding: '20px'
                }}>
                    <div style={{
                        width: '100%',
                        maxWidth: '440px',
                        padding: '20px',
                        background: '#FFFFFF',
                        borderRadius: '8px',
                        border: '1px solid var(--border-subtle)',
                        boxShadow: 'var(--shadow-modal)'
                    }}>
                        <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-main)', margin: '0 0 12px 0' }}>
                            Adicionar Destino em Massa
                        </h3>
                        <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', margin: '0 0 14px 0' }}>
                            Esta URL será adicionada como novo destino nos {selectedIds.length} rotacionadores selecionados.
                        </p>

                        <form onSubmit={handleBulkAddTarget} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div>
                                <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-main)', display: 'block', marginBottom: '4px' }}>
                                    URL do Novo Destino
                                </label>
                                <input 
                                    type="text"
                                    className="form-input"
                                    placeholder="https://wa.me/55..."
                                    required
                                    value={bulkTargetUrl}
                                    onChange={e => setBulkTargetUrl(e.target.value)}
                                    style={{ height: '36px', borderRadius: '6px', fontSize: '13px' }}
                                />
                            </div>

                            <div>
                                <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-main)', display: 'block', marginBottom: '4px' }}>
                                    Peso (1 a 100)
                                </label>
                                <input 
                                    type="number"
                                    min="1"
                                    max="100"
                                    className="form-input"
                                    required
                                    value={bulkTargetWeight}
                                    onChange={e => setBulkTargetWeight(Number(e.target.value))}
                                    style={{ height: '36px', borderRadius: '6px', fontSize: '13px' }}
                                />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                                <button 
                                    type="button" 
                                    onClick={() => setShowBulkAddModal(false)}
                                    className="btn-secondary"
                                    style={{ height: '34px', fontSize: '13px', borderRadius: '6px' }}
                                >
                                    Cancelar
                                </button>
                                <button 
                                    type="submit" 
                                    disabled={isBulkProcessing}
                                    className="btn-primary"
                                    style={{ height: '34px', fontSize: '13px', borderRadius: '6px' }}
                                >
                                    {isBulkProcessing ? 'Salvando...' : 'Adicionar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ========================================================= */}
            {/* MODAL: BULK RESET TARGETS                                */}
            {/* ========================================================= */}
            {showBulkResetModal && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(17, 24, 39, 0.4)',
                    backdropFilter: 'blur(4px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1150,
                    padding: '20px'
                }}>
                    <div style={{
                        width: '100%',
                        maxWidth: '440px',
                        padding: '20px',
                        background: '#FFFFFF',
                        borderRadius: '8px',
                        border: '1px solid var(--border-subtle)',
                        boxShadow: 'var(--shadow-modal)'
                    }}>
                        <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-main)', margin: '0 0 8px 0' }}>
                            Resetar p/ Destino Único
                        </h3>
                        <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', margin: '0 0 14px 0' }}>
                            Atenção: todos os destinos existentes nos {selectedIds.length} rotacionadores serão substituídos por esta única URL.
                        </p>

                        <form onSubmit={handleBulkResetTargets} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div>
                                <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-main)', display: 'block', marginBottom: '4px' }}>
                                    Nova URL do Destino Único
                                </label>
                                <input 
                                    type="text"
                                    className="form-input"
                                    placeholder="https://wa.me/55..."
                                    required
                                    value={bulkTargetUrl}
                                    onChange={e => setBulkTargetUrl(e.target.value)}
                                    style={{ height: '36px', borderRadius: '6px', fontSize: '13px' }}
                                />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                                <button 
                                    type="button" 
                                    onClick={() => setShowBulkResetModal(false)}
                                    className="btn-secondary"
                                    style={{ height: '34px', fontSize: '13px', borderRadius: '6px' }}
                                >
                                    Cancelar
                                </button>
                                <button 
                                    type="submit" 
                                    disabled={isBulkProcessing}
                                    className="btn-primary"
                                    style={{ height: '34px', fontSize: '13px', borderRadius: '6px' }}
                                >
                                    {isBulkProcessing ? 'Resetando...' : 'Redefinir Destino'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

        </div>
    );
};
