// HirePool AI Assistant Interactive Studio

const ROLE_DEFINITIONS = {
  guest: {
    badge: 'Visitor Mode',
    class: 'guest',
    desc: 'Public unauthenticated visitor. Exploring platform features, career opportunities, pricing, and onboarding guidance.',
    policy: 'Guest (Public APIs Only)'
  },
  candidate: {
    badge: 'Candidate Session',
    class: 'candidate',
    desc: 'Authenticated job seeker. Access to personalized job recommendations, CV upload, profile updates, and application status.',
    policy: 'Candidate Scoped (Jobs, Applications, Profiles)'
  },
  employer: {
    badge: 'Employer / Company Session',
    class: 'employer',
    desc: 'Authenticated company recruiter. Post new job listings, review applicants, update organization details, and access hiring dashboard.',
    policy: 'Employer Scoped (Job Management & Applicants)'
  },
  consultancy: {
    badge: 'Consultancy / Agency Session',
    class: 'consultancy',
    desc: 'Authenticated recruitment agency. Bench candidate registration, client job submissions, agency profile, and placement tracking.',
    policy: 'Agency Scoped (Bench & Submissions)'
  }
};

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const eventLog = document.getElementById('eventLog');
  const clearLogBtn = document.getElementById('clearLogBtn');

  const roleSelect = document.getElementById('roleSelect');
  const roleBadge = document.getElementById('roleBadge');
  const roleExplanation = document.getElementById('roleExplanation');
  const openapiRolePolicy = document.getElementById('openapiRolePolicy');
  const openapiOpsCount = document.getElementById('openapiOpsCount');
  const openapiOpsList = document.getElementById('openapiOpsList');
  const refreshOpenApiBtn = document.getElementById('refreshOpenApiBtn');

  const customPromptInput = document.getElementById('customPromptInput');
  const btnSendCustomPrompt = document.getElementById('btnSendCustomPrompt');

  // Check Backend Health
  async function checkHealth() {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const data = await res.json();
        statusDot.className = 'status-dot';
        statusText.textContent = `HirePool Gateway Online (${data.provider?.name || 'Local'}: ${data.provider?.model || 'active'})`;
      } else {
        throw new Error('Status ' + res.status);
      }
    } catch (err) {
      statusDot.className = 'status-dot error';
      statusText.textContent = 'HirePool Gateway Offline';
    }
  }
  checkHealth();
  setInterval(checkHealth, 20000);

  // Fetch and inspect Dynamic OpenAPI Catalog
  async function loadOpenApiCatalog() {
    if (!openapiOpsList) return;
    openapiOpsList.innerHTML = '<div style="color: #94a3b8; padding: 8px;">Discovering HirePool OpenAPI 3.1 endpoints...</div>';

    try {
      const res = await fetch('/api/openapi.json');
      if (!res.ok) throw new Error('Failed to load OpenAPI spec');
      const spec = await res.json();

      let opCount = 0;
      const opsHtml = [];

      if (spec.paths) {
        for (const [path, methods] of Object.entries(spec.paths)) {
          for (const [method, op] of Object.entries(methods)) {
            if (['get', 'post', 'put', 'delete', 'patch'].includes(method.toLowerCase())) {
              opCount++;
              const m = method.toLowerCase();
              const opId = op.operationId || `${m}_${path.replace(/[^a-zA-Z0-9]/g, '_')}`;
              const summary = op.summary || op.description || path;
              opsHtml.push(`
                <div class="openapi-op-item">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span class="openapi-method-pill ${m}">${m}</span>
                    <span style="color: #f8fafc; font-weight: 500;">${path}</span>
                  </div>
                  <div style="color: #94a3b8; font-size: 0.75rem;">${summary}</div>
                </div>
              `);
            }
          }
        }
      }

      openapiOpsCount.textContent = `${opCount} endpoints discovered`;
      openapiOpsList.innerHTML = opsHtml.join('') || '<div style="color: #94a3b8; padding: 8px;">No endpoints defined in spec.</div>';
    } catch (err) {
      openapiOpsCount.textContent = 'Error loading spec';
      openapiOpsList.innerHTML = `<div style="color: #f87171; padding: 8px;">Failed to discover OpenAPI spec: ${err.message}</div>`;
    }
  }
  loadOpenApiCatalog();
  if (refreshOpenApiBtn) {
    refreshOpenApiBtn.addEventListener('click', loadOpenApiCatalog);
  }

  // Event Log Helper
  function logEvent(name, data) {
    if (!eventLog) return;
    const time = new Date().toLocaleTimeString();
    const row = document.createElement('div');
    row.className = 'event-log-row';

    const timeSpan = document.createElement('span');
    timeSpan.className = 'event-log-time';
    timeSpan.textContent = `[${time}]`;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'event-log-name';
    nameSpan.textContent = name;

    const dataSpan = document.createElement('span');
    dataSpan.className = 'event-log-data';
    dataSpan.textContent = data ? (typeof data === 'string' ? data : JSON.stringify(data)) : '';

    row.appendChild(timeSpan);
    row.appendChild(nameSpan);
    row.appendChild(dataSpan);

    eventLog.appendChild(row);
    eventLog.scrollTop = eventLog.scrollHeight;
  }

  if (clearLogBtn) {
    clearLogBtn.addEventListener('click', () => {
      eventLog.innerHTML = '';
    });
  }

  // Attach SDK Listeners
  function attachSdkListeners() {
    if (!window.AssistantSDK) return;

    window.AssistantSDK.on('ready', (payload) => {
      logEvent('ready', { assistantId: payload.assistantId, theme: payload.theme });
    });

    window.AssistantSDK.on('open', () => {
      logEvent('open', 'Chat panel visible');
    });

    window.AssistantSDK.on('close', () => {
      logEvent('close', 'Chat panel hidden');
    });

    window.AssistantSDK.on('message:sent', (msg) => {
      logEvent('message:sent', { text: (msg.content || '').slice(0, 50) });
    });

    window.AssistantSDK.on('message:received', (msg) => {
      logEvent('message:received', { text: (msg.content || '').slice(0, 50) });
    });

    window.AssistantSDK.on('conversation:cleared', () => {
      logEvent('conversation:cleared', 'Session history reset');
    });

    window.AssistantSDK.on('error', (err) => {
      logEvent('error', { message: err.message });
    });
  }

  if (window.AssistantSDK) {
    attachSdkListeners();
  } else {
    window.addEventListener('load', attachSdkListeners);
  }

  // Role Simulation Switcher
  if (roleSelect) {
    roleSelect.addEventListener('change', (e) => {
      const selected = e.target.value;
      const roleDef = ROLE_DEFINITIONS[selected] || ROLE_DEFINITIONS.guest;

      roleBadge.textContent = roleDef.badge;
      roleBadge.className = `role-pill ${roleDef.class}`;
      roleExplanation.textContent = roleDef.desc;
      openapiRolePolicy.textContent = roleDef.policy;

      // Toggle prompt groups
      document.querySelectorAll('#quickPromptsContainer .prompt-group').forEach(group => {
        if (group.getAttribute('data-role') === selected) {
          group.style.display = 'block';
        } else {
          group.style.display = 'none';
        }
      });

      logEvent('role:switched', { role: selected, policy: roleDef.policy });

      // Update HirePool context if Bridge is active
      if (window.HirePoolBridge) {
        if (selected === 'guest') {
          window.HirePoolBridge.clearSession();
        } else {
          window.HirePoolBridge.setSession({
            token: `demo-simulated-${selected}-jwt`,
            user: {
              id: `user-${selected}-01`,
              role: selected,
              name: `Demo ${selected.charAt(0).toUpperCase() + selected.slice(1)}`
            }
          });
        }
      }
    });
  }

  // Programmatic SDK Control Buttons
  document.getElementById('btnOpen')?.addEventListener('click', () => {
    window.AssistantSDK?.open();
  });
  document.getElementById('btnClose')?.addEventListener('click', () => {
    window.AssistantSDK?.close();
  });
  document.getElementById('btnToggle')?.addEventListener('click', () => {
    window.AssistantSDK?.toggle();
  });
  document.getElementById('btnClearConvo')?.addEventListener('click', () => {
    window.AssistantSDK?.clearConversation();
  });

  // Theme Buttons
  document.getElementById('btnThemeLight')?.addEventListener('click', () => {
    window.AssistantSDK?.setTheme('light');
  });
  document.getElementById('btnThemeDark')?.addEventListener('click', () => {
    window.AssistantSDK?.setTheme('dark');
  });
  document.getElementById('btnThemeAuto')?.addEventListener('click', () => {
    window.AssistantSDK?.setTheme('auto');
  });

  // Preset Prompts
  document.querySelectorAll('.btn-prompt').forEach(btn => {
    btn.addEventListener('click', () => {
      const prompt = btn.getAttribute('data-prompt');
      if (prompt && window.AssistantSDK) {
        window.AssistantSDK.open();
        window.AssistantSDK.sendMessage(prompt);
      }
    });
  });

  // Custom Prompt Sender
  function sendCustom() {
    if (!customPromptInput) return;
    const text = customPromptInput.value.trim();
    if (!text) return;
    if (window.AssistantSDK) {
      window.AssistantSDK.open();
      window.AssistantSDK.sendMessage(text);
      customPromptInput.value = '';
    }
  }

  btnSendCustomPrompt?.addEventListener('click', sendCustom);
  customPromptInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendCustom();
    }
  });

  // Code Copy Buttons
  document.querySelectorAll('.code-copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const box = btn.closest('.code-box');
      const code = box.querySelector('pre') ? box.querySelector('pre').innerText : box.innerText;
      navigator.clipboard.writeText(code.replace('Copy', '').trim()).then(() => {
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
      });
    });
  });
});
