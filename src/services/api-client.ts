export interface APIConfig {
  baseUrl: string;
  zaiApiKey?: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  name?: string;
}

export interface AskRequest {
  messages: ChatMessage[];
  stream?: boolean;
  requirementGatheringPrompt?: string;
  summarizerPrompt?: string;
  pickAgents?: string[];
}

export interface StreamConfig {
  threadId: string;
  content: string;
  userId: string;
  originalContent?: string;
  componentCatalogue?: string;
  requirementGatheringPrompt?: string;
  summarizerPrompt?: string;
  messageId?: string;
  recursionLimit?: number;
}

export interface NewThreadRequest {
  userId: string;
}

export interface NewThreadResponse {
  message: string;
  threadId: string;
  createdAt: string;
}

export class APIClient {
  private config: APIConfig;

  constructor(config: APIConfig) {
    this.config = config;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.config.zaiApiKey) {
      headers["ZAI-API-KEY"] = this.config.zaiApiKey;
    }

    return headers;
  }

  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint}`;
    const controller = new AbortController();

    const headers = this.getHeaders();

    const response = await fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...options.headers,
      },
      credentials: "include",
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `API request failed: ${response.status} ${response.statusText}. ${errorText}`
      );
    }

    return response.json();
  }

  async ask(request: AskRequest): Promise<any> {
    return this.makeRequest("/api/v1/chat/ask", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  async createNewThread(request: NewThreadRequest): Promise<NewThreadResponse> {
    return this.makeRequest("/api/v1/chat/new", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  async streamChat(
    config: StreamConfig,
    signal?: AbortSignal
  ): Promise<ReadableStream> {
    const url = `${this.config.baseUrl}/api/v1/chat/stream`;

    const headers = {
      ...this.getHeaders(),
      "zai-thread-id": config.threadId,
    };

    const response = await fetch(url, {
      method: "POST",
      body: JSON.stringify(config),
      headers,
      credentials: "include",
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Stream request failed: ${response.status} ${response.statusText}. ${errorText}`
      );
    }

    if (!response.body) {
      throw new Error("No response body received");
    }

    return response.body;
  }

  async getChatHistory(
    threadId: string,
    output?: "latest" | "full" | "debug"
  ): Promise<any> {
    const endpoint = output
      ? `/api/v1/chat/${threadId}/${output}`
      : `/api/v1/chat/${threadId}`;

    return this.makeRequest(endpoint);
  }
}
