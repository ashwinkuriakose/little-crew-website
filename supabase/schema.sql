-- =====================================================================
-- Little Crew & Co — CMS database setup
-- Run this whole file once in Supabase: Dashboard → SQL Editor → New query
-- Safe to re-run: it only creates things that don't exist yet.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Admins: only users listed here can use the admin panel
-- ---------------------------------------------------------------------
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

alter table public.admins enable row level security;
drop policy if exists "admins can see admins" on public.admins;
create policy "admins can see admins" on public.admins
  for select using (public.is_admin());

-- ---------------------------------------------------------------------
-- 2. Site content: editable text blocks (key → value)
-- ---------------------------------------------------------------------
create table if not exists public.site_content (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.site_content enable row level security;
drop policy if exists "anyone can read content" on public.site_content;
create policy "anyone can read content" on public.site_content
  for select using (true);
drop policy if exists "admins manage content" on public.site_content;
create policy "admins manage content" on public.site_content
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 3. Events
-- ---------------------------------------------------------------------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  category text not null default 'upcoming' check (category in ('upcoming', 'past')),
  published boolean not null default true,
  featured boolean not null default false,   -- show as a slide in the top banner
  sort_order int not null default 0,

  -- card
  title text not null,
  tagline text,
  summary text,
  image_url text,
  date_day text,
  date_month text,
  date_year text,
  status_pill text,
  pill_style text not null default 'upcoming' check (pill_style in ('upcoming', 'tour', 'past')),
  time_label text,
  location text,
  badges text[] not null default '{}',
  -- how visitors book: 'tickets' = link to booking_url, 'waitlist' = waitlist form,
  -- 'enquiry' = simple name + email enquiry form
  booking_mode text not null default 'enquiry' check (booking_mode in ('tickets', 'waitlist', 'enquiry')),
  booking_url text,
  phone text,

  -- details popup (falls back to card fields when empty)
  details_title text,
  details_time text,
  details_location text,
  artist text,
  description text,
  cta_text text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.events enable row level security;
drop policy if exists "anyone can read published events" on public.events;
create policy "anyone can read published events" on public.events
  for select using (published or public.is_admin());
drop policy if exists "admins manage events" on public.events;
create policy "admins manage events" on public.events
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 4. Form submissions (contact form, event enquiry form, event waitlist form)
-- ---------------------------------------------------------------------
create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  form text not null constraint submissions_form_check check (form in ('contact', 'booking', 'waitlist')),
  name text not null check (char_length(name) between 1 and 200),
  email text not null check (char_length(email) between 3 and 320),
  phone text check (char_length(phone) <= 50),
  subject text check (char_length(subject) <= 300),
  message text check (char_length(message) <= 5000),
  event_title text check (char_length(event_title) <= 300),
  postcode text check (char_length(postcode) <= 10),
  status text not null default 'new' check (status in ('new', 'read', 'archived'))
);

-- Upgrades for databases created with an earlier version of this file
alter table public.events add column if not exists featured boolean not null default false;
alter table public.events add column if not exists booking_mode text not null default 'enquiry'
  check (booking_mode in ('tickets', 'waitlist', 'enquiry'));
update public.events set booking_mode = 'tickets' where booking_url is not null and booking_mode = 'enquiry';
alter table public.submissions add column if not exists postcode text check (char_length(postcode) <= 10);
alter table public.submissions drop constraint if exists submissions_form_check;
alter table public.submissions add constraint submissions_form_check
  check (form in ('contact', 'booking', 'waitlist'));

create index if not exists submissions_created_at_idx on public.submissions (created_at desc);

alter table public.submissions enable row level security;
-- Visitors can only ADD a submission (always as 'new'); they can never read them.
drop policy if exists "anyone can submit" on public.submissions;
create policy "anyone can submit" on public.submissions
  for insert to anon, authenticated with check (status = 'new');
drop policy if exists "admins read submissions" on public.submissions;
create policy "admins read submissions" on public.submissions
  for select using (public.is_admin());
drop policy if exists "admins update submissions" on public.submissions;
create policy "admins update submissions" on public.submissions
  for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admins delete submissions" on public.submissions;
create policy "admins delete submissions" on public.submissions
  for delete using (public.is_admin());

-- ---------------------------------------------------------------------
-- 5. Image storage for event posters
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('site-images', 'site-images', true)
on conflict (id) do nothing;

drop policy if exists "admins upload images" on storage.objects;
create policy "admins upload images" on storage.objects
  for insert to authenticated with check (bucket_id = 'site-images' and public.is_admin());
drop policy if exists "admins update images" on storage.objects;
create policy "admins update images" on storage.objects
  for update to authenticated using (bucket_id = 'site-images' and public.is_admin());
drop policy if exists "admins delete images" on storage.objects;
create policy "admins delete images" on storage.objects
  for delete to authenticated using (bucket_id = 'site-images' and public.is_admin());

-- ---------------------------------------------------------------------
-- 6. Starting events (copied from the current website)
-- ---------------------------------------------------------------------
insert into public.events
  (sort_order, category, title, tagline, summary, image_url, date_day, date_month, date_year,
   status_pill, pill_style, time_label, location, badges, booking_mode, booking_url, phone,
   details_title, details_time, details_location, artist, description, cta_text)
