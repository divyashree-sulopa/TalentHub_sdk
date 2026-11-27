/**
 * Company bot "Post a job": a message with labels on one line is read field by field.
 * Before this fix: location was lost, "₹3.5–5 LPA" became "₹3", "and Git" was a skill,
 * and the example description text was published.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractJobFields, handleHirePoolJobCreateTurn, isPlaceholderJobDescription } from '../integrations/hirepool/job-create.js';
import { normalizeSalary, validateJobCreation } from '../backend/src/dynamic-api/schemas/hirepool-schemas.js';

const MESSAGE = 'Job Title: MERN Stack Developer Job Description: Describe the role, responsibilities, and qualifications. Work Type: On-site Employment Type: Permanent Location: Bengaluru, Karnataka Experience Level: Entry Level (0–1 Years) Salary Range: ₹3.5–5 LPA Required Skills: JavaScript, React.js, Node.js, Express.js, MongoDB, HTML, CSS, REST APIs, and Git.';

test('labels on one line are each read whole', () => {
  const data = extractJobFields(MESSAGE, {});
  assert.equal(data.title, 'MERN Stack Developer');
  assert.deepEqual(data.locations, ['Bengaluru, Karnataka']);
  assert.equal(data.remote_type, 'onsite');
  assert.equal(data.employment_type, 'permanent');
  assert.equal(data.experience_level, 'entry');
  assert.deepEqual([data.experience_min, data.experience_max], [0, 1]);
  assert.equal(data.salary, '₹3.5–5 LPA');
  assert.deepEqual(data.required_skills, ['JavaScript', 'React.js', 'Node.js', 'Express.js', 'MongoDB', 'HTML', 'CSS', 'REST APIs', 'Git']);
  assert.equal(data.description, undefined, 'the example text is not used as the description');
  assert.equal(data.description_placeholder, true);
});

test('salary ranges with ₹, decimals and dashes', () => {
  assert.deepEqual(normalizeSalary('₹3.5–5 LPA'), { salary_min: 350000, salary_max: 500000, salary_currency: 'INR', pay_period: 'year' });
  assert.deepEqual(normalizeSalary('3.5 LPA - 5 LPA'), { salary_min: 350000, salary_max: 500000, salary_currency: 'INR', pay_period: 'year' });
  assert.deepEqual(normalizeSalary('₹40,000 - ₹60,000 per month'), { salary_min: 40000, salary_max: 60000, salary_currency: 'INR', pay_period: 'month' });
  assert.equal(normalizeSalary('competitive'), null);
});

test('skill lists: "and" before the last item is dropped; real skill names stay whole', () => {
  assert.deepEqual(extractJobFields('Title: X Skills: CI/CD, Sales and Marketing, and Docker', {}).required_skills, ['CI/CD', 'Sales and Marketing', 'Docker']);
  assert.deepEqual(extractJobFields('Title: X Skills: React and Redux', {}).required_skills, ['React', 'Redux']);
});

test('example description text is recognised', () => {
  assert.equal(isPlaceholderJobDescription('Describe the role, responsibilities, and qualifications.'), true);
  assert.equal(isPlaceholderJobDescription('TBD'), true);
  assert.equal(isPlaceholderJobDescription('Build MERN web apps and REST APIs with the product team.'), false);
});

test('the chat asks for a real description instead of publishing the example text', async () => {
  const session = {};
  const staged = [];
  const run = message => handleHirePoolJobCreateTurn({
    message,
    session,
    authUser: { id: 'c1', role: 'client' },
    stageJobConfirmation: async ({ body }) => { staged.push(body); return { hostAction: { id: 'a1', confirmationToken: 't'.repeat(43) } }; },
    cancelConfirmation: () => {}
  });
  const first = await run(`Post a job. ${MESSAGE}`);
  assert.equal(staged.length, 0, 'nothing is staged with the example description');
  assert.match(first.text, /example text/);
  assert.match(first.text, /Bengaluru, Karnataka/);

  const second = await run('Job Description: Build and maintain MERN web apps, write REST APIs and review code with the team.');
  assert.equal(staged.length, 1);
  const body = staged[0];
  assert.deepEqual(body.locations, ['Bengaluru, Karnataka']);
  assert.equal(body.salary_min, 350000);
  assert.equal(body.salary_max, 500000);
  assert.ok(!body.required_skills.includes('and Git'));
  assert.match(body.description, /^Build and maintain MERN web apps/);
  assert.equal(body.description_placeholder, undefined, 'internal flags are never sent to HirePool');
  assert.match(second.text, /₹ 3,50,000|₹ 350,000/);
});
