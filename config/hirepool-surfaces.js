/**
 * Per-surface presentation and behaviour for the HirePool assistant.
 * The server picks the surface from the request Origin (see backend/src/surface.js)
 * and merges the matching entry into the public widget config.
 */

export const HIREPOOL_WEBSITE_GREETING =
  "Hi there, welcome to HirePool! 👋 I'm here to help you find your way around. Whether you're looking for a job, hiring for your company, or placing candidates as an agency, I can explain how HirePool works and get you signed up in a couple of minutes.";

export const HIREPOOL_WEBSITE_TEASER = 'Hi! 👋 Need help getting started with HirePool?';

/**
 * First message when the website chat opens: a short hello and three role
 * cards (job seeker, company, agency). Tapping a card sends its prompt.
 */
export const HIREPOOL_WEBSITE_WELCOME = Object.freeze({
  message: [
    '👋 **Hi there, welcome to HirePool!**',
    "I'm your AI hiring assistant for jobs, hiring, and staffing. **What brings you here today?**"
  ].join('\n'),
  roleCards: Object.freeze([
    Object.freeze({ icon: 'briefcase', title: 'Find a job', subtitle: 'Openings that match you', prompt: "I'm looking for a job" }),
    Object.freeze({ icon: 'building', title: 'Hire talent', subtitle: 'Post jobs with AI screening', prompt: "I'm hiring for my company" }),
    Object.freeze({ icon: 'users', title: 'Staffing agency / Consultancy', subtitle: 'Place your bench faster', prompt: "I'm a staffing agency" })
  ]),
  quickReplies: Object.freeze(['How does HirePool work?', 'Just exploring HirePool'])
});

/** One friendly follow-up when the visitor has not replied for 30 seconds. */
export const HIREPOOL_WEBSITE_IDLE_NUDGES = Object.freeze({
  enabled: true,
  delayMs: 30000,
  maxConsecutive: 1,
  // No buttons here, so the welcome's own buttons stay on screen.
  afterWelcome: Object.freeze([
    Object.freeze({
      text: "I'm here whenever you're ready. You can ask me things like *How does AI job matching work?* or *How do I sign up?*"
    })
  ]),
  // Used when the assistant's last message asked the visitor a question.
  afterQuestion: Object.freeze([
    Object.freeze({
      text: 'If you prefer, I can first explain how HirePool works, or help you sign up right away.',
      quickReplies: Object.freeze(['How does HirePool work?', 'Sign up for HirePool'])
    }),
    Object.freeze({
      text: 'Whenever you are ready, just reply here and I will take it from there. 👋'
    })
  ]),
  afterAnswer: Object.freeze([
    Object.freeze({
      text: 'Did that help? 🙂 I can explain more, or get you signed up in a couple of minutes.',
      quickReplies: Object.freeze(['Sign up for HirePool', 'How does HirePool work?'])
    }),
    Object.freeze({
      text: 'Anything else you would like to know about HirePool? I am happy to help.',
      quickReplies: Object.freeze(['How does AI job matching work?', 'How do I sign up?'])
    }),
    Object.freeze({
      text: 'Would you like me to walk you through what HirePool offers for your role?',
      quickReplies: Object.freeze(["I'm looking for a job", "I'm hiring for my company", "I'm a staffing agency"])
    }),
    Object.freeze({
      text: 'Still here if you need me! 👋 Just type your question whenever you are ready.'
    })
  ])
});

const GENTLE_AFTER_QUESTION = Object.freeze([
  Object.freeze({ text: 'Whenever you are ready, just reply here. You can also say **Cancel** to do something else.' })
]);

