import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { adminRetryDelay, availableStudentColumns, buildReport, canUseStudentSegment, daysRemaining, filterEmployees, filterStudents, lastActivity, studentDataAvailability, toCsv, workforceColumns, studentColumns } from '../../utils/client/adminDashboard.mjs';

const now = new Date('2026-10-09T12:00:00Z');
const staff = [
  { id: 'a', full_name: 'Asha', status: 'ACTIVE', department: 'Engineering', contract_end_date: '2026-10-08T00:00:00.000Z' },
  { id: 'b', full_name: 'Dev', status: 'EXTENDED', department: 'Engineering', contract_end_date: '2026-10-19', designation: 'Developer' },
  { id: 'c', full_name: 'Meera', status: 'COMPLETED', department: 'Design', contract_end_date: '2026-10-01' },
  { id: 'd', full_name: 'No date', status: 'ACTIVE', department: 'Design' },
];

test('calendar deadline classification excludes invalid dates and distinguishes expired from upcoming', () => {
  assert.equal(daysRemaining('2026-10-09T18:00:00Z', now), 0);
  assert.equal(daysRemaining('2026-02-30', now), null);
  assert.equal(daysRemaining(null, now), null);
  assert.deepEqual(filterEmployees(staff, { status: 'OVERDUE', now }).map(item => item.id), ['a']);
  assert.deepEqual(filterEmployees(staff, { status: 'EXPIRING', now }).map(item => item.id), ['b']);
});

test('workforce combines search, department and status, sorts missing dates last without mutating records', () => {
  assert.deepEqual(filterEmployees(staff, { search: 'developer', department: 'Engineering', status: 'EXTENDED', now }).map(item => item.id), ['b']);
  assert.deepEqual(filterEmployees(staff, { department: 'Design', status: 'ACTIVE', now }).map(item => item.id), ['d']);
  assert.deepEqual(filterEmployees(staff, { sort: 'contract', now }).map(item => item.id), ['c', 'a', 'b', 'd']);
  assert.deepEqual(staff.map(item => item.id), ['a', 'b', 'c', 'd']);
});

test('student inactivity uses last known learning activity and never invents inactivity for missing timestamps', () => {
  const users = [
    { uid: 'a', name: 'Active', lastSignInTime: '2026-09-01', progress: [{ updatedAt: '2026-10-08', completedNodeIds: ['a', 'a'] }] },
    { uid: 'b', name: 'Inactive', lastSignInTime: '2026-10-01', progress: [] },
    { uid: 'c', name: 'Unknown', progress: [] },
  ];
  assert.equal(lastActivity(users[0]), Date.parse('2026-10-08'));
  assert.deepEqual(filterStudents(users, { segment: 'inactive', now }).map(item => item.uid), ['b']);
  assert.deepEqual(filterStudents(users, { segment: 'learning', now }).map(item => item.uid), ['a']);
  assert.deepEqual(filterStudents(users, { segment: 'not-started', search: 'unknown', now }).map(item => item.uid), ['c']);
});

test('report includes UTC boundary dates, fills zero days, and excludes missing and future records', () => {
  const report = buildReport([
    { createdAt: '2026-10-02T23:59:59Z' }, { createdAt: '2026-10-03T00:00:00Z' },
    { createdAt: '2026-10-09T12:00:00Z' }, { createdAt: '2026-10-09T13:00:00Z' },
    { createdAt: 'invalid' }, {},
  ], [{ createdAt: '2026-10-04T00:00:00Z' }], 7, now);
  assert.equal(report.start, '2026-10-03');
  assert.equal(report.end, '2026-10-09');
  assert.equal(report.buckets.length, 7);
  assert.equal(report.students, 2);
  assert.equal(report.certificates, 1);
  assert.equal(report.buckets[2].students, 0);
  assert.equal(buildReport([], [], 90, now).buckets.length, 90);
});

test('CSV neutralizes formulas with whitespace and controls, escapes quotes, and preserves multiline cells', () => {
  const rows = ['=1+1', ' +SUM(A1)', '\t@cmd', '\r\n-2', 'Normal, "quoted"\nname'].map(value => ({ value }));
  const csv = toCsv([{ label: 'Name', value: row => row.value }], rows);
  assert.ok(csv.startsWith('\uFEFF"Name"\r\n'));
  assert.ok(csv.includes('"\'=1+1"'));
  assert.ok(csv.includes('"\' +SUM(A1)"'));
  assert.ok(csv.includes('"\'\t@cmd"'));
  assert.ok(csv.includes('"Normal, ""quoted""\nname"'));
});

test('exports allow only intended fields and exclude employee secrets and student raw data', () => {
  const employee = { full_name: 'Asha', credentials_data: 'PRIVATE', encrypted_credentials: 'PRIVATE', phone: 'PRIVATE', address: 'PRIVATE' };
  assert.ok(!toCsv(workforceColumns, [employee]).includes('PRIVATE'));
  const student = { name: 'Asha', sentEmailHistory: ['PRIVATE'], examOutcomes: ['PRIVATE'], progress: [{ completedNodeIds: ['a', 'a', 'b'] }] };
  const csv = toCsv(studentColumns, [student]);
  assert.ok(!csv.includes('PRIVATE'));
  assert.ok(csv.includes('"2"'));
});

