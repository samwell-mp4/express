# Express Template Standalone (BM do Luiz + Multi-Remetente + Fila Redis)

Aplicativo React independente para triagem automatizada, higienização estrita de contatos, orquestração multi-remetente na BM do Luiz e enfileiramento em lote na fila própria do Redis para a API de Templates da Infobip.

---

## 🚀 Como Executar

### 1. Iniciar o Servidor de Desenvolvimento
No diretório `express-dispatch-app`:
```bash
npm run dev
```
O aplicativo iniciará na porta **5174** (ex: `http://localhost:5174`).
As requisições para `/api/*` são roteadas automaticamente via proxy reverso no `vite.config.ts` para o backend na porta **3000**.

### 2. Gerar Build de Produção
```bash
npm run build
```

---

## 📌 Arquitetura & Fluxo Operacional

```
[Triagem n8n] ➔ [Higienização Planilha (55+DDD+9)] ➔ [Configuração Multi-Remetente] ➔ [Fila Redis] ➔ [Worker Infobip]
```

1. **Aba Triagem n8n:**
   - Consome os pedidos de disparo pendentes diretamente do webhook do n8n.
   - Filtros inteligentes por Responsável, Status, WABA e Horário.
   - Detecção visual de disparos atrasados (tempo > 1h do agendamento).

2. **Modal de Higienização:**
   - Converte telefones estritamente para o padrão brasileiro (`55` + DDD + `9` + 8 dígitos = 13 dígitos).
   - Remove números duplicados e inválidos.
   - Permite baixar a planilha tratada (`Contatos_Higienizados.csv`).
   - Encurtador de links utilitário integrado.

3. **Aba Multi-Remetente (BM do Luiz):**
   - Utiliza a conta unificada da **BM do Luiz** (`LUIS_KEY` e `4k3e4p.api-us.infobip.com`).
   - Permite cadastrar múltiplos números remetentes (`from`).
   - Botão **Colar Remetentes em Massa** para importar múltiplos números de uma só vez.
   - Busca em tempo real os templates aprovados na Meta para cada número remetente.
   - Particionamento automático da cota de contatos (ex: 250 disparos por remetente ou divisão igualitária).
   - Mapeador de variáveis (`{{1}}`, `{{2}}`...) ligado às colunas da planilha.

4. **Fila Redis & HUD Monitor:**
   - Enfileira no Redis via `POST /api/dispatch/queue` (`dispatch_queue`).
   - O worker sequencial no backend consome a fila com intervalo de 1.5s para total segurança contra bloqueios da Meta.
   - Painel HUD em tempo real com contador de mensagens na fila, mensagens processadas, status do worker e botões de **Pausar Fila** e **Limpar Fila**.

---

## 📂 Estrutura de Arquivos

```
express-dispatch-app/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── index.css
    ├── types/
    │   └── index.ts
    ├── services/
    │   ├── api.ts
    │   └── excelService.ts
    └── components/
        ├── HeaderNav.tsx
        ├── TriageBoard.tsx
        ├── ContactSanitizerModal.tsx
        ├── SenderManager.tsx
        ├── VariableMapper.tsx
        ├── QueueConfirmModal.tsx
        └── RedisMonitor.tsx
```

# express
