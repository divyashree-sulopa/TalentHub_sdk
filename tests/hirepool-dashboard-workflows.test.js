/**
 * End-to-end: the website bot and the candidate / company / agency dashboard
 * workflows through the real SDK routes, against an in-memory stand-in for the
 * HirePool API (port 8000 intercepted; nothing real is called).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';

process.env.NODE_ENV = 'development';
delete process.env.VERCEL_ENV;
process.env.ENABLE_HIREPOOL_LOCAL_BRIDGE = 'true';
process.env.DYNAMIC_API_DISCOVERY_ENABLED = 'true';
process.env.API_DISCOVERY_ALLOWED_HOSTS = 'localhost';
process.env.HIREPOOL_LOCAL_API_BASE_URL = 'http://localhost:8000/';
process.env.HIREPOOL_LOCAL_OPENAPI_URL = 'http://localhost:8000/api/openapi.json';
process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000,http://localhost:5173';
process.env.HIREPOOL_LOCAL_ALLOWED_ORIGINS = 'http://localhost:3000,http://localhost:5173';
process.env.RATE_LIMIT_MAX_REQUESTS = '100000';

const root = new URL('../', import.meta.url).href;
const spec = JSON.parse(fs.readFileSync(new URL('./fixtures/hirepool-openapi.json', import.meta.url), 'utf8'));

// ---- In-memory HirePool --------------------------------------------------
const db = {
  candidateProfile: { first_name: 'Asha', last_name: 'Rao', phone: '', current_location: '', job_title: 'Developer', professional_summary: '', years_of_experience: null, skills: ['React'], education: [], work_experience: [], profile_completion_percentage: 40 },
  clientProfile: { company_name: 'Acme', industry: 'Technology', company_size: '', headquarters_location: '', company_website: '', about_company: '' },
  clientMe: { full_name: 'Hari HR', designation: '', phone: '9876543210' },
  agencyProfile: { consultancy_name: 'Bhav recruitment', industry_specialization: ['IT'], company_size: '11-50', headquarters_location: 'Pune', website: '', about_company: '' },
  agencyMe: { full_name: 'Divya S', designation: 'HR Manager', phone: '6578903452' },
  bench: [],
  jobs: [{ id: 'job-1', title: 'Senior Backend Engineer', company_name: 'Acme', locations: ['Pune'], remote_type: 'hybrid', status: 'active', job_type: 'full_time', experience_level: 'senior', required_skills: ['Node.js'] }],
  calls: []
};
function route(method, path, body) {
  db.calls.push(`${method} ${path.split('?')[0]}`);
  const p = path.split('?')[0];
  if (p === '/api/openapi.json') return [200, spec];
  if (p === '/api/v1/candidates/profile' && method === 'GET') return [200, db.candidateProfile];
  if (p === '/api/v1/candidates/profile' && method === 'PUT') { Object.assign(db.candidateProfile, body); return [200, db.candidateProfile]; }
  if (p === '/api/v1/clients/profile' && method === 'GET') return [200, db.clientProfile];
  if (p === '/api/v1/clients/profile' && method === 'PUT') { Object.assign(db.clientProfile, body); return [200, db.clientProfile]; }
  if (p === '/api/v1/clients/me' && method === 'GET') return [200, db.clientMe];
  if (p === '/api/v1/clients/me' && method === 'PUT') { Object.assign(db.clientMe, body); return [200, db.clientMe]; }
  if (p === '/api/v1/consultancies/profile' && method === 'GET') return [200, db.agencyProfile];
  if (p === '/api/v1/consultancies/me' && method === 'GET') return [200, db.agencyMe];
  if (p === '/api/v1/consultancies/candidates' && method === 'POST') {
    if (db.bench.some(c => c.email === body.email)) return [409, { detail: 'Candidate already exists' }];
    const cand = { id: `cand-${db.bench.length + 1}`, ...body }; db.bench.push(cand); return [201, cand];
  }
  if (p === '/api/v1/consultancies/candidates' && method === 'GET') {
    const q = new URLSearchParams(path.split('?')[1] || '').get('query')?.toLowerCase() || '';
    const items = db.bench.filter(c => !q || `${c.first_name} ${c.last_name} ${c.email}`.toLowerCase().includes(q));
    return [200, { items, total: items.length, page: 1, page_size: 20, total_pages: 1 }];
  }
  const candMatch = p.match(/^\/api\/v1\/consultancies\/candidates\/([^/]+)$/);
  if (candMatch) {
    const c = db.bench.find(x => x.id === candMatch[1]);
    if (!c) return [404, { detail: 'Not found' }];
    if (method === 'PUT') Object.assign(c, body);
    return [200, c];
  }
  if (p === '/api/v1/jobs/search' && method === 'GET') return [200, { items: db.jobs, total: db.jobs.length, page: 1, page_size: 20 }];
  if (p === '/api/v1/jobs' && method === 'POST') { const job = { id: `job-${db.jobs.length + 1}`, status: 'draft', ...body }; db.jobs.push(job); return [201, job]; }
  if (p.startsWith('/api/v1/jobs/') && method === 'GET') return [200, db.jobs.find(j => p.endsWith(j.id)) || db.jobs[0]];
  if (p === '/api/v1/applications/consultancy-submit' && method === 'POST') return [200, { submitted: body.candidate_ids.length, job_id: body.job_id }];
  if (p === '/api/v1/applications/my-applications' || p === '/api/v1/applications') return [200, { items: [], total: 0 }];
  if (p === '/api/v1/consultancies/dashboard') return [200, { total_candidates: db.bench.length }];
  return [404, { detail: `No mock for ${method} ${p}` }];
}
test('website bot and all three dashboard role workflows work end to end', { timeout: 240000 }, async () => {
  const realFetch = globalThis.fetch;
  const realRequest = http.request;
  try {
  http.request = function intercept(urlOrOptions, maybeOptions, maybeCallback) {
    let opts = urlOrOptions;
    let cb = maybeOptions;
    if (typeof urlOrOptions === 'string' || urlOrOptions instanceof URL) {
      const u = new URL(String(urlOrOptions));
      opts = { hostname: u.hostname, port: u.port || '80', path: `${u.pathname}${u.search}`, method: (typeof maybeOptions === 'object' && maybeOptions?.method) || 'GET' };
      cb = typeof maybeOptions === 'function' ? maybeOptions : maybeCallback;
    }
    const host = opts?.hostname || opts?.host?.split(':')[0];
    if (!['127.0.0.1', 'localhost'].includes(host) || Number(opts?.port || 80) !== 8000) return realRequest.apply(this, arguments);
    const req = new EventEmitter();
    const chunks = [];
    req.write = c => { if (c) chunks.push(Buffer.from(c)); return true; };
    req.setTimeout = () => req; req.destroy = () => req; req.abort = () => req;
    req.end = c => {
      if (c) chunks.push(Buffer.from(c));
      queueMicrotask(() => {
        let body = null;
        try { body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null; } catch { body = null; }
        const [status, payload] = route((opts.method || 'GET').toUpperCase(), opts.path || '/', body);
        const res = new EventEmitter();
        res.statusCode = status;
        res.headers = { 'content-type': 'application/json' };
        res.setEncoding = () => {};
        res.destroy = () => {};
        res.resume = () => {};
        cb?.(res);
        req.emit('response', res);
        // Like a real socket: the body arrives after the handler has started listening.
        setImmediate(() => {
          res.emit('data', Buffer.from(JSON.stringify(payload)));
          res.emit('end');
        });
      });
    };
    return req;
  };
  // Public job board (website) uses fetch.
  globalThis.fetch = async url => {
    const u = new URL(String(url));
    if (u.pathname === '/api/v1/public/jobs') {
      return new Response(JSON.stringify({ items: [{ title: 'Frontend Developer (React)', company: 'Acme', locations: ['Bengaluru'], remote_type: 'hybrid', skills: ['React'] }], total: 1 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('{}', { status: 404 });
  };

  const { createApp } = await import(root + 'backend/src/app.js');
  const { setAIProvider } = await import(root + 'backend/src/providers/factory.js');
  const { storeHirePoolSession } = await import(root + 'backend/src/local-integrations/hirepool-session-store.js');
  const { registerHirePoolLocalDevelopmentIntegration } = await import(root + 'integrations/hirepool/local-development.js');
  const { default: request } = await import(root + 'node_modules/supertest/index.js');
  registerHirePoolLocalDevelopmentIntegration?.();
  let aiReply = 'Happy to help! What role are you looking for?';
  setAIProvider({
    name: 'qa',
    async checkHealth() { return { available: true, model: 'qa' }; },
    async chat() { return { text: aiReply, model: 'qa', finishReason: 'stop' }; },
    async chatStream(i) { i.onChunk?.(aiReply); return { text: aiReply, model: 'qa' }; }
  });
  const app = createApp();
  const W = 'http://localhost:3000';
  const A = 'http://localhost:5173';
  const results = [];
  const check = (name, ok, detail = '') => { results.push({ name, ok: Boolean(ok), detail }); };
  const sessions = {
    candidate: storeHirePoolSession('e2e-cand', { id: 'u-c', email: 'asha@qa.test', userType: 'candidate', organizationRole: null }),
    client: storeHirePoolSession('e2e-client', { id: 'u-cl', email: 'hari@acme.test', userType: 'client', organizationRole: 'admin' }),
    consultancy: storeHirePoolSession('e2e-agency', { id: 'u-ag', email: 'divya@bhav.test', userType: 'consultancy', organizationRole: 'admin' })
  };
  const chat = (origin, message, conversationId, auth) => {
    let r = request(app).post('/api/chat').set('Origin', origin);
    if (auth) r = r.set('Authorization', `Bearer ${auth}`);
    return r.send({ assistantId: 'hirepool', message, ...(conversationId ? { conversationId } : {}) }).timeout(20000).catch(e => ({ status: 'TIMEOUT', body: { text: String(e.message) } }));
  };
  const upload = (origin, text, filename, auth, conversationId) => {
    let r = request(app).post('/api/documents/upload').set('Origin', origin)
      .set('X-Document-Processing-Consent', 'accepted').set('X-Document-Consent-Version', '1');
    if (auth) r = r.set('Authorization', `Bearer ${auth}`);
    r = r.attach('file', Buffer.from(text), filename).field('assistantId', 'hirepool').field('consentAccepted', 'true').field('consentVersion', '1');
    if (conversationId) r = r.field('conversationId', conversationId);
    return r.timeout(20000).catch(e => ({ status: 'TIMEOUT', body: { error: { message: String(e.message) } } }));
  };
  const confirm = (auth, origin, token) => request(app).post('/api/dynamic-api/confirm').set('Origin', origin)
    .set('Authorization', `Bearer ${auth}`).send({ confirmationToken: token }).timeout(20000).catch(e => ({ status: 'TIMEOUT', body: { error: String(e.message) } }));
  const api = (method, path, auth, body) => {
    let r = request(app)[method](`/api/hirepool/assistant/${path}`).set('Origin', A).set('Authorization', `Bearer ${auth}`);
    return (body ? r.send(body) : r).timeout(20000).catch(e => ({ status: 'TIMEOUT', body: { error: String(e.message) } }));
  };
  const RESUME = 'Priya Sharma\nFrontend Developer\npriya.sharma@example.com | +91 98765 43210 | Bengaluru\nProfessional Summary\nFrontend developer with 3 years of experience in React.\nTechnical Skills\nReact, TypeScript, Redux\nWork Experience\nFrontend Developer, Acme Labs\nEducation\nB.Tech, VTU\nProjects\nPortfolio';
  const JD = 'Job Title: Senior Backend Engineer\nAbout the role\nWe are looking for a backend engineer in Pune, hybrid.\nKey Responsibilities\n- Build APIs in Node.js\nRequirements\n- 5+ years of experience with Node.js and PostgreSQL, AWS\nBenefits: health insurance. Employment type: Full-time.';

  // ---- Website bot ------------------------------------------------------------
  {
    const cfg = await request(app).get('/api/config/hirepool').set('Origin', W);
    check('website: config has role-card welcome', cfg.body.assistant?.behavior?.welcome?.roleCards?.length === 3, cfg.status);
    const hi = await chat(W, "I'm a staffing agency");
    check('website: chat replies', hi.status === 200 && hi.body.text, hi.status);
    const price = await chat(W, 'How much does HirePool cost?');
    check('website: pricing goes to contact', /contact/i.test(price.body.text || ''), price.body.text?.slice(0, 80));
    const up = await upload(W, RESUME, 'priya.txt');
    check('website: resume upload -> jobs + signup offer', up.body.insight?.kind === 'resume' && /Frontend Developer \(React\)/.test(up.body.insight?.text || ''), up.status + ' ' + (up.body.error?.message || ''));
    const yes = await chat(W, 'Sign me up', up.body.conversationId);
    check('website: "Sign me up" starts candidate signup', yes.body.action?.action === 'hirepool_signup' && yes.body.action?.parameters?.role === 'candidate', JSON.stringify(yes.body.action || yes.body.text).slice(0, 100));
    aiReply = 'HirePool helps agencies place candidates.\n\n**Shall I create your consultancy account now?**';
    const offer = await chat(W, 'how is hirepool useful for my agency');
    aiReply = 'Happy to help! What role are you looking for?';
    const ok = await chat(W, 'ok', offer.body.conversationId);
    check('website: "ok" to bot offer starts consultancy signup', ok.body.action?.parameters?.role === 'consultancy', JSON.stringify(ok.body.action || ok.body.text).slice(0, 100));
    const cake = await upload(W, 'Chocolate cake recipe. Mix flour sugar cocoa eggs milk and butter then bake for thirty five minutes at one eighty degrees and cool before frosting for eight people.', 'cake.txt');
    check('website: unrelated upload asks for a relevant file', cake.body.insight?.kind === 'unrelated', cake.body.insight?.kind);
    const dash = await request(app).get('/api/hirepool/assistant/welcome').set('Origin', W).set('Authorization', `Bearer ${sessions.candidate.credential}`);
    check('website: dashboard welcome refused on website', dash.status === 403, dash.status);
  }

  // ---- Candidate dashboard ---------------------------------------------------
  {
    const c = sessions.candidate.credential;
    const welcome = await api('get', 'welcome?hour=10', c);
    check('candidate: welcome with actions + progress', welcome.status === 200 && welcome.body.actions?.length && welcome.body.profileProgress, JSON.stringify(welcome.body).slice(0, 120));
    const form = await api('get', 'profile-form?mode=missing', c);
    check('candidate: profile form lists missing fields', form.status === 200 && form.body.fields?.some(f => f.key === 'current_location'), form.status + ' ' + JSON.stringify(form.body).slice(0, 100));
    const save = await api('post', 'profile-form', c, { values: { current_location: 'Bengaluru', years_of_experience: '3', skills: 'React, TypeScript' } });
    check('candidate: profile form saves to HirePool', save.status === 200 && save.body.saved && db.candidateProfile.current_location === 'Bengaluru' && db.candidateProfile.years_of_experience === 3, JSON.stringify(save.body).slice(0, 120));
    const bad = await api('post', 'profile-form', c, { values: { years_of_experience: '90' } });
    check('candidate: invalid value is explained per field', bad.status === 422 && bad.body.error?.fields?.years_of_experience, bad.status);
    const up = await upload(A, RESUME, 'cv.txt', c);
    check('candidate: resume upload offers fill/jobs/save', up.body.insight?.options?.map(o => o.id).join() === 'fill_profile,find_jobs,save_resume', JSON.stringify(up.body.insight || up.body.error).slice(0, 120));
    const show = await chat(A, 'Show my profile', null, c);
    check('candidate: "show my profile" answers from HirePool', show.status === 200 && /Bengaluru|Asha/.test(show.body.text || ''), (show.body.text || '').slice(0, 100));
    const jobs = await chat(A, 'Find frontend developer jobs in Bengaluru', null, c);
    check('candidate: job search replies', jobs.status === 200 && (jobs.body.text || '').length > 10, (jobs.body.text || '').slice(0, 100));
  }

  // ---- Company dashboard -----------------------------------------------------
  {
    const c = sessions.client.credential;
    const welcome = await api('get', 'welcome?hour=15', c);
    check('company: welcome has "Post a new job"', welcome.body.actions?.some(a => a.prompt === 'Post a new job'), JSON.stringify(welcome.body.actions || welcome.body).slice(0, 100));
    const up = await upload(A, JD, 'jd.txt', c);
    check('company: JD upload offers create job', up.body.insight?.options?.some(o => o.id === 'create_job'), JSON.stringify(up.body.insight || up.body.error).slice(0, 120));
    const createMsg = up.body.insight?.data?.message;
    const staged = await chat(A, createMsg || 'Post a new job', up.body.conversationId, c);
    check('company: JD becomes a job review card', staged.body.action?.confirmationToken || staged.body.action?.id, (staged.body.text || '').slice(0, 160));
    if (staged.body.action?.id) {
      const before = db.jobs.length;
      const done = await confirm(c, A, staged.body.action.id);
      check('company: confirm creates the job in HirePool', done.status === 200 && db.jobs.length === before + 1 && /Senior Backend Engineer/.test(db.jobs.at(-1).title || ''), `${done.status} ${JSON.stringify(done.body).slice(0, 120)}`);
    }
    const resume = await upload(A, RESUME, 'cv.txt', c);
    check('company: a resume upload is explained', /candidate's resume/.test(resume.body.insight?.text || ''), resume.body.insight?.text?.slice(0, 80));
    const bench = await api('post', 'bench-candidates', c, { candidate: {} });
    check('company: agency-only route refused', bench.status === 403, bench.status);
  }

  // ---- Agency dashboard ------------------------------------------------------
  {
    const c = sessions.consultancy.credential;
    const welcome = await api('get', 'welcome?hour=19', c);
    check('agency: welcome greets with org + progress', welcome.body.salutation === 'Good evening, Divya! 👋', welcome.body.salutation);
    const t1 = await chat(A, 'Add a candidate', null, c);
    const conv = t1.body.conversationId;
    const t2 = await chat(A, 'boomi boomi@gmail.com software engineer', conv, c);
    const t3 = await chat(A, 'naidu bengaluru, india', conv, c);
    check('agency: follow-up details accepted (not off-topic)', t3.body.action?.id && !/can't answer general/i.test(t3.body.text || ''), (t3.body.text || '').slice(0, 120));
    if (t3.body.action?.id) {
      const done = await confirm(c, A, t3.body.action.id);
      check('agency: confirm adds Boomi Naidu to the bench', done.status === 200 && db.bench.some(b => b.first_name === 'Boomi' && b.last_name === 'Naidu'), `${done.status} ${JSON.stringify(done.body).slice(0, 120)}`);
    }
    const ask = await chat(A, 'add phone number to this candidate', conv, c);
    check('agency: candidate edit asks for the number (not own profile)', /Boomi Naidu.*phone/i.test(ask.body.text || ''), (ask.body.text || '').slice(0, 120));
    const num = await chat(A, '4562897634', conv, c);
    check('agency: number staged for the candidate', Boolean(num.body.action?.id), (num.body.text || '').slice(0, 120));
    if (num.body.action?.id) {
      const done = await confirm(c, A, num.body.action.id);
      check('agency: confirm updates the candidate phone', done.status === 200 && db.bench.find(b => b.first_name === 'Boomi')?.phone === '4562897634' && db.agencyMe.phone === '6578903452', `${done.status} ${JSON.stringify(done.body).slice(0, 140)}`);
    }
    const up = await upload(A, RESUME, 'priya.txt', c);
    check('agency: resume upload gives a bench candidate', up.body.insight?.data?.candidate?.email === 'priya.sharma@example.com', JSON.stringify(up.body.insight || up.body.error).slice(0, 120));
    const add = await api('post', 'bench-candidates', c, { candidate: up.body.insight?.data?.candidate });
    check('agency: "Add to bench" adds the candidate', add.body.status === 'added' && add.body.id, JSON.stringify(add.body));
    const dup = await api('post', 'bench-candidates', c, { candidate: up.body.insight?.data?.candidate });
    check('agency: duplicate reported as "already on bench"', dup.body.status === 'duplicate', JSON.stringify(dup.body));
    const jobs = await api('get', 'agency-jobs', c);
    check('agency: open jobs for the picker', jobs.status === 200 && jobs.body.jobs?.length >= 1, JSON.stringify(jobs.body).slice(0, 120));
    const sub = await api('post', 'bench-submit', c, { jobId: jobs.body.jobs?.[0]?.id, candidateIds: [add.body.id] });
    check('agency: bulk submit to a job', sub.status === 200 && sub.body.status === 'submitted', JSON.stringify(sub.body).slice(0, 120));
    const opp = await chat(A, 'Show job opportunities', null, c);
    check('agency: job opportunities listed', /Senior Backend Engineer/.test(opp.body.text || ''), (opp.body.text || '').slice(0, 120));
  }

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(0);

  } finally {
    http.request = realRequest;
    globalThis.fetch = realFetch;
  }
});
