/**
 * HirePool Consultancy Agency Candidate Bench Addition Workflow
 *
 * Implements conversational multi-turn bench candidate creation for authenticated
 * Recruitment Agency / Consultancy accounts via POST /api/v1/consultancies/candidates.
 * Never calls candidate self-registration or employer candidate APIs.
 */

import { validateCandidateCreation } from '../../backend/src/dynamic-api/schemas/hirepool-schemas.js';

const CANCEL_PATTERN = /^\s*(?:cancel|discard|abort|never\s*mind|stop)(?:\s+(?:candidate\s+addition|candidate|bench\s+addition|adding|bench))?\s*$/i;

const CANDIDATE_BENCH_TRIGGER_PATTERN = /\b(?:(?:add|create|register|onboard)\s+(?:a\s+)?(?:new\s+)?(?:bench\s+)?candidate|add\s+(?:this\s+)?(?:new\s+)?candidate\s+to\s+(?:my\s+|our\s+)?(?:bench|agency|pool|consultancy)|register\s+(?:a\s+)?(?:new\s+)?candidate\s+(?:under|to|in)\s+(?:my\s+|our\s+)?(?:consultancy|agency)|new\s+candidate\s+(?:on|for|to)\s+(?:bench|agency|pool))\b/i;

const CONFIRM_PATTERN = /^\s*(?:(?:please\s+)?(?:add|register|save|create|confirm)(?:\s+(?:the\s+|this\s+)?(?:new\s+)?candidate)?|confirm(?:\s+and\s+execute)?|looks?\s+good|add\s+it|save\s+it|register\s+it|proceed|yes)\b[.!?]*$/i;

const FIELD_LABELS = Object.freeze({
  first_name: 'First name',
  last_name: 'Last name',
  email: 'Email address',
  current_location: 'Location (city, country)',
  job_title: 'Job title / Specialization',
  skills: 'Skills',
  years_of_experience: 'Experience (years)',
  phone: 'Phone number',
  bench_status: 'Bench status',
  notice_period_days: 'Notice period (days)'
});

export function isHirePoolAgencyCandidateAddIntent(message, session, authUser) {
  if (authUser && authUser.role !== 'consultancy') return false;
  const text = String(message || '').trim();
  if (!text) return false;

  if (session?.consultancyCandidateDraft?.active) {
    if (/\b(?:dashboard|submissions?|placements?|agency\s+profile|consultancy\s+profile|my\s+profile|logout)\b/i.test(text) &&
        !/\b(?:candidate|email|phone|skills?|experience|name|location|title|bench)\b/i.test(text)) {
      return false;
    }
    return true;
  }

  if (CANDIDATE_BENCH_TRIGGER_PATTERN.test(text)) return true;

  // Labeled message starting with candidate details e.g. "Candidate Name: John Doe", "first_name: John", "Candidate: John", "name: adarsh"
  if (/^\s*(?:candidate(?:\s+(?:name|full\s+name))?|(?:first|full|last)?\s*name)\s*[:=\-–—]/i.test(text)) return true;
  if (/\b(?:candidate\s+name|candidate)\s*[:=\-–—]/i.test(text)) return true;
  if (/^\s*(?:name|first_name)\s*[:=\-–—].*@[a-z0-9.-]+\.[a-z]{2,}/i.test(text)) return true;
  if (/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/.test(text) &&
      /\b(?:engineer|developer|designer|analyst|manager|specialist|consultant|architect|lead|qa|tester|programmer|bengaluru|bangalore|mumbai|delhi|hyderabad|pune|chennai)\b/i.test(text)) {
    return true;
  }

  return false;
}

const NAME_STOPWORDS = new Set([
  'add', 'candidate', 'candidates', 'new', 'bench', 'update', 'edit', 'change', 'create', 'show', 'my', 'the',
  'please', 'cancel', 'help', 'agency', 'pool', 'details', 'name', 'email', 'register', 'save', 'confirm',
  'yes', 'no', 'ok', 'okay', 'to', 'a', 'an', 'list', 'view', 'remove', 'delete', 'submit', 'job', 'jobs'
]);

