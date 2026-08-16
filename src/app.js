import { familyService } from './services/family-service.js';
import { config } from './config.js';
import {
  comparePeopleByAge,
  composeFullName,
  dateInputValue,
  formatDate,
  middleNameForGender,
  parseDateInput,
  structuredNameFor
} from './lib/person-utils.js';
import { relationshipWarnings } from './lib/relationship-utils.js';
import { optimisePhoto } from './lib/photo-utils.js';
import { buildAutomaticNames } from './lib/surname-utils.js';
import {
  claimFamilyInvitation,
  clearInvitationFromAddress,
  createFamilyInvitations,
  getFamilyAccess,
  invitationTokenFromUrl,
  signInOwner,
  signOutFamilyAccess
} from './services/editor-access-service.js';

const CARD_W = 176;
const CARD_H = 108;
const PHOTO_H = 58;
const PARTNER_GAP = 42;
const GROUP_GAP = 76;
const ROW_GAP = 118;
const MIN_ZOOM = 0.12;
const MAX_ZOOM = 1.65;
const THEME_STORAGE_KEY = 'family-tree-theme';
const PREFERENCES_STORAGE_KEY = 'family-tree-preferences';

const state = {
  tree: null,
  selectedId: null,
  view: 'family',
  zoom: 1,
  panX: 0,
  panY: 0,
  positions: new Map(),
  filteredIds: null,
  addAnchorId: null,
  addRelationship: null,
  editingId: null,
  deletingId: null,
  lastNameEdited: false,
  drag: null,
  touchPointers: new Map(),
  pinch: null,
  photoFile: null,
  photoPreviewUrl: '',
  photoProcessing: null,
  relationshipWarningConfirmed: false,
  showGenerationBands: true,
  autoArrangeAfterChanges: true,
  automaticNames: new Map(),
  accessRole: null,
  accessExpiresAt: null,
  isEditor: false,
  treeConnected: false,
  stopTreeSubscription: null,
  realtimeReloadTimer: null
};

let resizeTimer = null;

const els = {
  app: document.querySelector('#app'),
  accessGate: document.querySelector('#accessGate'),
  gateOwnerLoginButton: document.querySelector('#gateOwnerLoginButton'),
  familyName: document.querySelector('#familyName'),
  viewport: document.querySelector('#treeViewport'),
  stage: document.querySelector('#treeStage'),
  generationLayer: document.querySelector('#generationLayer'),
  nodeLayer: document.querySelector('#nodeLayer'),
  relationshipLayer: document.querySelector('#relationshipLayer'),
  detailsPanel: document.querySelector('#detailsPanel'),
  detailsContent: document.querySelector('#detailsContent'),
  mobileDetailsButton: document.querySelector('#mobileDetailsButton'),
  search: document.querySelector('#globalSearch'),
  searchResults: document.querySelector('#searchResults'),
  zoomValue: document.querySelector('#zoomValue'),
  emptyState: document.querySelector('#emptyState'),
  relationshipDialog: document.querySelector('#relationshipDialog'),
  relationshipTitle: document.querySelector('#relationshipTitle'),
  relationshipSubtitle: document.querySelector('#relationshipSubtitle'),
  personDialog: document.querySelector('#personDialog'),
  personDialogTitle: document.querySelector('#personDialogTitle'),
  personDialogSubtitle: document.querySelector('#personDialogSubtitle'),
  deletePersonDialog: document.querySelector('#deletePersonDialog'),
  deletePersonTitle: document.querySelector('#deletePersonTitle'),
  deletePersonSubtitle: document.querySelector('#deletePersonSubtitle'),
  deletePersonForm: document.querySelector('#deletePersonForm'),
  deleteConfirmation: document.querySelector('#deleteConfirmationInput'),
  confirmDeleteButton: document.querySelector('#confirmDeleteButton'),
  deleteFormStatus: document.querySelector('#deleteFormStatus'),
  personForm: document.querySelector('#personForm'),
  personSubmit: document.querySelector('#personForm button[type="submit"]'),
  personFirstName: document.querySelector('#personFirstNameInput'),
  personMiddleName: document.querySelector('#personMiddleNameInput'),
  personLastName: document.querySelector('#personLastNameInput'),
  personGender: document.querySelector('#personGenderInput'),
  personDob: document.querySelector('#personDobInput'),
  personDobPrecision: document.querySelector('#personDobPrecisionInput'),
  personDobValueLabel: document.querySelector('#personDobValueLabel'),
  personAge: document.querySelector('#personAgeInput'),
  personLiving: document.querySelector('#personLivingInput'),
  personDeath: document.querySelector('#personDeathInput'),
  personDeathPrecision: document.querySelector('#personDeathPrecisionInput'),
  personDeathValueLabel: document.querySelector('#personDeathValueLabel'),
  personBirthplace: document.querySelector('#personBirthplaceInput'),
  personAbout: document.querySelector('#personAboutInput'),
  personPhoto: document.querySelector('#personPhotoInput'),
  photoPreview: document.querySelector('#photoPreview'),
  formStatus: document.querySelector('#formStatus'),
  surnameHint: document.querySelector('#surnameHint'),
  toastRegion: document.querySelector('#toastRegion'),
  connectionStatus: document.querySelector('#connectionStatus'),
  accessRoleBadge: document.querySelector('#accessRoleBadge'),
  themeToggleButton: document.querySelector('#themeToggleButton'),
  settingsButton: document.querySelector('#settingsButton'),
  addPersonButton: document.querySelector('#addPersonButton'),
  inviteEditorButton: document.querySelector('#inviteEditorButton'),
  inviteEditorDialog: document.querySelector('#inviteEditorDialog'),
  inviteEditorForm: document.querySelector('#inviteEditorForm'),
  inviteDuration: document.querySelector('#inviteDurationInput'),
  inviteDurationField: document.querySelector('#inviteDurationField'),
  inviteRole: document.querySelector('#inviteRoleInput'),
  inviteCount: document.querySelector('#inviteCountInput'),
  createInviteButton: document.querySelector('#createInviteButton'),
  inviteResult: document.querySelector('#inviteResult'),
  inviteLinksOutput: document.querySelector('#inviteLinksOutput'),
  inviteFormStatus: document.querySelector('#inviteFormStatus'),
  relationshipOptions: document.querySelector('#relationshipOptions'),
  coParentField: document.querySelector('#coParentField'),
  coParent: document.querySelector('#coParentInput'),
  sharedParentField: document.querySelector('#sharedParentField'),
  sharedParent: document.querySelector('#sharedParentInput'),
  sharedParentLabel: document.querySelector('#sharedParentLabel'),
  ownerLoginDialog: document.querySelector('#ownerLoginDialog'),
  ownerLoginForm: document.querySelector('#ownerLoginForm'),
  ownerEmail: document.querySelector('#ownerEmailInput'),
  ownerPassword: document.querySelector('#ownerPasswordInput'),
  ownerLoginSubmit: document.querySelector('#ownerLoginSubmit'),
  ownerLoginStatus: document.querySelector('#ownerLoginStatus'),
  settingsDialog: document.querySelector('#settingsDialog'),
  settingsTheme: document.querySelector('#settingsThemeInput'),
  settingsGenerationBands: document.querySelector('#settingsGenerationBandsInput'),
  settingsAutoArrange: document.querySelector('#settingsAutoArrangeInput'),
  settingsAccessSummary: document.querySelector('#settingsAccessSummary'),
  settingsOwnerLoginButton: document.querySelector('#settingsOwnerLoginButton'),
  settingsSignOutButton: document.querySelector('#settingsSignOutButton')
};

function loadPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY) || '{}');
    state.showGenerationBands = saved.showGenerationBands !== false;
    state.autoArrangeAfterChanges = saved.autoArrangeAfterChanges !== false;
  } catch {}
}

function savePreferences() {
  try {
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({
      showGenerationBands: state.showGenerationBands,
      autoArrangeAfterChanges: state.autoArrangeAfterChanges
    }));
  } catch {}
}

function currentTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function applyTheme(theme, persist = false) {
  const nextTheme = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = nextTheme;
  if (persist) {
    try { localStorage.setItem(THEME_STORAGE_KEY, nextTheme); } catch {}
  }

  const darkModeActive = nextTheme === 'dark';
  const nextMode = darkModeActive ? 'light' : 'dark';
  els.themeToggleButton.querySelector('span').textContent = darkModeActive ? '☀' : '☾';
  els.themeToggleButton.setAttribute('aria-label', `Switch to ${nextMode} mode`);
  els.themeToggleButton.title = `Switch to ${nextMode} mode`;
  document.querySelector('meta[name="theme-color"]').content = darkModeActive ? '#101722' : '#f3f6fb';
  if (els.settingsTheme) els.settingsTheme.value = nextTheme;
}

function applyAccess(access = {}) {
  state.accessRole = access.role || null;
  state.accessExpiresAt = access.expiresAt || null;
  state.isEditor = state.accessRole === 'owner' || state.accessRole === 'editor';
  const roleLabel = state.accessRole ? `${state.accessRole[0].toUpperCase()}${state.accessRole.slice(1)}` : '';
  els.accessRoleBadge.hidden = !state.accessRole;
  els.accessRoleBadge.textContent = roleLabel;
  els.app.classList.toggle('access-locked', !state.accessRole);
  els.accessGate.hidden = Boolean(state.accessRole);
  els.settingsOwnerLoginButton.hidden = state.accessRole === 'owner';
  els.settingsSignOutButton.hidden = !state.accessRole;
  const expiry = state.accessExpiresAt ? new Date(state.accessExpiresAt).toLocaleDateString('en-GB') : null;
  els.settingsAccessSummary.textContent = state.accessRole
    ? `${roleLabel} access${expiry ? ` until ${expiry}` : ' on this device'}.`
    : 'This device does not have family access.';
}

