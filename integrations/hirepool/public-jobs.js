/**
 * Website bot: search HirePool's public job board.
 *
 * Uses HirePool's no-login endpoint `GET /api/v1/public/jobs`, which lists
 * open jobs from verified companies. Read-only, no account data involved.
 * Results are formatted here (not by the AI model), so job details shown to
 * visitors always come from HirePool and are never invented.
 */

import { z } from 'zod';

export const HIREPOOL_JOB_SEARCH_ACTION = 'hirepool_search_jobs';
const MAX_RESULTS = 3;
const MAX_RESPONSE_BYTES = 256 * 1024;
const REQUEST_TIMEOUT_MS = 6000;
const CACHE_TTL_MS = 60 * 1000;
const WORK_MODES = ['remote', 'hybrid', 'onsite'];
const cache = new Map();

export function createPublicJobSearchAction() {
  return {
    name: HIREPOOL_JOB_SEARCH_ACTION,
    title: 'Search HirePool jobs',
    description: 'Search open jobs on HirePool (public listings from verified companies). Call this once a job seeker has told you the kind of role they want; include location and work mode when they gave them.',
    parameters: {
      query: 'Role or main skill the visitor is looking for, e.g. "React developer".',
      location: 'Optional city or region the visitor prefers, e.g. "Bengaluru".',
      work_mode: 'Optional: remote, hybrid, or onsite.'
    },
    parameterSchema: z.object({
      query: z.string().trim().min(2).max(100).describe('Role or main skill, e.g. "React developer".'),
      location: z.string().trim().max(100).optional().describe('City or region, e.g. "Bengaluru".'),
      work_mode: z.enum(WORK_MODES).optional().describe('remote, hybrid, or onsite.')
    }).strict(),
    risk: 'read',
    requiresConfirmation: false,
    promptGuideline: 'Use this to show real open roles. Never list or describe jobs yourself; the search results are shown to the visitor directly.',
    metadata: { hirePoolPublicJobs: true }
  };
}

function getPublicApiBase(env = process.env) {
  const url = new URL(env.HIREPOOL_LOCAL_API_BASE_URL || 'http://localhost:8000/');
  // Local-only for now: talk to the local HirePool API over loopback, like the rest of the bridge.
  if (url.hostname === 'localhost') url.hostname = '127.0.0.1';
  return url;
}

function cleanText(value, max = 120) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function normalizeJob(item) {
  if (!item || typeof item !== 'object') return null;
  const title = cleanText(item.title);
  if (!title) return null;
  const company = cleanText(typeof item.company === 'string' ? item.company : (item.company?.name || item.company?.company_name));
  const locations = Array.isArray(item.locations) ? item.locations.map(l => cleanText(l, 60)).filter(Boolean).slice(0, 3) : [];
  const workMode = WORK_MODES.includes(item.remote_type) ? item.remote_type : null;
  const skills = Array.isArray(item.skills) ? item.skills.map(s => cleanText(s, 40)).filter(Boolean).slice(0, 5) : [];
  const publishedAt = typeof item.published_at === 'string' && !Number.isNaN(Date.parse(item.published_at)) ? item.published_at : null;
  return { title, company, locations, workMode, skills, publishedAt };
}

async function requestPublicJobs(params, { fetchImpl, env }) {
  const url = new URL('api/v1/public/jobs', getPublicApiBase(env));
  url.searchParams.set('page_size', String(MAX_RESULTS));
  if (params.query) url.searchParams.set('q', params.query);
  if (params.location) url.searchParams.set('location', params.location);
  if (params.workMode) url.searchParams.set('remote_type', params.workMode);

  const key = url.search;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const response = await fetchImpl(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if (!response.ok) {
    const error = new Error(`HirePool job search failed (HTTP ${response.status})`);
    error.statusCode = response.status;
    throw error;
  }
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) throw new Error('HirePool job search response was too large');
  const data = JSON.parse(text);
  const value = {
    jobs: (Array.isArray(data?.items) ? data.items : []).map(normalizeJob).filter(Boolean).slice(0, MAX_RESULTS),
    total: Number.isInteger(data?.total) ? data.total : 0
  };
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

/**
 * Search open jobs, relaxing the filters when nothing matches exactly.
 * @returns {Promise<{ jobs: object[], total: number, relaxed: null|'work_mode'|'location' , criteria: object }>}
 */
export async function searchPublicHirePoolJobs(criteria, { fetchImpl = (...a) => globalThis.fetch(...a), env = process.env } = {}) {
  const query = cleanText(criteria.query, 100);
  const location = cleanText(criteria.location, 100) || null;
  const workMode = WORK_MODES.includes(criteria.work_mode) ? criteria.work_mode : null;
  const normalized = { query, location, workMode };

  let result = await requestPublicJobs(normalized, { fetchImpl, env });
  if (result.jobs.length) return { ...result, relaxed: null, criteria: normalized };
  if (workMode) {
    result = await requestPublicJobs({ query, location, workMode: null }, { fetchImpl, env });
    if (result.jobs.length) return { ...result, relaxed: 'work_mode', criteria: normalized };
  }
  if (location) {
    result = await requestPublicJobs({ query, location: null, workMode: null }, { fetchImpl, env });
    if (result.jobs.length) return { ...result, relaxed: 'location', criteria: normalized };
  }
  return { jobs: [], total: 0, relaxed: null, criteria: normalized };
}

const WORK_MODE_LABELS = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'Onsite' };

