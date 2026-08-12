import { composeFullName, structuredNameFor } from './person-utils.js';

function storedProfile(person) {
  const mappedFromDatabase = 'sourceFullName' in person
    || 'storedFirstName' in person
    || 'storedLastName' in person
    || 'storedGender' in person;
  return structuredNameFor(mappedFromDatabase ? {
    fullName: person.sourceFullName ?? person.fullName,
    firstName: person.storedFirstName,
    lastName: person.storedLastName,
    gender: person.storedGender
  } : person);
}

export function buildAutomaticNames(people, relationships, defaultSurname = 'Hayre') {
  const peopleById = new Map(people.map(person => [person.id, person]));
  const profiles = new Map(people.map(person => [person.id, storedProfile(person)]));
  const parents = new Map(people.map(person => [person.id, []]));
  const partners = new Map(people.map(person => [person.id, []]));

  for (const relationship of relationships) {
    if (relationship.type === 'parent_child') {
      if (parents.has(relationship.personBId) && peopleById.has(relationship.personAId)) {
        parents.get(relationship.personBId).push(relationship.personAId);
      }
    } else if (relationship.type === 'partner') {
      if (partners.has(relationship.personAId) && peopleById.has(relationship.personBId)) {
        partners.get(relationship.personAId).push(relationship.personBId);
        partners.get(relationship.personBId).push(relationship.personAId);
      }
    }
  }

  const surnameCache = new Map();
  const resolveSurname = (personId, resolving = new Set()) => {
    if (surnameCache.has(personId)) return surnameCache.get(personId);
    const profile = profiles.get(personId) || { firstName: '', lastName: '', gender: '' };
    if (resolving.has(personId)) {
      return { surname: profile.lastName || defaultSurname, source: profile.lastName ? 'Existing family surname' : `${defaultSurname} family root` };
    }

    const nextResolving = new Set(resolving).add(personId);
    // A saved surname is authoritative. Relationships provide defaults only, so a
    // surname deliberately edited in the form is never replaced on the next load.
    if (profile.lastName) {
      const result = { surname: profile.lastName, source: 'Saved surname' };
      surnameCache.set(personId, result);
      return result;
    }

    const partnerIds = partners.get(personId) || [];
    if (profile.gender === 'female') {
      const husbandId = partnerIds.find(id => profiles.get(id)?.gender === 'male');
      if (husbandId) {
        const husbandSurname = resolveSurname(husbandId, nextResolving).surname;
        const result = { surname: husbandSurname, source: `Husband: ${peopleById.get(husbandId).fullName}` };
        surnameCache.set(personId, result);
        return result;
      }
    }

    const parentIds = parents.get(personId) || [];
    const fatherId = parentIds.find(id => profiles.get(id)?.gender === 'male');
    if (fatherId) {
      const fatherSurname = resolveSurname(fatherId, nextResolving).surname;
      const result = { surname: fatherSurname, source: `Father: ${peopleById.get(fatherId).fullName}` };
      surnameCache.set(personId, result);
      return result;
    }

    if (parentIds[0]) {
      const parentSurname = resolveSurname(parentIds[0], nextResolving).surname;
      const result = { surname: parentSurname, source: `Connected parent: ${peopleById.get(parentIds[0]).fullName}` };
      surnameCache.set(personId, result);
      return result;
    }

    const result = { surname: defaultSurname, source: `${defaultSurname} family root` };
    surnameCache.set(personId, result);
    return result;
  };

  return new Map(people.map(person => {
    const profile = profiles.get(person.id);
    const automatic = resolveSurname(person.id);
    const fullName = composeFullName(profile.firstName, profile.gender, automatic.surname) || person.fullName;
    return [person.id, {
      firstName: profile.firstName,
      gender: profile.gender,
      middleName: profile.middleName,
      lastName: automatic.surname,
      fullName,
      surnameSource: automatic.source
    }];
  }));
}
