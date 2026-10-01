import React, { useState, useEffect, useRef } from 'react';
import {
    UploadCloud,
    Copy,
    Check,
    Image as ImageIcon,
    Video,
    FileText,
    Activity,
    ExternalLink,
    CheckCircle2,
    ShieldCheck,
    Sparkles,
    X,
    Lock
} from 'lucide-react';
import { api } from '../services/api';
import { mediaStorage } from '../services/mediaStorage';
import { SavedMediaItem } from '../types';

interface MediaHostingManagerProps {
    isEmbedded?: boolean;
    onClose?: () => void;
    onSelectMedia?: (url: string, type: 'IMAGE' | 'VIDEO') => void;
}

export const MediaHostingManager: React.FC<MediaHostingManagerProps> = ({
    isEmbedded,
    onClose,
    onSelectMedia
}) => {
    const [recentMedia, setRecentMedia] = useState<SavedMediaItem[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [latestUploaded, setLatestUploaded] = useState<SavedMediaItem | null>(null);
    const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const loadRecent = () => {
        // Estritamente os últimos 5 conforme diretriz do usuário
        setRecentMedia(mediaStorage.getRecentMedia(5));
    };

    useEffect(() => {
        loadRecent();
        const handleUpdate = () => loadRecent();
        window.addEventListener('media_storage_updated', handleUpdate);
        return () => window.removeEventListener('media_storage_updated', handleUpdate);
    }, []);

    const handleFileUpload = async (file: File) => {
        setIsUploading(true);
        try {
            const res = await api.uploadMedia(file);
            if (res.success && res.url) {
                const item: SavedMediaItem = {
                    id: res.id || `media_${Date.now()}`,
                    name: file.name,
                    originalName: file.name,
                    url: res.url,
                    size: file.size > 1024 * 1024 ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(file.size / 1024)} KB`,
                    type: file.type.startsWith('video') ? 'video' : 'image',
                    createdAt: new Date().toISOString()
                };
                setLatestUploaded(item);
                loadRecent();
            }
        } catch (err: any) {
            console.error('Erro no upload de mídia:', err);
            alert(`Falha no upload: ${err.message || 'Erro desconhecido'}`);
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleCopy = (url: string) => {
        navigator.clipboard.writeText(url);
        setCopiedUrl(url);
        setTimeout(() => setCopiedUrl(null), 2500);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
            {/* Header */}
            <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', borderRadius: '8px' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text-main)', letterSpacing: '-0.2px' }}>
                            Upload de Mídias
                        </h2>
                        <span className="badge badge-approved">
                            Armazenamento Seguro
                        </span>
                    </div>
                    <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
                        Hospedagem direta com link persistente para templates e disparos Meta. Exibindo os últimos 5 envios.
                    </p>
                </div>

                {isEmbedded && onClose && (
                    <button
                        type="button"
                        onClick={onClose}
                        className="btn-secondary"
                        style={{ height: '32px', padding: '0 10px', fontSize: '12px' }}
                    >
                        <X size={14} /> Fechar
                    </button>
                )}
            </div>

            {/* Aviso de Persistência Segura */}
            <div style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                padding: '10px 14px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
            }}>
                <Lock color="#475569" size={16} style={{ flexShrink: 0 }} />
                <div style={{ fontSize: '12.5px', color: '#334155', lineHeight: 1.4 }}>
                    <strong style={{ fontWeight: 600 }}>Armazenamento Permanente:</strong> As mídias enviadas permanecem gravadas com segurança no servidor para envio pelas campanhas. Para otimização de tela, são exibidas apenas as <strong>5 mídias mais recentes</strong> abaixo.
                </div>
            </div>

            {/* Upload Zone */}
            <div
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                    e.preventDefault();
                    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                        handleFileUpload(e.dataTransfer.files[0]);
                    }
                }}
                onClick={() => !isUploading && fileInputRef.current?.click()}
                style={{
                    background: '#ffffff',
                    border: '1px dashed #cbd5e1',
                    borderRadius: '8px',
                    padding: '28px 20px',
                    textAlign: 'center',
                    cursor: isUploading ? 'wait' : 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'border-color 150ms ease, background 150ms ease'
                }}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                    style={{ display: 'none' }}
                />

                <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '6px',
                    background: '#f1f5f9',
                    color: '#475569',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}>
                    {isUploading ? (
                        <Activity className="animate-spin" size={18} color="#059669" />
                    ) : (
                        <UploadCloud size={18} />
                    )}
                </div>

                <div>
                    <strong style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', display: 'block' }}>
                        {isUploading ? 'Enviando arquivo com segurança...' : 'Clique ou arraste sua imagem ou vídeo aqui'}
                    </strong>
                    <span style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
                        Formatos aceitos: PNG, JPG, JPEG, WEBP, MP4
                    </span>
                </div>
            </div>

            {/* Card com COPYBOARD do último arquivo enviado */}
            {latestUploaded && (
                <div style={{
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    borderRadius: '8px',
                    padding: '14px 18px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <CheckCircle2 color="#16a34a" size={20} style={{ flexShrink: 0 }} />
                            <div>
                                <strong style={{ color: '#166534', fontSize: '13.5px', fontWeight: 600 }}>
                                    Upload concluído com sucesso
                                </strong>
                                <span style={{ fontSize: '12px', color: '#15803d', display: 'block' }}>
                                    {latestUploaded.originalName} ({latestUploaded.size})
                                </span>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            {onSelectMedia && (
                                <button
                                    className="btn-primary"
                                    style={{ height: '34px', padding: '0 12px', fontSize: '12.5px' }}
                                    onClick={() => onSelectMedia(latestUploaded.url, latestUploaded.type === 'video' ? 'VIDEO' : 'IMAGE')}
                                >
                                    Aplicar ao Template
                                </button>
                            )}
                            <button
                                className="btn-secondary"
                                style={{
                                    height: '34px',
                                    padding: '0 12px',
                                    fontSize: '12.5px',
                                    background: copiedUrl === latestUploaded.url ? '#f0fdf4' : '#ffffff',
                                    color: copiedUrl === latestUploaded.url ? '#166534' : 'var(--text-main)',
                                    borderColor: copiedUrl === latestUploaded.url ? '#86efac' : 'var(--border-subtle)'
                                }}
                                onClick={() => handleCopy(latestUploaded.url)}
                            >
                                {copiedUrl === latestUploaded.url ? <Check size={14} /> : <Copy size={14} />}
                                {copiedUrl === latestUploaded.url ? 'URL Copiada!' : 'Copiar URL'}
                            </button>
                        </div>
                    </div>

                    <div style={{
                        background: '#ffffff',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: '1px solid #d1fae5',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '10px'
                    }}>
                        <code style={{ fontSize: '12.5px', color: '#166534', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                            {latestUploaded.url}
                        </code>
                        <a
                            href={latestUploaded.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: '#059669', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}
                        >
                            Abrir <ExternalLink size={13} />
                        </a>
                    </div>
                </div>
            )}

            {/* Galeria dos Últimos 5 Itens */}
            <div className="glass-panel" style={{ padding: '16px 20px', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <ImageIcon size={16} color="var(--primary-color)" />
                        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text-main)' }}>
                            Últimas 5 Mídias Hospedadas
                        </h3>
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {recentMedia.length} de 5 exibidas
                    </span>
                </div>

                {recentMedia.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                        Nenhuma mídia hospedada recentemente. Envie sua imagem ou vídeo acima.
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                        {recentMedia.map((m) => (
                            <div
                                key={m.id}
                                style={{
                                    background: '#ffffff',
                                    border: '1px solid var(--border-subtle)',
                                    borderRadius: '6px',
                                    padding: '12px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '10px',
                                    transition: 'border-color 120ms ease'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    {m.type === 'video' ? (
                                        <div style={{ width: '36px', height: '36px', borderRadius: '4px', background: '#fef3c7', color: '#b45309', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <Video size={18} />
                                        </div>
                                    ) : (
                                        <div style={{ width: '36px', height: '36px', borderRadius: '4px', background: '#f1f5f9', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                                            {m.url.startsWith('http') || m.url.startsWith('data:image') ? (
                                                <img src={m.url} alt={m.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            ) : (
                                                <ImageIcon size={18} />
                                            )}
                                        </div>
                                    )}

                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <strong style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {m.name || m.originalName}
                                        </strong>
                                        <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                                            {m.size} • {new Date(m.createdAt).toLocaleDateString('pt-BR')}
                                        </span>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '6px', marginTop: 'auto' }}>
                                    <button
                                        type="button"
                                        className="badge"
                                        onClick={() => handleCopy(m.url)}
                                        style={{
                                            flex: 1,
                                            cursor: 'pointer',
                                            height: '24px',
                                            padding: '0 8px',
                                            justifyContent: 'center',
                                            background: copiedUrl === m.url ? '#f0fdf4' : '#f8fafc',
                                            color: copiedUrl === m.url ? '#166534' : 'var(--text-main)',
                                            border: '1px solid var(--border-subtle)',
                                            borderRadius: '4px',
                                            fontSize: '11.5px',
                                            fontWeight: 500
                                        }}
                                    >
                                        {copiedUrl === m.url ? <Check size={12} /> : <Copy size={12} />}
                                        {copiedUrl === m.url ? 'Copiado!' : 'Copiar URL'}
                                    </button>

                                    {onSelectMedia && (
                                        <button
                                            type="button"
                                            className="badge badge-approved"
                                            onClick={() => onSelectMedia(m.url, m.type === 'video' ? 'VIDEO' : 'IMAGE')}
                                            style={{ cursor: 'pointer', height: '24px', padding: '0 8px', borderRadius: '4px', fontSize: '11.5px', fontWeight: 500 }}
                                        >
                                            Usar
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default MediaHostingManager;