/** Dashboard follow-ups after 30 quiet seconds, chosen for the signed-in user's role. */
export const HIREPOOL_APP_IDLE_NUDGES = Object.freeze({
  enabled: true,
  delayMs: 30000,
  maxConsecutive: 2,
  byRole: Object.freeze({
    candidate: Object.freeze({
      afterWelcome: Object.freeze([
        Object.freeze({
          text: 'Need a hand? I can find jobs that match your profile or check where your applications stand.',
          quickReplies: Object.freeze(['Find matching jobs', 'Show my applications', 'What is missing in my profile?'])
        }),
        Object.freeze({
          text: "I'm here whenever you need me. I can also update your skills or experience for better matches.",
          quickReplies: Object.freeze(['Update my skills', 'Show my profile'])
        })
      ]),
      afterAnswer: Object.freeze([
        Object.freeze({
          text: 'Anything else? I can look for jobs that match you or help you strengthen your profile.',
          quickReplies: Object.freeze(['Find matching jobs', 'Show my profile'])
        }),
        Object.freeze({
          text: 'Would you like me to check the status of your applications?',
          quickReplies: Object.freeze(['Show my applications'])
        })
      ]),
      afterQuestion: GENTLE_AFTER_QUESTION
    }),
    client: Object.freeze({
      afterWelcome: Object.freeze([
        Object.freeze({
          text: 'Need help with hiring today? I can show your jobs, review new applicants, or help you post a job.',
          quickReplies: Object.freeze(['Show my jobs', 'Review applications', 'Post a new job'])
        }),
        Object.freeze({
          text: "I'm here whenever you need me. I can also share your hiring dashboard numbers.",
          quickReplies: Object.freeze(['Show my dashboard'])
        })
      ]),
      afterAnswer: Object.freeze([
        Object.freeze({
          text: 'Anything else for your hiring? I can help you review applicants or post another job.',
          quickReplies: Object.freeze(['Review applications', 'Post a new job'])
        }),
        Object.freeze({
          text: 'Want a quick look at your hiring dashboard?',
          quickReplies: Object.freeze(['Show my dashboard'])
        })
      ]),
      afterQuestion: GENTLE_AFTER_QUESTION
    }),
    consultancy: Object.freeze({
      afterWelcome: Object.freeze([
        Object.freeze({
          text: 'Need help with your bench today? I can show open job opportunities, add a candidate, or submit candidates to jobs.',
          quickReplies: Object.freeze(['Show job opportunities', 'Show my candidates', 'Add a candidate'])
        }),
        Object.freeze({
          text: "I'm here whenever you need me. I can also share your placement stats.",
          quickReplies: Object.freeze(['Placement stats', 'Show my dashboard'])
        })
      ]),
      afterAnswer: Object.freeze([
        Object.freeze({
          text: 'Anything else? I can show open jobs your candidates could be submitted to.',
          quickReplies: Object.freeze(['Show job opportunities', 'Show my candidates'])
        }),
        Object.freeze({
          text: 'Would you like to see your placement stats?',
          quickReplies: Object.freeze(['Placement stats'])
        })
      ]),
      afterQuestion: GENTLE_AFTER_QUESTION
    })
  })
});

export const HIREPOOL_APP_GREETING =
  "Welcome back! I can help with your profile, jobs, and applications. What would you like to do?";

export const HIREPOOL_SURFACE_CONFIG = Object.freeze({
  website: Object.freeze({
    surface: 'website',
    name: 'HirePool Assistant',
    description: 'Friendly help to get started with HirePool',
    greeting: HIREPOOL_WEBSITE_GREETING,
    suggestedPrompts: Object.freeze([
      "I'm looking for a job",
      "I'm hiring for my company",
      "I'm a staffing agency",
      'How does HirePool work?',
      'Sign up for HirePool'
    ]),
    behavior: Object.freeze({
      autoOpen: Object.freeze({
        enabled: true,
        delayMs: 5000,
        mobile: 'bubble',
        teaser: HIREPOOL_WEBSITE_TEASER,
        snoozeHours: 24,
        excludedPaths: Object.freeze(['/privacy', '/terms'])
      }),
      signupEnabled: true,
      loginMode: 'redirect',
      welcome: HIREPOOL_WEBSITE_WELCOME,
      idleNudge: HIREPOOL_WEBSITE_IDLE_NUDGES
    })
  }),
  app: Object.freeze({
    surface: 'app',
    name: 'HirePool Assistant',
    description: 'Your HirePool account assistant',
    greeting: HIREPOOL_APP_GREETING,
    suggestedPrompts: Object.freeze([
      'Show my profile',
      'What is missing in my profile?',
      'Find matching jobs',
      'Show my applications'
    ]),
    behavior: Object.freeze({
      // Opened by the SDK only for a first dashboard visit or an incomplete profile,
      // after 30 seconds on the page (a greeting bubble on phones).
      autoOpen: Object.freeze({
        enabled: false,
        delayMs: 30000,
        mobile: 'bubble',
        teaser: 'Hi! 👋 Need help with your dashboard?',
        snoozeHours: 24
      }),
      // Open once, the first time a user reaches their dashboard in this browser (e.g. right after signup).
      firstVisitOpen: true,
      idleNudge: HIREPOOL_APP_IDLE_NUDGES,
      signupEnabled: false,
      loginMode: 'none'
    })
  })
});

/**
 * @param {'website'|'app'|'legacy'} surface
 * @returns {object|null}
 */
export function getHirePoolSurfaceConfig(surface) {
  return HIREPOOL_SURFACE_CONFIG[surface] || null;
}
