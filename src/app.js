import { familyService } from './services/family-service.js';
import { config } from './config.js';

const CARD_W = 136;
const CARD_H = 192;
const PHOTO_H = 142;
const PARTNER_GAP = 58;
const GROUP_GAP = 86;
const ROW_GAP = 118;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 1.65;

const state = {
  tree: null,
  selectedId: 'arjan',
  view: 'family',
  zoom: 1,
  panX: 0,
  panY: 0,
  positions: new Map(),
  filteredIds: null,
  addAnchorId: null,
  addRelationship: null,
  editingId: null,
  undo: [],
  redo: [],
  drag: null,
  photoDataUrl: '',
  photoFile: null,
  session: null,
  stopTreeSubscription: null,
  realtimeReloadTimer: null,
  authLoadId: 0
};

const els = {
  familyName: document.querySelector('#familyName'),
  viewport: document.querySelector('#treeViewport'),
  stage: document.querySelector('#treeStage'),
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
  personForm: document.querySelector('#personForm'),
  personName: document.querySelector('#personNameInput'),
  personDob: document.querySelector('#personDobInput'),
  personAge: document.querySelector('#personAgeInput'),
  personLiving: document.querySelector('#personLivingInput'),
  personDeath: document.querySelector('#personDeathInput'),
  personBirthplace: document.querySelector('#personBirthplaceInput'),
  personAbout: document.querySelector('#personAboutInput'),
  personPhoto: document.querySelector('#personPhotoInput'),
  photoPreview: document.querySelector('#photoPreview'),
  formStatus: document.querySelector('#formStatus'),
  undoButton: document.querySelector('#undoButton'),
  redoButton: document.querySelector('#redoButton'),
  toastRegion: document.querySelector('#toastRegion'),
  connectionStatus: document.querySelector('#connectionStatus'),
  authDialog: document.querySelector('#authDialog'),
  authForm: document.querySelector('#authForm'),
  authEmail: document.querySelector('#authEmailInput'),
  authStatus: document.querySelector('#authStatus'),
  treeDialog: document.querySelector('#treeDialog'),
  treeList: document.querySelector('#treeList'),
  createTreeForm: document.querySelector('#createTreeForm'),
  treeName: document.querySelector('#treeNameInput'),
  treeStatus: document.querySelector('#treeStatus'),
  accountDialog: document.querySelector('#accountDialog'),
  accountEmail: document.querySelector('#accountEmail')
};

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

function getSiblings(id) {
  const parentIds = getParents(id).map(p => p.id);
  if (!parentIds.length) return [];
  return state.tree.people.filter(person => {
    if (person.id === id) return false;
    const theirParents = getParents(person.id).map(p => p.id);
    return theirParents.some(pid => parentIds.includes(pid));
  });
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
  return Number.isFinite(Number(person.estimatedAge)) ? Number(person.estimatedAge) : null;
}

function formattedAge(person) {
  if (person.isDeceased && person.dateOfBirth) {
    const birthYear = person.dateOfBirth.slice(0, 4);
    const deathYear = person.dateOfDeath?.slice(0, 4) || '—';
    return `${birthYear}–${deathYear}`;
  }
  const age = ageFor(person);
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

  // Keep partners on the same visual generation, preferring the deeper known generation.
  for (let pass = 0; pass < 3; pass += 1) {
    for (const rel of state.tree.relationships.filter(r => r.type === 'partner')) {
      const g = Math.max(gen.get(rel.personAId) ?? 0, gen.get(rel.personBId) ?? 0);
      gen.set(rel.personAId, g);
      gen.set(rel.personBId, g);
    }
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
    const partner = getPartners(person.id).find(p => ids.has(p.id) && !used.has(p.id));
    if (partner) {
      groups.push([person, partner]);
      used.add(person.id); used.add(partner.id);
    } else {
      groups.push([person]);
      used.add(person.id);
    }
  }
  return groups;
}

