import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../backend/src/app.js';
import { DOCUMENT_PROCESSING_CONSENT_VERSION } from '../config/document-upload.js';
import { _clearPublicJobCache } from '../integrations/hirepool/public-jobs.js';
import {
  DOCUMENT_KINDS,
  buildWebsiteDocumentReply,
  classifyHirePoolDocument,
  extractResumeDetails,
  resumeJobSearchCriteria
} from '../integrations/hirepool/document-insight.js';

const RESUME = `Priya Sharma
Frontend Developer
priya.sharma@example.com | +91 98765 43210 | Bengaluru
linkedin.com/in/priya

Professional Summary
Frontend developer with 3 years of experience building React apps.

Technical Skills
React, TypeScript, Redux, HTML, CSS, Git

Work Experience
Frontend Developer, Acme Labs (2022 - Present)
- Built dashboards in React and TypeScript

Education
B.Tech in Computer Science, VTU, 2021

Projects
Portfolio site, Expense tracker`;

const JOB_DESCRIPTION = `Job Title: Senior Backend Engineer
About the role
We are looking for a backend engineer to join our team in Pune.

Key Responsibilities
- Design and build APIs in Node.js
- Own services in production

Requirements
- 5+ years of experience with Node.js and PostgreSQL
- Must have: AWS, Docker

Benefits
Health insurance, flexible hours. Employment type: Full-time. How to apply: send your CV.`;

const BENCH_LIST = `Bench list - Apex Staffing (available consultants)
S.No | Name | Skills | Experience | Notice period | Email
1 | Ravi Kumar | Java, Spring | 5 years | Immediate joiner | ravi@apex.test
2 | Anu Das | React | 3 years | 15 days | anu@apex.test
3 | Kiran Rao | Python | 4 years | 30 days | kiran@apex.test
4 | Meena S | QA, Selenium | 6 years | Immediate joiner | meena@apex.test
Placement rate card and billing rate available on request.`;

const UNRELATED = `Grandma's chocolate cake recipe.
Preheat the oven to 180 degrees. Mix flour, sugar, cocoa and baking powder in a bowl.
Add eggs, milk and melted butter, then whisk until smooth. Bake for 35 minutes and let it cool
before adding the frosting. Serves eight people and keeps for three days in the fridge.`;

test('documents are recognised as resume, job description, candidate list, or unrelated', () => {
  assert.equal(classifyHirePoolDocument(RESUME).kind, DOCUMENT_KINDS.RESUME);
  assert.equal(classifyHirePoolDocument(JOB_DESCRIPTION).kind, DOCUMENT_KINDS.JOB_DESCRIPTION);
  assert.equal(classifyHirePoolDocument(BENCH_LIST).kind, DOCUMENT_KINDS.CANDIDATE_LIST);
  assert.equal(classifyHirePoolDocument(UNRELATED).kind, DOCUMENT_KINDS.UNRELATED);
  assert.equal(classifyHirePoolDocument('   ').kind, DOCUMENT_KINDS.UNREADABLE);
});

test('resume facts drive the job search', () => {
  const details = extractResumeDetails(RESUME);
  assert.equal(details.name, 'Priya Sharma');
  assert.equal(details.title, 'Frontend Developer');
  assert.ok(details.skills.includes('React') && details.skills.includes('TypeScript'));
  assert.equal(details.location, 'Bengaluru');
  assert.equal(details.years, 3);
  assert.deepEqual(resumeJobSearchCriteria(details), { query: 'Frontend Developer', location: 'Bengaluru' });
});

