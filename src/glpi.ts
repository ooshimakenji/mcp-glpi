export type FetchLike = typeof fetch;

export type GlpiConfig = {
  url?: string;
  appToken?: string;
  userToken?: string;
  login?: string;
  password?: string;
  fetch?: FetchLike;
};

type ApiError = [string, string?];

export function glpiErrorMessage(error: ApiError): GlpiError {
  const [code, detail] = error;
  const common: Record<string, string> = {
    ERROR_APP_TOKEN_PARAMETERS_MISSING:
      "O App-Token está ausente ou inválido. Peça ao admin do GLPI um cliente de API em Configurar > Geral > API.",
    ERROR_GLPI_LOGIN_USER_TOKEN:
      "O token pessoal do usuário é inválido. Regenere-o em Minhas preferências > Chaves de acesso remoto.",
    ERROR_SESSION_TOKEN_INVALID: "A sessão do GLPI expirou; o servidor tentará renová-la automaticamente.",
    ERROR_RIGHT_MISSING: "Seu perfil do GLPI não tem permissão para esta ação.",
    ERROR_ITEM_NOT_FOUND: "O item não foi encontrado ou não está visível para seu perfil.",
    ERROR_BAD_ARRAY: "O GLPI recusou os dados enviados. Revise os campos informados."
  };
  return new GlpiError(`${common[code] ?? `Erro do GLPI: ${code}.`}${detail ? ` Detalhe: ${detail}` : ""}`, code);
}

export class GlpiError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = "GlpiError";
  }
}

export class GlpiClient {
  private readonly config: GlpiConfig;
  private readonly apiUrl: string;
  private sessionToken?: string;
  private readonly doFetch: FetchLike;

  constructor(config: GlpiConfig = {}) {
    this.config = config;
    this.apiUrl = this.apiBase(config.url ?? process.env.GLPI_URL);
    this.doFetch = config.fetch ?? fetch;
  }

  private apiBase(url?: string): string {
    if (!url) return "";
    return `${url.replace(/\/+$/, "").replace(/\/apirest\.php$/, "")}/apirest.php`;
  }

  private settings(): Required<Pick<GlpiConfig, "appToken">> & GlpiConfig {
    const appToken = this.config.appToken ?? process.env.GLPI_APP_TOKEN;
    const userToken = this.config.userToken ?? process.env.GLPI_USER_TOKEN;
    const login = this.config.login ?? process.env.GLPI_LOGIN;
    const password = this.config.password ?? process.env.GLPI_PASSWORD;
    if (!this.apiUrl) throw new GlpiError("GLPI_URL não foi configurada.");
    if (!appToken) {
      throw new GlpiError(
        "GLPI_APP_TOKEN não foi configurado. Peça ao admin do GLPI um cliente de API em Configurar > Geral > API."
      );
    }
    if (!userToken && !(login && password)) {
      throw new GlpiError("Configure GLPI_USER_TOKEN ou GLPI_LOGIN e GLPI_PASSWORD para autenticar no GLPI.");
    }
    return { ...this.config, appToken, userToken, login, password };
  }

  private headers(session = false): Headers {
    const config = this.settings();
    const headers = new Headers({ "App-Token": config.appToken });
    if (session && this.sessionToken) headers.set("Session-Token", this.sessionToken);
    return headers;
  }

  private authHeader(): string {
    const config = this.settings();
    if (config.userToken) return `user_token ${config.userToken}`;
    return `Basic ${Buffer.from(`${config.login}:${config.password}`).toString("base64")}`;
  }

  private message(error: ApiError): GlpiError {
    return glpiErrorMessage(error);
  }

  private async raw(path: string, init: RequestInit, session = true): Promise<unknown> {
    const headers = this.headers(session);
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    if (init.body) headers.set("Content-Type", "application/json");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await this.doFetch(`${this.apiUrl}${path}`, { ...init, headers, signal: controller.signal });
      const data: unknown = await response.json().catch(() => null);
      if (response.status === 401) throw new GlpiError("Sessão do GLPI inválida.", "ERROR_SESSION_TOKEN_INVALID");
      if (Array.isArray(data) && typeof data[0] === "string" && data[0].startsWith("ERROR_")) {
        throw this.message(data as ApiError);
      }
      if (!response.ok) throw new GlpiError(`O GLPI respondeu HTTP ${response.status}.`);
      return data;
    } catch (error) {
      if (error instanceof GlpiError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new GlpiError("A API do GLPI demorou mais de 15 segundos.");
      }
      throw new GlpiError("Não foi possível conectar à API do GLPI. Verifique GLPI_URL e a rede.");
    } finally {
      clearTimeout(timer);
    }
  }

  async initSession(): Promise<void> {
    const headers = this.headers(false);
    headers.set("Authorization", this.authHeader());
    const response = await this.doFetch(`${this.apiUrl}/initSession`, { headers });
    const data: unknown = await response.json().catch(() => null);
    if (Array.isArray(data) && typeof data[0] === "string" && data[0].startsWith("ERROR_")) {
      throw this.message(data as ApiError);
    }
    if (!response.ok || !data || typeof data !== "object" || !("session_token" in data)) {
      throw new GlpiError(`Não foi possível iniciar a sessão no GLPI (HTTP ${response.status}).`);
    }
    this.sessionToken = String((data as { session_token: unknown }).session_token);
  }

  async request(path: string, init: RequestInit = {}): Promise<unknown> {
    if (!this.sessionToken) await this.initSession();
    try {
      return await this.raw(path, init);
    } catch (error) {
      if (error instanceof GlpiError && error.code === "ERROR_SESSION_TOKEN_INVALID") {
        this.sessionToken = undefined;
        await this.initSession();
        return this.raw(path, init);
      }
      throw error;
    }
  }

  async close(): Promise<void> {
    if (!this.sessionToken) return;
    try {
      await this.raw("/killSession", { method: "GET" });
    } catch (error) {
      console.error("Não foi possível encerrar a sessão do GLPI.");
    } finally {
      this.sessionToken = undefined;
    }
  }
}
