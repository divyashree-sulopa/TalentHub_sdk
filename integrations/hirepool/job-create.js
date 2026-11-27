/**
 * HirePool Employer Job Creation Workflow
 * Manages multi-turn job creation, field extraction, validation, and confirmation staging
 * for authenticated clients (employers/companies) via create_job_api_v1_jobs_post.
 */

import { validateJobCreation } from '../../backend/src/dynamic-api/schemas/hirepool-schemas.js';

const CANCEL_PATTERN = /^\s*(?:cancel|stop|never\s*mind|discard|quit|exit)\b(?:\s+(?:job\s+creation|job\s+posting|job|posting|creation))?[.!?]*$/i;
const CONFIRM_JOB_PATTERN = /^\s*(?:(?:please\s+)?(?:add|create|post|publish|submit|save)\s+(?:the\s+|this\s+)?job|confirm(?:\s+and\s+execute)?|looks?\s+good|create\s+it|post\s+it|add\s+it|publish\s+it|yes|proceed)\b[.!?]*$/i;

/**
 * Checks whether user message is initiating a job creation flow.
 */
export function isHirePoolJobCreateIntent(message) {
  if (!message || typeof message !== 'string') return false;
  const text = message.toLowerCase().trim();

  // Read-only or listing commands are NOT job creation
  if (/\b(?:view|show|get|list|display|see|check|track|what)\s+(?:my\s+|our\s+|all\s+)?jobs?\b/i.test(text)) return false;
  if (/^\s*(?:my|our|posted|active)\s+jobs?[.!?]*$/i.test(text)) return false;

  // Messages providing structured job fields (e.g. "Job Title - Full Stack Developer...")
  if (/^\s*(?:job\s+)?title\s*[:=\-–—]/i.test(text) || /\bjob\s+title\s*[:=\-–—]/i.test(text)) return true;

  return (
    /\b(?:create|post|publish|open|add|start|new)\s+(?:a\s+|an\s+|new\s+)?job(?:[_\s]+posting)?\b/i.test(text) ||
    /\b(?:post|create)\s+(?:a\s+)?(?:role|position|vacancy|opening)\b/i.test(text) ||
    /^\s*(?:create|post|add)\s+job[.!?]*$/i.test(text) ||
    /\bi\s+(?:want|need|would\s+like)\s+to\s+(?:create|post|publish|add)\s+(?:a\s+)?job\b/i.test(text) ||
    /\b(?:job\s+requirement|need\s+to\s+post\s+a\s+job|have\s+a\s+job\s+requirement)\b/i.test(text)
  );
}

/**
 * Extracts structured job fields from user natural language input.
 * Supports colons, equals, hyphens/dashes (-), and natural connective phrases.
 */
const JOB_FIELD_LABELS = [
  ['title', 'job\\s+title|title|job\\s+role|role|position'],
  ['description', 'job\\s+description|description|jd'],
  ['work_type', 'work\\s*type|work\\s*mode|remote\\s*type'],
  ['employment_type', 'employment\\s*type|job\\s*type'],
  ['location', 'job\\s+locations?|locations?|city'],
  ['experience', 'experience\\s+level|experience|seniority'],
  ['salary', 'salary\\s+range|salary|pay\\s+range|compensation|ctc|budget'],
  ['skills', 'required\\s+skills?|key\\s+skills?|skills?|tech\\s+stack|technologies'],
  ['openings', 'number\\s+of\\s+openings|openings?|vacancies'],
  ['department', 'department'],
  ['deadline', 'application\\s+deadline|deadline']
];
const JOB_LABEL_PATTERN = new RegExp(
  `(?:^|[\\s,;|•*-])(${JOB_FIELD_LABELS.map(([, alt]) => alt).join('|')})\\s*[:=]`,
  'gi'
);

