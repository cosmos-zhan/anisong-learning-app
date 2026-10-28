import { afterEach, expect, it, vi } from 'vitest';
const transport = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true }, CapacitorHttp: transport }));
import { grammarRequest } from '../packages/core/grammar';
const config = { endpoint: 'https://model.example/v1/chat/completions', model: 'test-model', key: 'test-secret' };
afterEach(() => transport.request.mockReset());
it('Android sends a native HTTPS request with redirects disabled and receives the model response', async () => {
  transport.request.mockResolvedValue({ status: 200, data: { choices: [{ message: { content: '分析结果' } }] } });
  await expect(grammarRequest(config, '一句', [], new AbortController().signal)).resolves.toBe('分析结果');
  expect(transport.request).toHaveBeenCalledWith(expect.objectContaining({ url: config.endpoint, method: 'POST', disableRedirects: true, headers: expect.objectContaining({ Authorization: 'Bearer test-secret' }) }));
});
it('Android stop ignores a late native response', async () => {
  let complete!: (value: unknown) => void;
  transport.request.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
  const controller = new AbortController();
  const request = grammarRequest(config, '一句', [], controller.signal);
  controller.abort();
  await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  complete({ status: 200, data: { choices: [{ message: { content: 'late' } }] } });
});
