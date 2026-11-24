export const SERVER_DEFAULTS = {
  PORT: 3100,
  HOST: '0.0.0.0',
  NODE_ENV: 'development',
  RATE_LIMIT: {
    WINDOW_MS: 60 * 1000, // 1 minute
    MAX_REQUESTS: 60       // 60 requests per minute
  },
  SESSION: {
    TTL_MS: 2 * 60 * 60 * 1000, // 2 hours
    MAX_MESSAGES_IN_CONTEXT: 60
  },
  GEMINI: {
    DEFAULT_MODEL: 'gemini-flash-lite-latest',
    FALLBACK_MODEL: 'gemini-flash-lite-latest',
    TIMEOUT_MS: 30000,
    MAX_RETRIES: 2
  }
};

export const WIDGET_DEFAULTS = {
  name: 'HirePool Assistant',
  description: 'Your AI talent and recruitment assistant on HirePool',
  theme: 'auto',
  primaryColor: '#a3e635',
  position: 'bottom-right',
  greeting: 'Welcome to HirePool. Log in or sign up for account-specific job and application help.',
  suggestedPrompts: [
    'Log in to HirePool',
    'Sign up for HirePool',
    'Find matching jobs',
    'Explore HirePool'
  ],
  features: {
    streaming: true,
    summarization: true,
    copyResponse: true,
    clearHistory: true,
    markdown: true,
    structuredOutput: true
  }
};