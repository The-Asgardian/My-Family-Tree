const DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const MONTH_PATTERN = /^(\d{2})\/(\d{4})$/;
const YEAR_PATTERN = /^(\d{4})$/;

export function formatDate(value, precision = 'day') {
  if (precision === 'unknown') return 'Unknown';
  if (!value) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (!match) return String(value);
  if (precision === 'year') return match[1];
  if (precision === 'month') return `${match[2]}/${match[1]}`;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function dateInputValue(value, precision = 'day') {
  if (!value || precision === 'unknown') return '';
  return formatDate(value, precision);
}

export function parseDateInput(value, precision = 'day') {
  const input = String(value || '').trim();
  if (precision === 'unknown') return null;
  if (!input) throw new Error('Add the known date, or choose Unknown.');

  if (precision === 'year') {
    const match = YEAR_PATTERN.exec(input);
    if (!match) throw new Error('Enter the year as yyyy.');
    const year = Number(match[1]);
    if (year < 1000 || year > 9999) throw new Error('Enter a valid four-digit year.');
    return `${match[1]}-01-01`;
  }

  if (precision === 'month') {
    const match = MONTH_PATTERN.exec(input);
    if (!match) throw new Error('Enter the month and year as mm/yyyy.');
    const month = Number(match[1]);
    if (month < 1 || month > 12) throw new Error('Enter a valid month and year as mm/yyyy.');
    return `${match[2]}-${match[1]}-01`;
  }

  const match = DATE_PATTERN.exec(input);
  if (!match) throw new Error('Enter the full date as dd/mm/yyyy.');
  const [, day, month, year] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year)
    || date.getUTCMonth() !== Number(month) - 1
    || date.getUTCDate() !== Number(day)
  ) throw new Error('Enter a valid date as dd/mm/yyyy.');
  return `${year}-${month}-${day}`;
}

export function datePrecisionLabel(precision = 'unknown') {
  return ({ unknown: 'Unknown', year: 'Year only', month: 'Month and year', day: 'Full date' })[precision] || 'Unknown';
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
  const parts = String(person.fullName || '').trim().split(/\s+/).filter(Boolean);
  const markerIndex = parts.findIndex(part => ['singh', 'kaur'].includes(part.toLocaleLowerCase()));
  let legacy = { firstName: parts.join(' '), lastName: '', gender: '' };
  if (markerIndex >= 0) {
    const tail = parts.slice(markerIndex + 1);
    const nickname = tail.length === 1 && /^\(.+\)$/.test(tail[0]) ? tail[0] : '';
    legacy = {
      firstName: [parts.slice(0, markerIndex).join(' ') || parts[markerIndex], nickname].filter(Boolean).join(' '),
      lastName: nickname ? '' : tail.join(' '),
      gender: parts[markerIndex].toLocaleLowerCase() === 'singh' ? 'male' : 'female'
    };
  }
  const gender = person.gender || legacy.gender;
  return {
    firstName: person.firstName || legacy.firstName,
    lastName: person.lastName || legacy.lastName,
    gender,
    middleName: middleNameForGender(gender)
  };
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
