// Fake supabase-js used only by dev/demo-server.mjs (sends queries to the demo server)
(() => {
  class Q {
    constructor(t) { this.t = t; this.f = []; this.o = []; }
    select() { if (!this.action) this.action = 'select'; return this; }
    insert(v) { this.action = 'insert'; this.values = v; return this; }
    update(v) { this.action = 'update'; this.values = v; return this; }
    upsert(v) { this.action = 'upsert'; this.values = v; return this; }
    delete() { this.action = 'delete'; return this; }
    eq(c, v) { this.f.push(['eq', c, v]); return this; }
    in(c, v) { this.f.push(['in', c, v]); return this; }
    order(c, o) { this.o.push([c, !(o && o.ascending === false)]); return this; }
    range(a, b) { this.r = [a, b]; return this; }
    single() { this.one = true; return this; }
    then(res, rej) {
      return fetch('/__dev/query', { method: 'POST', body: JSON.stringify(this) }).then(r => r.json()).then(res, rej);
    }
  }
  const session = { user: { email: 'admin@test.local' } };
  const client = {
    auth: {
      getSession: async () => ({ data: { session: localStorage.getItem('mockOut') ? null : session } }),
      onAuthStateChange() {},
      signInWithPassword: async () => { localStorage.removeItem('mockOut'); return { data: { session }, error: null }; },
      signOut: async () => { localStorage.setItem('mockOut', '1'); location.reload(); }
    },
    rpc: async () => ({ data: true, error: null }),
    from: t => new Q(t),
    storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: '/assets/logo.png' } }) }) }
  };
  window.supabase = { createClient: () => client };
})();
