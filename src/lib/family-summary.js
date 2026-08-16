import { structuredNameFor } from './person-utils.js';

function peopleForIds(ids, peopleById) {
  return [...new Set(ids)].map(id => peopleById.get(id)).filter(Boolean);
}

function parentRole(person) {
  const gender = String(person?.gender || structuredNameFor(person).gender || '').toLowerCase();
  if (gender === 'female') return 'mother';
  if (gender === 'male') return 'father';
  return 'parent';
}

export function buildFamilySummary(people = [], relationships = [], personId) {
  const peopleById = new Map(people.map(person => [person.id, person]));
  const parentIds = [];
  const childIds = [];
  const partnerIds = [];
  const siblingIds = [];

  for (const relationship of relationships) {
    if (relationship.type === 'parent_child') {
      if (relationship.personBId === personId) parentIds.push(relationship.personAId);
      if (relationship.personAId === personId) childIds.push(relationship.personBId);
    } else if (relationship.type === 'partner') {
      if (relationship.personAId === personId) partnerIds.push(relationship.personBId);
      else if (relationship.personBId === personId) partnerIds.push(relationship.personAId);
    } else if (relationship.type === 'sibling') {
      if (relationship.personAId === personId) siblingIds.push(relationship.personBId);
      else if (relationship.personBId === personId) siblingIds.push(relationship.personAId);
    }
  }

  const parentIdSet = new Set(parentIds);
  for (const relationship of relationships) {
    if (
      relationship.type === 'parent_child'
      && parentIdSet.has(relationship.personAId)
      && relationship.personBId !== personId
    ) siblingIds.push(relationship.personBId);
  }

  const parents = peopleForIds(parentIds, peopleById);
  return {
    parents,
    mothers: parents.filter(person => parentRole(person) === 'mother'),
    fathers: parents.filter(person => parentRole(person) === 'father'),
    otherParents: parents.filter(person => parentRole(person) === 'parent'),
    siblings: peopleForIds(siblingIds.filter(id => id !== personId), peopleById),
    partners: peopleForIds(partnerIds.filter(id => id !== personId), peopleById),
    children: peopleForIds(childIds.filter(id => id !== personId), peopleById)
  };
}
