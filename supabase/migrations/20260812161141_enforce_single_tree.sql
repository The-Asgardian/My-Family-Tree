-- This application has one canonical family tree. The unique singleton column
-- prevents any second tree from being inserted through the API or another
-- client.
alter table public.trees
  add column singleton boolean not null default true,
  add constraint trees_singleton_check check (singleton);

create unique index trees_singleton_unique on public.trees(singleton);

-- The product intentionally has no sign-in flow. The canonical empty tree is
-- application metadata, not placeholder family data; people and relationships
-- remain empty until the user adds them through the app.
alter table public.trees alter column owner_id drop not null;

insert into public.trees (id, name, owner_id, singleton)
values ('7f73696e-676c-4574-7265-650000000001', 'My Family Tree', null, true);

grant usage on schema public to anon;
grant select on public.trees to anon;
grant select, insert, update, delete on public.people to anon;
grant select, insert, update, delete on public.relationships to anon;

create policy "public app reads canonical tree"
on public.trees for select to anon
using (id = '7f73696e-676c-4574-7265-650000000001'::uuid);

create policy "public app reads canonical people"
on public.people for select to anon
using (tree_id = '7f73696e-676c-4574-7265-650000000001'::uuid);

create policy "public app creates canonical people"
on public.people for insert to anon
with check (tree_id = '7f73696e-676c-4574-7265-650000000001'::uuid);

create policy "public app updates canonical people"
on public.people for update to anon
using (tree_id = '7f73696e-676c-4574-7265-650000000001'::uuid)
with check (tree_id = '7f73696e-676c-4574-7265-650000000001'::uuid);

create policy "public app deletes canonical people"
on public.people for delete to anon
using (tree_id = '7f73696e-676c-4574-7265-650000000001'::uuid);

create policy "public app reads canonical relationships"
on public.relationships for select to anon
using (tree_id = '7f73696e-676c-4574-7265-650000000001'::uuid);

create policy "public app creates canonical relationships"
on public.relationships for insert to anon
with check (tree_id = '7f73696e-676c-4574-7265-650000000001'::uuid);

create policy "public app updates canonical relationships"
on public.relationships for update to anon
using (tree_id = '7f73696e-676c-4574-7265-650000000001'::uuid)
with check (tree_id = '7f73696e-676c-4574-7265-650000000001'::uuid);

create policy "public app deletes canonical relationships"
on public.relationships for delete to anon
using (tree_id = '7f73696e-676c-4574-7265-650000000001'::uuid);

create policy "public app reads canonical photos"
on storage.objects for select to anon
using (
  bucket_id = 'family-photos'
  and (storage.foldername(name))[1] = '7f73696e-676c-4574-7265-650000000001'
);

create policy "public app uploads canonical photos"
on storage.objects for insert to anon
with check (
  bucket_id = 'family-photos'
  and (storage.foldername(name))[1] = '7f73696e-676c-4574-7265-650000000001'
);

create policy "public app updates canonical photos"
on storage.objects for update to anon
using (
  bucket_id = 'family-photos'
  and (storage.foldername(name))[1] = '7f73696e-676c-4574-7265-650000000001'
)
with check (
  bucket_id = 'family-photos'
  and (storage.foldername(name))[1] = '7f73696e-676c-4574-7265-650000000001'
);

create policy "public app deletes canonical photos"
on storage.objects for delete to anon
using (
  bucket_id = 'family-photos'
  and (storage.foldername(name))[1] = '7f73696e-676c-4574-7265-650000000001'
);
