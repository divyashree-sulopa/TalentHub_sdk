/**
 * In-app bot: what the assistant knows about the signed-in user.
 *
 * - Profile reads per role (server-verified identity; never from the browser).
 * - A compact, escaped summary added to the AI's instructions so it can answer
 *   "what's my title?" or "which company am I with?" without a tool call.
 * - A candidate "dashboard" summary built from the profile and the candidate's
 *   own application history (HirePool has no single candidate stats endpoint).
 */

import { computeProfileGaps } from './app-welcome.js';

export const HIREPOOL_PROFILE_OPERATIONS = Object.freeze({
  candidate: Object.freeze({ profile: 'get_my_profile_api_v1_candidates_profile_get' }),
  client: Object.freeze({
    profile: 'get_my_company_profile_api_v1_clients_profile_get',
    userProfile: 'get_my_user_profile_api_v1_clients_me_get'
  }),
  consultancy: Object.freeze({
    profile: 'get_my_consultancy_profile_api_v1_consultancies_profile_get',
    userProfile: 'get_my_user_profile_api_v1_consultancies_me_get'
  })
});

function clean(value, max = 120) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return '';
  // Keep the summary inert inside the prompt: no markup, no line breaks.
  return value.replace(/[<>`]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function list(values, max = 8) {
  if (!Array.isArray(values)) return '';
  return values
    .map(v => clean(typeof v === 'string' ? v : (v?.name || v?.skill || '')))
    .filter(Boolean)
    .slice(0, max)
    .join(', ');
}

function line(label, value) {
  return value ? `- ${label}: ${value}` : null;
}

/**
 * Summary lines for the AI's instructions. Only display-safe profile fields.
 * @returns {string} empty string when nothing is known
 */
export function buildAccountSummary(role, { profile = null, userProfile = null } = {}) {
  const gaps = computeProfileGaps(role, { profile, userProfile });
  let lines = [];
  if (role === 'candidate' && profile) {
    const name = [clean(profile.first_name, 60), clean(profile.last_name, 60)].filter(Boolean).join(' ');
    const years = Number.isFinite(profile.years_of_experience) ? `${profile.years_of_experience} years` : '';
    lines = [
      line('Name', name),
      line('Current title', clean(profile.job_title)),
      line('Location', clean(profile.current_location)),
      line('Experience', years),
      line('Key skills', list(profile.skills)),
      line('Preferred work modes', list(profile.preferred_work_types, 3)),
      line('Open to work', typeof profile.is_open_to_work === 'boolean' ? (profile.is_open_to_work ? 'yes' : 'no') : '')
    ];
  } else if (role === 'client') {
    lines = [
      line('Name', clean(userProfile?.full_name)),
      line('Designation', clean(userProfile?.designation)),
      line('Company', clean(profile?.company_name || userProfile?.company_name)),
      line('Industry', clean(profile?.industry)),
      line('Company size', clean(profile?.company_size)),
      line('Headquarters', clean(profile?.headquarters_location)),
      line('Verification status', clean(profile?.verification_status, 40))
    ];
  } else if (role === 'consultancy') {
    lines = [
      line('Name', clean(userProfile?.full_name)),
      line('Designation', clean(userProfile?.designation)),
      line('Agency', clean(profile?.consultancy_name || userProfile?.consultancy_name)),
      line('Specialisations', list(profile?.industry_specialization, 6)),
      line('Headquarters', clean(profile?.headquarters_location)),
      line('Candidate pool size', Number.isFinite(profile?.candidate_pool_size) ? String(profile.candidate_pool_size) : ''),
      line('Verification status', clean(profile?.verification_status, 40))
    ];
  }
  lines = lines.filter(Boolean);
  if (gaps.completion !== null) lines.push(`- Profile completeness: ${gaps.completion}%`);
  if (gaps.missing.length) lines.push(`- Missing profile details: ${gaps.missing.slice(0, 5).join('; ')}`);
  return lines.join('\n');
}

const STATUS_LABELS = Object.freeze({
  applied: 'Applied',
  submitted: 'Applied',
  pending: 'Applied',
  screening: 'Screening',
  screening_pending: 'Screening',
  shortlisted: 'Shortlisted',
  interview: 'Interviewing',
  interviewing: 'Interviewing',
  interview_scheduled: 'Interviewing',
  offered: 'Offer received',
  offer: 'Offer received',
  hired: 'Hired',
  rejected: 'Not selected',
  withdrawn: 'Withdrawn'
});

function statusLabel(status) {
  const key = String(status || '').toLowerCase();
  if (STATUS_LABELS[key]) return STATUS_LABELS[key];
  return key ? key.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()) : 'Unknown';
}

/**
 * Candidate dashboard overview (Markdown).
 * @param {{ profile: object|null, applications: { items: object[], total: number, complete?: boolean }|null }} input
 */
export function formatCandidateDashboard({ profile = null, applications = null }) {
  const out = ['## Your HirePool overview'];
  const gaps = computeProfileGaps('candidate', { profile });

  if (profile) {
    const completion = gaps.completion !== null ? `**${gaps.completion}%** complete` : 'available';
    out.push('', `**Profile:** ${completion}`);
    if (gaps.missing.length) {
      out.push(`Still missing: ${gaps.missing.slice(0, 3).join(', ')}${gaps.missing.length > 3 ? `, and ${gaps.missing.length - 3} more` : ''}.`);
    }
  } else {
    out.push('', '**Profile:** I could not load your profile just now.');
  }

  if (applications) {
    const items = Array.isArray(applications.items) ? applications.items : [];
    const total = Number.isInteger(applications.total) ? applications.total : items.length;
    out.push('', `**Applications:** ${total}${applications.complete === false ? ' (showing the most recent)' : ''}`);
    if (items.length) {
      const counts = new Map();
      for (const item of items) {
        const label = statusLabel(item.status);
        counts.set(label, (counts.get(label) || 0) + 1);
      }
      out.push(...[...counts.entries()].map(([label, count]) => `- ${label}: ${count}`));
      const recent = [...items]
        .sort((a, b) => Date.parse(b.last_status_change_at || b.created_at || 0) - Date.parse(a.last_status_change_at || a.created_at || 0))
        .slice(0, 3)
        .map(item => `- ${clean(item.job_title) || 'A job'}${item.company_name ? ` at ${clean(item.company_name)}` : ''}: ${statusLabel(item.status)}`);
      out.push('', '**Most recent:**', ...recent);
    } else {
      out.push("You haven't applied to any jobs yet.");
    }
  } else {
    out.push('', '**Applications:** I could not load your applications just now.');
  }

  out.push('', gaps.missing.length
    ? 'Want me to help you complete your profile, or find jobs that match you?'
    : 'Want me to find jobs that match your profile?');
  return out.join('\n');
}

const CANDIDATE_DASHBOARD_PATTERN =
  /^(?:please\s+)?(?:(?:view|show|get|check|display|see|open|give\s+me)\s+)?(?:me\s+)?(?:my\s+|an?\s+)?(?:candidate\s+)?(?:dashboard(?:\s+stats?)?|stats|statistics|overview|summary|progress)(?:\s+please)?[.!?]*$|\bhow\s+am\s+i\s+doing\b|\bwhere\s+do\s+i\s+stand\b/i;

export function isCandidateDashboardRequest(message) {
  return CANDIDATE_DASHBOARD_PATTERN.test(String(message || '').trim());
}
