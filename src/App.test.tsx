import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App';
import * as webllm from '@mlc-ai/web-llm';

global.fetch = jest.fn((url) => {
  if (typeof url === 'string' && url.includes('api/models')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve([
        { id: 'author2/heretic-model-2', author: 'author2', downloads: 500, tags: ['heretic'] }
      ])
    });
  }
  return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
}) as jest.Mock;

jest.mock('@mlc-ai/web-llm', () => {
  return {
    CreateMLCEngine: jest.fn().mockResolvedValue({
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            [Symbol.asyncIterator]: () => {
              let i = 0;
              return {
                next: () => {
                  if (i === 0) {
                    i++;
                    return Promise.resolve({ value: { choices: [{ delta: { content: 'Mock' } }] }, done: false });
                  } else if (i === 1) {
                    i++;
                    return Promise.resolve({ value: { choices: [{ delta: { content: ' response' } }] }, done: false });
                  }
                  return Promise.resolve({ done: true });
                }
              };
            }
          })
        }
      }
    })
  };
});

describe('App', () => {
  beforeEach(() => {
    (global.fetch as jest.Mock).mockClear();
    (webllm.CreateMLCEngine as jest.Mock).mockClear();
  });

  test('loads WebLLM model and can chat', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Llama-3.1-8B-Instruct-q4f32_1-MLC')).toBeInTheDocument();
    });

    const loadButtons = screen.getAllByText('Load Model');
    expect(loadButtons.length).toBeGreaterThan(0);
    fireEvent.click(loadButtons[0]);

    await waitFor(() => {
      expect(webllm.CreateMLCEngine).toHaveBeenCalled();
      expect(screen.getByText(/Reasoning provider switched/i)).toBeInTheDocument();
    });

    const chatInput = screen.getByPlaceholderText(/Ask something/i);
    const sendButton = screen.getByText('Send');

    fireEvent.change(chatInput, { target: { value: 'First message' } });
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(screen.getByText('First message')).toBeInTheDocument();
      expect(screen.getByText('Mock response')).toBeInTheDocument();
    });
  });
});
