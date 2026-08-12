# Family Tree — Product & UI Design Specification

**Status:** Approved visual direction / implementation source of truth<br>
**Target:** Responsive collaborative family-tree web app hosted on GitHub Pages with Supabase backend<br>
**Design reference:** `docs/approved-ui.png`

## 1. Product goal

Create a modern, photo-first family tree that is simple enough for non-technical relatives to use. The tree itself is the product: users should be able to understand the family structure immediately, select a person, view details, and add or edit relatives with minimal friction.

The app deliberately avoids the research-heavy visual density of traditional genealogy software. It borrows proven tree-navigation patterns from premium genealogy products but presents them with a cleaner, contemporary UI.

## 2. Locked visual direction

The approved desktop layout consists of only two primary regions:

1. **Main tree workspace** — header, view controls, relationship tree, zoom/pan controls.
2. **Right details panel** — selected person's profile and actions.

No persistent panels exist below the tree. Modals/popovers are used only when an action requires input.

### 2.1 Person node card — LOCKED

Each family member is represented by a portrait card.

- Portrait rectangle.
- Photo dominates the card.
- Name is directly under the photo.
- Age is directly under the name.
- Approx. desktop size: 130–150 px wide, 175–210 px high depending on viewport zoom.
- Photo aspect ratio: approximately 4:5 portrait.
- Soft 12–16 px corner radius.
- White/light surface with subtle border and minimal shadow.
- Selected card receives the app accent outline.
- A small circular `+` add-relative button sits centred below the card.
- Missing photo uses initials and an understated `Add photo` state; no cartoon avatar.
- No dates, icons, badges, relationship labels or biography text clutter the normal node.

### 2.2 Relationship lines

- Partner cards sit horizontally beside each other.
- Partner line connects the pair.
- Child branch descends from the centre of the couple/parent group.
- Siblings align on the same generation row.
- Lines are thin, neutral and visually secondary to people.
- Connectors should avoid crossing cards whenever possible.
- Tree layout is automatic; users do not manually position nodes in V1.

### 2.3 Main header

Desktop header:

- Left: tree/family name with compact family-tree mark.
- Centre: global `Search people…` control.
- Right: `+ Add person`, notifications/activity shortcut, current-user avatar.

The header stays visually light and does not compete with the canvas.

### 2.4 Tree view controls

Top-left tabs inside the workspace:

- **Family** — default full family context.
- **Ancestors** — ancestors of selected/focused person.
- **Descendants** — descendants of selected/focused person.
- **List** — accessible searchable list fallback for very large trees.

Floating left toolbar:

- Centre/focus.
- Zoom in.
- Current zoom percentage.
- Zoom out.
- Fit tree to viewport.

Bottom-left:

- Undo.
- Redo.

### 2.5 Right details panel — LOCKED

Selecting a person opens/updates a fixed right-side panel without leaving the tree.

Panel content:

- Large portrait photo.
- Name.
- Age or birth/death years.
- Parents with small avatar chips.
- Siblings with small avatar chips.
- Partner(s), with `Add partner` when empty.
- Children, with `Add child` when empty.
- Primary `+ Add relative` action.
- `Edit person` action.
- Overflow menu for secondary/destructive actions.
- Date of birth.
- Birthplace.
- Short notes/about field.
- Tabs for Photos / Facts / Notes / Activity.

The tree remains visible while the panel is open.

## 3. Interaction design

### 3.1 Select person

- Click/tap a portrait card to select it.
- Selected card receives accent border.
- Right panel updates immediately.
- URL may later deep-link using `?person=<uuid>`.

### 3.2 Add relative

The small `+` under any person opens a compact relationship chooser:

- Parent
- Partner
- Sibling
- Child

After relationship selection, open the add-person modal.

Required fields:

- Photo (optional)
- Full name
- Date of birth OR approximate age
- Living/deceased

Collapsed `More details` fields:

- Birthplace
- Date of death
- Notes

Before creating a new person, search likely duplicate people in the same tree and let the editor link an existing person instead.

### 3.3 Add person from header

`+ Add person` begins with either:

- Choose an existing person to relate them to, or
- Create the first/root person when the tree is empty.

Orphan/unconnected people should be allowed temporarily but visibly flagged to editors.

### 3.4 Edit person

Edit uses the same form language as create. Changes are optimistic in the UI and persisted to Supabase. Every successful mutation creates an audit entry.

### 3.5 Search

- Instant name search.
- Results include thumbnail, name and relationship context when known.
- Selecting a result centres the tree on that person, selects them and opens details.
- Non-matches may be softly dimmed while searching.

### 3.6 Pan and zoom

Desktop:

- Drag empty canvas to pan.
- Mouse wheel / trackpad zoom.
- Toolbar +/- controls.
- `Fit tree` calculates content bounds and fits all visible nodes.
- `Centre` focuses current selection.

