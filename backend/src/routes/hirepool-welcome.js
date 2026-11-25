import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { logRequestError } from '../middleware/logger.js';
import { createRequestActionRegistry, executeDynamicApiAction, executeDynamicApiRead } from '../dynamic-api/catalog.js';
import { getAssistantActionRegistry } from '../../../connectors/bridge.js';
import { ASSISTANT_SURFACES, resolveAssistantSurface } from '../surface.js';
import { buildAppWelcome } from '../../../integrations/hirepool/app-welcome.js';
import { validateCandidateCreation } from '../dynamic-api/schemas/hirepool-schemas.js';
import {
  buildProfileForm,
  buildProfileFormUpdates,
  describeChangedFields
} from '../../../integrations/hirepool/profile-form.js';

const PROFILE_WRITE_OPERATIONS = Object.freeze({
  candidate: { profile: 'update_my_profile_api_v1_candidates_profile_put' },
  client: {
    profile: 'update_company_profile_api_v1_clients_profile_put',
    user: 'update_my_user_profile_api_v1_clients_me_put'
  },
  consultancy: {
    profile: 'update_consultancy_profile_api_v1_consultancies_profile_put',
    user: 'update_my_user_profile_api_v1_consultancies_me_put'
  }
});

const PROFILE_FORM_TIMEOUT_MS = 15000;

const PROFILE_OPERATIONS = Object.freeze({
  candidate: { profile: 'get_my_profile_api_v1_candidates_profile_get' },
  client: {
    profile: 'get_my_company_profile_api_v1_clients_profile_get',
    userProfile: 'get_my_user_profile_api_v1_clients_me_get'
  },
  consultancy: {
    profile: 'get_my_consultancy_profile_api_v1_consultancies_profile_get',
    userProfile: 'get_my_user_profile_api_v1_consultancies_me_get'
  }
});

const WELCOME_READ_TIMEOUT_MS = 6000;

function isVerifiedHirePoolPrincipal(user) {
  return (
    user?.assistantId === 'hirepool' &&
    ['candidate', 'client', 'consultancy'].includes(user?.role) &&
    typeof user?.integrationSessionId === 'string'
  );
}

function findReadAction(registry, operationId) {
  return registry.list().find(action =>
    action.metadata?.dynamicApi?.operationId === operationId &&
    action.metadata?.dynamicApi?.method === 'GET'
  ) || null;
}

function findWriteAction(registry, operationId) {
  return registry.list().find(action =>
    action.metadata?.dynamicApi?.operationId === operationId &&
    action.metadata?.dynamicApi?.method !== 'GET'
  ) || null;
}

async function readOptional(registry, operationId, user, signal) {
  if (!operationId) return null;
  const action = findReadAction(registry, operationId);
  if (!action) return null;
  try {
    const data = await executeDynamicApiRead(action, {}, user, { signal });
    return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  } catch {
    // A missing profile (e.g. onboarding not finished) or a slow upstream must not block the greeting.
    return null;
  }
}

/**
 * In-app bot only: GET /api/hirepool/assistant/welcome?hour=0-23
 * Returns a personal greeting, role suggestions, and the next missing profile detail.
 * Identity comes from the server-verified session, never from the request.
 */
