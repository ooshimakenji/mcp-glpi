import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const server = spawn(process.execPath, [fileURLToPath(new URL("../../dist/index.js", import.meta.url))], {
  stdio: ["pipe", "pipe", "pipe"]
});
let buffer = "";
let stage = 0;
const send = (payload: object) => server.stdin.write(`${JSON.stringify(payload)}\n`);
server.stdout.on("data", chunk => {
  buffer += String(chunk);
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";
  for (const line of lines) {
    const message = JSON.parse(line) as { id?: number; result?: { tools?: Array<{ name: string }> } };
    if (message.id === 1 && stage === 0) {
      stage = 1;
      send({ jsonrpc: "2.0", method: "notifications/initialized" });
      send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    }
    if (message.id === 2) {
      console.log(message.result?.tools?.map(tool => tool.name).join("\n") ?? "");
      server.kill();
    }
  }
});
server.stderr.on("data", chunk => process.stderr.write(chunk));
send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "selfcheck", version: "1" } } });
