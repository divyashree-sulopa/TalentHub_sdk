/**
 * In-app bot welcome: a personal greeting built from the server-verified
 * HirePool profile, role-specific suggestions, and the next missing profile
 * detail worth asking about. Pure functions so they are easy to test.
 */

import { computeCandidateMissingFields } from './candidate-profile-edit.js';

function isFilled(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.values(value).some(isFilled);
  return true;
}

function firstWord(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return null;
  const word = text.split(/\s+/)[0];
  // Names are shown in the chat; keep them short and plain.
  return word.length > 40 ? word.slice(0, 40) : word;
}

/**
 * @param {number|undefined} hour local hour (0-23) reported by the browser
 */
export function getTimeOfDayGreeting(hour) {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return 'Hi';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

const ORG_FIELD_SPECS = Object.freeze({
  client: Object.freeze({
    user: [
      ['full_name', 'your full name'],
      ['designation', 'your designation'],
      ['phone', 'your phone number']
    ],
    org: [
      ['industry', 'your company industry'],
      ['company_size', 'your company size'],
      ['headquarters_location', 'your headquarters location'],
      ['company_website', 'your company website'],
      ['about_company', 'a short description of your company']
    ]
  }),
  consultancy: Object.freeze({
    user: [
      ['full_name', 'your full name'],
      ['designation', 'your designation'],
      ['phone', 'your phone number']
    ],
    org: [
      ['industry_specialization', 'the industries you specialise in'],
      ['headquarters_location', 'your headquarters location'],
      ['company_size', 'your agency size'],
      ['website', 'your agency website'],
      ['about_company', 'a short description of your agency']
    ]
  })
});

const CANDIDATE_FIELD_PROMPTS = Object.freeze({
  'First Name': 'your first name',
  'Last Name': 'your last name',
  'Phone Number': 'your phone number',
  Location: 'your current location',
  'Job Title': 'your current job title',
  'Professional Summary': 'a short professional summary',
  'Years of Experience': 'your years of experience',
  Skills: 'your key skills',
  Education: 'your education',
  'Work Experience': 'your work experience',
  'Job Type Preference': 'the job types you prefer',
  'Expected Salary': 'your expected salary'
});

/**
 * What "Add it now" sends for each missing candidate field. These open the
 * right profile section without containing any value, so nothing from the
 * request itself can be saved into the profile.
 */
const CANDIDATE_EDIT_PROMPTS = Object.freeze({
  'First Name': 'Update my profile',
  'Last Name': 'Update my profile',
  'Phone Number': 'Update my phone number',
  Location: 'Update my location',
  'Job Title': 'Update my job title',
  'Professional Summary': 'Update my professional summary',
  'Years of Experience': 'Update my years of experience',
  Skills: 'Update my skills',
  Education: 'Update my education',
  'Work Experience': 'Update my work experience',
  'Job Type Preference': 'Update my job type preference',
  'Expected Salary': 'Update my expected salary'
});

const ORG_EDIT_PROMPTS = Object.freeze({
  client: Object.freeze({ user: 'Update my user profile', org: 'Update my company profile' }),
  consultancy: Object.freeze({ user: 'Update my user profile', org: 'Update my agency profile' })
});

/**
 * @returns {{ missing: string[], completion: number|null, nextField: string|null, nextEditPrompt: string|null }}
 */
export function computeProfileGaps(role, { profile = null, userProfile = null } = {}) {
  if (role === 'candidate') {
    if (!profile) return { missing: [], completion: null, nextField: null, nextEditPrompt: null };
    const { coreMissing, optionalMissing } = computeCandidateMissingFields(profile);
    const labels = [...coreMissing, ...optionalMissing];
    const missing = labels.map(label => CANDIDATE_FIELD_PROMPTS[label] || label.toLowerCase());
    const completion = Number.isFinite(profile.profile_completion_percentage)
      ? Math.max(0, Math.min(100, Math.round(profile.profile_completion_percentage)))
      : null;
    return {
      missing,
      completion,
      nextField: missing[0] || null,
      nextEditPrompt: labels.length ? (CANDIDATE_EDIT_PROMPTS[labels[0]] || 'Update my profile') : null
    };
  }

  const specs = ORG_FIELD_SPECS[role];
  if (!specs) return { missing: [], completion: null, nextField: null, nextEditPrompt: null };
  const missing = [];
  let firstGroup = null;
  let checked = 0;
  if (userProfile) {
    for (const [key, label] of specs.user) {
      checked += 1;
      if (!isFilled(userProfile[key])) {
        missing.push(label);
        firstGroup = firstGroup || 'user';
      }
    }
  }
  if (profile) {
    for (const [key, label] of specs.org) {
      checked += 1;
      if (!isFilled(profile[key])) {
        missing.push(label);
        firstGroup = firstGroup || 'org';
      }
    }
  }
  const completion = checked ? Math.round(((checked - missing.length) / checked) * 100) : null;
  return {
    missing,
    completion,
    nextField: missing[0] || null,
    nextEditPrompt: firstGroup ? ORG_EDIT_PROMPTS[role][firstGroup] : null
  };
}

const ROLE_PROMPTS = Object.freeze({
  candidate: ['Find matching jobs', 'Show my applications', 'Show my profile', 'Update my skills'],
  client: ['Show my jobs', 'Post a new job', 'Review applications', 'Show my dashboard'],
  consultancy: ['Show my candidates', 'Add a candidate', 'Placement stats', 'Show my dashboard']
});

const WELCOME_QUESTIONS = Object.freeze({
  candidate: 'What would you like to do today?',
  client: 'What are you hiring for today?',
  consultancy: 'How can I help your agency today?'
});

/** Task cards under the dashboard welcome. Each sends its prompt when tapped. */
const ROLE_ACTIONS = Object.freeze({
  candidate: Object.freeze([
    Object.freeze({ icon: 'search', title: 'Find matching jobs', subtitle: 'Openings that fit your profile', prompt: 'Find matching jobs' }),
    Object.freeze({ icon: 'clipboard', title: 'My applications', subtitle: 'See where each one stands', prompt: 'Show my applications' }),
    Object.freeze({ icon: 'chart', title: 'My dashboard', subtitle: 'Your activity at a glance', prompt: 'Show my dashboard' })
  ]),
  client: Object.freeze([
    Object.freeze({ icon: 'plus', title: 'Post a new job', subtitle: 'Create a job in a couple of steps', prompt: 'Post a new job' }),
    Object.freeze({ icon: 'clipboard', title: 'Review applications', subtitle: 'New applicants for your jobs', prompt: 'Review applications' }),
    Object.freeze({ icon: 'briefcase', title: 'My jobs', subtitle: 'Open roles and their status', prompt: 'Show my jobs' }),
    Object.freeze({ icon: 'chart', title: 'Hiring dashboard', subtitle: 'Your numbers at a glance', prompt: 'Show my dashboard' })
  ]),
  consultancy: Object.freeze([
    Object.freeze({ icon: 'search', title: 'Job opportunities', subtitle: 'Open roles to submit candidates to', prompt: 'Show job opportunities' }),
    Object.freeze({ icon: 'user-plus', title: 'Add a candidate', subtitle: 'Grow your bench in one message', prompt: 'Add a candidate' }),
    Object.freeze({ icon: 'users', title: 'My candidates', subtitle: 'Your bench and availability', prompt: 'Show my candidates' }),
    Object.freeze({ icon: 'chart', title: 'Placement stats', subtitle: 'Submissions and placements', prompt: 'Placement stats' })
  ])
});

// "Complete now" covers the profile; editing stays available by typing "edit my profile".
const ROLE_QUICK_REPLIES = Object.freeze({
  candidate: ['What can you do?'],
  client: ['What can you do?'],
  consultancy: ['What can you do?']
});

/**
 * Build the in-app welcome.
 * @param {object} input
 * @param {'candidate'|'client'|'consultancy'} input.role
 * @param {object|null} [input.profile] role profile (candidate profile, company or agency profile)
 * @param {object|null} [input.userProfile] organisation member profile (client/consultancy)
 * @param {number} [input.hour]
 */
export function buildAppWelcome({ role, profile = null, userProfile = null, hour }) {
  const name = role === 'candidate'
    ? firstWord(profile?.first_name)
    : firstWord(userProfile?.full_name);
  const orgName = role === 'client'
    ? (profile?.company_name || userProfile?.company_name || null)
    : role === 'consultancy'
      ? (profile?.consultancy_name || userProfile?.consultancy_name || null)
      : null;

  const salutation = `${getTimeOfDayGreeting(hour)}${name ? `, ${name}` : ''}! 👋`;
  const intro = {
    candidate: 'I can help you find matching jobs, track your applications, and keep your profile up to date.',
    client: `I can help you post jobs, review applicants, and keep ${orgName ? `**${orgName}**'s` : 'your company'} profile up to date.`,
    consultancy: `I can help you manage your bench, submit candidates, and keep ${orgName ? `**${orgName}**'s` : 'your agency'} profile up to date.`
  }[role] || 'I can help with your HirePool account.';

  const gaps = computeProfileGaps(role, { profile, userProfile });
  const profileWord = { candidate: 'profile', client: 'company profile', consultancy: 'agency profile' }[role] || 'profile';
  const benefit = role === 'candidate'
    ? 'A complete profile gets you better job matches.'
    : 'A complete profile helps candidates and partners trust you.';
  const missingList = gaps.missing.map(item => item.replace(/^(?:your|a short)\s+/i, ''));
  const listText = missingList.length > 6
    ? `${missingList.slice(0, 6).join(', ')} and ${missingList.length - 6} more`
    : missingList.join(', ').replace(/, ([^,]*)$/, ' and $1');
  const nudge = gaps.nextField
    ? {
        field: gaps.nextField,
        missing: missingList,
        completion: gaps.completion,
        remaining: gaps.missing.length,
        text: [
          `${gaps.completion !== null ? `Your ${profileWord} is **${gaps.completion}%** complete.` : `Your ${profileWord} isn't complete yet.`} Still missing: **${listText}**.`,
          '',
          `${benefit} Shall we complete it now? It's a quick form, one minute at most.`
        ].join('\n'),
        acceptPrompt: gaps.nextEditPrompt || 'Update my profile'
      }
    : null;

  return {
    greeting: `${salutation} ${intro}`,
    // Interactive welcome: a short hello, tappable task cards, and profile progress.
    salutation,
    question: WELCOME_QUESTIONS[role] || 'What would you like to do today?',
    actions: (ROLE_ACTIONS[role] || []).map(action => ({ ...action })),
    quickReplies: [...(ROLE_QUICK_REPLIES[role] || [])],
    profileProgress: nudge
      ? { completion: gaps.completion, remaining: gaps.missing.length, missing: missingList.slice(0, 4), profileWord }
      : null,
    suggestedPrompts: [...(ROLE_PROMPTS[role] || [])],
    profileNudge: nudge
  };
}