/** The example text from our own prompt (or a template), not a real job description. */
export function isPlaceholderJobDescription(text) {
  const value = String(text || '').trim();
  return /\bdescribe\s+the\s+role\b|\bat\s+least\s+30\s+characters\b|\bresponsibilities\s+and\s+qualifications\s+for\s+this\s+role\b/i.test(value) ||
    /^(?:lorem\s+ipsum|tbd|tba|n\/?a|todo|to\s+be\s+(?:decided|added|updated)|description)\b[.!]?$/i.test(value);
}

/** "JavaScript, React.js, REST APIs, and Git." -> ["JavaScript", "React.js", "REST APIs", "Git"] */
function splitSkills(value) {
  // "…, and Git" / "React and Redux" (a plain list); "CI/CD" and "Sales and Marketing" stay whole
  // unless the list itself has no commas and reads "A and B".
  const text = String(value || '').replace(/,\s*(?:and|&)\s+/gi, ', ');
  const list = /[,;|•]/.test(text) ? text : text.replace(/\s+(?:and|&)\s+/gi, ', ');
  return list
    .split(/\s*[,;|•]\s*/)
    .map(s => s.trim().replace(/^(?:and|&)\s+/i, '').replace(/^[:"'-]+|["'-]+$|[.,;!?]+$/g, '').trim())
    .filter(s => s && s.length <= 60);
}

/**
 * "Job Title: X Job Description: Y Work Type: Z ..." (labels on one line or many):
 * each value runs until the next label. Returns null when fewer than two labels are used.
 */
function readLabeledJobFields(text) {
  const found = [...String(text || '').matchAll(JOB_LABEL_PATTERN)].map(match => {
    const labelText = match[1];
    const key = JOB_FIELD_LABELS.find(([, alt]) => new RegExp(`^(?:${alt})$`, 'i').test(labelText))?.[0];
    const start = match.index + match[0].indexOf(labelText);
    return { key, start, end: match.index + match[0].length };
  }).filter(item => item.key);
  if (found.length < 2) return null;
  const values = {};
  found.forEach((item, i) => {
    const next = found[i + 1];
    const value = text.slice(item.end, next ? next.start : undefined).replace(/^[\s:=-]+|[\s,;|•*-]+$/g, '').trim();
    if (value && !values[item.key]) values[item.key] = value;
  });
  return values;
}

export function extractJobFields(raw, existing = {}) {
  const text = String(raw || '').trim();
  const data = { ...existing };

  const labeled = readLabeledJobFields(text);
  if (labeled) {
    const clean = value => value.replace(/^[:"'-]+|["'-]+$/g, '').replace(/[.,;!?]+$/g, '').trim();
    if (labeled.title) data.title = clean(labeled.title);
    if (labeled.description) {
      const description = labeled.description.replace(/^[:"'-]+|["'-]+$/g, '').trim();
      if (isPlaceholderJobDescription(description)) {
        data.description_placeholder = true;
        delete data.description;
      } else {
        data.description = description;
        delete data.description_placeholder;
      }
    }
    const workType = labeled.work_type?.match(/\b(remote|hybrid|on[-\s]?site|office|in[-\s]?office|wfh|work\s+from\s+home)\b/i)?.[1];
    if (workType) {
      const val = workType.toLowerCase().replace(/[-_\s]/g, '');
      data.remote_type = ['office', 'inoffice', 'onsite'].includes(val) ? 'onsite' : (['wfh', 'workfromhome'].includes(val) ? 'remote' : val);
      data.work_type = data.remote_type;
    }
    const employment = labeled.employment_type?.match(/\b(permanent|contract(?:ual)?|full[-_\s]*time)\b/i)?.[1];
    if (employment) {
      const val = employment.toLowerCase().replace(/[-_\s]/g, '');
      data.employment_type = (val === 'fulltime' || val === 'permanent') ? 'permanent' : 'contract';
      data.job_type = data.employment_type === 'permanent' ? 'full_time' : 'contract';
    }
    if (labeled.location) {
      // "Bengaluru, Karnataka" is one place; "Bengaluru / Pune" or "Bengaluru and Pune" are two.
      const places = clean(labeled.location).split(/\s*(?:[;/|]|\band\b|&)\s*/i).map(clean).filter(Boolean);
      const usable = places.filter(p => !/^(?:remote|hybrid|on[-\s]?site|not\s+specified|n\/?a)$/i.test(p));
      if (usable.length) {
        data.locations = usable.slice(0, 10);
        data.location = usable[0];
      }
    }
    const experience = labeled.experience?.match(/\b(entry|junior|fresher|mid|intermediate|senior|lead|executive)\b/i)?.[1]?.toLowerCase();
    if (experience) {
      data.experience_level = ['entry', 'junior', 'fresher'].includes(experience) ? 'entry'
        : (['mid', 'intermediate'].includes(experience) ? 'mid' : (experience.startsWith('exec') ? 'executive' : experience));
    }
    const years = labeled.experience?.match(/(\d+)\s*(?:[-–—]|to)\s*(\d+)\s*(?:\+?\s*)?(?:years?|yrs?)/i);
    if (years) {
      data.experience_min = Number.parseInt(years[1], 10);
      data.experience_max = Number.parseInt(years[2], 10);
    }
    if (labeled.salary) data.salary = clean(labeled.salary);
    if (labeled.skills) {
      const skills = splitSkills(labeled.skills);
      if (skills.length) data.required_skills = skills;
    }
    const openings = labeled.openings?.match(/\d+/)?.[0];
    if (openings) data.number_of_openings = Number.parseInt(openings, 10);
    if (labeled.department) data.department = clean(labeled.department);
    const deadline = labeled.deadline?.match(/\d{4}-\d{2}-\d{2}/)?.[0];
    if (deadline) data.application_deadline = deadline;
    return data;
  }
  const sep = '(?:[:=]|\\s*[-–—]\\s+|\\s+(?:is|to|as)\\s+)';

  // 1. Job Title
  const titleMatch = text.match(new RegExp(`\\b(?:job\\s+)?title\\s*${sep}\\s*([^,;\\n.]+?)(?=\\s*(?:[.;]|\\n|\\b(?:work\\s*type|employment\\s*type|locations?|experience|salary|required\\s*skills?|skills?|openings?)\\b|$))`, 'i')) ||
    text.match(new RegExp(`\\b(?:role|position)\\s*${sep}\\s*([^,;\\n.]+?)(?=\\s*(?:[.;]|\\n|\\b(?:work\\s*type|employment\\s*type|locations?|experience|salary|required\\s*skills?|skills?|openings?)\\b|$))`, 'i')) ||
    text.match(/\b(?:for\s+the\s+role\s+(?:of\s+)?|role\s+)([A-Za-z0-9\s.+#-]{3,50}?(?:developer|engineer|manager|designer|architect|lead|analyst|specialist|consultant|director|administrator|officer))\b/i) ||
    text.match(/\b(?:create|post|add|open)\s+(?:a\s+|an\s+|new\s+)?(?:job\s+)?(?:for\s+)?(?:a\s+|an\s+)?([A-Za-z0-9\s.+#-]{3,50}?(?:developer|engineer|manager|designer|architect|lead|analyst|specialist|consultant|director|administrator|officer))\b/i);
  if (titleMatch?.[1]) {
    const cleaned = titleMatch[1].trim().replace(/^[:"'-]+|["'-]+$|[.,;!?]+$/g, '').trim();
    if (cleaned && !/^(?:a|an|the|new|job|role|position)$/i.test(cleaned)) {
      data.title = cleaned;
    }
  }

  // 2. Description
  const descMatch = text.match(new RegExp(`\\bdescription\\s*${sep}\\s*(.+?)(?=\\s*(?:\\n|\\b(?:locations?|work\\s*type|employment\\s*type|experience|salary|skills?|openings?|deadline)\\s*(?:[:=]|[-–—])|$))`, 'is'));
  if (descMatch?.[1]) {
    const cleaned = descMatch[1].trim().replace(/^[:"'-]+|["'-]+$|[.,;!?]+$/g, '').trim();
    if (isPlaceholderJobDescription(cleaned)) {
      data.description_placeholder = true;
    } else if (cleaned.length >= 20) {
      data.description = cleaned;
      delete data.description_placeholder;
    }
  } else if (!data.description && text.length >= 30 && !titleMatch && !/^\s*(?:location|work|salary|skills?|openings?)\s*[:=]/i.test(text)) {
    // If user typed a substantive paragraph after being prompted for description
    data.description = text.replace(/^[:"']+|["']+$|[.,;!?]+$/g, '').trim();
  }

  // 3. Work type (remote | hybrid | onsite)
  const workTypeMatch = text.match(new RegExp(`\\b(?:work\\s*(?:type|mode)|remote\\s*type)\\s*${sep}\\s*(remote|hybrid|onsite|on-site|office)\\b`, 'i')) ||
    text.match(/\b(remote|hybrid|onsite|on-site)\b/i);
  if (workTypeMatch?.[1]) {
    const val = workTypeMatch[1].toLowerCase().replace(/[-_\s]/g, '');
    data.remote_type = val === 'office' ? 'onsite' : val;
    data.work_type = data.remote_type;
  }

  // 4. Employment type (permanent | contract)
  const empMatch = text.match(new RegExp(`\\b(?:employment\\s*type|job\\s*type)\\s*${sep}\\s*(permanent|contract|full[-_\\s]*time)\\b`, 'i')) ||
    text.match(/\b(permanent|contract|full[-_\s]*time)\b/i);
  if (empMatch?.[1]) {
    const val = empMatch[1].toLowerCase().replace(/[-_\s]/g, '');
    data.employment_type = (val === 'fulltime' || val === 'permanent') ? 'permanent' : 'contract';
    data.job_type = data.employment_type === 'permanent' ? 'full_time' : 'contract';
  }

  // 5. Experience level (entry | mid | senior | lead | executive)
  const expMatch = text.match(new RegExp(`\\bexperience(?:\\s+level)?\\s*${sep}\\s*(entry|junior|fresher|mid|intermediate|senior|lead|executive)\\b`, 'i')) ||
    text.match(/\b(entry[-_\s]*level|junior|fresher|mid[-_\s]*level|senior|lead|executive)\b/i);
  if (expMatch?.[1]) {
    const rawExp = expMatch[1].toLowerCase();
    if (rawExp.includes('entry') || rawExp.includes('junior') || rawExp.includes('fresher')) data.experience_level = 'entry';
    else if (rawExp.includes('mid') || rawExp.includes('intermediate')) data.experience_level = 'mid';
    else if (rawExp.includes('senior')) data.experience_level = 'senior';
    else if (rawExp.includes('lead')) data.experience_level = 'lead';
    else if (rawExp.includes('exec')) data.experience_level = 'executive';
  }

  // 6. Location / Locations
  const locMatch = text.match(new RegExp(`\\b(?:locations?|city)\\s*${sep}\\s*([^,;\\n.]+?)(?=\\s*(?:[.;]|\\n|\\b(?:experience|salary|required\\s*skills?|skills?|openings?)\\b|$))`, 'i')) ||
    text.match(/\bin\s+([A-Z][a-zA-Z\s]{2,25}?)(?:,|\.|$|\s+(?:with|salary|hybrid|remote|onsite|full[-_\s]*time|permanent))/);
  if (locMatch?.[1]) {
    const cleaned = locMatch[1].trim().replace(/^[:"'-]+|["'-]+$|[.,;!?]+$/g, '').trim();
    if (cleaned && !['remote', 'hybrid', 'onsite', 'permanent', 'contract', 'full_time'].includes(cleaned.toLowerCase())) {
      data.locations = [cleaned];
      data.location = cleaned;
    }
  }

  // 7. Salary
  const salMatch = text.match(new RegExp(`\\b(?:salary(?:\\s+range)?|pay(?:\\s+range)?|compensation|ctc)\\s*${sep}?\\s*([^,;\\n]+?)(?=\\s*(?:\\.(?!\\d)|;|\\n|\\b(?:required\\s*skills?|skills?|openings?)\\b|$))`, 'i')) ||
    text.match(/\b(\d+(?:\.\d+)?\s*(?:[-–—]\s*\d+(?:\.\d+)?)?\s*(?:lpa|lakhs?|lacs?)(?:\s+inr)?)\b/i);
  if (salMatch?.[1]) {
    data.salary = salMatch[1].trim().replace(/^[:"'-]+|["'-]+$|[.,;!?]+$/g, '').trim();
  }

  // 8. Required Skills
  const skillsMatch = text.match(new RegExp(`\\b(?:required\\s+skills?|skills?|technologies|tech\\s+stack)\\s*${sep}\\s*([^;\\n]+)`, 'i'));
  if (skillsMatch?.[1]) {
    const rawSkills = splitSkills(skillsMatch[1]);
    if (rawSkills.length > 0) {
      data.required_skills = rawSkills;
    }
  }

  // 9. Department
  const deptMatch = text.match(new RegExp(`\\bdepartment\\s*${sep}\\s*([^,\\n;]+)`, 'i'));
  if (deptMatch?.[1]) {
    data.department = deptMatch[1].trim().replace(/^[:"'-]+|["'-]+$|[.,;!?]+$/g, '').trim();
  }

  // 10. Openings (Capture opening count e.g. 5 openings or "requirement for 5 candidates")
  const openingsMatch = text.match(new RegExp(`\\b(?:openings?|vacancies|number\\s+of\\s+openings)\\s*${sep}?\\s*(\\d+)\\b`, 'i')) ||
    text.match(/\b(?:requirement\s+for|need|hire|hiring)\s+(\d+)\s+(?:candidates?|engineers?|developers?|roles?|positions?)\b/i) ||
    text.match(/\b(\d+)\s+(?:openings?|vacancies|candidates?)\b/i);
  if (openingsMatch?.[1]) {
    data.number_of_openings = Number.parseInt(openingsMatch[1], 10);
  }

  // 11. Deadline
  const deadlineMatch = text.match(new RegExp(`\\b(?:deadline|application\\s+deadline)\\s*${sep}\\s*(\\d{4}-\\d{2}-\\d{2})`, 'i'));
  if (deadlineMatch?.[1]) {
    data.application_deadline = deadlineMatch[1].trim();
  }

  return data;
}

/**
 * Handles multi-turn Employer Job Creation.
 */
export async function handleHirePoolJobCreateTurn({
  message,
  session,
  authUser,
  stageJobConfirmation,
  cancelConfirmation
}) {
  const text = String(message || '').trim();
  const currentState = session?.hirePoolJobCreate || null;
  const isActive = Boolean(currentState?.active && !['completed', 'cancelled'].includes(currentState?.stage));
  const isIntent = isHirePoolJobCreateIntent(text);

  // If not active workflow and not job create intent, do not handle
  if (!isActive && !isIntent) {
    return { handled: false };
  }

  // Handle explicit cancellation
  if (isActive && CANCEL_PATTERN.test(text)) {
    if (currentState?.confirmationToken && typeof cancelConfirmation === 'function') {
      try {
        cancelConfirmation(currentState.confirmationToken);
      } catch {}
    }
    session.hirePoolJobCreate = {
      active: false,
      stage: 'cancelled',
      jobData: null,
      confirmationToken: null,
      updatedAt: new Date().toISOString()
    };
    return {
      handled: true,
      text: 'Okay — I cancelled the job creation workflow. No job was posted to HirePool.'
    };
  }

  // Extract fields from current turn and merge with existing job data
  const existingJobData = (isActive && currentState?.jobData) ? currentState.jobData : {};
  const mergedJobData = extractJobFields(text, existingJobData);

  // Validate current job data
  const validation = validateJobCreation(mergedJobData);

  // Check if user is confirming ("Add the job", "Post the job", "Confirm", "Yes")
  const isConfirming = CONFIRM_JOB_PATTERN.test(text);

  // If already awaiting confirmation and user says confirm
  if (currentState?.stage === 'awaiting_confirmation' && isConfirming && currentState?.confirmationToken) {
    return {
      handled: true,
      text: 'Please review the details in the card above and select **Confirm** to finalize and post this job to HirePool.',
      hostAction: currentState.hostAction || {
        id: currentState.confirmationToken,
        action: 'create_job_api_v1_jobs_post',
        title: 'Review Job Details',
        explanation: 'Review the job details and choose Confirm to publish to HirePool.',
        requiresConfirmation: true,
        confirmationToken: currentState.confirmationToken
      }
    };
  }

  // If valid job data and (user requested to add/create, or provided sufficient complete details)
  const hasMinimumRequirements = Boolean(
    mergedJobData.title &&
    mergedJobData.description &&
    mergedJobData.description.length >= 30
  );

  if (validation.isValid) {
    // Stage dynamic API confirmation for create_job_api_v1_jobs_post
    try {
      const staged = await stageJobConfirmation({
        body: validation.normalized
      });

      session.hirePoolJobCreate = {
        active: true,
        stage: 'awaiting_confirmation',
        jobData: validation.normalized,
        confirmationToken: staged.hostAction?.confirmationToken || null,
        hostAction: staged.hostAction || null,
        updatedAt: new Date().toISOString()
      };

      const locStr = Array.isArray(validation.normalized.locations) && validation.normalized.locations.length
        ? validation.normalized.locations.join(', ')
        : (validation.normalized.location || 'Not specified');
      const salaryStr = validation.normalized.salary_min && validation.normalized.salary_max
        ? `₹ ${Number(validation.normalized.salary_min).toLocaleString()} – ${Number(validation.normalized.salary_max).toLocaleString()} (${validation.normalized.pay_period || 'year'})`
        : (mergedJobData.salary || 'Not specified');
      const skillsStr = Array.isArray(validation.normalized.required_skills) && validation.normalized.required_skills.length
        ? validation.normalized.required_skills.join(', ')
        : 'Not specified';
      const workModeStr = validation.normalized.remote_type
        ? validation.normalized.remote_type.charAt(0).toUpperCase() + validation.normalized.remote_type.slice(1)
        : 'Not specified';
      const empTypeStr = validation.normalized.employment_type
        ? validation.normalized.employment_type.charAt(0).toUpperCase() + validation.normalized.employment_type.slice(1)
        : 'Not specified';
      const expLevelStr = validation.normalized.experience_level
        ? validation.normalized.experience_level.charAt(0).toUpperCase() + validation.normalized.experience_level.slice(1)
        : 'Not specified';

      const reviewMessage = [
        'I verified the job details according to HirePool specifications. Please review the details below before publishing:',
        `- **Job Title:** ${validation.normalized.title}`,
        `- **Job Description:** ${validation.normalized.description}`,
        `- **Number of Openings:** ${validation.normalized.number_of_openings || 1}`,
        `- **Work Mode:** ${workModeStr}`,
        `- **Employment Type:** ${empTypeStr}`,
        `- **Location:** ${locStr}`,
        `- **Experience Level:** ${expLevelStr}`,
        `- **Salary Range:** ${salaryStr}`,
        `- **Required Skills:** ${skillsStr}`,
        '',
        'Please review the details above and choose **Confirm** (or reply to confirm) to publish this job to HirePool.'
      ].join('\n');

      return {
        handled: true,
        text: reviewMessage,
        hostAction: staged.hostAction
      };
    } catch (err) {
      return {
        handled: true,
        text: `I could not stage the job creation: ${err?.message || 'Verification failed.'}`
      };
    }
  }

  // Update session state
  session.hirePoolJobCreate = {
    active: true,
    stage: 'collecting',
    jobData: mergedJobData,
    confirmationToken: null,
    updatedAt: new Date().toISOString()
  };

  // Build list of recorded fields
  const recorded = [];
  if (mergedJobData.title) recorded.push(`- **Job Title:** ${mergedJobData.title}`);
  if (mergedJobData.remote_type || mergedJobData.work_type) {
    const wt = mergedJobData.remote_type || mergedJobData.work_type;
    recorded.push(`- **Work Type:** ${wt.charAt(0).toUpperCase() + wt.slice(1)}`);
  }
  if (mergedJobData.employment_type) {
    const et = mergedJobData.employment_type;
    recorded.push(`- **Employment Type:** ${et.charAt(0).toUpperCase() + et.slice(1)}`);
  }
  if (mergedJobData.locations?.length || mergedJobData.location) {
    const loc = mergedJobData.locations?.length ? mergedJobData.locations.join(', ') : mergedJobData.location;
    recorded.push(`- **Location:** ${loc}`);
  }
  if (mergedJobData.experience_level) {
    const exp = mergedJobData.experience_level;
    recorded.push(`- **Experience Level:** ${exp.charAt(0).toUpperCase() + exp.slice(1)}`);
  }
  if (mergedJobData.salary) {
    recorded.push(`- **Salary Range:** ${mergedJobData.salary}`);
  }
  if (mergedJobData.required_skills?.length) {
    recorded.push(`- **Required Skills:** ${mergedJobData.required_skills.join(', ')}`);
  }
  if (mergedJobData.number_of_openings) {
    recorded.push(`- **Openings:** ${mergedJobData.number_of_openings}`);
  }

  // Check genuinely required missing fields
  const missingRequired = [];
  if (!mergedJobData.title) missingRequired.push('**Job Title** (e.g. Full Stack Developer)');
  if (mergedJobData.description_placeholder && !mergedJobData.description) {
    missingRequired.push('**Job Description**: what you sent is the example text. Please write what this person will do and what they need (a few lines is enough).');
  } else if (!mergedJobData.description || mergedJobData.description.length < 30) {
    missingRequired.push('**Job Description** (at least 30 characters describing the responsibilities and qualifications for this role)');
  }

  if (missingRequired.length > 0) {
    const lines = [];
    if (recorded.length > 0) {
      lines.push('I have recorded the following job details:', ...recorded, '');
      lines.push('Please provide the missing required information to proceed:', ...missingRequired.map(m => `- ${m}`));
    } else {
      lines.push(
        'I can help you create and publish a new job on HirePool. Please share the role details:',
        ...missingRequired.map(m => `- ${m}`),
        '- **Work Type** (Remote, Hybrid, or On-site)',
        '- **Employment Type** (Permanent or Contract)',
        '- **Location** (e.g. Bengaluru, Mumbai)',
        '- **Experience Level** (Entry, Mid, Senior, Lead, Executive)',
        '- **Salary Range** (e.g. 15-25 LPA INR)',
        '- **Required Skills** (e.g. JavaScript, React, Node.js)'
      );
    }
    return {
      handled: true,
      text: lines.join('\n')
    };
  }

  // If nothing substantial has been provided yet (just initial "Create a job")
  return {
    handled: true,
    text: [
      'I can help you create and publish a new job on HirePool. Please share the role details:',
      '- **Job Title** (e.g. Full Stack Developer)',
      '- **Job Description** (at least 30 characters)',
      '- **Work Type** (Remote, Hybrid, or On-site)',
      '- **Employment Type** (Permanent or Contract)',
      '- **Location** (e.g. Bengaluru, Mumbai)',
      '- **Experience Level** (Entry, Mid, Senior, Lead, Executive)',
      '- **Salary Range** (e.g. 15-25 LPA)',
      '- **Required Skills** (e.g. React, Node.js, PostgreSQL)'
    ].join('\n')
  };
}
