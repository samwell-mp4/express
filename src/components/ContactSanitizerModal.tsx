import React, { useState } from 'react';
import { X, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Link as LinkIcon, Download, ArrowRight, Image as ImageIcon, Sparkles } from 'lucide-react';
import { WebhookItem, ParsedContact } from '../types';
import { excelService, SpreadsheetAnalysis } from '../services/excelService';
import { api } from '../services/api';

interface ContactSanitizerModalProps {
    item: WebhookItem | null;
    onClose: () => void;
    onProceedToDispatch: (data: {
        contacts: ParsedContact[];
        headers: string[];
        targetUrl: string;
        imageUrl: string;
        selectedClient: string;
        defaultSender: string;
    }) => void;
}

export const ContactSanitizerModal: React.FC<ContactSanitizerModalProps> = ({
    item,
    onClose,
    onProceedToDispatch
}) => {
    const [file, setFile] = useState<File | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysis, setAnalysis] = useState<SpreadsheetAnalysis | null>(null);
    const [downloadedCsv, setDownloadedCsv] = useState(false);

    // Link Shortener state
    const [targetUrl, setTargetUrl] = useState('');
    const [shortenedUrl, setShortenedUrl] = useState('');
    const [isShortening, setIsShortening] = useState(false);

    // Header image/media state
    const [mediaUrl, setMediaUrl] = useState('');
    const [isUploadingMedia, setIsUploadingMedia] = useState(false);

    if (!item) return null;

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (!selectedFile) return;
        setFile(selectedFile);
        setIsAnalyzing(true);
        setDownloadedCsv(false);

        try {
            const result = await excelService.parseFile(selectedFile);
            setAnalysis(result);
        } catch (err: any) {
            alert(`Erro ao processar planilha: ${err.message}`);
            setFile(null);
            setAnalysis(null);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleDownloadSanitizedCsv = () => {
        if (!analysis || analysis.contacts.length === 0) return;
        const url = excelService.generateSanitizedCsvUrl(analysis.contacts);
        const a = document.createElement('a');
        a.href = url;
        const cleanName = (item.cliente || 'contatos').replace(/\s+/g, '_').toLowerCase();
        a.download = `${cleanName}_higienizado_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setDownloadedCsv(true);
    };

    const handleShortenLink = async () => {
        if (!targetUrl.trim()) return;
        setIsShortening(true);
        try {
            const short = await api.shortenUrl(targetUrl);
            setShortenedUrl(short || targetUrl);
        } catch (err) {
            console.error(err);
            alert('Não foi possível encurtar o link. O link original será utilizado.');
            setShortenedUrl(targetUrl);
        } finally {
            setIsShortening(false);
        }
    };

    const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const mediaFile = e.target.files?.[0];
        if (!mediaFile) return;
        setIsUploadingMedia(true);
        try {
            const uploadedUrl = await api.uploadImage(mediaFile);
            setMediaUrl(uploadedUrl);
        } catch (err: any) {
            alert(`Erro no upload: ${err.message}`);
        } finally {
            setIsUploadingMedia(false);
        }
    };

    const handleAdvance = () => {
        if (!analysis || analysis.contacts.length === 0) {
            alert('Por favor, carregue uma planilha válida com contatos antes de avançar.');
            return;
        }

        if (!downloadedCsv) {
            const proceed = window.confirm('Deseja avançar sem antes baixar a planilha higienizada para conferência?');
            if (!proceed) return;
        }

        onProceedToDispatch({
            contacts: analysis.contacts,
            headers: analysis.headers,
            targetUrl: shortenedUrl || targetUrl,
            imageUrl: mediaUrl,
            selectedClient: item.cliente || 'Cliente',
            defaultSender: item.numero_disparo || ''
        });
    };

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
        }}>
            <div className="glass-panel" style={{
                width: '100%',
                maxWidth: '740px',
                maxHeight: '90vh',
                overflowY: 'auto',
                padding: '28px',
                position: 'relative',
                background: '#ffffff',
                boxShadow: 'var(--shadow-float)'
            }}>
                {/* Close Button */}
                <button 
                    onClick={onClose}
                    style={{
                        position: 'absolute',
                        top: '20px',
                        right: '20px',
                        background: '#f1f5f9',
                        border: 'none',
                        color: 'var(--text-muted)',
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >
                    <X size={18} />
                </button>

                {/* Modal Title */}
                <div style={{ marginBottom: '22px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="badge badge-approved">Etapa 1 de 2</span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontWeight: 600 }}>Triagem & Higienização</span>
                    </div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 900, marginTop: '6px', color: 'var(--text-main)' }}>
                        {item.cliente || 'Campanha'}
                    </h2>
                    <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                        Agendado: {item.data_disparo || '--'} às {item.horario_disparo || '--'} | Remetente esperado: <strong>{item.numero_disparo || 'Pendente'}</strong>
                    </p>
                </div>

                {/* Section 1: Upload Planilha */}
                <div style={{ marginBottom: '22px' }}>
                    <label style={{ display: 'block', fontWeight: 700, fontSize: '0.88rem', marginBottom: '8px', color: 'var(--text-main)' }}>
                        📁 Planilha de Contatos (XLSX ou CSV)
                    </label>
                    <div style={{
                        border: '2px dashed #cbd5e1',
                        borderRadius: '14px',
                        padding: '26px 20px',
                        textAlign: 'center',
                        background: '#f8fafc',
                        cursor: 'pointer',
                        position: 'relative',
                        transition: 'border-color 0.18s'
                    }}>
                        <input 
                            type="file"
                            accept=".xlsx, .xls, .csv"
                            onChange={handleFileChange}
                            style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
                        />
                        <FileSpreadsheet size={36} color="var(--primary-color)" style={{ margin: '0 auto 10px' }} />
                        <p style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-main)' }}>
                            {file ? file.name : 'Clique ou arraste o arquivo da planilha'}
                        </p>
                        <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                            {isAnalyzing ? 'Higienizando contatos...' : 'Formatação automática para padrão Brasil (55 + DDD + 9 + 8 dígitos)'}
                        </p>
                    </div>
                </div>

                {/* Section 2: Analysis Metrics & Sanitize Summary */}
                {analysis && (
                    <div className="glass-card" style={{ padding: '18px', marginBottom: '22px', background: '#f0fdf4', borderColor: '#bbf7d0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Sparkles size={18} color="var(--primary-color)" />
                                <span style={{ fontWeight: 800, color: '#166534', fontSize: '0.92rem' }}>Resultado da Higienização</span>
                            </div>

                            <button 
                                className="btn-secondary"
                                onClick={handleDownloadSanitizedCsv}
                                style={{ padding: '6px 14px', fontSize: '0.8rem', background: downloadedCsv ? '#dcfce7' : '#ffffff' }}
                            >
                                <Download size={14} />
                                {downloadedCsv ? 'Planilha Baixada ✓' : 'Baixar Planilha Tratada'}
                            </button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                            <div style={{ background: '#ffffff', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', display: 'block' }}>Total de Linhas</span>
                                <strong style={{ fontSize: '1.25rem', color: 'var(--text-main)' }}>{analysis.stats.totalRows}</strong>
                            </div>

                            <div style={{ background: '#ffffff', padding: '10px 12px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                                <span style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: 600, display: 'block' }}>Válidos (13D)</span>
                                <strong style={{ fontSize: '1.25rem', color: 'var(--primary-color)' }}>{analysis.stats.validCount}</strong>
                            </div>

                            <div style={{ background: '#ffffff', padding: '10px 12px', borderRadius: '8px', border: '1px solid #fef08a' }}>
                                <span style={{ fontSize: '0.72rem', color: '#b45309', fontWeight: 600, display: 'block' }}>Duplicados</span>
                                <strong style={{ fontSize: '1.25rem', color: '#d97706' }}>{analysis.stats.duplicateCount}</strong>
                            </div>

                            <div style={{ background: '#ffffff', padding: '10px 12px', borderRadius: '8px', border: '1px solid #fecaca' }}>
                                <span style={{ fontSize: '0.72rem', color: '#dc2626', fontWeight: 600, display: 'block' }}>Inválidos</span>
                                <strong style={{ fontSize: '1.25rem', color: '#dc2626' }}>{analysis.stats.invalidCount}</strong>
                            </div>
                        </div>

                        {/* Sample preview table */}
                        {analysis.samplePreview.length > 0 && (
                            <div style={{ marginTop: '12px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                <span style={{ display: 'block', marginBottom: '4px', fontWeight: 600 }}>Primeiros contatos tratados:</span>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    {analysis.samplePreview.slice(0, 3).map((c, i) => (
                                        <code key={i} style={{ background: '#ffffff', padding: '2px 8px', borderRadius: '6px', border: '1px solid #e2e8f0', color: 'var(--primary-color)', fontWeight: 600 }}>
                                            {c.nome || 'Cliente'}: {c.telefone}
                                        </code>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Section 3: Link Shortener */}
                <div style={{ marginBottom: '18px' }}>
                    <label style={{ display: 'block', fontWeight: 700, fontSize: '0.85rem', marginBottom: '6px', color: 'var(--text-main)' }}>
                        🔗 Link da Campanha (Encurtador Utilitário)
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <input 
                            type="text"
                            placeholder="https://exemplo.com.br/promocao"
                            className="form-input"
                            value={targetUrl}
                            onChange={(e) => setTargetUrl(e.target.value)}
                        />
                        <button 
                            className="btn-secondary"
                            onClick={handleShortenLink}
                            disabled={!targetUrl || isShortening}
                            style={{ whiteSpace: 'nowrap' }}
                        >
                            <LinkIcon size={14} />
                            {isShortening ? 'Encurtando...' : 'Encurtar'}
                        </button>
                    </div>
                    {shortenedUrl && (
                        <div style={{ marginTop: '4px', fontSize: '0.78rem', color: 'var(--primary-color)', fontWeight: 600 }}>
                            Link encurtado: {shortenedUrl}
                        </div>
                    )}
                </div>

                {/* Section 4: Header Media */}
                <div style={{ marginBottom: '26px' }}>
                    <label style={{ display: 'block', fontWeight: 700, fontSize: '0.85rem', marginBottom: '6px', color: 'var(--text-main)' }}>
                        🖼️ Imagem ou Vídeo de Cabeçalho (Opcional)
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <input 
                            type="text"
                            placeholder="URL direta da mídia ou faça upload"
                            className="form-input"
                            value={mediaUrl}
                            onChange={(e) => setMediaUrl(e.target.value)}
                        />
                        <label className="btn-secondary" style={{ whiteSpace: 'nowrap', cursor: 'pointer' }}>
                            <ImageIcon size={14} />
                            {isUploadingMedia ? 'Enviando...' : 'Upload'}
                            <input type="file" accept="image/*,video/*" onChange={handleMediaUpload} style={{ display: 'none' }} />
                        </label>
                    </div>
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px' }}>
                    <button className="btn-secondary" onClick={onClose}>
                        Cancelar
                    </button>
                    <button 
                        className="btn-primary"
                        onClick={handleAdvance}
                        disabled={!analysis || analysis.contacts.length === 0}
                    >
                        <span>Avançar para Multi-Remetente</span>
                        <ArrowRight size={16} />
                    </button>
                </div>

            </div>
        </div>
    );
};
