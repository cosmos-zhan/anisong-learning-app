import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from '../apps/web/src/App';
import { LoopController } from '../packages/core/controller';
import { grammarRequest, parseGrammar, saveGrammarSettings, validateGrammarConfig } from '../packages/core/grammar';
import { TestEngine, lyrics } from './helpers';

const config = { endpoint: 'https://model.example/v1/chat/completions', model: 'test-model', key: 'test-secret' };
const answer = JSON.stringify({ meaning: '想一直记得', pieces: [{ text: '覚えていたい', explanation: '想继续记着' }], points: [{ title: 'ている＋たい', explanation: '持续状态的愿望' }] });
beforeEach(() => {
  localStorage.clear(); history.replaceState(null, '', '#lyrics');
  // Fail closed: opening the grammar panel may auto-start if another test left
  // an in-memory session key. Individual cases replace this with fake replies.
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network access in grammar test'));
});
afterEach(() => { vi.restoreAllMocks(); });
function response(content: string) { return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }); }
it('sends only the selected line and bounded conversation to the configured HTTPS model, without saving the secret', async () => {
  saveGrammarSettings(config);
  expect(localStorage.getItem('anisong:grammar-settings')).not.toContain(config.key);
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(answer));
  const actual = await grammarRequest(config, 'いつまでも覚えていたい', [{ role: 'assistant', content: answer }, { role: 'user', content: '过去式吗？' }], new AbortController().signal);
  expect(actual).toBe(answer);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe(config.endpoint);
  expect(init?.redirect).toBe('error');
  const payload = JSON.parse(String(init?.body));
  expect(payload.messages[1].content).toContain('いつまでも覚えていたい');
  expect(payload.messages.at(-1).content).toBe('过去式吗？');
  expect(JSON.stringify(payload)).not.toContain(config.key);
  expect(() => validateGrammarConfig({ ...config, endpoint: 'http://example.com' })).toThrow('HTTPS');
  expect(() => validateGrammarConfig({ ...config, endpoint: 'https://example.com/?token=secret' })).toThrow();
});
it('handles structured and unstructured responses without inventing data', () => {
  expect(parseGrammar('```json\n' + answer + '\n```').pieces[0].text).toBe('覚えていたい');
  expect(parseGrammar('普通说明').raw).toBe('普通说明');
  expect(parseGrammar('普通说明').pieces).toEqual([]);
});
it('long press opens the selected sentence, pauses playback, supports follow-up, and returns with position intact', async () => {
  saveGrammarSettings(config);
  const mock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response(answer)).mockResolvedValueOnce(response('不是过去式。'));
  const engine = new TestEngine(), controller = new LoopController(engine);
  await controller.load('fixture'); controller.setLyrics(lyrics); await controller.select(1);
  const originalPosition = engine.position;
  const ui = render(<App controller={controller} autoLoad={false} view="practice" />);
  const row = screen.getByRole('button', { name: '第 2 句 いつまでも覚えていたい' });
  fireEvent.pointerDown(row, { pointerType: 'touch', clientX: 30, clientY: 40 });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 550)); });
  fireEvent.pointerUp(row, { pointerType: 'touch' });
  const dialog = await screen.findByRole('dialog', { name: '语法解读' });
  await waitFor(() => expect(within(dialog).getByText('想一直记得')).toBeVisible());
  expect(engine.playing).toBe(false); expect(engine.position).toBe(originalPosition);
  await userEvent.click(within(dialog).getByRole('button', { name: '围绕这句追问' }));
  await userEvent.click(within(dialog).getByRole('button', { name: '这句的动词是怎么变化的？' }));
  await waitFor(() => expect(within(dialog).getByText('不是过去式。')).toBeVisible());
  const request = JSON.parse(String(mock.mock.calls[1][1]?.body));
  expect(request.messages.at(-1).content).toBe('这句的动词是怎么变化的？');
  await userEvent.click(within(dialog).getByRole('button', { name: '关闭语法解读' }));
  await within(dialog).findByText('想一直记得');
  await userEvent.click(within(dialog).getByRole('button', { name: '关闭语法解读' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: '语法解读' })).toBeNull());
  expect(engine.position).toBe(originalPosition); expect(engine.playing).toBe(false);
  ui.unmount(); controller.dispose();
});
it('moving a finger cancels long press and the accessible entry opens the current selection', async () => {
  const engine = new TestEngine(), controller = new LoopController(engine);
  await controller.load('fixture'); controller.setLyrics(lyrics); await controller.select(1, 1, false);
  const ui = render(<App controller={controller} autoLoad={false} view="practice" />);
  const row = screen.getByRole('button', { name: '第 2 句 いつまでも覚えていたい' });
  fireEvent.pointerDown(row, { pointerType: 'touch', clientX: 10, clientY: 10 });
  fireEvent.pointerMove(row, { pointerType: 'touch', clientX: 10, clientY: 40 });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 550)); });
  expect(screen.queryByRole('dialog', { name: '语法解读' })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: '解读本句' }));
  expect(await screen.findByRole('dialog', { name: '语法解读' })).toBeVisible();
  ui.unmount(); controller.dispose();
});
it('rejects service authentication errors without exposing provider responses or the key', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"error":"test-secret"}', { status: 401 }));
  await expect(grammarRequest(config, '一句', [], new AbortController().signal)).rejects.toThrow('HTTP 401');
  try { await grammarRequest(config, '一句', [], new AbortController().signal); } catch (error) { expect(String(error)).not.toContain('test-secret'); }
});
it('aborts a pending request when asked to stop', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  }));
  const abort = new AbortController();
  const pending = grammarRequest(config, '一句', [], abort.signal);
  abort.abort();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
});
