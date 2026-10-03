import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const roadmapDir = path.join(process.cwd(), 'public/data/roadmaps');
const catalog = fs.readdirSync(roadmapDir).filter(name => name.endsWith('.json'))
  .map(name => ({ name, roadmap: JSON.parse(fs.readFileSync(path.join(roadmapDir, name), 'utf8')) }));

function visitResources(value, visit) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value.resources)) value.resources.forEach(resource => visit(resource, value));
  for (const [key, child] of Object.entries(value)) {
    if (key !== 'resources') visitResources(child, visit);
  }
}

test('roadmap resource links have one HTTPS destination and reject reserved placeholder hosts', () => {
  let checked = 0;
  for (const { name, roadmap } of catalog) {
    visitResources(roadmap, resource => {
      if (!resource.url || resource.url.startsWith('/')) return;
      checked++;
      const context = `${name}: ${resource.title}`;
      assert.equal(/\s/.test(resource.url), false, `${context}: URL contains whitespace or combined links`);
      const url = new URL(resource.url);
      assert.equal(url.protocol, 'https:', `${context}: external links must use HTTPS`);
      assert.equal(/^(?:www\.)?example\.(?:com|org|net)$/i.test(url.hostname), false, `${context}: placeholder host`);
      assert.equal(url.username, '', `${context}: embedded credentials`);
      assert.equal(url.password, '', `${context}: embedded credentials`);
      assert.equal((`${url.origin}${url.pathname}`.match(/https?:\/\//g) || []).length, 1, `${context}: combined destinations`);
    });
  }
  assert.ok(checked > 5000);
});

test('catalog recommendations exclude retired credential exams and verify reviewed credential metadata', () => {
  const retired = /AWS Certified Machine Learning\s*[-–]\s*Specialty|TensorFlow Developer Certificate|Google Associate Android Developer|Google Technical Writing Certified Credential/;
  for (const { name, roadmap } of catalog) {
    assert.ok(roadmap.boost.certifications.length >= 2, name);
    assert.equal(retired.test(roadmap.boost.certifications.join('\n')), false, name);
    assert.equal(new Set(roadmap.boost.certifications).size, roadmap.boost.certifications.length, `${name}: duplicate credential`);
    for (const detail of roadmap.boost.certification_details || []) {
      assert.ok(roadmap.boost.certifications.includes(detail.name), `${name}: metadata must refer to a displayed credential`);
      assert.equal(new URL(detail.official_url).protocol, 'https:', name);
      assert.ok(['professional_certification', 'course_certificate'].includes(detail.type), name);
      assert.match(detail.checked_on, /^\d{4}-\d{2}-\d{2}$/, name);
      assert.ok(detail.note, `${name}: explain credential scope and prerequisites`);
    }
  }
});

test('Docker fundamentals and release planning do not offer the unrelated cybersecurity survey course', () => {
  for (const { name, roadmap } of catalog.filter(entry => ['devops_cloud.json', 'release_engineer.json'].includes(entry.name))) {
    visitResources(roadmap, (resource, node) => {
      if (!/docker fundamentals|release planning|foundations of release/i.test(node.name || '')) return;
      assert.notEqual(resource.url, 'https://www.youtube.com/watch?v=U_P23SqJaDc', `${name}: ${node.name}`);
    });
  }
});
