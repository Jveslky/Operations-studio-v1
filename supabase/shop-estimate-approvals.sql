-- Apply to Test first, then Live before deploying approval UI.
begin;
alter table public.shop_repair_orders add column if not exists estimate_version integer not null default 1;
alter table public.shop_repair_orders add column if not exists approval_request jsonb;

create table if not exists public.shop_estimate_approvals (
    id uuid primary key,
    shop_id uuid not null references public.shops(id),
    repair_order_id uuid not null references public.shop_repair_orders(id),
    estimate_version integer not null,
    estimate_snapshot jsonb not null,
    approved_amount numeric(12,2) not null,
    method text not null check (method in ('verbal','written','digital')),
    customer_contact text not null check (length(trim(customer_contact)) between 1 and 200),
    notes text not null default '' check (length(notes) <= 4000),
    evidence_path text,
    evidence_name text,
    recorded_by uuid not null references auth.users(id),
    recorded_by_email text not null,
    recorded_at timestamptz not null default now()
);
create index if not exists shop_estimate_approvals_ro_idx on public.shop_estimate_approvals(shop_id,repair_order_id,recorded_at desc);
alter table public.shop_estimate_approvals enable row level security;
revoke all on public.shop_estimate_approvals from anon, authenticated;
grant select on public.shop_estimate_approvals to authenticated;
drop policy if exists "office reads approval history" on public.shop_estimate_approvals;
create policy "office reads approval history" on public.shop_estimate_approvals for select to authenticated
using (public.has_shop_role(shop_id,array['owner','admin','service_writer']));

create or replace function public.shop_estimate_snapshot(row_data jsonb)
returns jsonb language sql immutable set search_path = public as $$
    select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) from jsonb_each(row_data)
    where (key like 'estimate_%' and key not in ('estimate_version','estimate_approval_status'))
       or key in ('complaint','parts_needed','customer_id','unit_id','customer_name','unit_name');
$$;

create or replace function public.audit_shop_estimate_approval()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare snapshot jsonb; changed boolean; req jsonb; file_path text; actor_email text;
begin
    snapshot := public.shop_estimate_snapshot(to_jsonb(new));
    if tg_op = 'INSERT' then
        new.estimate_version := 1;
        if new.estimate_approval_status = 'Approved' or new.approval_request is not null then
            raise exception 'Create the repair order before recording approval.';
        end if;
        return new;
    end if;
    new.shop_id := old.shop_id;
    changed := snapshot is distinct from public.shop_estimate_snapshot(to_jsonb(old));
    new.estimate_version := old.estimate_version + case when changed then 1 else 0 end;
    req := new.approval_request;
    new.approval_request := null;
    if req is not null then
        if auth.uid() is null or not public.has_shop_role(old.shop_id,array['owner','admin','service_writer']) then
            raise exception 'Your role cannot record estimate approval.';
        end if;
        if old.archived or new.archived then raise exception 'Archived repair orders cannot be approved.'; end if;
        if (req->>'expected_updated_at')::timestamptz is distinct from old.updated_at
            or (req->>'expected_version')::integer is distinct from old.estimate_version then
            raise exception 'Repair order changed. Refresh and review the estimate before approving.';
        end if;
        if new.estimate_approval_status <> 'Approved' then raise exception 'Select Approved before recording authorization.'; end if;
        if req->>'method' not in ('verbal','written','digital') or req->>'method' is null
            or coalesce(length(trim(req->>'customer_contact')),0) not between 1 and 200 then
            raise exception 'Approval method and customer/contact name are required.';
        end if;
        if req->>'method' = 'verbal' and coalesce(length(trim(req->>'notes')),0) = 0 then
            raise exception 'Add a note describing the verbal authorization.';
        end if;
        file_path := nullif(req->>'evidence_path','');
        if file_path is not null then
            if split_part(file_path,'/',1) <> old.shop_id::text or split_part(file_path,'/',2) <> old.id::text
                or not exists (select 1 from storage.objects where bucket_id = 'shop-approval-evidence' and name = file_path and owner_id = auth.uid()::text) then
                raise exception 'Approval evidence is unavailable or belongs to another record.';
            end if;
        end if;
        select coalesce(email,'') into actor_email from auth.users where id = auth.uid();
        insert into public.shop_estimate_approvals(id,shop_id,repair_order_id,estimate_version,estimate_snapshot,approved_amount,method,customer_contact,notes,evidence_path,evidence_name,recorded_by,recorded_by_email)
        values ((req->>'id')::uuid,old.shop_id,old.id,new.estimate_version,snapshot,new.estimate_total,req->>'method',trim(req->>'customer_contact'),coalesce(req->>'notes',''),file_path,nullif(req->>'evidence_name',''),auth.uid(),coalesce(actor_email,''));
        -- Use the stored RO stage, not a stale browser stage. Never move later work backward.
        if old.status in ('Open','Intake','Scheduled','Waiting Approval','Needs Info') then
            new.status := 'In Progress';
        else
            new.status := old.status;
        end if;
    elsif changed and old.estimate_approval_status = 'Approved' then
        new.estimate_approval_status := 'Draft';
    elsif new.estimate_approval_status = 'Approved' and old.estimate_approval_status <> 'Approved' then
        raise exception 'Record customer authorization before approving the estimate.';
    end if;
    return new;
end;
$$;
revoke all on function public.audit_shop_estimate_approval() from public;
drop trigger if exists audit_shop_estimate_approval on public.shop_repair_orders;
create trigger audit_shop_estimate_approval before insert or update on public.shop_repair_orders
for each row execute function public.audit_shop_estimate_approval();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('shop-approval-evidence','shop-approval-evidence',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "office uploads approval evidence" on storage.objects;
create policy "office uploads approval evidence" on storage.objects for insert to authenticated with check (
    bucket_id='shop-approval-evidence' and exists (
        select 1 from public.shop_repair_orders ro where ro.shop_id::text=split_part(name,'/',1)
        and ro.id::text=split_part(name,'/',2) and not ro.archived
        and public.has_shop_role(ro.shop_id,array['owner','admin','service_writer'])
    )
);
drop policy if exists "office reads approval evidence" on storage.objects;
create policy "office reads approval evidence" on storage.objects for select to authenticated using (
    bucket_id='shop-approval-evidence' and exists (
        select 1 from public.shop_estimate_approvals a where a.evidence_path=name
        and public.has_shop_role(a.shop_id,array['owner','admin','service_writer'])
    )
);
-- No client update/delete policy: an approval and its evidence stay preserved.
commit;