export function createHirePoolWelcomeRouter() {
  const router = Router();

  router.get('/welcome', authenticate(), async (req, res) => {
    const surface = resolveAssistantSurface(req);
    if (surface === ASSISTANT_SURFACES.WEBSITE) {
      return res.status(403).json({
        error: { code: 'SURFACE_NOT_ALLOWED', message: 'Account greetings are only available in the HirePool app.' }
      });
    }
    const user = req.user;
    if (!isVerifiedHirePoolPrincipal(user)) {
      return res.status(401).json({
        error: { code: 'AUTH_REQUIRED', message: 'A verified HirePool session is required.' }
      });
    }

    const rawHour = Number.parseInt(String(req.query.hour ?? ''), 10);
    const hour = Number.isInteger(rawHour) && rawHour >= 0 && rawHour <= 23 ? rawHour : undefined;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WELCOME_READ_TIMEOUT_MS);
    res.on('close', () => controller.abort());
    try {
      const registry = await createRequestActionRegistry(
        'hirepool',
        user,
        getAssistantActionRegistry('hirepool'),
        { signal: controller.signal }
      );
      const ops = PROFILE_OPERATIONS[user.role] || {};
      const [profile, userProfile] = await Promise.all([
        readOptional(registry, ops.profile, user, controller.signal),
        readOptional(registry, ops.userProfile, user, controller.signal)
      ]);
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ role: user.role, ...buildAppWelcome({ role: user.role, profile, userProfile, hour }) });
    } catch (error) {
      logRequestError(error, req);
      // Fall back to a generic greeting rather than failing the widget.
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ role: user.role, ...buildAppWelcome({ role: user.role, hour }) });
    } finally {
      clearTimeout(timeout);
    }
  });

  // In-app bot: the profile form (complete missing details, or edit everything).
  const guard = (req, res) => {
    if (resolveAssistantSurface(req) === ASSISTANT_SURFACES.WEBSITE) {
      res.status(403).json({ error: { code: 'SURFACE_NOT_ALLOWED', message: 'Profile editing is only available in the HirePool app.' } });
      return false;
    }
    if (!isVerifiedHirePoolPrincipal(req.user)) {
      res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Please log in to HirePool again to edit your profile.' } });
      return false;
    }
    return true;
  };

  const loadProfiles = async (req, signal) => {
    const user = req.user;
    const registry = await createRequestActionRegistry('hirepool', user, getAssistantActionRegistry('hirepool'), { signal });
    const ops = PROFILE_OPERATIONS[user.role] || {};
    const [profile, userProfile] = await Promise.all([
      readOptional(registry, ops.profile, user, signal),
      readOptional(registry, ops.userProfile, user, signal)
    ]);
    return { registry, profile, userProfile };
  };

  router.get('/profile-form', authenticate(), async (req, res) => {
    if (!guard(req, res)) return undefined;
    const mode = req.query.mode === 'missing' ? 'missing' : 'all';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROFILE_FORM_TIMEOUT_MS);
    res.on('close', () => controller.abort());
    try {
      const { profile, userProfile } = await loadProfiles(req, controller.signal);
      if (!profile && !userProfile) {
        return res.status(503).json({ error: { code: 'PROFILE_UNAVAILABLE', message: "I couldn't load your profile just now. Please try again in a moment." } });
      }
      res.setHeader('Cache-Control', 'no-store');
      return res.json(buildProfileForm(req.user.role, { profile, userProfile }, { mode }));
    } catch (error) {
      logRequestError(error, req);
      return res.status(503).json({ error: { code: 'PROFILE_UNAVAILABLE', message: "I couldn't load your profile just now. Please try again in a moment." } });
    } finally {
      clearTimeout(timeout);
    }
  });

  router.post('/profile-form', authenticate(), async (req, res) => {
    if (!guard(req, res)) return undefined;
    const user = req.user;
    const values = req.body?.values;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROFILE_FORM_TIMEOUT_MS);
    res.on('close', () => controller.abort());
    try {
      const { registry, profile, userProfile } = await loadProfiles(req, controller.signal);
      if (!profile && !userProfile) {
        return res.status(503).json({ error: { code: 'PROFILE_UNAVAILABLE', message: "I couldn't load your profile just now, so nothing was saved. Please try again." } });
      }
      const update = buildProfileFormUpdates(user.role, values, { profile, userProfile });
      if (!update.ok) {
        return res.status(422).json({ error: { code: 'INVALID_FIELDS', message: 'Please fix the highlighted fields.', fields: update.errors } });
      }
      if (!Object.keys(update.bodies).length) {
        return res.json({ saved: false, changed: [], message: 'Nothing changed, so there was nothing to save.' });
      }
      const ops = PROFILE_WRITE_OPERATIONS[user.role] || {};
      const failures = [];
      for (const [target, body] of Object.entries(update.bodies)) {
        const action = findWriteAction(registry, ops[target]);
        if (!action) {
          failures.push(target);
          continue;
        }
        try {
          // The user pressed Save on a form showing exactly these values: that is the approval.
          await executeDynamicApiAction(action, { body }, user, { signal: controller.signal, approved: true });
        } catch (error) {
          logRequestError(error, req);
          failures.push(target);
        }
      }
      const savedTargets = Object.keys(update.bodies).filter(t => !failures.includes(t));
      const savedKeys = savedTargets.flatMap(t => Object.keys(update.bodies[t]));
      const after = savedTargets.length ? await loadProfiles(req, controller.signal).catch(() => null) : null;
      const form = after ? buildProfileForm(user.role, { profile: after.profile, userProfile: after.userProfile }, { mode: 'missing' }) : null;
      if (failures.length && !savedTargets.length) {
        const message = failures.includes('profile') && user.role !== 'candidate'
          ? "I couldn't save these details. Only organisation admins can change the company or agency profile; your personal details can still be updated."
          : "I couldn't save your profile just now. Nothing was changed, please try again.";
        return res.status(502).json({ error: { code: 'SAVE_FAILED', message } });
      }
      res.setHeader('Cache-Control', 'no-store');
      return res.json({
        saved: true,
        changed: describeChangedFields(user.role, savedKeys),
        partial: failures.length > 0,
        message: failures.length
          ? 'Some details were saved, but the organisation profile could not be updated (only admins can change it).'
          : null,
        missingCount: form?.missingCount ?? null,
        completion: form?.completion ?? null
      });
    } catch (error) {
      logRequestError(error, req);
      return res.status(502).json({ error: { code: 'SAVE_FAILED', message: "I couldn't save your profile just now. Please try again." } });
    } finally {
      clearTimeout(timeout);
    }
  });

  // ---------------------------------------------------------------------------
  // Agency bot: resumes uploaded in the chat -> bench, and bench -> a job.
  // The user presses "Add N to my bench" / "Submit" on a card that lists exactly
  // what will be saved; that press is the approval for these writes.
  // ---------------------------------------------------------------------------
  const agencyGuard = (req, res) => {
    if (!guard(req, res)) return false;
    if (req.user.role !== 'consultancy') {
      res.status(403).json({ error: { code: 'ROLE_NOT_ALLOWED', message: 'Only agency accounts can manage a candidate bench.' } });
      return false;
    }
    return true;
  };

  const withRegistry = async (req, res, run) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROFILE_FORM_TIMEOUT_MS);
    res.on('close', () => controller.abort());
    try {
      const registry = await createRequestActionRegistry('hirepool', req.user, getAssistantActionRegistry('hirepool'), { signal: controller.signal });
      return await run(registry, controller.signal);
    } finally {
      clearTimeout(timeout);
    }
  };

  router.post('/bench-candidates', authenticate(), async (req, res) => {
    if (!agencyGuard(req, res)) return undefined;
    const validation = validateCandidateCreation(req.body?.candidate || {});
    if (!validation.isValid) {
      return res.status(422).json({
        status: 'needs_details',
        message: validation.guidanceMessage || 'Some required details are missing.',
        missing: validation.missingFields || []
      });
    }
    try {
      return await withRegistry(req, res, async (registry, signal) => {
        const action = findWriteAction(registry, 'add_candidate_api_v1_consultancies_candidates_post');
        if (!action) {
          return res.status(503).json({ status: 'failed', message: 'Adding candidates is unavailable right now.' });
        }
        const body = { ...validation.normalized };
        if (body.years_of_experience === undefined && body.experience_years !== undefined) body.years_of_experience = body.experience_years;
        delete body.experience_years;
        try {
          const data = await executeDynamicApiAction(action, { body }, req.user, { signal, approved: true });
          return res.json({
            status: 'added',
            id: data?.id || null,
            name: `${data?.first_name || body.first_name} ${data?.last_name || body.last_name}`.trim()
          });
        } catch (error) {
          const text = String(error?.message || '');
          if (error?.statusCode === 409 || /already\s+exists|duplicate/i.test(text)) {
            return res.json({ status: 'duplicate', message: 'Already on your bench.' });
          }
          logRequestError(error, req);
          return res.status(502).json({ status: 'failed', message: "HirePool couldn't add this candidate." });
        }
      });
    } catch (error) {
      logRequestError(error, req);
      return res.status(502).json({ status: 'failed', message: "HirePool couldn't add this candidate." });
    }
  });

  router.get('/agency-jobs', authenticate(), async (req, res) => {
    if (!agencyGuard(req, res)) return undefined;
    try {
      return await withRegistry(req, res, async (registry, signal) => {
        const action = findReadAction(registry, 'search_jobs_api_v1_jobs_search_get');
        if (!action) return res.status(503).json({ error: { code: 'JOBS_UNAVAILABLE', message: 'Open jobs are unavailable right now.' } });
        const data = await executeDynamicApiRead(action, { query: { page_size: 20 } }, req.user, { signal });
        const items = Array.isArray(data?.items) ? data.items : [];
        res.setHeader('Cache-Control', 'no-store');
        return res.json({
          jobs: items
            .filter(job => job?.id && job?.title)
            .map(job => ({
              id: String(job.id),
              title: String(job.title).slice(0, 120),
              company: job.company_name ? String(job.company_name).slice(0, 80) : null,
              location: Array.isArray(job.locations) ? job.locations.slice(0, 2).join(', ') : null
            }))
        });
      });
    } catch (error) {
      logRequestError(error, req);
      return res.status(502).json({ error: { code: 'JOBS_UNAVAILABLE', message: "I couldn't load open jobs just now. Please try again." } });
    }
  });

  router.post('/bench-submit', authenticate(), async (req, res) => {
    if (!agencyGuard(req, res)) return undefined;
    const jobId = typeof req.body?.jobId === 'string' ? req.body.jobId.trim() : '';
    const candidateIds = Array.isArray(req.body?.candidateIds)
      ? [...new Set(req.body.candidateIds.filter(id => typeof id === 'string' && id.trim()).map(id => id.trim()))].slice(0, 50)
      : [];
    if (!jobId || !candidateIds.length) {
      return res.status(422).json({ error: { code: 'INVALID_SUBMISSION', message: 'Choose a job and at least one candidate.' } });
    }
    try {
      return await withRegistry(req, res, async (registry, signal) => {
        const action = findWriteAction(registry, 'bulk_submit_consultancy_candidates_api_v1_applications_consultancy_submit_post');
        if (!action) return res.status(503).json({ error: { code: 'SUBMIT_UNAVAILABLE', message: 'Submitting candidates is unavailable right now.' } });
        const data = await executeDynamicApiAction(action, { body: { job_id: jobId, candidate_ids: candidateIds } }, req.user, { signal, approved: true });
        return res.json({ status: 'submitted', count: candidateIds.length, result: data && typeof data === 'object' ? data : null });
      });
    } catch (error) {
      logRequestError(error, req);
      return res.status(502).json({ error: { code: 'SUBMIT_FAILED', message: "HirePool couldn't submit these candidates. Nothing was sent; please try again." } });
    }
  });

  return router;
}
