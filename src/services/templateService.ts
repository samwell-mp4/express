import { InfobipAccountTemplate } from '../types';

const STORAGE_KEY = 'plugesales_meta_templates_cache_v2';

// Seed inicial verificado diretamente na API Infobip da BM do Luiz (últimos dias)
export const INITIAL_VERIFIED_TEMPLATES: InfobipAccountTemplate[] = [
    {
        id: '1780317556534479',
        businessAccountId: 947619051737869,
        businessName: 'BM do Luiz (+1 555-932-1381)',
        name: 'ivo_01',
        language: 'pt_BR',
        status: 'APPROVED',
        category: 'UTILITY',
        structure: {
            header: { format: 'IMAGE' },
            body: {
                text: 'Olá, {{1}}.\n\nRecebemos sua solicitação {{2}} e precisamos confirmar algumas informações para dar continuidade ao atendimento.\n\nPara revisar os dados relacionados a essa solicitação, utilize uma das opções abaixo.',
                examples: ['Leandro', '7164427']
            },
            footer: { text: 'Digite "sair" para não receber mais mensagens' },
            buttons: [
                { type: 'URL', text: 'Clique Aqui', url: 'https://fastdispatch.com.br/r/ivo' },
                { type: 'QUICK_REPLY', text: 'Não Reconheço' }
            ],
            type: 'MEDIA'
        },
        createdAt: '2026-09-27T12:00:59.322+0000',
        lastUpdatedAt: '2026-09-28T11:10:41.422+0000',
        _account: 'BM do Luiz',
        _accountId: 'luiz',
        _sender: '15559321381',
        _senderFormatted: '+1 555-932-1381'
    },
    {
        id: '2067930520510193',
        businessAccountId: 947619051737869,
        businessName: 'BM do Luiz (+1 555-932-1381)',
        name: 'ivo_02',
        language: 'pt_BR',
        status: 'APPROVED',
        category: 'UTILITY',
        structure: {
            header: { format: 'IMAGE' },
            body: {
                text: 'Olá, {{1}}.\n\nRecebemos sua solicitação {{2}} e precisamos confirmar algumas informações para dar continuidade ao atendimento.\n\nPara revisar os dados relacionados a essa solicitação, utilize uma das opções abaixo.',
                examples: ['Leandro', '7164427']
            },
            footer: { text: 'Digite "sair" para não receber mais mensagens' },
            buttons: [
                { type: 'URL', text: 'Clique Aqui', url: 'https://fastdispatch.com.br/r/ivo' },
                { type: 'QUICK_REPLY', text: 'Não Reconheço' }
            ],
            type: 'MEDIA'
        },
        createdAt: '2026-09-27T12:01:06.889+0000',
        lastUpdatedAt: '2026-09-28T11:02:14.967+0000',
        _account: 'BM do Luiz',
        _accountId: 'luiz',
        _sender: '15559321381',
        _senderFormatted: '+1 555-932-1381'
    },
    {
        id: '1075783028702398',
        businessAccountId: 947619051737869,
        businessName: 'BM do Luiz (+1 555-932-1381)',
        name: 'ivo_03',
        language: 'pt_BR',
        status: 'APPROVED',
        category: 'UTILITY',
        structure: {
            header: { format: 'IMAGE' },
            body: {
                text: 'Olá, {{1}}.\n\nRecebemos sua solicitação {{2}} e precisamos confirmar algumas informações para dar continuidade ao atendimento.\n\nPara revisar os dados relacionados a essa solicitação, utilize uma das opções abaixo.',
                examples: ['Leandro', '7164427']
            },
            footer: { text: 'Digite "sair" para não receber mais mensagens' },
            buttons: [
                { type: 'URL', text: 'Clique Aqui', url: 'https://fastdispatch.com.br/r/ivo' },
                { type: 'QUICK_REPLY', text: 'Não Reconheço' }
            ],
            type: 'MEDIA'
        },
        createdAt: '2026-09-27T12:01:15.364+0000',
        lastUpdatedAt: '2026-09-28T11:13:22.148+0000',
        _account: 'BM do Luiz',
        _accountId: 'luiz',
        _sender: '15559321381',
        _senderFormatted: '+1 555-932-1381'
    },
    {
        id: '956209487540162',
        businessAccountId: 947619051737869,
        businessName: 'BM do Luiz (+1 555-932-1381)',
        name: 'ivo_04',
        language: 'pt_BR',
        status: 'APPROVED',
        category: 'UTILITY',
        structure: {
            header: { format: 'IMAGE' },
            body: {
                text: 'Olá, {{1}}.\n\nRecebemos sua solicitação {{2}} e precisamos confirmar algumas informações para dar continuidade ao atendimento.\n\nPara revisar os dados relacionados a essa solicitação, utilize uma das opções abaixo.',
                examples: ['Leandro', '7164427']
            },
            footer: { text: 'Digite "sair" para não receber mais mensagens' },
            buttons: [
                { type: 'URL', text: 'Clique Aqui', url: 'https://fastdispatch.com.br/r/ivo' },
                { type: 'QUICK_REPLY', text: 'Não Reconheço' }
            ],
            type: 'MEDIA'
        },
        createdAt: '2026-09-27T12:01:23.001+0000',
        lastUpdatedAt: '2026-09-28T11:16:34.116+0000',
        _account: 'BM do Luiz',
        _accountId: 'luiz',
        _sender: '15559321381',
        _senderFormatted: '+1 555-932-1381'
    },
    {
        id: '28467468876244578',
        businessAccountId: 2453259158418655,
        businessName: 'Transalmeida Transportes Rodoviarios LTDA',
        name: 'new_transalmeida_9014_2809_04',
        language: 'pt_BR',
        status: 'PENDING',
        category: 'UTILITY',
        structure: {
            header: { format: 'IMAGE' },
            body: {
                text: 'Olá, {{1}}.\n\nRecebemos sua solicitação {{2}} e precisamos confirmar algumas informações para dar continuidade ao atendimento.\n\nPara revisar os dados relacionados a essa solicitação, utilize uma das opções abaixo.',
                examples: ['Leandro', '7164427']
            },
            footer: { text: 'Digite "sair" para não receber mais mensagens' },
            buttons: [
                { type: 'URL', text: 'Clique Aqui', url: 'https://fastdispatch.com.br/r/TRANSALMEIDA' },
                { type: 'QUICK_REPLY', text: 'Não Reconheço' }
            ],
            type: 'MEDIA'
        },
        createdAt: '2026-09-28T19:56:57.334+0000',
        lastUpdatedAt: '2026-09-28T19:56:57.336+0000',
        _account: 'BM do Luiz'
    },
    {
        id: '1583324726750616',
        businessAccountId: 875786408937731,
        businessName: 'Super10 Prêmios',
        name: 'super10_2609_2',
        language: 'pt_BR',
        status: 'APPROVED',
        category: 'UTILITY',
        structure: {
            header: { format: 'IMAGE' },
            body: {
                text: 'Olá {{1}}!\n\nConfirmamos a atualização do seu comprovante digital {{2}}.\n\n{{3}}\n\nClique no botão abaixo para acessar o documento e validar.',
                examples: ['Marcio', 'protocolo nº 918231', 'Seu número da sorte já está ativo']
            },
            footer: { text: 'Digite "sair" para não receber mais mensagens' },
            buttons: [
                { type: 'URL', text: 'Ver Comprovante', url: 'https://super10premios.com/validar' }
            ],
            type: 'MEDIA'
        },
        createdAt: '2026-09-27T01:57:11.006+0000',
        lastUpdatedAt: '2026-09-28T00:58:58.947+0000',
        _account: 'BM do Luiz'
    },
    {
        id: '1622722989429544',
        businessAccountId: 875786408937731,
        businessName: 'Luiz Fernando Comércio',
        name: 'luizfernando__4',
        language: 'pt_BR',
        status: 'APPROVED',
        category: 'UTILITY',
        structure: {
            header: { format: 'IMAGE' },
            body: {
                text: 'Prezado(a) {{1}},\n\nInformamos que seu pedido {{2}} teve alteração de status.\n\n{{3}}\n\nAcesse o link abaixo para visualizar os detalhes completos.',
                examples: ['Carlos', '#847291', 'Disponível para entrega']
            },
            footer: { text: 'Digite "sair" para não receber mais mensagens' },
            buttons: [
                { type: 'URL', text: 'Consultar Pedido', url: 'https://rastreio.luizfernando.com/' }
            ],
            type: 'MEDIA'
        },
        createdAt: '2026-09-27T01:41:12.649+0000',
        lastUpdatedAt: '2026-09-28T00:44:04.828+0000',
        _account: 'BM do Luiz'
    },
    {
        id: '2265402724235682',
        businessAccountId: 875786408937731,
        businessName: 'Barbosa Vendas & Distribuição',
        name: 'barbosavnds__3',
        language: 'pt_BR',
        status: 'APPROVED',
        category: 'UTILITY',
        structure: {
            header: { format: 'IMAGE' },
            body: {
                text: 'Olá {{1}}!\n\nRecebemos sua mensagem referente a {{2}}.\n\n{{3}}\n\nClique no botão abaixo para atendimento prioritário com nossa equipe.',
                examples: ['Juliana', 'pedido #44321', 'Nossa equipe está pronta para te atender']
            },
            buttons: [
                { type: 'URL', text: 'Atendimento Rápido', url: 'https://barbosavendas.com/atendimento' }
            ],
            type: 'MEDIA'
        },
        createdAt: '2026-09-27T02:20:31.888+0000',
        lastUpdatedAt: '2026-09-28T01:29:49.984+0000',
        _account: 'BM do Luiz'
    },
    {
        id: '1349292680099561',
        businessAccountId: 875786408937731,
        businessName: 'Alexander David Assessoria',
        name: 'alexanderdavid_4',
        language: 'pt_BR',
        status: 'APPROVED',
        category: 'MARKETING',
        structure: {
            header: { format: 'IMAGE' },
            body: {
                text: 'Olá {{1}}!\n\nTemos uma atualização importante sobre {{2}}.\n\n{{3}}\n\nConfira todos os detalhes no link abaixo:',
                examples: ['Roberto', 'sua proposta exclusiva', 'Condições especiais válidas até hoje']
            },
            footer: { text: 'Digite "sair" para não receber mais mensagens' },
            buttons: [
                { type: 'URL', text: 'Acessar Proposta', url: 'https://alexanderdavid.com/oferta' }
            ],
            type: 'MEDIA'
        },
        createdAt: '2026-09-26T23:11:45.085+0000',
        lastUpdatedAt: '2026-09-27T22:25:44.543+0000',
        _account: 'BM do Luiz'
    },
    {
        id: '1027683050023911',
        businessAccountId: 875786408937731,
        businessName: 'Atendimento Geral',
        name: 'final_1743_02',
        language: 'pt_BR',
        status: 'APPROVED',
        category: 'UTILITY',
        structure: {
            header: { format: 'IMAGE' },
            body: {
                text: 'Olá {{1}}!\n\nInformamos que seu comprovante digital {{2}} foi emitido com sucesso.\n\nPara visualizar, clique no botão abaixo.',
                examples: ['Ana', '#77621']
            },
            buttons: [
                { type: 'URL', text: 'Abrir Comprovante', url: 'https://fastdispatch.com.br/c/final1743' }
            ],
            type: 'MEDIA'
        },
        createdAt: '2026-09-24T18:16:24.763+0000',
        lastUpdatedAt: '2026-09-25T17:23:23.490+0000',
        _account: 'BM do Luiz'
    },
    {
        id: '1828382708133807',
        businessAccountId: 875786408937731,
        businessName: 'Fábio Consultoria',
        name: 'fabio_01',
        language: 'pt_BR',
        status: 'APPROVED',
        category: 'UTILITY',
        structure: {
            body: {
                text: 'Olá {{1}}!\n\nSeu protocolo {{2}} está pronto para consulta.\n\nPara conferir, clique no link abaixo.',
                examples: ['Marcos', 'PR-2026-09']
            },
            buttons: [
                { type: 'URL', text: 'Ver Protocolo', url: 'https://consultoriafabio.com.br/ver' }
            ]
        },
        createdAt: '2026-09-20T11:29:31.300+0000',
        lastUpdatedAt: '2026-09-21T10:37:13.370+0000',
        _account: 'BM do Luiz'
    },
    {
        id: '1514132343531295',
        businessAccountId: 875786408937731,
        businessName: 'Pedro Serviços',
        name: 'pedro_05003',
        language: 'pt_BR',
        status: 'PENDING',
        category: 'MARKETING',
        structure: {
            header: { format: 'IMAGE' },
            body: {
                text: 'Olá {{1}}!\n\nVocê recebeu uma notificação sobre {{2}}.\n\nClique no botão abaixo para verificar.',
                examples: ['Felipe', 'seu cupom de desconto']
            },
            buttons: [
                { type: 'URL', text: 'Resgatar Agora', url: 'https://pedroservicos.com/cupom' }
            ],
            type: 'MEDIA'
        },
        createdAt: '2026-09-18T13:26:40.786+0000',
        lastUpdatedAt: '2026-09-18T13:31:05.999+0000',
        _account: 'BM do Luiz'
    }
];