test('replies offer the matching account type, or ask for a relevant file', () => {
  const jd = buildWebsiteDocumentReply({ kind: DOCUMENT_KINDS.JOB_DESCRIPTION, filename: 'jd.pdf', text: JOB_DESCRIPTION });
  assert.match(jd.text, /job description.*Senior Backend Engineer/);
  assert.match(jd.text, /Shall I create your company account now\?/);
  assert.equal(jd.signupRole, 'client');

  const bench = buildWebsiteDocumentReply({ kind: DOCUMENT_KINDS.CANDIDATE_LIST, filename: 'bench.pdf', text: BENCH_LIST });
  assert.match(bench.text, /candidate list.*4\*\* candidates/);
  assert.equal(bench.signupRole, 'consultancy');

  const other = buildWebsiteDocumentReply({ kind: DOCUMENT_KINDS.UNRELATED, filename: 'cake.pdf', text: UNRELATED });
  assert.match(other.text, /doesn't look related to hiring/);
  assert.match(other.text, /resume.*job description.*candidate list/s);
  assert.equal(other.signupRole, null);

  const resume = buildWebsiteDocumentReply({ kind: DOCUMENT_KINDS.RESUME, filename: 'cv.pdf', text: RESUME, jobSearchFailed: true });
  assert.match(resume.text, /\*\*Priya Sharma\*\*'s resume/);
  assert.match(resume.text, /couldn't check HirePool's openings/);
  assert.equal(resume.signupRole, 'candidate');
  assert.deepEqual(resume.quickReplies, ['Sign me up', 'Not now']);

  // File names never break the formatting.
  const sneaky = buildWebsiteDocumentReply({ kind: DOCUMENT_KINDS.UNRELATED, filename: '**[x](javascript:1)**.pdf', text: UNRELATED });
  assert.doesNotMatch(sneaky.text, /\[x\]\(javascript/);
});

function upload(app, { origin, text, filename }) {
  return request(app)
    .post('/api/documents/upload')
    .set('Origin', origin)
    .set('X-Document-Processing-Consent', 'accepted')
    .set('X-Document-Consent-Version', DOCUMENT_PROCESSING_CONSENT_VERSION)
    .attach('file', Buffer.from(text, 'utf-8'), filename)
    .field('assistantId', 'hirepool')
    .field('consentAccepted', 'true')
    .field('consentVersion', DOCUMENT_PROCESSING_CONSENT_VERSION);
}

test('website upload: a resume gets matching HirePool jobs and a signup offer that "yes" accepts', async () => {
  process.env.NODE_ENV = 'development';
  process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000,http://localhost:5173';
  _clearPublicJobCache();
  const originalFetch = globalThis.fetch;
  const searched = [];
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    if (target.includes('/api/v1/public/jobs')) {
      searched.push(new URL(target).searchParams.get('q'));
      return new Response(JSON.stringify({
        items: [{ title: 'Frontend Developer (React)', company: 'Acme', locations: ['Bengaluru'], remote_type: 'hybrid', skills: ['React'] }],
        total: 1
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return originalFetch(url, init);
  };
  try {
    const app = createApp();
    const res = await upload(app, { origin: 'http://localhost:3000', text: RESUME, filename: 'priya-cv.txt' }).expect(200);
    assert.equal(res.body.insight.kind, 'resume');
    assert.deepEqual(searched, ['Frontend Developer']);
    assert.match(res.body.insight.text, /Frontend Developer \(React\)/);
    assert.match(res.body.insight.text, /Shall I create one for you now\?/);

    const yes = await request(app).post('/api/chat').set('Origin', 'http://localhost:3000')
      .send({ assistantId: 'hirepool', message: 'Sign me up', conversationId: res.body.conversationId })
      .expect(200);
    assert.equal(yes.body.action?.action, 'hirepool_signup');
    assert.equal(yes.body.action?.parameters?.role, 'candidate');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('website upload: unrelated files get a request for a relevant document; dashboards are unchanged', async () => {
  process.env.NODE_ENV = 'development';
  process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000,http://localhost:5173';
  const app = createApp();
  const cake = await upload(app, { origin: 'http://localhost:3000', text: UNRELATED, filename: 'cake.txt' }).expect(200);
  assert.equal(cake.body.insight.kind, 'unrelated');
  assert.match(cake.body.insight.text, /Please upload one of these/);

  const jd = await upload(app, { origin: 'http://localhost:3000', text: JOB_DESCRIPTION, filename: 'jd.txt' }).expect(200);
  assert.equal(jd.body.insight.signupRole, 'client');
});

test('dashboard: each role gets the right next steps for an upload', async () => {
  const { buildDashboardDocumentInsight, extractResumeCandidate, composeCandidateAddMessage } = await import('../integrations/hirepool/document-insight.js');
  const { extractJobFields } = await import('../integrations/hirepool/job-create.js');
  const { extractCandidateFields } = await import('../integrations/hirepool/agency-candidate-add.js');

  // Candidate + resume: fill profile / find jobs / save resume, with prefill values.
  const cand = buildDashboardDocumentInsight({ role: 'candidate', filename: 'cv.pdf', text: RESUME });
  assert.deepEqual(cand.options.map(o => o.id), ['fill_profile', 'find_jobs', 'save_resume']);
  assert.equal(cand.data.prefill.job_title, 'Frontend Developer');
  assert.equal(cand.data.prefill.current_location, 'Bengaluru');
  assert.equal(cand.data.prefill.years_of_experience, 3);
  assert.deepEqual(cand.data.jobSearch, { query: 'Frontend Developer', location: 'Bengaluru' });
  const candWrong = buildDashboardDocumentInsight({ role: 'candidate', filename: 'jd.pdf', text: JOB_DESCRIPTION });
  assert.match(candWrong.text, /doesn't look like a resume/);
  assert.equal(candWrong.options.length, 0);

  // Company + job description: create job, with text the job flow understands.
  const client = buildDashboardDocumentInsight({ role: 'client', filename: 'jd.pdf', text: JOB_DESCRIPTION });
  assert.deepEqual(client.options.map(o => o.id), ['create_job', 'edit_job']);
  assert.match(client.text, /Senior Backend Engineer/);
  const fields = extractJobFields(client.data.message);
  assert.equal(fields.title, 'Senior Backend Engineer');
  assert.deepEqual(fields.locations, ['Pune']);
  assert.ok(fields.required_skills.includes('Node.js') && fields.required_skills.includes('PostgreSQL'));
  assert.equal(fields.experience_level, 'senior');
  assert.ok(fields.description && fields.description.length >= 20);
  const clientResume = buildDashboardDocumentInsight({ role: 'client', filename: 'cv.pdf', text: RESUME });
  assert.match(clientResume.text, /candidate's resume/);

  // Agency + resume: a bench candidate (and the review message for the add flow).
  const agency = buildDashboardDocumentInsight({ role: 'consultancy', filename: 'cv.pdf', text: RESUME });
  assert.equal(agency.data.candidate.first_name, 'Priya');
  assert.equal(agency.data.candidate.last_name, 'Sharma');
  assert.equal(agency.data.candidate.email, 'priya.sharma@example.com');
  assert.equal(agency.data.candidate.phone, '9876543210');
  assert.deepEqual(agency.data.missing, []);
  const reviewed = extractCandidateFields(agency.data.addMessage);
  assert.equal(reviewed.first_name, 'Priya');
  assert.equal(reviewed.email, 'priya.sharma@example.com');
  assert.equal(reviewed.current_location, 'Bengaluru');
  const noEmail = extractResumeCandidate(RESUME.replace('priya.sharma@example.com | ', ''));
  assert.ok(noEmail.missing.includes('email'));
  assert.match(composeCandidateAddMessage(agency.data.candidate), /^Add candidate\nName: Priya Sharma/);
});

test('dashboard routes: uploads get role insights; bench routes need an agency login', async () => {
  process.env.NODE_ENV = 'development';
  delete process.env.VERCEL_ENV;
  process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000,http://localhost:5173';
  process.env.ENABLE_HIREPOOL_LOCAL_BRIDGE = 'true';
  process.env.DYNAMIC_API_DISCOVERY_ENABLED = 'true';
  process.env.API_DISCOVERY_ALLOWED_HOSTS = 'localhost';
  process.env.HIREPOOL_LOCAL_API_BASE_URL = 'http://localhost:8000/';
  process.env.HIREPOOL_LOCAL_OPENAPI_URL = 'http://localhost:8000/api/openapi.json';
  const { storeHirePoolSession } = await import('../backend/src/local-integrations/hirepool-session-store.js');
  const app = createApp();
  const client = storeHirePoolSession('client-doc-token', { id: 'client-doc-1', email: 'hr@acme.test', userType: 'client', organizationRole: 'admin' });
  const res = await upload(app, { origin: 'http://localhost:5173', text: JOB_DESCRIPTION, filename: 'jd.txt' })
    .set('Authorization', `Bearer ${client.credential}`)
    .expect(200);
  assert.equal(res.body.insight.kind, 'job_description');
  assert.deepEqual(res.body.insight.options.map(o => o.id), ['create_job', 'edit_job']);

  // Dashboards may reach the bench routes (CORS), and each route checks the login and role.
  const preflight = await request(app).options('/api/hirepool/assistant/bench-candidates')
    .set('Origin', 'http://localhost:5173')
    .set('Access-Control-Request-Method', 'POST')
    .set('Access-Control-Request-Headers', 'authorization,content-type');
  assert.ok(preflight.status < 300);
  const anon = await request(app).post('/api/hirepool/assistant/bench-candidates').set('Origin', 'http://localhost:5173').send({ candidate: {} });
  assert.equal(anon.status, 401);
  const asClient = await request(app).post('/api/hirepool/assistant/bench-submit')
    .set('Origin', 'http://localhost:5173')
    .set('Authorization', `Bearer ${client.credential}`)
    .send({ jobId: 'j1', candidateIds: ['c1'] });
  assert.equal(asClient.status, 403);
  assert.equal(asClient.body.error.code, 'ROLE_NOT_ALLOWED');
});
