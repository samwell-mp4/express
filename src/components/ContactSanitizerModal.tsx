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
            background: 'rgba(17, 24, 39, 0.4)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
        }}>
            <div style={{
                width: '100%',
                maxWidth: '640px',
                maxHeight: '90vh',
                overflowY: 'auto',
                padding: '24px',
                position: 'relative',
                background: '#FFFFFF',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)',
                boxShadow: 'var(--shadow-modal)'
            }}>
                {/* Close Button */}
                <button 
                    onClick={onClose}
                    style={{
                        position: 'absolute',
                        top: '16px',
                        right: '16px',
                        background: '#F3F4F6',
                        border: 'none',
                        color: 'var(--text-muted)',
                        width: '32px',
                        height: '32px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >
                    <X size={16} />
                </button>

                {/* Modal Title */}
                <div style={{ marginBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                            background: '#ECFDF5',
                            color: '#065F46',
                            border: '1px solid #A7F3D0',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 600
                        }}>
                            Etapa 1 de 2
                        </span>
                        <span style={{ fontSize: '12px', color: 'var(--text-dim)', fontWeight: 500 }}>Triagem & Higienização</span>
                    </div>
                    <h2 style={{ fontSize: '18px', fontWeight: 600, marginTop: '6px', color: 'var(--text-main)', letterSpacing: '-0.01em' }}>
                        {item.cliente || 'Campanha'}
                    </h2>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                        Agendado: {item.data_disparo || '--'} às {item.horario_disparo || '--'} | Remetente esperado: <strong>{item.numero_disparo || 'Pendente'}</strong>
                    </p>
                </div>

                {/* Section 1: Upload Planilha */}
                <div style={{ marginBottom: '18px' }}>
                    <label style={{ display: 'block', fontWeight: 500, fontSize: '12px', marginBottom: '6px', color: 'var(--text-main)' }}>
                        Planilha de Contatos (XLSX ou CSV)
                    </label>
                    <div style={{
                        border: '1px dashed #CBD5E1',
                        borderRadius: '8px',
                        padding: '20px 16px',
                        textAlign: 'center',
                        background: '#F9FAFB',
                        cursor: 'pointer',
                        position: 'relative'
                    }}>
                        <input 
                            type="file"
                            accept=".xlsx, .xls, .csv"
                            onChange={handleFileChange}
                            style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
                        />
                        <FileSpreadsheet size={28} color="var(--primary-color)" style={{ margin: '0 auto 8px' }} />
                        <p style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-main)', margin: 0 }}>
                            {file ? file.name : 'Clique ou arraste o arquivo da planilha'}
                        </p>
                        <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '4px', margin: '4px 0 0' }}>
                            {isAnalyzing ? 'Higienizando contatos...' : 'Formatação automática para padrão Brasil (55 + DDD + 9 + 8 dígitos)'}
                        </p>
                    </div>
                </div>

                {/* Section 2: Analysis Metrics & Sanitize Summary */}
                {analysis && (
                    <div style={{
                        padding: '14px',
                        marginBottom: '18px',
                        background: '#F9FAFB',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '8px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Sparkles size={15} color="var(--primary-color)" />
                                <span style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '13px' }}>Resultado da Higienização</span>
                            </div>

                            <button 
                                className="btn-secondary"
                                onClick={handleDownloadSanitizedCsv}
                                style={{ height: '30px', padding: '0 10px', fontSize: '12px', borderRadius: '6px' }}
                            >
                                <Download size={13} />
                                {downloadedCsv ? 'Planilha Baixada ✓' : 'Baixar Planilha Tratada'}
                            </button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '8px' }}>
                            <div style={{ background: '#FFFFFF', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                                <span style={{ fontSize: '11px', color: 'var(--text-dim)', display: 'block' }}>Total Linhas</span>
                                <strong style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-main)' }}>{analysis.stats.totalRows}</strong>
                            </div>

                            <div style={{ background: '#FFFFFF', padding: '8px 10px', borderRadius: '6px', border: '1px solid #BBF7D0' }}>
                                <span style={{ fontSize: '11px', color: '#16A34A', fontWeight: 500, display: 'block' }}>Válidos (13D)</span>
                                <strong style={{ fontSize: '16px', fontWeight: 600, color: 'var(--primary-color)' }}>{analysis.stats.validCount}</strong>
                            </div>

                            <div style={{ background: '#FFFFFF', padding: '8px 10px', borderRadius: '6px', border: '1px solid #FEF08A' }}>
                                <span style={{ fontSize: '11px', color: '#B45309', fontWeight: 500, display: 'block' }}>Duplicados</span>
                                <strong style={{ fontSize: '16px', fontWeight: 600, color: '#D97706' }}>{analysis.stats.duplicateCount}</strong>
                            </div>

                            <div style={{ background: '#FFFFFF', padding: '8px 10px', borderRadius: '6px', border: '1px solid #FECACA' }}>
                                <span style={{ fontSize: '11px', color: '#DC2626', fontWeight: 500, display: 'block' }}>Inválidos</span>
                                <strong style={{ fontSize: '16px', fontWeight: 600, color: '#DC2626' }}>{analysis.stats.invalidCount}</strong>
                            </div>
                        </div>

                        {/* Sample preview table */}
                        {analysis.samplePreview.length > 0 && (
                            <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-muted)' }}>
                                <span style={{ display: 'block', marginBottom: '4px', fontWeight: 500 }}>Primeiros contatos tratados:</span>
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                    {analysis.samplePreview.slice(0, 3).map((c, i) => (
                                        <code key={i} style={{ background: '#FFFFFF', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border-subtle)', color: 'var(--text-main)', fontSize: '11px' }}>
                                            {c.nome || 'Cliente'}: {c.telefone}
                                        </code>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Section 3: Link Shortener */}
                <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontWeight: 500, fontSize: '12px', marginBottom: '6px', color: 'var(--text-main)' }}>
                        Link da Campanha (Encurtador Utilitário)
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <input 
                            type="text"
                            placeholder="https://exemplo.com.br/promocao"
                            className="form-input"
                            value={targetUrl}
                            onChange={(e) => setTargetUrl(e.target.value)}
                            style={{ height: '36px', borderRadius: '6px', fontSize: '13px' }}
                        />
                        <button 
                            className="btn-secondary"
                            onClick={handleShortenLink}
                            disabled={!targetUrl || isShortening}
                            style={{ height: '36px', borderRadius: '6px', whiteSpace: 'nowrap', fontSize: '13px' }}
                        >
                            <LinkIcon size={13} />
                            {isShortening ? 'Encurtando...' : 'Encurtar'}
                        </button>
                    </div>
                    {shortenedUrl && (
                        <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--primary-color)', fontWeight: 500 }}>
                            Link encurtado: {shortenedUrl}
                        </div>
                    )}
                </div>

                {/* Section 4: Header Media */}
                <div style={{ marginBottom: '22px' }}>
                    <label style={{ display: 'block', fontWeight: 500, fontSize: '12px', marginBottom: '6px', color: 'var(--text-main)' }}>
                        Imagem ou Vídeo de Cabeçalho (Opcional)
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <input 
                            type="text"
                            placeholder="URL direta da mídia ou faça upload"
                            className="form-input"
                            value={mediaUrl}
                            onChange={(e) => setMediaUrl(e.target.value)}
                            style={{ height: '36px', borderRadius: '6px', fontSize: '13px' }}
                        />
                        <label className="btn-secondary" style={{ height: '36px', borderRadius: '6px', whiteSpace: 'nowrap', cursor: 'pointer', fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <ImageIcon size={13} />
                            {isUploadingMedia ? 'Enviando...' : 'Upload'}
                            <input type="file" accept="image/*,video/*" onChange={handleMediaUpload} style={{ display: 'none' }} />
                        </label>
                    </div>
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                    <button className="btn-secondary" onClick={onClose} style={{ height: '36px', borderRadius: '6px', fontSize: '13px' }}>
                        Cancelar
                    </button>
                    <button 
                        className="btn-primary"
                        onClick={handleAdvance}
                        disabled={!analysis || analysis.contacts.length === 0}
                        style={{ height: '36px', borderRadius: '6px', fontSize: '13px' }}
                    >
                        <span>Avançar para Multi-Remetente</span>
                        <ArrowRight size={14} />
                    </button>
                </div>

            </div>
        </div>
    );
};
