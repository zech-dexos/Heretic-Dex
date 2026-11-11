import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App';
import * as webllm from '@mlc-ai/web-llm';

global.fetch = jest.fn((url) => {
  if (typeof url === 'string' && url.includes('api/models')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve([
        { id: 'author/heretic-model-1-gguf', author: 'author', downloads: 1000, tags: ['heretic'] },
        { id: 'author2/heretic-model-2', author: 'author2', downloads: 500, tags: ['heretic'] }
      ])
    });
  } else if (typeof url === 'string' && url.includes('health')) {
       return Promise.resolve({ ok: true });
  } else if (typeof url === 'string' && url.includes('completions')) {
       return Promise.resolve({
           ok: true,
           body: {
               getReader: () => {
                   let i = 0;
                   return {
                       read: () => {
                           if (i === 0) {
                               i++;
                               return Promise.resolve({ done: false, value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Mock"}}]}\n') });
                           } else if (i === 1) {
                               i++;
                               return Promise.resolve({ done: false, value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":" response"}}]}\n') });
                           }
                           return Promise.resolve({ done: true });
                       }
                   };
               }
           }
       });
  }
  return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
}) as jest.Mock;

describe('App', () => {
  beforeEach(() => {
    (global.fetch as jest.Mock).mockClear();
  });

  test('preserves Dex Core continuity when switching models in LlamaCppBackend', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('author/heretic-model-1-gguf')).toBeInTheDocument();
    });

    const loadButtons = screen.getAllByText('Load Model');
    expect(loadButtons.length).toBeGreaterThan(0);
    fireEvent.click(loadButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/Switched reasoning provider/i)).toBeInTheDocument();
    });

    const chatInput = screen.getByPlaceholderText(/Speak/i);
    const sendButton = screen.getByText('Send');

    fireEvent.change(chatInput, { target: { value: 'First message' } });
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(screen.getByText('First message')).toBeInTheDocument();
      expect(screen.getByText('Mock response')).toBeInTheDocument();
    });
  });
});