/**
 * True for text that can plausibly be a person's name: 1-4 words of letters
 * (with . ' -), no digits, no @, and no command words like "add candidate".
 */
export function isLikelyPersonName(text) {
  const value = String(text || '').trim().replace(/[,.;]+$/, '');
  if (!value || value.length > 80 || /[@\d:]/.test(value)) return false;
  const words = value.split(/\s+/);
  if (words.length < 1 || words.length > 4) return false;
  if (!words.every(word => /^[A-Za-z][A-Za-z.'-]*$/.test(word) && word.length <= 30)) return false;
  return !words.some(word => NAME_STOPWORDS.has(word.toLowerCase()));
}

function splitName(fullName) {
  const parts = String(fullName).trim().replace(/[,.;]+$/, '').split(/\s+/).filter(Boolean);
  const titleCase = w => w.charAt(0).toUpperCase() + w.slice(1);
  return { first: parts[0] ? titleCase(parts[0]) : '', last: parts.slice(1).map(titleCase).join(' ') };
}

const LOCATION_KEYWORDS = /\b(bengaluru|bangalore|mumbai|delhi(?:\s+ncr)?|hyderabad|pune|chennai|noida|gurgaon|gurugram|kolkata|ahmedabad|kochi|coimbatore|jaipur|chandigarh|london|new\s+york|san\s+francisco|singapore|berlin|toronto|dubai|remote)\b/i;
const EXPERIENCE_PATTERN = /\b(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)\b/i;

const COUNTRY_AFTER_CITY = /^\s*,?\s*(india|usa|us|united\s+states|uk|united\s+kingdom|uae|canada|germany|singapore|australia)\b/i;
const FIELD_LABEL_WORDS = String.raw`(?:first[\s_]name|last[\s_]name|full\s+name|(?:current\s+)?location|email(?:\s+address)?|job\s+title|experience|skills?|phone|bench\s+status|notice(?:\s+period)?)`;

/**
 * Make labelled replies easy to read: "Location (city, country) -bengaluru"
 * becomes "Location: bengaluru", and each label starts its own segment, so
 * "Last name - naidu Location - pune" reads as two fields.
 */
function normalizeLabelledText(raw) {
  let text = String(raw || '');
  // Drop hints in brackets after a label, e.g. "Location (city, country)".
  text = text.replace(new RegExp(String.raw`\b(${FIELD_LABEL_WORDS})\s*\([^)]*\)`, 'gi'), '$1');
  // "Label - value" / "Label -value" -> "Label: value"
  text = text.replace(new RegExp(String.raw`\b(${FIELD_LABEL_WORDS})\s*[-–—]\s*`, 'gi'), '$1: ');
  // A label in the middle of the line starts a new segment.
  text = text.replace(new RegExp(String.raw`([^,;\n])\s+(${FIELD_LABEL_WORDS})\s*:`, 'gi'), '$1; $2:');
  return text;
}

export function extractCandidateFields(message, currentDraft = {}) {
  const text = normalizeLabelledText(String(message || '').trim()).trim();
  const hasLabels = new RegExp(String.raw`\b${FIELD_LABEL_WORDS}\s*[:=]`, 'i').test(text);
  const fields = { ...(currentDraft || {}) };
  const labeledName = /(?:^|\n|[;,])\s*(?:candidate(?:\s+(?:full\s+)?name)?|(?:full|first|last)?\s*name)\s*[:=]/i.test(text);
  const sep = '(?:[:=]|\\s*[-–—]\\s+|\\s+(?:is|to|as)\\s+|\\s+)';
  const FIELD_BOUNDARY = '(?=(?:[,;]\\s*(?:job[\\s_]title|role|position|specialization|designation|(?:current[\\s_])?location|(?:technical[\\s_])?skills?|(?:years[\\s_]of[\\s_])?experience|exp|phone|mobile|email|bench[\\s_]status|notice(?:[\\s_]period)?)\\b)|$|[;\\n])';

  // 1. Full name or First / Last name
  const firstMatch = text.match(new RegExp(`(?:^|\\n|[;,])\\s*first[\\s_]name\\s*${sep}\\s*([^,;\\n]+)`, 'i'));
  if (firstMatch) fields.first_name = firstMatch[1].trim().replace(/\b[a-z]/g, l => l.toUpperCase());

  const lastMatch = text.match(new RegExp(`(?:^|\\n|[;,])\\s*last[\\s_]name\\s*${sep}\\s*([^,;\\n]+)`, 'i'));
  if (lastMatch) fields.last_name = lastMatch[1].trim().replace(/\b[a-z]/g, l => l.toUpperCase());

  // A labelled name ("Name: …") is an explicit correction and replaces the old one.
  if (labeledName && !firstMatch && !lastMatch) {
    delete fields.first_name;
    delete fields.last_name;
  }
  if (!fields.first_name || !fields.last_name) {
    const nameMatch = text.match(new RegExp(`(?:^|\\n|[;,])\\s*(?:candidate(?:\\s+(?:full\\s+)?name)?|(?:full|first)?\\s*name)\\s*${sep}\\s*([^,;\\n]+)`, 'i')) ||
      text.match(/\b(?:add|register)(?:\s+(?:a|this))?\s+(?:new\s+)?candidate(?:\s+to\s+(?:my\s+|our\s+)?(?:bench|agency|pool))?\s*[:\-–—]?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/i);
    if (nameMatch) {
      const parts = nameMatch[1].trim().split(/\s+/);
      if (parts.length >= 2) {
        fields.first_name = parts[0];
        fields.last_name = parts.slice(1).join(' ');
      } else if (parts.length === 1 && !fields.first_name) {
        fields.first_name = parts[0];
      }
    }
  }

  // 2. Email
  const emailMatch = text.match(new RegExp(`(?:^|\\n|[;,])\\s*email(?:\\s+address)?\\s*${sep}\\s*([^\\s,;\\n]+@[^\\s,;\\n]+)`, 'i')) ||
    text.match(/\b([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/);
  if (emailMatch) fields.email = emailMatch[1].trim().toLowerCase();

  // 3. Phone
  const phoneMatch = text.match(new RegExp(`(?:^|\\n|[;,])\\s*(?:phone|mobile|contact)(?:\\s+number)?\\s*${sep}\\s*([+0-9\\s-]{8,20})`, 'i')) ||
    text.match(/\b(?:\+?91[\s-]?)?([6-9]\d{9})\b/);
  if (phoneMatch) fields.phone = phoneMatch[1].trim();

  // 4. Job title / role / specialization
  const titleMatch = text.match(new RegExp(`(?:^|\\n|[;,])\\s*(?:job\\s+title|role|position|specialization|designation)\\s*${sep}\\s*([^,;\\n]+?)${FIELD_BOUNDARY}`, 'i'));
  if (titleMatch) {
    fields.job_title = titleMatch[1].trim();
  } else if (!fields.job_title) {
    // Guess from the text without the email, so "x@y.com data analyst" can't become "com data analyst".
    const textForTitle = text.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, ' , ');
    const roleMatch = textForTitle.match(/\b(software engineer|frontend developer|backend developer|full[\s-]?stack developer|data scientist|data engineer|devops engineer|product manager|ui[\s/]?ux designer|qa engineer|systems? engineer|cloud engineer|solutions? architect)\b/i) ||
      textForTitle.match(/\b((?:[A-Za-z]+[ \t]+){0,2}(?:engineer|developer|designer|architect|consultant|analyst|specialist|manager|lead))\b/i);
    if (roleMatch) {
      fields.job_title = roleMatch[1].trim();
    }
  }

  // 5. Current location
  const locMatch = text.match(new RegExp(`(?:^|\\n|[;,])\\s*(?:current\\s+)?location\\s*${sep}\\s*([^;\\n]+?)${FIELD_BOUNDARY}`, 'i')) ||
    text.match(/\b(?:based\s+in|located\s+in|living\s+in)\s+([A-Za-z\s,.-]+?)(?=[;\n]|$|\bwith\b|\band\b)/i);
  if (locMatch) {
    fields.current_location = locMatch[1].trim();
  } else if (!fields.current_location) {
    const locKeywords = /\b(bengaluru|bangalore|mumbai|delhi(?:\s+ncr)?|hyderabad|pune|chennai|noida|gurgaon|gurugram|kolkata|ahmedabad|london|new\s+york|san\s+francisco|singapore|berlin|toronto|remote)\b/i;
    const locKeywordMatch = text.match(locKeywords);
    if (locKeywordMatch) {
      const titleCase = value => value.replace(/\b\w/g, l => l.toUpperCase());
      const city = titleCase(locKeywordMatch[1].trim());
      // Keep a country typed after the city: "bengaluru, india" -> "Bengaluru, India".
      const country = text.slice(locKeywordMatch.index + locKeywordMatch[0].length).match(COUNTRY_AFTER_CITY);
      fields.current_location = country
        ? `${city}, ${country[1].length <= 3 ? country[1].toUpperCase() : titleCase(country[1].toLowerCase())}`
        : city;
    }
  }

  // 6. Experience
  const expMatch = text.match(new RegExp(`(?:^|\\n|[;,])\\s*(?:years\\s+of\\s+experience|experience|exp)\\s*${sep}\\s*(\\d+(?:\\.\\d+)?)\\s*(?:years?|\\+)?`, 'i')) ||
    text.match(/\b(\d+(?:\.\d+)?)\s*(?:\+?\s*years?(?:\s+of)?\s+experience)\b/i);
  if (expMatch) fields.years_of_experience = Math.round(Number.parseFloat(expMatch[1]));

  // 7. Skills
  const skillsMatch = text.match(new RegExp(`(?:^|\\n|[;,])\\s*(?:technical\\s+)?skills?\\s*${sep}\\s*([^;\\n]+?)${FIELD_BOUNDARY}`, 'i'));
  if (skillsMatch) {
    const rawSkills = skillsMatch[1].split(/[,;]|\s+and\s+/i).map(s => s.trim().replace(/[.]+$/, '')).filter(Boolean);
    if (rawSkills.length > 0) fields.skills = rawSkills;
  }

  // 8. Bench status
  const benchMatch = text.match(new RegExp(`(?:^|\\n|[;,])\\s*bench\\s+status\\s*${sep}\\s*(available|on_assignment|notice_period)\\b`, 'i')) ||
    text.match(/\b(available|on_assignment|notice_period)\b/i);
  if (benchMatch && ['available', 'on_assignment', 'notice_period'].includes(benchMatch[1].toLowerCase())) {
    fields.bench_status = benchMatch[1].toLowerCase();
  }

  // 9. Notice period
  const noticeMatch = text.match(new RegExp(`(?:^|\\n|[;,])\\s*notice(?:\\s+period)?\\s*${sep}\\s*(\\d+)\\s*(?:days?)?`, 'i')) ||
    text.match(/\b(\d+)\s*days?\s+notice\b/i);
  if (noticeMatch) fields.notice_period_days = Number.parseInt(noticeMatch[1], 10);

  // --- Unlabelled one-line details, e.g.
  // "divya shree divyashree@x.com software engineer bengaluru 1 year javascript, react, git"
  const emailAt = text.search(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  if (!labeledName && emailAt > 0) {
    const beforeEmail = text.slice(0, emailAt).replace(/[,;:\s]+$/, '').trim();
    if (isLikelyPersonName(beforeEmail)) {
      const { first, last } = splitName(beforeEmail);
      fields.first_name = first;
      if (last) fields.last_name = last;
      else delete fields.last_name;
    }
  }

  if (!expMatch) {
    const looseExp = text.match(EXPERIENCE_PATTERN);
    if (looseExp) fields.years_of_experience = Math.round(Number.parseFloat(looseExp[1]));
  }

  // Guessing skills from loose comma lists only makes sense for unlabelled one-liners.
  if (!skillsMatch && !hasLabels) {
    const parts = text.split(/[,;]/).map(p => p.trim()).filter(Boolean);
    if (parts.length >= 3) {
      const isOtherField = part => {
        const lower = part.toLowerCase();
        return /@/.test(part) ||
          EXPERIENCE_PATTERN.test(part) ||
          LOCATION_KEYWORDS.test(part) && part.split(/\s+/).length <= 2 ||
          (fields.job_title && lower === String(fields.job_title).toLowerCase()) ||
          (fields.first_name && lower === `${fields.first_name} ${fields.last_name || ''}`.trim().toLowerCase()) ||
          isLikelyPersonName(part) && part.split(/\s+/).length >= 2 && !/\b(?:js|sql|api|ui|ux)\b/i.test(part);
      };
      const skills = [];
      // The first chunk usually ends with the first skill ("… 1 year javascript").
      const firstWords = parts[0].split(/\s+/);
      const lead = firstWords[firstWords.length - 1];
      if (parts[0].split(/\s+/).length > 1 && lead && !/@/.test(lead) && !EXPERIENCE_PATTERN.test(lead) &&
          !LOCATION_KEYWORDS.test(lead) && !/^(?:years?|yrs?)$/i.test(lead)) {
        skills.push(lead);
      }
      for (const part of parts.slice(1)) {
        if (!isOtherField(part) && part.split(/\s+/).length <= 3) skills.push(part.replace(/[.]+$/, ''));
      }
      if (skills.length >= 2) fields.skills = [...new Set(skills)];
    }
  }

  // A guessed job title must not start with the candidate's own name.
  if (fields.job_title && (fields.first_name || fields.last_name)) {
    const nameWords = new Set(`${fields.first_name || ''} ${fields.last_name || ''}`.toLowerCase().split(/\s+/).filter(Boolean));
    const words = String(fields.job_title).split(/\s+/);
    while (words.length > 1 && nameWords.has(words[0].toLowerCase())) words.shift();
    fields.job_title = words.join(' ');
  }

  return fields;
}

export async function handleHirePoolAgencyCandidateAddTurn(optionsOrMessage, sessionParam, registryParam, authUserParam) {
  const opts = typeof optionsOrMessage === 'object' && optionsOrMessage !== null && !Array.isArray(optionsOrMessage) && 'session' in optionsOrMessage
    ? optionsOrMessage
    : { message: optionsOrMessage, session: sessionParam, registry: registryParam, authUser: authUserParam };

  const {
    message,
    session,
    registry,
    authUser,
    stageCandidateAddConfirmation,
    cancelConfirmation
  } = opts;

  const text = String(message || '').trim();

  // 1. Cancellation
  if (CANCEL_PATTERN.test(text)) {
    if (session?.consultancyCandidateDraft?.confirmationToken && cancelConfirmation) {
      try {
        await cancelConfirmation(session.consultancyCandidateDraft.confirmationToken);
      } catch {}
    }
    session.consultancyCandidateDraft = null;
    return {
      handled: true,
      text: 'I have cancelled the candidate addition. The draft was discarded without modifying your agency bench.'
    };
  }

  // 2. If awaiting confirmation and user affirms
  if (session?.consultancyCandidateDraft?.stage === 'awaiting_confirmation') {
    if (CONFIRM_PATTERN.test(text)) {
      return {
        handled: true,
        text: 'Please click the **Confirm** button on the candidate review card above to finalize adding this candidate to your agency bench.',
        hostAction: session.consultancyCandidateDraft.hostAction
      };
    }
  }

  const currentDraft = session?.consultancyCandidateDraft?.fields || {};
  const updatedFields = extractCandidateFields(text, currentDraft);

  // If user provided single answer to a previously prompted missing field
  const pendingPromptField = session?.consultancyCandidateDraft?.pendingField;
  if (pendingPromptField && !updatedFields[pendingPromptField]) {
    if (pendingPromptField === 'first_name' || pendingPromptField === 'last_name') {
      // Only something that looks like a name is accepted as a name
      // (never "add candidate" or a whole sentence of other details).
      // "naidu bengaluru, india": the name is what comes before the city.
      let nameText = text;
      if (!isLikelyPersonName(nameText)) {
        const lead = text.split(/[,;]/)[0];
        const city = lead.match(LOCATION_KEYWORDS);
        nameText = (city ? lead.slice(0, city.index) : lead).trim();
      }
      if (isLikelyPersonName(nameText)) {
        const { first, last } = splitName(nameText);
        if (pendingPromptField === 'last_name' && updatedFields.first_name && !last) {
          updatedFields.last_name = first;
        } else {
          updatedFields.first_name = first;
          if (last) updatedFields.last_name = last;
        }
      }
    } else if (pendingPromptField === 'email' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
      updatedFields.email = text.toLowerCase();
    } else if (pendingPromptField === 'job_title') {
      updatedFields.job_title = text;
    } else if (pendingPromptField === 'current_location') {
      updatedFields.current_location = text;
    }
  }

  // A draft name that isn't a real name (e.g. "add candidate") is dropped and asked again.
  if ((updatedFields.first_name || updatedFields.last_name) &&
      !isLikelyPersonName(`${updatedFields.first_name || ''} ${updatedFields.last_name || ''}`.trim())) {
    delete updatedFields.first_name;
    delete updatedFields.last_name;
  }

  // Check required fields
  const required = ['first_name', 'last_name', 'email', 'current_location', 'job_title'];
  const missing = required.filter(f => !updatedFields[f]);

  if (missing.length > 0) {
    const nextPending = missing[0];
    session.consultancyCandidateDraft = {
      active: true,
      stage: 'collecting',
      fields: updatedFields,
      pendingField: nextPending,
      updatedAt: new Date().toISOString()
    };

    const recorded = [];
    if (updatedFields.first_name && updatedFields.last_name) {
      recorded.push(`- **Candidate Name:** ${updatedFields.first_name} ${updatedFields.last_name}`);
    } else if (updatedFields.first_name) {
      recorded.push(`- **First name:** ${updatedFields.first_name}`);
    } else if (updatedFields.last_name) {
      recorded.push(`- **Last name:** ${updatedFields.last_name}`);
    }
    for (const [k, v] of Object.entries(updatedFields)) {
      if (k === 'first_name' || k === 'last_name') continue;
      if (v !== undefined && v !== null && v !== '' && (!Array.isArray(v) || v.length > 0)) {
        recorded.push(`- **${FIELD_LABELS[k] || k}:** ${Array.isArray(v) ? v.join(', ') : v}`);
      }
    }

    const promptMessage = recorded.length === 0
      ? 'I can help you add a candidate to your agency bench on HirePool. Please share the candidate\'s details:\n\n' +
        '- **Full Name** (First & Last)\n' +
        '- **Email address**\n' +
        '- **Job Title / Specialization**\n' +
        '- **Location** (City, Country)\n' +
        '- **Experience** (Years)\n' +
        '- **Skills** (comma-separated)\n' +
        '- **Bench Status** (Available / On Assignment / Notice Period)'
      : `I have recorded the following candidate details:\n${recorded.join('\n')}\n\n` +
        `Please provide the missing required information:\n` +
        missing.map(f => `- **${FIELD_LABELS[f] || f}**`).join('\n');

    return {
      handled: true,
      text: promptMessage
    };
  }

  // All required fields present: validate payload
  const validation = validateCandidateCreation(updatedFields);
  if (!validation.isValid) {
    session.consultancyCandidateDraft = {
      active: true,
      stage: 'collecting',
      fields: updatedFields,
      pendingField: validation.missingFields[0] || null,
      updatedAt: new Date().toISOString()
    };
    return {
      handled: true,
      text: validation.guidanceMessage || 'Please correct the candidate details before proceeding.'
    };
  }

  // Details changed after a review card was shown: retire the old confirmation.
  const previousToken = session?.consultancyCandidateDraft?.confirmationToken;
  if (previousToken && typeof cancelConfirmation === 'function') {
    try {
      await cancelConfirmation(previousToken);
    } catch {}
  }

  // Stage confirmation via stageCandidateAddConfirmation callback if provided
  let staged = null;
  if (typeof stageCandidateAddConfirmation === 'function') {
    try {
      staged = await stageCandidateAddConfirmation({ body: validation.normalized });
    } catch {
      // Keep everything collected so far and ask for a correction in plain words.
      session.consultancyCandidateDraft = {
        active: true,
        stage: 'collecting',
        fields: updatedFields,
        pendingField: null,
        updatedAt: new Date().toISOString()
      };
      return {
        handled: true,
        text: [
          "HirePool couldn't accept these candidate details yet. Please check them and send the corrections in one message, for example:",
          '',
          `*Name: ${updatedFields.first_name || 'First'} ${updatedFields.last_name || 'Last'}, Email: ${updatedFields.email || 'name@example.com'}, Job title: ${updatedFields.job_title || 'Software Engineer'}, Location: ${updatedFields.current_location || 'Bengaluru'}, Experience: ${updatedFields.years_of_experience ?? 0} years, Skills: ${(updatedFields.skills || []).join(', ') || 'React, Node.js'}*`,
          '',
          'Names should contain letters only, and the email must be a valid address. Nothing has been added to your bench.'
        ].join('\n')
      };
    }
  }

  session.consultancyCandidateDraft = {
    active: true,
    stage: 'awaiting_confirmation',
    fields: validation.normalized,
    confirmationToken: staged?.hostAction?.confirmationToken || null,
    hostAction: staged?.hostAction || null,
    pendingConfirmation: true,
    updatedAt: new Date().toISOString()
  };

  const reviewLines = [
    '### Review Candidate Bench Details',
    'Please review the candidate information before adding them to your agency bench on HirePool:',
    '',
    `- **Full Name:** ${validation.normalized.first_name} ${validation.normalized.last_name}`,
    `- **Email:** ${validation.normalized.email}`,
    `- **Phone:** ${validation.normalized.phone || 'Not provided'}`,
    `- **Job Title:** ${validation.normalized.job_title}`,
    `- **Location:** ${validation.normalized.current_location}`,
    `- **Experience:** ${validation.normalized.years_of_experience || 0} years`,
    `- **Bench Status:** ${validation.normalized.bench_status || 'available'}`,
    `- **Notice Period:** ${validation.normalized.notice_period_days !== null && validation.normalized.notice_period_days !== undefined ? `${validation.normalized.notice_period_days} days` : 'Not specified'}`,
    `- **Skills:** ${Array.isArray(validation.normalized.skills) && validation.normalized.skills.length > 0 ? validation.normalized.skills.join(', ') : 'None listed'}`,
    '',
    'Click **Confirm** below to save this candidate to your agency bench, or reply with changes if anything needs updating.'
  ];

  const response = {
    handled: true,
    text: reviewLines.join('\n')
  };

  if (staged?.hostAction) {
    // The review card lists every detail, so the message stays short (no duplicate list).
    const n = validation.normalized;
    response.text = [
      '### Review Candidate Bench Details',
      `Almost done! Check **${n.first_name} ${n.last_name}** (${n.job_title}, ${n.current_location}) in the card below.`,
      '',
      'Press **Confirm** to add them to your bench, or reply with any changes, for example *phone 9876543210* or *skills React, Node.js*.'
    ].join('\n');
    response.hostAction = staged.hostAction;
  } else if (registry) {
    const action = registry.list()?.find(a =>
      a.metadata?.dynamicApi?.operationId === 'add_candidate_api_v1_consultancies_candidates_post'
    );
    if (action) {
      response.action = {
        name: action.name,
        description: 'Add candidate to agency bench',
        arguments: {
          body: validation.normalized
        }
      };
    }
  }

  return response;
}