function openOwnerLogin() {
  els.ownerLoginForm.reset();
  els.ownerLoginStatus.textContent = '';
  els.ownerLoginDialog.showModal();
  requestAnimationFrame(() => els.ownerEmail.focus());
}

function updateDateControl(precisionElement, inputElement, labelElement, label) {
  const precision = precisionElement.value;
  const settings = {
    unknown: { placeholder: 'Unknown', inputMode: 'text' },
    year: { placeholder: 'yyyy', inputMode: 'numeric' },
    month: { placeholder: 'mm/yyyy', inputMode: 'numeric' },
    day: { placeholder: 'dd/mm/yyyy', inputMode: 'numeric' }
  }[precision];
  inputElement.disabled = precision === 'unknown';
  inputElement.placeholder = settings.placeholder;
  inputElement.inputMode = settings.inputMode;
  if (precision === 'unknown') inputElement.value = '';
  labelElement.firstChild.textContent = `${label} `;
}

function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map(v => v[0] || '').join('').toUpperCase() || '?';
}

function personById(id) {
  return state.tree?.people.find(person => person.id === id) || null;
}

function relationshipPeople(personId, type, direction = 'either') {
  const ids = [];
  for (const rel of state.tree.relationships) {
    if (rel.type !== type) continue;
    if (direction === 'parents' && rel.personBId === personId) ids.push(rel.personAId);
    else if (direction === 'children' && rel.personAId === personId) ids.push(rel.personBId);
    else if (direction === 'either') {
      if (rel.personAId === personId) ids.push(rel.personBId);
      else if (rel.personBId === personId) ids.push(rel.personAId);
    }
  }
  return [...new Set(ids)].map(personById).filter(Boolean);
}

function getParents(id) { return relationshipPeople(id, 'parent_child', 'parents'); }
function getChildren(id) { return relationshipPeople(id, 'parent_child', 'children'); }
function getPartners(id) { return relationshipPeople(id, 'partner', 'either'); }
function getExplicitSiblings(id) { return relationshipPeople(id, 'sibling', 'either'); }

function applyAutomaticNames() {
  if (!state.tree) return;
  state.automaticNames = buildAutomaticNames(
    state.tree.people,
    state.tree.relationships,
    config.defaultFamilySurname
  );
  state.tree.people.forEach(person => {
    const automatic = state.automaticNames.get(person.id);
    if (automatic) Object.assign(person, automatic);
  });
}

function getSiblings(id) {
  const parentIds = getParents(id).map(p => p.id);
  const inferred = state.tree.people.filter(person => {
    if (person.id === id) return false;
    const theirParents = getParents(person.id).map(p => p.id);
    return theirParents.some(pid => parentIds.includes(pid));
  });
  return [...new Map([...getExplicitSiblings(id), ...inferred].map(person => [person.id, person])).values()];
}

function ageFor(person) {
  if (person.dateOfBirth) {
    const birth = new Date(`${person.dateOfBirth}T00:00:00`);
    if (!Number.isNaN(birth.valueOf())) {
      const now = new Date();
      let age = now.getFullYear() - birth.getFullYear();
      const month = now.getMonth() - birth.getMonth();
      if (month < 0 || (month === 0 && now.getDate() < birth.getDate())) age -= 1;
      return Math.max(0, age);
    }
  }
  if (person.estimatedAge === null || person.estimatedAge === undefined || person.estimatedAge === '') return null;
  return Number.isFinite(Number(person.estimatedAge)) ? Number(person.estimatedAge) : null;
}

function formattedAge(person) {
  const birthDate = formatDate(person.dateOfBirth, person.dateOfBirthPrecision);
  if (person.isDeceased && person.dateOfBirth) {
    return `${birthDate}–${formatDate(person.dateOfDeath, person.dateOfDeathPrecision) || '—'}`;
  }
  const age = ageFor(person);
  if (birthDate) return age === null ? birthDate : `${birthDate} · Age ${age}`;
  return age === null ? 'Age unknown' : `Age ${age}`;
}

