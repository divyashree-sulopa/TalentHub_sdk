/**
 * In-app bot (candidates): add or edit one education or work-experience entry in a
 * small form instead of typing it in a special format.
 *
 * - `buildEntryForm` lists the section's fields, the entries already saved, and
 *   whatever could be read from the user's own message (to pre-fill the form).
 * - `buildEntryUpdate` merges one submitted entry into the saved list and validates
 *   the whole list the same way the chat flow does, ready for one HirePool update.
 *
 * Pure functions; the route does the HirePool reads and writes.
 */

import {
  parseEducationFromMessage,
  parseWorkExperienceFromMessage,
  validateCandidateProfileUpdatePayload
} from './candidate-profile-edit.js';
import { formatDateSpan, parseHirePoolMonthDate } from './profile-edit-shared.js';

export const ENTRY_SECTIONS = Object.freeze({
  education: Object.freeze({
    key: 'education',
    noun: 'education',
    title: 'Add education',
    editTitle: 'Edit education',
    fields: Object.freeze([
      { key: 'institution', label: 'College / University', type: 'text', required: true, placeholder: 'PES University', maxLength: 255 },
      { key: 'degree', label: 'Degree', type: 'text', required: true, placeholder: 'B.E., B.Tech, MBA', maxLength: 150 },
      { key: 'field_of_study', label: 'Field of study', type: 'text', placeholder: 'Computer Science', maxLength: 150 },
      { key: 'start_date', label: 'Start', type: 'month' },
      { key: 'end_date', label: 'End (or expected)', type: 'month' },
      { key: 'grade', label: 'Grade / CGPA', type: 'text', placeholder: '8.5 CGPA or 82%', maxLength: 50 }
    ])
  }),
  work_experience: Object.freeze({
    key: 'work_experience',
    noun: 'work experience',
    title: 'Add work experience',
    editTitle: 'Edit work experience',
    fields: Object.freeze([
      { key: 'company', label: 'Company', type: 'text', required: true, placeholder: 'Infosys', maxLength: 255 },
      { key: 'title', label: 'Job title', type: 'text', required: true, placeholder: 'Software Engineer', maxLength: 150 },
      { key: 'location', label: 'Location', type: 'text', placeholder: 'Bengaluru', maxLength: 255 },
      { key: 'start_date', label: 'Start', type: 'month' },
      { key: 'end_date', label: 'End', type: 'month' },
      { key: 'is_current', label: 'I currently work here', type: 'checkbox' },
      { key: 'description', label: 'What you did (optional)', type: 'textarea', placeholder: 'A line or two about your work', maxLength: 2000 }
    ])
  })
});

const MAX_ENTRIES = 30;

