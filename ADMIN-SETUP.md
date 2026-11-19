# Admin panel setup

The site now has an admin panel at **littlecrewco.com/admin** where you can:

- **Submissions** – see every contact form and event enquiry in a table. You can search, filter by form, status or date, sort by any column, open one to read and reply, mark entries read or archived, delete them, and **download them as CSV** (opens in Excel or Google Sheets).
- **Events** – add, edit, duplicate, hide or show, reorder and delete events, and upload poster images. Each event has a **How people book** setting:
  - **Tickets on sale** – "Book Now" opens your ticket link.
  - **Waitlist** – a "Join Waitlist" form asking for name, email, UK contact number and UK postcode. Phone numbers and postcodes are checked before the form sends. To get the list for one event, filter Submissions by that event and download the CSV.
  - **Enquiry** – a simple name and email form.
- **Website text** – edit any text on the homepage (hero, about, services, contact details, footer and more).

The data lives in a free **Supabase** database. The site itself is still a static GitHub Pages site.

## One-time setup (about 10 minutes)

1. **Create a Supabase project.** Sign up at https://supabase.com, click **New project**, pick a name and a database password, and choose the **London** region.
2. **Create the tables.** In the project, open **SQL Editor → New query**, paste the whole of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**. This creates the tables and security rules, and copies in your current 4 events.
3. **Turn off public sign-ups.** Go to **Authentication → Sign In / Providers** and switch off **Allow new users to sign up**. Only people you add can log in.
4. **Create your admin login.** Go to **Authentication → Users → Add user → Create new user**, enter your email and a strong password, and tick **Auto confirm**.
5. **Make that user an admin.** Back in the SQL Editor, run this with your email:
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'you@example.com';
   ```
   Repeat steps 4–5 for anyone else who needs access.
6. **Connect the website.** Go to **Project Settings → API**, copy the **Project URL** and the **anon / publishable** key, and paste them into [`cms-config.js`](cms-config.js). Never use the `service_role` or secret key.
7. **Publish.** Commit and push to GitHub. Once GitHub Pages updates, sign in at `littlecrewco.com/admin`.

## How it behaves

- Saved changes show on the live site right away, with no redeploy. Visitors may need to refresh.
- Forms still send the Web3Forms email notification **and** save to the database. A submission counts as sent if either one works.
- If the database is unreachable (for example a paused free project), the site falls back to the text and events built into `index.html`, so it never breaks.
- Free Supabase projects **pause after 7 days with no activity**. Normal site traffic counts as activity. If the project ever pauses, click **Restore** in the dashboard.
- Uploaded images go to the `site-images` storage bucket. Existing posters keep loading from the `assets/` folder.
- The contact form and the enquiry form both have a hidden spam trap.

## For developers

- Any element in `index.html` with a `data-cms="section.name"` attribute shows up in **Website text** automatically. The text in the HTML is the default value.
  - `data-cms-rich="gradient-text"` turns `*words*` into highlighted spans and line breaks into `<br>`.
  - `data-cms-attr="data-val"` edits an attribute instead of the text.
  - `data-cms-href="mailto:"` or `"tel:"` also updates the link.
  - `data-cms-label="..."` sets the label shown in the admin panel.
- To add a new editable text block, add those attributes to the element. The admin panel picks it up automatically, and no database change is needed.
