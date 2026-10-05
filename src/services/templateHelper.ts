import { InfobipAccountTemplate, PlaceholderMapping } from '../types';
import { templateService, INITIAL_VERIFIED_TEMPLATES } from './templateService';

export interface TemplateAnalysis {
    templateName: string;
    variablesCount: number;
    variableIndices: number[];
    headerType: 'IMAGE' | 'VIDEO' | 'TEXT' | 'NONE';
    bodyText: string;
    footerText?: string;
    buttons?: Array<{ type: string; text: string; url?: string }>;
    examples?: string[];
    category?: string;
    language?: string;
    status?: string;
}

export const templateHelper = {
    /**
     * Encontra um template pelo nome buscando no cache e nos templates pré-verificados da BM do Luiz
     */
    findTemplate(templateName: string, fallbackList?: any[]): InfobipAccountTemplate | null {
        if (!templateName) return null;
        const cleanName = templateName.trim().toLowerCase();

        // 1. Verificar na lista de fallback se fornecida (ex: templates do sender)
        if (fallbackList && fallbackList.length > 0) {
            const foundInFallback = fallbackList.find(t => (t.name || '').trim().toLowerCase() === cleanName);
            if (foundInFallback) return foundInFallback;
        }

        // 2. Verificar no cache do templateService
        const cached = templateService.getCached();
        const foundInCache = cached.templates.find(t => (t.name || '').trim().toLowerCase() === cleanName);
        if (foundInCache) return foundInCache;

        // 3. Verificar na lista inicial de templates verificados da BM do Luiz
        const foundInInitial = INITIAL_VERIFIED_TEMPLATES.find(t => (t.name || '').trim().toLowerCase() === cleanName);
        if (foundInInitial) return foundInInitial;

        return null;
    },

    /**
     * Analisa o corpo do template e extrai todos os índices de variáveis: {{1}}, {{2}}, {{3}}, {{4}}...
     */
    extractVariableIndices(text: string): number[] {
        if (!text) return [];
        const regex = /\{\{(\d+)\}\}/g;
        const indices = new Set<number>();
        let match;
        while ((match = regex.exec(text)) !== null) {
            const num = parseInt(match[1], 10);
            if (!isNaN(num) && num > 0) {
                indices.add(num);
            }
        }
        return Array.from(indices).sort((a, b) => a - b);
    },

    /**
     * Analisa um template completo retornando sua estrutura, variáveis e cabeçalho
     */
    analyzeTemplate(templateName: string, templateObj?: any, fallbackList?: any[]): TemplateAnalysis {
        const t = templateObj || this.findTemplate(templateName, fallbackList);
        
        let bodyText = t?.structure?.body?.text || '';
        let headerFormat = t?.structure?.header?.format || 'NONE';
        let examples = t?.structure?.body?.examples || [];
        let footerText = t?.structure?.footer?.text || '';
        let buttons = t?.structure?.buttons || [];
        let category = t?.category || 'UTILITY';
        let language = t?.language || 'pt_BR';
        let status = t?.status || 'APPROVED';

        let headerType: 'IMAGE' | 'VIDEO' | 'TEXT' | 'NONE' = 'NONE';
        if (headerFormat === 'IMAGE') headerType = 'IMAGE';
        else if (headerFormat === 'VIDEO') headerType = 'VIDEO';
        else if (headerFormat === 'TEXT') headerType = 'TEXT';

        let variableIndices = this.extractVariableIndices(bodyText);

        // Se o bodyText estiver vazio mas tivermos o nome, tentar padrões conhecidos ou padrão 2 variáveis
        if (variableIndices.length === 0) {
            // Se não encontrou variáveis no texto, verificar se examples existe
            if (examples && examples.length > 0) {
                variableIndices = examples.map((_: any, idx: number) => idx + 1);
            } else {
                // Padrão mínimo seguro: 2 variáveis
                variableIndices = [1, 2];
            }
        }

        return {
            templateName: t?.name || templateName || 'template',
            variablesCount: variableIndices.length,
            variableIndices,
            headerType,
            bodyText,
            footerText,
            buttons,
            examples,
            category,
            language,
            status
        };
    },

    /**
     * Gera os mappings iniciais ou ajustados para a quantidade de variáveis detectadas
     */
    generateMappingsForVariables(count: number, currentMappings: PlaceholderMapping[] = [], headers: string[] = []): PlaceholderMapping[] {
        const newMappings: PlaceholderMapping[] = [];

        // Colunas candidatas padrão
        const phoneHeaders = headers.filter(h => /tel|phone|cel|whatsapp|wpp|numero|número/i.test(h));
        const nameHeaders = headers.filter(h => /nome|name|cliente|lead|contato|destinat/i.test(h));
        const otherHeaders = headers.filter(h => 
            !phoneHeaders.includes(h) && 
            !nameHeaders.includes(h) &&
            h.toLowerCase() !== 'nome' &&
            h.toLowerCase() !== 'telefone'
        );

        for (let i = 1; i <= count; i++) {
            const existing = currentMappings.find(m => m.id === i);
            // Se já tem um mapping que possui coluna selecionada ou valor fixo preenchido, manter
            if (existing && ((existing.type === 'column' && existing.columnName) || (existing.type === 'fixed' && existing.fixedValue))) {
                newMappings.push(existing);
            } else {
                // Auto-sugestão inteligente baseada nas colunas reais da planilha
                let defaultCol = '';
                let defaultType: 'column' | 'fixed' = 'column';
                let defaultFixed = '';

                if (i === 1) {
                    defaultCol = nameHeaders[0] || (headers.includes('nome') ? 'nome' : (headers[0] || 'nome'));
                } else if (i === 2) {
                    // Se for variável 2, sugerir coluna subsequente da planilha se houver
                    if (otherHeaders.length > 0) {
                        defaultCol = otherHeaders[0];
                    } else if (nameHeaders.length > 1) {
                        defaultCol = nameHeaders[1];
                    } else {
                        // Planilha só tem telefone e nome: sugere fixo preenchido para evitar erro 'must not be empty'
                        defaultType = 'fixed';
                        defaultFixed = 'Atendimento';
                    }
                } else {
                    const extraIdx = i - 3;
                    if (extraIdx >= 0 && otherHeaders[extraIdx + 1]) {
                        defaultCol = otherHeaders[extraIdx + 1];
                    } else {
                        defaultType = 'fixed';
                        defaultFixed = `Info ${i}`;
                    }
                }

                newMappings.push({
                    id: i,
                    type: defaultType,
                    columnName: defaultCol,
                    fixedValue: defaultFixed
                });
            }
        }

        return newMappings;
    },

    /**
     * Renderiza o texto do template substituindo as variáveis pelos valores de preview
     */
    renderPreviewText(bodyText: string, mappings: PlaceholderMapping[], sampleContact?: any): string {
        if (!bodyText) {
            return mappings.map((m, idx) => {
                const val = m.type === 'column' 
                    ? (sampleContact ? (sampleContact[m.columnName] || sampleContact.nome || `[Coluna ${m.columnName}]`) : `[Coluna ${m.columnName || idx + 1}]`)
                    : (m.fixedValue || `[Variável ${idx + 1}]`);
                return `{{${idx + 1}}}: ${val}`;
            }).join('\n');
        }

        let rendered = bodyText;
        mappings.forEach((m, idx) => {
            const placeholder = `{{${idx + 1}}}`;
            let val = '';
            if (m.type === 'column') {
                if (sampleContact) {
                    if (m.columnName === 'nome') val = sampleContact.nome || 'Cliente';
                    else if (m.columnName === 'telefone') val = sampleContact.telefone || '5511999999999';
                    else val = sampleContact[m.columnName] || `[${m.columnName || 'Coluna'}]`;
                } else {
                    val = `[${m.columnName || 'Nome'}]`;
                }
            } else {
                val = m.fixedValue || `[Variável ${idx + 1}]`;
            }
            rendered = rendered.split(placeholder).join(val);
        });

        return rendered;
    }
};
