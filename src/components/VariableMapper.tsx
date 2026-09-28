import React from 'react';
import { Type, Plus, Trash2 } from 'lucide-react';
import { PlaceholderMapping, ParsedContact } from '../types';

interface VariableMapperProps {
    mappings: PlaceholderMapping[];
    setMappings: React.Dispatch<React.SetStateAction<PlaceholderMapping[]>>;
    headers: string[];
    sampleContact?: ParsedContact;
}

export const VariableMapper: React.FC<VariableMapperProps> = ({
    mappings,
    setMappings,
    headers,
    sampleContact
}) => {
    const availableColumns = ['nome', 'telefone', ...headers.filter(h => h.toLowerCase() !== 'nome' && h.toLowerCase() !== 'telefone')];

    const addPlaceholder = () => {
        const nextId = mappings.length + 1;
        setMappings(prev => [...prev, { id: nextId, type: 'column', columnName: '', fixedValue: '' }]);
    };

    const removePlaceholder = (id: number) => {
        setMappings(prev => prev.filter(m => m.id !== id));
    };

    const updateMapping = (id: number, updates: Partial<PlaceholderMapping>) => {
        setMappings(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
    };

    return (
        <div className="glass-panel" style={{ padding: '20px 24px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Type size={18} color="var(--primary-color)" />
                    <h4 style={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--text-main)' }}>
                        Mapeamento de Variáveis ({`{{1}}, {{2}}...`})
                    </h4>
                </div>

                <button 
                    className="btn-secondary"
                    onClick={addPlaceholder}
                    style={{ fontSize: '0.8rem', padding: '6px 12px' }}
                >
                    <Plus size={14} />
                    Adicionar Variável
                </button>
            </div>

            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                Associe cada variável do corpo do template a uma coluna da planilha (ex: Nome do Cliente) ou digite um texto estático.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {mappings.map((m, idx) => {
                    const previewVal = m.type === 'column'
                        ? (sampleContact ? (sampleContact[m.columnName] || sampleContact.nome || '') : 'Exemplo')
                        : m.fixedValue;

                    return (
                        <div key={m.id} style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '12px', 
                            background: '#f8fafc', 
                            padding: '10px 14px', 
                            borderRadius: '10px',
                            border: '1px solid var(--border-subtle)',
                            flexWrap: 'wrap'
                        }}>
                            <span style={{ 
                                background: 'var(--primary-color)', 
                                color: '#ffffff', 
                                fontWeight: 800, 
                                fontSize: '0.78rem', 
                                padding: '3px 8px', 
                                borderRadius: '6px' 
                            }}>
                                {`{{${idx + 1}}}`}
                            </span>

                            <select 
                                className="form-select"
                                value={m.type}
                                onChange={(e: any) => updateMapping(m.id, { type: e.target.value })}
                                style={{ width: '130px', padding: '6px 10px', fontSize: '0.82rem' }}
                            >
                                <option value="column">Coluna</option>
                                <option value="fixed">Texto Fixo</option>
                            </select>

                            {m.type === 'column' ? (
                                <select 
                                    className="form-select"
                                    value={m.columnName}
                                    onChange={(e) => updateMapping(m.id, { columnName: e.target.value })}
                                    style={{ flex: 1, minWidth: '150px', padding: '6px 10px', fontSize: '0.82rem' }}
                                >
                                    <option value="">Selecione a Coluna...</option>
                                    {availableColumns.map(col => (
                                        <option key={col} value={col}>{col}</option>
                                    ))}
                                </select>
                            ) : (
                                <input 
                                    type="text"
                                    placeholder="Texto fixo..."
                                    className="form-input"
                                    value={m.fixedValue}
                                    onChange={(e) => updateMapping(m.id, { fixedValue: e.target.value })}
                                    style={{ flex: 1, minWidth: '150px', padding: '6px 10px', fontSize: '0.82rem' }}
                                />
                            )}

                            {/* Live preview value */}
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', minWidth: '140px' }}>
                                Valor: <strong style={{ color: 'var(--primary-color)' }}>{previewVal || '—'}</strong>
                            </div>

                            {mappings.length > 1 && (
                                <button 
                                    onClick={() => removePlaceholder(m.id)}
                                    style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
                                >
                                    <Trash2 size={15} />
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
