import test from 'node:test';
import assert from 'node:assert/strict';
import { filterSkillCatalog, SPARROW_SKILLS } from '../src/skillCatalog';

test('ships with curated PDF skills from reusable community-style categories', () => {
  assert.ok(SPARROW_SKILLS.length >= 5);
  assert.ok(SPARROW_SKILLS.some((skill) => skill.tags.includes('research')));
  assert.ok(SPARROW_SKILLS.some((skill) => skill.tags.includes('redaction')));
});

test('filters skills by name, description, tag, and source', () => {
  assert.equal(filterSkillCatalog(SPARROW_SKILLS, 'research').some((skill) => skill.id === 'paper-research'), true);
  assert.equal(filterSkillCatalog(SPARROW_SKILLS, 'github').some((skill) => skill.source === 'community'), true);
});

test('skills disclose provenance and install only inside the Sparrow app scope', () => {
  for (const skill of SPARROW_SKILLS) {
    assert.ok(skill.author.trim(), `${skill.id} needs an author`);
    assert.ok(skill.license.trim(), `${skill.id} needs a license`);
    assert.ok(skill.homepageUrl || skill.repositoryUrl, `${skill.id} needs a source URL`);
    assert.equal(skill.installScope, 'sparrow-app-local');
    assert.doesNotMatch(skill.installPathHint, /\.codex|\.claude|agents\/skills/i);
  }
});
