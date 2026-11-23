import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextCursor, fetchNew, PREKLOP_MS } from '../../static/js/inkrement.js';

test('kursor: po primljeno (15 s preklopa), bez kolone po created_at (15 min), ne ide unazad', () => {
  const c = nextCursor([{ created_at: '2026-11-23T07:00:00Z', primljeno: '2026-11-23T08:00:00Z' }]);
  assert.deepEqual(c, { kolona: 'primljeno', v: new Date(Date.parse('2026-11-23T08:00:00Z') - PREKLOP_MS.primljeno).toISOString() });
  assert.equal(nextCursor([], c), c);
  const r = nextCursor([{ created_at: '2026-11-23T07:30:00Z' }]);
  assert.deepEqual(r, { kolona: 'created_at', v: '2026-11-23T07:15:00.000Z' });
  assert.equal(nextCursor([{ created_at: '2026-11-23T07:20:00Z' }], r), r);
});

// Lažni upit koji bilježi pozive (kao supabase-js builder).
function fakeBase(rows, { noRecv = false } = {}) {
  const calls = [];
  const base = () => {
    const st = { gt: null, order: [], limit: null, range: null };
    const b = {
      gt(k, v) { st.gt = [k, v]; return b; },
      order(k, o) { st.order.push([k, o.ascending]); return b; },
      limit(n) { st.limit = n; return b; },
      range(a, z) { st.range = [a, z]; return b; },
      then(res, rej) {
        calls.push(st);
        if (noRecv && (st.gt?.[0] === 'primljeno')) return Promise.resolve({ data: null, error: { code: '42703', message: 'column primljeno does not exist' } }).then(res, rej);
        let out = rows.filter((r) => !st.gt || String(r[st.gt[0]]) > st.gt[1]);
        const [k, asc] = st.order[0] || ['id', true];
        out = out.sort((x, y) => String(x[k]).localeCompare(String(y[k])) * (asc ? 1 : -1));
        if (st.limit) out = out.slice(0, st.limit);
        if (st.range) out = out.slice(st.range[0], st.range[1] + 1);
        return Promise.resolve({ data: out, error: null }).then(res, rej);
      },
    };
    return b;
  };
  return { base, calls };
}

const msgs = Array.from({ length: 500 }, (_, i) => ({ id: `m${String(i).padStart(4, '0')}`, created_at: new Date(Date.UTC(2026, 0, 1) + i * 60000).toISOString(),
  primljeno: new Date(Date.UTC(2026, 0, 1) + i * 60000).toISOString() }));

test('bez kursora: zadnjih N (najnovije), ne najstarijih N — poslije 300 poruka nove se vide', async () => {
  const { base } = fakeBase(msgs);
  const rows = await fetchNew(base, null, { initial: 300 });
  assert.equal(rows.length, 300);
  assert.equal(rows.at(-1).id, 'm0499');
  assert.equal(rows[0].id, 'm0200');
});

test('sa kursorom: samo novi redovi, po stranicama', async () => {
  const { base, calls } = fakeBase(msgs);
  const rows = await fetchNew(base, { kolona: 'primljeno', v: msgs[449].primljeno }, { size: 20 });
  assert.equal(rows.length, 50);
  assert.equal(calls.length, 3);
});

test('bez kolone primljeno (migracija nije pokrenuta): isti kursor po created_at', async () => {
  const { base, calls } = fakeBase(msgs, { noRecv: true });
  const rows = await fetchNew(base, { kolona: 'primljeno', v: msgs[489].primljeno });
  assert.equal(rows.length, 10);
  assert.equal(calls.at(-1).gt[0], 'created_at');
});
