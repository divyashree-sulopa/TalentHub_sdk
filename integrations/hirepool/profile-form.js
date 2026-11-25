/**
 * In-app bot: the profile form shown in the dashboard assistant.
 *
 * - `buildProfileForm` lists the editable fields for the signed-in role with
 *   their current values ("missing" mode keeps only the empty ones).
 * - `buildProfileFormUpdates` turns submitted values into validated update
 *   bodies for HirePool, sending only fields that actually changed.
 *
 * Pure functions; the route does the HirePool reads and writes.
 */

import {
  CLIENT_INDUSTRIES,
  CONSULTANCY_SPECIALIZATIONS,
  COMPANY_SIZES
} from '../../backend/src/local-integrations/hirepool-validation.js';
import { validateCandidateProfileUpdatePayload } from './candidate-profile-edit.js';
import {
  validateClientProfileUpdatePayload,
  validateConsultancyProfileUpdatePayload,
  validateOrgUserProfileUpdatePayload
} from './profile-edit-shared.js';

const JOB_TYPE_OPTIONS = Object.freeze([
  { value: 'full_time', label: 'Full-time' },
  { value: 'contract', label: 'Contract' }
]);

const asOptions = values => values.map(value => ({ value, label: value }));

const ORG_USER_FIELDS = [
  { key: 'full_name', label: 'Full name', type: 'text', target: 'user', placeholder: 'Priya Sharma' },
  { key: 'designation', label: 'Designation', type: 'text', target: 'user', placeholder: 'Talent Acquisition Lead' },
  { key: 'phone', label: 'Phone', type: 'tel', target: 'user', placeholder: '9876543210' }
];

export const PROFILE_FORM_FIELDS = Object.freeze({
  candidate: Object.freeze([
    { key: 'first_name', label: 'First name', type: 'text', target: 'profile', placeholder: 'Priya' },
    { key: 'last_name', label: 'Last name', type: 'text', target: 'profile', placeholder: 'Sharma' },
    { key: 'phone', label: 'Phone', type: 'tel', target: 'profile', placeholder: '9876543210' },
    { key: 'current_location', label: 'Current location', type: 'text', target: 'profile', placeholder: 'Bengaluru' },
    { key: 'job_title', label: 'Current job title', type: 'text', target: 'profile', placeholder: 'Frontend Developer' },
    { key: 'years_of_experience', label: 'Years of experience', type: 'number', target: 'profile', min: 0, max: 50, placeholder: '3' },
    { key: 'professional_summary', label: 'Professional summary', type: 'textarea', target: 'profile', placeholder: 'Two or three lines about your experience and strengths' },
    { key: 'skills', label: 'Skills', type: 'tags', target: 'profile', placeholder: 'React, TypeScript, Node.js', hint: 'Separate skills with commas' },
    { key: 'preferred_job_types', label: 'Preferred job types', type: 'multiselect', target: 'profile', options: JOB_TYPE_OPTIONS },
    { key: 'expected_salary_min', label: 'Expected salary (min, per year)', type: 'number', target: 'profile', min: 0, placeholder: '800000' },
    { key: 'expected_salary_max', label: 'Expected salary (max, per year)', type: 'number', target: 'profile', min: 0, placeholder: '1200000', optional: true }
  ]),
  client: Object.freeze([
    ...ORG_USER_FIELDS,
    { key: 'industry', label: 'Company industry', type: 'select', target: 'profile', options: asOptions(CLIENT_INDUSTRIES) },
    { key: 'company_size', label: 'Company size', type: 'select', target: 'profile', options: asOptions(COMPANY_SIZES) },
    { key: 'headquarters_location', label: 'Headquarters', type: 'text', target: 'profile', placeholder: 'Bengaluru' },
    { key: 'company_website', label: 'Company website', type: 'url', target: 'profile', placeholder: 'https://example.com' },
    { key: 'about_company', label: 'About the company', type: 'textarea', target: 'profile', placeholder: 'What your company does, in a few lines' }
  ]),
  consultancy: Object.freeze([
    ...ORG_USER_FIELDS,
    { key: 'industry_specialization', label: 'Industries you specialise in', type: 'multiselect', target: 'profile', options: asOptions(CONSULTANCY_SPECIALIZATIONS) },
    { key: 'company_size', label: 'Agency size', type: 'select', target: 'profile', options: asOptions(COMPANY_SIZES) },
    { key: 'headquarters_location', label: 'Headquarters', type: 'text', target: 'profile', placeholder: 'Bengaluru' },
    { key: 'website', label: 'Agency website', type: 'url', target: 'profile', placeholder: 'https://example.com' },
    { key: 'about_company', label: 'About the agency', type: 'textarea', target: 'profile', placeholder: 'The roles and industries you place candidates in' }
  ])
});

/** Candidate sections that need several entries; the form links to the chat for them. */
const CANDIDATE_CHAT_SECTIONS = Object.freeze([
  { key: 'education', label: 'Education', prompt: 'Update my education' },
  { key: 'work_experience', label: 'Work experience', prompt: 'Update my work experience' }
]);

function isFilled(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'object') return Object.values(value).some(isFilled);
  return true;
}

function listValue(value) {
  if (!Array.isArray(value)) {
    return typeof value === 'string' && value.trim() ? value.split(/[,;\n]+/).map(v => v.trim()).filter(Boolean) : [];
  }
  return value
    .map(item => (typeof item === 'string' ? item : (item?.name || item?.skill || item?.value || '')))
    .map(item => String(item).trim())
    .filter(Boolean);
}

