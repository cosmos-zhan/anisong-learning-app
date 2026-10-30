import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GrammarPage } from '../apps/web/src/lyrics/GrammarPage';
import { saveGrammarSettings } from '../packages/core/grammar';

const config = { endpoint: 'https://model.example/v1/chat/completions', model: 'fixture', key: 'test-secret' };
const raw = JSON.stringify({ meaning: '解释', points: [{ title: '语法', explanation: '说明' }] });
const reply = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
const line = { start: 10, text: '当前句' };
const base = { line, lines: [{ start: 0, text: '前一句' }, line, { start: 20, text: '后一句' }], songId: 'song-a', songTitle: '歌名', index: 1, audioAvailable: true, onPlayLine: async () => {}, onStopLine: async () => {}, onClose: () => {} };
const oldKey = `anisong:grammar-history:song-a:10:${encodeURIComponent(line.text)}`;
beforeEach(() => { history.replaceState(null, '', '/#lyrics'); localStorage.clear(); saveGrammarSettings(config); vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network')); });
afterEach(() => vi.restoreAllMocks());

it('sends the actual request with interpretation, six complete recent turns and current question', async () => {
  const entries = Array.from({ length: 8 }, (_, i) => ({ question: `问题${i}`, answer: `回答${i}` }));
  localStorage.setItem(`${oldKey}:1`, JSON.stringify({ raw, entries }));
  const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply('新的回答'));
  render(<GrammarPage {...base} />);
  const dialog = screen.getByRole('dialog', { name: '语法解读' });
  fireEvent.click(within(dialog).getByRole('tab', { name: '本句追问 8' }));
  fireEvent.click(within(dialog).getByRole('button', { name: '隐藏历史' }));
  fireEvent.change(within(dialog).getByLabelText('对当前句子的追问'), { target: { value: '当前问题' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '发送' }));
  await within(dialog).findByText('新的回答');
  const messages = JSON.parse(String(fetcher.mock.calls[0][1]?.body)).messages;
  expect(messages[1].content).toContain('歌曲：歌名');
  expect(messages[1].content).toContain('前一句'); expect(messages[1].content).toContain('2（当前句）: 当前句'); expect(messages[1].content).toContain('后一句');
  expect(messages[2]).toEqual({ role: 'assistant', content: raw });
  expect(messages.slice(3)).toEqual([...entries.slice(-6).flatMap(e => [{ role: 'user', content: e.question }, { role: 'assistant', content: e.answer }]), { role: 'user', content: '当前问题' }]);
});

it('migrates unambiguous legacy history and separates songs and duplicate lines', async () => {
  localStorage.setItem(oldKey, JSON.stringify({ raw, entries: [{ question: '旧问题', answer: '旧回答' }] }));
  const ui = render(<GrammarPage {...base} />);
  fireEvent.click(screen.getByRole('tab', { name: '本句追问 1' })); expect(screen.getByText('旧回答')).toBeVisible();
  await waitFor(() => expect(localStorage.getItem(`${oldKey}:1`)).toContain('旧回答'));
  ui.unmount(); history.replaceState(null, '', '/#lyrics');
  const duplicateProps = { ...base, lines: [line, line], index: 0 };
  const mock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => reply(raw));
  const duplicate = render(<GrammarPage {...duplicateProps} />);
  await screen.findByText('解释'); expect(mock).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('tab', { name: '本句追问' })).toBeVisible();
  duplicate.unmount(); history.replaceState(null, '', '/#lyrics');
  render(<GrammarPage {...base} songId="song-b" />);
  await screen.findByText('解释'); expect(mock).toHaveBeenCalledTimes(2);
});

it('recovers the question after service failure or cancellation and keeps previous history', async () => {
  localStorage.setItem(`${oldKey}:1`, JSON.stringify({ raw, entries: [{ question: '之前的问题', answer: '之前的回答' }] }));
  const mock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('', { status: 429 })).mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))));
  render(<GrammarPage {...base} />);
  const dialog = screen.getByRole('dialog', { name: '语法解读' });
  fireEvent.click(within(dialog).getByRole('tab', { name: '本句追问 1' }));
  const input = within(dialog).getByLabelText('对当前句子的追问');
  fireEvent.change(input, { target: { value: '可重试的问题' } }); fireEvent.click(within(dialog).getByRole('button', { name: '发送' }));
  await within(dialog).findByText(/请求过于频繁/); expect(input).toHaveValue('可重试的问题'); expect(within(dialog).getByText('之前的回答')).toBeVisible();
  fireEvent.click(within(dialog).getByRole('button', { name: '发送' }));
  fireEvent.click(await within(dialog).findByRole('button', { name: '停止生成' }));
  expect(input).toHaveValue('可重试的问题'); expect(mock).toHaveBeenCalledTimes(2);
});

it('ignores malformed saved entries and reports storage failures without losing the current answer', async () => {
  localStorage.setItem(`${oldKey}:1`, JSON.stringify({ raw, entries: [null, { question: '有效问题', answer: '有效回答' }, { question: 'x'.repeat(1001), answer: '坏记录' }] }));
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError'); });
  render(<GrammarPage {...base} />);
  fireEvent.click(screen.getByRole('tab', { name: '本句追问 1' }));
  expect(screen.getByText('有效回答')).toBeVisible(); expect(screen.queryByText('坏记录')).toBeNull();
  expect(await screen.findByText(/本机存储不可用或空间不足/)).toBeVisible();
});
