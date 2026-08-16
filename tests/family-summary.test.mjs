import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFamilySummary } from '../src/lib/family-summary.js';

const people = [
  { id: 'child', fullName: 'Bali Singh Hayre' },
  { id: 'mother', fullName: 'Swarn Kaur Hayre' },
  { id: 'father', fullName: 'Karam Singh Hayre' },
  { id: 'other-parent', fullName: 'Alex Hayre' },
  { id: 'stepfather', fullName: 'Darshan Singh Hayre' },
  { id: 'sibling', fullName: 'Surinder Kaur Hayre' },
  { id: 'explicit-sibling', fullName: 'Family Friend', gender: 'female' },
  { id: 'partner', fullName: 'Partner Kaur Grewal' },
  { id: 'first-child', fullName: 'First Singh Hayre' },
  { id: 'second-child', fullName: 'Second Kaur Hayre' }
];

const relationships = [
  { type: 'parent_child', personAId: 'mother', personBId: 'child' },
  { type: 'parent_child', personAId: 'father', personBId: 'child' },
  { type: 'parent_child', personAId: 'other-parent', personBId: 'child' },
  { type: 'partner', personAId: 'mother', personBId: 'stepfather' },
  { type: 'parent_child', personAId: 'mother', personBId: 'sibling' },
  { type: 'parent_child', personAId: 'father', personBId: 'sibling' },
  { type: 'sibling', personAId: 'child', personBId: 'explicit-sibling' },
  { type: 'sibling', personAId: 'explicit-sibling', personBId: 'child' },
  { type: 'partner', personAId: 'partner', personBId: 'child' },
  { type: 'parent_child', personAId: 'child', personBId: 'first-child' },
  { type: 'parent_child', personAId: 'child', personBId: 'second-child' },
  { type: 'parent_child', personAId: 'child', personBId: 'second-child' }
];

test('groups every parent as mother, father or other parent', () => {
  const summary = buildFamilySummary(people, relationships, 'child');
  assert.deepEqual(summary.mothers.map(person => person.id), ['mother']);
  assert.deepEqual(summary.fathers.map(person => person.id), ['father']);
  assert.deepEqual(summary.otherParents.map(person => person.id), ['other-parent']);
  assert.equal(summary.parents.some(person => person.id === 'stepfather'), false);
});

test('combines explicit and shared-parent siblings without duplicates', () => {
  const summary = buildFamilySummary(people, relationships, 'child');
  assert.deepEqual(summary.siblings.map(person => person.id), ['explicit-sibling', 'sibling']);
});

test('returns the complete, deduplicated child and partner lists', () => {
  const summary = buildFamilySummary(people, relationships, 'child');
  assert.deepEqual(summary.children.map(person => person.id), ['first-child', 'second-child']);
  assert.deepEqual(summary.partners.map(person => person.id), ['partner']);
});

test('recomputes children when relationships change', () => {
  const before = buildFamilySummary(people, relationships.slice(0, -3), 'child');
  const after = buildFamilySummary(people, relationships, 'child');
  assert.equal(before.children.length, 0);
  assert.equal(after.children.length, 2);
});