function determineGenerations() {
  const gen = new Map();
  const people = state.tree.people;
  const incomingParents = id => getParents(id).map(p => p.id);
  const roots = people.filter(p => incomingParents(p.id).length === 0);
  const queue = roots.map(p => ({ id: p.id, g: 0 }));
  const seenGuard = new Map();

  while (queue.length) {
    const { id, g } = queue.shift();
    if ((seenGuard.get(id) ?? -1) >= g) continue;
    seenGuard.set(id, g);
    gen.set(id, Math.max(gen.get(id) ?? 0, g));
    for (const child of getChildren(id)) queue.push({ id: child.id, g: g + 1 });
  }

  for (const person of people) if (!gen.has(person.id)) gen.set(person.id, 0);

  // Reconcile same-generation links and descendants after new ancestors are
  // added. The database prevents ancestry cycles, so this converges quickly.
  for (let pass = 0; pass < people.length + 1; pass += 1) {
    let changed = false;
    for (const rel of state.tree.relationships.filter(r => r.type === 'partner' || r.type === 'sibling')) {
      const g = Math.max(gen.get(rel.personAId) ?? 0, gen.get(rel.personBId) ?? 0);
      if (gen.get(rel.personAId) !== g || gen.get(rel.personBId) !== g) changed = true;
      gen.set(rel.personAId, g);
      gen.set(rel.personBId, g);
    }
    for (const rel of state.tree.relationships.filter(r => r.type === 'parent_child')) {
      const next = (gen.get(rel.personAId) ?? 0) + 1;
      if ((gen.get(rel.personBId) ?? 0) < next) {
        gen.set(rel.personBId, next);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return gen;
}

function visibleIds() {
  if (!state.selectedId || state.view === 'family' || state.view === 'list') return new Set(state.tree.people.map(p => p.id));
  const visible = new Set([state.selectedId]);
  const walk = (id, direction) => {
    const next = direction === 'up' ? getParents(id) : getChildren(id);
    next.forEach(person => {
      if (visible.has(person.id)) return;
      visible.add(person.id);
      getPartners(person.id).forEach(partner => visible.add(partner.id));
      walk(person.id, direction);
    });
  };
  walk(state.selectedId, state.view === 'ancestors' ? 'up' : 'down');
  getPartners(state.selectedId).forEach(partner => visible.add(partner.id));
  return visible;
}

function makeGroups(generationPeople) {
  const ids = new Set(generationPeople.map(p => p.id));
  const used = new Set();
  const groups = [];
  for (const person of generationPeople) {
    if (used.has(person.id)) continue;
    const component = [];
    const queue = [person];
    while (queue.length) {
      const member = queue.shift();
      if (used.has(member.id) || !ids.has(member.id)) continue;
      used.add(member.id);
      component.push(member);
      getPartners(member.id).forEach(partner => {
        if (ids.has(partner.id) && !used.has(partner.id)) queue.push(partner);
      });
    }
    if (component.length === 3) {
      const centre = component.find(member => getPartners(member.id).filter(partner => component.some(item => item.id === partner.id)).length === 2);
      if (centre) {
        const sides = component.filter(member => member.id !== centre.id).sort(comparePeopleByAge);
        groups.push([sides[0], centre, sides[1]]);
        continue;
      }
    }
    groups.push(component.sort(comparePeopleByAge));
  }
  return groups;
}

function groupMemberOffset(group, personId) {
  const index = group.people.findIndex(person => person.id === personId);
  if (index < 0) return 0;
  return index * (CARD_W + PARTNER_GAP) + CARD_W / 2 - group.width / 2;
}

function layoutTree() {
  state.positions.clear();
  const genMap = determineGenerations();
  const visible = visibleIds();
  const personOrder = new Map(state.tree.people.map((person, index) => [person.id, index]));
  const generations = [...new Set([...genMap.entries()]
    .filter(([id]) => visible.has(id))
    .map(([, generation]) => generation))].sort((a, b) => a - b);
  const groups = [];
  const groupByPerson = new Map();

  for (const generation of generations) {
    const people = state.tree.people
      .filter(person => visible.has(person.id) && genMap.get(person.id) === generation)
      .sort((a, b) => personOrder.get(a.id) - personOrder.get(b.id));
    for (const members of makeGroups(people)) {
      const group = {
        id: members.map(person => person.id).sort().join('|'),
        people: members,
        generation,
        width: members.length * CARD_W + Math.max(0, members.length - 1) * PARTNER_GAP,
        order: Math.min(...members.map(person => personOrder.get(person.id)))
      };
      groups.push(group);
      members.forEach(person => groupByPerson.set(person.id, group));
    }
  }

  const parentGroups = new Map(groups.map(group => [group.id, new Set()]));
  const edgesByGroups = new Map();
  for (const relationship of state.tree.relationships.filter(item => item.type === 'parent_child')) {
    if (!visible.has(relationship.personAId) || !visible.has(relationship.personBId)) continue;
    const parentGroup = groupByPerson.get(relationship.personAId);
    const childGroup = groupByPerson.get(relationship.personBId);
    if (!parentGroup || !childGroup || parentGroup.id === childGroup.id) continue;
    parentGroups.get(childGroup.id).add(parentGroup.id);
    const key = `${parentGroup.id}→${childGroup.id}`;
    if (!edgesByGroups.has(key)) edgesByGroups.set(key, []);
    edgesByGroups.get(key).push(relationship);
  }

  const groupById = new Map(groups.map(group => [group.id, group]));
  const primaryParent = new Map();
  for (const group of groups) {
    const candidates = [...parentGroups.get(group.id)].map(id => groupById.get(id));
    candidates.sort((a, b) => {
      const aEdges = edgesByGroups.get(`${a.id}→${group.id}`)?.length || 0;
      const bEdges = edgesByGroups.get(`${b.id}→${group.id}`)?.length || 0;
      return bEdges - aEdges || b.generation - a.generation || a.order - b.order;
    });
    if (candidates[0]) primaryParent.set(group.id, candidates[0].id);
  }

  const primaryChildren = new Map(groups.map(group => [group.id, []]));
  for (const group of groups) {
    const parentId = primaryParent.get(group.id);
    if (parentId) primaryChildren.get(parentId).push(group.id);
  }
  for (const [parentGroupId, children] of primaryChildren.entries()) {
    const branchPerson = childGroupId => {
      const edges = edgesByGroups.get(`${parentGroupId}→${childGroupId}`) || [];
      return edges.map(edge => personById(edge.personBId)).filter(Boolean).sort((a, b) => comparePeopleByAge(a, b, personOrder))[0]
        || groupById.get(childGroupId).people[0];
    };
    children.sort((a, b) => comparePeopleByAge(branchPerson(a), branchPerson(b), personOrder)
      || groupById.get(a).order - groupById.get(b).order);
  }

  const subtreeWidth = new Map();
  const measureSubtree = groupId => {
    if (subtreeWidth.has(groupId)) return subtreeWidth.get(groupId);
    const group = groupById.get(groupId);
    const children = primaryChildren.get(groupId);
    const childrenWidth = children.reduce((sum, childId) => sum + measureSubtree(childId), 0)
      + Math.max(0, children.length - 1) * GROUP_GAP;
    const width = Math.max(group.width, childrenWidth);
    subtreeWidth.set(groupId, width);
    return width;
  };

  const roots = groups
    .filter(group => !primaryParent.has(group.id))
    .sort((a, b) => a.order - b.order);
  const centres = new Map();
  const placeSubtree = (groupId, left) => {
    const group = groupById.get(groupId);
    const width = measureSubtree(groupId);
    centres.set(groupId, left + width / 2);
    const children = primaryChildren.get(groupId);
    if (!children.length) return;
    const childrenWidth = children.reduce((sum, childId) => sum + measureSubtree(childId), 0)
      + Math.max(0, children.length - 1) * GROUP_GAP;
    let childLeft = left + (width - childrenWidth) / 2;
    children.forEach(childId => {
      placeSubtree(childId, childLeft);
      childLeft += measureSubtree(childId) + GROUP_GAP;
    });
    const childAnchors = [];
    const parentOffsets = [];
    children.forEach(childId => {
      const childGroup = groupById.get(childId);
      (edgesByGroups.get(`${groupId}→${childId}`) || []).forEach(edge => {
        childAnchors.push(centres.get(childId) + groupMemberOffset(childGroup, edge.personBId));
        parentOffsets.push(groupMemberOffset(group, edge.personAId));
      });
    });
    if (childAnchors.length) {
      const branchCentre = (Math.min(...childAnchors) + Math.max(...childAnchors)) / 2;
      const parentOffset = parentOffsets.reduce((sum, offset) => sum + offset, 0) / parentOffsets.length;
      const minimumCentre = left + group.width / 2;
      const maximumCentre = left + width - group.width / 2;
      centres.set(groupId, Math.min(maximumCentre, Math.max(minimumCentre, branchCentre - parentOffset)));
    }
  };

  let rootLeft = 0;
  roots.forEach(root => {
    placeSubtree(root.id, rootLeft);
    rootLeft += measureSubtree(root.id) + GROUP_GAP;
  });
  groups.filter(group => !centres.has(group.id)).sort((a, b) => a.order - b.order).forEach(group => {
    placeSubtree(group.id, rootLeft);
    rootLeft += measureSubtree(group.id) + GROUP_GAP;
  });

  const rows = generations.map(generation => ({
    generation,
    groups: groups.filter(group => group.generation === generation).sort((a, b) => centres.get(a.id) - centres.get(b.id))
  }));

  const minLeft = Math.min(...groups.map(group => centres.get(group.id) - group.width / 2));
  const maxRight = Math.max(...groups.map(group => centres.get(group.id) + group.width / 2));
  const horizontalPadding = 130;
  const horizontalShift = horizontalPadding - minLeft;
  const stageWidth = Math.max(900, maxRight - minLeft + horizontalPadding * 2);
  const topPadding = 94;
  const stageHeight = Math.max(650, topPadding + rows.length * CARD_H + Math.max(0, rows.length - 1) * ROW_GAP + 94);

  rows.forEach((row, rowIndex) => {
    const y = topPadding + rowIndex * (CARD_H + ROW_GAP);
    row.groups.forEach(group => {
      const groupLeft = centres.get(group.id) + horizontalShift - group.width / 2;
      group.people.forEach((person, memberIndex) => {
        state.positions.set(person.id, { x: groupLeft + memberIndex * (CARD_W + PARTNER_GAP), y });
      });
    });
  });

  els.stage.style.width = `${stageWidth}px`;
  els.stage.style.height = `${stageHeight}px`;
  els.relationshipLayer.setAttribute('viewBox', `0 0 ${stageWidth} ${stageHeight}`);
  els.relationshipLayer.setAttribute('width', stageWidth);
  els.relationshipLayer.setAttribute('height', stageHeight);
  renderGenerationBands(rows, topPadding, stageHeight);
}

function renderGenerationBands(rows, topPadding, stageHeight) {
  if (!state.showGenerationBands) {
    els.generationLayer.innerHTML = '';
    return;
  }
  els.generationLayer.innerHTML = rows.map((row, rowIndex) => {
    const top = rowIndex === 0 ? 0 : topPadding + rowIndex * (CARD_H + ROW_GAP) - ROW_GAP / 2;
    const nextTop = rowIndex === rows.length - 1
      ? stageHeight
      : topPadding + (rowIndex + 1) * (CARD_H + ROW_GAP) - ROW_GAP / 2;
    return `<div class="generation-band generation-tone-${row.generation % 6}" style="top:${top}px;height:${nextTop - top}px">
      <span>Generation ${row.generation + 1}</span>
    </div>`;
  }).join('');
}

function nodeMarkup(person) {
  const photo = person.photoUrl
    ? `<img src="${escapeHtml(person.photoUrl)}" alt="" loading="lazy">`
    : `<div class="node-placeholder"><strong>${escapeHtml(initials(person.fullName))}</strong></div>`;
  const lifeLabel = person.isDeceased ? 'In memory' : 'Family member';
  return `
    <div class="node-photo">${photo}</div>
    <div class="node-meta"><small>${escapeHtml(lifeLabel)}</small><strong>${escapeHtml(person.fullName)}</strong><span>${escapeHtml(formattedAge(person))}</span></div>
    ${state.isEditor ? `<button class="node-add" type="button" aria-label="Add relative to ${escapeHtml(person.fullName)}" data-add-person="${person.id}">＋</button>` : ''}
  `;
}

function renderRootNode() {
  const stageWidth = 900;
  const stageHeight = 650;
  els.stage.hidden = false;
  els.stage.style.width = `${stageWidth}px`;
  els.stage.style.height = `${stageHeight}px`;
  els.relationshipLayer.setAttribute('viewBox', `0 0 ${stageWidth} ${stageHeight}`);
  els.relationshipLayer.setAttribute('width', stageWidth);
  els.relationshipLayer.setAttribute('height', stageHeight);
  els.relationshipLayer.innerHTML = '';
  els.generationLayer.innerHTML = '';
  els.nodeLayer.innerHTML = `
    <article class="root-node" aria-label="Add the root person">
      <span class="root-node-mark" aria-hidden="true">＋</span>
      <strong>${state.isEditor ? 'Add the root person' : 'No family members yet'}</strong>
      <span>${state.isEditor ? 'Every family branch will connect from here.' : 'Open an editor invitation on this device to begin the tree.'}</span>
      ${state.isEditor ? '<button class="primary-button" type="button">Add the first person</button>' : ''}
    </article>`;
  els.nodeLayer.querySelector('.root-node button')?.addEventListener('click', () => {
    if (!requireConnectedTree()) return;
    state.addAnchorId = null;
    state.addRelationship = null;
    openPersonDialog();
  });
  applyTransform();
}

function renderTree() {
  if (!state.tree) return;
  const visible = visibleIds();
  els.emptyState.hidden = true;
  els.nodeLayer.innerHTML = '';
  els.relationshipLayer.innerHTML = '';
  els.generationLayer.innerHTML = '';

  if (state.tree.people.length === 0) {
    renderRootNode();
    return;
  }

  els.stage.hidden = state.view === 'list';

  if (state.view === 'list') {
    renderListView(visible);
    return;
  }

  layoutTree();
  for (const person of state.tree.people) {
    if (!visible.has(person.id)) continue;
    const pos = state.positions.get(person.id);
    if (!pos) continue;
    const card = document.createElement('article');
    card.className = `person-node gender-${person.gender || 'unknown'}${person.id === state.selectedId ? ' selected' : ''}`;
    card.dataset.personId = person.id;
    card.style.left = `${pos.x}px`;
    card.style.top = `${pos.y}px`;
    card.setAttribute('aria-label', `${person.fullName}, ${formattedAge(person)}`);
    card.innerHTML = nodeMarkup(person);
    const selectButton = document.createElement('button');
    selectButton.type = 'button';
    selectButton.className = 'node-select-hit';
    selectButton.setAttribute('aria-label', `View ${person.fullName}`);
    selectButton.addEventListener('click', () => selectPerson(person.id));
    card.prepend(selectButton);
    card.querySelector('.node-add')?.addEventListener('click', event => {
      event.stopPropagation();
      openRelationshipDialog(person.id);
    });
    els.nodeLayer.appendChild(card);
  }
  drawRelationships(visible);
  applyTransform();
}

function renderListView(visible) {
  els.stage.hidden = false;
  els.stage.style.width = '100%';
  els.stage.style.height = 'auto';
  els.relationshipLayer.innerHTML = '';
  els.nodeLayer.innerHTML = `<div class="list-view">${state.tree.people.filter(p => visible.has(p.id)).map(person => `
    <button class="list-person" type="button" data-list-person="${person.id}">
      ${avatarMarkup(person)}
      <span><strong>${escapeHtml(person.fullName)}</strong><small>${escapeHtml(formattedAge(person))}</small></span>
      <span>›</span>
    </button>`).join('')}</div>`;
  els.nodeLayer.querySelectorAll('[data-list-person]').forEach(button => button.addEventListener('click', () => selectPerson(button.dataset.listPerson)));
  els.stage.style.transform = 'none';
}

function drawRelationships(visible) {
  const paths = [];
  const partnerPairs = new Set();
  const partnerKeys = new Set();

  for (const rel of state.tree.relationships) {
    if (!visible.has(rel.personAId) || !visible.has(rel.personBId)) continue;
    const a = state.positions.get(rel.personAId);
    const b = state.positions.get(rel.personBId);
    if (!a || !b) continue;
    if (rel.type === 'partner') {
      const key = [rel.personAId, rel.personBId].sort().join('|');
      if (partnerPairs.has(key)) continue;
      partnerPairs.add(key);
      partnerKeys.add(key);
      const left = a.x < b.x ? a : b;
      const right = a.x < b.x ? b : a;
      const y = left.y + PHOTO_H * 0.64;
      paths.push(`<path class="partner-path" d="M ${left.x + CARD_W} ${y} L ${right.x} ${y}"/>`);
    } else if (rel.type === 'sibling') {
      const left = a.x < b.x ? a : b;
      const right = a.x < b.x ? b : a;
      const leftX = left.x + CARD_W / 2;
      const rightX = right.x + CARD_W / 2;
      const y = Math.min(left.y, right.y) - 18;
      paths.push(`<path class="sibling-path" d="M ${leftX} ${left.y} V ${y} H ${rightX} V ${right.y}"/>`);
    }
  }

  const childrenByParentSet = new Map();
  for (const rel of state.tree.relationships.filter(r => r.type === 'parent_child')) {
    if (!visible.has(rel.personAId) || !visible.has(rel.personBId)) continue;
    const child = rel.personBId;
    const parents = getParents(child).map(p => p.id).filter(id => visible.has(id)).sort();
    const key = parents.join('|') || rel.personAId;
    if (!childrenByParentSet.has(key)) childrenByParentSet.set(key, new Set());
    childrenByParentSet.get(key).add(child);
  }

  for (const [parentKey, childSet] of childrenByParentSet.entries()) {
    const parentIds = parentKey.split('|').filter(Boolean);
    const parents = parentIds.map(id => ({ id, pos: state.positions.get(id) })).filter(parent => parent.pos);
    if (!parents.length) continue;
    const parentCentre = parents.reduce((sum, parent) => sum + parent.pos.x + CARD_W / 2, 0) / parents.length;
    const parentBottom = Math.max(...parents.map(parent => parent.pos.y + CARD_H));
    const partneredParents = parents.length === 2 && partnerKeys.has(parentIds.slice().sort().join('|'));
    const parentStartY = partneredParents
      ? parents[0].pos.y + PHOTO_H * 0.64
      : parentBottom;
    const children = [...childSet]
      .map(id => ({ id, pos: state.positions.get(id) }))
      .filter(child => child.pos)
      .sort((a, b) => a.pos.x - b.pos.x);
    if (!children.length) continue;
    const childTop = Math.min(...children.map(child => child.pos.y));
    const joinY = Math.min(childTop - 34, parentBottom + Math.max(48, (childTop - parentBottom) * 0.52));
    const childCentres = children.map(child => child.pos.x + CARD_W / 2);
    const horizontal = children.length > 1
      ? `M ${Math.min(...childCentres)} ${joinY} H ${Math.max(...childCentres)} `
      : `M ${parentCentre} ${joinY} H ${childCentres[0]} `;
    const drops = children.map((child, index) => `M ${childCentres[index]} ${joinY} V ${child.pos.y}`).join(' ');
    paths.push(`<path class="family-path" d="M ${parentCentre} ${parentStartY} V ${joinY} ${horizontal}${drops}"/>`);
  }

  els.relationshipLayer.innerHTML = `<g class="relationship-paths">${paths.join('')}</g>`;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function avatarMarkup(person, className = 'mini-avatar') {
  return person.photoUrl
    ? `<span class="${className} has-photo"><img src="${escapeHtml(person.photoUrl)}" alt="" loading="lazy"></span>`
    : `<span class="${className}">${escapeHtml(initials(person.fullName))}</span>`;
}

function miniPeople(people) {
  if (!people.length) return '';
  return [...people]
    .sort((a, b) => comparePeopleByAge(a, b, new Map(state.tree.people.map((person, index) => [person.id, index]))))
    .map(p => `<button type="button" class="relation-chip" data-related-person="${p.id}">${avatarMarkup(p)}${escapeHtml(p.fullName)}</button>`).join('');
}

function renderDetails() {
  const person = personById(state.selectedId);
  els.mobileDetailsButton.hidden = !person || (window.innerWidth >= 700 && window.innerHeight >= 520);
  if (!person) {
    const emptyCopy = state.tree?.people.length === 0
      ? '<h2>Add the first person</h2><p>This person becomes the root from which every relative is connected.</p>'
      : '<h2>Select someone</h2><p>Choose a person in the family tree to view their details.</p>';
    els.detailsContent.innerHTML = `<div class="panel-empty">${emptyCopy}</div>`;
    return;
  }
  const parents = getParents(person.id);
  const siblings = getSiblings(person.id);
  const partners = getPartners(person.id);
  const children = getChildren(person.id);
  const photo = person.photoUrl ? `<img src="${escapeHtml(person.photoUrl)}" alt="Portrait of ${escapeHtml(person.fullName)}">` : `<div class="detail-photo-placeholder">${escapeHtml(initials(person.fullName))}</div>`;
  const dob = formatDate(person.dateOfBirth, person.dateOfBirthPrecision) || 'Unknown';
  const dod = formatDate(person.dateOfDeath, person.dateOfDeathPrecision) || 'Unknown';
  const genderLabel = person.gender === 'male' ? 'Male' : person.gender === 'female' ? 'Female' : 'Not added';

  els.detailsContent.innerHTML = `
    <section class="profile-hero">
      <div class="detail-photo">${photo}</div>
      <div class="profile-summary">
        <span class="profile-status">${person.isDeceased ? 'In memory' : 'Living'}</span>
        <h1>${escapeHtml(person.fullName)}</h1>
        <p>${escapeHtml(formattedAge(person))}</p>
        <span class="profile-gender">${escapeHtml(genderLabel)}</span>
      </div>
    </section>
    <section class="relationship-details">
      <h3>Parents</h3><div class="relation-list">${miniPeople(parents) || '<span class="empty-label">Not added</span>'}</div>
      <h3>Siblings</h3><div class="relation-list">${miniPeople(siblings) || '<span class="empty-label">None added</span>'}</div>
      <h3>Partners</h3><div class="relation-list">${miniPeople(partners) || (state.isEditor ? `<button class="add-inline" type="button" data-inline-add="partner">＋ Add partner</button>` : '<span class="empty-label">None added</span>')}</div>
      <h3>Children</h3><div class="relation-list">${miniPeople(children) || (state.isEditor ? `<button class="add-inline" type="button" data-inline-add="child">＋ Add child</button>` : '<span class="empty-label">None added</span>')}</div>
    </section>
    ${state.isEditor ? `<section class="profile-actions">
      <button class="primary-button" type="button" id="panelAddRelative">＋ Add relative</button>
      <button class="secondary-button" type="button" id="panelEditPerson">✎ Edit person</button>
      <button class="danger-outline-button profile-delete-button" type="button" id="panelDeletePerson">Delete person</button>
    </section>` : '<div class="view-only-note">View only · this device has private viewer access</div>'}
    <section class="facts-grid">
      <div><span>Last name</span><strong>${escapeHtml(person.lastName || config.defaultFamilySurname)}<small class="surname-source">${escapeHtml(person.surnameSource || `${config.defaultFamilySurname} family root`)}</small></strong></div>
      <div><span>Date of birth</span><strong>${escapeHtml(dob)}</strong></div>
      ${person.isDeceased ? `<div><span>Date of death</span><strong>${escapeHtml(dod)}</strong></div>` : ''}
      <div><span>Birthplace</span><strong>${escapeHtml(person.birthplace || 'Not added')}</strong></div>
      <div><span>About</span><strong class="about-text">${escapeHtml(person.about || 'Add a note…')}</strong></div>
    </section>
  `;

  els.detailsContent.querySelectorAll('[data-related-person]').forEach(button => button.addEventListener('click', () => selectPerson(button.dataset.relatedPerson, true)));
  els.detailsContent.querySelectorAll('[data-inline-add]').forEach(button => button.addEventListener('click', () => {
    state.addAnchorId = person.id;
    state.addRelationship = button.dataset.inlineAdd;
    openPersonDialog();
  }));
  els.detailsContent.querySelector('#panelAddRelative')?.addEventListener('click', () => openRelationshipDialog(person.id));
  els.detailsContent.querySelector('#panelEditPerson')?.addEventListener('click', () => openEditDialog(person.id));
  els.detailsContent.querySelector('#panelDeletePerson')?.addEventListener('click', () => openDeleteDialog(person.id));
}

function selectPerson(id, centre = false) {
  state.selectedId = id;
  renderTree();
  renderDetails();
  els.detailsPanel.scrollTop = 0;
  if (centre) centreOnSelected();
  if (window.innerWidth < 700 || window.innerHeight < 520) els.mobileDetailsButton.hidden = false;
}

function applyTransform() {
  if (state.view === 'list') return;
  els.stage.style.transformOrigin = '0 0';
  els.stage.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
  els.zoomValue.value = `${Math.round(state.zoom * 100)}%`;
  els.zoomValue.textContent = `${Math.round(state.zoom * 100)}%`;
}

function setZoom(next, focusX, focusY) {
  const old = state.zoom;
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
  const rect = els.viewport.getBoundingClientRect();
  const px = focusX ?? rect.width / 2;
  const py = focusY ?? rect.height / 2;
  const stageX = (px - state.panX) / old;
  const stageY = (py - state.panY) / old;
  state.zoom = zoom;
  state.panX = px - stageX * zoom;
  state.panY = py - stageY * zoom;
  applyTransform();
}

function fitTree() {
  if (state.view === 'list') return;
  const width = parseFloat(els.stage.style.width) || 900;
  const height = parseFloat(els.stage.style.height) || 650;
  const rect = els.viewport.getBoundingClientRect();
  const padding = 54;
  const zoom = Math.min(1, Math.max(MIN_ZOOM, Math.min((rect.width - padding * 2) / width, (rect.height - padding * 2) / height)));
  state.zoom = zoom;
  state.panX = (rect.width - width * zoom) / 2;
  state.panY = Math.max(26, (rect.height - height * zoom) / 2);
  applyTransform();
}

function autoArrangeTree() {
  if (state.view === 'list') setView('family');
  else renderTree();
  requestAnimationFrame(() => {
    fitTree();
    toast('Tree spacing arranged');
  });
}

function centreOnSelected() {
  const pos = state.positions.get(state.selectedId);
  if (!pos || state.view === 'list') return;
  const rect = els.viewport.getBoundingClientRect();
  state.panX = rect.width / 2 - (pos.x + CARD_W / 2) * state.zoom;
  state.panY = rect.height / 2 - (pos.y + CARD_H / 2) * state.zoom;
  applyTransform();
}

function setConnectionStatus(label, status = '') {
  els.connectionStatus.textContent = label;
  els.connectionStatus.className = `connection-status${status ? ` ${status}` : ''}`;
}

function automaticSurnameForForm() {
  const defaultResult = { surname: config.defaultFamilySurname, source: `${config.defaultFamilySurname} family root` };
  const gender = els.personGender.value;

  if (state.editingId) {
    const person = personById(state.editingId);
    if (!person) return defaultResult;
    if (gender === 'female') {
      const husband = getPartners(person.id).find(partner => partner.gender === 'male');
      if (husband) return { surname: husband.lastName || config.defaultFamilySurname, source: `Husband: ${husband.fullName}` };
    }
    const father = getParents(person.id).find(parent => parent.gender === 'male');
    if (father) return { surname: father.lastName || config.defaultFamilySurname, source: `Father: ${father.fullName}` };
    return { surname: person.lastName || config.defaultFamilySurname, source: person.surnameSource || 'Existing family surname' };
  }

  const anchor = personById(state.addAnchorId);
  if (!anchor) return defaultResult;
  if (state.addRelationship === 'child') {
    const father = anchor.gender === 'male' ? anchor : getPartners(anchor.id).find(partner => partner.gender === 'male');
    const source = father || anchor;
    return { surname: source.lastName || config.defaultFamilySurname, source: `${father ? 'Father' : 'Connected parent'}: ${source.fullName}` };
  }
  if (state.addRelationship === 'sibling') {
    return { surname: anchor.lastName || config.defaultFamilySurname, source: `Shared family with ${anchor.fullName}` };
  }
  if (state.addRelationship === 'partner' && gender === 'female' && anchor.gender === 'male') {
    return { surname: anchor.lastName || config.defaultFamilySurname, source: `Husband: ${anchor.fullName}` };
  }
  if (state.addRelationship === 'parent' && gender === 'female') {
    const husband = getParents(anchor.id).find(parent => parent.gender === 'male');
    if (husband) return { surname: husband.lastName || config.defaultFamilySurname, source: `Husband: ${husband.fullName}` };
  }
  return defaultResult;
}

function showUsefulInitialView() {
  if (window.innerWidth < 700 || window.innerHeight < 520) {
    state.zoom = Math.max(0.58, state.zoom);
    centreOnSelected();
  } else {
    fitTree();
  }
}

function updateAutomaticNameFields(forceSurname = false) {
  els.personMiddleName.value = middleNameForGender(els.personGender.value);
  const automatic = automaticSurnameForForm();
  if (forceSurname || !state.lastNameEdited) els.personLastName.value = automatic.surname;
  els.surnameHint.textContent = `Suggested surname · ${automatic.source}. You can change it.`;
}

function clearPhotoPreview() {
  if (state.photoPreviewUrl) URL.revokeObjectURL(state.photoPreviewUrl);
  state.photoPreviewUrl = '';
}

function requireConnectedTree() {
  if (state.treeConnected) return true;
  toast('Your family tree is still connecting. Please try again in a moment.');
  return false;
}

function clearTreeView() {
  state.tree = {
    id: config.defaultTreeId,
    name: config.defaultTreeName,
    people: [],
    relationships: []
  };
  state.treeConnected = false;
  state.selectedId = null;
  renderAll();
  requestAnimationFrame(fitTree);
}

async function loadSingleTree() {
  const tree = await familyService.loadTree(config.defaultTreeId);
  if (state.stopTreeSubscription) await state.stopTreeSubscription();
  state.tree = tree;
  state.treeConnected = true;
  state.selectedId = tree.people.some(person => person.id === state.selectedId) ? state.selectedId : tree.people[0]?.id || null;
  renderAll();
  requestAnimationFrame(showUsefulInitialView);
  setSyncedStatus();
  state.stopTreeSubscription = await familyService.subscribeToTree(tree.id, () => {
    clearTimeout(state.realtimeReloadTimer);
    state.realtimeReloadTimer = setTimeout(async () => {
      try {
        const selectedId = state.selectedId;
        state.tree = await familyService.loadTree(tree.id);
        state.selectedId = state.tree.people.some(person => person.id === selectedId) ? selectedId : state.tree.people[0]?.id || null;
        renderAll();
        setSyncedStatus();
        toast('Family tree updated');
      } catch (error) {
        console.error(error);
        setConnectionStatus('Sync paused', 'waiting');
      }
    }, 300);
  });
}

function openRelationshipDialog(anchorId) {
  if (!requireEditor()) return;
  const person = personById(anchorId);
  if (!person) return;
  state.addAnchorId = anchorId;
  state.addRelationship = null;
  els.relationshipTitle.textContent = `Add someone related to ${person.fullName.split(' ')[0]}`;
  els.relationshipSubtitle.textContent = 'What is their relationship?';
  els.relationshipDialog.showModal();
}

function configureRelationshipOptions() {
  const anchor = personById(state.addAnchorId);
  const partners = anchor ? getPartners(anchor.id) : [];
  const siblings = anchor ? getSiblings(anchor.id) : [];
  const showCoParent = state.addRelationship === 'child' && partners.length > 0;
  const showSharedParent = state.addRelationship === 'parent' && siblings.length > 0;
  els.relationshipOptions.hidden = !showCoParent && !showSharedParent;
  els.coParentField.hidden = !showCoParent;
  els.sharedParentField.hidden = !showSharedParent;
  els.coParent.innerHTML = '<option value="">No other parent</option>' + partners
    .map(partner => `<option value="${partner.id}">${escapeHtml(partner.fullName)}</option>`).join('');
  if (partners.length === 1) els.coParent.value = partners[0].id;
  els.sharedParent.checked = true;
  if (showSharedParent) {
    els.sharedParentLabel.textContent = `Also connect this parent to ${siblings.length === 1 ? siblings[0].fullName : `${siblings.length} siblings`}`;
  }
}

function openPersonDialog() {
  if (!requireEditor()) return;
  const anchor = personById(state.addAnchorId);
  state.editingId = null;
  clearPhotoPreview();
  state.photoFile = null;
  state.photoProcessing = null;
  state.relationshipWarningConfirmed = false;
  els.personSubmit.textContent = 'Save';
  els.personDialogTitle.textContent = state.addRelationship ? `Add a ${state.addRelationship}` : 'Add person';
  els.personDialogSubtitle.textContent = anchor ? `This person will be connected to ${anchor.fullName}.` : 'Add their basic details. You can add more later.';
  els.personForm.reset();
  state.lastNameEdited = false;
  els.personLiving.checked = true;
  els.personDeath.disabled = true;
  els.personDobPrecision.value = 'unknown';
  els.personDeathPrecision.value = 'unknown';
  updateDateControl(els.personDobPrecision, els.personDob, els.personDobValueLabel, 'Date of birth');
  updateDateControl(els.personDeathPrecision, els.personDeath, els.personDeathValueLabel, 'Date of death');
  configureRelationshipOptions();
  updateAutomaticNameFields(true);
  els.photoPreview.innerHTML = '<span>＋</span><small>Add photo</small>';
  els.formStatus.textContent = '';
  els.personDialog.showModal();
}

function openEditDialog(personId) {
  if (!requireEditor()) return;
  const person = personById(personId);
  if (!person) return;
  els.personForm.reset();
  state.editingId = personId;
  state.addAnchorId = null;
  state.addRelationship = null;
  state.relationshipWarningConfirmed = false;
  els.personSubmit.textContent = 'Save';
  els.personDialogTitle.textContent = 'Edit person';
  els.personDialogSubtitle.textContent = `Update ${person.fullName}'s profile.`;
  const name = structuredNameFor(person);
  els.personFirstName.value = name.firstName;
  els.personLastName.value = name.lastName;
  els.personGender.value = name.gender;
  state.lastNameEdited = true;
  updateAutomaticNameFields();
  els.personDobPrecision.value = person.dateOfBirthPrecision || (person.dateOfBirth ? 'day' : 'unknown');
  els.personDob.value = dateInputValue(person.dateOfBirth, els.personDobPrecision.value);
  els.personAge.value = person.estimatedAge ?? '';
  els.personLiving.checked = !person.isDeceased;
  els.personDeathPrecision.value = person.dateOfDeathPrecision || (person.dateOfDeath ? 'day' : 'unknown');
  els.personDeath.value = dateInputValue(person.dateOfDeath, els.personDeathPrecision.value);
  els.personDeath.disabled = els.personLiving.checked;
  updateDateControl(els.personDobPrecision, els.personDob, els.personDobValueLabel, 'Date of birth');
  updateDateControl(els.personDeathPrecision, els.personDeath, els.personDeathValueLabel, 'Date of death');
  els.relationshipOptions.hidden = true;
  els.personBirthplace.value = person.birthplace || '';
  els.personAbout.value = person.about || '';
  clearPhotoPreview();
  state.photoFile = null;
  state.photoProcessing = null;
  els.photoPreview.innerHTML = person.photoUrl ? `<img src="${escapeHtml(person.photoUrl)}" alt="Preview">` : '<span>＋</span><small>Add photo</small>';
  els.formStatus.textContent = '';
  els.personDialog.showModal();
}

function requireEditor() {
  if (state.isEditor) return true;
  toast('This tree is view only. Open your private invitation link to edit.');
  return false;
}

function setSyncedStatus() {
  const label = state.accessRole === 'owner' ? 'Owner' : state.accessRole === 'editor' ? 'Editor' : 'Viewer';
  setConnectionStatus(`Synced · ${label}`, 'connected');
}

async function ownerLoginFromForm(event) {
  event.preventDefault();
  els.ownerLoginSubmit.disabled = true;
  els.ownerLoginStatus.textContent = 'Signing in…';
  try {
    const access = await signInOwner(els.ownerEmail.value, els.ownerPassword.value);
    applyAccess(access);
    els.ownerLoginDialog.close();
    await loadSingleTree();
    toast('Owner access restored');
  } catch (error) {
    console.error(error);
    els.ownerLoginStatus.textContent = error?.message || 'Unable to sign in.';
  } finally {
    els.ownerLoginSubmit.disabled = false;
    els.ownerPassword.value = '';
  }
}

async function signOutCurrentAccess() {
  try {
    await signOutFamilyAccess();
    applyAccess({ role: null });
    clearTreeView();
    els.settingsDialog.close();
    setConnectionStatus('Private', 'waiting');
    toast('Signed out on this device');
  } catch (error) {
    toast(error?.message || 'Unable to sign out.');
  }
}

function openSettings() {
  els.settingsTheme.value = currentTheme();
  els.settingsGenerationBands.checked = state.showGenerationBands;
  els.settingsAutoArrange.checked = state.autoArrangeAfterChanges;
  els.settingsDialog.showModal();
}

function openDeleteDialog(personId) {
  if (!requireEditor() || !requireConnectedTree()) return;
  const person = personById(personId);
  if (!person) return;
  state.deletingId = personId;
  els.deletePersonTitle.textContent = `Delete ${person.fullName}?`;
  els.deletePersonSubtitle.textContent = 'This permanently removes this person and their connections from the tree.';
  els.deleteConfirmation.value = '';
  els.confirmDeleteButton.disabled = true;
  els.deleteFormStatus.textContent = '';
  els.deletePersonDialog.showModal();
  requestAnimationFrame(() => els.deleteConfirmation.focus());
}

async function deletePersonFromTree(event) {
  event.preventDefault();
  if (els.deleteConfirmation.value !== 'DELETE') {
    els.deleteFormStatus.textContent = 'Type DELETE exactly to continue.';
    return;
  }
  const person = personById(state.deletingId);
  if (!person || !requireConnectedTree()) return;

  const connectedId = state.tree.relationships
    .find(rel => rel.personAId === person.id || rel.personBId === person.id);
  const fallbackId = connectedId
    ? (connectedId.personAId === person.id ? connectedId.personBId : connectedId.personAId)
    : state.tree.people.find(candidate => candidate.id !== person.id)?.id || null;

  els.confirmDeleteButton.disabled = true;
  els.deleteFormStatus.textContent = 'Deleting…';
  try {
    await familyService.deletePerson(state.tree.id, person.id, person.photoPath);
    state.tree.people = state.tree.people.filter(candidate => candidate.id !== person.id);
    state.tree.relationships = state.tree.relationships.filter(rel => rel.personAId !== person.id && rel.personBId !== person.id);
    state.selectedId = fallbackId;
    state.deletingId = null;
    els.deletePersonDialog.close();
    els.detailsPanel.classList.remove('mobile-open');
    renderAll();
    if (state.selectedId) requestAnimationFrame(() => centreOnSelected());
    toast(`${person.fullName} deleted`);
  } catch (error) {
    console.error(error);
    els.deleteFormStatus.textContent = error?.message || 'Unable to delete this person. Please try again.';
    els.confirmDeleteButton.disabled = els.deleteConfirmation.value !== 'DELETE';
  }
}

async function savePersonFromForm(event) {
  event.preventDefault();
  els.formStatus.textContent = 'Saving…';
  try {
    if (state.photoProcessing) await state.photoProcessing;
    const firstName = els.personFirstName.value.trim();
    const lastName = els.personLastName.value.trim();
    const gender = els.personGender.value;
    const fullName = composeFullName(firstName, gender, lastName);
    if (!firstName || !gender || !fullName) throw new Error('Add a first name and choose Male or Female.');
    const dateOfBirthPrecision = els.personDobPrecision.value;
    const dateOfDeathPrecision = els.personLiving.checked ? 'unknown' : els.personDeathPrecision.value;
    const dateOfBirth = parseDateInput(els.personDob.value, dateOfBirthPrecision);
    const dateOfDeath = els.personLiving.checked ? null : parseDateInput(els.personDeath.value, dateOfDeathPrecision);
    if (dateOfBirth && dateOfDeath && dateOfDeath < dateOfBirth) throw new Error('Date of death cannot be before date of birth.');
    const payload = {
      fullName,
      firstName,
      lastName,
      gender,
      dateOfBirth,
      dateOfBirthPrecision,
      estimatedAge: els.personAge.value ? Number(els.personAge.value) : null,
      isDeceased: !els.personLiving.checked,
      dateOfDeath,
      dateOfDeathPrecision,
      birthplace: els.personBirthplace.value.trim(),
      about: els.personAbout.value.trim()
    };

    if (!state.editingId && state.addAnchorId && state.addRelationship) {
      const anchor = personById(state.addAnchorId);
      const warnings = relationshipWarnings({
        anchor,
        relative: payload,
        relationship: state.addRelationship,
        existingParents: getParents(state.addAnchorId)
      });
      if (warnings.length && !state.relationshipWarningConfirmed) {
        state.relationshipWarningConfirmed = true;
        els.formStatus.textContent = `${warnings.join(' ')} Review this, then choose Save anyway.`;
        els.personSubmit.textContent = 'Save anyway';
        return;
      }
    }

    let photoWarning = '';

    if (state.editingId) {
      const currentPerson = personById(state.editingId);
      const currentPhotoUrl = currentPerson.photoUrl || '';
      const updated = await familyService.updatePerson(state.tree.id, state.editingId, payload);
      Object.assign(currentPerson, updated, { photoUrl: currentPhotoUrl });
      if (state.photoFile) {
        try {
          Object.assign(currentPerson, await familyService.uploadPersonPhoto(state.tree.id, state.editingId, state.photoFile, currentPerson.photoPath));
        } catch (error) {
          console.error(error);
          photoWarning = 'Profile saved, but the photo could not be uploaded.';
        }
      }
      state.selectedId = state.editingId;
      toast('Person updated');
    } else {
      const created = await familyService.createPerson(state.tree.id, payload);
      const localCreated = { ...created };
      state.tree.people.push(localCreated);
      if (state.addAnchorId && state.addRelationship) {
        try {
          await addRelationshipForNewPerson(state.addAnchorId, localCreated.id, state.addRelationship);
        } catch (relationshipError) {
          state.tree.people = state.tree.people.filter(person => person.id !== localCreated.id);
          state.tree.relationships = state.tree.relationships.filter(rel => rel.personAId !== localCreated.id && rel.personBId !== localCreated.id);
          try {
            await familyService.deletePerson(state.tree.id, localCreated.id);
          } catch (rollbackError) {
            console.error('Unable to roll back incomplete relative creation', rollbackError);
          }
          throw relationshipError;
        }
      }
      if (state.photoFile) {
        try {
          Object.assign(localCreated, await familyService.uploadPersonPhoto(state.tree.id, localCreated.id, state.photoFile));
        } catch (error) {
          console.error(error);
          photoWarning = 'Person saved, but the photo could not be uploaded.';
        }
      }
      state.selectedId = localCreated.id;
      toast('Person added');
    }
    els.personDialog.close();
    renderAll();
    requestAnimationFrame(() => state.autoArrangeAfterChanges ? fitTree() : centreOnSelected());
    if (photoWarning) toast(photoWarning);
  } catch (error) {
    els.formStatus.textContent = error?.message || 'Unable to save. Please try again.';
  }
}

async function addRelationshipForNewPerson(anchorId, newId, relationship) {
  const make = (type, personAId, personBId) => familyService.createRelationship(state.tree.id, { type, personAId, personBId });
  if (relationship === 'parent') {
    const rel = await make('parent_child', newId, anchorId); state.tree.relationships.push(rel);
    if (els.sharedParent.checked) {
      for (const sibling of getSiblings(anchorId)) {
        const alreadyConnected = state.tree.relationships.some(item => item.type === 'parent_child' && item.personAId === newId && item.personBId === sibling.id);
        if (!alreadyConnected) {
          const shared = await make('parent_child', newId, sibling.id);
          state.tree.relationships.push(shared);
        }
      }
    }
  } else if (relationship === 'child') {
    const rel = await make('parent_child', anchorId, newId); state.tree.relationships.push(rel);
    const partner = personById(els.coParent.value);
    if (partner) { const second = await make('parent_child', partner.id, newId); state.tree.relationships.push(second); }
  } else if (relationship === 'partner') {
    const rel = await make('partner', anchorId, newId); state.tree.relationships.push(rel);
  } else if (relationship === 'sibling') {
    const sibling = await make('sibling', anchorId, newId); state.tree.relationships.push(sibling);
    const parents = getParents(anchorId);
    for (const parent of parents) { const rel = await make('parent_child', parent.id, newId); state.tree.relationships.push(rel); }
  }
}

function setView(view) {
  state.view = view;
  document.querySelectorAll('.view-tab').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  renderTree();
  if (view !== 'list') requestAnimationFrame(fitTree);
}

function handleSearch(query) {
  const q = query.trim().toLowerCase();
  if (!q || !state.tree) {
    els.searchResults.hidden = true;
    els.searchResults.innerHTML = '';
    return;
  }
  const matches = state.tree.people.filter(p => p.fullName.toLowerCase().includes(q)).slice(0, 8);
  els.searchResults.innerHTML = matches.length ? matches.map(p => `<button type="button" data-search-id="${p.id}">${avatarMarkup(p, 'mini-avatar search-avatar')}<span><strong>${escapeHtml(p.fullName)}</strong><small>${escapeHtml(formattedAge(p))}</small></span></button>`).join('') : '<div class="no-results">No people found</div>';
  els.searchResults.hidden = false;
  els.searchResults.querySelectorAll('[data-search-id]').forEach(button => button.addEventListener('click', () => {
    els.search.value = '';
    els.searchResults.hidden = true;
    if (state.view === 'list') setView('family');
    selectPerson(button.dataset.searchId, true);
  }));
}

function toast(message) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  els.toastRegion.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

function renderAll() {
  applyAutomaticNames();
  els.familyName.textContent = state.tree?.name || 'Family Tree';
  els.addPersonButton.hidden = !state.isEditor;
  els.inviteEditorButton.hidden = state.accessRole !== 'owner';
  renderTree();
  renderDetails();
}

async function createInvitationFromForm(event) {
  event.preventDefault();
  if (state.accessRole !== 'owner') {
    toast('Only the owner can create private links.');
    return;
  }
  const requestedCount = Number(els.inviteCount.value);
  const inviteCount = Number.isInteger(requestedCount) ? Math.min(5, Math.max(1, requestedCount)) : 1;
  const inviteRole = els.inviteRole.value;
  els.createInviteButton.disabled = true;
  els.inviteResult.hidden = true;
  els.inviteLinksOutput.replaceChildren();
  try {
    els.inviteFormStatus.textContent = `Creating ${inviteCount} secure ${inviteRole} ${inviteCount === 1 ? 'link' : 'links'}…`;
    const invitations = await createFamilyInvitations(inviteRole, Number(els.inviteDuration.value), inviteCount);
    renderInvitationLinks(invitations);
    els.inviteResult.hidden = false;
    const expiry = invitations[0].expiresAt
      ? `access ends ${new Date(invitations[0].expiresAt).toLocaleString('en-GB')}`
      : 'viewer access does not expire';
    els.inviteFormStatus.textContent = `${invitations.length} private ${inviteRole} ${invitations.length === 1 ? 'link' : 'links'} created · ${expiry}.`;
  } catch (error) {
    console.error(error);
    els.inviteFormStatus.textContent = error?.message || 'Unable to create an invitation.';
  } finally {
    els.createInviteButton.disabled = false;
  }
}

function renderInvitationLinks(invitations) {
  els.inviteLinksOutput.replaceChildren(...invitations.map((invitation, index) => {
    const row = document.createElement('div');
    row.className = 'invite-link-row';
    const input = document.createElement('input');
    input.type = 'text';
    input.readOnly = true;
    input.value = invitation.inviteUrl;
    input.setAttribute('aria-label', `${invitation.role || 'Family'} link ${index + 1}`);
    const button = document.createElement('button');
    button.className = 'secondary-button';
    button.type = 'button';
    button.textContent = 'Copy';
    button.addEventListener('click', () => copyInvitationLink(invitation.inviteUrl, input, button));
    row.append(input, button);
    return row;
  }));
}

async function copyInvitationLink(link, input, button) {
  if (!link) return;
  try {
    await navigator.clipboard.writeText(link);
  } catch {
    input.select();
    document.execCommand('copy');
  }
  button.textContent = 'Copied';
  setTimeout(() => { button.textContent = 'Copy'; }, 1800);
  els.inviteFormStatus.textContent = 'Link copied. Send it privately to one person.';
}

function bindEvents() {
  applyTheme(currentTheme());
  els.themeToggleButton.addEventListener('click', () => applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', true));
  els.settingsButton.addEventListener('click', openSettings);
  els.gateOwnerLoginButton.addEventListener('click', openOwnerLogin);
  els.settingsOwnerLoginButton.addEventListener('click', () => {
    els.settingsDialog.close();
    openOwnerLogin();
  });
  els.settingsSignOutButton.addEventListener('click', signOutCurrentAccess);
  els.ownerLoginForm.addEventListener('submit', ownerLoginFromForm);
  els.settingsTheme.addEventListener('change', () => applyTheme(els.settingsTheme.value, true));
  els.settingsGenerationBands.addEventListener('change', () => {
    state.showGenerationBands = els.settingsGenerationBands.checked;
    document.querySelector('#generationBandsButton').setAttribute('aria-pressed', String(state.showGenerationBands));
    document.querySelector('#generationBandsButton').classList.toggle('active', state.showGenerationBands);
    savePreferences();
    renderTree();
  });
  els.settingsAutoArrange.addEventListener('change', () => {
    state.autoArrangeAfterChanges = els.settingsAutoArrange.checked;
    savePreferences();
  });
  document.querySelectorAll('.view-tab').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
  document.querySelector('#addPersonButton').addEventListener('click', () => {
    if (!requireEditor() || !requireConnectedTree()) return;
    if (state.selectedId) openRelationshipDialog(state.selectedId);
    else {
      state.addAnchorId = null;
      state.addRelationship = null;
      openPersonDialog();
    }
  });
  document.querySelector('#familyMenuButton').addEventListener('click', () => {
    if (state.view !== 'list') fitTree();
  });
  document.querySelector('#zoomInButton').addEventListener('click', () => setZoom(state.zoom + 0.12));
  document.querySelector('#zoomOutButton').addEventListener('click', () => setZoom(state.zoom - 0.12));
  document.querySelector('#fitButton').addEventListener('click', fitTree);
  document.querySelector('#autoLayoutButton').addEventListener('click', autoArrangeTree);
  document.querySelector('#generationBandsButton').addEventListener('click', event => {
    state.showGenerationBands = !state.showGenerationBands;
    event.currentTarget.setAttribute('aria-pressed', String(state.showGenerationBands));
    event.currentTarget.classList.toggle('active', state.showGenerationBands);
    els.settingsGenerationBands.checked = state.showGenerationBands;
    savePreferences();
    renderTree();
    toast(`Generation colours ${state.showGenerationBands ? 'shown' : 'hidden'}`);
  });
  els.inviteEditorButton.addEventListener('click', () => {
    if (state.accessRole !== 'owner') return;
    els.inviteResult.hidden = true;
    els.inviteLinksOutput.replaceChildren();
    els.inviteFormStatus.textContent = '';
    els.inviteEditorDialog.showModal();
  });
  els.inviteEditorForm.addEventListener('submit', createInvitationFromForm);
  els.inviteRole.addEventListener('change', () => {
    const viewer = els.inviteRole.value === 'viewer';
    els.inviteDurationField.hidden = viewer;
    els.createInviteButton.textContent = `Create ${viewer ? 'viewer' : 'editor'} links`;
  });
  document.querySelector('#centreButton').addEventListener('click', centreOnSelected);
  els.search.addEventListener('input', () => handleSearch(els.search.value));
  els.search.addEventListener('keydown', event => { if (event.key === 'Escape') { els.search.value = ''; els.searchResults.hidden = true; } });
  document.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); els.search.focus(); }
  });

  els.relationshipDialog.querySelectorAll('[data-relationship]').forEach(button => button.addEventListener('click', () => {
    state.addRelationship = button.dataset.relationship;
    els.relationshipDialog.close();
    openPersonDialog();
  }));
  document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => document.querySelector(`#${button.dataset.closeDialog}`).close()));
  els.personDialog.addEventListener('close', clearPhotoPreview);
  els.personForm.addEventListener('submit', savePersonFromForm);
  els.personForm.addEventListener('input', event => {
    if (event.target === els.personSubmit || !state.relationshipWarningConfirmed) return;
    state.relationshipWarningConfirmed = false;
    els.personSubmit.textContent = 'Save';
  });
  els.personGender.addEventListener('change', () => updateAutomaticNameFields());
  els.personLastName.addEventListener('input', () => {
    state.lastNameEdited = true;
    const automatic = automaticSurnameForForm();
    els.surnameHint.textContent = `Suggested surname · ${automatic.surname} from ${automatic.source}. Your entry will be saved.`;
  });
  els.deletePersonForm.addEventListener('submit', deletePersonFromTree);
  els.deleteConfirmation.addEventListener('input', () => {
    const confirmed = els.deleteConfirmation.value === 'DELETE';
    els.confirmDeleteButton.disabled = !confirmed;
    els.deleteFormStatus.textContent = confirmed ? 'Ready to delete.' : '';
  });
  els.deletePersonDialog.addEventListener('close', () => {
    state.deletingId = null;
    els.deleteConfirmation.value = '';
    els.deleteFormStatus.textContent = '';
  });
  els.personLiving.addEventListener('change', () => {
    if (els.personLiving.checked) {
      els.personDeathPrecision.value = 'unknown';
      els.personDeath.value = '';
    }
    updateDateControl(els.personDeathPrecision, els.personDeath, els.personDeathValueLabel, 'Date of death');
    els.personDeath.disabled = els.personLiving.checked || els.personDeathPrecision.value === 'unknown';
  });
  els.personDobPrecision.addEventListener('change', () => updateDateControl(els.personDobPrecision, els.personDob, els.personDobValueLabel, 'Date of birth'));
  els.personDeathPrecision.addEventListener('change', () => {
    updateDateControl(els.personDeathPrecision, els.personDeath, els.personDeathValueLabel, 'Date of death');
    els.personDeath.disabled = els.personLiving.checked || els.personDeathPrecision.value === 'unknown';
  });
  els.personPhoto.addEventListener('change', event => {
    const file = event.target.files?.[0];
    if (!file) return;
    els.formStatus.textContent = 'Optimising photo…';
    const processing = optimisePhoto(file);
    state.photoProcessing = processing;
    processing.then(optimised => {
      if (state.photoProcessing !== processing) return;
      state.photoFile = optimised;
      clearPhotoPreview();
      state.photoPreviewUrl = URL.createObjectURL(optimised);
      els.photoPreview.innerHTML = `<img src="${escapeHtml(state.photoPreviewUrl)}" alt="Preview">`;
      const savedPercent = file.size ? Math.max(0, Math.round((1 - optimised.size / file.size) * 100)) : 0;
      els.formStatus.textContent = `Photo ready as WebP${savedPercent ? ` · ${savedPercent}% smaller` : ''}.`;
    }).catch(error => {
      if (state.photoProcessing !== processing) return;
      state.photoFile = null;
      els.formStatus.textContent = error?.message || 'This photo could not be prepared.';
    }).finally(() => {
      if (state.photoProcessing === processing) state.photoProcessing = null;
    });
  });

  document.querySelector('#closeDetailsButton').addEventListener('click', () => {
    els.detailsPanel.classList.remove('mobile-open');
  });
  els.mobileDetailsButton.addEventListener('click', () => els.detailsPanel.classList.add('mobile-open'));

  els.viewport.addEventListener('wheel', event => {
    if (state.view === 'list') return;
    event.preventDefault();
    const rect = els.viewport.getBoundingClientRect();
    setZoom(state.zoom * (event.deltaY < 0 ? 1.08 : 0.92), event.clientX - rect.left, event.clientY - rect.top);
  }, { passive: false });

  els.viewport.addEventListener('pointerdown', event => {
    if (state.view === 'list' || event.button !== 0) return;
    if (event.pointerType === 'touch') {
      state.touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      els.viewport.setPointerCapture(event.pointerId);
      if (state.touchPointers.size === 2) {
        const [first, second] = [...state.touchPointers.values()];
        const rect = els.viewport.getBoundingClientRect();
        const midX = (first.x + second.x) / 2 - rect.left;
        const midY = (first.y + second.y) / 2 - rect.top;
        state.pinch = {
          distance: Math.hypot(second.x - first.x, second.y - first.y),
          zoom: state.zoom,
          stageX: (midX - state.panX) / state.zoom,
          stageY: (midY - state.panY) / state.zoom
        };
        state.drag = null;
      }
    }
    if (event.target.closest('.person-node')) return;
    els.viewport.setPointerCapture(event.pointerId);
    state.drag = { x: event.clientX, y: event.clientY, panX: state.panX, panY: state.panY };
    els.viewport.classList.add('dragging');
  });
  els.viewport.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch' && state.touchPointers.has(event.pointerId)) {
      state.touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (state.pinch && state.touchPointers.size >= 2) {
        const [first, second] = [...state.touchPointers.values()];
        const rect = els.viewport.getBoundingClientRect();
        const midX = (first.x + second.x) / 2 - rect.left;
        const midY = (first.y + second.y) / 2 - rect.top;
        const distance = Math.hypot(second.x - first.x, second.y - first.y);
        const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, state.pinch.zoom * distance / Math.max(1, state.pinch.distance)));
        state.zoom = zoom;
        state.panX = midX - state.pinch.stageX * zoom;
        state.panY = midY - state.pinch.stageY * zoom;
        applyTransform();
        return;
      }
    }
    if (!state.drag) return;
    state.panX = state.drag.panX + event.clientX - state.drag.x;
    state.panY = state.drag.panY + event.clientY - state.drag.y;
    applyTransform();
  });
  const stopDrag = event => {
    state.touchPointers.delete(event.pointerId);
    if (state.touchPointers.size < 2) state.pinch = null;
    state.drag = null;
    els.viewport.classList.remove('dragging');
  };
  els.viewport.addEventListener('pointerup', stopDrag);
  els.viewport.addEventListener('pointercancel', stopDrag);

  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (window.innerWidth >= 700 && window.innerHeight >= 520) els.detailsPanel.classList.remove('mobile-open');
      els.mobileDetailsButton.hidden = !state.selectedId || (window.innerWidth >= 700 && window.innerHeight >= 520);
      if (!state.treeConnected || state.view === 'list') return;
      renderTree();
      if (window.innerWidth < 700 || window.innerHeight < 520) {
        state.zoom = Math.max(0.58, state.zoom);
        if (state.selectedId) centreOnSelected();
        else fitTree();
      } else {
        fitTree();
      }
    }, 140);
  });
}

