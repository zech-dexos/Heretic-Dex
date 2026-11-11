import * as webllm from '@mlc-ai/web-llm';
import { InferenceBackend, Message, ModelRequirements } from './InferenceBackend';

export class WebLLMBackend implements InferenceBackend {
  name = 'WebLLM (Browser Native)';
  private engine: webllm.MLCEngine | null = null;
  private currentModelId: string | null = null;

  async isAvailable(): Promise<boolean> {
    return 'gpu' in navigator;
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
    return modelId.includes('MLC') || modelId.includes('q4f32_1');
  }

  estimate_requirements(modelId: string): ModelRequirements {
    return { ramRequiredMB: 2048, vramRequiredMB: 1024 };
  }

  async load_model(modelId: string, onProgress?: (text: string, progress: number) => void): Promise<void> {
    if (this.engine) {
      await this.unload_model();
    }

    if (!this.is_model_compatible(modelId)) {
      throw new Error(`Model ${modelId} is not compatible with WebLLM Backend. Please choose a supported model or run a conversion process first.`);
    }

    this.engine = await webllm.CreateMLCEngine(modelId, {
      initProgressCallback: (p: webllm.InitProgressReport) => {
        if (onProgress) onProgress(p.text, Math.round(p.progress * 100));
      }
    });
    this.currentModelId = modelId;
  }

  async unload_model(): Promise<void> {
    if (this.engine) {
      this.engine = null;
      this.currentModelId = null;
    }
  }

  async generate(messages: Message[]): Promise<string> {
    if (!this.engine) throw new Error('Model not loaded');
    const response = await this.engine.chat.completions.create({
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    });
    return response.choices[0].message.content || '';
  }

  async stream_generate(messages: Message[], onChunk: (text: string) => void): Promise<void> {
    if (!this.engine) throw new Error('Model not loaded');
    const stream = await this.engine.chat.completions.create({
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      stream: true,
      temperature: 0.7
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      if (delta) onChunk(delta);
    }
  }

  async health_check(): Promise<boolean> {
    return this.engine !== null;
  }
}
