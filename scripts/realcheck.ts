import { glpiErrorMessage } from "../src/glpi.js";

const response = await fetch(`${process.env.GLPI_URL ?? "https://glpi.suaempresa.com.br"}/apirest.php/initSession`);
const body: unknown = await response.json();
if (Array.isArray(body) && typeof body[0] === "string") {
  console.log(glpiErrorMessage(body as [string, string?]).message);
} else {
  console.log(`Resposta inesperada: HTTP ${response.status}`);
}