async function init() {
  loadPreferences();
  bindEvents();
  document.querySelector('#generationBandsButton').setAttribute('aria-pressed', String(state.showGenerationBands));
  document.querySelector('#generationBandsButton').classList.toggle('active', state.showGenerationBands);
  els.settingsGenerationBands.checked = state.showGenerationBands;
  els.settingsAutoArrange.checked = state.autoArrangeAfterChanges;
  applyAccess({ role: null });
  clearTreeView();
  try {
    const invitationToken = invitationTokenFromUrl();
    if (invitationToken) {
      setConnectionStatus('Unlocking access…', 'waiting');
      try {
        const access = await claimFamilyInvitation(invitationToken);
        applyAccess(access);
        toast(access.alreadyMember ? 'Family access restored' : `Private ${access.role} invitation accepted`);
      } catch (error) {
        console.error(error);
        toast('This invitation is invalid, expired, or has already been used.');
      } finally {
        clearInvitationFromAddress();
      }
      if (!state.accessRole) applyAccess(await getFamilyAccess());
    } else {
      applyAccess(await getFamilyAccess());
    }
    if (state.accessRole) {
      await loadSingleTree();
    } else {
      setConnectionStatus('Private', 'waiting');
    }
  } catch (error) {
    console.error(error);
    clearTreeView();
    setConnectionStatus('Connection error', 'waiting');
    els.emptyState.hidden = false;
    els.emptyState.querySelector('h2').textContent = 'Unable to load family tree';
    els.emptyState.querySelector('p').textContent = error?.message || 'Please check your connection and configuration.';
  }
}

init();