select * from (values
  (1, 'upcoming', 'Anarkali Marikar Remix', 'New Year Party • Maidstone Leisure Centre',
   'Celebrate the New Year with a spectacular live music performance by Anarkali Marikar and band! Featuring a Live DJ, authentic food stalls, for a night to remember.',
   'assets/anarkali_marikar_live.jpg', '03', 'JAN', '2027',
   '🎉 New Year 2027', 'upcoming', '⏰ Gate Opens: 5:00 PM', '📍 Maidstone Leisure Centre, ME15 7RN',
   array['🎧 Live DJ', '🍛 Food Stall'], 'tickets', 'https://littlecrew.crowdpass.co.uk/', '+447388890443',
   'Anarkali Marikar Remix — New Year Party', 'Sunday, January 3rd, 2027 • Gate Opens: 5:00 PM',
   'Maidstone Leisure Centre, ME15 7RN', 'Anarkali Marikar & Live Band',
   'Little Crew presents Anarkali Marikar Remix - New Year Party! Celebrate New Year 2027 with a high-energy live music performance by Anarkali Marikar and band. Featuring a Live DJ, authentic food stalls, live henna artists, live caricatures, and a 360° photobooth for a night to remember at Maidstone Leisure Centre. Powered by Joanna Holidays, Ample Mortgages, Nava Ruchi, and IMAD Photography. Book your tickets now on CrowdPass!',
   'Book Tickets on CrowdPass 🎟️'),
  (2, 'upcoming', 'Sooraj Santhosh Live', 'One Voice, A Thousand Emotions • Stay Tuned',
   'Little Crew presents Sooraj Santhosh Live on his landmark tour across the UK and Ireland, powered by Joanna Holidays. Experience an electrifying evening of soulful music and powerhouse vocals. Stay tuned for city and venue schedules!',
   'assets/sooraj_santhosh_tour.jpg', 'MAY', 'TOUR', '2027',
   '⚡ UK & Ireland Tour', 'tour', '🗓️ May 2027', '📍 UK & Ireland Tour',
   array['Little Crew Presents', 'Powered by Joanna Holidays', 'UK & Ireland Tour'], 'enquiry', null, '+447388890443',
   'Sooraj Santhosh Live — UK & Ireland Tour', 'May 2027 • UK & Ireland Tour',
   'UK & Ireland Venues (Announcing Soon)', 'Sooraj Santhosh',
   'One Voice, A Thousand Emotions. Little Crew Presents Sooraj Santhosh Live on his landmark tour across the UK and Ireland, powered by Joanna Holidays. Experience an electrifying evening of soulful melodies and powerhouse vocals. Stay tuned for city and venue schedules! Contact us at 073 88 390 443 for tour info and sponsorships.',
   'Register for Tour Info'),
  (3, 'upcoming', 'Anju Joseph Live', 'A Complete Entertainment Show • UK & Europe',
   'Little Crew and V4 Entertainments present Anju Joseph Live on a dynamic UK & Europe tour! Featuring musical performances by Sreenath Sivasankaran and sensational comedy & mimicry by Mahesh Kunjumon.',
   'assets/anju_joseph_tour.jpg', 'MAY', 'JUN', '2027',
   '⚡ UK & Europe Tour', 'tour', '🗓️ May – June 2027', '📍 UK & Europe Tour',
   array['Little Crew & V4', 'Feat. Sreenath Sivasankaran', 'Mahesh Kunjumon (Mimicry)'], 'enquiry', null, '+447388890443',
   'Anju Joseph Live — UK & Europe Tour', 'May – June 2027 • UK & Europe Tour',
   'UK & Europe Venues (Announcing Soon)', 'Anju Joseph, Feat. Sreenath Sivasankaran & Mahesh Kunjumon',
   'A Complete Entertainment Show! Little Crew and V4 Entertainments present Anju Joseph Live on an electrifying UK & Europe tour across May – June 2027. Featuring dynamic musical performances with Sreenath Sivasankaran and sensational comedy & mimicry by Mahesh Kunjumon. Contact us for tour bookings and sponsorships at +44 7388 390443 or +44 7878 8896384.',
   'Inquire for Tour Info'),
  (4, 'past', 'Tun Fun Nights', 'The Ultimate Multilingual DJ Night • Concluded',
   'The ultimate multilingual DJ night. Live, loud, and unlimited fun! Held at Aura Bar & Club featuring amazing beats, non-stop entertainment, and peak party vibes with DJ Julix.',
   'assets/tun_fun_nights.jpg', '25', 'JUL', '2026',
   '✓ Concluded', 'past', '⏰ 08:00 PM', '📍 Aura Bar & Club, Tunbridge Wells',
   array['DJ JULIX', 'Successfully Completed'], 'enquiry', null, null,
   'Tun Fun Nights (Past Event)', 'Saturday, July 25th, 2026 • 8:00 PM onwards',
   'Aura Bar & Club, 46-50 High St, Tunbridge Wells, TN1 1XF', 'DJ Julix',
   'The ultimate multilingual DJ night. Live, loud, and unlimited fun! Experience amazing beats, non-stop entertainment, and the best party vibes with DJ Julix. This event has concluded. Contact us for private bookings and future party series!',
   'Inquire for Future Events')
) as seed
where not exists (select 1 from public.events);

-- ---------------------------------------------------------------------
-- 7. API access (needed if "Grant API access to new tables automatically"
--    was off when the project was created). The row-level security rules
--    above still decide exactly what each role may see or change.
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant select on public.site_content, public.events to anon, authenticated;
grant insert, update, delete on public.site_content, public.events to authenticated;
grant insert on public.submissions to anon, authenticated;
grant select, update, delete on public.submissions to authenticated;
grant select on public.admins to authenticated;

-- ---------------------------------------------------------------------
-- 8. Make yourself an admin
--    First create your login: Dashboard → Authentication → Users → Add user
--    Then replace the email below and run just this statement.
-- ---------------------------------------------------------------------
-- insert into public.admins (user_id)
-- select id from auth.users where email = 'you@example.com';
