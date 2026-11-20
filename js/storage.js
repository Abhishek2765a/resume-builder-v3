/**
 * ResumeCraft - Workspace persistence, migration, and backup helpers
 */
import { INITIAL_DATA, RESUME_TEMPLATES } from './data.js';

export const LEGACY_STORAGE_KEY = 'resumecraft_saved_data_v2';
export const WORKSPACE_STORAGE_KEY = 'resumecraft_workspace_v1';
export const GEMINI_API_KEY_STORAGE_KEY = 'resumecraft_gemini_api_key_v1';
export const APPLICATION_STAGES = ['Saved', 'Preparing', 'Applied', 'Interview', 'Offer', 'Closed'];

export const RESUME_SECTIONS = [
  { key: 'summary', label: 'Professional Summary' },
  { key: 'experience', label: 'Experience' },
  { key: 'skills', label: 'Skills' },
  { key: 'projects', label: 'Projects' },
  { key: 'education', label: 'Education' },
  { key: 'certifications', label: 'Certifications' },
  { key: 'languages', label: 'Languages' },
  { key: 'customSections', label: 'Custom Sections' }
];

const TEMPLATE_KEYS = new Set(RESUME_TEMPLATES.flatMap(template => [template.id, template.layout]));

function isValidDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export class WorkspaceStorage {
  hasLegacyResume() {
    try {
      return Boolean(localStorage.getItem(LEGACY_STORAGE_KEY));
    } catch (error) {
      console.warn('Could not inspect the previous resume backup:', error);
      return false;
    }
  }

  loadWorkspace() {
    try {
      const saved = localStorage.getItem(WORKSPACE_STORAGE_KEY);
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      if (!parsed || typeof parsed !== 'object' || parsed.version !== 1 ||
          !parsed.masterResume || typeof parsed.masterResume !== 'object') {
        console.warn('Saved workspace has an invalid format; using the existing resume backup.');
        return null;
      }

      const masterResume = this.normalizeState(parsed.masterResume);
      const rawApplications = Array.isArray(parsed.applications) ? parsed.applications : [];
      return {
        masterResume,
        applications: rawApplications
          .filter(application => application && typeof application === 'object')
          .map(application => this.normalizeApplication(application, masterResume)),
        notificationsEnabled: parsed.notificationsEnabled === true &&
          'Notification' in window && Notification.permission === 'granted'
      };
    } catch (error) {
      console.warn('Failed to load saved application workspace:', error);
      return null;
    }
  }

  normalizeApplication(raw, fallbackResume) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const coverLetterSource = source.coverLetter && typeof source.coverLetter === 'object'
      ? source.coverLetter
      : {};
    const interviewPrepSource = source.interviewPrep && typeof source.interviewPrep === 'object'
      ? source.interviewPrep
      : {};
    return {
      id: typeof source.id === 'string' && source.id ? source.id : `application-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      company: typeof source.company === 'string' ? source.company : '',
      role: typeof source.role === 'string' ? source.role : '',
      url: typeof source.url === 'string' ? source.url : '',
      jobDescription: typeof source.jobDescription === 'string' ? source.jobDescription : '',
      stage: APPLICATION_STAGES.includes(source.stage) ? source.stage : 'Saved',
      deadline: isValidDateOnly(source.deadline) ? source.deadline : '',
      notes: typeof source.notes === 'string' ? source.notes : '',
      coverLetter: {
        recipient: typeof coverLetterSource.recipient === 'string' ? coverLetterSource.recipient : '',
        date: isValidDateOnly(coverLetterSource.date) ? coverLetterSource.date : '',
        body: typeof coverLetterSource.body === 'string' ? coverLetterSource.body : ''
      },
      interviewPrep: {
        mockQuestions: typeof interviewPrepSource.mockQuestions === 'string' ? interviewPrepSource.mockQuestions : '',
        starStories: typeof interviewPrepSource.starStories === 'string' ? interviewPrepSource.starStories : '',
        followUpEmail: typeof interviewPrepSource.followUpEmail === 'string' ? interviewPrepSource.followUpEmail : ''
      },
      createdAt: Number.isFinite(source.createdAt) ? source.createdAt : Date.now(),
      lastReminderDate: typeof source.lastReminderDate === 'string' ? source.lastReminderDate : '',
      resume: this.normalizeState(source.resume && typeof source.resume === 'object' ? source.resume : fallbackResume)
    };
  }

  writeWorkspace(workspace) {
    try {
      localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({
        version: 1,
        masterResume: workspace.masterResume,
        applications: workspace.applications,
        notificationsEnabled: workspace.notificationsEnabled
      }));
      return true;
    } catch (error) {
      console.warn('Failed to save application workspace:', error);
      return false;
    }
  }

  persistInitialWorkspace(workspace) {
    let legacyData = null;
    try {
      legacyData = localStorage.getItem(LEGACY_STORAGE_KEY);
    } catch (error) {
      console.warn('Could not inspect the previous resume backup:', error);
    }

    let saved = this.writeWorkspace(workspace);
    let retriedWithoutLegacyBackup = false;
    if (!saved && legacyData) {
      try {
        localStorage.removeItem(LEGACY_STORAGE_KEY);
        retriedWithoutLegacyBackup = true;
        saved = this.writeWorkspace(workspace);
        if (!saved) localStorage.setItem(LEGACY_STORAGE_KEY, legacyData);
      } catch (error) {
        console.warn('Could not complete the resume workspace migration:', error);
      }
    } else if (saved && legacyData) {
      try {
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      } catch (error) {
        console.warn('Could not remove the migrated resume backup key:', error);
      }
    }
    return {
      saved,
      showFailureToast: !saved && (!legacyData || retriedWithoutLegacyBackup)
    };
  }

  loadState() {
    try {
      const saved = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (saved) return this.normalizeState(JSON.parse(saved));
    } catch (error) {
      console.warn('Failed to load saved state from localStorage:', error);
    }
    return this.normalizeState(JSON.parse(JSON.stringify(INITIAL_DATA)));
  }

  normalizeState(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const initial = JSON.parse(JSON.stringify(INITIAL_DATA));
    const theme = { ...initial.theme, ...(source.theme && typeof source.theme === 'object' ? source.theme : {}) };
    if (typeof theme.template !== 'string' || !TEMPLATE_KEYS.has(theme.template)) {
      theme.template = initial.theme.template;
    }
    if (!/^#[0-9a-f]{6}$/i.test(theme.primaryColor || '')) theme.primaryColor = initial.theme.primaryColor;
    if (!/^#[0-9a-f]{6}$/i.test(theme.secondaryColor || '')) theme.secondaryColor = initial.theme.secondaryColor;
    const sectionKeys = new Set(RESUME_SECTIONS.map(section => section.key));
    const defaultSectionOrder = Array.isArray(initial.theme.sectionOrder)
      ? initial.theme.sectionOrder
      : RESUME_SECTIONS.map(section => section.key);
    const requestedOrder = Array.isArray(theme.sectionOrder) ? theme.sectionOrder : defaultSectionOrder;
    const sectionOrder = [...new Set(requestedOrder.filter(key => sectionKeys.has(key)))];
    defaultSectionOrder.forEach(key => {
      if (!sectionOrder.includes(key)) sectionOrder.push(key);
    });
    const hiddenSections = Array.isArray(theme.hiddenSections)
      ? [...new Set(theme.hiddenSections.filter(key => sectionKeys.has(key)))]
      : [];
    theme.sectionOrder = sectionOrder;
    theme.hiddenSections = hiddenSections;
    const personal = { ...initial.personal, ...(source.personal && typeof source.personal === 'object' ? source.personal : {}) };

    const copyArray = key => Array.isArray(source[key])
      ? source[key].filter(item => item && typeof item === 'object')
      : initial[key];
    return {
      theme,
      personal,
      experiences: copyArray('experiences'),
      education: copyArray('education'),
      skills: copyArray('skills'),
      projects: copyArray('projects'),
      certifications: copyArray('certifications'),
      languages: copyArray('languages'),
      customSections: copyArray('customSections'),
      targetJobDescription: typeof source.targetJobDescription === 'string' ? source.targetJobDescription : ''
    };
  }

  exportWorkspace(workspace) {
    const content = JSON.stringify({
      version: 1,
      masterResume: workspace.masterResume,
      applications: workspace.applications,
      notificationsEnabled: workspace.notificationsEnabled
    }, null, 2);
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'resumecraft-workspace.json';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  parseWorkspaceBackup(content) {
    const parsed = JSON.parse(content);
    if (!parsed || parsed.version !== 1 || !parsed.masterResume || typeof parsed.masterResume !== 'object' ||
        !Array.isArray(parsed.applications) || parsed.applications.length > 500 ||
        parsed.applications.some(application => !application || typeof application !== 'object' ||
          typeof application.company !== 'string' || typeof application.role !== 'string')) {
      throw new Error('The selected file is not a supported ResumeCraft workspace backup.');
    }
    const masterResume = this.normalizeState(parsed.masterResume);
    return {
      masterResume,
      applications: parsed.applications.map(application => this.normalizeApplication(application, masterResume)),
      notificationsEnabled: parsed.notificationsEnabled === true &&
        'Notification' in window && Notification.permission === 'granted'
    };
  }

  removeLegacyResume() {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  }

  readAppearance() {
    return localStorage.getItem('resumecraft_appearance_v1');
  }

  writeAppearance(appearance) {
    localStorage.setItem('resumecraft_appearance_v1', appearance);
  }

  getGeminiApiKey() {
    return localStorage.getItem(GEMINI_API_KEY_STORAGE_KEY) || '';
  }

  setGeminiApiKey(apiKey) {
    localStorage.setItem(GEMINI_API_KEY_STORAGE_KEY, apiKey);
  }

  clearGeminiApiKey() {
    localStorage.removeItem(GEMINI_API_KEY_STORAGE_KEY);
  }
}
