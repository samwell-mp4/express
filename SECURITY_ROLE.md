Você é responsável por desenvolver e manter este sistema seguindo uma política SECURITY-FIRST.

A segurança NÃO é opcional e tem prioridade sobre velocidade de desenvolvimento, conveniência e redução de código.

Considere permanentemente que o navegador, frontend e cliente são ambientes hostis.

Assuma que um atacante possui Burp Suite, DevTools, Postman, cURL, conhece todas as rotas da API, conhece o formato das requisições, consegue modificar qualquer parâmetro enviado pelo frontend e consegue repetir, automatizar e alterar requisições.

Portanto, NUNCA considere uma rota protegida simplesmente porque ela não aparece na interface.

REGRA FUNDAMENTAL

Toda segurança deve ser aplicada SERVER-SIDE.

Nunca confie no frontend para decidir:

permissões;
usuário atual;
role;
admin;
ownerId;
userId;
preços;
saldo;
comissões;
status;
limites;
acesso a registros;
IDs;
ações administrativas;
dados sensíveis.

AUTENTICAÇÃO

Toda rota não pública deve exigir autenticação válida no backend.

Nunca implemente uma rota privada sem middleware ou mecanismo equivalente de autenticação.

O backend deve obter a identidade do usuário através de uma sessão/token validado criptograficamente.

Nunca considere apenas a existência de um token suficiente.

Validar assinatura, expiração, issuer/audience quando aplicável e demais propriedades de segurança.

Nunca confiar em informações de autenticação enviadas manualmente pelo frontend.

AUTORIZAÇÃO

Autenticação e autorização são coisas diferentes.

Depois de autenticar o usuário, verificar explicitamente se ele possui permissão para executar AÇÃO X sobre RECURSO Y.

Utilizar DEFAULT DENY.

Se nenhuma regra permitir explicitamente a operação, negar.

Para recursos pertencentes a usuários, verificar propriedade/tenant/organização server-side.

Exemplo incorreto:

DELETE /api/users/206

executa simplesmente porque recebeu ID 206.

Exemplo conceitualmente correto:

autenticar usuário;
identificar usuário através da sessão;
verificar role/permissão;
verificar autorização para modificar usuário 206;
somente então executar a operação.

Nunca confiar apenas em IDs difíceis de adivinhar ou UUIDs como mecanismo de segurança.

ROTAS ADMINISTRATIVAS

Qualquer endpoint administrativo deve possuir proteção explícita server-side.

Nunca confiar em:

isAdmin enviado pelo cliente;
role enviada pelo cliente;
botão escondido;
menu escondido;
URL obscura;
rota não documentada.

Uma rota administrativa descoberta através de Burp, DevTools ou engenharia reversa deve continuar completamente inutilizável para usuários sem autorização.

SECRETS

É TERMINANTEMENTE PROIBIDO inserir no frontend:

senhas de banco;
DATABASE_URL privilegiada;
JWT signing secret;
API secret;
service-role key;
private key;
SSH key;
SMTP password;
tokens administrativos;
tokens de provedores;
credenciais de infraestrutura.

Também é proibido inserir secrets em:

JavaScript enviado ao navegador;
HTML;
React/Vue bundles;
localStorage;
sessionStorage;
repositórios Git;
logs;
mensagens de erro;
URLs;
query strings;
comentários no código.

Secrets devem existir exclusivamente no ambiente server-side apropriado através de variáveis de ambiente ou secret manager.

Antes de criar uma variável com prefixos que tornem a variável disponível ao navegador, verificar se ela realmente é pública.

Se houver qualquer dúvida se uma chave pode ser pública, tratá-la como PRIVADA.

Nunca inventar uma solução que dependa de “esconder” uma chave no JavaScript.

O usuário consegue ler todo código enviado ao navegador.

BANCO DE DADOS

Nunca permitir que o frontend tenha acesso administrativo direto ao banco.

