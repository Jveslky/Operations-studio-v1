-- Personal Fleet regional and measurement preferences.
-- Existing accounts retain the current US defaults.

alter table public.personal_fleet_accounts
    add column if not exists region_code text not null default 'US',
    add column if not exists locale_code text not null default 'en-US',
    add column if not exists currency_code text not null default 'USD',
    add column if not exists distance_unit text not null default 'mi',
    add column if not exists volume_unit text not null default 'gal',
    add column if not exists temperature_unit text not null default 'F',
    add column if not exists pressure_unit text not null default 'psi';

create or replace function public.update_personal_fleet_settings(
    requested_name text,
    requested_region text,
    requested_locale text,
    requested_currency text,
    requested_distance text,
    requested_volume text,
    requested_temperature text,
    requested_pressure text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if char_length(trim(coalesce(requested_name,''))) < 2 or char_length(trim(requested_name)) > 120 then raise exception 'Fleet Name must be between 2 and 120 characters'; end if;
    if requested_region not in ('US','IE','CUSTOM') then raise exception 'Unsupported region'; end if;
    if requested_locale not in ('en-US','en-IE','en-GB') then raise exception 'Unsupported regional format'; end if;
    if requested_currency not in ('USD','EUR','GBP') then raise exception 'Unsupported currency'; end if;
    if requested_distance not in ('mi','km') then raise exception 'Unsupported distance unit'; end if;
    if requested_volume not in ('gal','L') then raise exception 'Unsupported volume unit'; end if;
    if requested_temperature not in ('F','C') then raise exception 'Unsupported temperature unit'; end if;
    if requested_pressure not in ('psi','bar','kPa') then raise exception 'Unsupported pressure unit'; end if;

    update public.personal_fleet_accounts accounts set
        name=trim(requested_name),
        region_code=requested_region,
        locale_code=requested_locale,
        currency_code=requested_currency,
        distance_unit=requested_distance,
        volume_unit=requested_volume,
        temperature_unit=requested_temperature,
        pressure_unit=requested_pressure,
        updated_at=now()
    where exists (
        select 1 from public.personal_fleet_members members
        where members.account_id=accounts.id and members.user_id=auth.uid()
          and members.is_active=true and members.role in ('owner','manager')
    );
    if not found then raise exception 'Fleet owner or manager access required'; end if;
end;
$$;

revoke all on function public.update_personal_fleet_settings(text,text,text,text,text,text,text,text) from public;
grant execute on function public.update_personal_fleet_settings(text,text,text,text,text,text,text,text) to authenticated;