Mobile/tablet:

- One-finger pan.
- Pinch zoom where supported.
- Compact floating toolbar.

### 3.7 Persistent history

Changes are recorded in the backend `change_log` table. A future Activity UI can
restore authorised changes from that persistent history; the app must not offer
client-only undo that diverges from Supabase.

Destructive actions require confirmation and remain recoverable where practical.

## 4. Responsive behaviour

### Desktop (>= 1100 px)

- Tree workspace uses remaining width.
- Details panel is fixed at ~340–400 px.
- Portrait nodes remain full size.

### Tablet (700–1099 px)

- Details panel overlays the right side or uses ~36% width.
- Tree remains pannable underneath.
- Header actions compact.

### Mobile (< 700 px)

- Tree consumes the screen.
- Details panel becomes a full-height slide-over/bottom-sheet style panel.
- Node cards scale to ~100–120 px wide but keep portrait proportions.
- Search expands into its own top layer.
- No desktop-only hover dependency.

## 5. Accessibility

- Every person card is a semantic button with accessible name.
- All actions available via keyboard.
- Visible focus states.
- Relationship lines are supplementary; relationship data is available textually in details/list view.
- Minimum comfortable touch target around 44 px for primary mobile controls.
- Respect reduced-motion preference.
- Colour is never the only indicator of state.

## 6. Data model

The database stores people and relationships, not manually assigned generations.

### `profiles`

App-user profile linked 1:1 to Supabase Auth user.

### `trees`

- id
- name
- slug
- owner_id
- singleton (database-enforced single row)
- created_at / updated_at

The application has one canonical tree with the configured fixed ID; the
database rejects any second tree.

### `tree_members`

Connects authenticated users to trees.

Roles:

- `owner`
- `editor`
- `viewer`

### `people`

- id
- tree_id
- full_name
- preferred_name
- date_of_birth
- estimated_age
- is_deceased
- date_of_death
- birthplace
- about
- photo_path
- created_by / updated_by
- created_at / updated_at
- version

Age is calculated from DOB when available. `estimated_age` exists only for relatives whose exact birth date is unknown.

### `relationships`

Generic relationship edges rather than hard-coded generation columns.

V1 relationship types:

- `parent_child`
- `partner`

Relationship metadata allows future statuses such as biological/adoptive/step, married/partner/ex-partner, start/end dates, etc.

### `invitations`

- tree_id
- secure token
- requested role
- optional invited email
- expiry
- creator
- claim information

### `change_log`

Immutable audit trail for create/update/delete operations.

- actor
- tree
- entity type/id
- action
- before JSON
- after JSON
- timestamp

## 7. Collaboration and permissions

### Owner

- Full tree control.
- Invite/remove members.
- Change roles.
- Edit/delete any person/relationship.
- Restore history.
- Delete/export tree.

### Editor

- View tree.
- Add/edit people and relationships.
- Upload photos.
- View activity/history.
- Cannot change ownership/security policy.

### Viewer

- Read-only access to the tree and allowed profile fields.

All permissions are enforced with Supabase Row Level Security, not only hidden UI controls.

## 8. Privacy and security

- The initial version deliberately uses anonymous access so there is no sign-in barrier.
- Anyone with the application URL can view and edit the tree until authentication is added.
- Supabase Auth controls identity.
- RLS protects every user-owned table.
- Profile photos use a private Supabase Storage bucket and signed URLs.
- Client-side image resize/compression before upload reduces storage use.
- No service-role key is ever shipped to GitHub Pages.
- Supabase anon/publishable client key is safe to expose only with correct RLS.
- Audit log is append-only for ordinary editors.

## 9. Supabase free-tier strategy

The project is intentionally designed for the Supabase free tier.

Data usage is negligible for normal family trees; image storage is the main resource concern.

Optimisations:

- Resize profile photos to a sensible maximum dimension before upload.
- Prefer WebP/AVIF when browser support and quality allow.
- Cache signed image URLs in session memory.
- Lazy-load non-visible photos.
- Keep history as structured JSON diffs/snapshots rather than binary copies.

## 10. Tree layout engine

The layout engine is kept separate from persistence.

Input:

- people
- parent-child edges
- partner edges
- focused person/view mode

Output:

- x/y position per visible person
- connector paths
- content bounds

V1 priorities:

1. Keep partners adjacent.
2. Keep siblings on the same generation.
3. Place children beneath parent/couple centre.
4. Minimise connector crossings.
5. Produce deterministic positions from the same data.
6. Recalculate after additions without manual coordinates.

A later algorithm can replace the initial layout without changing the database.

## 11. Quality-of-life features

V1 / early implementation:

