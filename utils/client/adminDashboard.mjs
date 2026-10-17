const DAY = 86_400_000;
export const ACTIVE_EMPLOYEE_STATUSES = ['ACTIVE', 'EXTENDED'];
export const EMPLOYEE_FILTERS = ['ALL', 'ACTIVE_TEAM', 'ATTENTION', 'ACTIVE', 'OFFER_SENT', 'EXTENDED', 'EXPIRING', 'OVERDUE', 'DISPATCH_FAILED', 'COMPLETED', 'TERMINATED', 'ARCHIVED'];

export function timestamp(value) {
  if (!value) return null;
  const result = new Date(value).getTime();
  return Number.isFinite(result) ? result : null;
}

export function daysRemaining(value, now = new Date()) {
  const date = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const end = timestamp(`${date}T00:00:00Z`);
  if (end === null || new Date(end).toISOString().slice(0, 10) !== date) return null;
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((end - today) / DAY);
}

export function isContractAttention(employee, now) {
  const days = daysRemaining(employee.contract_end_date, now);
  return ACTIVE_EMPLOYEE_STATUSES.includes(employee.status) && days !== null && days <= 10;
}

export function filterEmployees(employees, { search = '', status = 'ALL', department = 'ALL', sort = 'name', now = new Date() } = {}) {
  const query = search.trim().toLowerCase();
  return employees.filter(employee => {
    const days = daysRemaining(employee.contract_end_date, now);
    const statusMatch = status === 'ALL' || (status === 'ACTIVE_TEAM' ? ACTIVE_EMPLOYEE_STATUSES.includes(employee.status) : status === 'ATTENTION' ? isContractAttention(employee, now) : status === 'EXPIRING'
      ? isContractAttention(employee, now) && days >= 0
      : status === 'OVERDUE' ? isContractAttention(employee, now) && days < 0 : employee.status === status);
    return statusMatch && (department === 'ALL' || employee.department === department) &&
      (!query || [employee.full_name, employee.personal_email, employee.designation, employee.department].some(value => String(value || '').toLowerCase().includes(query)));
  }).sort((a, b) => {
    if (sort === 'contract') return (daysRemaining(a.contract_end_date, now) ?? Infinity) - (daysRemaining(b.contract_end_date, now) ?? Infinity) || String(a.full_name || '').localeCompare(b.full_name || '');
    if (sort === 'newest') return (timestamp(b.created_at) || 0) - (timestamp(a.created_at) || 0);
    return String(a.full_name || '').localeCompare(b.full_name || '');
  });
}

export function completedTopics(user) {
  return (user.progress || []).reduce((sum, item) => sum + new Set(item.completedNodeIds || []).size, 0);
}

export function lastActivity(user) {
  const times = [user.lastSignInTime, ...(user.progress || []).map(item => item.updatedAt)].map(timestamp).filter(value => value !== null);
  return times.length ? Math.max(...times) : null;
}

export function matchesStudentSegment(user, segment, now = new Date()) {
  if (segment === 'learning') return completedTopics(user) > 0;
  if (segment === 'not-started') return completedTopics(user) === 0;
  if (segment === 'certified') return (user.certificates || []).length > 0;
  if (segment === 'unsubscribed') return Boolean(user.isUnsubscribed);
  if (segment === 'inactive') { const time = lastActivity(user); return time !== null && now.getTime() - time >= 7 * DAY; }
  return true;
}

export function filterStudents(users, { search = '', segment = 'all', sort = 'newest', now = new Date() } = {}) {
  const query = search.trim().toLowerCase();
  return users.filter(user => matchesStudentSegment(user, segment, now) && (!query ||
    [user.name, user.email, user.degree, user.interest].some(value => String(value || '').toLowerCase().includes(query))))
    .sort((a, b) => sort === 'name' ? String(a.name || '').localeCompare(b.name || '') : sort === 'progress' ? completedTopics(b) - completedTopics(a) : (timestamp(b.createdAt) || 0) - (timestamp(a.createdAt) || 0));
}

