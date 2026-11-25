import { Router } from 'express';
import { getAssistantConfig } from '../../../config/assistant-presets.js';
import { AssistantConfigSchema } from '../../../config/schemas.js';
import { getHirePoolSurfaceConfig } from '../../../config/hirepool-surfaces.js';
import { getHirePoolAppLoginUrl, resolveAssistantSurface } from '../surface.js';

export const configRouter = Router();

/**
 * GET /api/config/:assistantId
 * Returns public widget configuration.
 * Strips sensitive server-side configurations (e.g., system instructions).
 * For the HirePool assistant, the website or in-app variant is chosen from the
 * request Origin, never from anything the client sends.
 */
configRouter.get('/:assistantId', (req, res, next) => {
  try {
    const { assistantId } = req.params;
    let rawConfig = getAssistantConfig(assistantId);

    if (rawConfig.assistantId === 'hirepool') {
      const surface = resolveAssistantSurface(req);
      const surfaceConfig = getHirePoolSurfaceConfig(surface);
      rawConfig = surfaceConfig
        ? {
            ...rawConfig,
            ...surfaceConfig,
            suggestedPrompts: [...surfaceConfig.suggestedPrompts],
            behavior: {
              ...surfaceConfig.behavior,
              ...(surfaceConfig.behavior.loginMode === 'redirect' ? { appLoginUrl: getHirePoolAppLoginUrl() } : {})
            }
          }
        : { ...rawConfig, surface };
    }

    // Validate and sanitize config
    const validated = AssistantConfigSchema.parse(rawConfig);

    // Explicitly omit internal server-only fields
    const { systemInstruction, ...publicConfig } = validated;

    // The response differs by Origin, so shared caches must key on it.
    res.setHeader('Vary', 'Origin');
    res.json({
      assistant: publicConfig
    });
  } catch (err) {
    next(err);
  }
});
