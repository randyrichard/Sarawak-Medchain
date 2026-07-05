# Supabase Privacy Lockdown (run before any real patient data)

**Why:** right now the public key built into the website can read the *entire*
`medical_certificates` table — every patient's name, IC, dates. That's fine for
the demo (fake data), but under Malaysia's PDPA you must not let real patient
data be dumped. This change makes the public key able to fetch only **one
record at a time, by its exact QR hash**, and never the whole table.

The website already prefers the `verify_mc()` function below and falls back to
the old read until you run this — so nothing breaks in between.

## Steps
1. Open your Supabase project → **SQL Editor** → New query.
2. Paste and **Run** the SQL below.

```sql
-- 1) A safe lookup that returns exactly one certificate by its hash,
--    and never the private diagnosis. Runs with elevated rights but only
--    exposes this narrow query.
create or replace function public.verify_mc(mc_hash text)
returns table (
  id text,
  mc_id text,
  patient_name text,
  ic_number text,
  duration int,
  doctor_name text,
  clinic_name text,
  mmc_number text,
  date_issued text,
  start_date text,
  end_date text,
  block_number bigint
)
language sql
security definer
stable
set search_path = public
as $$
  select id, mc_id, patient_name, ic_number, duration, doctor_name,
         clinic_name, mmc_number, date_issued, start_date, end_date, block_number
  from public.medical_certificates
  where id = mc_hash
  limit 1;
$$;

revoke all on function public.verify_mc(text) from public;
grant execute on function public.verify_mc(text) to anon;

-- 2) Remove the policy that let anyone read the whole table.
drop policy if exists "anon can read MCs" on public.medical_certificates;
```

3. Done. The verify page now uses `verify_mc()`; the full table can no longer
   be listed with the public key.

## Notes
- **Issuance still works.** The insert policy is untouched, so the Doctor Portal
  can still write new certificates. (For production you'd move issuance behind an
  authenticated/service path too, but it's not a data-leak risk — a fake insert
  still can't verify, because it has no matching on-chain anchor.)
- **Diagnosis:** the app no longer stores or displays the medical reason at all,
  and `verify_mc()` doesn't return it. Old demo rows may still contain a
  `diagnosis` value; to scrub it run once:
  ```sql
  update public.medical_certificates set diagnosis = null;
  ```
- If you ever need to roll back, re-create the read policy:
  ```sql
  create policy "anon can read MCs" on public.medical_certificates
    for select using (true);
  ```