function layoutTree() {
  state.positions.clear();
  const genMap = determineGenerations();
  const visible = visibleIds();
  const generations = [...new Set([...genMap.entries()].filter(([id]) => visible.has(id)).map(([, g]) => g))].sort((a, b) => a - b);
  const rows = [];
  let maxWidth = 600;

  for (const g of generations) {
    const rowPeople = state.tree.people.filter(p => visible.has(p.id) && genMap.get(p.id) === g);
    const groups = makeGroups(rowPeople);
    const widths = groups.map(group => group.length === 2 ? CARD_W * 2 + PARTNER_GAP : CARD_W);
    const total = widths.reduce((a, b) => a + b, 0) + Math.max(0, groups.length - 1) * GROUP_GAP;
    maxWidth = Math.max(maxWidth, total + 220);
    rows.push({ g, groups, widths, total });
  }

  const stageWidth = Math.max(900, maxWidth);
  const topPadding = 74;
  const stageHeight = Math.max(650, topPadding + generations.length * (CARD_H + ROW_GAP) + 70);

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    let x = (stageWidth - row.total) / 2;
    const y = topPadding + rowIndex * (CARD_H + ROW_GAP);
    row.groups.forEach((group, index) => {
      const width = row.widths[index];
      if (group.length === 2) {
        state.positions.set(group[0].id, { x, y });
        state.positions.set(group[1].id, { x: x + CARD_W + PARTNER_GAP, y });
      } else {
        state.positions.set(group[0].id, { x: x + (width - CARD_W) / 2, y });
      }
      x += width + GROUP_GAP;
    });
  }

  els.stage.style.width = `${stageWidth}px`;
  els.stage.style.height = `${stageHeight}px`;
  els.relationshipLayer.setAttribute('viewBox', `0 0 ${stageWidth} ${stageHeight}`);
  els.relationshipLayer.setAttribute('width', stageWidth);
  els.relationshipLayer.setAttribute('height', stageHeight);
}

function nodeMarkup(person) {
  const photo = person.photoUrl
    ? `<img src="${escapeHtml(person.photoUrl)}" alt="" loading="lazy">`
    : `<div class="node-placeholder"><strong>${escapeHtml(initials(person.fullName))}</strong><small>Add photo</small></div>`;
  return `
    <div class="node-photo">${photo}</div>
    <div class="node-meta"><strong>${escapeHtml(person.fullName)}</strong><span>${escapeHtml(formattedAge(person))}</span></div>
    <button class="node-add" type="button" aria-label="Add relative to ${escapeHtml(person.fullName)}" data-add-person="${person.id}">＋</button>
  `;
}

