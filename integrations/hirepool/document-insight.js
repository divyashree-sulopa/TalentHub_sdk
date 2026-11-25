/**
 * Website bot: understand a document a visitor uploads and reply for HirePool.
 *
 * - A resume        -> matching HirePool openings, then offer a candidate account.
 * - A job description -> explain hiring on HirePool, offer a company account.
 * - A candidate list / bench sheet -> explain agency tools, offer a consultancy account.
 * - Anything else   -> say so and ask for something HirePool-related.
 *
 * Deterministic (no AI call): the document text is untrusted input, so it is
 * only scanned for signals and short facts, never followed as instructions.
 */

import { formatPublicJobResults } from './public-jobs.js';

export const DOCUMENT_KINDS = Object.freeze({
  RESUME: 'resume',
  JOB_DESCRIPTION: 'job_description',
  CANDIDATE_LIST: 'candidate_list',
  UNREADABLE: 'unreadable',
  UNRELATED: 'unrelated'
});

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE = /(?:\+?\d{1,3}[\s-]?)?\b\d{5}[\s-]?\d{5}\b|\b\d{3}[\s-]\d{3}[\s-]\d{4}\b/g;

const RESUME_SIGNALS = [
  /\b(?:resume|r[ée]sum[ée]|curriculum\s+vitae|\bcv\b)/i,
  /\b(?:work|professional|employment)\s+(?:experience|history)\b/i,
  /\beducation\b|\bacademic\b/i,
  /\b(?:technical\s+)?skills\b/i,
  /\b(?:projects?|certifications?|achievements|internships?)\b/i,
  /\b(?:b\.?\s?tech|b\.?e\.?|bachelor|master'?s?|m\.?\s?tech|mba|b\.?sc|m\.?sc|degree|university|college)\b/i,
  /\b(?:career\s+)?objective\b|\bprofessional\s+summary\b|\bprofile\s+summary\b/i,
  /\b(?:linkedin\.com\/in|github\.com)\b/i
];

const JD_SIGNALS = [
  /\bjob\s+description\b|\bjd\b/i,
  /\b(?:key\s+)?responsibilities\b|\bwhat\s+you'?ll\s+do\b|\brole\s+overview\b/i,
  /\brequirements\b|\bqualifications\b|\bwho\s+you\s+are\b|\beligibility\b/i,
  /\bwe\s+are\s+(?:looking|hiring|seeking)\b|\bwe'?re\s+(?:looking|hiring)\b|\bjoin\s+our\s+team\b/i,
  /\b(?:about\s+the\s+(?:role|company|job)|about\s+us)\b/i,
  /\b(?:ctc|compensation|salary\s+range|benefits|perks)\b/i,
  /\b(?:must[\s-]have|nice[\s-]to[\s-]have|preferred\s+skills|good\s+to\s+have)\b/i,
  /\b(?:how\s+to\s+apply|apply\s+now|open\s+position|vacanc(?:y|ies)|openings?)\b/i,
  /\b(?:employment\s+type|full[\s-]time|contract|work\s+mode|location\s*:)\b/i
];

const LIST_SIGNALS = [
  /\bbench\b/i,
  /\b(?:consultants?|candidates?\s+list|candidate\s+pool|talent\s+pool)\b/i,
  /\b(?:staffing|placements?|vendor|rate\s+card|billing\s+rate|hourly\s+rate)\b/i,
  /\b(?:availability|available\s+from|notice\s+period|immediate\s+joiner)\b/i,
  /\b(?:s\.?\s?no|sr\.?\s?no)\b/i
];

const HIRING_WORDS = /\b(?:job|hiring|candidate|resume|skills?|experience|role|position|recruit\w*|interview|salary|employ\w*|career|staffing|talent)\b/gi;

const ROLE_WORD = /\b(engineer|developer|designer|architect|consultant|analyst|scientist|specialist|manager|lead|tester|administrator|intern|executive|associate|programmer|recruiter)\b/i;

const KNOWN_SKILLS = [
  'JavaScript', 'TypeScript', 'React', 'Angular', 'Vue', 'Node.js', 'Next.js', 'Express', 'Python', 'Django', 'Flask',
  'FastAPI', 'Java', 'Spring Boot', 'Kotlin', 'Swift', 'Go', 'Rust', 'C#', '.NET', 'PHP', 'Laravel', 'Ruby', 'SQL',
  'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Terraform', 'Git',
  'HTML', 'CSS', 'Tailwind', 'Redux', 'GraphQL', 'REST', 'Figma', 'Power BI', 'Tableau', 'Excel', 'Machine Learning',
  'TensorFlow', 'PyTorch', 'Selenium', 'Salesforce', 'SAP', 'Linux', 'DevOps', 'Flutter', 'React Native', 'Android'
];

const CITIES = [
  'Bengaluru', 'Bangalore', 'Mumbai', 'Delhi', 'New Delhi', 'Hyderabad', 'Pune', 'Chennai', 'Noida', 'Gurgaon',
  'Gurugram', 'Kolkata', 'Ahmedabad', 'Kochi', 'Coimbatore', 'Jaipur', 'Chandigarh', 'Indore', 'Remote'
];

function count(patterns, text) {
  return patterns.reduce((total, pattern) => total + (pattern.test(text) ? 1 : 0), 0);
}

function clean(value, max = 80) {
  return String(value || '').replace(/[*_`[\]<>|#]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Decide what kind of document this is.
 * @param {string} text extracted document text
 * @returns {{ kind: string, scores: object }}
 */
export function classifyHirePoolDocument(text) {
  const body = String(text || '');
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  if (words < 15) return { kind: DOCUMENT_KINDS.UNREADABLE, scores: {} };

  const emails = new Set((body.match(EMAIL) || []).map(e => e.toLowerCase())).size;
  const phones = (body.match(PHONE) || []).length;
  const resume = count(RESUME_SIGNALS, body) + (emails === 1 ? 1 : 0) + (phones >= 1 && phones <= 2 ? 1 : 0);
  const jd = count(JD_SIGNALS, body);
  const list = count(LIST_SIGNALS, body) + (emails >= 3 ? 3 : 0) + (phones >= 3 ? 1 : 0);
  const hiringWords = (body.match(HIRING_WORDS) || []).length;
  const scores = { resume, jd, list, hiringWords, emails };

  const best = [
    [DOCUMENT_KINDS.CANDIDATE_LIST, list],
    [DOCUMENT_KINDS.RESUME, resume],
    [DOCUMENT_KINDS.JOB_DESCRIPTION, jd]
  ].sort((a, b) => b[1] - a[1])[0];

  if (best[1] < 3 || hiringWords < 2) return { kind: DOCUMENT_KINDS.UNRELATED, scores };
  // A job description lists requirements; a resume belongs to one person.
  if (best[0] === DOCUMENT_KINDS.RESUME && jd >= resume && emails === 0) return { kind: DOCUMENT_KINDS.JOB_DESCRIPTION, scores };
  return { kind: best[0], scores };
}

/** Short facts from a resume: name, title, skills, city, years of experience. */
export function extractResumeDetails(text) {
  const body = String(text || '');
  const lines = body.split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, 60);
  const name = lines.find(line =>
    /^[A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*){1,3}$/.test(line) &&
    !/\b(?:resume|curriculum|vitae|profile|summary|contact|email|phone)\b/i.test(line)
  ) || null;
  const titleLine = lines.find(line => ROLE_WORD.test(line) && line.length <= 60 && !/@/.test(line)) || null;
  const title = titleLine
    ? clean(titleLine.match(/((?:[A-Za-z+#.]+\s+){0,3}(?:engineer|developer|designer|architect|consultant|analyst|scientist|specialist|manager|lead|tester|administrator|intern|executive|associate|programmer|recruiter))/i)?.[1] || titleLine, 60)
    : null;
  const skills = KNOWN_SKILLS.filter(skill =>
    new RegExp(`(?:^|[^A-Za-z0-9])${escapeRegExp(skill)}(?![A-Za-z0-9])`, 'i').test(body)
  ).slice(0, 6);
  const city = CITIES.find(c => new RegExp(`\\b${escapeRegExp(c)}\\b`, 'i').test(body)) || null;
  const years = body.match(/\b(\d{1,2})(?:\.\d)?\s*\+?\s*(?:years?|yrs?)(?:\s+of)?\s+(?:experience|exp)\b/i);
  return {
    name: name ? clean(name, 60) : null,
    title,
    skills,
    location: city === 'Bangalore' ? 'Bengaluru' : city,
    years: years ? Number.parseInt(years[1], 10) : null
  };
}

/** The role named in a job description, if any. */
export function extractJobTitle(text) {
  const body = String(text || '');
  const labelled = body.match(/\b(?:job\s+title|position|role|designation)\s*[:\-–]\s*([^\n]{3,60})/i);
  if (labelled) return clean(labelled[1], 60);
  const line = body.split(/\r?\n/).map(l => l.trim()).find(l => ROLE_WORD.test(l) && l.length <= 60);
  return line ? clean(line, 60) : null;
}

function splitPersonName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  const title = w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  return { first: parts[0] ? title(parts[0]) : '', last: parts.slice(1).map(title).join(' ') };
}

/**
 * Agency bot: candidate fields from a resume, in the shape of HirePool's
 * "add candidate" request, plus which required fields are still missing.
 */
export function extractResumeCandidate(text) {
  const body = String(text || '');
  const d = extractResumeDetails(body);
  const { first, last } = splitPersonName(d.name);
  const email = (body.match(EMAIL) || [])[0]?.toLowerCase() || null;
  const phoneMatch = body.match(/(?:\+?91[\s-]?)?\b([6-9]\d{4}[\s-]?\d{5})\b/);
  const candidate = {
    first_name: first || null,
    last_name: last || null,
    email,
    phone: phoneMatch ? phoneMatch[1].replace(/\D/g, '') : null,
    job_title: d.title || null,
    current_location: d.location && d.location !== 'Remote' ? d.location : null,
    years_of_experience: Number.isInteger(d.years) ? d.years : 0,
    skills: d.skills,
    bench_status: 'available'
  };
  const labels = { first_name: 'first name', last_name: 'last name', email: 'email', job_title: 'job title', current_location: 'location' };
  const missing = Object.keys(labels).filter(key => !candidate[key]).map(key => labels[key]);
  return { candidate, missing };
}

/** "Name: …, Email: …" text the add-candidate flow understands (for "Review one by one"). */
export function composeCandidateAddMessage(candidate) {
  const c = candidate || {};
  const parts = [
    `Name: ${[c.first_name, c.last_name].filter(Boolean).join(' ')}`,
    c.email && `Email: ${c.email}`,
    c.phone && `Phone: ${c.phone}`,
    c.job_title && `Job title: ${c.job_title}`,
    c.current_location && `Location: ${c.current_location}`,
    `Experience: ${Number.isInteger(c.years_of_experience) ? c.years_of_experience : 0} years`,
    Array.isArray(c.skills) && c.skills.length && `Skills: ${c.skills.join(', ')}`
  ].filter(Boolean);
  // "Name:" must start a line for the add-candidate flow to read it.
  return `Add candidate\n${parts.join(', ')}`;
}

/** Company bot: job fields from a job description. */
export function extractJobFieldsFromDescription(text) {
  const body = String(text || '');
  const title = extractJobTitle(body);
  const city = CITIES.filter(c => c !== 'Remote').find(c => new RegExp(`\\b${escapeRegExp(c)}\\b`, 'i').test(body)) || null;
  const workType = /\bhybrid\b/i.test(body) ? 'hybrid' : /\bremote\b/i.test(body) ? 'remote' : /\b(?:on[\s-]?site|in[\s-]?office|work\s+from\s+office)\b/i.test(body) ? 'onsite' : null;
  const employment = /\bcontract(?:ual)?\b/i.test(body) && !/\bfull[\s-]?time\b/i.test(body) ? 'contract' : (/\b(?:full[\s-]?time|permanent)\b/i.test(body) ? 'full-time' : null);
  const yearsMatch = body.match(/\b(\d{1,2})\s*\+?\s*(?:-\s*\d{1,2}\s*)?(?:years?|yrs?)\b/i);
  const years = yearsMatch ? Number.parseInt(yearsMatch[1], 10) : null;
  const level = years === null ? null : years < 2 ? 'entry' : years < 5 ? 'mid' : years < 8 ? 'senior' : 'lead';
  const skills = KNOWN_SKILLS.filter(skill =>
    new RegExp(`(?:^|[^A-Za-z0-9])${escapeRegExp(skill)}(?![A-Za-z0-9])`, 'i').test(body)
  ).slice(0, 10);
  // One line, without the title line, short enough for the job form.
  const description = clean(body.replace(/\b(?:job\s+title|position|role)\s*[:\-–][^\n]*\n?/i, ''), 1200);
  return {
    title: title ? title.replace(/^(?:job\s+title|position|role)\s*[:\-–]\s*/i, '') : null,
    location: city === 'Bangalore' ? 'Bengaluru' : city,
    work_type: workType,
    employment_type: employment,
    experience_level: level,
    years,
    skills,
    description: description.length >= 20 ? description : null
  };
}

/** Labelled text the job-creation flow understands. */
export function composeJobCreateMessage(fields) {
  const f = fields || {};
  return [
    f.title && `Job title: ${f.title}`,
    f.description && `Description: ${f.description.replace(/\b(?:locations?|work\s*type|employment\s*type|experience|salary|skills?|openings?|deadline)\s*[:=]/gi, m => m.replace(/[:=]/, ' -'))}`,
    f.location && `Location: ${f.location}`,
    f.work_type && `Work type: ${f.work_type}`,
    f.employment_type && `Employment type: ${f.employment_type}`,
    f.experience_level && `Experience level: ${f.experience_level}`,
    Array.isArray(f.skills) && f.skills.length && `Required skills: ${f.skills.join(', ')}`
  ].filter(Boolean).join('\n');
}

/**
 * Dashboard bot: what to say and offer after an upload, by the user's role.
 * @returns {{ kind: string, text: string, options: Array<{id: string, title: string, subtitle: string, icon: string}>, data: object }}
 */
export function buildDashboardDocumentInsight({ role, filename, text }) {
  const { kind } = classifyHirePoolDocument(text);
  const file = `**${clean(filename, 60) || 'your document'}**`;
  const unreadable = kind === DOCUMENT_KINDS.UNREADABLE;
  const none = { kind, options: [], data: {} };

  if (unreadable) {
    return { ...none, text: `I couldn't read any text in ${file}. It may be a scanned image. Please upload a text-based **PDF, DOCX or TXT**.` };
  }

  if (role === 'candidate') {
    if (kind !== DOCUMENT_KINDS.RESUME) {
      return { ...none, text: `${file} doesn't look like a resume. 🤔 Upload your **resume** and I can fill in your profile and find matching jobs.` };
    }
    const d = extractResumeDetails(text);
    const { first, last } = splitPersonName(d.name);
    const facts = [d.title, d.skills.slice(0, 3).join(', '), d.location, Number.isInteger(d.years) ? `${d.years} yrs` : null].filter(Boolean).join(' · ');
    const phone = String(text || '').match(/(?:\+?91[\s-]?)?\b([6-9]\d{4}[\s-]?\d{5})\b/);
    return {
      kind,
      text: `I read your resume ${file}${facts ? `: **${facts}**` : ''}. 📄 What would you like to do?`,
      options: [
        { id: 'fill_profile', icon: 'user-check', title: 'Fill my profile from it', subtitle: 'Review the details in a form first' },
        { id: 'find_jobs', icon: 'search', title: 'Find matching jobs', subtitle: 'Uses the role and skills in the resume' },
        { id: 'save_resume', icon: 'file-upload', title: 'Save as my resume', subtitle: 'Companies can download it' }
      ],
      data: {
        prefill: {
          ...(first ? { first_name: first } : {}),
          ...(last ? { last_name: last } : {}),
          ...(phone ? { phone: phone[1].replace(/\D/g, '') } : {}),
          ...(d.title ? { job_title: d.title } : {}),
          ...(d.location && d.location !== 'Remote' ? { current_location: d.location } : {}),
          ...(Number.isInteger(d.years) ? { years_of_experience: d.years } : {}),
          ...(d.skills.length ? { skills: d.skills } : {})
        },
        jobSearch: resumeJobSearchCriteria(d)
      }
    };
  }

  if (role === 'consultancy') {
    if (kind !== DOCUMENT_KINDS.RESUME) {
      return {
        ...none,
        text: kind === DOCUMENT_KINDS.CANDIDATE_LIST
          ? `${file} looks like a candidate list. Upload the candidates' **resumes** (you can pick several at once) and I'll add them to your bench.`
          : `${file} doesn't look like a resume. 🤔 Upload one or more candidate **resumes** and I can add them to your bench or submit them to a job.`
      };
    }
    const { candidate, missing } = extractResumeCandidate(text);
    return {
      kind,
      text: '',
      options: [],
      data: { candidate, missing, filename: clean(filename, 80), addMessage: composeCandidateAddMessage(candidate) }
    };
  }

  if (role === 'client') {
    if (kind !== DOCUMENT_KINDS.JOB_DESCRIPTION) {
      return {
        ...none,
        text: kind === DOCUMENT_KINDS.RESUME
          ? `${file} looks like a candidate's resume. Post a job and HirePool will match candidates like this to it.`
          : `${file} doesn't look like a job description. 🤔 Upload a **job description** and I'll turn it into a job post.`,
        options: kind === DOCUMENT_KINDS.RESUME ? [{ id: 'prompt', icon: 'plus', title: 'Post a new job', subtitle: 'Create a job in a couple of steps', prompt: 'Post a new job' }] : []
      };
    }
    const job = extractJobFieldsFromDescription(text);
    const facts = [
      job.location && `- **Location:** ${job.location}${job.work_type ? ` · ${job.work_type}` : ''}`,
      Number.isInteger(job.years) && `- **Experience:** ${job.years}+ years`,
      job.skills.length && `- **Skills:** ${job.skills.slice(0, 6).join(', ')}`,
      job.employment_type && `- **Type:** ${job.employment_type}`
    ].filter(Boolean);
    return {
      kind,
      text: [
        `This is a job description${job.title ? ` for **${job.title}**` : ''}. 🏢${facts.length ? ' I pulled out:' : ''}`,
        ...facts
      ].join('\n'),
      options: [
        { id: 'create_job', icon: 'briefcase', title: 'Create this job', subtitle: 'Review card, then publish' },
        { id: 'edit_job', icon: 'edit', title: 'Edit details first', subtitle: 'Change anything before creating it' }
      ],
      data: { job, message: composeJobCreateMessage(job) }
    };
  }

  return { ...none, text: `I read ${file}.` };
}

/** The search to run for a resume: its title, else its main skill. */
export function resumeJobSearchCriteria(details) {
  const query = details?.title || details?.skills?.[0] || null;
  if (!query) return null;
  return { query, ...(details.location && details.location !== 'Remote' ? { location: details.location } : {}) };
}

/**
 * Build the visitor-facing reply.
 * @param {object} input
 * @param {string} input.kind
 * @param {string} input.filename
 * @param {string} input.text extracted text
 * @param {object|null} [input.jobResult] result of searchPublicHirePoolJobs (resumes only)
 * @param {boolean} [input.jobSearchFailed]
 * @returns {{ text: string, quickReplies: string[], signupRole: string|null }}
 */
export function buildWebsiteDocumentReply({ kind, filename, text, jobResult = null, jobSearchFailed = false }) {
  const file = `**${clean(filename, 60) || 'your document'}**`;

  if (kind === DOCUMENT_KINDS.RESUME) {
    const d = extractResumeDetails(text);
    const facts = [d.title, d.skills.slice(0, 3).join(', '), d.location, Number.isInteger(d.years) ? `${d.years} yrs` : null]
      .filter(Boolean).join(' · ');
    const intro = `Thanks! I read ${file}. It looks like ${d.name ? `**${d.name}**'s` : 'a'} resume${facts ? ` (${facts})` : ''}. 📄`;
    let jobs;
    if (jobResult) {
      jobs = formatPublicJobResults(jobResult);
    } else {
      jobs = [
        jobSearchFailed
          ? "I couldn't check HirePool's openings just now."
          : "I couldn't tell which role to search for from this resume.",
        '',
        'With a HirePool candidate account, AI matching shows you the roles that fit this profile as soon as they are posted. **Shall I create one for you now?**'
      ].join('\n');
    }
    return { text: `${intro}\n\n${jobs}`, quickReplies: ['Sign me up', 'Not now'], signupRole: 'candidate' };
  }

  if (kind === DOCUMENT_KINDS.JOB_DESCRIPTION) {
    const title = extractJobTitle(text);
    return {
      text: [
        `Thanks! I read ${file}. It looks like a **job description**${title ? ` for **${title}**` : ''}. 🏢`,
        '',
        'With a HirePool company account you can:',
        '- **Post this job** in a couple of minutes',
        '- **Get AI-matched candidates** ranked by skills and experience',
        '- **Screen applicants** with AI interviews and track them in one pipeline',
        '',
        '**Shall I create your company account now?**'
      ].join('\n'),
      quickReplies: ['Sign me up', 'How does hiring work?'],
      signupRole: 'client'
    };
  }

  if (kind === DOCUMENT_KINDS.CANDIDATE_LIST) {
    const people = new Set((String(text || '').match(EMAIL) || []).map(e => e.toLowerCase())).size;
    return {
      text: [
        `Thanks! I read ${file}. It looks like a **candidate list** from a staffing agency${people >= 2 ? ` (about **${people}** candidates)` : ''}. 🤝`,
        '',
        'With a HirePool consultancy account you can:',
        '- **Add your bench** and keep availability up to date',
        '- **Submit candidates** to open roles from hiring companies',
        '- **Track submissions and placements** in one dashboard',
        '',
        '**Shall I create your consultancy account now?**'
      ].join('\n'),
      quickReplies: ['Sign me up', 'How does it work for agencies?'],
      signupRole: 'consultancy'
    };
  }

  if (kind === DOCUMENT_KINDS.UNREADABLE) {
    return {
      text: [
        `I couldn't read any text in ${file}. It may be a scanned image or an empty file. 🙁`,
        '',
        'Please upload a text-based **PDF, DOCX or TXT**, for example a **resume**, a **job description**, or a **candidate list**.'
      ].join('\n'),
      quickReplies: [],
      signupRole: null
    };
  }

  return {
    text: [
      `I read ${file}, but it doesn't look related to hiring on HirePool. 🤔`,
      '',
      'I can help with documents like:',
      '- a **resume**: I\'ll find matching jobs on HirePool',
      '- a **job description**: I\'ll show you how to hire on HirePool',
      '- a **candidate list** from a staffing agency',
      '',
      'Please upload one of these, or ask me anything about HirePool.'
    ].join('\n'),
    quickReplies: ['How does HirePool work?'],
    signupRole: null
  };
}
