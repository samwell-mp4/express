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
    businessAccountId?: string | number;
    apiKey?: string;
    baseUrl?: string;
    templateName?: string;
    templateLanguage?: string;
    templates?: InfobipTemplateSummary[];
    headerType?: 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'TEXT' | 'NONE';
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
    headerType: 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'TEXT' | 'NONE';
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
    isPaused?: boolean;
    processed: number;
    rateLimit?: number;
    pausedCampaigns?: string[];
    warning?: string;
}

export interface DispatchRecord {
    id: string;
    transmissionId?: string;
    campaignId?: string;
    campaignName?: string;
    listName?: string;
    timestamp: string;
    recipient: string;
    senderNumber: string;
    templateName: string;
    status: 'DELIVERED' | 'SENT' | 'PENDING' | 'FAILED';
    messageId?: string;
    errorReason?: string;
    rawPayload?: any;
    doneAt?: string;
    deliveryReason?: string;
    errorGroup?: string;
    errorName?: string;
    operator?: string;
    mediaUrl?: string;
    headerType?: 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'TEXT' | 'NONE';
    price?: number;
}

export interface InfobipQueueMessage {
    from: string;
    to: string;
    campaignId?: string;
    campaign_id?: string;
    campaignName?: string;
    campaign_name?: string;
    listName?: string;
    mediaUrl?: string;
    headerType?: 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'TEXT' | 'NONE';
    content: {
        templateName: string;
        templateData?: {
            body?: {
                placeholders: string[];
            };
            header?: {
                type: 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'TEXT';
                mediaUrl?: string;
            };
            buttons?: Array<{
                type: string;
                parameter?: string;
            }>;
        };
        language: string;
    };
    _apiKey?: string;
    _baseUrl?: string;
}

export type AppTab = 
    | 'registry' 
    | 'embedded-signup'
    | 'dispatch' 
    | 'records' 
    | 'redis' 
    | 'monitor'
    | 'rotator'
    | 'bms' 
    | 'templates' 
    | 'upload-clientes' 
    | 'create-template'
    | 'spreadsheet-cleaner'
    | 'media-hosting';

export interface AddSenderRequest {
    businessAccountId: string;
    countryCode: string;
    phoneNumber: string;
    displayName: string;
    type: 'EXTERNAL_SMS' | 'EXTERNAL_VOICE';
    locale?: string;
    apiKey?: string;
    baseUrl?: string;
}

export interface AddSenderResponse {
    success: boolean;
    status?: string;
    sender?: string;
    businessAccountId?: string;
    displayName?: string;
    message?: string;
    description?: string;
    error?: string;
}

export interface VerifySenderRequest {
    sender: string;
    code: string;
    apiKey?: string;
    baseUrl?: string;
}

export interface VerifySenderResponse {
    success: boolean;
    sender?: string;
    description?: string;
    status?: string;
    error?: string;
}

export interface RetryOtpRequest {
    sender: string;
    type: 'EXTERNAL_SMS' | 'EXTERNAL_VOICE';
    locale?: string;
    apiKey?: string;
    baseUrl?: string;
}

export interface RetryOtpResponse {
    success: boolean;
    sender?: string;
    description?: string;
    status?: string;
    error?: string;
}

export interface InfobipActiveSender {
    sender: string;
    displayName?: string;
    status?: string;
    qualityRating?: string;
    tier?: string;
    type?: string;
}

export interface RotatorTarget {
    url: string;
    weight: number;
    clicks?: number;
}

export interface ProRotator {
    id: number | string;
    title: string;
    slug: string;
    targets: RotatorTarget[];
    total_clicks?: number;
    created_at?: string;
    user_id?: number | string;
    client_id?: number | string | null;
    owner_name?: string;
    client_name?: string;
}

export interface RotatorStats {
    rotator: ProRotator;
    targets: { target_index?: number; target_url: string; clicks: number }[];
    timeline: { date: string; clicks: number }[];
    recentClicks: { user_agent?: string; country?: string; city?: string; timestamp: string }[];
}

export interface SavedMediaItem {
    id: string;
    name: string;
    originalName: string;
    url: string;
    size: string;
    type: 'image' | 'video' | 'document';
    createdAt: string;
}

export interface SubmissionAd {
    id: string;
    ad_name?: string;
    template_type: 'TEXT' | 'IMAGE' | 'VIDEO';
    message_mode: 'manual' | 'upload';
    media_url?: string;
    ad_copy: string;
    ad_copy_file?: string;
    button_link?: string;
    spreadsheet_url?: string;
    variables: string[];
    showFifthVariable?: boolean;
    scheduled_at?: string;
    delivered_leads?: number;
    total_leads?: number;
    price_per_msg?: number;
    cta_targets?: RotatorTarget[];
    rotator_slug?: string;
    sender_phone?: string;
    sender_number?: string;
    origin?: string;
}

export interface ClientSubmission {
    id: number | string;
    campaign_name?: string;
    sender_phone?: string;
    sender_number?: string;
    origin?: string;
    profile_photo?: string;
    profile_name: string;
    ddd: string;
    template_type: 'TEXT' | 'IMAGE' | 'VIDEO';
    media_url?: string;
    ad_copy: string;
    button_link?: string;
    spreadsheet_url?: string;
    status: 'PENDENTE' | 'EM ANDAMENTO' | 'GERADO' | 'CONCLUIDO' | 'CANCELADO' | string;
    assigned_to?: string | null;
    submitted_by?: string;
    user_id?: number | string;
    client_name?: string;
    timestamp: string;
    created_at?: string;
    updated_at?: string;
    dispatch_date?: string;
    notes?: string;
    ads: SubmissionAd[];
    contacts?: ParsedContact[];
    headers?: string[];
    fileName?: string;
    validCount?: number;
    totalRows?: number;
    variables?: string[];
    showFifthVariable?: boolean;
    cta_targets?: RotatorTarget[];
    rotator_slug?: string;
    download_count?: number;
}

export interface ClientBatchRecord {
    id: string;
    clientName: string;
    fileName: string;
    totalRows: number;
    validCount: number;
    duplicateCount: number;
    invalidCount: number;
    createdAt: string;
    contacts: ParsedContact[];
    headers: string[];
    submission?: ClientSubmission;
}

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


