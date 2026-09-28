export interface WebhookItem {
    cliente?: string;
    horario_disparo?: string;
    numero_disparo?: string;
    waba?: string;
    data_disparo?: string;
    responsavel_disparo?: string;
    quantidade_lead?: string | number;
    entregue?: string | number;
    status?: string;
    [key: string]: any;
}

export interface ParsedContact {
    telefone: string;
    nome: string;
    [key: string]: string;
}

export interface SavedWaba {
    id: string;
    label: string;
    number: string;
    defaultLimit: number;
    accountName: string; // "BM do Luiz"
    apiKey?: string;
    baseUrl?: string;
    templateName?: string;
    templateLanguage?: string;
    templates?: InfobipTemplateSummary[];
    headerType?: 'IMAGE' | 'VIDEO' | 'NONE';
    mediaUrl?: string;
    createdAt: string;
}

export interface SenderConfig {
    id: string;
    label: string;
    senderNumber: string;
    limit: number;
    templateName: string;
    templateLanguage: string;
    templates: InfobipTemplateSummary[];
    isLoadingTemplates?: boolean;
    headerType: 'IMAGE' | 'VIDEO' | 'NONE';
    mediaUrl: string;
    allocatedContacts?: ParsedContact[];
}

export interface InfobipTemplateSummary {
    id: string;
    name: string;
    language: string;
    status: string;
    category?: string;
    structure?: any;
}

export interface PlaceholderMapping {
    id: number;
    type: 'column' | 'fixed';
    columnName: string;
    fixedValue: string;
}

export interface RedisQueueStatus {
    queueLength: number;
    isRunning: boolean;
    processed: number;
    rateLimit?: number;
    warning?: string;
}

export interface DispatchRecord {
    id: string;
    transmissionId?: string;
    timestamp: string;
    recipient: string;
    senderNumber: string;
    templateName: string;
    status: 'DELIVERED' | 'SENT' | 'PENDING' | 'FAILED';
    messageId?: string;
    errorReason?: string;
    rawPayload?: any;
}

export interface InfobipQueueMessage {
    from: string;
    to: string;
    content: {
        templateName: string;
        templateData?: {
            body?: {
                placeholders: string[];
            };
            header?: {
                type: 'IMAGE' | 'VIDEO' | 'TEXT';
                mediaUrl?: string;
            };
        };
        language: string;
    };
    _apiKey: string;
    _baseUrl: string;
}

export type AppTab = 'registry' | 'dispatch' | 'records' | 'redis' | 'bms' | 'templates';

export interface InfobipAccountTemplate {
    id: string;
    businessAccountId?: number | string;
    businessName?: string;
    name: string;
    language: string;
    status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'DISABLED' | 'PAUSED' | string;
    category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION' | string;
    structure?: {
        header?: { format: string; text?: string; example?: any };
        body?: { text: string; examples?: any[] };
        footer?: { text: string };
        buttons?: Array<{ type: string; text: string; url?: string; phoneNumber?: string }>;
        type?: string;
    };
    quality?: string;
    createdAt?: string;
    lastUpdatedAt?: string;
    rejectionReason?: string;
    _account?: string;
    _accountId?: string;
    _sender?: string;
    _senderFormatted?: string;
}

export interface BmRecord {
    id: string;
    colaborador: string;
    data: string;
    idAdspower: string;
    contatoFacebook: string;
    numero: string;
    nomeBm: string;
    verificacao: string;
    limiteBm: string;
    observacao: string;
    processosBanimentos: string;
    rawRow?: any[];
}

export interface CollaboratorConfig {
    name: string;
    gid: string;
}


