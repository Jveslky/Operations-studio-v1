-- Apply to Test before testing the updated approval UI. Requires customer-tax-settings.sql.
-- Existing authorizations remain immutable; only new approvals capture tax.
begin;
create or replace function public.shop_estimate_authorization_totals(ro jsonb)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare taxable boolean; rate numeric; customer_status text; subtotal numeric; base numeric; tax numeric;
 labor numeric := coalesce((ro->>'estimate_labor_hours')::numeric,0)*coalesce((ro->>'estimate_labor_rate')::numeric,0);
 parts numeric := coalesce((ro->>'estimate_parts_total')::numeric,0);
 supplies numeric := coalesce((ro->>'estimate_shop_supplies')::numeric,0);
 environmental numeric := coalesce((ro->>'estimate_environmental_fee')::numeric,0);
 other_fee numeric := coalesce((ro->>'estimate_other_charges')::numeric,0);
 discount numeric := coalesce((ro->>'estimate_discount')::numeric,0);
begin
 select default_taxable,default_tax_rate into taxable,rate from public.shops where id=(ro->>'shop_id')::uuid;
 if not found then raise exception 'Shop tax settings unavailable.'; end if;
 select tax_status into customer_status from public.customer_tax_profiles where shop_id=(ro->>'shop_id')::uuid and customer_id=ro->>'customer_id';
 customer_status := coalesce(customer_status,'inherit');
 taxable := case customer_status when 'taxable' then true when 'exempt' then false else taxable end;
 if not taxable then rate := 0; end if;
 subtotal := round(greatest(0,labor+parts+supplies+environmental+other_fee-discount),2);
 base := greatest(0,labor+parts+case when coalesce((ro->>'estimate_shop_supplies_taxable')::boolean,true) then supplies else 0 end
   +case when coalesce((ro->>'estimate_environmental_fee_taxable')::boolean,false) then environmental else 0 end
   +case when coalesce((ro->>'estimate_misc_fee_taxable')::boolean,true) then other_fee else 0 end-discount);
 tax := case when taxable then round(base*rate/100,2) else 0 end;
 return jsonb_build_object('subtotal',subtotal,'tax',tax,'total',subtotal+tax,'taxable',taxable,'rate',rate,'customer_tax_status',customer_status);
end; $$;
revoke all on function public.shop_estimate_authorization_totals(jsonb) from public,anon,authenticated;
create or replace function public.audit_shop_estimate_approval()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare snapshot jsonb; changed boolean; req jsonb; file_path text; actor_email text; scope_amount numeric(12,2); relation text; related_id uuid; financials jsonb;
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
        financials := public.shop_estimate_authorization_totals(to_jsonb(new));
        if coalesce(req->>'expected_estimate_total','') !~ '^[0-9]+([.][0-9]{1,2})?$'
            or (req->>'expected_estimate_total')::numeric is distinct from (financials->>'total')::numeric then
            raise exception 'Estimate tax or total changed. Reload and confirm the tax-inclusive authorization summary.';
        end if;
        snapshot := snapshot || jsonb_build_object('authorization_tax_snapshot',financials);
        if coalesce(req->>'approval_scope','entire') = 'entire' then
            scope_amount := (financials->>'total')::numeric;
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
revoke all on function public.audit_shop_estimate_approval() from public;
notify pgrst,'reload schema';
commit;
