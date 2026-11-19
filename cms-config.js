// =====================================================================
// Supabase connection (used by the website and the /admin panel)
// Find these in Supabase: Project Settings → API
//   - Project URL
//   - "anon" / "publishable" key  (safe to be public — the database
//     rules in supabase/schema.sql decide what it can do)
// Never put the "service_role" / secret key here.
// Leave them empty and the site simply shows the content built into index.html.
// =====================================================================
window.CMS_CONFIG = {
  SUPABASE_URL: 'https://hrvesphvgisnbzyfybuo.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_tGoe5MvcZGPky9_AxlX4kA_AOgzzoe1'
};
