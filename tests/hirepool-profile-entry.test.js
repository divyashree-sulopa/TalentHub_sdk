/**
 * Dashboard bot polish:
 * - education / work experience are added in a small form, pre-filled from what was typed;
 * - review cards and replies use plain words and readable dates;
 * - job lists show "Full-time" / "On-site", never slanted text or one job inside another.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEntryForm,
  buildEntryUpdate,
  prefillFromText,
  summarizeEntry
} from '../integrations/hirepool/profile-entry.js';
import { formatCandidateProfileReview } from '../integrations/hirepool/candidate-profile-edit.js';
import { formatDateSpan, formatMonthYear } from '../integrations/hirepool/profile-edit-shared.js';
import { formatJobsList, humanizeHirePoolValue } from '../backend/src/routes/chat.js';
import { parseMarkdown } from '../widget/src/markdown.js';

test('typed education fills the form, including the college before the degree', () => {
  assert.deepEqual(
    prefillFromText('education', 'PESITM B.E. Artificial Intelligence and Machine Learning December 2022 to June 2026 9CGPA'),
    { institution: 'PESITM', degree: 'B.E', field_of_study: 'Artificial Intelligence and Machine Learning', start_date: '2022-12', end_date: '2026-06', grade: '9CGPA' }
  );
  assert.deepEqual(
    prefillFromText('education', 'PES Institute of Technology and Management Degree: B.E Start date: 2022-12 End date: 2026-06 Grade: 9CGPA'),
    { institution: 'PES Institute of Technology and Management', degree: 'B.E', start_date: '2022-12', end_date: '2026-06', grade: '9CGPA' }
  );
  assert.equal(prefillFromText('education', 'B.E. in AI & ML at PES University, December 2022 to June 2026').institution, 'PES University');
  assert.deepEqual(prefillFromText('education', 'Update my education'), {}, 'a bare command fills nothing');
  assert.deepEqual(
    prefillFromText('work_experience', 'Company: Infosys Job title: SDE Start date: Jan 2022 End date: present'),
    { company: 'Infosys', title: 'SDE', start_date: '2022-01', is_current: true }
  );
});

test('the form lists saved entries with readable dates', () => {
  const profile = {
    education: [{ institution: 'PES University', degree: 'B.E', start_date: '2022-12-01', end_date: '2026-06' }],
    profile_completion_percentage: 85
  };
  const form = buildEntryForm('education', profile, { text: '' });
  assert.equal(form.entries[0].summary, 'B.E — PES University (Dec 2022 – Jun 2026)');
  assert.equal(form.entries[0].values.start_date, '2022-12', 'month box value');
  assert.equal(form.completion, 85);
  assert.equal(buildEntryForm('skills', profile), null);
});

test('saving adds, edits in place, checks required fields and dates', () => {
  const profile = { education: [{ institution: 'Old College', degree: 'Diploma' }] };
  const missing = buildEntryUpdate('education', profile, { entry: { degree: 'B.E' } });
  assert.equal(missing.ok, false);
  assert.match(missing.errors.institution, /required/);

  const badDate = buildEntryUpdate('education', profile, { entry: { institution: 'PES', degree: 'B.E', start_date: 'sometime' } });
  assert.equal(badDate.ok, false);
  assert.match(badDate.errors.start_date, /month and year/);

  const order = buildEntryUpdate('education', profile, { entry: { institution: 'PES', degree: 'B.E', start_date: '2026-06', end_date: '2022-12' } });
  assert.equal(order.ok, false);
  assert.ok(order.errors.end_date, JSON.stringify(order.errors));

  const added = buildEntryUpdate('education', profile, { entry: { institution: 'PES', degree: 'B.E', start_date: '2022-12', end_date: '2026-06' } });
  assert.equal(added.ok, true, JSON.stringify(added.errors));
  assert.equal(added.isNew, true);
  assert.equal(added.body.education.length, 2, 'the saved entry is kept');
  assert.equal(added.summary, 'B.E — PES (Dec 2022 – Jun 2026)');

  const edited = buildEntryUpdate('education', profile, { index: 0, entry: { institution: 'New College', degree: 'Diploma' } });
  assert.equal(edited.ok, true);
  assert.equal(edited.isNew, false);
  assert.equal(edited.body.education.length, 1);
  assert.equal(edited.body.education[0].institution, 'New College');

  const job = buildEntryUpdate('work_experience', {}, { entry: { company: 'Infosys', title: 'SDE', start_date: '2024-01', end_date: '2025-02', is_current: true } });
  assert.equal(job.ok, true);
  assert.equal(job.body.work_experience[0].end_date, null, 'a current job has no end date');
  assert.equal(job.summary, 'SDE at Infosys (Jan 2024 – Present)');
  assert.equal(buildEntryUpdate('work_experience', {}, { entry: { company: 'X', title: 'Y', is_current: 'false' } }).body.work_experience[0].is_current, false);
});

test('review cards use plain labels, readable dates, and do not repeat the details', () => {
  const { reviewMessage, formattedReview } = formatCandidateProfileReview(
    { education: [{ institution: 'PES', degree: 'B.E', start_date: '2022-12', end_date: '2026-06', grade: '9 CGPA' }] },
    { education: [] }
  );
  assert.equal(formattedReview.fields[0].label, 'Education');
  assert.equal(formattedReview.fields[0].value, 'B.E — PES (Dec 2022 – Jun 2026), 9 CGPA');
  assert.doesNotMatch(reviewMessage, /total|existing|Confirm & Execute|PES/);
  assert.match(reviewMessage, /\*\*Save\*\*/);
  assert.equal(summarizeEntry('work_experience', { company: 'A', title: 'B' }), 'B at A');
  assert.equal(formatMonthYear('2022-12'), 'Dec 2022');
  assert.equal(formatDateSpan('2022-12', null, { current: true }), 'Dec 2022 – Present');
});

