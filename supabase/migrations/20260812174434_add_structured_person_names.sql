alter table public.people
  add column first_name text,
  add column last_name text,
  add column gender text;

alter table public.people
  add constraint people_first_name_length
    check (first_name is null or char_length(btrim(first_name)) between 1 and 100),
  add constraint people_last_name_length
    check (last_name is null or char_length(btrim(last_name)) between 1 and 100),
  add constraint people_gender_values
    check (gender is null or gender in ('male', 'female'));

comment on column public.people.first_name is 'Given name or names entered separately in the person form.';
comment on column public.people.last_name is 'Family surname, when known.';
comment on column public.people.gender is 'Male or female; the app derives Singh or Kaur from this value.';
