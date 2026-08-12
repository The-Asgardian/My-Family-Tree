import test from 'node:test';
import assert from 'node:assert/strict';
import {
  comparePeopleByAge,
  composeFullName,
  formatDate,
  parseDateInput,
  structuredNameFor
} from '../src/lib/person-utils.js';

test('dates convert between display and database formats', () => {
  assert.equal(formatDate('1951-03-10'), '10/03/1951');
  assert.equal(parseDateInput('10/03/1951'), '1951-03-10');
  assert.throws(() => parseDateInput('31/02/1951'), /valid date/);
  assert.throws(() => parseDateInput('1951-03-10'), /dd\/mm\/yyyy/);
});

test('gender composes the automatic Sikh middle name', () => {
  assert.equal(composeFullName('Gurjeevan', 'male', 'Hayre'), 'Gurjeevan Singh Hayre');
  assert.equal(composeFullName('Simran', 'female', 'Bains'), 'Simran Kaur Bains');
  assert.equal(composeFullName('Karam Singh', 'male', ''), 'Karam Singh');
});

test('legacy full names remain editable without a data rewrite', () => {
  assert.deepEqual(structuredNameFor({ fullName: 'Swarn Kaur Hayre' }), {
    firstName: 'Swarn', lastName: 'Hayre', gender: 'female', middleName: 'Kaur'
  });
  assert.deepEqual(structuredNameFor({ fullName: 'Gurdave Kaur (Debo)' }), {
    firstName: 'Gurdave (Debo)', lastName: '', gender: 'female', middleName: 'Kaur'
  });
});

test('siblings sort oldest to youngest with deterministic fallbacks', () => {
  const order = new Map([['unknown', 2], ['older', 1], ['younger', 0]]);
  const people = [
    { id: 'unknown' },
    { id: 'younger', dateOfBirth: '1961-12-25' },
    { id: 'older', dateOfBirth: '1951-10-10' },
    { id: 'oldest-estimate', estimatedAge: 90 }
  ];
  people.sort((a, b) => comparePeopleByAge(a, b, order));
  assert.deepEqual(people.map(person => person.id), ['oldest-estimate', 'older', 'younger', 'unknown']);
});
