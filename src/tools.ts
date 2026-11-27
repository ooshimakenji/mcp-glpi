import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { plainText, statusName, urgencyName } from "./format.js";
import { GlpiClient } from "./glpi.js";

type Row = Record<string, unknown>;
type Part = "followups" | "solutions" | "tasks";

const object = (value: unknown): Row =>
  value && typeof value === "object" ? (value as Row) : {};

const annotation = (readOnlyHint: boolean) => ({
  readOnlyHint,
  destructiveHint: false,
  idempotentHint: readOnlyHint,
  openWorldHint: true
});

const result = (text: string, structuredContent: object) => ({
  content: [{ type: "text" as const, text }],
  structuredContent
});

const rows = (value: unknown): Row[] =>
  Array.isArray(value) ? value.map(object) : [];

const searchRows = (value: unknown): Row[] => rows(object(value).data);

async function optionalPart(
  client: GlpiClient,
  id: number,
  endpoint: string,
  part: Part,
  warnings: string[]
): Promise<Row[]> {
  try {
    return rows(await client.request(`/Ticket/${id}/${endpoint}?expand_dropdowns=true`));
  } catch {
    if (part === "tasks") warnings.push("Tarefas não visíveis ao seu perfil.");
    return [];
  }
}

export function ticketListMarkdown(items: unknown[]): string {
  if (!items.length) return "Nenhum chamado encontrado.";
  const lines = [
    "| ID | Título | Status | Urgência | Abertura | Atualização | Categoria |",
    "|---:|---|---|---|---|---|---|"
  ];
  for (const value of items) {
    const item = object(value);
    lines.push(
      `| ${item.id ?? ""} | ${plainText(item.name)} | ${statusName(item.status)} | ` +
        `${urgencyName(item.urgency)} | ${item.date ?? ""} | ${item.date_mod ?? ""} | ` +
        `${item.category ?? ""} |`
    );
  }
  return lines.join("\n");
}

export function ticketMarkdown(
  ticket: Row,
  followups: unknown[],
  solutions: unknown[],
  tasks: unknown[],
  warnings: string[] = []
): string {
  const lines = [
    `# Chamado #${ticket.id}`,
    `**${plainText(ticket.name)}**`,
    "",
    `Status: ${statusName(ticket.status)} · Urgência: ${urgencyName(ticket.urgency)}`,
    `Aberto: ${ticket.date ?? ""} · Atualizado: ${ticket.date_mod ?? ""}`,
    "",
    plainText(ticket.content)
  ];
  const timeline = [
    ...followups.map(value => ({ kind: "Acompanhamento", data: object(value) })),
    ...solutions.map(value => ({ kind: "Solução", data: object(value) })),
    ...tasks.map(value => ({ kind: "Tarefa", data: object(value) }))
  ].sort((a, b) => {
    const aDate = String(a.data.date ?? a.data.date_creation ?? "");
    const bDate = String(b.data.date ?? b.data.date_creation ?? "");
    return aDate.localeCompare(bDate);
  });
  if (timeline.length) lines.push("", "## Histórico");
  for (const entry of timeline) {
    const data = entry.data;
    lines.push(
      `- **${entry.kind}** · ${data.date ?? data.date_creation ?? ""} · ` +
        `${data.users_id ?? data.user_name ?? ""}: ${plainText(data.content)}`
    );
  }
  if (warnings.length) lines.push("", ...warnings.map(warning => `> ${warning}`));
  return lines.join("\n");
}

