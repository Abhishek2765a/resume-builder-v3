/**
 * ResumeCraft - Master Application Logic & Reactive Store
 */
import { INITIAL_DATA, SAMPLE_PRESETS, COLOR_PALETTES, COLOR_MOODS, RESUME_TEMPLATES, FONT_OPTIONS, ACTION_VERBS, SUMMARY_TEMPLATES } from './data.js';
import { generateResumeWebsiteHtml, renderCoverLetter, renderResume } from './templates.js';
import { analyzeBullet, calculateAtsScore, detectWeakPhrases } from './ats.js';
import { ApplicationDashboard } from './dashboard.js';
import { RESUME_SECTIONS, WorkspaceStorage } from './storage.js';

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const JOB_STOP_WORDS = new Set(
  'about after also and any are being can company could day each experience for from have into job just more most must our out per required role seeking should that the their them then this through under use using with will work years your'.split(' ')
);

const GEMINI_MODEL = 'gemini-2.5-flash';

class ResumeCraftApp {
  constructor() {
    this.storage = new WorkspaceStorage();
    this.dashboard = new ApplicationDashboard(this);
    this.zoomLevel = 0.85; // Default comfortable preview scale
    this.themeControlsInitialized = false;
    this.legacyResumeExists = this.storage.hasLegacyResume();
    const workspace = this.storage.loadWorkspace();
    this.masterState = workspace?.masterResume || this.storage.loadState();
    this.applications = workspace?.applications || [];
    this.notificationsEnabled = workspace?.notificationsEnabled === true;
    this.activeApplicationId = null;
    this.activePreviewDocument = 'resume';
    this.scanMode = false;
    this.state = this.cloneResume(this.masterState);
    this.previousAtsScore = calculateAtsScore(this.state).score;
    this.atsReadyCelebrated = false;
    this.currentTab = 'personal';
    this.coverLetterInputsBound = false;
    this.interviewPrepInputsBound = false;
    this.miniPreviewInteracted = false;
    this.history = [JSON.stringify(this.state)];
    this.historyIndex = 0;
    this.historyTimer = null;
    this.isRestoringHistory = false;

    this.init();
  }

  cloneResume(data) {
    return this.storage.normalizeState(JSON.parse(JSON.stringify(data)));
  }

  workspaceSnapshot() {
    return {
      masterResume: this.masterState,
      applications: this.applications,
      notificationsEnabled: this.notificationsEnabled
    };
  }

  saveWorkspace() {
    if (this.storage.writeWorkspace(this.workspaceSnapshot())) return true;
    const status = document.getElementById('save-status');
    if (status) {
      status.textContent = 'Local save failed';
      status.className = 'flex items-center gap-1.5 text-red-400';
    }
    this.showToast('Could not save this workspace. Export a backup and free browser storage.', 'warning');
    return false;
  }

  saveState() {
    if (!this.isRestoringHistory) this.scheduleHistorySnapshot();
    const activeApplication = this.activeApplicationId
      ? this.applications.find(application => application.id === this.activeApplicationId)
      : null;
    if (activeApplication) {
      activeApplication.resume = this.cloneResume(this.state);
      activeApplication.jobDescription = this.state.targetJobDescription;
    }
    else this.masterState = this.cloneResume(this.state);

    let saved = false;
    try {
      saved = this.saveWorkspace();
      if (saved) {
        this.saveIndicatorTimer?.();
        const status = document.getElementById('save-status');
        if (status) status.className = 'flex items-center gap-1.5';
      }
    } catch (e) {
      console.warn('Failed to save to localStorage:', e);
      const status = document.getElementById('save-status');
      if (status) {
        status.textContent = 'Local save failed';
        status.className = 'flex items-center gap-1.5 text-red-400';
      }
    }
    this.renderPreview();
    this.updateAtsScore();
    return saved;
  }

  scheduleHistorySnapshot() {
    window.clearTimeout(this.historyTimer);
    this.historyTimer = window.setTimeout(() => this.commitHistorySnapshot(), 600);
  }

  commitHistorySnapshot() {
    window.clearTimeout(this.historyTimer);
    this.historyTimer = null;
    const snapshot = JSON.stringify(this.state);
    if (snapshot === this.history[this.historyIndex]) return;

    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(snapshot);
    if (this.history.length > 50) this.history.shift();
    this.historyIndex = this.history.length - 1;
    this.updateHistoryControls();
  }

  resetHistory() {
    window.clearTimeout(this.historyTimer);
    this.historyTimer = null;
    this.history = [JSON.stringify(this.state)];
    this.historyIndex = 0;
    this.updateHistoryControls();
  }

  updateHistoryControls() {
    const undoButton = document.getElementById('btn-undo');
    const redoButton = document.getElementById('btn-redo');
    if (undoButton) undoButton.disabled = this.historyIndex <= 0;
    if (redoButton) redoButton.disabled = this.historyIndex >= this.history.length - 1;
  }

  setupHistoryControls() {
    document.getElementById('btn-undo')?.addEventListener('click', () => this.undo());
    document.getElementById('btn-redo')?.addEventListener('click', () => this.redo());
    this.updateHistoryControls();
  }

  undo() {
    window.clearTimeout(this.historyTimer);
    this.historyTimer = null;
    this.commitHistorySnapshot();
    if (this.historyIndex <= 0) return;
    this.restoreHistorySnapshot(this.historyIndex - 1);
  }

  redo() {
    window.clearTimeout(this.historyTimer);
    this.historyTimer = null;
    if (this.historyIndex >= this.history.length - 1) return;
    this.restoreHistorySnapshot(this.historyIndex + 1);
  }

  restoreHistorySnapshot(index) {
    const direction = index < this.historyIndex ? 'Change undone' : 'Change restored';
    this.isRestoringHistory = true;
    try {
      this.state = this.storage.normalizeState(JSON.parse(this.history[index]));
      this.historyIndex = index;
      this.renderSectionLayoutControls();
      const personal = this.state.personal;
      ['fullName', 'jobTitle', 'email', 'phone', 'location', 'website', 'linkedin', 'github', 'summary'].forEach(field => {
        const input = document.getElementById(`input-${field}`);
        if (input) input.value = personal[field] || '';
      });

      const photoPreview = document.getElementById('photo-avatar-preview');
      const photoInput = document.getElementById('photo-upload-input');
      if (photoPreview) {
        photoPreview.src = personal.photo || '';
        photoPreview.classList.toggle('hidden', !personal.photo);
      }
      if (photoInput) photoInput.value = '';
      this.refreshDynamicEditorLists();
      this.setupThemeControls();
      this.saveState();
      this.updateHistoryControls();
    } finally {
      this.isRestoringHistory = false;
    }
    this.showToast(direction);
  }

  refreshDynamicEditorLists() {
    this.renderExperienceList();
    this.renderEducationList();
    this.renderSkillsList();
    this.renderProjectsList();
    this.renderCertificationsList();
    this.renderLanguagesList();
    this.renderCustomSectionsList();
    const jobDescriptionInput = document.getElementById('input-job-description');
    if (jobDescriptionInput) jobDescriptionInput.value = this.state.targetJobDescription || '';
    this.updateJobMatch();
  }

  setupJobMatch() {
    const input = document.getElementById('input-job-description');
    if (!input) return;
    input.value = this.state.targetJobDescription || '';
    input.addEventListener('input', () => {
      this.state.targetJobDescription = input.value;
      this.saveState();
    });
    document.getElementById('btn-clear-job-description')?.addEventListener('click', () => {
      input.value = '';
      this.state.targetJobDescription = '';
      this.saveState();
      input.focus();
    });
    this.updateJobMatch();
  }

  setupSectionControls() {
    const list = document.getElementById('section-layout-list');
    if (!list || this.sectionControlsBound) return;
    list.addEventListener('click', event => {
      const button = event.target.closest('button[data-section-action]');
      if (!button) return;
      const sectionKey = button.dataset.sectionKey;
      if (!RESUME_SECTIONS.some(section => section.key === sectionKey)) return;

      const order = this.state.theme.sectionOrder;
      const index = order.indexOf(sectionKey);
      if (button.dataset.sectionAction === 'up' || button.dataset.sectionAction === 'down') {
        const nextIndex = index + (button.dataset.sectionAction === 'up' ? -1 : 1);
        if (index < 0 || nextIndex < 0 || nextIndex >= order.length) return;
        [order[index], order[nextIndex]] = [order[nextIndex], order[index]];
      } else if (button.dataset.sectionAction === 'visibility') {
        const hidden = new Set(this.state.theme.hiddenSections);
        if (hidden.has(sectionKey)) hidden.delete(sectionKey);
        else hidden.add(sectionKey);
        this.state.theme.hiddenSections = [...hidden];
      } else {
        return;
      }

      this.renderSectionLayoutControls();
      this.saveState();
    });
    this.sectionControlsBound = true;
    this.renderSectionLayoutControls();
  }

  renderSectionLayoutControls() {
    const list = document.getElementById('section-layout-list');
    if (!list || !this.state?.theme) return;
    const { sectionOrder, hiddenSections } = this.state.theme;
    list.innerHTML = sectionOrder.map((key, index) => {
      const section = RESUME_SECTIONS.find(item => item.key === key);
      if (!section) return '';
      const escapedKey = escapeHtml(section.key);
      const escapedLabel = escapeHtml(section.label);
      const hidden = hiddenSections.includes(key);
      const status = hidden ? 'Hidden' : 'Visible';
      return `
        <div class="section-layout-row flex items-center justify-between gap-2 rounded-lg border border-slate-700/70 bg-slate-900/60 px-3 py-2" data-section-key="${escapedKey}">
          <div class="min-w-0">
            <span class="block truncate text-xs font-medium text-slate-200">${escapedLabel}</span>
            <span class="text-2xs text-slate-500">${escapeHtml(status)}</span>
          </div>
          <div class="flex shrink-0 items-center gap-1">
            <button type="button" class="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-700 bg-slate-800 text-slate-300 transition hover:border-blue-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40" data-section-action="up" data-section-key="${escapedKey}" aria-label="${escapeHtml(`Move ${section.label} up`)}" title="Move up" ${index === 0 ? 'disabled' : ''}>↑</button>
            <button type="button" class="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-700 bg-slate-800 text-slate-300 transition hover:border-blue-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40" data-section-action="down" data-section-key="${escapedKey}" aria-label="${escapeHtml(`Move ${section.label} down`)}" title="Move down" ${index === sectionOrder.length - 1 ? 'disabled' : ''}>↓</button>
            <button type="button" class="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-2xs font-medium text-slate-300 transition hover:border-blue-500 hover:text-white" data-section-action="visibility" data-section-key="${escapedKey}" aria-pressed="${escapeHtml(String(hidden))}" aria-label="${escapeHtml(`${hidden ? 'Show' : 'Hide'} ${section.label}`)}">${escapeHtml(hidden ? 'Show' : 'Hide')}</button>
          </div>
        </div>`;
    }).join('');
  }