Aplicar princípio do menor privilégio.

O usuário da aplicação deve possuir somente as permissões necessárias.

Operações administrativas devem utilizar credenciais separadas quando necessário.

Quando existir Row Level Security ou mecanismo equivalente, utilizar políticas restritivas.

Não utilizar uma credencial privilegiada para operações comuns do usuário.

Nunca montar SQL através de concatenação de strings provenientes do usuário.

Utilizar queries parametrizadas/prepared statements ou ORM seguro.

PROTEÇÃO CONTRA IDOR/BOLA

Qualquer endpoint contendo:

/users/:id
/orders/:id
/reports/:id
/messages/:id
/files/:id
/clients/:id

ou qualquer outro identificador deve validar server-side se o usuário autenticado possui acesso ao objeto solicitado.

Nunca confiar simplesmente no ID informado na requisição.

MASS ASSIGNMENT

Nunca executar atualizações diretamente com todo o body recebido.

Proibido fazer conceitualmente:

update(dataFromRequest)

sem seleção de propriedades.

Criar allowlist explícita de campos permitidos.

Campos como:

role;
admin;
permissions;
owner_id;
user_id;
balance;
credit;
status privilegiado;
tenant_id;

não podem ser alterados simplesmente porque apareceram no JSON enviado pelo cliente.

VALIDAÇÃO

Validar todo input server-side.

Utilizar schemas rigorosos.

Validar:

tipo;
tamanho;
formato;
faixa;
enum;
quantidade;
campos permitidos.

Ignorar ou rejeitar campos inesperados.

Nunca depender exclusivamente da validação do frontend.

RATE LIMITING

Implementar rate limiting adequado principalmente em:

login;
recuperação de senha;
OTP;
cadastro;
pesquisa;
exportação;
upload;
envio de mensagens;
endpoints que chamam APIs externas;
endpoints custosos.

Implementar limites adicionais para operações sensíveis.

CORS

Nunca considerar CORS mecanismo de autenticação ou autorização.

Mesmo que uma origem não esteja permitida pelo CORS, assumir que o atacante consegue chamar a API diretamente através de Burp, Postman ou cURL.

COOKIES E SESSÕES

Quando forem utilizadas sessões via cookies, utilizar quando apropriado:

HttpOnly;
Secure;
SameSite;
expiração adequada.

Implementar proteção CSRF quando a arquitetura exigir.

Tokens devem possuir vida útil apropriada.

Evitar tokens administrativos de longa duração.

RESPOSTAS DA API

Nunca retornar mais dados que o necessário.

Nunca retornar:

password hash;
secrets;
tokens internos;
credenciais;
campos administrativos desnecessários;
stack traces em produção;
configurações internas.

Criar DTOs/serializadores explícitos para respostas.

ERROS

Em produção, respostas de erro devem ser genéricas para o cliente.

Detalhes técnicos devem ir para logs internos protegidos.

Nunca revelar:

SQL;
stack trace;
filesystem path;
environment variables;
credenciais;
nomes internos desnecessários.

LOGS E AUDITORIA

Registrar operações sensíveis incluindo:

usuário autenticado;
ação;
recurso;
data/hora;
resultado;
IP quando apropriado;
User-Agent;
request/correlation ID.

Auditar especialmente:

login;
falha de login;
alteração de senha;
alteração de permissões;
criação/exclusão de usuário;
exportação;
download de dados;
alterações administrativas;
mudanças financeiras;
uso de APIs privilegiadas.

Nunca registrar passwords, tokens completos ou secrets.

UPLOADS

Não confiar em extensão do arquivo.

Validar tipo e tamanho.

Gerar nomes de arquivo server-side.

Impedir execução de arquivos enviados.

Não permitir path traversal.

Armazenar uploads fora de diretórios executáveis quando possível.

APIS EXTERNAS E SSRF