export function registerTools(
  server: McpServer,
  client: GlpiClient,
  readOnly = process.env.GLPI_READ_ONLY === "1"
): void {
  server.registerTool(
    "glpi_whoami",
    { description: "Mostra a sessão atual do GLPI.", annotations: annotation(true) },
    async () => {
      const session = object(object(await client.request("/getFullSession")).session);
      const name = `${session.glpifirstname ?? ""} ${session.glpirealname ?? ""}`.trim();
      const output = {
        id: session.glpiID ?? "",
        name: name || session.glpiname || "",
        profile: object(session.glpiactiveprofile).name ?? "",
        entity: session.glpiactive_entity_name ?? ""
      };
      return result(
        `Nome: ${output.name}\nPerfil ativo: ${output.profile}\nEntidade: ${output.entity}`,
        output
      );
    }
  );
  server.registerTool(
    "glpi_list_tickets",
    {
      description: "Lista os chamados visíveis ao usuário.",
      inputSchema: z.object({
        status: z.enum([
          "novo",
          "atendimento",
          "planejado",
          "pendente",
          "solucionado",
          "fechado",
          "abertos"
        ]).optional(),
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0)
      }),
      annotations: annotation(true)
    },
    async ({ status, limit, offset }) => {
      const statusValues: Record<string, string> = {
        novo: "1",
        atendimento: "2",
        planejado: "3",
        pendente: "4",
        solucionado: "5",
        fechado: "6",
        abertos: "notold"
      };
      const query = [
        "forcedisplay[]=2",
        "forcedisplay[]=1",
        "forcedisplay[]=12",
        "forcedisplay[]=10",
        "forcedisplay[]=15",
        "forcedisplay[]=19",
        "forcedisplay[]=7",
        "sort=19",
        "order=DESC",
        `range=${offset}-${offset + limit - 1}`
      ];
      if (status) {
        query.push("criteria[0][field]=12");
        query.push("criteria[0][searchtype]=equals");
        query.push(`criteria[0][value]=${statusValues[status]}`);
      }
      const data = object(await client.request(`/search/Ticket?${query.join("&")}`));
      const tickets = searchRows(data).map(item => ({
        id: item["2"] ?? "",
        name: item["1"] ?? "",
        status: item["12"] ?? "",
        urgency: item["10"] ?? "",
        date: item["15"] ?? "",
        date_mod: item["19"] ?? "",
        category: item["7"] ?? ""
      }));
      const total = Number(data.totalcount ?? tickets.length);
      return result(`${ticketListMarkdown(tickets)}\n\n${tickets.length} de ${total}`, {
        tickets,
        offset,
        limit,
        total
      });
    }
  );
  server.registerTool(
    "glpi_get_ticket",
    {
      description: "Obtém um chamado e seu histórico.",
      inputSchema: z.object({ id: z.number().int().positive() }),
      annotations: annotation(true)
    },
    async ({ id }) => {
      const ticket = object(await client.request(`/Ticket/${id}?expand_dropdowns=true`));
      const warnings: string[] = [];
      const [followups, solutions, tasks] = await Promise.all([
        optionalPart(client, id, "ITILFollowup", "followups", warnings),
        optionalPart(client, id, "ITILSolution", "solutions", warnings),
        optionalPart(client, id, "TicketTask", "tasks", warnings)
      ]);
      const output = { ticket, followups, solutions, tasks, warnings };
      return result(ticketMarkdown(ticket, followups, solutions, tasks, warnings), output);
    }
  );
  for (const [name, endpoint, field] of [
    ["glpi_search_categories", "ITILCategory", "itilcategories_id"],
    ["glpi_search_locations", "Location", "locations_id"]
  ] as const) {
    server.registerTool(
      name,
      {
        description: `Busca ${name.includes("categories") ? "categorias" : "locais"} pelo nome.`,
        inputSchema: z.object({ text: z.string().min(1) }),
        annotations: annotation(true)
      },
      async ({ text }) => {
        const query = [
          "criteria[0][field]=1",
          "criteria[0][searchtype]=contains",
          `criteria[0][value]=${encodeURIComponent(text)}`,
          "forcedisplay[]=2",
          "forcedisplay[]=1",
          "range=0-29"
        ];
        const items = searchRows(
          await client.request(`/search/${endpoint}?${query.join("&")}`)
        ).map(item => ({ id: item["2"] ?? "", nome: item["1"] ?? "" }));
        return result(`Resultados para “${text}”:\n\n${JSON.stringify(items, null, 2)}`, {
          [field]: items
        });
      }
    );
  }
  if (readOnly) return;
  server.registerTool(
    "glpi_create_ticket",
    {
      description: "Abre um chamado no GLPI.",
      inputSchema: z.object({
        name: z.string().min(1),
        content: z.string().min(1),
        type: z.union([z.literal(1), z.literal(2)]).default(2),
        urgency: z.number().int().min(1).max(5).default(3),
        itilcategories_id: z.number().int().positive().optional(),
        locations_id: z.number().int().positive().optional()
      }),
      annotations: annotation(false)
    },
    async input => {
      const data = object(await client.request("/Ticket", {
        method: "POST",
        body: JSON.stringify({ input })
      }));
      const id = data.id;
      const baseUrl = (process.env.GLPI_URL ?? "").replace(/\/$/, "");
      const link = `${baseUrl}/front/ticket.form.php?id=${id}`;
      return result(`Chamado criado: #${id}\n${link}`, { id, link });
    }
  );
  server.registerTool(
    "glpi_add_followup",
    {
      description: "Adiciona um acompanhamento a um chamado.",
      inputSchema: z.object({
        items_id: z.number().int().positive(),
        content: z.string().min(1)
      }),
      annotations: annotation(false)
    },
    async ({ items_id, content }) => {
      const data = object(await client.request("/ITILFollowup", {
        method: "POST",
        body: JSON.stringify({ input: { itemtype: "Ticket", items_id, content } })
      }));
      return result(`Acompanhamento adicionado ao chamado #${items_id}.`, {
        id: data.id,
        ticketId: items_id
      });
    }
  );
}