export const templateService = {
    /**
     * Retorna os templates salvos no LocalStorage
     */
    getCached(): { templates: InfobipAccountTemplate[]; timestamp: string } {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && Array.isArray(parsed.templates) && parsed.templates.length > 0) {
                    return parsed;
                }
            }
        } catch (e) {
            console.warn('Erro ao ler cache de templates:', e);
        }

        // Retorna seed inicial verificado se não houver cache
        return {
            templates: INITIAL_VERIFIED_TEMPLATES,
            timestamp: new Date().toISOString()
        };
    },

    /**
     * Salva templates no LocalStorage
     */
    saveCached(templates: InfobipAccountTemplate[]) {
        try {
            const payload = {
                templates,
                timestamp: new Date().toISOString()
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch (e) {
            console.warn('Erro ao salvar cache de templates:', e);
        }
    },

    /**
     * Busca templates via proxy /api/meta-templates
     */
    async fetchRecentTemplates(since = '2026-09-21T00:00:00Z', force = false): Promise<{ templates: InfobipAccountTemplate[]; timestamp: string }> {
        try {
            const res = await fetch(`/api/meta-templates?since=${encodeURIComponent(since)}&force=${force ? 'true' : 'false'}`);
            if (res.ok) {
                const data = await res.json();
                if (data.success && Array.isArray(data.templates) && data.templates.length > 0) {
                    // Mesclar com seed inicial para garantir cobertura total
                    const mergedMap = new Map<string, InfobipAccountTemplate>();
                    for (const t of data.templates) {
                        mergedMap.set(t.name, t);
                    }
                    for (const t of INITIAL_VERIFIED_TEMPLATES) {
                        const d = new Date(t.lastUpdatedAt || t.createdAt || 0).getTime();
                        if (d >= new Date(since).getTime() && !mergedMap.has(t.name)) {
                            mergedMap.set(t.name, t);
                        }
                    }

                    const merged = Array.from(mergedMap.values()).sort((a, b) => {
                        const timeA = new Date(a.lastUpdatedAt || a.createdAt || 0).getTime();
                        const timeB = new Date(b.lastUpdatedAt || b.createdAt || 0).getTime();
                        return timeB - timeA;
                    });

                    this.saveCached(merged);
                    return {
                        templates: merged,
                        timestamp: data.timestamp || new Date().toISOString()
                    };
                }
            }
        } catch (err) {
            console.warn('Erro ao buscar templates via API proxy:', err);
        }

        // Fallback: Retorna o cache ou o seed inicial
        return this.getCached();
    },

    /**
     * Busca templates vinculados a um número de remetente específico na BM do Luiz
     */
    async fetchTemplatesBySender(senderNumber: string, force = true): Promise<{ templates: InfobipAccountTemplate[]; sender: string; timestamp: string }> {
        const clean = senderNumber.replace(/\D/g, '');
        if (!clean) {
            return { templates: [], sender: '', timestamp: new Date().toISOString() };
        }

        try {
            const res = await fetch(`/api/meta-templates?sender=${encodeURIComponent(clean)}&force=${force ? 'true' : 'false'}`);
            if (res.ok) {
                const data = await res.json();
                if (data.success && Array.isArray(data.templates)) {
                    return {
                        templates: data.templates,
                        sender: data.sender || clean,
                        timestamp: data.timestamp || new Date().toISOString()
                    };
                }
            }
        } catch (err) {
            console.warn(`Erro ao buscar templates para o remetente ${senderNumber}:`, err);
        }

        // Fallback: verificar se já existem templates no cache geral que correspondam a esse remetente
        const cached = this.getCached();
        const matched = cached.templates.filter(t => {
            const tSender = (t._sender || '').replace(/\D/g, '');
            return tSender === clean || (t._senderFormatted || '').includes(clean);
        });

        return {
            templates: matched,
            sender: clean,
            timestamp: cached.timestamp
        };
    }
};
