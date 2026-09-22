-- Private shop team documents with explicit employee visibility.
-- Additive only; no existing team or shop data is modified.

create table if not exists public.shop_team_documents (
    id uuid primary key default gen_random_uuid(),
    shop_id uuid not null references public.shops(id) on delete cascade,
    subject_user_id uuid not null references auth.users(id) on delete restrict,
    document_type text not null check (document_type in ('license','certification','insurance','employment','other')),
    title text not null check (char_length(trim(title)) between 2 and 160),
    issuer text,
    document_number text,
    issued_on date,
    expires_on date,
    reminder_days integer not null default 30 check (reminder_days between 0 and 730),
    visible_to_subject boolean not null default false,
    object_path text not null unique,
    original_filename text not null,
    mime_type text not null,
    file_size bigint not null check (file_size > 0),
    uploaded_by uuid not null references auth.users(id),
    archived_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (expires_on is null or issued_on is null or expires_on >= issued_on)
);

create index if not exists shop_team_documents_shop_expiry_idx
    on public.shop_team_documents(shop_id, expires_on) where archived_at is null;
create index if not exists shop_team_documents_subject_idx
    on public.shop_team_documents(shop_id, subject_user_id, created_at desc);

create or replace function public.validate_team_document_subject()
returns trigger language plpgsql security definer set search_path=public as $$
begin
    if not exists (
        select 1 from public.shop_members members
        where members.shop_id=new.shop_id and members.user_id=new.subject_user_id
    ) then raise exception 'Document recipient is not a member of this shop'; end if;
    return new;
end;
$$;

drop trigger if exists validate_team_document_subject_scope on public.shop_team_documents;
create trigger validate_team_document_subject_scope
before insert or update on public.shop_team_documents
for each row execute function public.validate_team_document_subject();

alter table public.shop_team_documents enable row level security;

drop policy if exists "authorized users view team documents" on public.shop_team_documents;
create policy "authorized users view team documents" on public.shop_team_documents
for select to authenticated using (
    public.has_shop_role(shop_id,array['owner','admin'])
    or (visible_to_subject=true and subject_user_id=auth.uid())
);

drop policy if exists "owners and admins create team documents" on public.shop_team_documents;
create policy "owners and admins create team documents" on public.shop_team_documents
for insert to authenticated with check (
    uploaded_by=auth.uid() and public.has_shop_role(shop_id,array['owner','admin'])
);

drop policy if exists "owners and admins update team documents" on public.shop_team_documents;
create policy "owners and admins update team documents" on public.shop_team_documents
for update to authenticated using (public.has_shop_role(shop_id,array['owner','admin']))
with check (public.has_shop_role(shop_id,array['owner','admin']));

grant select,insert,update on public.shop_team_documents to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('shop-team-documents','shop-team-documents',false,20971520,array[
    'application/pdf','image/jpeg','image/png','image/heic','image/heif','application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,
allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "authorized users view team document files" on storage.objects;
create policy "authorized users view team document files" on storage.objects
for select to authenticated using (
    bucket_id='shop-team-documents' and exists (
        select 1 from public.shop_team_documents documents
        where documents.object_path=name and (
            public.has_shop_role(documents.shop_id,array['owner','admin'])
            or (documents.visible_to_subject=true and documents.subject_user_id=auth.uid())
        )
    )
);

drop policy if exists "owners and admins upload team document files" on storage.objects;
create policy "owners and admins upload team document files" on storage.objects
for insert to authenticated with check (
    bucket_id='shop-team-documents'
    and public.has_shop_role((storage.foldername(name))[1]::uuid,array['owner','admin'])
);

drop policy if exists "owners and admins delete pending team document files" on storage.objects;
create policy "owners and admins delete pending team document files" on storage.objects
for delete to authenticated using (
    bucket_id='shop-team-documents'
    and public.has_shop_role((storage.foldername(name))[1]::uuid,array['owner','admin'])
    and not exists(select 1 from public.shop_team_documents documents where documents.object_path=name)
);
