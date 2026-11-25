/**
 * Agency (consultancy) bot: update a candidate already on the bench, e.g.
 * "add phone number to this candidate", "update Boomi Naidu phone number 9876543210",
 * "change Boomi's location to Pune".
 *
 * Keeps these requests away from the agency user's own profile edit, finds the
 * candidate (the one just added, or by name / email on the bench), asks for a
 * missing value, and stages a confirmation card for
 * PUT /api/v1/consultancies/candidates/{candidate_id}.
 */

const CANCEL_PATTERN = /^\s*(?:cancel|stop|never\s*mind|nevermind|forget\s+it|no\s+thanks?)\b[.!]*\s*$/i;

/** Detail words the agency can change on a bench candidate. */
const FIELD_PATTERNS = Object.freeze([
  { key: 'phone', label: 'phone number', pattern: /\b(?:phone(?:\s+number)?|mobile(?:\s+number)?|contact\s+number|number)\b/i },
  { key: 'email', label: 'email address', pattern: /\be-?mail(?:\s+address)?\b/i },
  { key: 'current_location', label: 'location', pattern: /\b(?:location|city|based\s+in)\b/i },
  { key: 'job_title', label: 'job title', pattern: /\b(?:job\s+title|title|role|designation|specialization)\b/i },
  { key: 'years_of_experience', label: 'years of experience', pattern: /\b(?:experience|exp)\b/i },
  { key: 'skills', label: 'skills', pattern: /\bskills?\b/i },
  { key: 'bench_status', label: 'bench status', pattern: /\b(?:bench\s+status|availability|status)\b/i },
  { key: 'notice_period_days', label: 'notice period', pattern: /\bnotice(?:\s+period)?\b/i }
]);

const EDIT_VERB = /\b(?:add|update|change|set|edit|correct|fix|replace|put)\b/i;
const CANDIDATE_REF = /\b(?:this|that|the|same|new(?:ly)?\s+added|last)\s+candidate\b|\bcandidate'?s\b|\bfor\s+(?:the\s+)?candidate\b|\bcandidates?\s+(?:phone|email|location|skills?|title|experience)\b/i;
const OWN_PROFILE_REF = /\b(?:my|mine|our|agency|consultancy|company)\b(?!\s+candidate)/i;

function titleCase(value) {
  return String(value || '').replace(/\b[a-z]/g, c => c.toUpperCase());
}

function nameWords(name) {
  return String(name || '').toLowerCase().split(/\s+/).filter(w => w.length > 1);
}

/** True when the message names this candidate (full name, or first name with an edit word). */
function mentionsCandidate(text, candidate) {
  const words = nameWords(candidate?.name);
  if (!words.length) return false;
  const lower = text.toLowerCase();
  if (lower.includes(words.join(' '))) return true;
  return new RegExp(`\\b${words[0].replace(/[^a-z]/g, '')}(?:'s)?\\b`, 'i').test(lower);
}

function detectField(text) {
  return FIELD_PATTERNS.find(field => field.pattern.test(text)) || null;
}

/**
 * Pull the new value for a field out of the message.
 * @returns {{ value: any } | { error: string } | null}
 */
export function extractCandidateFieldValue(field, text) {
  const raw = String(text || '').trim();
  switch (field) {
    case 'phone': {
      // Any run of 4+ digits is an attempt at a number, so a short one gets a clear explanation.
      const digits = raw.match(/(?:\+?91[\s-]?)?(\d[\d\s-]{2,13}\d)/);
      if (!digits) return null;
      const clean = digits[1].replace(/\D/g, '');
      if (clean.length !== 10) return { error: 'Phone numbers need exactly 10 digits, for example 9876543210.' };
      return { value: clean };
    }
    case 'email': {
      const match = raw.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
      return match ? { value: match[0].toLowerCase() } : null;
    }
    case 'years_of_experience': {
      const match = raw.match(/\b(\d{1,2})(?:\.\d+)?\s*(?:\+\s*)?(?:years?|yrs?)?\b/i);
      if (!match) return null;
      const years = Number.parseInt(match[1], 10);
      return years >= 0 && years <= 50 ? { value: years } : { error: 'Experience should be between 0 and 50 years.' };
    }
    case 'notice_period_days': {
      const match = raw.match(/\b(\d{1,3})\s*(?:days?)?\b/i);
      return match ? { value: Number.parseInt(match[1], 10) } : null;
    }
    case 'bench_status': {
      if (/\bon[\s_-]*assignment\b/i.test(raw)) return { value: 'on_assignment' };
      if (/\bnotice[\s_-]*period\b/i.test(raw)) return { value: 'notice_period' };
      if (/\bavailable\b/i.test(raw)) return { value: 'available' };
      return null;
    }
    case 'skills': {
      const after = raw.replace(/^.*?\bskills?\b\s*(?:to|as|are|is|:|-)?\s*/i, '');
      const list = after.split(/[,;]|\s+and\s+/i).map(s => s.trim().replace(/[.]+$/, '')).filter(s => s && s.length <= 40);
      return list.length ? { value: list } : null;
    }
    default: {
      // Text after "to / as / is / :" ("change location to Pune"), or the whole short reply.
      const after = raw.match(/\b(?:to|as|is|:|-)\s+(.+)$/i);
      const value = (after ? after[1] : raw).trim().replace(/[.]+$/, '');
      if (!value || value.length > 120) return null;
      return { value: field === 'current_location' ? titleCase(value) : value };
    }
  }
}

