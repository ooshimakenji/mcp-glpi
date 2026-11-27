#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { GlpiClient } from "./glpi.js";
import { registerTools } from "./tools.js";

const client = new GlpiClient();
const server = new McpServer({ name: "mcp-glpi", version: "0.1.1" });
registerTools(server, client);
const shutdown = () => void client.close();
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
await server.connect(new StdioServerTransport());
