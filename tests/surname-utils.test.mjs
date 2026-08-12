import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAutomaticNames } from '../src/lib/surname-utils.js';

const people = [
  { id: 'root-man', fullName: 'Karam Singh Hayre' },
  { id: 'root-woman', fullName: 'Swarn Kaur Hayre' },
  { id: 'daughter', fullName: 'Gurpreet Kaur' },
  { id: 'husband', fullName: 'Shivdev Singh Grewal' },
  { id: 'son', fullName: 'Amanjot Singh' },
  { id: 'granddaughter', fullName: 'Usher Kaur' },
  { id: 'stored-fallback', fullName: 'Harjoot Singh Gill' }
];

const relationships = [
  { type: 'partner', personAId: 'root-man', personBId: 'root-woman' },
  { type: 'parent_child', personAId: 'root-man', personBId: 'daughter' },
  { type: 'parent_child', personAId: 'root-woman', personBId: 'daughter' },
  { type: 'partner', personAId: 'daughter', personBId: 'husband' },
  { type: 'parent_child', personAId: 'daughter', personBId: 'son' },
  { type: 'parent_child', personAId: 'son', personBId: 'granddaughter' }
];

test('women use their husband surname while men keep their father or stored surname', () => {
  const names = buildAutomaticNames(people, relationships, 'Hayre');
  assert.equal(names.get('root-woman').fullName, 'Swarn Kaur Hayre');
  assert.equal(names.get('daughter').fullName, 'Gurpreet Kaur Grewal');
  assert.equal(names.get('husband').fullName, 'Shivdev Singh Grewal');
});

test('surname inheritance cascades through connected generations', () => {
  const names = buildAutomaticNames(people, relationships, 'Hayre');
  assert.equal(names.get('son').fullName, 'Amanjot Singh Grewal');
  assert.equal(names.get('granddaughter').fullName, 'Usher Kaur Grewal');
});

test('stored external surnames remain when a father or husband is not connected', () => {
  const names = buildAutomaticNames(people, relationships, 'Hayre');
  assert.equal(names.get('stored-fallback').fullName, 'Harjoot Singh Gill');
});

test('unconnected roots default to the Hayre family surname', () => {
  const names = buildAutomaticNames([{ id: 'root', fullName: 'New Singh' }], [], 'Hayre');
  assert.equal(names.get('root').fullName, 'New Singh Hayre');
});

test('a saved surname remains authoritative when family relationships suggest another default', () => {
  const names = buildAutomaticNames([
    { id: 'husband', fullName: 'Dev Singh Grewal' },
    { id: 'wife', fullName: 'Mina Kaur Dhillon' }
  ], [
    { type: 'partner', personAId: 'husband', personBId: 'wife' }
  ], 'Hayre');

  assert.equal(names.get('wife').fullName, 'Mina Kaur Dhillon');
  assert.equal(names.get('wife').surnameSource, 'Saved surname');
});