  updateJobMatch() {
    const scoreEl = document.getElementById('job-match-score');
    const summaryEl = document.getElementById('job-match-summary');
    const keywordsEl = document.getElementById('job-match-keywords');
    if (!scoreEl || !summaryEl || !keywordsEl) return;

    const description = (this.state.targetJobDescription || '').toLowerCase();
    const counts = new Map();
    const tokens = (description.match(/[a-z][a-z0-9+#.-]{2,}/g) || []).map(token => token.replace(/[.-]+$/, ''));
    tokens.forEach(token => {
      if (!JOB_STOP_WORDS.has(token)) counts.set(token, (counts.get(token) || 0) + 1);
    });
    const keywords = [...counts.keys()]
      .sort((a, b) => counts.get(b) - counts.get(a) || a.localeCompare(b))
      .slice(0, 30);

    if (description.trim().length < 40 || keywords.length < 3) {
      scoreEl.textContent = description.trim() ? 'Add more text' : 'Add a job post';
      summaryEl.textContent = 'Paste a job description (at least a few sentences) to compare key terms.';
      keywordsEl.replaceChildren();
      return;
    }

    const resumeText = JSON.stringify({
      personal: this.state.personal,
      experiences: this.state.experiences,
      education: this.state.education,
      skills: this.state.skills,
      projects: this.state.projects,
      certifications: this.state.certifications,
      languages: this.state.languages,
      customSections: this.state.customSections
    }).toLowerCase();
    const resumeTerms = new Set((resumeText.match(/[a-z][a-z0-9+#.-]{2,}/g) || []).map(term => term.replace(/[.-]+$/, '')));
    const matched = keywords.filter(keyword => resumeTerms.has(keyword));
    const missing = keywords.filter(keyword => !resumeTerms.has(keyword));
    const score = Math.round((matched.length / keywords.length) * 100);

    scoreEl.textContent = `${score}% match`;
    summaryEl.textContent = `${matched.length} of ${keywords.length} frequent job-post terms appear in your resume. Only add missing terms if they accurately describe your experience.`;
    keywordsEl.innerHTML = [
      ...matched.slice(0, 8).map(term => `<span class="keyword-chip keyword-chip-matched">✓ ${escapeHtml(term)}</span>`),
      ...missing.slice(0, 12).map(term => `<span class="keyword-chip">+ ${escapeHtml(term)}</span>`)
    ].join('');
  }

  setupAppearance() {
    try {
      this.appearance = this.storage.readAppearance() === 'dark' ? 'dark' : 'light';
    } catch (error) {
      console.warn('Could not read the appearance preference:', error);
      this.appearance = 'light';
    }

    const applyAppearance = () => {
      document.documentElement.classList.toggle('theme-light', this.appearance === 'light');
      document.documentElement.classList.toggle('theme-dark', this.appearance === 'dark');
      document.body.classList.toggle('theme-light', this.appearance === 'light');
      document.body.classList.toggle('theme-dark', this.appearance === 'dark');
      document.querySelectorAll('.theme-toggle').forEach(button => {
        const label = this.appearance === 'light' ? 'Dark mode' : 'Light mode';
        const icon = this.appearance === 'light' ? 'moon' : 'sun';
        button.innerHTML = `<i data-lucide="${icon}" class="ui-icon" aria-hidden="true"></i><span class="theme-toggle-label">${label}</span>`;
        button.setAttribute('aria-label', `Switch to ${this.appearance === 'light' ? 'dark' : 'light'} mode`);
      });
      this.initLucide();
    };

    applyAppearance();
    document.querySelectorAll('.theme-toggle').forEach(button => {
      button.addEventListener('click', () => {
        this.appearance = this.appearance === 'light' ? 'dark' : 'light';
        applyAppearance();
        try {
          this.storage.writeAppearance(this.appearance);
        } catch (error) {
          console.warn('Could not save the appearance preference:', error);
          this.showToast('Theme changed, but could not be saved in this browser.', 'warning');
        }
      });
    });
  }

  setupAiAssist() {
    document.querySelectorAll('[data-open-ai-settings]').forEach(button => {
      button.addEventListener('click', () => this.openAiSettings());
    });
    document.querySelectorAll('[data-close-ai-settings]').forEach(button => {
      button.addEventListener('click', () => this.closeAiSettings());
    });
    document.getElementById('ai-settings-form')?.addEventListener('submit', event => this.saveAiSettings(event));
    document.getElementById('btn-clear-ai-key')?.addEventListener('click', () => this.clearAiKey());
    document.getElementById('ai-settings-modal')?.addEventListener('click', event => {
      if (event.target.id === 'ai-settings-modal') this.closeAiSettings();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !document.getElementById('ai-settings-modal')?.classList.contains('hidden')) {
        this.closeAiSettings();
      }
    });
    document.getElementById('btn-ai-draft-cover-letter')?.addEventListener('click', event => {
      this.draftCoverLetter(event.currentTarget);
    });
    document.getElementById('btn-ai-improve-summary')?.addEventListener('click', event => {
      this.improveSummary(event.currentTarget);
    });
    document.getElementById('btn-ai-generate-mock-questions')?.addEventListener('click', event => {
      this.generateMockQuestions(event.currentTarget);
    });
    document.getElementById('btn-ai-draft-follow-up-email')?.addEventListener('click', event => {
      this.draftFollowUpEmail(event.currentTarget);
    });
    document.getElementById('btn-ats-ai-critique')?.addEventListener('click', event => {
      this.runAtsAiCritique(event.currentTarget);
    });
  }

  setupLanding() {
    document.querySelectorAll('[data-home]').forEach(link => {
      link.addEventListener('click', event => {
        event.preventDefault();
        this.showLanding();
      });
    });

    document.querySelectorAll('[data-landing-action]').forEach(button => {
      button.addEventListener('click', () => {
        if (button.dataset.landingAction === 'studio') this.dashboard.showDashboard();
        else {
          if (this.miniPreviewInteracted) {
            const template = document.querySelector('[data-mini-template].active')?.dataset.miniTemplate;
            const primaryColor = document.querySelector('[data-mini-color].active')?.dataset.miniColor;
            if (template && primaryColor) {
              this.state.theme.template = template;
              this.state.theme.primaryColor = primaryColor;
              this.setupThemeControls();
              this.saveState();
              this.renderPreview();
            }
          }
          this.miniPreviewInteracted = false;
          this.showEditor();
        }
      });
    });

    const miniPreview = document.querySelector('.landing-resume-preview');
    document.querySelectorAll('[data-mini-template]').forEach(button => {
      button.addEventListener('click', () => {
        const template = button.dataset.miniTemplate;
        if (!miniPreview || !template) return;
        this.miniPreviewInteracted = true;
        miniPreview.dataset.template = template;
        document.querySelectorAll('[data-mini-template]').forEach(option => {
          const active = option === button;
          option.classList.toggle('active', active);
          option.setAttribute('aria-pressed', String(active));
        });
      });
    });
    document.querySelectorAll('[data-mini-color]').forEach(button => {
      button.addEventListener('click', () => {
        const color = button.dataset.miniColor;
        if (!miniPreview || !color) return;
        this.miniPreviewInteracted = true;
        miniPreview.style.setProperty('--landing-accent', color);
        document.querySelectorAll('[data-mini-color]').forEach(option => {
          const active = option === button;
          option.classList.toggle('active', active);
          option.setAttribute('aria-pressed', String(active));
        });
      });
    });

    const landingPreviewCard = document.querySelector('.landing-preview-card');
    document.querySelectorAll('[data-landing-feature]').forEach(button => {
      button.addEventListener('click', () => {
        const feature = button.dataset.landingFeature;
        if (!landingPreviewCard || !['ats', 'job-match', 'ai'].includes(feature)) return;

        const nextFeature = landingPreviewCard.dataset.demoFeature === feature ? '' : feature;
        landingPreviewCard.dataset.demoFeature = nextFeature;
        document.querySelectorAll('[data-landing-feature]').forEach(option => {
          option.setAttribute('aria-pressed', String(nextFeature === option.dataset.landingFeature));
        });
        landingPreviewCard.querySelectorAll('[data-demo-panel]').forEach(panel => {
          panel.setAttribute('aria-hidden', String(panel.dataset.demoPanel !== nextFeature));
        });
      });
    });
  }

  openAiSettings() {
    const modal = document.getElementById('ai-settings-modal');
    const input = document.getElementById('gemini-api-key');
    const status = document.getElementById('ai-settings-status');
    this.aiSettingsReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    try {
      const apiKey = this.storage.getGeminiApiKey();
      if (input) input.value = apiKey;
      if (status) status.textContent = apiKey ? 'A key is saved in this browser.' : 'No key is saved. AI Assist is optional.';
    } catch (error) {
      console.warn('Could not read the Gemini API key:', error);
      if (input) input.value = '';
      if (status) status.textContent = 'Could not read the saved key from browser storage.';
      this.showToast('Could not read the Gemini key from browser storage.', 'warning');
    }
    modal?.classList.remove('hidden');
    input?.focus();
  }

  closeAiSettings() {
    document.getElementById('ai-settings-modal')?.classList.add('hidden');
    const input = document.getElementById('gemini-api-key');
    if (input) input.value = '';
    this.aiSettingsReturnFocus?.focus();
    this.aiSettingsReturnFocus = null;
  }

  saveAiSettings(event) {
    event.preventDefault();
    const input = document.getElementById('gemini-api-key');
    const status = document.getElementById('ai-settings-status');
    const apiKey = input?.value.trim() || '';
    if (!apiKey) {
      this.showToast('Paste a Gemini API key before saving.', 'warning');
      input?.focus();
      return;
    }
    try {
      this.storage.setGeminiApiKey(apiKey);
      if (status) status.textContent = 'Gemini key saved in this browser only.';
      this.closeAiSettings();
      this.showToast('Gemini API key saved locally.', 'success');
    } catch (error) {
      console.warn('Could not save the Gemini API key:', error);
      this.showToast('Could not save the Gemini key. Check browser storage availability.', 'warning');
    }
  }

  clearAiKey() {
    const input = document.getElementById('gemini-api-key');
    const status = document.getElementById('ai-settings-status');
    try {
      this.storage.clearGeminiApiKey();
      if (input) input.value = '';
      if (status) status.textContent = 'No key is saved. AI Assist remains optional.';
      this.showToast('Gemini API key cleared from this browser.', 'success');
    } catch (error) {
      console.warn('Could not clear the Gemini API key:', error);
      this.showToast('Could not clear the Gemini key from browser storage.', 'warning');
    }
  }

  getGeminiApiKeyForAction() {
    try {
      const apiKey = this.storage.getGeminiApiKey();
      if (apiKey) return apiKey;
    } catch (error) {
      console.warn('Could not read the Gemini API key:', error);
      this.showToast('Could not read the Gemini key from browser storage.', 'warning');
      return null;
    }
    this.showToast('Add a Gemini API key in AI Settings to use this feature.', 'warning');
    this.openAiSettings();
    return null;
  }

  async requestGeminiText(prompt, apiKey) {
    let response;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 60000);
    try {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.35, maxOutputTokens: 2048 }
        }),
        signal: controller.signal
      });
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('Gemini took too long to respond. Try again.');
      throw new Error(`Could not connect to Google Gemini${error?.message ? `: ${error.message}` : '.'}`);
    } finally {
      window.clearTimeout(timeout);
    }

    let result;
    try {
      result = await response.json();
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Gemini returned an unreadable response (HTTP ${response.status}).`);
      }
      throw error;
    }
    if (!response.ok) {
      throw new Error(result?.error?.message || `Gemini request failed (HTTP ${response.status}).`);
    }
    const text = result?.candidates?.[0]?.content?.parts
      ?.map(part => typeof part.text === 'string' ? part.text : '')
      .join('\n')
      .trim();
    if (!text) throw new Error('Gemini returned no text. Try again or use a shorter prompt.');
    return text.replace(/^```(?:[a-z]+)?\s*/i, '').replace(/\s*```$/, '').trim();
  }

  setAiButtonLoading(button, loading, label) {
    if (!button) return;
    button.disabled = loading;
    button.classList.toggle('ai-assist-loading', loading);
    if (loading) {
      button.dataset.idleLabel = button.textContent;
      button.textContent = label;
      button.setAttribute('aria-busy', 'true');
    } else {
      button.textContent = button.dataset.idleLabel || button.textContent;
      delete button.dataset.idleLabel;
      button.removeAttribute('aria-busy');
    }
  }

  setupCoverLetterEditor() {
    if (this.coverLetterInputsBound) return;
    const fields = [
      ['recipient', 'cover-letter-recipient'],
      ['date', 'cover-letter-date'],
      ['body', 'cover-letter-body']
    ];

    fields.forEach(([field, id]) => {
      document.getElementById(id)?.addEventListener('input', event => {
        const application = this.applications.find(item => item.id === this.activeApplicationId);
        if (!application) return;
        application.coverLetter[field] = event.target.value;
        if (this.saveWorkspace()) {
          this.saveIndicatorTimer?.();
          const status = document.getElementById('save-status');
          if (status) status.className = 'flex items-center gap-1.5';
        }
        this.renderPreview();
      });
    });
    this.coverLetterInputsBound = true;
  }

  setupInterviewPrepEditor() {
    if (this.interviewPrepInputsBound) return;
    const fields = [
      ['mockQuestions', 'interview-mock-questions'],
      ['starStories', 'interview-star-stories'],
      ['followUpEmail', 'interview-follow-up-email']
    ];

    fields.forEach(([field, id]) => {
      document.getElementById(id)?.addEventListener('input', event => {
        const application = this.applications.find(item => item.id === this.activeApplicationId);
        if (!application) return;
        if (!application.interviewPrep || typeof application.interviewPrep !== 'object') {
          application.interviewPrep = { mockQuestions: '', starStories: '', followUpEmail: '' };
        }
        application.interviewPrep[field] = event.target.value;
        if (this.saveWorkspace()) {
          this.saveIndicatorTimer?.();
          const status = document.getElementById('save-status');
          if (status) status.className = 'flex items-center gap-1.5';
        }
      });
    });
    this.interviewPrepInputsBound = true;
  }

  populateInterviewPrepForm() {
    const application = this.applications.find(item => item.id === this.activeApplicationId);
    const interviewPrep = application?.interviewPrep || {};
    const fields = [
      ['mockQuestions', 'interview-mock-questions'],
      ['starStories', 'interview-star-stories'],
      ['followUpEmail', 'interview-follow-up-email']
    ];
    fields.forEach(([field, id]) => {
      const input = document.getElementById(id);
      if (input) input.value = typeof interviewPrep[field] === 'string' ? interviewPrep[field] : '';
    });
  }

  async generateInterviewPrepText(field, button, prompt, loadingLabel, successMessage) {
    const application = this.applications.find(item => item.id === this.activeApplicationId);
    if (!application) {
      this.showToast('Open an application workspace before preparing for an interview.', 'warning');
      return;
    }
    if (!application.interviewPrep || typeof application.interviewPrep !== 'object') {
      application.interviewPrep = { mockQuestions: '', starStories: '', followUpEmail: '' };
    }
    const originalContent = application.interviewPrep[field] || '';
    const applicationId = application.id;
    const apiKey = this.getGeminiApiKeyForAction();
    if (!apiKey) return;

    this.setAiButtonLoading(button, true, loadingLabel);
    try {
      const draft = await this.requestGeminiText(prompt, apiKey);
      if (this.activeApplicationId !== applicationId ||
          !this.applications.some(item => item.id === applicationId)) {
        this.showToast('You switched workspaces. The interview prep draft was not applied.', 'warning');
        return;
      }
      const currentContent = application.interviewPrep[field] || '';
      if ((currentContent.trim() || currentContent !== originalContent) &&
          !window.confirm('Replace the current interview prep text with this draft? Your existing text will be lost.')) return;
      application.interviewPrep[field] = draft;
      const input = document.getElementById({
        mockQuestions: 'interview-mock-questions',
        followUpEmail: 'interview-follow-up-email'
      }[field]);
      if (input) input.value = draft;
      if (this.saveWorkspace()) {
        this.saveIndicatorTimer?.();
        const status = document.getElementById('save-status');
        if (status) status.className = 'flex items-center gap-1.5';
        this.showToast(successMessage, 'success');
      }
    } catch (error) {
      this.showToast(error.message || 'Could not generate interview prep text.', 'warning');
    } finally {
      this.setAiButtonLoading(button, false);
    }
  }

  async generateMockQuestions(button) {
    const application = this.applications.find(item => item.id === this.activeApplicationId);
    if (!application) {
      this.showToast('Open an application workspace before preparing for an interview.', 'warning');
      return;
    }
    const jobDescription = application.jobDescription || this.state.targetJobDescription || '';
    if (!jobDescription.trim()) {
      this.showToast('Add a job description to this application before generating questions.', 'warning');
      return;
    }
    const resumeText = this.buildAtsPlainText().slice(0, 20000);
    const prompt = [
      'Create 6–8 role-specific interview questions based on the job description and resume.',
      'Include a useful mix of technical or role-specific questions and behavioral questions.',
      'For each question, add one brief STAR preparation angle grounded only in the resume.',
      'Never invent candidate experience, achievements, skills, or metrics. If an angle is not supported by the resume, suggest what the candidate could honestly discuss instead.',
      'Return only a numbered list of questions, each followed by its brief STAR angle.',
      `Role: ${application.role}`,
      `Company: ${application.company}`,
      `Job description:\n${jobDescription.slice(0, 16000)}`,
      `Resume:\n${resumeText}`
    ].join('\n\n');
    await this.generateInterviewPrepText(
      'mockQuestions',
      button,
      prompt,
      'Generating…',
      'Mock questions generated. Review and personalize them.'
    );
  }

  async draftFollowUpEmail(button) {
    const application = this.applications.find(item => item.id === this.activeApplicationId);
    if (!application) {
      this.showToast('Open an application workspace before drafting a follow-up.', 'warning');
      return;
    }
    const prompt = [
      'Write a concise, professional recruiter follow-up or interview thank-you email.',
      'Use the company, role, and notes below where relevant. Do not invent interview details, promises, qualifications, or other facts; when details are missing, keep the wording warm and general.',
      'Return only the email, including a short subject line and sign-off placeholder.',
      `Company: ${application.company}`,
      `Role: ${application.role}`,
      `Application notes:\n${application.notes || '(No notes provided)'}`
    ].join('\n\n');
    await this.generateInterviewPrepText(
      'followUpEmail',
      button,
      prompt,
      'Drafting…',
      'Follow-up email drafted. Review it before sending.'
    );
  }

  async improveSummary(button) {
    const originalSummary = this.state.personal?.summary || '';
    if (!originalSummary.trim()) {
      this.showToast('Add a professional summary before using Improve.', 'warning');
      return;
    }
    const apiKey = this.getGeminiApiKeyForAction();
    if (!apiKey) return;
    const applicationId = this.activeApplicationId;
    const prompt = [
      'Rewrite the supplied resume professional summary as a tight executive summary of exactly 3 sentences.',
      'Use only facts supported by the resume. Never invent experience, seniority, skills, employers, achievements, or metrics. Keep the language specific and concise.',
      'Return only the 3-sentence summary, with no heading or commentary.',
      `Current summary:\n${originalSummary}`,
      `Resume context:\n${this.buildAtsPlainText().slice(0, 16000)}`
    ].join('\n\n');

    this.setAiButtonLoading(button, true, 'Improving…');
    try {
      const improved = await this.requestGeminiText(prompt, apiKey);
      if (this.activeApplicationId !== applicationId) {
        this.showToast('You switched resumes. The improved summary was not applied.', 'warning');
        return;
      }
      const currentSummary = this.state.personal?.summary || '';
      if (!window.confirm('Replace the current professional summary with this 3-sentence rewrite? You can undo the change afterward.')) return;
      this.commitHistorySnapshot();
      this.state.personal.summary = improved;
      const summaryInput = document.getElementById('input-summary');
      if (summaryInput) summaryInput.value = improved;
      const saved = this.saveState();
      this.commitHistorySnapshot();
      if (saved) {
        this.showToast(currentSummary === originalSummary
          ? 'Professional summary improved. Undo is available.'
          : 'Professional summary updated with the confirmed rewrite. Undo is available.', 'success');
      }
    } catch (error) {
      this.showToast(error.message || 'Could not improve the professional summary.', 'warning');
    } finally {
      this.setAiButtonLoading(button, false);
    }
  }

  async runAtsAiCritique(button) {
    const resumeText = this.buildAtsPlainText();
    if (!resumeText.trim()) {
      this.showToast('Add resume content before running an AI critique.', 'warning');
      return;
    }
    const apiKey = this.getGeminiApiKeyForAction();
    if (!apiKey) return;
    const result = document.getElementById('ats-ai-critique-result');
    if (result) {
      result.classList.add('hidden');
      result.replaceChildren();
    }
    const prompt = [
      'Critique this resume as an experienced recruiter and ATS reviewer.',
      'Return exactly 3 concise strengths, 3 specific gaps grounded in the resume, and 1 highest-impact rewrite suggestion.',
      'Use these exact section headings: STRENGTHS, SPECIFIC GAPS, HIGHEST-IMPACT REWRITE.',
      'Number the three strengths and three gaps. For the rewrite, provide the original resume phrase or section if available and a truthful revised version; never introduce unsupported facts, metrics, or experience.',
      `Resume plain text:\n${resumeText.slice(0, 24000)}`
    ].join('\n\n');

    this.setAiButtonLoading(button, true, 'Critiquing…');
    try {
      const critique = await this.requestGeminiText(prompt, apiKey);
      if (this.buildAtsPlainText() !== resumeText) {
        this.showToast('The resume changed while the critique was running. Run it again for the current version.', 'warning');
        return;
      }
      if (result) {
        const output = document.createElement('pre');
        output.className = 'whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-200';
        output.textContent = critique;
        result.replaceChildren(output);
        result.classList.remove('hidden');
      }
    } catch (error) {
      this.showToast(error.message || 'Could not critique this resume.', 'warning');
    } finally {
      this.setAiButtonLoading(button, false);
    }
  }

  async draftCoverLetter(button) {
    const application = this.applications.find(item => item.id === this.activeApplicationId);
    if (!application) {
      this.showToast('Open an application workspace before drafting a cover letter.', 'warning');
      return;
    }
    const jobDescription = application.jobDescription || this.state.targetJobDescription || '';
    if (!jobDescription.trim()) {
      this.showToast('Add a job post to this application before drafting a cover letter.', 'warning');
      return;
    }
    const apiKey = this.getGeminiApiKeyForAction();
    if (!apiKey) return;

    const originalBody = application.coverLetter.body || '';
    const resumeExperience = (this.state.experiences || [])
      .map(item => `${item.role || 'Role'} at ${item.company || 'Company'}\n${item.description || ''}`)
      .join('\n\n')
      .slice(0, 12000);
    const skills = (this.state.skills || [])
      .map(group => `${group.category || 'Skills'}: ${(Array.isArray(group.items) ? group.items : []).join(', ')}`)
      .join('\n')
      .slice(0, 4000);
    const prompt = [
      'Draft a concise, professional cover letter tailored to the job post below.',
      'Use only facts present in the resume context. Do not invent achievements, metrics, employers, qualifications, or experience.',
      'Make the letter specific to the role, about 3-4 short paragraphs, and return only the letter body without commentary or a subject line.',
      `Role: ${application.role}`,
      `Company: ${application.company}`,
      `Job post:\n${jobDescription.slice(0, 20000)}`,
      `Resume summary:\n${this.state.personal.summary || ''}`,
      `Relevant experience:\n${resumeExperience}`,
      `Skills:\n${skills}`
    ].join('\n\n');

    this.setAiButtonLoading(button, true, 'Drafting…');
    try {
      const draft = await this.requestGeminiText(prompt, apiKey);
      if (this.activeApplicationId !== application.id ||
          !this.applications.some(item => item.id === application.id)) {
        this.showToast('You switched workspaces. The draft was not applied.', 'warning');
        return;
      }
      const currentBody = application.coverLetter.body || '';
      if ((currentBody.trim() || currentBody !== originalBody) &&
          !window.confirm('Replace the current cover letter with this draft? Your existing text will be lost.')) return;
      application.coverLetter.body = draft;
      const bodyInput = document.getElementById('cover-letter-body');
      if (bodyInput) bodyInput.value = draft;
      if (this.saveWorkspace()) {
        this.renderPreview();
        this.showToast('Cover letter draft ready. Review it before sending.', 'success');
      }
    } catch (error) {
      this.showToast(error.message || 'Could not draft the cover letter.', 'warning');
    } finally {
      this.setAiButtonLoading(button, false);
    }
  }

  setupPreviewDocumentToggle() {
    const toggle = document.getElementById('preview-document-toggle');
    if (!toggle) return;
    toggle.addEventListener('click', event => {
      const button = event.target instanceof Element
        ? event.target.closest('button[data-preview-document]')
        : null;
      const documentType = button?.dataset.previewDocument;
      if (!button || !this.activeApplicationId ||
          !['resume', 'cover-letter'].includes(documentType)) return;
      this.activePreviewDocument = documentType;
      this.renderPreview();
    });
    this.syncPreviewDocumentToggle();
  }

  populateCoverLetterForm() {
    const application = this.applications.find(item => item.id === this.activeApplicationId);
    const coverLetter = application?.coverLetter || {};
    const recipient = document.getElementById('cover-letter-recipient');
    const date = document.getElementById('cover-letter-date');
    const body = document.getElementById('cover-letter-body');
    if (recipient) recipient.value = coverLetter.recipient || '';
    if (date) date.value = coverLetter.date || '';
    if (body) body.value = coverLetter.body || '';
  }

  updateCoverLetterTabVisibility() {
    const isApplication = this.applications.some(item => item.id === this.activeApplicationId);
    ['cover-letter', 'interview-prep'].forEach(tabName => {
      const tab = document.querySelector(`.editor-tab[data-tab="${tabName}"]`);
      const panel = document.getElementById(`tab-${tabName}`);
      tab?.classList.toggle('hidden', !isApplication);
      panel?.classList.toggle('hidden', !isApplication || this.currentTab !== tabName);
    });
    if (!isApplication && ['cover-letter', 'interview-prep'].includes(this.currentTab)) {
      document.querySelector('.editor-tab[data-tab="personal"]')?.click();
    }
  }

  syncPreviewDocumentToggle() {
    const toggle = document.getElementById('preview-document-toggle');
    const isApplication = this.applications.some(item => item.id === this.activeApplicationId);
    if (!isApplication) this.activePreviewDocument = 'resume';
    toggle?.classList.toggle('hidden', !isApplication);
    toggle?.classList.toggle('flex', isApplication);
    toggle?.querySelectorAll('button[data-preview-document]').forEach(button => {
      const active = button.dataset.previewDocument === this.activePreviewDocument;
      button.setAttribute('aria-pressed', String(active));
      button.classList.toggle('bg-violet-600', active);
      button.classList.toggle('text-white', active);
      button.classList.toggle('text-slate-300', !active);
    });
  }

  showEditor() {
    document.getElementById('landing-screen')?.classList.add('hidden');
    document.getElementById('dashboard-screen')?.classList.add('hidden');
    document.getElementById('app-header')?.classList.remove('hidden');
    document.getElementById('app-workspace')?.classList.remove('hidden');
    this.updateCoverLetterTabVisibility();
    this.syncPreviewDocumentToggle();
    this.dashboard.updateWorkspaceLabel();
  }

  showLanding() {
    document.getElementById('landing-screen')?.classList.remove('hidden');
    document.getElementById('dashboard-screen')?.classList.add('hidden');
    document.getElementById('app-header')?.classList.add('hidden');
    document.getElementById('app-workspace')?.classList.add('hidden');
  }

  openMasterResume() {
    this.activateWorkspace(null);
  }

  openApplicationResume(applicationId) {
    if (!this.applications.some(application => application.id === applicationId)) {
      this.showToast('That application workspace could not be found.', 'warning');
      this.dashboard.renderDashboard();
      return;
    }
    this.activateWorkspace(applicationId);
  }

  activateWorkspace(applicationId) {
    this.activeApplicationId = applicationId;
    this.activePreviewDocument = 'resume';
    const application = applicationId
      ? this.applications.find(item => item.id === applicationId)
      : null;
    this.state = this.cloneResume(application ? application.resume : this.masterState);
    this.history = [JSON.stringify(this.state)];
    this.historyIndex = 0;
    this.isRestoringHistory = false;
    window.clearTimeout(this.historyTimer);
    this.populateEditorForms();
    this.setupThemeControls();
    this.renderPreview();
    this.updateAtsScore();
    this.updateJobMatch();
    this.updateHistoryControls();
    this.showEditor();
  }

  async importWorkspaceFile(event) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    input.value = '';
    if (file.size > 10 * 1024 * 1024) {
      this.showToast('Workspace backup must be smaller than 10 MB.', 'warning');
      return;
    }
    try {
      const workspace = this.storage.parseWorkspaceBackup(await file.text());
      if (!window.confirm('Replace this browser’s Master resume and all application workspaces with the backup? This cannot be undone.')) return;
      this.masterState = workspace.masterResume;
      this.applications = workspace.applications;
      this.notificationsEnabled = workspace.notificationsEnabled;
      this.activeApplicationId = null;
      this.state = this.cloneResume(workspace.masterResume);
      if (!this.saveWorkspace()) return;
      this.storage.removeLegacyResume();
      this.history = [JSON.stringify(this.state)];
      this.historyIndex = 0;
      this.populateEditorForms();
      this.setupThemeControls();
      this.renderPreview();
      this.updateAtsScore();
      this.updateJobMatch();
      this.updateHistoryControls();
      this.dashboard.renderDashboard();
      this.showToast('Workspace backup imported', 'success');
    } catch (error) {
      console.warn('Failed to import workspace backup:', error);
      this.showToast(error instanceof SyntaxError ? 'The selected file is not valid JSON.' : error.message || 'Could not import this workspace.', 'warning');
    }
  }

  init() {
    this.setupAppearance();
    this.setupLanding();
    this.setupThemeControls();
    this.setupTemplateGallery();
    this.setupSectionControls();
    this.setupTabNavigation();
    this.setupCoverLetterEditor();
    this.setupInterviewPrepEditor();
    this.setupAiAssist();
    this.setupPreviewDocumentToggle();
    this.setupZoomControls();
    this.setupKeyboardShortcuts();
    this.setupHistoryControls();
    this.setupSaveIndicator();
    this.populateEditorForms();
    this.setupJobMatch();
    this.setupEventDelegation();
    this.setupAtsModal();
    this.setupExportImport();
    this.setupFileMenu();
    this.setupResumeWebsiteActions();
    this.dashboard.setup();
    this.renderPreview();
    this.updateAtsScore();
    this.initLucide();
    const persistence = this.storage.persistInitialWorkspace(this.workspaceSnapshot());
    if (persistence.saved) {
      const status = document.getElementById('save-status');
      if (status) {
        status.textContent = 'Auto-saved to local browser storage';
        status.className = 'flex items-center gap-1.5';
      }
    } else if (persistence.showFailureToast) {
      this.showToast('Could not save this workspace. Export a backup and free browser storage.', 'warning');
    }
    this.dashboard.updateWorkspaceLabel();
    this.showLanding();
  }

  initLucide() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  setupFileMenu() {
    const menu = document.querySelector('.file-menu');
    const trigger = menu?.querySelector('.file-menu-trigger');
    if (!menu || !trigger) return;

    menu.addEventListener('toggle', () => {
      trigger.setAttribute('aria-expanded', String(menu.open));
    });
    menu.addEventListener('click', event => {
      if (event.target.closest('button')) menu.open = false;
    });
    document.addEventListener('click', event => {
      if (menu.open && !menu.contains(event.target)) menu.open = false;
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && menu.open) {
        menu.open = false;
        trigger.focus();
      }
    });
  }

  setupResumeWebsiteActions() {
    const previewButton = document.getElementById('btn-preview-resume-website');
    const exportButton = document.getElementById('btn-export-resume-website');
    const createWebsiteBlobUrl = () => URL.createObjectURL(new Blob(
      [generateResumeWebsiteHtml(this.state)],
      { type: 'text/html;charset=utf-8' }
    ));

    previewButton?.addEventListener('click', () => {
      const blobUrl = createWebsiteBlobUrl();
      const previewWindow = window.open('about:blank', '_blank');
      if (!previewWindow) {
        URL.revokeObjectURL(blobUrl);
        this.showToast('Allow pop-ups to preview your resume website.', 'warning');
        return;
      }
      previewWindow.opener = null;
      previewWindow.location.href = blobUrl;
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
      this.showToast('Resume website preview opened', 'success');
    });

    exportButton?.addEventListener('click', () => {
      const blobUrl = createWebsiteBlobUrl();
      const downloadLink = document.createElement('a');
      downloadLink.href = blobUrl;
      downloadLink.download = 'portfolio.html';
      downloadLink.hidden = true;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      downloadLink.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      this.showToast('Portfolio.html downloaded', 'success');
    });
  }

  // ----------------------------------------------------
  // Live Preview Rendering & Typography
  // ----------------------------------------------------
  renderPreview() {
    const container = document.getElementById('resume-container');
    const paper = document.getElementById('resume-paper');
    if (!container || !paper) return;

    this.syncPreviewDocumentToggle();
    const application = this.applications.find(item => item.id === this.activeApplicationId);
    container.innerHTML = application && this.activePreviewDocument === 'cover-letter'
      ? renderCoverLetter(application.coverLetter, this.state)
      : renderResume(this.state);

    // Apply typography & spacing classes to paper
    const theme = this.state.theme || {};
    
    // Clear old font and spacing classes
    paper.className = 'resume-paper';
    
    // Add font family class
    const fontClass = `font-${(theme.fontFamily || 'Inter').replace(/\s+/g, '-')}`;
    paper.classList.add(fontClass);

    // Add font size class
    paper.classList.add(`font-size-${theme.fontSize || 'medium'}`);

    // Add spacing density class
    paper.classList.add(`spacing-${theme.spacing || 'normal'}`);
    paper.classList.toggle('scan-mode', this.scanMode);
    this.updateScanModeEmphasis();

    // Update zoom transform
    this.applyZoom();
  }

  updateScanModeEmphasis() {
    const container = document.getElementById('resume-container');
    if (!container) return;

    const emphasizedText = container.querySelectorAll('.scan-mode-body, .scan-mode-sharp');
    if (!this.scanMode) {
      emphasizedText.forEach(span => span.replaceWith(document.createTextNode(span.textContent)));
      return;
    }

    const treeWalker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (treeWalker.nextNode()) {
      const node = treeWalker.currentNode;
      const parent = node.parentElement;
      if (!parent || !node.nodeValue.trim() ||
          parent.closest('.scan-mode-body, .scan-mode-sharp, header, h1, h2, h3, h4, h5, h6, strong, b, time, .font-bold, .font-semibold, .font-medium, .custom-template-item-heading, .custom-template-item-meta, .developer-title, .executive-banner-title, .italic')) continue;
      if (!parent.closest('p, li')) continue;
      textNodes.push(node);
    }

    textNodes.forEach(node => {
      const fragment = document.createDocumentFragment();
      const parts = node.nodeValue.split(/(\$?\d+(?:,\d{3})*(?:\.\d+)?(?:\s?(?:%|M|k|x|ms|\+))?)/gi);
      parts.forEach(part => {
        if (!part) return;
        const span = document.createElement('span');
        span.className = /^\$?\d/.test(part) ? 'scan-mode-sharp' : 'scan-mode-body';
        span.textContent = part;
        fragment.appendChild(span);
      });
      node.replaceWith(fragment);
    });
  }

  applyZoom() {
    const wrapper = document.getElementById('resume-paper-wrapper');
    if (wrapper) {
      wrapper.style.transform = `scale(${this.zoomLevel})`;
    }
    const zoomText = document.getElementById('zoom-percentage');
    if (zoomText) {
      zoomText.textContent = `${Math.round(this.zoomLevel * 100)}%`;
    }
  }

  showToast(message, tone = 'neutral') {
    const stack = document.getElementById('toast-stack');
    if (!stack) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    if (tone === 'success') toast.style.borderColor = 'rgba(16, 185, 129, 0.55)';
    if (tone === 'warning') toast.style.borderColor = 'rgba(245, 158, 11, 0.55)';
    stack.appendChild(toast);
    window.setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(6px)';
      toast.style.transition = 'all 0.2s ease';
      window.setTimeout(() => toast.remove(), 220);
    }, 2800);
  }

  setupSaveIndicator() {
    let saveTimer = null;
    this.saveIndicatorTimer = () => {
      const status = document.getElementById('save-status');
      if (!status) return;
      status.textContent = 'Saving changes...';
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        status.textContent = 'All changes saved';
      }, 450);
    };
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (event) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === 'z') {
        event.preventDefault();
        if (event.shiftKey) this.redo();
        else this.undo();
        return;
      }
      if (key === 'y') {
        event.preventDefault();
        this.redo();
        return;
      }
      if (key === 'p') {
        event.preventDefault();
        window.print();
      }
      if (key === 's') {
        event.preventDefault();
        document.getElementById('btn-export-json')?.click();
      }
    });
  }

  setupZoomControls() {
    const scanModeButton = document.getElementById('btn-scan-mode');
    scanModeButton?.setAttribute('aria-pressed', String(this.scanMode));
    scanModeButton?.addEventListener('click', () => {
      this.scanMode = !this.scanMode;
      scanModeButton.setAttribute('aria-pressed', String(this.scanMode));
      document.getElementById('resume-paper')?.classList.toggle('scan-mode', this.scanMode);
      this.updateScanModeEmphasis();
    });

    document.getElementById('zoom-in-btn')?.addEventListener('click', () => {
      this.zoomLevel = Math.min(1.4, this.zoomLevel + 0.1);
      this.applyZoom();
    });

    document.getElementById('zoom-out-btn')?.addEventListener('click', () => {
      this.zoomLevel = Math.max(0.4, this.zoomLevel - 0.1);
      this.applyZoom();
    });

    document.getElementById('zoom-fit-btn')?.addEventListener('click', () => {
      const viewport = document.getElementById('preview-viewport');
      if (viewport) {
        // 210mm in pixels at 96dpi is ~794px + padding
        const viewportWidth = viewport.clientWidth - 48;
        this.zoomLevel = Math.min(1.0, Math.max(0.4, viewportWidth / 820));
        this.applyZoom();
      }
    });

    // Mobile View Toggle Tabs
    const mobileTabEditor = document.getElementById('mobile-tab-editor');
    const mobileTabPreview = document.getElementById('mobile-tab-preview');
    const editorPanel = document.getElementById('editor-panel');
    const previewViewport = document.getElementById('preview-viewport');

    mobileTabEditor?.addEventListener('click', () => {
      editorPanel.classList.remove('hidden');
      previewViewport.classList.add('hidden');
      mobileTabEditor.classList.add('bg-blue-600', 'text-white');
      mobileTabPreview.classList.remove('bg-blue-600', 'text-white');
    });

    mobileTabPreview?.addEventListener('click', () => {
      editorPanel.classList.add('hidden');
      previewViewport.classList.remove('hidden');
      mobileTabPreview.classList.add('bg-blue-600', 'text-white');
      mobileTabEditor.classList.remove('bg-blue-600', 'text-white');
      // Trigger fit
      document.getElementById('zoom-fit-btn')?.click();
    });

    const syncDesktopLayout = () => {
      if (window.innerWidth >= 1024 && editorPanel && previewViewport) {
        editorPanel.classList.remove('hidden');
        previewViewport.classList.remove('hidden');
      }
    };
    window.addEventListener('resize', syncDesktopLayout);
    syncDesktopLayout();

    document.getElementById('preview-fullscreen-btn')?.addEventListener('click', () => {
      const workspace = document.querySelector('.preview-viewport')?.parentElement;
      workspace?.classList.toggle('preview-focus');
      requestAnimationFrame(() => document.getElementById('zoom-fit-btn')?.click());
    });
  }

  // ----------------------------------------------------
  // Navigation Tabs (Personal, Experience, Skills, etc.)
  // ----------------------------------------------------
  setupTabNavigation() {
    const tabs = document.querySelectorAll('.editor-tab');
    const panels = document.querySelectorAll('.tab-panel');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetTab = tab.getAttribute('data-tab');
        this.currentTab = targetTab;

        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        panels.forEach(p => {
          if (p.id === `tab-${targetTab}`) {
            p.classList.remove('hidden');
          } else {
            p.classList.add('hidden');
          }
        });
      });
    });
  }

  // ----------------------------------------------------
  // Theme & Styling Controls
  // ----------------------------------------------------
  syncColorMoodSelection() {
    const theme = this.state?.theme || {};
    document.querySelectorAll('[data-color-mood]').forEach(button => {
      const mood = COLOR_MOODS.find(item => item.name === button.dataset.colorMood);
      const active = Boolean(mood
        && mood.primary.toLowerCase() === (theme.primaryColor || '').toLowerCase()
        && mood.secondary.toLowerCase() === (theme.secondaryColor || '').toLowerCase());
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  syncPreviewQuickSwitch() {
    const theme = this.state?.theme || {};
    const templateSelect = document.getElementById('preview-template-select');
    const accentInput = document.getElementById('preview-accent-input');
    const accentDot = document.getElementById('preview-accent-dot');
    if (templateSelect?.options.length) templateSelect.value = theme.template || 'modern';
    if (accentInput) accentInput.value = theme.primaryColor || '#2563eb';
    if (accentDot) accentDot.style.backgroundColor = theme.primaryColor || '#2563eb';
  }

  selectTemplate(templateId) {
    const preset = RESUME_TEMPLATES.find(item => item.id === templateId);
    if (!preset) return;

    this.commitHistorySnapshot();
    Object.assign(this.state.theme, {
      template: preset.id,
      primaryColor: preset.primaryColor,
      secondaryColor: preset.secondaryColor,
      fontFamily: preset.fontFamily,
      spacing: preset.spacing
    });
    this.setupThemeControls();
    this.saveState();
    this.commitHistorySnapshot();
  }

  setupTemplateGallery() {
    const modal = document.getElementById('templates-modal');
    const grid = document.getElementById('template-gallery-grid');
    const filters = modal?.querySelector('[data-template-category-filters]');
    const openButton = document.getElementById('btn-browse-templates');
    if (!modal || !grid || !filters || !openButton) return;

    let activeCategory = 'All';
    const renderGallery = () => {
      const visibleTemplates = activeCategory === 'All'
        ? RESUME_TEMPLATES
        : RESUME_TEMPLATES.filter(template => template.category === activeCategory);
      grid.innerHTML = visibleTemplates.map(template => `
        <button type="button" class="template-gallery-card ${this.state.theme.template === template.id ? 'active' : ''}" data-gallery-template="${escapeHtml(template.id)}" aria-pressed="${this.state.theme.template === template.id}" style="--template-accent:${escapeHtml(template.primaryColor)};--template-secondary:${escapeHtml(template.secondaryColor)};">
          <span class="template-gallery-preview template-preview-${escapeHtml(template.layout)}" aria-hidden="true">
            <span class="template-preview-top"></span><span class="template-preview-heading"></span><span class="template-preview-line"></span><span class="template-preview-line short"></span><span class="template-preview-section"></span><span class="template-preview-line"></span><span class="template-preview-line medium"></span>
          </span>
          <span class="template-gallery-card-copy"><strong>${escapeHtml(template.name)}</strong><small>${escapeHtml(template.category)} · ${escapeHtml(template.description)}</small></span>
          <span class="template-gallery-check" aria-hidden="true">✓</span>
        </button>
      `).join('');
    };

    this.templateGalleryReturnFocus = null;
    const closeGallery = () => {
      modal.classList.add('hidden');
      this.templateGalleryReturnFocus?.focus();
      this.templateGalleryReturnFocus = null;
    };
    filters.addEventListener('click', event => {
      const button = event.target.closest('[data-template-category]');
      if (!button) return;
      activeCategory = button.dataset.templateCategory;
      filters.querySelectorAll('[data-template-category]').forEach(option => {
        const active = option === button;
        option.classList.toggle('active', active);
        option.setAttribute('aria-pressed', String(active));
      });
      renderGallery();
    });
    openButton.addEventListener('click', () => {
      this.templateGalleryReturnFocus = openButton;
      renderGallery();
      modal.classList.remove('hidden');
      grid.querySelector('.template-gallery-card')?.focus();
    });
    modal.querySelectorAll('[data-close-template-gallery]').forEach(button => {
      button.addEventListener('click', closeGallery);
    });
    modal.addEventListener('click', event => {
      if (event.target === modal) closeGallery();
    });
    grid.addEventListener('click', event => {
      const button = event.target.closest('[data-gallery-template]');
      if (!button) return;
      this.selectTemplate(button.dataset.galleryTemplate);
      closeGallery();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !modal.classList.contains('hidden')) closeGallery();
    });
  }

  setupThemeControls() {
    const theme = this.state.theme || {};
    const selectedTemplateLayout = RESUME_TEMPLATES.find(item => item.id === theme.template)?.layout || theme.template;

    if (this.themeControlsInitialized) {
      const templateButtons = document.querySelectorAll('.template-btn');
      templateButtons.forEach(btn => {
        btn.classList.toggle('ring-2', btn.getAttribute('data-template') === selectedTemplateLayout);
        btn.classList.toggle('ring-blue-500', btn.getAttribute('data-template') === selectedTemplateLayout);
        btn.classList.toggle('border-blue-500', btn.getAttribute('data-template') === selectedTemplateLayout);
      });
      document.querySelectorAll('.template-gallery-card').forEach(button => {
        const active = button.dataset.galleryTemplate === theme.template;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      });
      const paletteContainer = document.getElementById('color-palettes-container');
      paletteContainer?.querySelectorAll('.color-swatch').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-color')?.toLowerCase() === (theme.primaryColor || '').toLowerCase());
      });
      const hexInput = document.getElementById('custom-color-input');
      if (hexInput) hexInput.value = theme.primaryColor || '#2563eb';
      const secondaryColorInput = document.getElementById('secondary-color-input');
      if (secondaryColorInput) secondaryColorInput.value = theme.secondaryColor || '#1e293b';
      this.syncColorMoodSelection();
      const fontSelect = document.getElementById('font-family-select');
      if (fontSelect) fontSelect.value = theme.fontFamily || 'Inter';
      const fontSizeSelect = document.getElementById('font-size-select');
      if (fontSizeSelect) fontSizeSelect.value = theme.fontSize || 'medium';
      const spacingSelect = document.getElementById('spacing-select');
      if (spacingSelect) spacingSelect.value = theme.spacing || 'normal';
      const showPhotoToggle = document.getElementById('toggle-show-photo');
      if (showPhotoToggle) showPhotoToggle.checked = theme.showPhoto !== false;
      this.syncPreviewQuickSwitch();
      return;
    }
    this.themeControlsInitialized = true;

    // Template selector buttons
    const templateButtons = document.querySelectorAll('.template-btn');
    templateButtons.forEach(btn => {
      const tmpl = btn.getAttribute('data-template');
      if (tmpl === selectedTemplateLayout) {
        btn.classList.add('ring-2', 'ring-blue-500', 'border-blue-500');
      }
      btn.addEventListener('click', () => {
        this.selectTemplate(tmpl);
      });
    });

    const paletteContainer = document.getElementById('color-palettes-container');
    const previewTemplateSelect = document.getElementById('preview-template-select');
    if (previewTemplateSelect) {
      previewTemplateSelect.innerHTML = RESUME_TEMPLATES.map(template => `
        <option value="${escapeHtml(template.id)}">${escapeHtml(template.name)}</option>
      `).join('');
      previewTemplateSelect.value = theme.template || 'modern';
      previewTemplateSelect.addEventListener('change', event => this.selectTemplate(event.target.value));
    }

    const previewAccentInput = document.getElementById('preview-accent-input');
    if (previewAccentInput) {
      previewAccentInput.value = theme.primaryColor || '#2563eb';
      previewAccentInput.addEventListener('input', event => {
        this.state.theme.primaryColor = event.target.value;
        const hexInput = document.getElementById('custom-color-input');
        if (hexInput) hexInput.value = event.target.value;
        paletteContainer?.querySelectorAll('.color-swatch').forEach(button => {
          button.classList.toggle('active', button.dataset.color?.toLowerCase() === event.target.value.toLowerCase());
        });
        this.syncPreviewQuickSwitch();
        this.syncColorMoodSelection();
        this.saveState();
      });
    }
    this.syncPreviewQuickSwitch();

    // Color Swatches
    if (paletteContainer) {
      paletteContainer.innerHTML = COLOR_PALETTES.map(p => `
        <button 
          type="button" 
          class="color-swatch ${theme.primaryColor.toLowerCase() === p.hex.toLowerCase() ? 'active' : ''}" 
          style="background-color: ${p.hex};" 
          data-color="${p.hex}" 
          title="${p.name}">
        </button>
      `).join('');

      paletteContainer.querySelectorAll('.color-swatch').forEach(btn => {
        btn.addEventListener('click', () => {
          paletteContainer.querySelectorAll('.color-swatch').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const hex = btn.getAttribute('data-color');
          this.state.theme.primaryColor = hex;
          const hexInput = document.getElementById('custom-color-input');
          if (hexInput) hexInput.value = hex;
          this.syncPreviewQuickSwitch();
          this.syncColorMoodSelection();
          this.saveState();
        });
      });
    }

    // Custom Hex Color Input
    const hexInput = document.getElementById('custom-color-input');
    if (hexInput) {
      hexInput.value = theme.primaryColor || '#2563eb';
      hexInput.addEventListener('input', (e) => {
        this.state.theme.primaryColor = e.target.value;
        paletteContainer?.querySelectorAll('.color-swatch').forEach(button => {
          button.classList.toggle('active', button.dataset.color?.toLowerCase() === e.target.value.toLowerCase());
        });
        this.syncPreviewQuickSwitch();
        this.syncColorMoodSelection();
        this.saveState();
      });
    }

    const secondaryColorInput = document.getElementById('secondary-color-input');
    if (secondaryColorInput) {
      secondaryColorInput.value = theme.secondaryColor || '#1e293b';
      secondaryColorInput.addEventListener('input', event => {
        this.state.theme.secondaryColor = event.target.value;
        this.syncColorMoodSelection();
        this.saveState();
      });
    }

    const moodsContainer = document.getElementById('color-moods-container');
    if (moodsContainer) {
      moodsContainer.innerHTML = COLOR_MOODS.map(mood => `
        <button type="button" class="color-mood-btn" data-color-mood="${escapeHtml(mood.name)}" aria-label="Apply ${escapeHtml(mood.name)} color mood" aria-pressed="false">
          <span class="color-mood-swatches" aria-hidden="true"><i style="background:${mood.primary}"></i><i style="background:${mood.secondary}"></i></span>
          <span>${escapeHtml(mood.name)}</span>
        </button>
      `).join('');
      moodsContainer.querySelectorAll('[data-color-mood]').forEach(button => {
        button.addEventListener('click', () => {
          const mood = COLOR_MOODS.find(item => item.name === button.dataset.colorMood);
          if (!mood) return;
          this.state.theme.primaryColor = mood.primary;
          this.state.theme.secondaryColor = mood.secondary;
          const primaryInput = document.getElementById('custom-color-input');
          const secondaryInput = document.getElementById('secondary-color-input');
          if (primaryInput) primaryInput.value = mood.primary;
          if (secondaryInput) secondaryInput.value = mood.secondary;
          paletteContainer?.querySelectorAll('.color-swatch').forEach(swatch => {
            swatch.classList.toggle('active', swatch.dataset.color?.toLowerCase() === mood.primary.toLowerCase());
          });
          this.syncPreviewQuickSwitch();
          this.syncColorMoodSelection();
          this.saveState();
        });
      });
      this.syncColorMoodSelection();
    }

    // Font Family Select
    const fontSelect = document.getElementById('font-family-select');
    if (fontSelect) {
      fontSelect.innerHTML = FONT_OPTIONS.map(f => `
        <option value="${f.id}" ${theme.fontFamily === f.id ? 'selected' : ''}>${f.name}</option>
      `).join('');
      fontSelect.addEventListener('change', (e) => {
        this.state.theme.fontFamily = e.target.value;
        this.saveState();
      });
    }

    // Font Size Radio/Select
    const fontSizeSelect = document.getElementById('font-size-select');
    if (fontSizeSelect) {
      fontSizeSelect.value = theme.fontSize || 'medium';
      fontSizeSelect.addEventListener('change', (e) => {
        this.state.theme.fontSize = e.target.value;
        this.saveState();
      });
    }

    // Spacing Density Select
    const spacingSelect = document.getElementById('spacing-select');
    if (spacingSelect) {
      spacingSelect.value = theme.spacing || 'normal';
      spacingSelect.addEventListener('change', (e) => {
        this.state.theme.spacing = e.target.value;
        this.saveState();
      });
    }

    // Photo Visibility Toggle
    const showPhotoToggle = document.getElementById('toggle-show-photo');
    if (showPhotoToggle) {
      showPhotoToggle.checked = theme.showPhoto !== false;
      showPhotoToggle.addEventListener('change', (e) => {
        this.state.theme.showPhoto = e.target.checked;
        this.saveState();
      });
    }
  }

  // ----------------------------------------------------
  // Form Populations & Bindings
  // ----------------------------------------------------
  populateEditorForms() {
    this.populatePersonalForm();
    this.renderExperienceList();
    this.renderEducationList();
    this.renderSkillsList();
    this.renderProjectsList();
    this.renderCertificationsList();
    this.renderLanguagesList();
    this.renderCustomSectionsList();
    this.populateHelperChips();
    this.renderSectionLayoutControls();
    const jobDescriptionInput = document.getElementById('input-job-description');
    if (jobDescriptionInput) jobDescriptionInput.value = this.state.targetJobDescription || '';
    this.populateCoverLetterForm();
    this.populateInterviewPrepForm();
    this.updateCoverLetterTabVisibility();
    this.initLucide();
  }

  populatePersonalForm() {
    const p = this.state.personal || {};
    const fields = ['fullName', 'jobTitle', 'email', 'phone', 'location', 'website', 'linkedin', 'github', 'summary'];
    const shouldBindInputs = !this.personalInputsBound;
    
    fields.forEach(field => {
      const el = document.getElementById(`input-${field}`);
      if (el) {
        el.value = p[field] || '';
        if (shouldBindInputs) {
          el.addEventListener('input', (e) => {
            this.state.personal[field] = e.target.value;
            this.saveState();
          });
        }
      }
    });

    // Photo input
    const photoInput = document.getElementById('photo-upload-input');
    const photoPreview = document.getElementById('photo-avatar-preview');
    const removePhotoBtn = document.getElementById('remove-photo-btn');

    if (photoPreview) {
      photoPreview.src = p.photo || '';
      photoPreview.classList.toggle('hidden', !p.photo);
    }
    if (photoInput) photoInput.value = '';

    if (shouldBindInputs) {
      photoInput?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          if (!file.type.startsWith('image/')) {
            alert('Please choose a valid image file.');
            e.target.value = '';
            return;
          }
          if (file.size > 2 * 1024 * 1024) {
            alert('Profile photos must be smaller than 2 MB.');
            e.target.value = '';
            return;
          }
          const reader = new FileReader();
          reader.onload = (event) => {
            this.state.personal.photo = event.target.result;
            if (photoPreview) {
              photoPreview.src = event.target.result;
              photoPreview.classList.remove('hidden');
            }
            this.saveState();
          };
          reader.readAsDataURL(file);
        };
      });

      removePhotoBtn?.addEventListener('click', () => {
        this.state.personal.photo = '';
        if (photoPreview) {
          photoPreview.src = '';
          photoPreview.classList.add('hidden');
        }
        if (photoInput) photoInput.value = '';
        this.saveState();
      });
      this.personalInputsBound = true;
    }
  }

  populateHelperChips() {
    // Action Verbs Chips
    const verbContainer = document.getElementById('action-verbs-chips');
    if (verbContainer) {
      verbContainer.innerHTML = ACTION_VERBS.slice(0, 12).map(verb => `
        <button type="button" class="action-verb-chip px-2 py-0.5 rounded text-xs bg-slate-800 hover:bg-blue-600 hover:text-white text-slate-300 border border-slate-700 transition-colors" data-verb="${verb}">
          + ${verb}
        </button>
      `).join('');

      verbContainer.querySelectorAll('.action-verb-chip').forEach(btn => {
        btn.addEventListener('click', () => {
          const verb = btn.getAttribute('data-verb');
          const summaryInput = document.getElementById('input-summary');
          if (summaryInput) {
            const start = summaryInput.selectionStart;
            const end = summaryInput.selectionEnd;
            const text = summaryInput.value;
            const insertion = verb + ' ';
            summaryInput.value = text.substring(0, start) + insertion + text.substring(end);
            this.state.personal.summary = summaryInput.value;
            this.saveState();
            summaryInput.focus();
            summaryInput.selectionStart = summaryInput.selectionEnd = start + insertion.length;
          }
        });
      });
    }

    // Summary Template Selector
    const summaryPresetSelect = document.getElementById('summary-preset-select');
    if (summaryPresetSelect) {
      summaryPresetSelect.innerHTML = `
        <option value="">⚡ Insert starter summary template...</option>
        ${SUMMARY_TEMPLATES.map((tmpl, idx) => `
          <option value="${idx}">${tmpl.role}</option>
        `).join('')}
      `;
      if (!this.summaryPresetBound) {
        summaryPresetSelect.addEventListener('change', (e) => {
          const val = e.target.value;
          if (val !== '') {
            const tmpl = SUMMARY_TEMPLATES[parseInt(val, 10)];
            if (tmpl) {
              const summaryInput = document.getElementById('input-summary');
              if (summaryInput) {
                summaryInput.value = tmpl.text;
                this.state.personal.summary = tmpl.text;
                this.saveState();
              }
            }
            e.target.value = '';
          }
        });
        this.summaryPresetBound = true;
      }
    }
  }

  // ----------------------------------------------------
  // Dynamic Experience Section
  // ----------------------------------------------------
  renderExperienceList() {
    const list = document.getElementById('experience-list');
    if (!list) return;

    list.innerHTML = (this.state.experiences || []).map((exp, idx) => `
      <div class="exp-item p-4 rounded-lg bg-slate-800/80 border border-slate-700/80 relative space-y-3" data-id="${escapeHtml(exp.id)}">
        <div class="flex items-center justify-between pb-2 border-b border-slate-700">
          <span class="text-xs font-bold text-blue-400 uppercase tracking-wider">#${idx + 1} • ${escapeHtml(exp.role || 'New Position')}</span>
          <button type="button" class="btn-delete-exp text-slate-400 hover:text-red-400 p-1 text-xs" data-id="${escapeHtml(exp.id)}" title="Delete experience">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="input-label">Role / Job Title</label>
            <input type="text" class="input-field exp-field" data-field="role" value="${escapeHtml(exp.role || '')}" placeholder="e.g. Lead Software Engineer">
          </div>
          <div>
            <label class="input-label">Company Name</label>
            <input type="text" class="input-field exp-field" data-field="company" value="${escapeHtml(exp.company || '')}" placeholder="e.g. Acme Tech">
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label class="input-label">Location</label>
            <input type="text" class="input-field exp-field" data-field="location" value="${escapeHtml(exp.location || '')}" placeholder="e.g. New York, NY">
          </div>
          <div>
            <label class="input-label">Start Date</label>
            <input id="input-experience-start-date-${escapeHtml(exp.id)}" type="text" class="input-field exp-field" data-field="startDate" value="${escapeHtml(exp.startDate || '')}" placeholder="e.g. 2021-04">
          </div>
          <div>
            <label class="input-label">End Date</label>
            <input type="text" class="input-field exp-field" data-field="endDate" value="${escapeHtml(exp.endDate || '')}" placeholder="e.g. Present" ${exp.current ? 'disabled' : ''}>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <input type="checkbox" id="curr-${escapeHtml(exp.id)}" class="exp-current-checkbox rounded text-blue-600 focus:ring-blue-500 bg-slate-900 border-slate-700" ${exp.current ? 'checked' : ''}>
          <label for="curr-${escapeHtml(exp.id)}" class="text-xs text-slate-300 font-medium cursor-pointer">I currently work here</label>
        </div>

        <div>
          <div class="flex flex-wrap justify-between items-center gap-2 mb-1">
            <div>
              <label class="input-label mb-0">Key Responsibilities & Achievements (1 per line)</label>
              <span class="text-2xs text-slate-400"><i data-lucide="lightbulb" class="ui-icon" aria-hidden="true"></i> Start with action verbs & metrics</span>
            </div>
            <button type="button" class="ai-assist-btn btn-ai-improve-exp" data-ai-improve-exp="${escapeHtml(exp.id)}"><i data-lucide="sparkles" class="ui-icon" aria-hidden="true"></i> Improve</button>
          </div>
          <textarea id="input-experience-description-${escapeHtml(exp.id)}" rows="4" class="input-field exp-field font-mono text-xs leading-relaxed" data-field="description" placeholder="• Spearheaded automated deployment pipeline, saving 12 engineer-hours weekly...&#10;• Increased client retention by 18%...">${escapeHtml(exp.description || '')}</textarea>
          <div class="weak-phrase-warning" data-weak-phrase-warning="experience" role="status" aria-live="polite" hidden></div>
          <p class="bullet-checker-hint mt-1.5 text-2xs" aria-live="polite">${escapeHtml(this.bulletAnalysisHint(exp.description))}</p>
        </div>
      </div>
    `).join('');
    this.initLucide();

    // Attach listeners
    list.querySelectorAll('.exp-item').forEach(card => {
      const id = card.getAttribute('data-id');
      const item = this.state.experiences.find(e => e.id === id);
      if (!item) return;

      card.querySelector('.btn-ai-improve-exp')?.addEventListener('click', event => {
        this.improveExperience(id, event.currentTarget);
      });

      // Fields
      card.querySelectorAll('.exp-field').forEach(input => {
        input.addEventListener('input', (e) => {
          const field = input.getAttribute('data-field');
          item[field] = e.target.value;
          if (field === 'description') {
            const hint = card.querySelector('.bullet-checker-hint');
            if (hint) hint.textContent = this.bulletAnalysisHint(e.target.value);
          }
          this.saveState();
        });
      });

      // Current checkbox
      card.querySelector('.exp-current-checkbox')?.addEventListener('change', (e) => {
        item.current = e.target.checked;
        if (item.current) {
          item.endDate = 'Present';
          const endInput = card.querySelector('[data-field="endDate"]');
          if (endInput) {
            endInput.value = 'Present';
            endInput.disabled = true;
          }
        } else {
          item.endDate = '';
          const endInput = card.querySelector('[data-field="endDate"]');
          if (endInput) {
            endInput.value = '';
            endInput.disabled = false;
          }
        }
        this.saveState();
      });

      // Delete button
      card.querySelector('.btn-delete-exp')?.addEventListener('click', () => {
        this.state.experiences = this.state.experiences.filter(e => e.id !== id);
        this.renderExperienceList();
        this.saveState();
      });
    });
  }

  async improveExperience(experienceId, button) {
    const experience = this.state.experiences.find(item => item.id === experienceId);
    if (!experience) return;
    const originalDescription = experience.description || '';
    if (!originalDescription.trim()) {
      this.showToast('Add experience bullets before using Improve.', 'warning');
      return;
    }
    const apiKey = this.getGeminiApiKeyForAction();
    if (!apiKey) return;

    const prompt = [
      'Rewrite the supplied resume experience bullets as concise, metric-focused STAR achievement bullets.',
      'Keep the original facts, tools, ownership, and scope truthful. Never invent numbers, outcomes, or responsibilities.',
      'Use strong action verbs, keep each bullet to one line where possible, and return only bullet lines with no introduction.',
      `Role: ${experience.role || ''}`,
      `Company: ${experience.company || ''}`,
      `Original bullets:\n${originalDescription}`
    ].join('\n\n');

    this.setAiButtonLoading(button, true, 'Improving…');
    try {
      const improved = await this.requestGeminiText(prompt, apiKey);
      if (!this.state.experiences.includes(experience)) {
        this.showToast('You switched resumes. The improved bullets were not applied.', 'warning');
        return;
      }
      const currentDescription = experience.description || '';
      if ((currentDescription.trim() || currentDescription !== originalDescription) &&
          !window.confirm('Replace the current experience bullets with this rewrite? You can undo the change afterward.')) return;
      this.commitHistorySnapshot();
      experience.description = improved;
      const card = button.closest('.exp-item');
      const textarea = card?.querySelector('[data-field="description"]');
      if (textarea) textarea.value = improved;
      const hint = card?.querySelector('.bullet-checker-hint');
      if (hint) hint.textContent = this.bulletAnalysisHint(improved);
      this.saveState();
      this.showToast('Experience bullets improved. Undo is available.', 'success');
    } catch (error) {
      this.showToast(error.message || 'Could not improve these bullets.', 'warning');
    } finally {
      this.setAiButtonLoading(button, false);
    }
  }

  bulletAnalysisHint(description) {
    const bullets = String(description || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const analyses = bullets.map(analyzeBullet);
    const metricCount = analyses.filter(result => result.hasMetric).length;
    const actionCount = analyses.filter(result => result.startsWithActionVerb).length;
    return `${metricCount}/${bullets.length} bullets have metrics • ${actionCount}/${bullets.length} start with action verbs`;
  }

  // ----------------------------------------------------
  // Dynamic Education Section
  // ----------------------------------------------------
  renderEducationList() {
    const list = document.getElementById('education-list');
    if (!list) return;

    list.innerHTML = (this.state.education || []).map((edu, idx) => `
      <div class="edu-item p-4 rounded-lg bg-slate-800/80 border border-slate-700/80 space-y-3" data-id="${escapeHtml(edu.id)}">
        <div class="flex items-center justify-between pb-2 border-b border-slate-700">
          <span class="text-xs font-bold text-emerald-400 uppercase tracking-wider">#${idx + 1} • ${escapeHtml(edu.degree || 'Degree / Diploma')}</span>
          <button type="button" class="btn-delete-edu text-slate-400 hover:text-red-400 p-1 text-xs" data-id="${escapeHtml(edu.id)}" title="Delete education">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="input-label">Degree & Major</label>
            <input id="input-education-degree-${escapeHtml(edu.id)}" type="text" class="input-field edu-field" data-field="degree" value="${escapeHtml(edu.degree || '')}" placeholder="e.g. B.S. in Computer Science">
          </div>
          <div>
            <label class="input-label">School / University</label>
            <input id="input-education-school-${escapeHtml(edu.id)}" type="text" class="input-field edu-field" data-field="school" value="${escapeHtml(edu.school || '')}" placeholder="e.g. Stanford University">
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label class="input-label">Location</label>
            <input type="text" class="input-field edu-field" data-field="location" value="${escapeHtml(edu.location || '')}" placeholder="e.g. Stanford, CA">
          </div>
          <div>
            <label class="input-label">Start Date</label>
            <input type="text" class="input-field edu-field" data-field="startDate" value="${escapeHtml(edu.startDate || '')}" placeholder="e.g. 2016-09">
          </div>
          <div>
            <label class="input-label">End / Graduation Date</label>
            <input type="text" class="input-field edu-field" data-field="endDate" value="${escapeHtml(edu.endDate || '')}" placeholder="e.g. 2020-06">
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="input-label">Grade / GPA (Optional)</label>
            <input type="text" class="input-field edu-field" data-field="grade" value="${escapeHtml(edu.grade || '')}" placeholder="e.g. 3.9 GPA">
          </div>
          <div>
            <label class="input-label">Honors & Activities (Optional)</label>
            <input type="text" class="input-field edu-field" data-field="honors" value="${escapeHtml(edu.honors || '')}" placeholder="e.g. Magna Cum Laude">
          </div>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.edu-item').forEach(card => {
      const id = card.getAttribute('data-id');
      const item = this.state.education.find(e => e.id === id);
      if (!item) return;

      card.querySelectorAll('.edu-field').forEach(input => {
        input.addEventListener('input', (e) => {
          const field = input.getAttribute('data-field');
          item[field] = e.target.value;
          this.saveState();
        });
      });

      card.querySelector('.btn-delete-edu')?.addEventListener('click', () => {
        this.state.education = this.state.education.filter(e => e.id !== id);
        this.renderEducationList();
        this.saveState();
      });
    });
  }

  // ----------------------------------------------------
  // Dynamic Skills Section
  // ----------------------------------------------------
  renderSkillsList() {
    const list = document.getElementById('skills-list');
    if (!list) return;

    list.innerHTML = (this.state.skills || []).map((group, idx) => `
      <div class="skill-group-card p-4 rounded-lg bg-slate-800/80 border border-slate-700/80 space-y-3" data-idx="${idx}">
        <div class="flex items-center justify-between pb-2 border-b border-slate-700">
          <div class="flex-1 mr-4">
            <input type="text" class="input-field font-bold text-white skill-category-input" value="${escapeHtml(group.category || '')}" placeholder="Category (e.g. Frontend, Tools, Management)">
          </div>
          <button type="button" class="btn-delete-skill-group text-slate-400 hover:text-red-400 p-1 text-xs" data-idx="${idx}" title="Delete category">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        </div>

        <div>
          <label class="input-label">Skills in this category (press Enter or Comma to add)</label>
          <div class="flex flex-wrap gap-1.5 p-2 rounded-lg bg-slate-900 border border-slate-700 min-h-[44px] items-center skill-tags-container" data-idx="${idx}">
            ${(group.items || []).map((skill, sIdx) => `
              <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-blue-600/30 text-blue-200 border border-blue-500/40">
                ${escapeHtml(skill)}
                <button type="button" class="btn-remove-tag text-blue-300 hover:text-white" data-group-idx="${idx}" data-skill-idx="${sIdx}">&times;</button>
              </span>
            `).join('')}
            <input type="text" class="skill-tag-input bg-transparent border-none text-xs text-white outline-none flex-1 min-w-[120px] p-1" placeholder="Type skill & press Enter...">
          </div>
        </div>
      </div>
    `).join('');

    // Attach listeners
    list.querySelectorAll('.skill-group-card').forEach(card => {
      const idx = parseInt(card.getAttribute('data-idx'), 10);
      const group = this.state.skills[idx];
      if (!group) return;

      // Category input
      card.querySelector('.skill-category-input')?.addEventListener('input', (e) => {
        group.category = e.target.value;
        this.saveState();
      });

      // Delete group
      card.querySelector('.btn-delete-skill-group')?.addEventListener('click', () => {
        this.state.skills.splice(idx, 1);
        this.renderSkillsList();
        this.saveState();
      });

      // Tag input (Enter or comma)
      const tagInput = card.querySelector('.skill-tag-input');
      tagInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ',') {
          e.preventDefault();
          const val = tagInput.value.replace(/,/g, '').trim();
          if (val) {
            if (!group.items) group.items = [];
            group.items.push(val);
            tagInput.value = '';
            this.renderSkillsList();
            this.saveState();
          }
        }
      });

      // Remove single tag button
      card.querySelectorAll('.btn-remove-tag').forEach(rmBtn => {
        rmBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const sIdx = parseInt(rmBtn.getAttribute('data-skill-idx'), 10);
          group.items.splice(sIdx, 1);
          this.renderSkillsList();
          this.saveState();
        });
      });
    });
  }

  // ----------------------------------------------------
  // Dynamic Projects Section
  // ----------------------------------------------------
  renderProjectsList() {
    const list = document.getElementById('projects-list');
    if (!list) return;

    list.innerHTML = (this.state.projects || []).map((proj, idx) => `
      <div class="proj-item p-4 rounded-lg bg-slate-800/80 border border-slate-700/80 space-y-3" data-id="${escapeHtml(proj.id)}">
        <div class="flex items-center justify-between pb-2 border-b border-slate-700">
          <span class="text-xs font-bold text-purple-400 uppercase tracking-wider">#${idx + 1} • ${escapeHtml(proj.title || 'Project Name')}</span>
          <button type="button" class="btn-delete-proj text-slate-400 hover:text-red-400 p-1 text-xs" data-id="${escapeHtml(proj.id)}" title="Delete project">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="input-label">Project Title</label>
            <input type="text" class="input-field proj-field" data-field="title" value="${escapeHtml(proj.title || '')}" placeholder="e.g. DevPulse Cloud">
          </div>
          <div>
            <label class="input-label">Technologies Used</label>
            <input type="text" class="input-field proj-field" data-field="tech" value="${escapeHtml(proj.tech || '')}" placeholder="e.g. React, Node.js, AWS">
          </div>
        </div>

        <div>
          <label class="input-label">Project URL / GitHub Link</label>
          <input type="text" class="input-field proj-field" data-field="link" value="${escapeHtml(proj.link || '')}" placeholder="e.g. https://github.com/username/project">
        </div>

        <div>
          <label class="input-label">Description & Impact</label>
          <textarea rows="2" class="input-field proj-field text-xs" data-field="description" placeholder="Short description of what you engineered and results...">${escapeHtml(proj.description || '')}</textarea>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.proj-item').forEach(card => {
      const id = card.getAttribute('data-id');
      const item = this.state.projects.find(p => p.id === id);
      if (!item) return;

      card.querySelectorAll('.proj-field').forEach(input => {
        input.addEventListener('input', (e) => {
          const field = input.getAttribute('data-field');
          item[field] = e.target.value;
          this.saveState();
        });
      });

      card.querySelector('.btn-delete-proj')?.addEventListener('click', () => {
        this.state.projects = this.state.projects.filter(p => p.id !== id);
        this.renderProjectsList();
        this.saveState();
      });
    });
  }

  // ----------------------------------------------------
  // Dynamic Certifications & Languages
  // ----------------------------------------------------
  renderCertificationsList() {
    const list = document.getElementById('certifications-list');
    if (!list) return;

    list.innerHTML = (this.state.certifications || []).map((cert, idx) => `
      <div class="cert-item p-3 rounded-lg bg-slate-800/80 border border-slate-700/80 space-y-2" data-id="${escapeHtml(cert.id)}">
        <div class="flex items-center justify-between">
          <input type="text" class="input-field font-semibold text-xs cert-field flex-1 mr-2" data-field="name" value="${escapeHtml(cert.name || '')}" placeholder="Certification Name">
          <button type="button" class="btn-delete-cert text-slate-400 hover:text-red-400 p-1" data-id="${escapeHtml(cert.id)}">&times;</button>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <input type="text" class="input-field text-xs cert-field" data-field="issuer" value="${escapeHtml(cert.issuer || '')}" placeholder="Issuer (e.g. AWS)">
          <input type="text" class="input-field text-xs cert-field" data-field="date" value="${escapeHtml(cert.date || '')}" placeholder="Year / Date (e.g. 2023)">
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.cert-item').forEach(card => {
      const id = card.getAttribute('data-id');
      const item = this.state.certifications.find(c => c.id === id);
      if (!item) return;

      card.querySelectorAll('.cert-field').forEach(input => {
        input.addEventListener('input', (e) => {
          item[input.getAttribute('data-field')] = e.target.value;
          this.saveState();
        });
      });

      card.querySelector('.btn-delete-cert')?.addEventListener('click', () => {
        this.state.certifications = this.state.certifications.filter(c => c.id !== id);
        this.renderCertificationsList();
        this.saveState();
      });
    });
  }

  renderLanguagesList() {
    const list = document.getElementById('languages-list');
    if (!list) return;

    list.innerHTML = (this.state.languages || []).map((lang, idx) => `
      <div class="lang-item flex items-center gap-2" data-idx="${idx}">
        <input type="text" class="input-field text-xs lang-field" data-field="language" value="${escapeHtml(lang.language || '')}" placeholder="Language (e.g. French)">
        <input type="text" class="input-field text-xs lang-field" data-field="fluency" value="${escapeHtml(lang.fluency || '')}" placeholder="Fluency (e.g. Fluent, Native)">
        <button type="button" class="btn-delete-lang text-slate-400 hover:text-red-400 px-2 py-1 text-sm" data-idx="${idx}">&times;</button>
      </div>
    `).join('');

    list.querySelectorAll('.lang-item').forEach(card => {
      const idx = parseInt(card.getAttribute('data-idx'), 10);
      const item = this.state.languages[idx];
      if (!item) return;

      card.querySelectorAll('.lang-field').forEach(input => {
        input.addEventListener('input', (e) => {
          item[input.getAttribute('data-field')] = e.target.value;
          this.saveState();
        });
      });

      card.querySelector('.btn-delete-lang')?.addEventListener('click', () => {
        this.state.languages.splice(idx, 1);
        this.renderLanguagesList();
        this.saveState();
      });
    });
  }

  // ----------------------------------------------------
  // Dynamic Custom Sections
  // ----------------------------------------------------
  renderCustomSectionsList() {
    const list = document.getElementById('custom-sections-list');
    if (!list) return;

    list.innerHTML = (this.state.customSections || []).map((sec, sIdx) => `
      <div class="custom-sec-item p-4 rounded-lg bg-slate-800/80 border border-slate-700/80 space-y-3" data-id="${escapeHtml(sec.id)}">
        <div class="flex items-center justify-between pb-2 border-b border-slate-700">
          <input type="text" class="input-field font-bold text-amber-400 sec-title-input flex-1 mr-3" value="${escapeHtml(sec.title || '')}" placeholder="Section Title (e.g. Publications, Volunteer, Awards)">
          <button type="button" class="btn-delete-custom-sec text-slate-400 hover:text-red-400 p-1 text-xs" data-id="${escapeHtml(sec.id)}">&times;</button>
        </div>
        <div class="space-y-2 sec-items-container">
          ${(sec.items || []).map((it, iIdx) => `
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input type="text" class="input-field text-xs sec-item-field sm:col-span-2" data-item-idx="${iIdx}" data-field="title" value="${escapeHtml(it.title || '')}" placeholder="Title / Recognition">
              <input type="text" class="input-field text-xs sec-item-field" data-item-idx="${iIdx}" data-field="date" value="${escapeHtml(it.date || '')}" placeholder="Year / Subtitle">
            </div>
          `).join('')}
        </div>
        <button type="button" class="btn-add-sec-item text-xs text-blue-400 hover:text-blue-300 font-semibold" data-id="${escapeHtml(sec.id)}">+ Add Item</button>
      </div>
    `).join('');

    list.querySelectorAll('.custom-sec-item').forEach(card => {
      const id = card.getAttribute('data-id');
      const sec = this.state.customSections.find(s => s.id === id);
      if (!sec) return;

      card.querySelector('.sec-title-input')?.addEventListener('input', (e) => {
        sec.title = e.target.value;
        this.saveState();
      });

      card.querySelector('.btn-delete-custom-sec')?.addEventListener('click', () => {
        this.state.customSections = this.state.customSections.filter(s => s.id !== id);
        this.renderCustomSectionsList();
        this.saveState();
      });

      card.querySelectorAll('.sec-item-field').forEach(input => {
        input.addEventListener('input', (e) => {
          const iIdx = parseInt(input.getAttribute('data-item-idx'), 10);
          const fld = input.getAttribute('data-field');
          if (sec.items[iIdx]) {
            sec.items[iIdx][fld] = e.target.value;
            this.saveState();
          }
        });
      });

      card.querySelector('.btn-add-sec-item')?.addEventListener('click', () => {
        if (!sec.items) sec.items = [];
        sec.items.push({ title: '', subtitle: '', date: '' });
        this.renderCustomSectionsList();
        this.saveState();
      });
    });
  }

  // ----------------------------------------------------
  // Event Delegation for "Add New" Buttons & Presets
  // ----------------------------------------------------
  setupEventDelegation() {
    // Add Experience Button
    document.getElementById('btn-add-experience')?.addEventListener('click', () => {
      if (!this.state.experiences) this.state.experiences = [];
      const newId = 'exp-' + Date.now();
      this.state.experiences.unshift({
        id: newId,
        role: '',
        company: '',
        location: '',
        startDate: '',
        endDate: '',
        current: false,
        description: '• '
      });
      this.renderExperienceList();
      this.saveState();
    });

    // Add Education Button
    document.getElementById('btn-add-education')?.addEventListener('click', () => {
      if (!this.state.education) this.state.education = [];
      const newId = 'edu-' + Date.now();
      this.state.education.unshift({
        id: newId,
        degree: '',
        school: '',
        location: '',
        startDate: '',
        endDate: '',
        grade: '',
        honors: ''
      });
      this.renderEducationList();
      this.saveState();
    });

    // Add Skill Category Button
    document.getElementById('btn-add-skill-group')?.addEventListener('click', () => {
      if (!this.state.skills) this.state.skills = [];
      this.state.skills.push({
        category: 'New Category',
        items: []
      });
      this.renderSkillsList();
      this.saveState();
    });

    // Add Project Button
    document.getElementById('btn-add-project')?.addEventListener('click', () => {
      if (!this.state.projects) this.state.projects = [];
      const newId = 'proj-' + Date.now();
      this.state.projects.unshift({
        id: newId,
        title: '',
        tech: '',
        link: '',
        description: ''
      });
      this.renderProjectsList();
      this.saveState();
    });

    // Add Certification Button
    document.getElementById('btn-add-cert')?.addEventListener('click', () => {
      if (!this.state.certifications) this.state.certifications = [];
      this.state.certifications.push({
        id: 'cert-' + Date.now(),
        name: '',
        issuer: '',
        date: '',
        link: ''
      });
      this.renderCertificationsList();
      this.saveState();
    });

    // Add Language Button
    document.getElementById('btn-add-lang')?.addEventListener('click', () => {
      if (!this.state.languages) this.state.languages = [];
      this.state.languages.push({ language: '', fluency: '' });
      this.renderLanguagesList();
      this.saveState();
    });

    // Add Custom Section Button
    document.getElementById('btn-add-custom-sec')?.addEventListener('click', () => {
      if (!this.state.customSections) this.state.customSections = [];
      this.state.customSections.push({
        id: 'custom-' + Date.now(),
        title: 'Volunteer Experience',
        items: [{ title: '', subtitle: '', date: '' }]
      });
      this.renderCustomSectionsList();
      this.saveState();
    });

    // Preset Loader
    document.querySelectorAll('.preset-select-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const presetKey = btn.getAttribute('data-preset');
        if (presetKey === 'blank') {
          if (confirm('Start with a blank resume? This will clear current fields.')) {
            this.state = this.storage.normalizeState({
              theme: { ...INITIAL_DATA.theme },
              personal: { fullName: '', jobTitle: '', email: '', phone: '', location: '', website: '', linkedin: '', github: '', photo: '', summary: '' },
              experiences: [],
              education: [],
              skills: [{ category: 'Core Skills', items: [] }],
              projects: [],
              certifications: [],
              languages: [],
              customSections: [],
              targetJobDescription: ''
            });
            this.resetHistory();
            this.populateEditorForms();
            this.setupThemeControls();
            this.saveState();
            this.showToast('Blank resume created', 'success');
          }
        } else if (SAMPLE_PRESETS[presetKey]) {
          if (confirm(`Load the ${btn.textContent.trim()} template? Your current unsaved changes will be replaced.`)) {
            this.state = this.storage.normalizeState(SAMPLE_PRESETS[presetKey]);
            this.resetHistory();
            this.populateEditorForms();
            this.setupThemeControls();
            this.saveState();
            this.showToast('Preset loaded', 'success');
          }
        }
      });
    });
  }

  // ----------------------------------------------------
  // ATS Score Tracker & Optimizer Modal
  // ----------------------------------------------------
  buildAtsPlainText() {
    const personal = this.state.personal || {};
    const contact = [
      ['Email', personal.email],
      ['Phone', personal.phone],
      ['Location', personal.location],
      ['Website', personal.website],
      ['LinkedIn', personal.linkedin],
      ['Other profile', personal.github]
    ].filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`);
    const formatDateRange = (item) => {
      const endDate = item.current ? 'Present' : item.endDate;
      return [item.startDate, endDate].filter(Boolean).join(' – ');
    };
    const sections = {
      summary: (personal.summary || '').trim(),
      experience: (this.state.experiences || []).map(item => [
        [item.role, item.company].filter(Boolean).join(' — '),
        [formatDateRange(item), item.location].filter(Boolean).join(' | '),
        String(item.description || '').trim()
      ].filter(Boolean).join('\n')).filter(Boolean).join('\n\n'),
      education: (this.state.education || []).map(item => [
        [item.degree, item.school].filter(Boolean).join(' — '),
        [item.startDate, item.endDate].filter(Boolean).join(' – '),
        [item.grade, item.honors].filter(Boolean).join(' • ')
      ].filter(Boolean).join('\n')).filter(Boolean).join('\n\n'),
      skills: (this.state.skills || []).map(group => {
        const items = (group.items || []).filter(Boolean).join(', ');
        return [group.category, items].filter(Boolean).join(': ');
      }).filter(Boolean).join('\n'),
      projects: (this.state.projects || []).map(item => [
        item.title,
        item.tech,
        item.description
      ].filter(Boolean).join('\n')).filter(Boolean).join('\n\n'),
      certifications: (this.state.certifications || []).map(item => [
        item.name,
        item.issuer,
        item.date
      ].filter(Boolean).join(' — ')).filter(Boolean).join('\n'),
      languages: (this.state.languages || []).map(item => [
        item.language,
        item.fluency
      ].filter(Boolean).join(': ')).filter(Boolean).join('\n'),
      customSections: (this.state.customSections || []).map(section => [
        section.title,
        ...(section.items || []).map(item => [
          item.title,
          item.subtitle,
          item.date
        ].filter(Boolean).join(' — '))
      ].filter(Boolean).join('\n')).filter(Boolean).join('\n\n')
    };
    const labels = {
      summary: 'SUMMARY',
      experience: 'EXPERIENCE',
      education: 'EDUCATION',
      skills: 'SKILLS',
      projects: 'PROJECTS',
      certifications: 'CERTIFICATIONS',
      languages: 'LANGUAGES',
      customSections: 'CUSTOM SECTIONS'
    };
    const sectionKeys = Object.keys(sections);
    const requestedOrder = Array.isArray(this.state.theme?.sectionOrder)
      ? this.state.theme.sectionOrder
      : sectionKeys;
    const order = [...new Set(requestedOrder.filter(key => sectionKeys.includes(key)))];
    sectionKeys.forEach(key => {
      if (!order.includes(key)) order.push(key);
    });
    const hidden = new Set(Array.isArray(this.state.theme?.hiddenSections) ? this.state.theme.hiddenSections : []);
    const renderedSections = order
      .filter(key => !hidden.has(key) && sections[key])
      .map(key => `${labels[key]}\n${sections[key]}`);
    return [
      personal.fullName,
      personal.jobTitle,
      contact.join('\n'),
      ...renderedSections
    ].filter(Boolean).join('\n\n');
  }

  updateAtsPlainTextPreview() {
    const preview = document.getElementById('ats-plain-text-preview');
    if (preview) preview.textContent = this.buildAtsPlainText();
  }

  updateWeakPhraseWarnings() {
    const updateWarning = (warning, text) => {
      if (!warning) return;
      const phrases = detectWeakPhrases(text);
      const phraseKey = phrases.join('|');
      warning.hidden = phrases.length === 0;
      if (warning.dataset.phrases === phraseKey) return;
      warning.dataset.phrases = phraseKey;
      warning.replaceChildren();
      if (!phrases.length) return;

      const label = document.createElement('span');
      label.className = 'weak-phrase-warning-label';
      label.textContent = 'Consider replacing:';
      warning.appendChild(label);
      phrases.forEach(phrase => {
        const chip = document.createElement('span');
        chip.className = 'weak-phrase-chip';
        chip.textContent = phrase;
        warning.appendChild(chip);
      });
    };

    updateWarning(
      document.querySelector('[data-weak-phrase-warning="summary"]'),
      this.state.personal?.summary
    );
    document.querySelectorAll('.exp-item').forEach(card => {
      updateWarning(
        card.querySelector('[data-weak-phrase-warning="experience"]'),
        card.querySelector('textarea[data-field="description"]')?.value
      );
    });
  }

  updateReadinessChecklist() {
    const checklist = document.getElementById('ats-flight-checklist');
    if (!checklist) return;

    const personal = this.state.personal || {};
    const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((personal.email || '').trim());
    const paper = document.getElementById('resume-paper');
    const container = document.getElementById('resume-container');
    let containerHeight = container?.scrollHeight || 0;
    let hasContainerLayout = Boolean(container?.clientHeight);
    if (paper && !hasContainerLayout && !document.getElementById('ats-modal')?.classList.contains('hidden')) {
      if (container) {
        const probe = paper.cloneNode(false);
        probe.removeAttribute('id');
        probe.classList.remove('scan-mode');
        probe.style.cssText = 'position:fixed;left:-10000px;top:0;visibility:hidden;transform:none;margin:0;';
        const content = container.cloneNode(true);
        content.removeAttribute('id');
        probe.appendChild(content);
        document.body.appendChild(probe);
        containerHeight = content.scrollHeight;
        hasContainerLayout = Boolean(content.clientHeight);
        probe.remove();
      }
    }
    const jobMatch = document.getElementById('job-match-score')?.textContent.trim() || '';
    const jobMatchScore = Number.parseInt(jobMatch, 10);
    const experiences = this.state.experiences || [];
    const resumeTextForChecks = [
      personal.summary || '',
      ...experiences.map(experience => experience.description || ''),
      ...(this.state.projects || []).map(project => project.description || '')
    ].join('\n');
    const weakPhrases = detectWeakPhrases(resumeTextForChecks);
    const isReady = {
      contact: Boolean(personal.fullName?.trim() && emailIsValid && personal.phone?.trim() && personal.location?.trim()),
      fit: Boolean(hasContainerLayout && containerHeight <= 1122),
      metrics: /\d/.test(resumeTextForChecks),
      cliches: weakPhrases.length === 0,
      'job-match': (this.state.targetJobDescription || '').trim().length >= 40 &&
        Number.isFinite(jobMatchScore) && jobMatchScore > 0
    };

    checklist.querySelectorAll('[data-flight-check]').forEach(item => {
      const status = item.querySelector('.pre-apply-status');
      if (!status) return;
      const ready = isReady[item.dataset.flightCheck] === true;
      status.dataset.status = ready ? 'ready' : 'attention';
      status.textContent = ready ? 'Ready' : 'Review';
      status.setAttribute('aria-label', ready ? 'Complete' : 'Needs attention');
    });
  }

  updateAtsScore() {
    const ats = calculateAtsScore(this.state);
    if (!this.atsReadyCelebrated && this.previousAtsScore < 90 && ats.score >= 90) {
      this.atsReadyCelebrated = true;
      this.showToast('ATS Ready! Your resume scored 90+', 'success');
      const scoreBadge = document.getElementById('ats-nav-score');
      scoreBadge?.classList.remove('ats-ready-pulse');
      void scoreBadge?.offsetWidth;
      scoreBadge?.classList.add('ats-ready-pulse');
      window.setTimeout(() => scoreBadge?.classList.remove('ats-ready-pulse'), 2200);
    }
    this.previousAtsScore = ats.score;
    
    // Update navbar mini meter
    const navScore = document.getElementById('ats-nav-score');
    const navPill = document.getElementById('btn-open-ats');
    if (navScore) navScore.textContent = `${ats.score}/100`;
    if (navPill) {
      navPill.style.borderColor = ats.badgeColor;
    }

    const progressScore = document.getElementById('resume-progress-score');
    const progressBar = document.getElementById('resume-progress-bar');
    const progressLabel = document.getElementById('resume-progress-label');
    if (progressScore) progressScore.textContent = `${ats.score}%`;
    if (progressBar) progressBar.style.width = `${ats.score}%`;
    if (progressLabel) {
      if (ats.score >= 90) progressLabel.textContent = 'Ready to apply';
      else if (ats.score >= 75) progressLabel.textContent = 'Strong — a few improvements left';
      else progressLabel.textContent = 'Add details to strengthen your resume';
    }

    // Modal contents
    const modalScore = document.getElementById('ats-modal-score');
    const modalRating = document.getElementById('ats-modal-rating');
    const modalChecks = document.getElementById('ats-modal-checks');
    const modalSuggestions = document.getElementById('ats-modal-suggestions');

    if (modalScore) modalScore.textContent = ats.score;
    if (modalRating) {
      modalRating.textContent = ats.rating;
      modalRating.style.color = ats.badgeColor;
    }

    if (modalChecks) {
      modalChecks.innerHTML = ats.checks.map(c => `
        <div class="flex items-center justify-between text-xs py-1.5 border-b border-slate-700/60">
          <span class="text-slate-300">${c.name}</span>
          <span class="font-bold font-mono ${c.score >= c.max * 0.7 ? 'text-green-400' : 'text-amber-400'}">${c.score} / ${c.max}</span>
        </div>
      `).join('');
    }

    if (modalSuggestions) {
      if (ats.suggestions.length === 0) {
        modalSuggestions.innerHTML = `
          <div class="p-3 bg-green-900/30 border border-green-700/50 rounded-lg text-xs text-green-300 flex items-center gap-2">
            <span>🎉 Outstanding job! Your resume is highly optimized for modern ATS parsers and human recruiters.</span>
          </div>
        `;
      } else {
        modalSuggestions.innerHTML = ats.suggestions.map(s => `
          <button type="button" class="ats-suggestion flex items-start gap-2 p-2.5 rounded-md text-xs ${
            s.type === 'danger' ? 'bg-red-950/40 border border-red-800/60 text-red-300' :
            s.type === 'warning' ? 'bg-amber-950/40 border border-amber-800/60 text-amber-300' :
            'bg-blue-950/40 border border-blue-800/60 text-blue-300'
          }" data-target-tab="${escapeHtml(s.targetTab)}" data-target-field-id="${escapeHtml(s.targetFieldId)}">
            <span class="font-bold flex-shrink-0">${s.type === 'danger' ? '❌' : s.type === 'warning' ? '⚠️' : '💡'}</span>
            <span class="leading-relaxed">${escapeHtml(s.text)}</span>
            <span class="ats-suggestion-fix">Fix →</span>
          </button>
        `).join('');
      }
    }
    this.updateAtsPlainTextPreview();
    this.updateJobMatch();
    this.updateWeakPhraseWarnings();
    this.updateReadinessChecklist();
  }

  setupAtsModal() {
    const modal = document.getElementById('ats-modal');
    const openBtn = document.getElementById('btn-open-ats');
    const closeBtn = document.getElementById('btn-close-ats');
    const footerCloseBtn = document.getElementById('btn-close-ats-footer');
    const plainTextToggle = document.getElementById('btn-ats-plain-text-toggle');
    const plainTextPreview = document.getElementById('ats-plain-text-preview');
    const suggestions = document.getElementById('ats-modal-suggestions');

    suggestions?.addEventListener('click', event => {
      const suggestion = event.target.closest('.ats-suggestion');
      if (!suggestion) return;
      this.navigateToAtsTarget(suggestion.dataset.targetTab, suggestion.dataset.targetFieldId);
    });

    openBtn?.addEventListener('click', () => {
      modal?.classList.remove('hidden');
      this.updateAtsScore();
    });

    closeBtn?.addEventListener('click', () => {
      modal?.classList.add('hidden');
    });

    footerCloseBtn?.addEventListener('click', () => {
      modal?.classList.add('hidden');
    });

    plainTextToggle?.addEventListener('click', () => {
      const expanded = plainTextToggle.getAttribute('aria-expanded') === 'true';
      plainTextToggle.setAttribute('aria-expanded', String(!expanded));
      plainTextPreview?.classList.toggle('hidden', expanded);
      this.updateAtsPlainTextPreview();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
        modal.classList.add('hidden');
        openBtn?.focus();
      }
    });

    modal?.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.add('hidden');
      }
    });
  }

  navigateToAtsTarget(targetTab, targetFieldId) {
    document.getElementById('ats-modal')?.classList.add('hidden');
    if (window.innerWidth < 1024) document.getElementById('mobile-tab-editor')?.click();
    const tab = [...document.querySelectorAll('.editor-tab')]
      .find(button => button.dataset.tab === targetTab);
    tab?.click();

    const target = document.getElementById(targetFieldId);
    if (!target) {
      this.showToast('That ATS fix is no longer available. Review the selected editor section.', 'warning');
      return;
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.focus({ preventScroll: true });
    target.classList.add('ats-target-highlight');
    window.setTimeout(() => target.classList.remove('ats-target-highlight'), 2400);
  }

  // ----------------------------------------------------
  // Export & Import Tools (PDF, JSON, Print)
  // ----------------------------------------------------
  setupExportImport() {
    // Print Dialog (Ctrl+P / Print Button)
    document.getElementById('btn-print-resume')?.addEventListener('click', () => {
      window.print();
    });

    // PDF Download via html2pdf
    document.getElementById('btn-download-pdf')?.addEventListener('click', () => {
      const element = document.getElementById('resume-container');
      const documentName = this.activePreviewDocument === 'cover-letter' ? 'cover_letter' : 'resume';
      const filename = `${(this.state.personal.fullName || 'resume').toLowerCase().replace(/\s+/g, '_')}_${documentName}.pdf`;

      const opt = {
        margin: 0,
        filename: filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      if (window.html2pdf) {
        const btn = document.getElementById('btn-download-pdf');
        const originalText = btn.innerHTML;
        btn.innerHTML = `<span class="animate-spin inline-block mr-1">⏳</span> Generating PDF...`;
        btn.disabled = true;

        window.html2pdf().set(opt).from(element).save().then(() => {
          btn.innerHTML = originalText;
          btn.disabled = false;
          this.showToast('PDF exported successfully', 'success');
        }).catch(err => {
          console.error('html2pdf error:', err);
          btn.innerHTML = originalText;
          btn.disabled = false;
          // Fallback to browser print
          window.print();
        });
      } else {
        window.print();
      }
    });

    // JSON Export
    document.getElementById('btn-export-json')?.addEventListener('click', () => {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(this.state, null, 2));
      const downloadAnchor = document.createElement('a');
      const filename = `${(this.state.personal.fullName || 'resume').toLowerCase().replace(/\s+/g, '_')}_data.json`;
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', filename);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      this.showToast('Resume backup downloaded', 'success');
    });

    // JSON Import
    const importFileInput = document.getElementById('import-json-input');
    document.getElementById('btn-trigger-import')?.addEventListener('click', () => {
      importFileInput?.click();
    });

    importFileInput?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        if (file.size > 5 * 1024 * 1024) {
          alert('Resume JSON files must be smaller than 5 MB.');
          e.target.value = '';
          return;
        }
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const parsed = JSON.parse(event.target.result);
            if (parsed.personal && typeof parsed.personal === 'object' && parsed.theme && typeof parsed.theme === 'object') {
              this.state = this.storage.normalizeState(parsed);
              this.resetHistory();
              this.populateEditorForms();
              this.setupThemeControls();
              this.saveState();
                this.showToast('Resume data imported successfully', 'success');
            } else {
              alert('Invalid resume JSON format.');
            }
          } catch (err) {
            alert('Error parsing JSON file: ' + err.message);
          }
        };
        reader.readAsText(file);
      }
    });

    // Reset All Data Button
    document.getElementById('btn-reset-data')?.addEventListener('click', () => {
      if (confirm('Reset to initial default demo resume?')) {
        this.state = this.storage.normalizeState(INITIAL_DATA);
        this.resetHistory();
        this.populateEditorForms();
        this.setupThemeControls();
        this.saveState();
        this.showToast('Demo resume restored', 'success');
      }
    });
  }
}

// Initialize on DOM Ready
window.addEventListener('DOMContentLoaded', () => {
  window.app = new ResumeCraftApp();
});
