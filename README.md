# mcp-glpi

Servidor MCP (stdio) para consultar e abrir chamados no GLPI pela API REST v1. Licença MIT.

## Requisitos e instalação

Use Node.js 20 ou superior. Clone o repositório, copie `.env.example` para `.env` se preferir gerenciar as variáveis localmente e execute:

```bash
npm ci
npm run build
```

## Instalar pelo release (mais simples)

Sem clonar nem compilar: instale o pacote publicado no release do GitHub.

```bash
npm i -g https://github.com/ooshimakenji/mcp-glpi/releases/download/v0.1.1/mcp-glpi-0.1.1.tgz
claude mcp add glpi -e GLPI_URL=https://glpi.suaempresa.com.br -e GLPI_APP_TOKEN=SEU_APP_TOKEN -e GLPI_USER_TOKEN=SEU_TOKEN -- mcp-glpi
```

## Configuração e tokens

As variáveis devem estar no ambiente do processo MCP, nunca no repositório:

| Variável | Uso |
|---|---|
| `GLPI_URL` | Obrigatória. Ex.: `https://glpi.suaempresa.com.br` |
| `GLPI_APP_TOKEN` | Obrigatória. Token do cliente de API. |
| `GLPI_USER_TOKEN` | Preferida. Token pessoal do usuário. |
| `GLPI_LOGIN` e `GLPI_PASSWORD` | Alternativa ao token pessoal, se o administrador habilitou login por credenciais. |
| `GLPI_READ_ONLY=1` | Oculta as tools que alteram dados. É o padrão seguro do `.env.example`. |

O `.env.example` vem com `GLPI_READ_ONLY=1`. Para liberar escrita, defina
`GLPI_READ_ONLY=0` (ou remova a variável) no ambiente do processo MCP.

O administrador deve ir em **Configurar > Geral > API**, habilitar a API REST, habilitar login com token externo e criar um **cliente de API**. Isso gera o App-Token; opcionalmente, restrinja uma faixa de IP. Cada pessoa obtém seu token em **Minhas preferências > Chaves de acesso remoto > Token de API** e pode regenerá-lo. Se essa área não aparecer no perfil, peça ao administrador.

## Tools

| Tool | Descrição | Escrita |
|---|---|---|
| `glpi_whoami` | Exibe nome, perfil ativo e entidade da sessão. | Não |
| `glpi_list_tickets` | Lista chamados visíveis, com filtros de status e paginação. | Não |
| `glpi_get_ticket` | Exibe chamado, acompanhamentos, soluções e tarefas. | Não |
| `glpi_search_categories` | Localiza categorias para `itilcategories_id`. | Não |
| `glpi_search_locations` | Localiza locais para `locations_id`. | Não |
| `glpi_create_ticket` | Abre incidente ou requisição. | Sim |
| `glpi_add_followup` | Adiciona acompanhamento a um chamado. | Sim |

O status aceita `novo`, `atendimento`, `planejado`, `pendente`, `solucionado`, `fechado` ou `abertos`. Em modo somente leitura, as duas tools de escrita nem são registradas.

## Claude Code e Claude Desktop

No Claude Code, usando o build local:

```bash
claude mcp add glpi -e GLPI_URL=https://glpi.suaempresa.com.br -e GLPI_APP_TOKEN=SEU_APP_TOKEN -e GLPI_USER_TOKEN=SEU_TOKEN -- node C:/caminho/mcp-glpi/dist/index.js
```

Após instalação global, substitua o comando final por `mcp-glpi`. No Claude Desktop, inclua em sua configuração JSON:

```json
{
  "mcpServers": {
    "glpi": {
      "command": "node",
      "args": ["C:/caminho/mcp-glpi/dist/index.js"],
      "env": {
        "GLPI_URL": "https://glpi.suaempresa.com.br",
        "GLPI_APP_TOKEN": "SEU_APP_TOKEN",
        "GLPI_USER_TOKEN": "SEU_TOKEN"
      }
    }
  }
}
```

## Segurança

Tokens só ficam em variáveis de ambiente e nunca devem ser enviados ao Git. Cada pessoa deve usar o próprio token. O servidor respeita as permissões do GLPI: normalmente, quem tem perfil **Requerente** só vê os próprios chamados.

## Solução de problemas

| Situação | Ação |
|---|---|
| `ERROR_APP_TOKEN_PARAMETERS_MISSING` | Peça/crie o cliente de API em Configurar > Geral > API. |
| `ERROR_GLPI_LOGIN_USER_TOKEN` | Regenere o token pessoal e atualize `GLPI_USER_TOKEN`. |
| `ERROR_SESSION_TOKEN_INVALID` | Refaça a chamada; o servidor renova a sessão uma vez automaticamente. |
| `ERROR_RIGHT_MISSING` | Peça ao administrador a permissão necessária. |
| `ERROR_ITEM_NOT_FOUND` | Confira o ID e se o chamado é visível ao seu perfil. |
| Tempo esgotado | Confirme URL, VPN/rede e disponibilidade do GLPI. |

Exemplos de perguntas: “quais meus chamados pendentes?” e “abra um chamado de requisição, urgência média, informando que preciso de acesso à pasta compartilhada”.
