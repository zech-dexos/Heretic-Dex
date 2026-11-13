import React, { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';

type Role = 'system' | 'user' | 'assistant';
interface ChatMessage {
  role: Role;
  content: string;
}
interface HostedModel {
  id: string;
  providers: string[];
}

const App: React.FC = () => {
  const [models, setModels] = useState<HostedModel[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [serviceStatus, setServiceStatus] = useState('Checking hosted inference…');
  const [pageError, setPageError] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const filteredModels = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return models;
    return models.filter((model) => model.id.toLowerCase().includes(query));
  }, [models, searchQuery]);

  useEffect(() => {
    let cancelled = false;

    const loadModels = async () => {
      try {
        const response = await fetch('/api/models');
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Could not load hosted models.');
        if (cancelled) return;

        const available: HostedModel[] = payload.models || [];
        setModels(available);
        setServiceStatus(available.length > 0 ? 'Hosted inference ready' : 'No Heretic models enabled');
        if (available.length > 0) setSelectedModel(available[0].id);
        if (available.length === 0) {
          setPageError('The inference server is running, but it has no enabled Heretic models. Configure HERETIC_MODEL_IDS with model IDs that are available from the hosted provider.');
        }
      } catch (error) {
        if (cancelled) return;
        setServiceStatus('Inference unavailable');
        setPageError(error instanceof Error ? error.message : 'Could not connect to the hosted inference server.');
      }
    };

    loadModels();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (messagesEndRef.current && typeof messagesEndRef.current.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();
    const prompt = input.trim();
    if (!prompt || !selectedModel || isGenerating) return;

    const conversation = [...messages, { role: 'user' as const, content: prompt }];
    setMessages(conversation);
    setInput('');
    setPageError('');
    setIsGenerating(true);
    setMessages((current) => [...current, { role: 'assistant', content: '' }]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selectedModel, messages: conversation })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'The hosted model request failed.');
      }
      if (!response.body) throw new Error('The server did not return a response stream.');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let reply = '';

      const consume = (chunk: string) => {
        buffer += chunk;
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const eventText of events) {
          const data = eventText.split('\n')
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trim())
            .join('\n');
          if (!data || data === '[DONE]') continue;

          let payload: any;
          try { payload = JSON.parse(data); } catch { continue; }
          if (payload.error) throw new Error(payload.error);
          const delta = payload.choices && payload.choices[0] &&
            payload.choices[0].delta && payload.choices[0].delta.content;
          if (typeof delta === 'string' && delta.length > 0) {
            reply += delta;
            setMessages((current) => {
              const next = [...current];
              next[next.length - 1] = { role: 'assistant', content: reply };
              return next;
            });
          }
        }
      };

      while (true) {
        const result = await reader.read();
        if (result.done) break;
        consume(decoder.decode(result.value, { stream: true }));
      }
      consume(decoder.decode());
      if (!reply) throw new Error('The model returned no text. Check the provider response and try again.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The model request failed.';
      setPageError(message);
      setMessages((current) => {
        const next = [...current];
        if (next[next.length - 1] && next[next.length - 1].role === 'assistant' && !next[next.length - 1].content) {
          next.pop();
        }
        return next;
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const changeModel = (modelId: string) => {
    setSelectedModel(modelId);
    setMessages([]);
    setPageError('');
  };

  return (
    <div className="App">
      <header>
        <h1>☧ Heretic Test-Drive</h1>
        <p>Choose a hosted Heretic model, ask a question, and see its actual response. Nothing to install.</p>
      </header>

      <main>
        <aside className="left-panel">
          <section className="search-section">
            <label htmlFor="model-search">Available hosted models</label>
            <input
              id="model-search"
              type="search"
              placeholder="Filter available models…"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </section>

          <section className="model-list">
            {models.length === 0 ? (
              <p className="empty-state">No runnable Heretic models are currently published by this server.</p>
            ) : (
              <ul>
                {filteredModels.map((model) => (
                  <li key={model.id} className={selectedModel === model.id ? 'selected' : ''}>
                    <h3>{model.id}</h3>
                    <div className="model-meta">
                      Hosted by: {model.providers.length > 0 ? model.providers.join(', ') : 'Configured inference endpoint'}
                    </div>
                    <button
                      type="button"
                      onClick={() => changeModel(model.id)}
                      disabled={selectedModel === model.id || isGenerating}
                    >
                      {selectedModel === model.id ? 'Selected' : 'Use this model'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>

        <section className="right-panel">
          <div className="controls">
            <div className="status">Status: {serviceStatus}</div>
            {selectedModel && <div className="model-name">Model: {selectedModel}</div>}
          </div>

          {pageError && <div className="error-message" role="alert">{pageError}</div>}

          <div className="chat-container">
            <div className="messages" aria-live="polite">
              {messages.length === 0 && (
                <div className="message system">
                  Select an available model, then send a question. Responses come from the hosted model provider.
                </div>
              )}
              {messages.map((message, index) => (
                <div key={index} className={'message ' + message.role}>
                  {message.content || (message.role === 'assistant' && isGenerating ? 'Thinking…' : '')}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <form className="chat-input" onSubmit={handleSend}>
              <input
                type="text"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={selectedModel ? 'Ask this model something…' : 'No hosted model available'}
                disabled={!selectedModel || isGenerating}
                maxLength={4000}
              />
              <button type="submit" disabled={!input.trim() || !selectedModel || isGenerating}>
                {isGenerating ? 'Waiting…' : 'Send'}
              </button>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
};

export default App;
