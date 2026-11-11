export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ModelRequirements {
  ramRequiredMB: number;
  vramRequiredMB?: number;
}

export interface InferenceBackend {
  name: string;
  isAvailable(): Promise<boolean>;
  discover_models(query: string): Promise<any[]>;
  load_model(modelId: string, onProgress?: (text: string, progress: number) => void): Promise<void>;
  unload_model(): Promise<void>;
  generate(messages: Message[]): Promise<string>;
  stream_generate(messages: Message[], onChunk: (text: string) => void): Promise<void>;
  health_check(): Promise<boolean>;
  estimate_requirements(modelId: string): ModelRequirements;
  is_model_compatible(modelId: string, modelInfo?: any): boolean;
}