- Search and centre.
- Fit tree.
- Remember zoom/viewport per browser session.
- Keyboard shortcuts: search, zoom and fit.
- Auto-calculate age from DOB.
- Duplicate-person warning before create.
- Inline empty states such as `Add partner` / `Add child`.
- Photo crop/position workflow.
- Activity log.
- Optimistic save feedback.
- Toasts for save and error feedback.
- Unsaved-change protection in forms.
- Skeleton loading state.
- Friendly offline/network-error state.
- Copy/share invitation link.
- Deep-link selected person.

Later QoL:

- Highlight relationship path between two people.
- Birthday reminders.
- GEDCOM import/export.
- Full tree export as image/PDF.
- Per-person albums.
- Family timeline/map.
- Merge duplicate people.
- Moderated-edit mode for large trees.

## 12. Activity and history

Activity UI is not a permanent bottom panel. It opens from the top-right activity/notification control or from the selected person's `Activity` tab.

Example entries:

- Raj added Priya Hayre.
- A family editor updated a relative's date of birth.
- A family editor changed a profile photo.

Each entry contains enough structured data to support future restore/revert actions.

## 13. Empty and error states

### Empty tree

Large central action:

`Add the first person`

The root action creates the first persisted person. After the first person,
guide the user to add parent/partner/child from the node itself. There is no
sign-in page, tree chooser or create-another-tree flow.

### Missing image

Initials in a neutral photo placeholder with optional `Add photo` affordance.

### Disconnected person

Show only to editors with a subtle warning and action to connect to family.

### Failed save

Keep form data, show concise error and allow retry.

## 14. Technology architecture

### Hosting

- GitHub repository.
- GitHub Pages for the static frontend.

### Frontend V1

- Static HTML.
- CSS.
- Native ES modules / JavaScript.
- SVG relationship connectors.
- No required build step.

This is intentionally simple for the first implementation and can later move to React/TypeScript if component complexity justifies it.

### Backend

- Supabase Postgres.
- Supabase Auth.
- Supabase Storage.
- Supabase Realtime.

### Runtime mode

- **Backend-only mode:** Supabase-backed persistence and realtime sync. There is no mock-data fallback or sign-in flow in the initial version.
- **Single-tree mode:** one configured tree ID and a database singleton constraint; the UI has no tree chooser.
- An empty tree renders one UI-only root node. Creating that root writes the first real person to Supabase; every later family member is connected from persisted people.

## 15. Realtime behaviour

When connected to Supabase:

- Listen to changes for people and relationships in the active tree.
- Merge remote changes into local state.
- Preserve current selected person and viewport where possible.
- Show a small non-intrusive indicator when another editor changes the tree.
- Version rows to detect conflicting edits.

## 16. Performance targets

- Initial shell visually usable quickly on mobile connections.
- Smooth pan/zoom at 60 fps for ordinary family sizes.
- Avoid rerendering all profile images when only selection changes.
- Lazy load images.
- Keep relationship calculations outside frequent pointer-move loops.
- Tree should remain usable with hundreds of people; list/focus views become fallbacks for very large families.

## 17. V1 delivery phases

### Phase 1 — UI shell and local tree

- Approved layout.
- Portrait nodes.
- Automatic generation layout.
- SVG relationships.
- Selection/details panel.
- Pan/zoom/fit/centre.
- Search.
- Add relative UI.
- Edit UI.
- Responsive shell.

### Phase 2 — Supabase persistence

- Schema + migrations.
- Auth.
- RLS.
- CRUD.
- Private image storage.
- Invitations.
- Realtime.
- Audit log.

### Phase 3 — collaboration polish

- Duplicate checking.
- Persistent restore/undo.
- Activity UI.
- Conflict/version handling.
- Sharing UX.

### Phase 4 — release hardening

- Accessibility pass.
- Mobile QA.
- Large-tree performance tests.
- Error/offline handling.
- GitHub Pages deployment automation.

## 18. Non-goals for initial V1

Do not add these until the core collaborative tree is excellent:

- Historical-record search.
- DNA services.
- AI genealogy research.
- Messaging/social feed.
- Public profile discovery.
- Complex fan charts.
- Maps/timelines.
- Heavy biography/document management.

## 19. Acceptance criteria for core UI

The UI is considered on-design when:

- The viewport visually matches `docs/approved-ui.png` in structure.
- Main screen contains the tree + right detail panel only.
- Every normal person node is a portrait card with photo, name and age.
- Partner/child relationship lines are visually clear.
- Selecting a person never navigates away from the tree.
- Add-relative is available directly from nodes.
- Tree can pan, zoom, fit and centre.
- Desktop and mobile remain usable with no horizontal page overflow outside the intentional canvas.
- UI remains visually quiet, bright and photo-first.