test('job lists use plain words and keep each job separate', () => {
  assert.equal(humanizeHirePoolValue('full_time'), 'Full-time');
  assert.equal(humanizeHirePoolValue('onsite'), 'On-site');
  assert.equal(humanizeHirePoolValue('active'), 'Active');
  assert.equal(humanizeHirePoolValue('some_new_value'), 'Some new value');
  const text = formatJobsList([
    { title: 'Customer Relationship Executive', company_name: 'ZSapiens', remote_type: 'onsite', job_type: 'full_time', status: 'active', salary_min: 250000, salary_max: 300000 },
    { title: 'Customer Relationship Analyst', remote_type: 'onsite', job_type: 'full_time', status: 'active' }
  ]);
  assert.match(text, /\*\*Type:\*\* Full-time/);
  assert.match(text, /\*\*Work type:\*\* On-site/);
  assert.doesNotMatch(text, /full_time|onsite/);

  const html = parseMarkdown(text);
  assert.doesNotMatch(html, /<em>/, 'nothing turns slanted');
  assert.equal((html.match(/<ul>/g) || []).length, 2, 'each job has its own list');
  assert.match(html, /<\/ul><h4>2\. Customer Relationship Analyst<\/h4>/, 'job 2 is not inside job 1');
});

test('markdown: underscores inside words stay as they are; real emphasis still works', () => {
  assert.equal(parseMarkdown('Type: full_time and job_id'), '<p>Type: full_time and job_id</p>');
  assert.equal(parseMarkdown('Say *hello* or _hi_ to **me**'), '<p>Say <em>hello</em> or <em>hi</em> to <strong>me</strong></p>');
  assert.equal(parseMarkdown('Intro\n- a\n- b\nAfter'), '<p>Intro</p><ul><li>a</li><li>b</li></ul><p>After</p>');
});

test('company bot: "View applications" is a button, not a bare address', async () => {
  const { formatClientApplicationsList, formatClientDashboardStats } = await import('../backend/src/routes/chat.js');
  const none = formatClientApplicationsList([]);
  assert.doesNotMatch(none, /directly at/);
  assert.match(none, /\n\n\[View applications\]\(http:\/\/localhost:5173\/client\/applications\)$/);
  const html = parseMarkdown(none);
  assert.match(html, /<a class="ai-link-btn" href="http:\/\/localhost:5173\/client\/applications"[^>]*>View applications<\/a>/);
  assert.match(formatClientDashboardStats({ total_jobs: 1 }), /\n\n\[Review applications\]\(/);
  // A link inside a sentence stays an ordinary link.
  assert.doesNotMatch(parseMarkdown('Please [log in](https://app.hirepool.ai/login) again.'), /ai-link-btn/);
});
