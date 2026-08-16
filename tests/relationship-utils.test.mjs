import test from 'node:test';
import assert from 'node:assert/strict';
import { hasAncestorPath, relationshipWarnings } from '../src/lib/relationship-utils.js';

test('detects ancestry paths without confusing spouses or siblings', () => {
  const relationships = [
    { type: 'parent_child', personAId: 'grandparent', personBId: 'parent' },
    { type: 'parent_child', personAId: 'parent', personBId: 'child' },
    { type: 'partner', personAId: 'parent', personBId: 'partner' },
    { type: 'sibling', personAId: 'parent', personBId: 'uncle' }
  ];
  assert.equal(hasAncestorPath(relationships, 'grandparent', 'child'), true);
  assert.equal(hasAncestorPath(relationships, 'partner', 'child'), false);
  assert.equal(hasAncestorPath(relationships, 'uncle', 'child'), false);
});

test('warns about suspicious ages and additional parents without blocking valid blended families', () => {
  const warnings = relationshipWarnings({
    anchor: { fullName: 'Child', dateOfBirth: '2000-01-01' },
    relative: { fullName: 'Parent', dateOfBirth: '1992-01-01' },
    relationship: 'parent',
    existingParents: [{}, {}]
  });
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /less than 12 years/);
  assert.match(warnings[1], /already has 2 parents/);
});
