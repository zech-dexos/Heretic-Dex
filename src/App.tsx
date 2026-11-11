import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { InferenceBackend, Message } from './inference/InferenceBackend';
import { WebLLMBackend } from './inference/WebLLMBackend';

interface ModelInfo {
  id: string;
  author: string;
  downloads: number;
  tags: string[];
}

const App: React.FC = () => {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentModel, setCurrentModel] = useState<string | null>(null);

  const [activeBackend] = useState<InferenceBackend>(new WebLLMBackend());

  const [engineStatus, setEngineStatus] = useState<string>('Offline');
  const [progress, setProgress] = useState<number>(0);
  const [hardwareWarning, setHardwareWarning] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([
    { role: 'system', content: 'Heretic Model Test-Drive Initialized. Select a model to begin.' }
  ]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const searchModels = async (query: string) => {
    setLoading(true);
    try {
      const results = await activeBackend.discover_models(query);

      // Inject known working MLC model for demonstration since there are no pre-compiled Heretic WebLLM models yet
      if (query.toLowerCase().includes('heretic')) {
          results.unshift({
              id: 'Llama-3.1-8B-Instruct-q4f32_1-MLC',
              author: 'mlc-ai',
              downloads: 100000,
              tags: ['mlc', 'webllm', 'compatible']
          });
      }

      setModels(results);
    } catch (error) {
      console.error("Failed to fetch models", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    searchModels('heretic');
  }, [activeBackend]);

  useEffect(() => {
    if (messagesEndRef.current && typeof messagesEndRef.current.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    searchModels(searchQuery);
  };

  const loadModel = async (modelId: string) => {
    setCurrentModel(modelId);
    setEngineStatus('Loading...');
    setProgress(0);
    setHardwareWarning(null);

    try {
      const requirements = activeBackend.estimate_requirements(modelId);

      let systemRam = 'Unknown';
      if ((navigator as any).deviceMemory) {
          systemRam = (navigator as any).deviceMemory + 'GB';
          if ((navigator as any).deviceMemory * 1024 < requirements.ramRequiredMB) {
              setHardwareWarning(`Warning: This model requires ~${requirements.ramRequiredMB}MB RAM, but your system only reports ~${systemRam}. Performance may be poor or it may fail to load.`);
          }
      }

      await activeBackend.load_model(modelId, (text, p) => {
        setEngineStatus(`Loading: ${text}`);
        setProgress(p);
      });

      setEngineStatus('Online');
      setProgress(100);
      setMessages([{
        role: 'system',
        content: `Reasoning provider switched to ${modelId}. Ready.`
      }]);
    } catch (error: any) {
      console.error('Error loading model:', error);
      setEngineStatus(`Error: ${error.message}`);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const isOnline = await activeBackend.health_check();
    if (!input.trim() || !isOnline || isGenerating) return;

    const userMsg = input.trim();
    setInput('');
    setIsGenerating(true);

    const updatedMessages = [...messages, { role: 'user' as const, content: userMsg }];
    setMessages(updatedMessages);

    try {
      let currentReply = '';
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      await activeBackend.stream_generate(updatedMessages, (chunk) => {
        currentReply += chunk;
        setMessages(prev => {
          const newMsgs = [...prev];
          newMsgs[newMsgs.length - 1] = { role: 'assistant', content: currentReply };
          return newMsgs;
        });
      });
    } catch (error: any) {
      console.error('Generation error:', error);
      setMessages(prev => [...prev, { role: 'system', content: `Error: ${error.message}` }]);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="App">
      <header>
        <h1>☧ Heretic Test-Drive</h1>
        <p>A lightweight public page to test-drive Heretic models directly in your browser.</p>
      </header>

      <main>
        <div className="left-panel">
          <section className="search-section">
            <form onSubmit={handleSearch}>
              <input
                type="text"
                placeholder="Search models (e.g. heretic gguf)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button type="submit">Search</button>
            </form>
          </section>

          <section className="model-list">
            {loading ? (
              <p>Scanning registry...</p>
            ) : (
              <ul>
                {models.map(model => {
                  const isCompatible = activeBackend.is_model_compatible(model.id);
                  return (
                    <li key={model.id} style={{ opacity: isCompatible ? 1 : 0.6 }}>
                      <h3>{model.id}</h3>
                      <div className="model-meta">
                        Downloads: {model.downloads?.toLocaleString() || 0}
                        <br/>
                        Status: {isCompatible ? 'Runnable via Browser WebGPU' : 'Requires conversion to WebLLM format'}
                      </div>
                      <button
                        onClick={() => loadModel(model.id)}
                        disabled={!isCompatible || (currentModel === model.id && engineStatus.startsWith('Loading'))}
                      >
                        {currentModel === model.id ? 'Selected' : 'Load Model'}
                      </button>
                      {!isCompatible && <p style={{fontSize: '0.8em', color: '#f0be55'}}>Note: This model is not currently compiled for WebLLM and cannot be run natively in the browser without conversion. Use the fallback Llama model above for demonstration.</p>}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>

        <div className="right-panel">
          <div className="controls">
            <div className="status">
              Status: {engineStatus}
            </div>
            {currentModel && <div>Model: {currentModel}</div>}
          </div>

          {hardwareWarning && (
             <div style={{color: '#f0be55', backgroundColor: '#3d3020', padding: '10px', marginTop: '10px', borderRadius: '4px', fontSize: '0.9em'}}>
                 {hardwareWarning}
             </div>
          )}

          {engineStatus.startsWith('Loading') && (
            <div className="progress-bar-container">
              <div className="progress-bar" style={{ width: `${progress}%` }}></div>
            </div>
          )}

          <div className="chat-container">
            <div className="messages">
              {messages.map((msg, idx) => (
                <div key={idx} className={`message ${msg.role}`}>
                  {msg.content}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <form className="chat-input" onSubmit={handleSend}>
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={engineStatus === 'Online' ? "Ask something..." : "Load a model first..."}
                disabled={engineStatus !== 'Online' || isGenerating}
              />
              <button type="submit" disabled={!input.trim() || engineStatus !== 'Online' || isGenerating}>
                Send
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
