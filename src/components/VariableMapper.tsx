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
        <div className="glass-panel" style={{ padding: '16px 20px', marginBottom: '16px', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Type size={16} color="var(--primary-color)" />
                    <h4 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>
                        Mapeamento de Variáveis ({`{{1}}, {{2}}...`})
                    </h4>
                </div>

                <button 
                    className="btn-secondary"
                    onClick={addPlaceholder}
                    style={{ height: '32px', fontSize: '12.5px', padding: '0 10px', borderRadius: '6px' }}
                >
                    <Plus size={13} />
                    Adicionar Variável
                </button>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 14px 0' }}>
                Associe cada variável do corpo do template a uma coluna da planilha (ex: Nome do Cliente) ou digite um texto estático.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {mappings.map((m, idx) => {
                    const previewVal = m.type === 'column'
                        ? (sampleContact ? (sampleContact[m.columnName] || sampleContact.nome || '') : 'Exemplo')
                        : m.fixedValue;

                    return (
                        <div key={m.id} style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '10px', 
                            background: '#f8fafc', 
                            padding: '8px 12px', 
                            borderRadius: '6px',
                            border: '1px solid var(--border-subtle)',
                            flexWrap: 'wrap'
                        }}>
                            <span style={{ 
                                background: 'var(--primary-color)', 
                                color: '#ffffff', 
                                fontWeight: 600, 
                                fontSize: '11px', 
                                padding: '2px 6px', 
                                borderRadius: '4px',
                                fontFamily: 'monospace'
                            }}>
                                {`{{${idx + 1}}}`}
                            </span>

                            <select 
                                className="form-select"
                                value={m.type}
                                onChange={(e: any) => updateMapping(m.id, { type: e.target.value })}
                                style={{ width: '120px', height: '34px', padding: '0 8px', fontSize: '12.5px', borderRadius: '6px' }}
                            >
                                <option value="column">Coluna</option>
                                <option value="fixed">Texto Fixo</option>
                            </select>

                            {m.type === 'column' ? (
                                <select 
                                    className="form-select"
                                    value={m.columnName}
                                    onChange={(e) => updateMapping(m.id, { columnName: e.target.value })}
                                    style={{ flex: 1, minWidth: '150px', height: '34px', padding: '0 8px', fontSize: '12.5px', borderRadius: '6px' }}
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
                                    style={{ flex: 1, minWidth: '150px', height: '34px', padding: '0 8px', fontSize: '12.5px', borderRadius: '6px' }}
                                />
                            )}

                            {/* Live preview value */}
                            <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', minWidth: '130px' }}>
                                Valor: <strong style={{ color: 'var(--text-main)', fontWeight: 600 }}>{previewVal || '—'}</strong>
                            </div>

                            {mappings.length > 1 && (
                                <button 
                                    onClick={() => removePlaceholder(m.id)}
                                    style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px', borderRadius: '4px' }}
                                    title="Remover"
                                >
                                    <Trash2 size={14} />
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
