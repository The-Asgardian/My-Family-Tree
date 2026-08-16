function birthYear(person) {
  const match = /^(\d{4})-/.exec(person?.dateOfBirth || '');
  return match ? Number(match[1]) : null;
}

export function relationshipWarnings({ anchor, relative, relationship, existingParents = [] }) {
  const warnings = [];
  if (!anchor || !relative) return warnings;

  const anchorYear = birthYear(anchor);
  const relativeYear = birthYear(relative);
  const parent = relationship === 'parent' ? relative : relationship === 'child' ? anchor : null;
  const child = relationship === 'parent' ? anchor : relationship === 'child' ? relative : null;
  const parentYear = birthYear(parent);
  const childYear = birthYear(child);

  if (parentYear && childYear && childYear - parentYear < 12) {
    warnings.push(`${parent.fullName || 'The parent'} appears to be less than 12 years older than ${child.fullName || 'the child'}. Check the dates.`);
  }
  if (relationship === 'parent' && existingParents.length >= 2) {
    warnings.push(`${anchor.fullName || 'This person'} already has ${existingParents.length} parents recorded. This may be valid for adoptive or blended families.`);
  }
  if (relationship === 'sibling' && anchorYear && relativeYear && Math.abs(anchorYear - relativeYear) > 60) {
    warnings.push('These siblings have more than 60 years between their recorded birth years. Check the dates.');
  }
  return warnings;
}

export function hasAncestorPath(relationships, ancestorId, descendantId) {
  const children = new Map();
  relationships.filter(item => item.type === 'parent_child').forEach(item => {
    if (!children.has(item.personAId)) children.set(item.personAId, []);
    children.get(item.personAId).push(item.personBId);
  });
  const queue = [...(children.get(ancestorId) || [])];
  const seen = new Set();
  while (queue.length) {
    const id = queue.shift();
    if (id === descendantId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    queue.push(...(children.get(id) || []));
  }
  return false;
}
