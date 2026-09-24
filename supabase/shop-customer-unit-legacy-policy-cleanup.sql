-- Apply after shop-customer-unit-security.sql and shop-user-permissions.sql.
-- Old membership-only policies combine with newer policies using OR, allowing
-- any member (including an inactive member) to bypass customer write roles.
begin;

drop policy if exists "Insert own customers" on public."Customers";
drop policy if exists "Select own customers" on public."Customers";
drop policy if exists "Members can update shop customers" on public."Customers";
drop policy if exists "Members can add customer units" on public.customer_units;
drop policy if exists "Members can view customer units" on public.customer_units;
drop policy if exists "Members can update customer units" on public.customer_units;

commit;
