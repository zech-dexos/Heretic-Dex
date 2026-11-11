import { InferenceBackend, Message, ModelRequirements } from './InferenceBackend';

export class OllamaBackend implements InferenceBackend {
  name = 'Ollama (Local Server)';
  private baseUrl = 'http://localhost:11434';
  private currentModelId: string | null = null;

  constructor(baseUrl?: string) {
    if (baseUrl) this.baseUrl = baseUrl;
  }

  async isAvailable(): Promise<boolean> {
    return this.health_check();
  }

  async discover_models(query: string): Promise<any[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`);
      const data = await res.json();
      return data.models.map((m: any) => ({
          id: m.name,
          author: 'ollama',
          downloads: 0,
          tags: ['ollama']
      })) || [];
    } catch {
      return [];
    }
  }

  is_model_compatible(modelId: string, modelInfo?: any): boolean {
    return true;
  }

  estimate_requirements(modelId: string): ModelRequirements {
    return { ramRequiredMB: 4096 };
  }

  async load_model(modelId: string, onProgress?: (text: string, progress: number) => void): Promise<void> {
    // In a full implementation we would use /api/pull to pull the model if it's not present.
    // For this prototype, we'll assume the user has the models they want in Ollama and rely on discover_models.
    if (onProgress) onProgress('Model loaded via Ollama', 100);
    this.currentModelId = modelId;
  }

  async unload_model(): Promise<void> {
    this.currentModelId = null;
  }

  async generate(messages: Message[]): Promise<string> {
    if (!this.currentModelId) throw new Error('Model not loaded');
    const res = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: this.currentModelId,
            messages,
            stream: false
        })
      });
      if (!res.ok) throw new Error('Failed to generate');
      const data = await res.json();
      return data.message.content;
  }

  async stream_generate(messages: Message[], onChunk: (text: string) => void): Promise<void> {
    if (!this.currentModelId) throw new Error('Model not loaded');

    const res = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: this.currentModelId,
            messages,
            stream: true
        })
      });

      if (!res.ok || !res.body) {
        throw new Error(`Failed to connect to Ollama server at ${this.baseUrl}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line) {
             try {
                const data = JSON.parse(line);
                const content = data.message?.content;
                if (content) onChunk(content);
             } catch (e) {
                 // Ignore
             }
          }
        }
      }
  }

  async health_check(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`);
      return res.ok;
    } catch {
      return false;
    }
  }
}
