-- Test authorization summary and amount update. Run the entire file.
begin;
-- Safe to rerun after the initial approval migration.
alter table public.shop_estimate_approvals add column if not exists approval_scope text not null default 'entire' check (approval_scope in ('entire','custom','other'));
alter table public.shop_estimate_approvals add column if not exists approval_scope_details text not null default '' check (length(approval_scope_details) <= 2000);
alter table public.shop_estimate_approvals add column if not exists authorization_amount numeric(12,2);
alter table public.shop_estimate_approvals add column if not exists approval_scope text not null default 'entire' check (approval_scope in ('entire','custom','other'));
alter table public.shop_estimate_approvals add column if not exists approval_scope_details text not null default '' check (length(approval_scope_details) <= 2000);
alter table public.shop_estimate_approvals add column if not exists authorization_amount numeric(12,2);
alter table public.shop_estimate_approvals add column if not exists authorization_relationship text check (authorization_relationship in ('initial','additional','replacement','amendment'));
alter table public.shop_estimate_approvals add column if not exists related_authorization_id uuid references public.shop_estimate_approvals(id);
alter table public.shop_estimate_approvals add column if not exists relationship_notes text not null default '' check (length(relationship_notes) <= 2000);
create or replace function public.audit_shop_estimate_approval()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare snapshot jsonb; changed boolean; req jsonb; file_path text; actor_email text; scope_amount numeric(12,2); relation text; related_id uuid;
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
        if coalesce(req->>'approval_scope','entire') not in ('entire','custom','other')
            or (coalesce(req->>'approval_scope','entire') <> 'entire' and coalesce(length(trim(req->>'approval_scope_details')),0) not between 1 and 2000) then
            raise exception 'Describe the custom or other work the customer approved.';
        end if;
        if req->>'expected_authorized_version' is not null and (req->>'expected_authorized_version')::integer <> new.estimate_version then
            raise exception 'Estimate revision does not match the authorization summary. Refresh and review.';
        end if;
        if coalesce(req->>'approval_scope','entire') = 'entire' then
            scope_amount := new.estimate_total;
        else
            if coalesce(req->>'authorized_amount','') !~ '^[0-9]+([.][0-9]{1,2})?$' or (req->>'authorized_amount')::numeric > 9999999999.99 then
                raise exception 'Enter an authorized amount for the custom or other approved work.';
            end if;
            scope_amount := (req->>'authorized_amount')::numeric;
        end if;
        relation := req->>'authorization_relationship';
        related_id := nullif(req->>'related_authorization_id','')::uuid;
        if relation is null or relation not in ('initial','additional','replacement','amendment') then
            raise exception 'Choose how this authorization relates to earlier authorizations.';
        end if;
        if relation = 'additional' and coalesce(req->>'approval_scope','entire') = 'entire' then
            raise exception 'Additional work requires its own description and amount.';
        end if;
        if relation = 'initial' and exists(select 1 from public.shop_estimate_approvals where shop_id=old.shop_id and repair_order_id=old.id) then
            raise exception 'Earlier authorizations exist. Choose additional work, replacement or amendment.';
        end if;
        if relation <> 'initial' and not exists(select 1 from public.shop_estimate_approvals where shop_id=old.shop_id and repair_order_id=old.id) then
            raise exception 'No earlier authorization exists.';
        end if;
        if relation in ('replacement','amendment') then
            if not exists(select 1 from public.shop_estimate_approvals a where a.id=related_id and a.shop_id=old.shop_id and a.repair_order_id=old.id
                and not exists(select 1 from public.shop_estimate_approvals successor where successor.related_authorization_id=a.id and successor.authorization_relationship in ('replacement','amendment'))) then
                raise exception 'Select an earlier authorization that has not already been superseded.';
            end if;
        elsif related_id is not null then raise exception 'Only replacements and amendments link an earlier authorization.';
        end if;
        if relation = 'amendment' and coalesce(length(trim(req->>'relationship_notes')),0) not between 1 and 2000 then
            raise exception 'Explain the amendment. Its amount and scope must describe the resulting authorization.';
        end if;
        file_path := nullif(req->>'evidence_path','');
        if file_path is not null then
            if split_part(file_path,'/',1) <> old.shop_id::text or split_part(file_path,'/',2) <> old.id::text
                or not exists (select 1 from storage.objects where bucket_id = 'shop-approval-evidence' and name = file_path and owner_id = auth.uid()::text) then
                raise exception 'Approval evidence is unavailable or belongs to another record.';
            end if;
        end if;
        select coalesce(email,'') into actor_email from auth.users where id = auth.uid();
        insert into public.shop_estimate_approvals(id,shop_id,repair_order_id,estimate_version,estimate_snapshot,approved_amount,authorization_amount,method,customer_contact,notes,approval_scope,approval_scope_details,evidence_path,evidence_name,recorded_by,recorded_by_email,authorization_relationship,related_authorization_id,relationship_notes)
        values ((req->>'id')::uuid,old.shop_id,old.id,new.estimate_version,snapshot,scope_amount,scope_amount,req->>'method',trim(req->>'customer_contact'),coalesce(req->>'notes',''),coalesce(req->>'approval_scope','entire'),case when coalesce(req->>'approval_scope','entire') = 'entire' then '' else trim(req->>'approval_scope_details') end,file_path,nullif(req->>'evidence_name',''),auth.uid(),coalesce(actor_email,''),relation,related_id,coalesce(trim(req->>'relationship_notes'),''));
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
notify pgrst, 'reload schema';
commit;
select
 exists(select 1 from information_schema.columns where table_schema='public' and table_name='shop_estimate_approvals' and column_name='approval_scope') as scope_column_installed,
 exists(select 1 from information_schema.columns where table_schema='public' and table_name='shop_estimate_approvals' and column_name='approval_scope_details') as description_column_installed,
 position('approval_scope_details' in pg_get_functiondef('public.audit_shop_estimate_approval()'::regprocedure)) > 0 as scope_save_installed;
