import { InferenceBackend, Message, ModelRequirements } from './InferenceBackend';

export class LlamaCppBackend implements InferenceBackend {
  name = 'llama.cpp (Local Server)';
  private baseUrl = 'http://localhost:8080';
  private currentModelId: string | null = null;

  constructor(baseUrl?: string) {
    if (baseUrl) this.baseUrl = baseUrl;
  }

  async isAvailable(): Promise<boolean> {
    return this.health_check();
  }

  async discover_models(query: string): Promise<any[]> {
    const q = query ? query : 'heretic gguf';
    const response = await fetch(`https://huggingface.co/api/models?search=${encodeURIComponent(q)}&sort=downloads&direction=-1&limit=20`);
    if (response.ok) {
      return await response.json();
    }
    throw new Error('Failed to fetch models');
  }

  is_model_compatible(modelId: string, modelInfo?: any): boolean {
    return modelId.toLowerCase().includes('gguf');
  }

  estimate_requirements(modelId: string): ModelRequirements {
    return { ramRequiredMB: 4096 };
  }

  async load_model(modelId: string, onProgress?: (text: string, progress: number) => void): Promise<void> {
    // In a real application, we would download the model here using HF hub API and tell llama.cpp server to switch
    // For now, we simulate success since the browser can't directly launch the llama.cpp server.
    if (!this.is_model_compatible(modelId)) {
        throw new Error('Model must be a GGUF format for llama.cpp');
    }
    if (onProgress) onProgress('Assuming llama.cpp server is running and configured with this model...', 100);
    this.currentModelId = modelId;
  }

  async unload_model(): Promise<void> {
    this.currentModelId = null;
  }

  async generate(messages: Message[]): Promise<string> {
    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages })
    });
    if (!res.ok) throw new Error('Failed to generate');
    const data = await res.json();
    return data.choices[0].message.content;
  }

  async stream_generate(messages: Message[], onChunk: (text: string) => void): Promise<void> {
     const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, stream: true })
      });

      if (!res.ok || !res.body) {
        throw new Error(`Failed to connect to llama.cpp server at ${this.baseUrl}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
             try {
                const data = JSON.parse(line.substring(6));
                const content = data.choices[0]?.delta?.content;
                if (content) onChunk(content);
             } catch (e) {
                 // Ignore parsing errors for partial chunks
             }
          }
        }
      }
  }

  async health_check(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`);
      return res.ok;
    } catch {
      return false;
    }
  }
}
