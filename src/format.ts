const entities: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": "\"",
  "&#39;": "'",
  "&nbsp;": " "
};

export function plainText(value: unknown): string {
  return String(value ?? "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p>|<\/div>|<\/li>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, item => entities[item] ?? item)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const statusName = (status: unknown): string =>
  ({
    1: "Novo",
    2: "Em atendimento",
    3: "Em atendimento (planejado)",
    4: "Pendente",
    5: "Solucionado",
    6: "Fechado"
  })[Number(status)] ?? "Desconhecido";

export const urgencyName = (urgency: unknown): string =>
  ({ 1: "Muito baixa", 2: "Baixa", 3: "Média", 4: "Alta", 5: "Muito alta" })[Number(urgency)] ?? "Não definida";