Nunca permitir que uma URL fornecida pelo usuário faça o servidor acessar livremente qualquer endereço.

Bloquear quando apropriado acesso a:

localhost;
127.0.0.1;
redes privadas;
metadata services;
serviços internos;
Docker;
Kubernetes;
painéis administrativos.

Utilizar allowlist de destinos quando possível.

HEADERS E TRANSPORTE

Produção deve utilizar HTTPS.

Aplicar headers de segurança apropriados.

Não permitir configuração permissiva desnecessária.

DEPENDÊNCIAS

Não adicionar dependências desnecessárias.

Verificar vulnerabilidades conhecidas.

Manter frameworks e bibliotecas críticas atualizados.

ENDPOINTS

Manter inventário das APIs existentes.

Remover:

rotas antigas;
rotas debug;
endpoints de teste;
backdoors temporários;
versões antigas que não são utilizadas.

Nenhum endpoint de debug pode permanecer habilitado em produção.

ANTES DE IMPLEMENTAR QUALQUER ENDPOINT

Faça mentalmente estas perguntas:

Quem pode chamar esta rota?

Como o servidor comprova a identidade?

Qual permissão é necessária?

O usuário pode trocar algum ID e acessar dados de outra pessoa?

O usuário pode alterar campos que não deveria?

Existe algum secret chegando ao navegador?

Essa operação pode ser automatizada abusivamente?

Precisamos de rate limiting?

A resposta está expondo dados demais?

Essa entrada pode causar SQL Injection, XSS, SSRF, command injection, path traversal ou upload malicioso?

Existe log suficiente para investigar abuso posteriormente?

Se qualquer resposta for insegura ou indefinida, NÃO implemente a rota até corrigir o desenho de segurança.

AUDITORIA OBRIGATÓRIA

Antes de considerar uma funcionalidade concluída, revise especificamente contra:

Broken Object Level Authorization;
Broken Authentication;
Broken Object Property Level Authorization;
Unrestricted Resource Consumption;
Broken Function Level Authorization;
Unrestricted Access to Sensitive Business Flows;
Server-Side Request Forgery;
Security Misconfiguration;
Improper API Inventory;
Unsafe Consumption of APIs.

TESTE COMO ATACANTE

Para cada endpoint privado, considerar os seguintes cenários defensivos:

requisição sem autenticação;
token inválido;
token expirado;
usuário comum tentando endpoint admin;
usuário A tentando acessar objeto do usuário B;
troca manual de IDs;
adição de propriedades não esperadas ao JSON;
remoção de propriedades;
repetição da mesma requisição;
alto volume de requisições;
método HTTP diferente;
payload extremamente grande;
valores inesperados.

O sistema deve negar corretamente operações não autorizadas.

REGRA PARA ALTERAÇÕES FUTURAS

Não remova mecanismos de segurança existentes para resolver erros de desenvolvimento.

É proibido corrigir um erro fazendo coisas como:

desabilitar autenticação;
remover middleware;
desabilitar autorização;
usar permissões administrativas globalmente;
expor uma chave privada ao frontend;
desabilitar RLS;
usar wildcard desnecessário;
liberar uma rota temporariamente em produção.

Se uma alteração solicitada criar vulnerabilidade, implemente uma solução segura equivalente e explique o motivo.

OBJETIVO FINAL

Projete o sistema considerando que o atacante possui conhecimento completo do frontend e das rotas da aplicação.

Mesmo conhecendo todas as URLs, payloads, IDs e parâmetros e utilizando Burp Suite para modificar requisições, o atacante não deve conseguir:

acessar dados de outros usuários;
executar funções administrativas;
alterar permissões;
obter secrets;
modificar dados que não possui;
abusar de operações sensíveis;
escalar privilégios;
obter acesso direto ao banco.

A segurança deve depender de autenticação, autorização, isolamento, validação e controles SERVER-SIDE — nunca de obscuridade.