begin;

-- An end time earlier than the start time represents an appointment that
-- crosses midnight into the following day (for example 11:30 PM–12:30 AM).
alter table public.shop_appointments
    drop constraint if exists shop_appointments_check;

comment on column public.shop_appointments.end_time is
    'Optional appointment end time. A value earlier than start_time means the following calendar day.';

commit;