function renderTree() {
  if (!state.tree) return;
  const visible = visibleIds();
  els.emptyState.hidden = state.tree.people.length > 0;
  els.stage.hidden = state.tree.people.length === 0 || state.view === 'list';
  els.nodeLayer.innerHTML = '';
  els.relationshipLayer.innerHTML = '';

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
    card.className = `person-node${person.id === state.selectedId ? ' selected' : ''}`;
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
    card.querySelector('.node-add').addEventListener('click', event => {
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
      <span class="mini-avatar">${escapeHtml(initials(person.fullName))}</span>
      <span><strong>${escapeHtml(person.fullName)}</strong><small>${escapeHtml(formattedAge(person))}</small></span>
      <span>›</span>
    </button>`).join('')}</div>`;
  els.nodeLayer.querySelectorAll('[data-list-person]').forEach(button => button.addEventListener('click', () => selectPerson(button.dataset.listPerson)));
  els.stage.style.transform = 'none';
}

function drawRelationships(visible) {
  const paths = [];
  const partnerPairs = new Set();

  for (const rel of state.tree.relationships) {
    if (!visible.has(rel.personAId) || !visible.has(rel.personBId)) continue;
    const a = state.positions.get(rel.personAId);
    const b = state.positions.get(rel.personBId);
    if (!a || !b) continue;
    if (rel.type === 'partner') {
      const key = [rel.personAId, rel.personBId].sort().join('|');
      if (partnerPairs.has(key)) continue;
      partnerPairs.add(key);
      const left = a.x < b.x ? a : b;
      const right = a.x < b.x ? b : a;
      const y = left.y + PHOTO_H * 0.64;
      paths.push(`<path class="partner-path" d="M ${left.x + CARD_W} ${y} L ${right.x} ${y}"/>`);
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
    const parentPositions = parentIds.map(id => state.positions.get(id)).filter(Boolean);
    if (!parentPositions.length) continue;
    const parentCentre = parentPositions.reduce((sum, pos) => sum + pos.x + CARD_W / 2, 0) / parentPositions.length;
    const parentBottom = Math.max(...parentPositions.map(pos => pos.y + CARD_H));
    const children = [...childSet].map(id => ({ id, pos: state.positions.get(id) })).filter(v => v.pos);
    if (!children.length) continue;
    const childTops = children.map(c => c.pos.y);
    const joinY = Math.min(...childTops) - 48;
    const childCentres = children.map(c => c.pos.x + CARD_W / 2);
    paths.push(`<path d="M ${parentCentre} ${parentBottom} L ${parentCentre} ${joinY}"/>`);
    if (children.length > 1) {
      paths.push(`<path d="M ${Math.min(...childCentres)} ${joinY} L ${Math.max(...childCentres)} ${joinY}"/>`);
    }
    for (const child of children) {
      const cx = child.pos.x + CARD_W / 2;
      paths.push(`<path d="M ${cx} ${joinY} L ${cx} ${child.pos.y}"/>`);
    }
  }

  els.relationshipLayer.innerHTML = `<g class="relationship-paths">${paths.join('')}</g>`;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function miniPeople(people) {
  if (!people.length) return '';
  return people.map(p => `<button type="button" class="relation-chip" data-related-person="${p.id}"><span class="mini-avatar">${escapeHtml(initials(p.fullName))}</span>${escapeHtml(p.fullName)}</button>`).join('');
}

function renderDetails() {
  const person = personById(state.selectedId);
  if (!person) {
    els.detailsContent.innerHTML = `<div class="panel-empty"><h2>Select someone</h2><p>Choose a person in the family tree to view their details.</p></div>`;
    return;
  }
  const parents = getParents(person.id);
  const siblings = getSiblings(person.id);
  const partners = getPartners(person.id);
  const children = getChildren(person.id);
  const photo = person.photoUrl ? `<img src="${escapeHtml(person.photoUrl)}" alt="Portrait of ${escapeHtml(person.fullName)}">` : `<div class="detail-photo-placeholder">${escapeHtml(initials(person.fullName))}</div>`;
  const dob = person.dateOfBirth ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(`${person.dateOfBirth}T00:00:00`)) : 'Not added';

  els.detailsContent.innerHTML = `
    <section class="profile-hero">
      <div class="detail-photo">${photo}</div>
      <div class="profile-summary"><h1>${escapeHtml(person.fullName)}</h1><p>${escapeHtml(formattedAge(person))}</p></div>
    </section>
    <section class="relationship-details">
      <h3>Parents</h3><div class="relation-list">${miniPeople(parents) || '<span class="empty-label">Not added</span>'}</div>
      <h3>Siblings</h3><div class="relation-list">${miniPeople(siblings) || '<span class="empty-label">None added</span>'}</div>
      <h3>Partner</h3><div class="relation-list">${miniPeople(partners) || `<button class="add-inline" type="button" data-inline-add="partner">＋ Add partner</button>`}</div>
      <h3>Children</h3><div class="relation-list">${miniPeople(children) || `<button class="add-inline" type="button" data-inline-add="child">＋ Add child</button>`}</div>
    </section>
    <section class="profile-actions">
      <button class="primary-button" type="button" id="panelAddRelative">＋ Add relative</button>
      <button class="secondary-button" type="button" id="panelEditPerson">✎ Edit person</button>
      <button class="secondary-button icon-only" type="button" aria-label="More actions">•••</button>
    </section>
    <section class="facts-grid">
      <div><span>Date of birth</span><strong>${escapeHtml(dob)}</strong></div>
      <div><span>Birthplace</span><strong>${escapeHtml(person.birthplace || 'Not added')}</strong></div>
      <div><span>About</span><strong class="about-text">${escapeHtml(person.about || 'Add a note…')}</strong></div>
    </section>
    <nav class="profile-tabs"><button class="active" type="button">Photos</button><button type="button">Facts</button><button type="button">Notes</button><button type="button">Activity</button></nav>
    <section class="photo-strip">
      <div class="photo-thumb">${photo}</div><button class="photo-add-tile" type="button">＋</button>
    </section>
  `;

  els.detailsContent.querySelectorAll('[data-related-person]').forEach(button => button.addEventListener('click', () => selectPerson(button.dataset.relatedPerson, true)));
  els.detailsContent.querySelectorAll('[data-inline-add]').forEach(button => button.addEventListener('click', () => {
    state.addAnchorId = person.id;
    state.addRelationship = button.dataset.inlineAdd;
    openPersonDialog();
  }));
  els.detailsContent.querySelector('#panelAddRelative').addEventListener('click', () => openRelationshipDialog(person.id));
  els.detailsContent.querySelector('#panelEditPerson').addEventListener('click', () => openEditDialog(person.id));
}

function selectPerson(id, centre = false) {
  state.selectedId = id;
  renderTree();
  renderDetails();
  if (centre) centreOnSelected();
  if (window.innerWidth < 700) els.mobileDetailsButton.hidden = false;
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

function showDialog(dialog) {
  if (dialog && !dialog.open) dialog.showModal();
}

function closeDialog(dialog) {
  if (dialog?.open) dialog.close();
}

function clearTreeView() {
  state.tree = null;
  state.selectedId = null;
  state.undo = [];
  state.redo = [];
  els.familyName.textContent = 'Family Tree';
  els.nodeLayer.innerHTML = '';
  els.relationshipLayer.innerHTML = '';
  els.detailsContent.innerHTML = '<div class="panel-empty"><h2>Sign in to continue</h2><p>Your private family tree will appear here.</p></div>';
  els.emptyState.hidden = true;
  updateHistoryButtons();
}

function preferredTreeId() {
  const urlTreeId = new URL(window.location.href).searchParams.get('tree');
  return urlTreeId || config.defaultTreeId || localStorage.getItem('family-tree:selected-tree') || '';
}

function rememberTree(treeId) {
  localStorage.setItem('family-tree:selected-tree', treeId);
  const url = new URL(window.location.href);
  url.searchParams.set('tree', treeId);
  window.history.replaceState({}, '', url);
}

function renderTreeChoices(trees) {
  els.treeList.innerHTML = trees.map(tree => `
    <button type="button" data-tree-id="${escapeHtml(tree.id)}" class="${tree.id === state.tree?.id ? 'active' : ''}">
      <strong>${escapeHtml(tree.name)}</strong><span>Open ›</span>
    </button>
  `).join('');
  els.treeList.querySelectorAll('[data-tree-id]').forEach(button => button.addEventListener('click', async () => {
    els.treeStatus.textContent = 'Opening…';
    try {
      await loadConnectedTree(button.dataset.treeId);
    } catch (error) {
      els.treeStatus.textContent = error?.message || 'Unable to open this tree.';
    }
  }));
}

async function showTreeChooser() {
  const trees = await familyService.listTrees();
  renderTreeChoices(trees);
  els.treeStatus.textContent = '';
  showDialog(els.treeDialog);
  return trees;
}

async function loadConnectedTree(treeId) {
  const tree = await familyService.loadTree(treeId);
  if (state.stopTreeSubscription) await state.stopTreeSubscription();
  state.tree = tree;
  state.selectedId = tree.people.some(person => person.id === state.selectedId) ? state.selectedId : tree.people[0]?.id || null;
  state.undo = [];
  state.redo = [];
  rememberTree(tree.id);
  renderAll();
  requestAnimationFrame(fitTree);
  closeDialog(els.treeDialog);
  setConnectionStatus('Synced', 'connected');
  state.stopTreeSubscription = await familyService.subscribeToTree(tree.id, () => {
    clearTimeout(state.realtimeReloadTimer);
    state.realtimeReloadTimer = setTimeout(async () => {
      try {
        const selectedId = state.selectedId;
        state.tree = await familyService.loadTree(tree.id);
        state.selectedId = state.tree.people.some(person => person.id === selectedId) ? selectedId : state.tree.people[0]?.id || null;
        renderAll();
        setConnectionStatus('Synced', 'connected');
        toast('Family tree updated');
      } catch (error) {
        console.error(error);
        setConnectionStatus('Sync paused', 'waiting');
      }
    }, 300);
  });
}

async function handleAuthSession(session, event = '') {
  const loadId = ++state.authLoadId;
  const sameUser = state.session?.user?.id === session?.user?.id;
  state.session = session;
  if (!session) {
    if (state.stopTreeSubscription) await state.stopTreeSubscription();
    state.stopTreeSubscription = null;
    clearTreeView();
    closeDialog(els.accountDialog);
    closeDialog(els.treeDialog);
    setConnectionStatus('Signed out', 'waiting');
    showDialog(els.authDialog);
    return;
  }

  els.accountEmail.textContent = session.user.email || 'Signed-in family member';
  document.querySelector('#accountButton span').textContent = initials(session.user.email?.split('@')[0] || 'Member');
  closeDialog(els.authDialog);
  if (sameUser && state.tree) return;

  setConnectionStatus('Connecting…', 'waiting');
  const trees = await familyService.listTrees();
  if (loadId !== state.authLoadId) return;
  const chosenId = preferredTreeId();
  const chosen = trees.find(tree => tree.id === chosenId);
  if (chosen || trees.length === 1) {
    await loadConnectedTree((chosen || trees[0]).id);
  } else {
    clearTreeView();
    renderTreeChoices(trees);
    showDialog(els.treeDialog);
    setConnectionStatus(trees.length ? 'Choose a tree' : 'Create a tree', 'waiting');
  }
}

function openRelationshipDialog(anchorId) {
  const person = personById(anchorId);
  if (!person) return;
  state.addAnchorId = anchorId;
  state.addRelationship = null;
  els.relationshipTitle.textContent = `Add someone related to ${person.fullName.split(' ')[0]}`;
  els.relationshipSubtitle.textContent = 'What is their relationship?';
  els.relationshipDialog.showModal();
}

function openPersonDialog() {
  const anchor = personById(state.addAnchorId);
  state.editingId = null;
  state.photoDataUrl = '';
  state.photoFile = null;
  els.personDialogTitle.textContent = state.addRelationship ? `Add a ${state.addRelationship}` : 'Add person';
  els.personDialogSubtitle.textContent = anchor ? `This person will be connected to ${anchor.fullName}.` : 'Add their basic details. You can add more later.';
  els.personForm.reset();
  els.personLiving.checked = true;
  els.photoPreview.innerHTML = '<span>＋</span><small>Add photo</small>';
  els.formStatus.textContent = '';
  els.personDialog.showModal();
}

function openEditDialog(personId) {
  const person = personById(personId);
  if (!person) return;
  state.editingId = personId;
  state.addAnchorId = null;
  state.addRelationship = null;
  els.personDialogTitle.textContent = 'Edit person';
  els.personDialogSubtitle.textContent = `Update ${person.fullName}'s profile.`;
  els.personName.value = person.fullName || '';
  els.personDob.value = person.dateOfBirth || '';
  els.personAge.value = person.estimatedAge ?? '';
  els.personLiving.checked = !person.isDeceased;
  els.personDeath.value = person.dateOfDeath || '';
  els.personBirthplace.value = person.birthplace || '';
  els.personAbout.value = person.about || '';
  state.photoDataUrl = person.photoUrl || '';
  state.photoFile = null;
  els.photoPreview.innerHTML = person.photoUrl ? `<img src="${escapeHtml(person.photoUrl)}" alt="Preview">` : '<span>＋</span><small>Add photo</small>';
  els.formStatus.textContent = '';
  els.personDialog.showModal();
}

function snapshot() {
  return JSON.stringify({ people: state.tree.people, relationships: state.tree.relationships, selectedId: state.selectedId });
}

function pushUndo() {
  state.undo.push(snapshot());
  if (state.undo.length > 50) state.undo.shift();
  state.redo = [];
  updateHistoryButtons();
}

function restoreSnapshot(serialized) {
  const data = JSON.parse(serialized);
  state.tree.people = data.people;
  state.tree.relationships = data.relationships;
  state.selectedId = data.selectedId;
  renderAll();
}

function updateHistoryButtons() {
  els.undoButton.disabled = state.undo.length === 0;
  els.redoButton.disabled = state.redo.length === 0;
}

async function savePersonFromForm(event) {
  event.preventDefault();
  const fullName = els.personName.value.trim();
  if (!fullName) return;
  els.formStatus.textContent = 'Saving…';
  try {
    pushUndo();
    const payload = {
      fullName,
      dateOfBirth: els.personDob.value || null,
      estimatedAge: els.personAge.value ? Number(els.personAge.value) : null,
      isDeceased: !els.personLiving.checked,
      dateOfDeath: els.personDeath.value || null,
      birthplace: els.personBirthplace.value.trim(),
      about: els.personAbout.value.trim(),
      photoUrl: state.photoDataUrl || ''
    };

    let photoWarning = '';

    if (state.editingId) {
      const updated = await familyService.updatePerson(state.tree.id, state.editingId, payload);
      Object.assign(personById(state.editingId), payload, updated);
      if (state.photoFile && familyService.mode === 'supabase') {
        try {
          Object.assign(personById(state.editingId), await familyService.uploadPersonPhoto(state.tree.id, state.editingId, state.photoFile));
        } catch (error) {
          console.error(error);
          photoWarning = 'Profile saved, but the photo could not be uploaded.';
        }
      }
      state.selectedId = state.editingId;
      toast('Person updated');
    } else {
      const created = await familyService.createPerson(state.tree.id, payload);
      const localCreated = { ...payload, ...created, photoUrl: payload.photoUrl || created.photoUrl || '' };
      state.tree.people.push(localCreated);
      if (state.photoFile && familyService.mode === 'supabase') {
        try {
          Object.assign(localCreated, await familyService.uploadPersonPhoto(state.tree.id, localCreated.id, state.photoFile));
        } catch (error) {
          console.error(error);
          photoWarning = 'Person saved, but the photo could not be uploaded.';
        }
      }
      if (state.addAnchorId && state.addRelationship) {
        await addRelationshipForNewPerson(state.addAnchorId, localCreated.id, state.addRelationship);
      }
      state.selectedId = localCreated.id;
      toast('Person added');
    }
    els.personDialog.close();
    renderAll();
    requestAnimationFrame(() => centreOnSelected());
    if (photoWarning) toast(photoWarning);
  } catch (error) {
    state.undo.pop();
    updateHistoryButtons();
    els.formStatus.textContent = error?.message || 'Unable to save. Please try again.';
  }
}

async function addRelationshipForNewPerson(anchorId, newId, relationship) {
  const make = (type, personAId, personBId) => familyService.createRelationship(state.tree.id, { type, personAId, personBId });
  if (relationship === 'parent') {
    const rel = await make('parent_child', newId, anchorId); state.tree.relationships.push(rel);
  } else if (relationship === 'child') {
    const rel = await make('parent_child', anchorId, newId); state.tree.relationships.push(rel);
    const partner = getPartners(anchorId)[0];
    if (partner) { const second = await make('parent_child', partner.id, newId); state.tree.relationships.push(second); }
  } else if (relationship === 'partner') {
    const rel = await make('partner', anchorId, newId); state.tree.relationships.push(rel);
  } else if (relationship === 'sibling') {
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
  if (!q) {
    els.searchResults.hidden = true;
    els.searchResults.innerHTML = '';
    return;
  }
  const matches = state.tree.people.filter(p => p.fullName.toLowerCase().includes(q)).slice(0, 8);
  els.searchResults.innerHTML = matches.length ? matches.map(p => `<button type="button" data-search-id="${p.id}"><span class="mini-avatar">${escapeHtml(initials(p.fullName))}</span><span><strong>${escapeHtml(p.fullName)}</strong><small>${escapeHtml(formattedAge(p))}</small></span></button>`).join('') : '<div class="no-results">No people found</div>';
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
  els.familyName.textContent = state.tree?.name || 'Family Tree';
  renderTree();
  renderDetails();
  updateHistoryButtons();
}

function bindEvents() {
  document.querySelectorAll('.view-tab').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
  document.querySelector('#addPersonButton').addEventListener('click', () => {
    if (!state.tree) {
      showTreeChooser().catch(error => toast(error?.message || 'Unable to load family trees.'));
      return;
    }
    if (state.selectedId) openRelationshipDialog(state.selectedId);
    else openPersonDialog();
  });
  document.querySelector('#familyMenuButton').addEventListener('click', () => {
    if (familyService.mode === 'demo') toast('Demo family tree');
    else if (state.session) showTreeChooser().catch(error => toast(error?.message || 'Unable to load family trees.'));
  });
  document.querySelector('#accountButton').addEventListener('click', () => {
    if (familyService.mode === 'demo') toast('Configure Supabase to enable private accounts');
    else if (state.session) showDialog(els.accountDialog);
    else showDialog(els.authDialog);
  });
  document.querySelector('#emptyAddButton').addEventListener('click', openPersonDialog);
  document.querySelector('#zoomInButton').addEventListener('click', () => setZoom(state.zoom + 0.12));
  document.querySelector('#zoomOutButton').addEventListener('click', () => setZoom(state.zoom - 0.12));
  document.querySelector('#fitButton').addEventListener('click', fitTree);
  document.querySelector('#centreButton').addEventListener('click', centreOnSelected);
  els.search.addEventListener('input', () => handleSearch(els.search.value));
  els.search.addEventListener('keydown', event => { if (event.key === 'Escape') { els.search.value = ''; els.searchResults.hidden = true; } });
  document.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); els.search.focus(); }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) { event.preventDefault(); els.undoButton.click(); }
    if ((event.metaKey || event.ctrlKey) && (event.key.toLowerCase() === 'y' || (event.shiftKey && event.key.toLowerCase() === 'z'))) { event.preventDefault(); els.redoButton.click(); }
  });

  els.relationshipDialog.querySelectorAll('[data-relationship]').forEach(button => button.addEventListener('click', () => {
    state.addRelationship = button.dataset.relationship;
    els.relationshipDialog.close();
    openPersonDialog();
  }));
  document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => document.querySelector(`#${button.dataset.closeDialog}`).close()));
  els.authDialog.addEventListener('cancel', event => {
    if (familyService.mode === 'supabase' && !state.session) event.preventDefault();
  });
  els.authForm.addEventListener('submit', async event => {
    event.preventDefault();
    els.authStatus.textContent = 'Sending your secure link…';
    try {
      await familyService.signInWithEmail(els.authEmail.value.trim());
      els.authStatus.textContent = 'Check your inbox and open the sign-in link on this device.';
    } catch (error) {
      els.authStatus.textContent = error?.message || 'Unable to send the sign-in link.';
    }
  });
  els.createTreeForm.addEventListener('submit', async event => {
    event.preventDefault();
    const name = els.treeName.value.trim();
    if (!name) return;
    els.treeStatus.textContent = 'Creating your private tree…';
    try {
      const tree = await familyService.createTree(name);
      els.createTreeForm.reset();
      await loadConnectedTree(tree.id);
      toast('Family tree created');
    } catch (error) {
      els.treeStatus.textContent = error?.message || 'Unable to create the tree.';
    }
  });
  document.querySelector('#signOutButton').addEventListener('click', async () => {
    try {
      await familyService.signOut();
    } catch (error) {
      toast(error?.message || 'Unable to sign out.');
    }
  });
  els.personForm.addEventListener('submit', savePersonFromForm);
  els.personPhoto.addEventListener('change', event => {
    const file = event.target.files?.[0];
    if (!file) return;
    state.photoFile = file;
    const reader = new FileReader();
    reader.onload = () => {
      state.photoDataUrl = reader.result;
      els.photoPreview.innerHTML = `<img src="${reader.result}" alt="Preview">`;
    };
    reader.readAsDataURL(file);
  });

  els.undoButton.addEventListener('click', () => {
    if (!state.undo.length) return;
    state.redo.push(snapshot());
    restoreSnapshot(state.undo.pop());
    updateHistoryButtons();
    toast('Change undone');
  });
  els.redoButton.addEventListener('click', () => {
    if (!state.redo.length) return;
    state.undo.push(snapshot());
    restoreSnapshot(state.redo.pop());
    updateHistoryButtons();
    toast('Change redone');
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
    if (state.view === 'list' || event.button !== 0 || event.target.closest('.person-node')) return;
    els.viewport.setPointerCapture(event.pointerId);
    state.drag = { x: event.clientX, y: event.clientY, panX: state.panX, panY: state.panY };
    els.viewport.classList.add('dragging');
  });
  els.viewport.addEventListener('pointermove', event => {
    if (!state.drag) return;
    state.panX = state.drag.panX + event.clientX - state.drag.x;
    state.panY = state.drag.panY + event.clientY - state.drag.y;
    applyTransform();
  });
  const stopDrag = () => { state.drag = null; els.viewport.classList.remove('dragging'); };
  els.viewport.addEventListener('pointerup', stopDrag);
  els.viewport.addEventListener('pointercancel', stopDrag);

  window.addEventListener('resize', () => {
    if (window.innerWidth >= 700) els.detailsPanel.classList.remove('mobile-open');
  });
}

async function init() {
  bindEvents();
  try {
    if (familyService.mode === 'demo') {
      state.tree = await familyService.loadTree();
      if (!personById(state.selectedId)) state.selectedId = state.tree.people[0]?.id || null;
      renderAll();
      requestAnimationFrame(() => fitTree());
      setConnectionStatus('Demo');
      toast('Demo mode — connect Supabase to save permanently');
      return;
    }

    const session = await familyService.getSession();
    await handleAuthSession(session, 'INITIAL_SESSION');
    await familyService.onAuthStateChange((event, nextSession) => {
      setTimeout(() => handleAuthSession(nextSession, event).catch(error => {
        console.error(error);
        setConnectionStatus('Connection error', 'waiting');
        toast(error?.message || 'Unable to update your session.');
      }), 0);
    });
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