function postedAgo(iso, now = Date.now()) {
  if (!iso) return null;
  const days = Math.floor((now - Date.parse(iso)) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'posted today';
  if (days === 1) return 'posted yesterday';
  if (days < 30) return `posted ${days} days ago`;
  const months = Math.floor(days / 30);
  return `posted ${months} month${months === 1 ? '' : 's'} ago`;
}

/**
 * Make HirePool text safe inside chat Markdown without showing backslashes to
 * visitors: square brackets (which could form a link) become parentheses and
 * emphasis/code markers are dropped. The chat renderer escapes HTML itself.
 */
function escapeMarkdown(text) {
  return String(text)
    .replace(/\[/g, '(')
    .replace(/\]/g, ')')
    .replace(/[*_`~|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Visitor-facing reply for a search result (Markdown). */
export function formatPublicJobResults(result, { now = Date.now() } = {}) {
  const { jobs, criteria, relaxed, total } = result;
  const what = escapeMarkdown(criteria.query || 'that role');

  if (!jobs.length) {
    return [
      `I couldn't find an open **${what}** role on HirePool right now${criteria.location ? ` in ${escapeMarkdown(criteria.location)}` : ''}.`,
      '',
      'New roles are added all the time. With a HirePool account, AI matching shows you new openings that fit your profile as soon as they are posted.',
      '',
      '**Would you like me to create your account now?** It only takes a couple of minutes.'
    ].join('\n');
  }

  let intro = jobs.length === 1
    ? 'Here is an open role on HirePool that fits:'
    : `Here are ${jobs.length} open roles on HirePool that fit:`;
  if (relaxed === 'work_mode') {
    intro = `I didn't find a ${WORK_MODE_LABELS[criteria.workMode].toLowerCase()} match, but here ${jobs.length === 1 ? 'is a related role' : 'are related roles'}${criteria.location ? ` in ${escapeMarkdown(criteria.location)}` : ''}:`;
  } else if (relaxed === 'location') {
    intro = `Nothing in ${escapeMarkdown(criteria.location)} right now, but here ${jobs.length === 1 ? 'is a matching role' : 'are matching roles'} elsewhere:`;
  }

  const lines = jobs.map(job => {
    const details = [
      job.company && escapeMarkdown(job.company),
      job.locations.length && escapeMarkdown(job.locations.join(', ')),
      job.workMode && WORK_MODE_LABELS[job.workMode],
      postedAgo(job.publishedAt, now)
    ].filter(Boolean).join(' · ');
    const skills = job.skills.length ? `\n  Skills: ${escapeMarkdown(job.skills.slice(0, 3).join(', '))}` : '';
    return `🟢 **${escapeMarkdown(job.title)}**${details ? ` · ${details}` : ''}${skills}`;
  });

  const more = total > jobs.length ? `\n\nThere are more matching roles on HirePool once you sign in.` : '';
  return [
    intro,
    '',
    lines.join('\n\n'),
    more,
    '',
    'To apply, you need a HirePool account. **Shall I create one for you now?**'
  ].join('\n').replace(/\n{3,}/g, '\n\n');
}

export function formatPublicJobSearchUnavailable() {
  return "I couldn't reach HirePool's job listings just now. Please try again in a moment, or I can create your HirePool account so you can browse every opening in your dashboard.";
}

/** Tests only. */
export function _clearPublicJobCache() {
  cache.clear();
}
