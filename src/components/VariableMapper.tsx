import React, { useState, useEffect, useRef } from 'react';
import { 
    Type, Plus, Trash2, Image as ImageIcon, Sparkles, Upload, 
    Layers, ExternalLink, Check, AlertTriangle, Eye, CheckCircle2,
    RefreshCw, Smartphone, HelpCircle, FileSpreadsheet, X, FolderOpen
} from 'lucide-react';
import { PlaceholderMapping, ParsedContact, InfobipTemplateSummary } from '../types';
import { templateHelper, TemplateAnalysis } from '../services/templateHelper';
import { mediaStorage } from '../services/mediaStorage';
import { api } from '../services/api';

interface VariableMapperProps {
    mappings: PlaceholderMapping[];
    setMappings: React.Dispatch<React.SetStateAction<PlaceholderMapping[]>>;
    headers: string[];
    sampleContact?: ParsedContact;
    templateName: string;
    onTemplateChange?: (newTemplateName: string) => void;
    availableTemplates?: InfobipTemplateSummary[];
    mediaUrl: string;
    onMediaUrlChange: (url: string) => void;
    headerType: 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'TEXT' | 'NONE';
    onHeaderTypeChange?: (headerType: 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'TEXT' | 'NONE') => void;
}

export const VariableMapper: React.FC<VariableMapperProps> = ({
    mappings,
    setMappings,
    headers,
    sampleContact,
    templateName,
    onTemplateChange,
    availableTemplates = [],
    mediaUrl,
    onMediaUrlChange,
    headerType,
    onHeaderTypeChange
}) => {
    const [templateInfo, setTemplateInfo] = useState<TemplateAnalysis>(() => {
        return templateHelper.analyzeTemplate(templateName, null, availableTemplates);
    });

    const [showMediaPickerModal, setShowMediaPickerModal] = useState(false);
    const [savedMedias, setSavedMedias] = useState(() => mediaStorage.getAllMedia());
    const [isUploadingMedia, setIsUploadingMedia] = useState(false);
    const [imageError, setImageError] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    // Helper para extrair valor de exemplo de forma tolerante a maiúsculas/minúsculas
    const getSampleValueForCol = (col: string) => {
        if (!sampleContact) return '';
        if (col === 'nome') return sampleContact.nome || sampleContact['nome'] || '';
        if (col === 'telefone') return sampleContact.telefone || sampleContact['telefone'] || '';
        return sampleContact[col] || sampleContact[col.toLowerCase()] || '';
    };

    // Colunas disponíveis para mapeamento
    const availableColumns = [
        'nome', 
        'telefone', 
        ...headers.filter(h => h.toLowerCase() !== 'nome' && h.toLowerCase() !== 'telefone')
    ];

    // Atualiza a análise sempre que o templateName ou a lista de templates mudar
    useEffect(() => {
        const analysis = templateHelper.analyzeTemplate(templateName, null, availableTemplates);
        setTemplateInfo(analysis);

        // Se o template detectou cabeçalho de imagem e o headerType atual for NONE, sincronizar
        if (analysis.headerType === 'IMAGE' && headerType !== 'IMAGE' && onHeaderTypeChange) {
            onHeaderTypeChange('IMAGE');
        }

        // Se o template possui contagem de variáveis diferente do número de mappings atual, sincronizar
        if (analysis.variablesCount > 0 && mappings.length !== analysis.variablesCount) {
            const updated = templateHelper.generateMappingsForVariables(analysis.variablesCount, mappings, headers);
            setMappings(updated);
        }
    }, [templateName, availableTemplates]);

    // Sincroniza automaticamente mapeamentos quando a planilha é carregada ou alterada
    useEffect(() => {
        if (headers.length > 0) {
            setMappings(prev => {
                const hasUnmapped = prev.some(m => (m.type === 'column' && !m.columnName) || (m.type === 'fixed' && !m.fixedValue));
                if (hasUnmapped) {
                    return templateHelper.generateMappingsForVariables(prev.length || 2, prev, headers);
                }
                return prev;
            });
        }
    }, [headers]);

    // Carregar mídias salvas ao abrir o seletor
    const openMediaPicker = () => {
        setSavedMedias(mediaStorage.getAllMedia());
        setShowMediaPickerModal(true);
    };

    // Upload direto de imagem
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploadingMedia(true);
        try {
            const result = await api.uploadMedia(file);
            if (result.url) {
                onMediaUrlChange(result.url);
                mediaStorage.saveMedia({
                    name: file.name,
                    originalName: file.name,
                    url: result.url,
                    size: `${(file.size / 1024).toFixed(1)} KB`,
                    type: file.type.startsWith('video') ? 'video' : 'image'
                });
                setImageError(false);
            }
        } catch (err: any) {
            alert(`Falha no upload da imagem: ${err.message}`);
        } finally {
            setIsUploadingMedia(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // Ajustar preset rápido de quantidade de variáveis (2, 3, 4, 5)
    const handleSetPresetCount = (count: number) => {
        const updated = templateHelper.generateMappingsForVariables(count, mappings, headers);
        setMappings(updated);
    };

    const addPlaceholder = () => {
        const nextId = mappings.length + 1;
        setMappings(prev => [...prev, { id: nextId, type: 'fixed', columnName: '', fixedValue: '' }]);
    };

    const removePlaceholder = (id: number) => {
        if (mappings.length <= 1) {
            alert('O template deve ter pelo menos 1 variável.');
            return;
        }
        setMappings(prev => prev.filter(m => m.id !== id).map((m, idx) => ({ ...m, id: idx + 1 })));
    };

    const updateMapping = (id: number, updates: Partial<PlaceholderMapping>) => {
        setMappings(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
    };

    // Render do texto com tags coloridas no modelo
    const renderHighlightedTemplateBody = (text: string) => {
        if (!text) return null;
        const parts = text.split(/(\{\{\d+\}\})/g);
        return parts.map((part, index) => {
            const match = part.match(/^\{\{(\d+)\}\}$/);
            if (match) {
                const varNum = match[1];
                return (
                    <span 
                        key={index}
                        style={{
                            background: '#0284c7',
                            color: '#ffffff',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            fontWeight: 700,
                            fontSize: '11.5px',
                            fontFamily: 'monospace',
                            margin: '0 2px',
                            display: 'inline-block'
                        }}
                    >
                        {`{{${varNum}}}`}
                    </span>
                );
            }
            return <span key={index}>{part}</span>;
        });
    };

    const renderedLiveMessage = templateHelper.renderPreviewText(templateInfo.bodyText, mappings, sampleContact);
    const requiresImage = headerType === 'IMAGE' || templateInfo.headerType === 'IMAGE';

    return (
        <div className="glass-panel" style={{ 
            padding: '22px', 
            marginBottom: '20px', 
            borderRadius: '10px', 
            border: '1px solid var(--border-subtle)', 
            background: '#ffffff',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
        }}>
            
            {/* Header da Seção de Transmissão */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span className="badge badge-approved" style={{ fontSize: '11px', height: '20px', padding: '0 6px', fontWeight: 600 }}>
                            Padrão Infobip
                        </span>
                        <h3 style={{ fontSize: '17px', fontWeight: 600, color: 'var(--text-main)', margin: 0, letterSpacing: '-0.01em' }}>
                            Configuração do Modelo & Variáveis da Transmissão
                        </h3>
                    </div>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
                        Configure as variáveis do corpo (<code style={{ color: '#0284c7', fontWeight: 600 }}>{'{{1}}'}</code>, <code style={{ color: '#0284c7', fontWeight: 600 }}>{'{{2}}'}</code>...) e a <strong>URL da Imagem Original</strong> caso o modelo utilize cabeçalho com foto.
                    </p>
                </div>

                {/* Seletor rápido de modelo se houver mais de um disponível */}
                {availableTemplates.length > 0 && onTemplateChange && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>Modelo:</span>
                        <select 
                            className="form-select"
                            value={templateName}
                            onChange={(e) => onTemplateChange(e.target.value)}
                            style={{ height: '34px', fontSize: '12.5px', borderRadius: '6px', fontWeight: 600, minWidth: '180px' }}
                        >
                            {availableTemplates.map(t => (
                                <option key={t.name} value={t.name}>
                                    {t.name} ({t.language || 'pt_BR'})
                                </option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {/* BARRA DE STATUS DO TEMPLATE ATIVO */}
            <div style={{ 
                background: '#f8fafc', 
                border: '1px solid #e2e8f0', 
                borderRadius: '8px', 
                padding: '12px 16px', 
                marginBottom: '18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ 
                        background: '#e0f2fe', 
                        color: '#0369a1', 
                        width: '32px', 
                        height: '32px', 
                        borderRadius: '6px', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center' 
                    }}>
                        <Smartphone size={16} />
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <strong style={{ fontSize: '14px', color: 'var(--text-main)', fontFamily: 'monospace' }}>
                                {templateInfo.templateName || templateName || 'template'}
                            </strong>
                            <span className="badge badge-approved" style={{ fontSize: '10.5px', height: '18px', padding: '0 5px' }}>
                                <CheckCircle2 size={10} /> {templateInfo.status || 'APROVADO'}
                            </span>
                            <span className="badge" style={{ fontSize: '10.5px', height: '18px', padding: '0 5px' }}>
                                {templateInfo.category || 'UTILITY'}
                            </span>
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                            Detectado: <strong style={{ color: 'var(--text-main)' }}>{templateInfo.variablesCount} Variáveis</strong> {requiresImage && '• Cabeçalho com Imagem'}
                        </div>
                    </div>
                </div>

                {/* Presets Rápidos de Variáveis */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: 500, marginRight: '4px' }}>
                        Preset Rápido:
                    </span>
                    {[2, 3, 4, 5].map(count => (
                        <button
                            key={count}
                            type="button"
                            onClick={() => handleSetPresetCount(count)}
                            style={{
                                height: '28px',
                                padding: '0 8px',
                                fontSize: '11.5px',
                                fontWeight: mappings.length === count ? 700 : 500,
                                background: mappings.length === count ? 'var(--primary-color)' : '#ffffff',
                                color: mappings.length === count ? '#ffffff' : 'var(--text-main)',
                                border: mappings.length === count ? '1px solid var(--primary-color)' : '1px solid #cbd5e1',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            {count} Variáveis
                        </button>
                    ))}
                </div>
            </div>

            {/* GRID PRINCIPAL: CONFIGURAÇÃO DE IMAGEM & VARIÁVEIS + PREVIEW WHATSAPP */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.4fr) minmax(300px, 1fr)', gap: '20px', alignItems: 'start' }}>
                
                {/* COLUNA ESQUERDA: FORMULÁRIO DE CABEÇALHO E VARIÁVEIS */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    
                    {/* 1. SEÇÃO CABEÇALHO / URL DA IMAGEM ORIGINAL */}
                    <div style={{ 
                        border: requiresImage ? '1.5px solid #38bdf8' : '1px solid var(--border-subtle)', 
                        background: requiresImage ? '#f0f9ff' : '#fafafa', 
                        borderRadius: '8px', 
                        padding: '14px 16px' 
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <ImageIcon size={15} color={requiresImage ? '#0284c7' : 'var(--text-muted)'} />
                                <strong style={{ fontSize: '13.5px', color: 'var(--text-main)' }}>
                                    URL da Imagem Original (Cabeçalho da Transmissão)
                                </strong>
                                {requiresImage && (
                                    <span style={{ fontSize: '10.5px', color: '#0369a1', background: '#e0f2fe', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                                        Exigido pelo Modelo
                                    </span>
                                )}
                            </div>

                            {onHeaderTypeChange && (
                                <select 
                                    className="form-select"
                                    value={headerType}
                                    onChange={(e: any) => onHeaderTypeChange(e.target.value)}
                                    style={{ height: '28px', fontSize: '11.5px', padding: '0 6px', borderRadius: '4px' }}
                                >
                                    <option value="IMAGE">Cabeçalho com Imagem</option>
                                    <option value="NONE">Sem Mídia</option>
                                    <option value="VIDEO">Vídeo</option>
                                </select>
                            )}
                        </div>

                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 10px 0' }}>
                            Insira a URL pública da imagem original que será enviada no topo do template via Infobip WhatsApp API.
                        </p>

                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <input 
                                type="url"
                                placeholder="https://exemplo.com/imagem-original.jpg (URL pública direta)"
                                className="form-input"
                                value={mediaUrl}
                                onChange={(e) => {
                                    onMediaUrlChange(e.target.value);
                                    setImageError(false);
                                }}
                                style={{ flex: 1, height: '36px', fontSize: '12.5px', borderRadius: '6px' }}
                            />

                            <button 
                                type="button"
                                className="btn-secondary"
                                onClick={openMediaPicker}
                                style={{ height: '36px', fontSize: '12px', padding: '0 10px', borderRadius: '6px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '5px' }}
                                title="Selecionar das mídias já hospedadas no sistema"
                            >
                                <FolderOpen size={13} />
                                Mídias Salvas
                            </button>

                            <button 
                                type="button"
                                className="btn-secondary"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isUploadingMedia}
                                style={{ height: '36px', fontSize: '12px', padding: '0 10px', borderRadius: '6px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '5px' }}
                                title="Fazer upload de nova imagem do computador"
                            >
                                <Upload size={13} />
                                {isUploadingMedia ? 'Enviando...' : 'Upload'}
                            </button>

                            <input 
                                ref={fileInputRef}
                                type="file"
                                accept="image/*,video/*"
                                onChange={handleFileUpload}
                                style={{ display: 'none' }}
                            />
                        </div>

                        {/* Status da URL da Imagem */}
                        {mediaUrl ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', fontSize: '11.5px' }}>
                                <span style={{ color: '#16a34a', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                                    <CheckCircle2 size={12} /> URL da Imagem vinculada
                                </span>
                                <a 
                                    href={mediaUrl} 
                                    target="_blank" 
                                    rel="noreferrer" 
                                    style={{ color: '#0284c7', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                >
                                    Testar link <ExternalLink size={10} />
                                </a>
                                <button 
                                    type="button" 
                                    onClick={() => onMediaUrlChange('')}
                                    style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}
                                    title="Remover imagem"
                                >
                                    Limpar
                                </button>
                            </div>
                        ) : requiresImage ? (
                            <div style={{ marginTop: '8px', fontSize: '11.5px', color: '#b45309', display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 500 }}>
                                <AlertTriangle size={12} />
                                Informe a URL da Imagem Original para que a transmissão não falhe na Infobip.
                            </div>
                        ) : null}
                    </div>

                    {/* 2. TEXTO DO TEMPLATE COM AS VARIÁVEIS DESTACADAS */}
                    {templateInfo.bodyText && (
                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 14px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
                                Texto do Modelo Aprovado:
                            </div>
                            <div style={{ fontSize: '12.5px', color: 'var(--text-main)', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                                {renderHighlightedTemplateBody(templateInfo.bodyText)}
                            </div>
                        </div>
                    )}

                    {/* 3. LISTA DE MAPEAMENTO DE VARIÁVEIS */}
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Type size={15} color="var(--primary-color)" />
                                <strong style={{ fontSize: '14px', color: 'var(--text-main)' }}>
                                    Campos das Variáveis ({mappings.length} {mappings.length === 1 ? 'Variável' : 'Variáveis'})
                                </strong>
                            </div>

                            <button 
                                type="button"
                                className="btn-secondary"
                                onClick={addPlaceholder}
                                style={{ height: '30px', fontSize: '12px', padding: '0 10px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}
                            >
                                <Plus size={13} />
                                Adicionar Mais
                            </button>
                        </div>

                        {/* Banner de Colunas Detectadas na Planilha */}
                        {headers && headers.length > 0 && (
                            <div style={{
                                background: '#f0fdf4',
                                border: '1px solid #bbf7d0',
                                borderRadius: '8px',
                                padding: '10px 14px',
                                marginBottom: '12px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '6px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#166534', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <FileSpreadsheet size={14} color="#16a34a" />
                                        Colunas Detectadas na Planilha ({headers.length}):
                                    </span>
                                    <span style={{ fontSize: '11px', color: '#15803d' }}>
                                        {sampleContact ? 'Valores extraídos com sucesso do primeiro contato' : 'Aguardando dados'}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                    {headers.map((h, i) => {
                                        const sampleVal = getSampleValueForCol(h);
                                        return (
                                            <span 
                                                key={i}
                                                style={{
                                                    background: '#ffffff',
                                                    border: '1px solid #86efac',
                                                    color: '#14532d',
                                                    fontSize: '11.5px',
                                                    fontWeight: 500,
                                                    padding: '3px 8px',
                                                    borderRadius: '4px',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '5px'
                                                }}
                                            >
                                                <strong>{h}:</strong>
                                                <span style={{ color: '#475569', fontSize: '11px' }}>
                                                    {sampleVal ? (sampleVal.length > 20 ? sampleVal.slice(0, 20) + '...' : sampleVal) : '—'}
                                                </span>
                                            </span>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {mappings.map((m, idx) => {
                                const varIndex = idx + 1;
                                const exampleVal = templateInfo.examples?.[idx];
                                const previewVal = m.type === 'column'
                                    ? (m.columnName ? getSampleValueForCol(m.columnName) : '')
                                    : m.fixedValue;
                                const isUnset = (m.type === 'column' && !m.columnName) || (m.type === 'fixed' && !m.fixedValue?.trim());

                                return (
                                    <div 
                                        key={m.id}
                                        style={{ 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            gap: '10px', 
                                            background: isUnset ? '#fffbeb' : '#f8fafc', 
                                            padding: '10px 14px', 
                                            borderRadius: '8px',
                                            border: isUnset ? '1px solid #fde68a' : '1px solid #e2e8f0',
                                            flexWrap: 'wrap'
                                        }}
                                    >
                                        {/* Tag da Variável */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{ 
                                                background: '#0284c7', 
                                                color: '#ffffff', 
                                                fontWeight: 700, 
                                                fontSize: '12px', 
                                                padding: '4px 8px', 
                                                borderRadius: '5px',
                                                fontFamily: 'monospace'
                                            }}>
                                                {`{{${varIndex}}}`}
                                            </span>
                                        </div>

                                        {/* Seletor Tipo: Coluna ou Fixo */}
                                        <select 
                                            className="form-select"
                                            value={m.type}
                                            onChange={(e: any) => updateMapping(m.id, { type: e.target.value })}
                                            style={{ width: '130px', height: '34px', padding: '0 8px', fontSize: '12.5px', borderRadius: '6px', fontWeight: 500 }}
                                        >
                                            <option value="column">Coluna da Planilha</option>
                                            <option value="fixed">Texto / Valor Fixo</option>
                                        </select>

                                        {/* Campo de Seleção ou Digitação */}
                                        {m.type === 'column' ? (
                                            <div style={{ flex: 1, minWidth: '160px' }}>
                                                <select 
                                                    className="form-select"
                                                    value={m.columnName}
                                                    onChange={(e) => updateMapping(m.id, { columnName: e.target.value })}
                                                    style={{ width: '100%', height: '34px', padding: '0 8px', fontSize: '12.5px', borderRadius: '6px', borderColor: !m.columnName ? '#f59e0b' : undefined }}
                                                >
                                                    <option value="">Selecione a Coluna...</option>
                                                    {availableColumns.map(col => {
                                                        const sVal = getSampleValueForCol(col);
                                                        return (
                                                            <option key={col} value={col}>
                                                                {col} {sVal ? `(Ex: "${sVal.length > 18 ? sVal.substring(0, 18) + '...' : sVal}")` : ''}
                                                            </option>
                                                        );
                                                    })}
                                                </select>
                                            </div>
                                        ) : (
                                            <div style={{ flex: 1, minWidth: '160px' }}>
                                                <input 
                                                    type="text"
                                                    placeholder={exampleVal ? `Ex: ${exampleVal}` : `Valor para {{${varIndex}}}...`}
                                                    className="form-input"
                                                    value={m.fixedValue}
                                                    onChange={(e) => updateMapping(m.id, { fixedValue: e.target.value })}
                                                    style={{ width: '100%', height: '34px', padding: '0 10px', fontSize: '12.5px', borderRadius: '6px', borderColor: !m.fixedValue?.trim() ? '#f59e0b' : undefined }}
                                                />
                                            </div>
                                        )}

                                        {/* Valor ao Vivo */}
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', minWidth: '120px' }}>
                                            Valor: <strong style={{ color: previewVal ? 'var(--text-main)' : '#dc2626', fontWeight: 600 }}>{previewVal || (exampleVal ? `(${exampleVal})` : '— Vazio —')}</strong>
                                        </div>

                                        {isUnset && (
                                            <span style={{ fontSize: '11px', color: '#b45309', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px' }} title="Preencha este campo para evitar rejeição da Infobip">
                                                <AlertTriangle size={12} /> Obrigatório
                                            </span>
                                        )}

                                        {/* Botão Remover */}
                                        {mappings.length > 1 && (
                                            <button 
                                                type="button"
                                                onClick={() => removePlaceholder(m.id)}
                                                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '6px', borderRadius: '4px' }}
                                                title={`Remover {{${varIndex}}}`}
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* COLUNA DIREITA: LIVE PREVIEW DO WHATSAPP */}
                <div style={{ 
                    background: '#e5ddd5', 
                    borderRadius: '12px', 
                    padding: '16px', 
                    boxShadow: 'inset 0 0 10px rgba(0,0,0,0.06)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Smartphone size={15} color="#075e54" />
                            <strong style={{ fontSize: '13px', color: '#075e54' }}>
                                Pré-visualização WhatsApp
                            </strong>
                        </div>
                        <span style={{ fontSize: '11px', color: '#667781', fontWeight: 500 }}>
                            Ao vivo
                        </span>
                    </div>

                    {/* BALÃO DO WHATSAPP */}
                    <div style={{ 
                        background: '#ffffff', 
                        borderRadius: '8px', 
                        boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        maxWidth: '100%'
                    }}>
                        
                        {/* Imagem do Cabeçalho */}
                        {requiresImage && (
                            mediaUrl && !imageError ? (
                                <div style={{ width: '100%', maxHeight: '200px', overflow: 'hidden', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <img 
                                        src={mediaUrl} 
                                        alt="Imagem do Template"
                                        onError={() => setImageError(true)}
                                        style={{ width: '100%', height: 'auto', maxHeight: '200px', objectFit: 'cover' }}
                                    />
                                </div>
                            ) : (
                                <div style={{ 
                                    padding: '24px 16px', 
                                    background: '#f8fafc', 
                                    borderBottom: '1px dashed #cbd5e1', 
                                    display: 'flex', 
                                    flexDirection: 'column', 
                                    alignItems: 'center', 
                                    justifyContent: 'center',
                                    gap: '6px',
                                    color: '#64748b'
                                }}>
                                    <ImageIcon size={28} color="#94a3b8" />
                                    <span style={{ fontSize: '12px', fontWeight: 500 }}>
                                        {mediaUrl ? '⚠️ Erro ao carregar imagem' : '🖼️ Nenhuma Imagem Original inserida'}
                                    </span>
                                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                                        Cole a URL da Imagem no campo ao lado
                                    </span>
                                </div>
                            )
                        )}

                        {/* Corpo da Mensagem */}
                        <div style={{ padding: '12px 14px', fontSize: '13px', lineHeight: '1.5', color: '#111b21', whiteSpace: 'pre-wrap' }}>
                            {renderedLiveMessage}
                        </div>

                        {/* Rodapé do Template */}
                        {templateInfo.footerText && (
                            <div style={{ padding: '0 14px 8px 14px', fontSize: '11px', color: '#667781' }}>
                                {templateInfo.footerText}
                            </div>
                        )}

                        {/* Horário & Tique WhatsApp */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '4px', padding: '0 12px 8px 12px', fontSize: '11px', color: '#667781' }}>
                            <span>12:00</span>
                            <span style={{ color: '#53bdeb' }}>✓✓</span>
                        </div>

                        {/* Botões do Template */}
                        {templateInfo.buttons && templateInfo.buttons.length > 0 && (
                            <div style={{ borderTop: '1px solid #e9edef', display: 'flex', flexDirection: 'column' }}>
                                {templateInfo.buttons.map((btn, bIdx) => (
                                    <div 
                                        key={bIdx}
                                        style={{ 
                                            padding: '10px', 
                                            textAlign: 'center', 
                                            fontSize: '12.5px', 
                                            fontWeight: 600, 
                                            color: '#00a884', 
                                            borderTop: bIdx > 0 ? '1px solid #e9edef' : 'none',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '5px'
                                        }}
                                    >
                                        <ExternalLink size={12} />
                                        <span>{btn.text}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

            </div>

            {/* MODAL: SELETOR DE MÍDIAS HOSPEDADAS */}
            {showMediaPickerModal && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(15, 23, 42, 0.45)',
                    backdropFilter: 'blur(3px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1200,
                    padding: '16px'
                }}>
                    <div className="glass-panel" style={{
                        width: '100%',
                        maxWidth: '650px',
                        maxHeight: '85vh',
                        overflowY: 'auto',
                        padding: '22px',
                        background: '#ffffff',
                        borderRadius: '10px',
                        boxShadow: '0 10px 25px rgba(0,0,0,0.15)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                            <div>
                                <h3 style={{ fontSize: '17px', fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>
                                    Mídias Hospedadas no Sistema
                                </h3>
                                <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                                    Clique em qualquer imagem para vincular como URL da Imagem Original da transmissão.
                                </p>
                            </div>
                            <button 
                                onClick={() => setShowMediaPickerModal(false)}
                                style={{ background: '#f1f5f9', border: 'none', borderRadius: '6px', padding: '6px', cursor: 'pointer' }}
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {savedMedias.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--text-muted)' }}>
                                <ImageIcon size={32} color="#cbd5e1" style={{ marginBottom: '8px' }} />
                                <p style={{ margin: 0, fontSize: '13px' }}>Nenhuma mídia encontrada na biblioteca local.</p>
                                <button 
                                    className="btn-primary"
                                    onClick={() => {
                                        setShowMediaPickerModal(false);
                                        fileInputRef.current?.click();
                                    }}
                                    style={{ marginTop: '12px', height: '32px', fontSize: '12px' }}
                                >
                                    Fazer Upload Agora
                                </button>
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
                                {savedMedias.map(m => (
                                    <div 
                                        key={m.id}
                                        onClick={() => {
                                            onMediaUrlChange(m.url);
                                            setImageError(false);
                                            setShowMediaPickerModal(false);
                                        }}
                                        style={{
                                            border: mediaUrl === m.url ? '2px solid var(--primary-color)' : '1px solid #e2e8f0',
                                            borderRadius: '8px',
                                            overflow: 'hidden',
                                            cursor: 'pointer',
                                            background: '#f8fafc',
                                            transition: 'transform 0.15s ease, border-color 0.15s ease'
                                        }}
                                    >
                                        <div style={{ height: '110px', overflow: 'hidden', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            {m.type === 'video' ? (
                                                <video src={m.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            ) : (
                                                <img src={m.url} alt={m.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            )}
                                        </div>
                                        <div style={{ padding: '8px 10px', fontSize: '11.5px' }}>
                                            <div style={{ fontWeight: 600, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {m.originalName || m.name}
                                            </div>
                                            <div style={{ color: 'var(--text-dim)', fontSize: '10.5px', marginTop: '2px' }}>
                                                {m.size || ''}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

        </div>
    );
};