function currentValue(field, sources) {
  const raw = sources[field.target]?.[field.key];
  if (field.type === 'tags' || field.type === 'multiselect') return listValue(raw);
  if (field.type === 'number') return Number.isFinite(Number(raw)) && raw !== null && raw !== '' ? Number(raw) : null;
  return typeof raw === 'string' ? raw : (raw === null || raw === undefined ? '' : String(raw));
}

/**
 * @param {'candidate'|'client'|'consultancy'} role
 * @param {{ profile?: object|null, userProfile?: object|null }} data
 * @param {{ mode?: 'missing'|'all' }} options
 */
export function buildProfileForm(role, { profile = null, userProfile = null } = {}, { mode = 'all' } = {}) {
  const specs = PROFILE_FORM_FIELDS[role];
  if (!specs) return null;
  const sources = { profile: profile || {}, user: userProfile || {} };
  const fields = specs
    // Without the personal profile we cannot show or save its fields.
    .filter(field => field.target !== 'user' || userProfile)
    .map(field => {
      const value = currentValue(field, sources);
      const { target, ...publicField } = field;
      return { ...publicField, value, missing: !field.optional && !isFilled(value) };
    });
  const shown = mode === 'missing' ? fields.filter(field => field.missing) : fields;
  const chatSections = role === 'candidate'
    ? CANDIDATE_CHAT_SECTIONS
      .filter(section => mode !== 'missing' || !isFilled(sources.profile[section.key]))
      .map(section => ({ ...section, missing: !isFilled(sources.profile[section.key]) }))
    : [];
  const missingCount = fields.filter(field => field.missing).length + chatSections.filter(s => s.missing).length;
  return {
    role,
    mode,
    title: mode === 'missing' ? 'Complete your profile' : 'Edit your profile',
    subtitle: mode === 'missing'
      ? 'Fill in what you can and press Save. You can skip any field.'
      : 'Change any details and press Save.',
    fields: shown,
    chatSections,
    missingCount,
    completion: Number.isFinite(profile?.profile_completion_percentage)
      ? Math.max(0, Math.min(100, Math.round(profile.profile_completion_percentage)))
      : null
  };
}

function sameList(a, b) {
  const norm = list => list.map(v => v.toLowerCase()).sort().join('\u0000');
  return norm(a) === norm(b);
}

const VALIDATORS = Object.freeze({
  candidate: { profile: (body, current) => validateCandidateProfileUpdatePayload(body, current) },
  client: {
    profile: (body, current) => validateClientProfileUpdatePayload(body, current),
    user: body => validateOrgUserProfileUpdatePayload(body)
  },
  consultancy: {
    profile: (body, current) => validateConsultancyProfileUpdatePayload(body, current),
    user: body => validateOrgUserProfileUpdatePayload(body)
  }
});

/**
 * Build the HirePool update bodies from submitted form values.
 * Empty inputs never clear existing data, and unchanged fields are left out.
 * @returns {{ ok: boolean, errors: Record<string,string>, bodies: { profile?: object, user?: object }, changed: string[] }}
 */
export function buildProfileFormUpdates(role, values, { profile = null, userProfile = null } = {}) {
  const specs = PROFILE_FORM_FIELDS[role];
  if (!specs || !values || typeof values !== 'object' || Array.isArray(values)) {
    return { ok: false, errors: { form: 'Nothing to save.' }, bodies: {}, changed: [] };
  }
  const sources = { profile: profile || {}, user: userProfile || {} };
  const raw = { profile: {}, user: {} };
  const changed = [];
  for (const field of specs) {
    if (!Object.hasOwn(values, field.key)) continue;
    if (field.target === 'user' && !userProfile) continue;
    const current = currentValue(field, sources);
    const input = values[field.key];
    let next;
    if (field.type === 'tags' || field.type === 'multiselect') {
      next = listValue(Array.isArray(input) ? input : String(input ?? ''));
      if (field.type === 'multiselect') {
        const allowed = new Set(field.options.map(o => o.value));
        next = next.filter(v => allowed.has(v));
      }
      if (!next.length || sameList(next, current)) continue;
    } else if (field.type === 'number') {
      const text = String(input ?? '').trim();
      if (!text) continue;
      next = Number(text.replace(/,/g, ''));
      if (!Number.isFinite(next)) {
        raw[field.target][field.key] = text; // let the validator explain
        changed.push(field.key);
        continue;
      }
      if (current === next) continue;
    } else {
      next = String(input ?? '').trim();
      if (!next || next === String(current).trim()) continue;
    }
    raw[field.target][field.key] = next;
    changed.push(field.key);
  }

  const errors = {};
  const bodies = {};
  for (const target of ['profile', 'user']) {
    if (!Object.keys(raw[target]).length) continue;
    const validate = VALIDATORS[role]?.[target];
    if (!validate) continue;
    const result = validate(raw[target], sources[target]);
    if (!result.isValid) {
      for (const [key, message] of Object.entries(result.errors || {})) {
        errors[Object.hasOwn(raw[target], key) ? key : 'form'] = message;
      }
    } else {
      bodies[target] = result.sanitizedBody;
    }
  }
  return { ok: Object.keys(errors).length === 0, errors, bodies, changed };
}

/** Friendly labels for a short "Saved: …" line. */
export function describeChangedFields(role, keys) {
  const specs = PROFILE_FORM_FIELDS[role] || [];
  return keys
    .map(key => specs.find(field => field.key === key)?.label || key)
    .filter(Boolean);
}