/** Is this message about changing a bench candidate (not the agency's own profile)? */
export function isAgencyCandidateEditIntent(message, session, authUser) {
  if (authUser && authUser.role !== 'consultancy') return false;
  const text = String(message || '').trim();
  if (!text) return false;
  if (session?.consultancyCandidateEdit?.pendingField) return true;
  if (!detectField(text) || !EDIT_VERB.test(text)) return false;
  if (CANDIDATE_REF.test(text)) return true;
  const last = session?.consultancyLastCandidate;
  if (last && mentionsCandidate(text, last) && !/\bmy\s+(?:phone|email|location|profile)\b/i.test(text)) return true;
  // "update Boomi Naidu phone number …": a person's name right after the verb, not "my".
  const named = text.match(/\b(?:add|update|change|set|edit)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)(?:'s)?\s+(?:phone|mobile|email|location|job|title|skills?|experience|bench|notice)/);
  return Boolean(named && !OWN_PROFILE_REF.test(named[1]));
}

function namedCandidate(text) {
  const match = text.match(/\b(?:add|update|change|set|edit|for)\s+([A-Za-z][a-z]+(?:\s+[A-Za-z][a-z]+)?)(?:'s)?\s+(?:phone|mobile|email|location|job|title|skills?|experience|bench|notice)/i);
  if (!match) return null;
  const name = match[1].trim();
  if (/^(?:this|that|the|my|our|candidate|candidates|new|a)\b/i.test(name)) return null;
  return name;
}

/**
 * @param {object} options
 * @param {string} options.message
 * @param {object} options.session
 * @param {(query: string) => Promise<Array<object>>} options.findCandidates bench search
 * @param {(input: { candidateId: string, body: object, name: string, label: string }) => Promise<{ hostAction: object }>} options.stageCandidateUpdate
 */
export async function handleAgencyCandidateEditTurn({ message, session, findCandidates, stageCandidateUpdate }) {
  const text = String(message || '').trim();
  const state = session.consultancyCandidateEdit || null;

  if (state && CANCEL_PATTERN.test(text)) {
    session.consultancyCandidateEdit = null;
    return { handled: true, text: 'No problem, nothing was changed for that candidate.' };
  }

  // 1. Which detail?
  const fieldSpec = detectField(text) || (state?.pendingField ? FIELD_PATTERNS.find(f => f.key === state.pendingField) : null);
  if (!fieldSpec) {
    session.consultancyCandidateEdit = null;
    return { handled: false };
  }

  // 2. Which candidate?
  let target = state?.candidate || null;
  const name = namedCandidate(text);
  const last = session.consultancyLastCandidate || null;
  if (!target || (name && !mentionsCandidate(name, target))) {
    if (name && last && mentionsCandidate(name, last)) target = last;
    else if (!name && (CANDIDATE_REF.test(text) || state) && last) target = last;
    else if (name) target = { name: titleCase(name), id: null, email: null };
  }
  if (!target) {
    session.consultancyCandidateEdit = { pendingField: fieldSpec.key, candidate: null, at: Date.now() };
    return {
      handled: true,
      text: `Which candidate should I update? Tell me their **name** or **email**, for example: *update Boomi Naidu ${fieldSpec.label} …*`
    };
  }

  // 3. Find their bench record when we only know a name or email.
  if (!target.id) {
    let matches = [];
    try {
      matches = await findCandidates(target.email || target.name);
    } catch {
      return { handled: true, text: "I couldn't look up your bench just now. Please try again in a moment." };
    }
    const wanted = nameWords(target.name).join(' ');
    const exact = matches.filter(c =>
      (target.email && String(c.email || '').toLowerCase() === target.email.toLowerCase()) ||
      (wanted && `${c.first_name || ''} ${c.last_name || ''}`.trim().toLowerCase() === wanted)
    );
    const pool = exact.length ? exact : matches;
    if (pool.length === 0) {
      session.consultancyCandidateEdit = null;
      return { handled: true, text: `I couldn't find **${target.name || target.email}** on your bench. Check the spelling, or say **show my candidates** to see the list.` };
    }
    if (pool.length > 1) {
      session.consultancyCandidateEdit = { pendingField: fieldSpec.key, candidate: null, at: Date.now() };
      const names = pool.slice(0, 5).map(c => `- ${titleCase(`${c.first_name || ''} ${c.last_name || ''}`.trim())}${c.email ? ` (${c.email})` : ''}`);
      return { handled: true, text: `I found more than one match. Which one did you mean? Reply with their email:\n${names.join('\n')}` };
    }
    const found = pool[0];
    target = {
      id: found.id,
      name: titleCase(`${found.first_name || ''} ${found.last_name || ''}`.trim()) || target.name,
      email: found.email || target.email
    };
  }

  // 4. The new value (from this message, or ask for it).
  const extracted = extractCandidateFieldValue(fieldSpec.key, text);
  if (!extracted || extracted.error) {
    session.consultancyCandidateEdit = { pendingField: fieldSpec.key, candidate: target, at: Date.now() };
    return {
      handled: true,
      text: extracted?.error
        ? extracted.error
        : `What's **${target.name}**'s new ${fieldSpec.label}?`
    };
  }

  session.consultancyCandidateEdit = null;
  session.consultancyLastCandidate = { ...target, at: Date.now() };
  const body = { [fieldSpec.key]: extracted.value };
  try {
    const staged = await stageCandidateUpdate({ candidateId: target.id, body, name: target.name, label: fieldSpec.label });
    const shown = Array.isArray(extracted.value) ? extracted.value.join(', ') : String(extracted.value);
    return {
      handled: true,
      text: `Update **${target.name}**'s ${fieldSpec.label} to **${shown}**? Press **Confirm & Execute** below to save it.`,
      hostAction: staged.hostAction
    };
  } catch (error) {
    return {
      handled: true,
      text: `HirePool couldn't accept that ${fieldSpec.label} for ${target.name}: ${error?.message || 'please check the value and try again.'}`
    };
  }
}
