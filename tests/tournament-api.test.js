const api = require('../js/tournament-api');

afterEach(() => {
  delete global.fetch;
});

test('reportScore：URL、headers、body 正確且回傳 JSON', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'pending' }) });
  const result = await api.reportScore('tok', 'match-1', 21, 15);
  expect(result).toEqual({ status: 'pending' });
  const [url, opts] = global.fetch.mock.calls[0];
  expect(url).toMatch(/\/rest\/v1\/rpc\/tournament_report_score$/);
  expect(opts.method).toBe('POST');
  expect(opts.headers['Content-Type']).toBe('application/json');
  expect(opts.headers.apikey).toBeTruthy();
  expect(opts.headers.Authorization).toMatch(/^Bearer /);
  expect(JSON.parse(opts.body)).toEqual({
    p_token: 'tok', p_match: 'match-1', p_score_self: 21, p_score_opp: 15,
  });
});

test('fetchPublicView / fetchCaptainView 呼叫對應 RPC 並帶 p_token', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => null });
  await api.fetchPublicView('pub');
  await api.fetchCaptainView('cap');
  expect(global.fetch.mock.calls[0][0]).toMatch(/tournament_public_view$/);
  expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ p_token: 'pub' });
  expect(global.fetch.mock.calls[1][0]).toMatch(/tournament_captain_view$/);
  expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({ p_token: 'cap' });
});

test('後端 4xx：丟出 body.message（繁中訊息直接可顯示）', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false, status: 400,
    json: async () => ({ message: '羽球比賽不會平手，請確認比分' }),
  });
  await expect(api.reportScore('tok', 'm', 21, 21)).rejects.toThrow('羽球比賽不會平手，請確認比分');
});

test('非 JSON 錯誤回應：顯示連線失敗與狀態碼', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false, status: 502,
    json: async () => { throw new Error('not json'); },
  });
  await expect(api.fetchPublicView('tok')).rejects.toThrow('連線失敗（502）');
});

test('fetch 本身失敗（離線／訊號差）：顯示中文提示而非瀏覽器原文錯誤', async () => {
  global.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));
  await expect(api.fetchPublicView('tok')).rejects.toThrow('網路不穩，請確認連線後再試一次');
});

test('fetchPublicView：payload 的 playersA / playersB 原樣透傳', async () => {
  const payload = {
    tournament: { name: '第三屆翰林匹克羽球運動會', heldOn: '2026-08-20', status: 'active' },
    teams: [{ id: 't1', name: '羽林萌主', players: [] }],
    matches: [{
      id: 'm1', roundNo: 1, courtNo: 2, event: '男雙',
      teamAId: 't1', teamBId: 't2',
      playersA: [{ name: '宏彬' }, { name: '彥呈' }],
      playersB: [{ name: 'Alan' }, { name: '威任' }],
      status: 'pending', scoreA: null, scoreB: null,
    }],
  };
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => payload });
  const view = await api.fetchPublicView('pub');
  expect(view.matches[0].playersA).toEqual([{ name: '宏彬' }, { name: '彥呈' }]);
  expect(view.matches[0].playersB).toEqual([{ name: 'Alan' }, { name: '威任' }]);
});
