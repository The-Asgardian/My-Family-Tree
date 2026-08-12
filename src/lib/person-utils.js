const DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;

export function formatDate(value) {
  if (!value) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (!match) return String(value);
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function parseDateInput(value) {
  const input = String(value || '').trim();
  if (!input) return null;
  const match = DATE_PATTERN.exec(input);
  if (!match) throw new Error('Enter dates as dd/mm/yyyy.');
  const [, day, month, year] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year)
    || date.getUTCMonth() !== Number(month) - 1
    || date.getUTCDate() !== Number(day)
  ) throw new Error('Enter a valid date as dd/mm/yyyy.');
  return `${year}-${month}-${day}`;
}

export function middleNameForGender(gender) {
  if (gender === 'male') return 'Singh';
  if (gender === 'female') return 'Kaur';
  return '';
}

export function composeFullName(firstName, gender, lastName = '') {
  const first = String(firstName || '').trim().replace(/\s+/g, ' ');
  const title = middleNameForGender(gender);
  let last = String(lastName || '').trim().replace(/\s+/g, ' ');
  if (title && last.toLocaleLowerCase().startsWith(`${title.toLocaleLowerCase()} `)) {
    last = last.slice(title.length).trim();
  } else if (title && last.toLocaleLowerCase() === title.toLocaleLowerCase()) {
    last = '';
  }
  const firstAlreadyHasTitle = title && first.toLocaleLowerCase().split(' ').at(-1) === title.toLocaleLowerCase();
  return [first, firstAlreadyHasTitle ? '' : title, last].filter(Boolean).join(' ');
}

export function structuredNameFor(person = {}) {
  if (person.firstName || person.lastName || person.gender) {
    return {
      firstName: person.firstName || '',
      lastName: person.lastName || '',
      gender: person.gender || '',
      middleName: middleNameForGender(person.gender)
    };
  }

  const parts = String(person.fullName || '').trim().split(/\s+/).filter(Boolean);
  const markerIndex = parts.findIndex(part => ['singh', 'kaur'].includes(part.toLocaleLowerCase()));
  if (markerIndex >= 0) {
    const gender = parts[markerIndex].toLocaleLowerCase() === 'singh' ? 'male' : 'female';
    return {
      firstName: parts.slice(0, markerIndex).join(' ') || parts[markerIndex],
      lastName: parts.slice(markerIndex + 1).join(' '),
      gender,
      middleName: middleNameForGender(gender)
    };
  }
  return { firstName: parts.join(' '), lastName: '', gender: '', middleName: '' };
}

export function comparePeopleByAge(a, b, fallbackOrder = new Map()) {
  const approximateBirthDate = person => {
    if (person?.dateOfBirth) return person.dateOfBirth;
    if (person?.estimatedAge === null || person?.estimatedAge === undefined || person?.estimatedAge === '') return null;
    const age = Number(person.estimatedAge);
    if (!Number.isFinite(age)) return null;
    return `${new Date().getUTCFullYear() - age}-07-01`;
  };
  const aBirth = approximateBirthDate(a);
  const bBirth = approximateBirthDate(b);
  if (aBirth && bBirth) {
    const dateResult = aBirth.localeCompare(bBirth);
    if (dateResult) return dateResult;
  } else if (aBirth) return -1;
  else if (bBirth) return 1;
  return (fallbackOrder.get(a?.id) ?? 0) - (fallbackOrder.get(b?.id) ?? 0);
}