test('partial sources disable dependent segments and export unknown values instead of zero', () => {
  const available = studentDataAvailability({ dataAvailability: { progress: false, subscriptions: false } }, true);
  assert.equal(canUseStudentSegment('not-started', available), false);
  assert.equal(canUseStudentSegment('inactive', available), false);
  assert.equal(canUseStudentSegment('unsubscribed', available), false);
  assert.equal(canUseStudentSegment('all', available), true);
  const columns = availableStudentColumns(available);
  assert.equal(columns.find(column => column.label === 'Completed topics').value({}), 'Unavailable');
  assert.equal(columns.find(column => column.label === 'Email preference').value({}), 'Unavailable');
  assert.equal(studentDataAvailability({ dataAvailability: { users: false, certificates: true } }, true).certificates, false);
  assert.equal(studentDataAvailability(null, false).students, false);
});

test('overview metric filters include exactly active or actionable workforce records', () => {
  assert.deepEqual(filterEmployees(staff, { status: 'ACTIVE_TEAM', now }).map(item => item.id), ['a', 'b', 'd']);
  assert.deepEqual(filterEmployees(staff, { status: 'ATTENTION', now }).map(item => item.id), ['a', 'b']);
});

test('rate-limit delay respects seconds, HTTP dates, body delays and a safe default', () => {
  const response = value => ({ headers: new Headers(value ? { 'Retry-After': value } : {}) });
  assert.equal(adminRetryDelay(response('120'), {}), 120_000);
  assert.equal(adminRetryDelay(response('invalid'), { error: { retryAfterMs: 180_000 } }), 180_000);
  assert.equal(adminRetryDelay(response(new Date(now.getTime() + 90_000).toUTCString()), {}, now.getTime()), 90_000);
  assert.equal(adminRetryDelay(response(null), {}), 60_000);
});

const hookSource = (await readFile(new URL('../../app/dashboard/console/admin/useAdminOverview.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '').replace('export default function', 'function');

function overviewHarness(fetcher) {
  let time = now.getTime(), cursor = 0, firstRender = true, syncListener;
  const slots = [], effects = [], timers = new Map(), intervals = new Map();
  let nextTimer = 0;
  const hook = vm.runInNewContext(`${hookSource}; useAdminOverview`, {
    Date: class extends Date { static now() { return time; } },
    AbortController, AbortSignal, adminRetryDelay,
    fetch: fetcher,
    useState: initial => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef: initial => { const index = cursor++; return slots[index] ||= { current: initial }; },
    useCallback: callback => callback,
    useEffect: effect => { if (firstRender) effects.push(effect); },
    subscribeDataSync: listener => { syncListener = listener; return () => { syncListener = null; }; },
    window: {
      setTimeout: (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, at: time + delay }); return id; },
      clearTimeout: id => timers.delete(id),
      setInterval: callback => { const id = ++nextTimer; intervals.set(id, callback); return id; },
      clearInterval: id => intervals.delete(id),
    },
  });
  const user = { getIdToken: async () => 'synthetic-token' };
  return {
    render: () => { cursor = 0; const state = hook(user); firstRender = false; return state; },
    mount: () => effects.map(effect => effect()),
    sync: () => syncListener?.({ tag: 'admin:workforce' }),
    advance: async ms => {
      time += ms;
      for (const [id, timer] of [...timers]) if (timer.at <= time) { timers.delete(id); timer.callback(); }
      for (const callback of intervals.values()) callback();
      await new Promise(resolve => setImmediate(resolve));
    },
  };
}

const successfulOverviewResponse = () => ({ ok: true, json: async () => ({ success: true, employees: [{ id: 'one' }], milestones: [], users: [], pagination: { has_more: true, next_page_token: 'one' } }) });

test('overview collapses concurrent refreshes and sync bursts, paces reloads, and cleans up timers', async () => {
  let calls = 0;
  const app = overviewHarness(async () => { calls++; return successfulOverviewResponse(); });
  app.render();
  const cleanup = app.mount();
  await app.advance(0);
  assert.equal(calls, 3);
  await Promise.all([app.render().refresh(), app.render().refresh()]);
  app.sync(); app.sync(); app.sync();
  await app.advance(500);
  assert.equal(calls, 3);
  await app.advance(14_500);
  assert.equal(calls, 6);
  app.sync();
  cleanup.forEach(dispose => dispose());
  await app.advance(60_000);
  assert.equal(calls, 6);
});

test('overview respects a 429 cooldown without automatically retrying or loading more', async () => {
  let calls = 0;
  const app = overviewHarness(async () => {
    calls++;
    return calls === 3 ? { ok: false, status: 429, headers: new Headers({ 'Retry-After': '120' }), json: async () => ({}) } : successfulOverviewResponse();
  });
  app.render();
  const cleanup = app.mount();
  await app.advance(0);
  assert.equal(calls, 3);
  await app.advance(60_000);
  await app.render().refresh();
  await app.render().loadMore();
  assert.equal(calls, 3);
  assert.equal(app.render().retryWait, 60);
  await app.advance(60_000);
  assert.equal(calls, 3);
  await Promise.all([app.render().refresh(), app.render().refresh()]);
  assert.equal(calls, 6);
  cleanup.forEach(dispose => dispose());
});

test('expired admin sessions clear the previously loaded private snapshot', async () => {
  let expired = false;
  const app = overviewHarness(async () => expired ? { ok: false, status: 403, json: async () => ({}) } : successfulOverviewResponse());
  app.render();
  const cleanup = app.mount();
  await app.advance(0);
  assert.equal(app.render().data.employees.length, 1);
  expired = true;
  await app.advance(15_000);
  await app.render().refresh();
  assert.equal(app.render().data.employees.length, 0);
  assert.ok(app.render().data.errors.session);
  cleanup.forEach(dispose => dispose());
});