function text(value, max = 2000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

const isCurrent = value => value === true || value === 'true' || value === 'on';

/** "2022-12" for a month input, from whatever HirePool stored ("2022-12", "2022-12-01"). */
function monthValue(value) {
  if (!value) return '';
  const parsed = parseHirePoolMonthDate(String(value));
  // A month box needs a month too; a bare year is left for the user to complete.
  return parsed.valid && /^\d{4}-\d{2}$/.test(parsed.value || '') ? parsed.value : '';
}

/** One saved or submitted entry, in the exact shape the form uses. */
function toFormValues(section, entry = {}) {
  if (section === 'education') {
    return {
      institution: text(entry.institution, 255),
      degree: text(entry.degree, 150),
      field_of_study: text(entry.field_of_study, 150),
      start_date: monthValue(entry.start_date),
      end_date: monthValue(entry.end_date),
      grade: text(entry.grade, 50)
    };
  }
  return {
    company: text(entry.company, 255),
    title: text(entry.title, 150),
    location: text(entry.location, 255),
    start_date: monthValue(entry.start_date),
    end_date: isCurrent(entry.is_current) ? '' : monthValue(entry.end_date),
    is_current: isCurrent(entry.is_current),
    description: text(entry.description, 2000)
  };
}

/** "B.E — PES University (Dec 2022 – Jun 2026)" / "Software Engineer at Infosys (Jan 2024 – Present)". */
export function summarizeEntry(section, entry = {}) {
  if (section === 'education') {
    const head = [text(entry.degree), text(entry.field_of_study)].filter(Boolean).join(', ');
    const where = text(entry.institution);
    const span = formatDateSpan(monthValue(entry.start_date), monthValue(entry.end_date));
    return `${[head, where].filter(Boolean).join(' — ') || 'Education'}${span ? ` (${span})` : ''}`;
  }
  const head = [text(entry.title), text(entry.company)].filter(Boolean).join(' at ');
  const span = formatDateSpan(monthValue(entry.start_date), monthValue(entry.end_date), { current: isCurrent(entry.is_current) });
  return `${head || 'Work experience'}${span ? ` (${span})` : ''}`;
}

/** What the user typed ("B.E at PES University 2022-2026"), read into form values. Never invents values. */
export function prefillFromText(section, message) {
  const raw = text(message, 1000);
  if (!raw) return {};
  const parsed = section === 'education'
    ? parseEducationFromMessage(raw)
    : parseWorkExperienceFromMessage(raw);
  const values = toFormValues(section, parsed?.draft || {});
  return Object.fromEntries(Object.entries(values).filter(([, v]) => v !== '' && v !== false));
}

/**
 * @param {'education'|'work_experience'} section
 * @param {object|null} profile the candidate's HirePool profile
 * @param {{ text?: string }} options
 */
export function buildEntryForm(section, profile, { text: message = '' } = {}) {
  const spec = ENTRY_SECTIONS[section];
  if (!spec) return null;
  const saved = Array.isArray(profile?.[section]) ? profile[section] : [];
  return {
    section,
    title: spec.title,
    editTitle: spec.editTitle,
    noun: spec.noun,
    fields: spec.fields.map(field => ({ ...field })),
    entries: saved.slice(0, MAX_ENTRIES).map((entry, index) => ({
      index,
      summary: summarizeEntry(section, entry),
      values: toFormValues(section, entry)
    })),
    prefill: prefillFromText(section, message),
    completion: Number.isFinite(profile?.profile_completion_percentage)
      ? Math.max(0, Math.min(100, Math.round(profile.profile_completion_percentage)))
      : null
  };
}

/** Which form field a validator message is about ("Institution is required" -> institution). */
function fieldForError(section, message) {
  const m = String(message || '').toLowerCase();
  if (section === 'education') {
    if (m.includes('institution')) return 'institution';
    if (m.includes('degree')) return 'degree';
    if (m.includes('end') || m.includes('after') || m.includes('before')) return 'end_date';
    if (m.includes('date')) return 'start_date';
    return null;
  }
  if (m.includes('company')) return 'company';
  if (m.includes('title')) return 'title';
  if (m.includes('end') || m.includes('after') || m.includes('before')) return 'end_date';
  if (m.includes('date')) return 'start_date';
  return null;
}

/**
 * Merge one submitted entry into the saved list (replace `index`, or add it) and validate.
 * @returns {{ ok: boolean, errors: Record<string,string>, body?: object, summary?: string, isNew?: boolean }}
 */
export function buildEntryUpdate(section, profile, { entry, index = null } = {}) {
  const spec = ENTRY_SECTIONS[section];
  if (!spec) return { ok: false, errors: { form: 'This section cannot be edited here.' } };
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return { ok: false, errors: { form: 'Nothing to save.' } };
  }
  const values = toFormValues(section, {
    ...entry,
    // Month inputs send "2022-12"; typed text like "Dec 2022" is read the same way.
    start_date: entry.start_date,
    end_date: entry.end_date
  });
  // Dates the user typed but we could not read: say so on that field.
  const errors = {};
  for (const key of ['start_date', 'end_date']) {
    const rawValue = typeof entry[key] === 'string' ? entry[key].trim() : '';
    if (rawValue && !values[key] && !(key === 'end_date' && values.is_current)) {
      errors[key] = 'Use a month and year, for example Dec 2022.';
    }
  }
  for (const field of spec.fields) {
    if (field.required && !values[field.key]) errors[field.key] = `${field.label} is required.`;
  }
  if (Object.keys(errors).length) return { ok: false, errors };

  const saved = Array.isArray(profile?.[section]) ? profile[section].slice(0, MAX_ENTRIES) : [];
  const list = saved.map(item => ({ ...item }));
  const position = Number.isInteger(index) && index >= 0 && index < list.length ? index : null;
  const next = section === 'education'
    ? {
        institution: values.institution,
        degree: values.degree,
        field_of_study: values.field_of_study || null,
        start_date: values.start_date || null,
        end_date: values.end_date || null,
        grade: values.grade || null
      }
    : {
        company: values.company,
        title: values.title,
        location: values.location || null,
        start_date: values.start_date || null,
        end_date: values.is_current ? null : (values.end_date || null),
        is_current: values.is_current,
        description: values.description || null
      };
  if (position === null) {
    if (list.length >= MAX_ENTRIES) return { ok: false, errors: { form: `You can keep up to ${MAX_ENTRIES} entries.` } };
    list.push(next);
  } else {
    list[position] = { ...list[position], ...next };
  }

  const result = validateCandidateProfileUpdatePayload({ [section]: list }, profile);
  if (!result.isValid) {
    const entryIndex = position === null ? list.length - 1 : position;
    for (const [key, message] of Object.entries(result.errors || {})) {
      const isThisEntry = key === `${section}.${entryIndex}` || key === section;
      const field = isThisEntry ? fieldForError(section, message) : null;
      // A problem in an older saved entry is not something this form can fix field by field.
      errors[field || 'form'] = isThisEntry
        ? String(message)
        : 'One of your saved entries has a problem. Please fix it in your HirePool profile.';
    }
    return { ok: false, errors };
  }
  return {
    ok: true,
    errors: {},
    body: result.sanitizedBody,
    summary: summarizeEntry(section, next),
    isNew: position === null
  };
}
