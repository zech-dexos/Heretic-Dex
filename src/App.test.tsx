import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { TextDecoder } from 'util';

Object.assign(global, { TextDecoder });

describe('Heretic Test-Drive', () => {
  beforeEach(() => {
    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/models') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            models: [{ id: 'publisher/heretic-model', providers: ['test-provider'] }]
          })
        } as Response);
      }

      if (url === '/api/chat') {
        const chunks = [
          'data: {"choices":[{"delta":{"content":"Real "}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"hosted response"}}]}\n\n',
          'data: [DONE]\n\n'
        ];
        let index = 0;
        const body = {
          getReader: () => ({
            read: async () => index < chunks.length
              ? { done: false, value: new Uint8Array(Array.from(chunks[index++]).map((char) => char.charCodeAt(0))) }
              : { done: true, value: undefined }
          })
        };
        return Promise.resolve({ ok: true, body } as unknown as Response);
      }

      return Promise.reject(new Error('Unexpected request: ' + url));
    }) as jest.Mock;
  });

  test('lists only server-provided models and streams a hosted response', async () => {
    render(<App />);

    expect(await screen.findByText('publisher/heretic-model')).toBeInTheDocument();
    const input = screen.getByPlaceholderText('Ask this model something…');
    fireEvent.change(input, { target: { value: 'Hello' } });
    fireEvent.click(screen.getByText('Send'));

    await waitFor(() => {
      expect(screen.getByText('Real hosted response')).toBeInTheDocument();
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/chat', expect.objectContaining({
      method: 'POST'
    }));
  });
});
