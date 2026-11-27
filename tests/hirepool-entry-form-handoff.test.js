/**
 * Dashboard chat: adding work experience / education never gets stuck.
 * - Widgets that can show the short form get it (pre-filled with what was understood).
 * - Older widgets get a clear question that asks only for what is missing.
 * - More ways of writing "company" and "job title" are understood.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  handleHirePoolProfileEditTurn,
  parseWorkExperienceFromMessage
} from '../integrations/hirepool/candidate-profile-edit.js';

const authUser = { id: 'cand-1', role: 'candidate', assistantId: 'hirepool' };
const profile = { first_name: 'Divya', last_name: 'S', education: [], work_experience: [], skills: ['Python'] };

function turnRunner({ canOpenEntryForm }) {
  const session = { id: 's1' };
  const staged = [];
  const run = message => handleHirePoolProfileEditTurn({
    message,
    session,
    authUser,
    readProfile: async () => profile,
    readCurrentProfile: async () => profile,
    stageProfileUpdate: async body => {
      staged.push(body);
      return { id: `act-${staged.length}`, action: 'update_my_profile', title: 'Review', requiresConfirmation: true, confirmationToken: 'x'.repeat(43) };
    },
    cancelConfirmation: async () => {},
    canOpenEntryForm
  });
  return { run, session, staged };
}

test('a widget that can show the form gets it instead of a typed-in questionnaire', async () => {
  const { run, session } = turnRunner({ canOpenEntryForm: true });
  const first = await run('Update my work experience');
  assert.equal(first.handled, true);
  assert.equal(first.ui?.openEntryForm?.section, 'work_experience', JSON.stringify(first));
  assert.match(first.text, /short form/);
  assert.equal(session.hirePoolProfileEdit?.active, false, 'the chat workflow ends; the form takes over');
  const next = await run('show my applications');
  assert.notEqual(next?.ui?.openEntryForm?.section, 'work_experience', 'later messages are not swallowed');
});

test('details typed mid-way are handed to the form, pre-filled', async () => {
  const { run } = turnRunner({ canOpenEntryForm: true });
  const result = await run('add work experience resoluteai - company from Jan 2025 to present');
  assert.equal(result.ui?.openEntryForm?.section, 'work_experience', JSON.stringify(result));
  assert.equal(result.ui.openEntryForm.prefill.company, 'resoluteai');
  assert.equal(result.ui.openEntryForm.prefill.is_current, true);
  assert.match(result.text, /filled in what I understood/);
});

test('older widgets: one clear question at a time, never the same message again', async () => {
  const { run, staged } = turnRunner({ canOpenEntryForm: false });
  const first = await run('Update my work experience');
  assert.equal(first.ui, undefined);
  const unclear = await run('resoluteai ai AI Engineer Intern');
  assert.match(unclear.text, /couldn't tell which part is the company/);
  assert.match(unclear.text, /at ResoluteAI/);
  const companyOnly = await run('company: resoluteai');
  assert.match(companyOnly.text, /What was your job title at \*\*resoluteai\*\*/, companyOnly.text);
  const done = await run('AI Engineer Intern');
  assert.ok(done.hostAction || staged.length, `staged for review: ${JSON.stringify(done).slice(0, 200)}`);
});

test('more ways of writing company and job title are understood', () => {
  const read = text => {
    const { draft } = parseWorkExperienceFromMessage(text);
    return [draft.company, draft.title];
  };
  assert.deepEqual(read('resoluteai ai - company ai engineer intern - role'), ['resoluteai ai', 'ai engineer intern']);
  assert.deepEqual(read('resoluteai ai - company, AI Engineer Intern - role'), ['resoluteai ai', 'AI Engineer Intern']);
  assert.deepEqual(read('company resoluteai role AI Engineer Intern'), ['resoluteai', 'AI Engineer Intern']);
  assert.deepEqual(read('role AI Engineer Intern company resoluteai'), ['resoluteai', 'AI Engineer Intern']);
  assert.deepEqual(read('AI Engineer Intern, resoluteai'), ['resoluteai', 'AI Engineer Intern']);
  assert.deepEqual(read('resoluteai, AI Engineer Intern'), ['resoluteai', 'AI Engineer Intern']);
  assert.deepEqual(read('AI Engineer Intern at resoluteai'), ['resoluteai', 'AI Engineer Intern']);
  // Genuinely unclear: nothing is guessed (the form or a question takes over).
  assert.deepEqual(read('resoluteai ai AI Engineer Intern'), [null, null]);
  assert.deepEqual(read('Infosys, Bengaluru'), [null, null]);
});
