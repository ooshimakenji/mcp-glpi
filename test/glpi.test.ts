import assert from "node:assert/strict";
import test from "node:test";
import { GlpiClient, GlpiError, glpiErrorMessage } from "../src/glpi.js";
import { plainText } from "../src/format.js";
import { registerTools, ticketListMarkdown, ticketMarkdown } from "../src/tools.js";

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

test("inicia sessão usando user_token", async () => {
  let authorization = "";
  const client = new GlpiClient({ url: "https://glpi.test", appToken: "app", userToken: "user", fetch: async (_url, init) => {
    authorization = new Headers(init?.headers).get("Authorization") ?? "";
    return response({ session_token: "session" });
  } });
  await client.initSession();
  assert.equal(authorization, "user_token user");
});

test("traduz erro de App-Token para português", () => {
  assert.match(glpiErrorMessage(["ERROR_APP_TOKEN_PARAMETERS_MISSING"]).message, /Peça ao admin/);
});

test("renova sessão uma vez após 401", async () => {
  let calls = 0;
  const client = new GlpiClient({ url: "https://glpi.test", appToken: "app", userToken: "user", fetch: async url => {
    calls++;
    if (String(url).endsWith("initSession")) return response({ session_token: `s${calls}` });
    return calls === 2 ? response({}, 401) : response([{ id: 1 }]);
  } });
  assert.deepEqual(await client.request("/Ticket"), [{ id: 1 }]);
  assert.equal(calls, 4);
});

test("limpa HTML e formata lista e histórico", () => {
  assert.equal(plainText("<p>Olá &amp; <b>mundo</b></p>"), "Olá & mundo");
  assert.match(ticketListMarkdown([{ id: 4, name: "<b>Impressora</b>", status: 4, urgency: 3 }]), /Pendente/);
  assert.match(ticketMarkdown({ id: 4, name: "Teste", status: 1, urgency: 3, content: "<p>Texto</p>" }, [{ date: "2026-01-01", content: "<b>feito</b>" }], [], []), /feito/);
});

test("modo somente leitura não registra tools de escrita", () => {
  const names: string[] = [];
  const fake = { registerTool: (name: string) => names.push(name) };
  registerTools(fake as never, {} as GlpiClient, true);
  assert(!names.includes("glpi_create_ticket"));
  assert(!names.includes("glpi_add_followup"));
});

function toolHandler(
  client: Pick<GlpiClient, "request">,
  name: string
): (input: any) => Promise<any> {
  const handlers = new Map<string, (input: any) => Promise<any>>();
  const server = {
    registerTool: (
      toolName: string,
      _definition: unknown,
      handler: (input: any) => Promise<any>
    ) => handlers.set(toolName, handler)
  };
  registerTools(server as never, client as GlpiClient, true);
  return handlers.get(name)!;
}

test("lista chamados pela busca com critério, faixa e mapeamento", async () => {
  let path = "";
  const handler = toolHandler({ request: async value => {
    path = String(value);
    return {
      totalcount: 9,
      data: [{
        "2": 42,
        "1": "Impressora",
        "12": 4,
        "10": 3,
        "15": "2026-01-01",
        "19": "2026-01-02",
        "7": "TI"
      }]
    };
  } }, "glpi_list_tickets");
  const output = await handler({ status: "pendente", limit: 5, offset: 10 });
  assert.match(path, /^\/search\/Ticket\?/);
  assert.match(path, /criteria\[0\]\[field\]=12/);
  assert.match(path, /criteria\[0\]\[searchtype\]=equals/);
  assert.match(path, /criteria\[0\]\[value\]=4/);
  assert.match(path, /range=10-14/);
  assert.equal(output.structuredContent.tickets[0].name, "Impressora");
  assert.equal(output.structuredContent.tickets[0].category, "TI");
  assert.match(output.content[0].text, /1 de 9/);
});

test("whoami extrai somente os campos públicos da sessão", async () => {
  const handler = toolHandler({ request: async () => ({
    session: {
      glpiID: 7,
      glpiname: "voshima",
      glpifirstname: "Vinicius",
      glpirealname: "Oshima",
      glpiactiveprofile: { name: "Requerente", id: 1 },
      glpiactive_entity_name: "Empresa",
      session_token: "não exibir"
    }
  }) }, "glpi_whoami");
  const output = await handler({});
  assert.deepEqual(output.structuredContent, {
    id: 7,
    name: "Vinicius Oshima",
    profile: "Requerente",
    entity: "Empresa"
  });
});

test("retorna chamado quando tarefas não são visíveis", async () => {
  const handler = toolHandler({ request: async path => {
    if (path === "/Ticket/42?expand_dropdowns=true") {
      return { id: 42, name: "Teste" };
    }
    if (String(path).includes("TicketTask")) {
      throw new GlpiError("Sem permissão", "ERROR_RIGHT_MISSING");
    }
    return [];
  } }, "glpi_get_ticket");
  const output = await handler({ id: 42 });
  assert.equal(output.structuredContent.ticket.id, 42);
  assert.deepEqual(output.structuredContent.tasks, []);
  assert.match(output.content[0].text, /Tarefas não visíveis ao seu perfil/);
});