export function studentDataAvailability(analytics, loaded) {
  const sources = analytics?.dataAvailability;
  const students = Boolean(loaded && sources?.auth !== false && sources?.users !== false);
  return {
    students,
    certificates: students && sources?.certificates !== false,
    progress: students && sources?.progress !== false,
    subscriptions: students && sources?.subscriptions !== false,
  };
}

export function canUseStudentSegment(segment, available) {
  if (['learning', 'not-started', 'inactive'].includes(segment)) return available.progress;
  if (segment === 'certified') return available.certificates;
  if (segment === 'unsubscribed') return available.subscriptions;
  return true;
}

export function adminRetryDelay(response, body, now = Date.now()) {
  const header = response.headers.get('Retry-After');
  const headerMs = header === null ? 0 : /^\d+(\.\d+)?$/.test(header.trim()) ? Number(header) * 1000 : Date.parse(header) - now;
  const bodyMs = Number(body?.error?.retryAfterMs || body?.retryAfterMs || 0);
  return Math.max(60_000, Number.isFinite(headerMs) ? headerMs : 0, Number.isFinite(bodyMs) ? bodyMs : 0);
}

// Reporting uses UTC days so exports and chart labels describe the same interval.
export function buildReport(users, certificates, days = 30, now = new Date()) {
  const count = [7, 30, 90].includes(Number(days)) ? Number(days) : 30;
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + DAY;
  const start = end - count * DAY;
  const buckets = Array.from({ length: count }, (_, i) => ({ date: new Date(start + i * DAY).toISOString().slice(0, 10), students: 0, certificates: 0 }));
  const add = (items, key) => items.forEach(item => {
    const time = timestamp(item.createdAt);
    if (time !== null && time >= start && time < end && time <= now.getTime()) buckets[Math.floor((time - start) / DAY)][key]++;
  });
  add(users, 'students'); add(certificates, 'certificates');
  return { buckets, start: buckets[0].date, end: buckets.at(-1).date, students: buckets.reduce((sum, day) => sum + day.students, 0), certificates: buckets.reduce((sum, day) => sum + day.certificates, 0) };
}

export function toCsv(columns, rows) {
  const cell = value => {
    let text = String(value ?? '');
    if (/^[\s\u0000-\u001f]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return '\uFEFF' + [columns.map(column => cell(column.label)).join(','), ...rows.map(row => columns.map(column => cell(column.value(row))).join(','))].join('\r\n');
}

export function downloadCsv(filename, columns, rows) {
  const url = URL.createObjectURL(new Blob([toCsv(columns, rows)], { type: 'text/csv;charset=utf-8;' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const workforceColumns = [
  { label: 'Name', value: row => row.full_name }, { label: 'Email', value: row => row.personal_email },
  { label: 'Department', value: row => row.department }, { label: 'Designation', value: row => row.designation },
  { label: 'Status', value: row => row.status }, { label: 'Contract end', value: row => String(row.contract_end_date || '').slice(0, 10) },
];
export const studentColumns = [
  { label: 'Name', value: row => row.name }, { label: 'Email', value: row => row.email },
  { label: 'Degree', value: row => row.degree }, { label: 'Interest', value: row => row.interest },
  { label: 'Completed topics', value: completedTopics }, { label: 'Certificate records', value: row => (row.certificates || []).length },
  { label: 'Joined', value: row => row.createdAt }, { label: 'Email preference', value: row => row.isUnsubscribed ? 'Unsubscribed' : 'Subscribed' },
];

export function availableStudentColumns(available) {
  const requirements = { 'Completed topics': 'progress', 'Certificate records': 'certificates', 'Email preference': 'subscriptions' };
  return studentColumns.map(column => requirements[column.label] && !available[requirements[column.label]]
    ? { ...column, value: () => 'Unavailable' }
    : column);
}
