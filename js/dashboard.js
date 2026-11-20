/**
 * ResumeCraft - Application Studio dashboard and deadline reminders
 */
import { APPLICATION_STAGES } from './storage.js';

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export class ApplicationDashboard {
  constructor(app) {
    this.app = app;
    this.reminderTimer = null;
    this.viewMode = 'cards';
    this.draggedApplicationId = null;
  }

  setup() {
    document.getElementById('btn-open-dashboard')?.addEventListener('click', () => this.showDashboard());
    document.getElementById('btn-dashboard-master')?.addEventListener('click', () => this.app.openMasterResume());
    document.getElementById('btn-dashboard-new')?.addEventListener('click', () => this.openApplicationModal());
    document.querySelector('[data-open-new-application]')?.addEventListener('click', () => this.openApplicationModal());
    document.getElementById('application-filter')?.addEventListener('change', () => this.renderDashboard());
    document.querySelectorAll('[data-application-view]').forEach(button => {
      button.addEventListener('click', () => {
        if (!['cards', 'board'].includes(button.dataset.applicationView)) return;
        this.viewMode = button.dataset.applicationView;
        this.renderDashboard();
      });
    });
    document.getElementById('application-list')?.addEventListener('click', event => this.handleApplicationAction(event));
    document.getElementById('application-list')?.addEventListener('change', event => this.handleApplicationStageChange(event));
    document.getElementById('application-list')?.addEventListener('dragstart', event => {
      const card = event.target.closest('[data-board-card][data-application-id]');
      if (!card || !event.dataTransfer) return;
      this.draggedApplicationId = card.dataset.applicationId;
      event.dataTransfer.setData('text/plain', card.dataset.applicationId);
      event.dataTransfer.effectAllowed = 'move';
      card.classList.add('is-dragging');
    });
    document.getElementById('application-list')?.addEventListener('dragend', event => {
      event.target.closest('[data-board-card]')?.classList.remove('is-dragging');
      this.draggedApplicationId = null;
      document.querySelectorAll('.application-board-column.is-drop-target').forEach(column => {
        column.classList.remove('is-drop-target');
      });
    });
    document.getElementById('application-list')?.addEventListener('dragover', event => {
      const column = event.target.closest('[data-board-stage]');
      if (!column) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      column.classList.add('is-drop-target');
    });
    document.getElementById('application-list')?.addEventListener('dragleave', event => {
      const column = event.target.closest('[data-board-stage]');
      if (column && !column.contains(event.relatedTarget)) column.classList.remove('is-drop-target');
    });
    document.getElementById('application-list')?.addEventListener('drop', event => {
      const column = event.target.closest('[data-board-stage]');
      if (!column) return;
      event.preventDefault();
      const applicationId = event.dataTransfer?.getData('text/plain') || this.draggedApplicationId;
      this.moveApplicationToStage(applicationId, column.dataset.boardStage);
    });

    const form = document.getElementById('application-form');
    form?.addEventListener('submit', event => this.saveApplicationForm(event));
    document.getElementById('btn-close-application-modal')?.addEventListener('click', () => this.closeApplicationModal());
    document.getElementById('btn-cancel-application')?.addEventListener('click', () => this.closeApplicationModal());
    document.getElementById('application-modal')?.addEventListener('click', event => {
      if (event.target.id === 'application-modal') this.closeApplicationModal();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !document.getElementById('application-modal')?.classList.contains('hidden')) {
        this.closeApplicationModal();
      }
    });

    document.getElementById('btn-enable-reminders')?.addEventListener('click', () => this.enableReminders());
    document.getElementById('btn-export-workspace')?.addEventListener('click', () => {
      this.app.storage.exportWorkspace(this.app.workspaceSnapshot());
      this.app.showToast('Workspace backup downloaded', 'success');
    });
    const importButton = document.getElementById('btn-import-workspace');
    const importInput = document.getElementById('workspace-import-input');
    importButton?.addEventListener('click', () => importInput?.click());
    importInput?.addEventListener('change', event => this.app.importWorkspaceFile(event));

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !document.getElementById('dashboard-screen')?.classList.contains('hidden')) {
        this.checkDeadlineReminders();
      }
    });
    this.reminderTimer = window.setInterval(() => {
      if (!document.hidden && !document.getElementById('dashboard-screen')?.classList.contains('hidden')) {
        this.checkDeadlineReminders();
      }
    }, 30 * 60 * 1000);
    this.renderDashboard();
  }

  updateWorkspaceLabel() {
    const label = document.getElementById('active-workspace-label');
    if (!label) return;
    const application = this.app.activeApplicationId
      ? this.app.applications.find(item => item.id === this.app.activeApplicationId)
      : null;
    label.textContent = application ? `${application.role} · ${application.company}` : 'Master resume';
  }

  showDashboard() {
    document.getElementById('landing-screen')?.classList.add('hidden');
    document.getElementById('dashboard-screen')?.classList.remove('hidden');
    document.getElementById('app-header')?.classList.add('hidden');
    document.getElementById('app-workspace')?.classList.add('hidden');
    this.renderDashboard();
    this.checkDeadlineReminders();
  }

  openApplicationModal(application = null) {
    const form = document.getElementById('application-form');
    const modal = document.getElementById('application-modal');
    if (!form || !modal) return;
    form.reset();
    document.getElementById('application-id').value = application?.id || '';
    document.getElementById('application-company').value = application?.company || '';
    document.getElementById('application-role').value = application?.role || '';
    document.getElementById('application-url').value = application?.url || '';
    document.getElementById('application-stage').value = application?.stage || 'Saved';
    document.getElementById('application-deadline').value = application?.deadline || '';
    document.getElementById('application-description').value = application?.jobDescription || '';
    document.getElementById('application-notes').value = application?.notes || '';
    document.getElementById('application-modal-title').textContent = application ? 'Edit application' : 'New application';
    document.getElementById('application-form-error')?.classList.add('hidden');
    modal.classList.remove('hidden');
    document.getElementById('application-company')?.focus();
  }

  closeApplicationModal() {
    document.getElementById('application-modal')?.classList.add('hidden');
  }

  saveApplicationForm(event) {
    event.preventDefault();
    const company = document.getElementById('application-company').value.trim();
    const role = document.getElementById('application-role').value.trim();
    const url = document.getElementById('application-url').value.trim();
    if (!company || !role) {
      this.showApplicationFormError('Add both a company and role to continue.');
      return;
    }
    if (url) {
      try {
        const parsedUrl = new URL(url);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('Unsupported protocol');
      } catch {
        this.showApplicationFormError('Enter a valid http or https job post link.');
        return;
      }
    }

    const app = this.app;
    const existingId = document.getElementById('application-id').value;
    const existing = existingId ? app.applications.find(item => item.id === existingId) : null;
    if (existingId && !existing) {
      this.showApplicationFormError('This application no longer exists. Close this form and try again.');
      return;
    }
    const application = {
      ...(existing || {}),
      id: existing?.id || `application-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      company,
      role,
      url,
      stage: APPLICATION_STAGES.includes(document.getElementById('application-stage').value)
        ? document.getElementById('application-stage').value : 'Saved',
      deadline: document.getElementById('application-deadline').value,
      jobDescription: document.getElementById('application-description').value.trim(),
      notes: document.getElementById('application-notes').value.trim(),
      coverLetter: existing?.coverLetter || { recipient: '', date: '', body: '' },
      interviewPrep: existing?.interviewPrep || { mockQuestions: '', starStories: '', followUpEmail: '' },
      createdAt: existing?.createdAt || Date.now(),
      lastReminderDate: existing?.lastReminderDate || '',
      resume: existing ? existing.resume : app.cloneResume(app.masterState)
    };
    application.resume.targetJobDescription = application.jobDescription;

    if (existing) {
      app.applications = app.applications.map(item => item.id === existing.id ? application : item);
    } else {
      app.applications.unshift(application);
    }
    if (!app.saveWorkspace()) return;
    this.closeApplicationModal();
    this.renderDashboard();
    app.showToast(existing ? 'Application updated' : 'Application workspace created', 'success');
    if (!existing) app.openApplicationResume(application.id);
  }

  showApplicationFormError(message) {
    const errorEl = document.getElementById('application-form-error');
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
  }

  handleApplicationAction(event) {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const card = button.closest('[data-application-id]');
    const app = this.app;
    const application = app.applications.find(item => item.id === card?.dataset.applicationId);
    if (!application) return;
    switch (button.dataset.action) {
      case 'open':
        app.openApplicationResume(application.id);
        break;
      case 'edit':
        this.openApplicationModal(application);
        break;
      case 'delete':
        if (window.confirm(`Delete the ${application.role} application at ${application.company}? Its tailored resume will also be removed.`)) {
          app.applications = app.applications.filter(item => item.id !== application.id);
          if (!app.saveWorkspace()) return;
          if (app.activeApplicationId === application.id) {
            app.activeApplicationId = null;
            app.state = app.cloneResume(app.masterState);
            this.updateWorkspaceLabel();
          }
          this.renderDashboard();
          app.showToast('Application deleted');
        }
        break;
      case 'visit':
        if (application.url) window.open(application.url, '_blank', 'noopener,noreferrer');
        break;
    }
  }

  handleApplicationStageChange(event) {
    const select = event.target.closest('[data-application-stage]');
    if (!select) return;
    const card = select.closest('[data-application-id]');
    const app = this.app;
    const application = app.applications.find(item => item.id === card?.dataset.applicationId);
    if (!application || !APPLICATION_STAGES.includes(select.value)) return;
    application.stage = select.value;
    if (!app.saveWorkspace()) return;
    this.renderDashboard();
    app.showToast('Application stage updated', 'success');
  }

  moveApplicationToStage(applicationId, stage) {
    const application = this.app.applications.find(item => item.id === applicationId);
    if (!application || !APPLICATION_STAGES.includes(stage) || application.stage === stage) return;
    application.stage = stage;
    if (!this.app.saveWorkspace()) return;
    this.renderDashboard();
    this.app.showToast(`Application moved to ${stage}`, 'success');
  }

  renderApplicationCard(application, today, boardMode = false) {
    const deadlineDate = application.deadline ? new Date(`${application.deadline}T00:00:00`) : null;
    const deadlineDays = deadlineDate ? Math.round((deadlineDate - today) / 86400000) : null;
    const deadlineText = deadlineDate
      ? (deadlineDays < 0
        ? `Overdue by ${Math.abs(deadlineDays)} day${deadlineDays === -1 ? '' : 's'}`
        : `Deadline ${deadlineDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`)
      : 'No deadline';
    const deadlineClass = deadlineDays !== null && deadlineDays < 0
      ? 'deadline-overdue'
      : deadlineDays !== null && deadlineDays <= 2 ? 'deadline-soon' : '';
    const safeUrl = this.safeHttpUrl(application.url);
    const notes = application.notes ? escapeHtml(application.notes).replace(/\n/g, ' ') : 'Add notes to keep your next step close at hand.';
    return `
      <article class="application-card" data-board-card data-application-id="${escapeHtml(application.id)}" ${boardMode ? 'draggable="true"' : ''}>
        <div class="application-card-top">
          <div>
            <h3>${escapeHtml(application.role || 'Untitled role')}</h3>
            <p class="application-company">${escapeHtml(application.company || 'Company not set')}</p>
          </div>
          <select class="application-stage" data-application-stage aria-label="Stage for ${escapeHtml(application.company)}">
            ${APPLICATION_STAGES.map(stage => `<option value="${stage}" ${application.stage === stage ? 'selected' : ''}>${stage}</option>`).join('')}
          </select>
        </div>
        <div class="application-card-meta">
          <span class="${deadlineClass}">${deadlineText}</span>
          ${safeUrl ? '<span>Job post saved</span>' : '<span>Resume tailored workspace</span>'}
        </div>
        <p class="application-notes-preview">${notes}</p>
        <div class="application-card-footer">
          <span class="dashboard-caption">Created ${new Date(application.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
          <div class="application-card-actions">
            <button type="button" class="dashboard-card-button" data-action="open">Open resume</button>
            ${safeUrl ? '<button type="button" class="dashboard-card-button" data-action="visit">Job post</button>' : ''}
            <button type="button" class="dashboard-card-button" data-action="edit">Edit</button>
            <button type="button" class="dashboard-card-button danger" data-action="delete">Delete</button>
          </div>
        </div>
      </article>`;
  }

  renderBoard(applications, today) {
    return APPLICATION_STAGES.map(stage => {
      const stageApplications = applications.filter(application => application.stage === stage);
      return `
        <section class="application-board-column" data-board-stage="${stage}" aria-label="${stage} applications">
          <div class="application-board-column-heading">
            <h3>${stage}</h3>
            <span>${stageApplications.length}</span>
          </div>
          <div class="application-board-cards">
            ${stageApplications.length
              ? stageApplications.map(application => this.renderApplicationCard(application, today, true)).join('')
              : '<p class="application-board-empty">No applications</p>'}
          </div>
        </section>`;
    }).join('');
  }

  renderDashboard() {
    const list = document.getElementById('application-list');
    if (!list) return;
    const app = this.app;
    const filter = document.getElementById('application-filter')?.value || 'all';
    const visibleApplications = app.applications.filter(application => {
      if (filter === 'active') return application.stage !== 'Closed';
      if (filter === 'closed') return application.stage === 'Closed';
      return true;
    });
    document.querySelectorAll('[data-application-view]').forEach(button => {
      const active = button.dataset.applicationView === this.viewMode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    const activeCount = app.applications.filter(application => application.stage !== 'Closed').length;
    const interviewCount = app.applications.filter(application => application.stage === 'Interview').length;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcomingCount = app.applications.filter(application => {
      if (!application.deadline || application.stage === 'Closed') return false;
      const deadline = new Date(`${application.deadline}T00:00:00`);
      const days = Math.round((deadline - today) / 86400000);
      return days >= 0 && days <= 7;
    }).length;
    document.getElementById('stat-active-apps').textContent = activeCount;
    document.getElementById('stat-interviews').textContent = interviewCount;
    document.getElementById('stat-upcoming').textContent = upcomingCount;

    list.classList.toggle('application-grid', this.viewMode === 'cards');
    list.classList.toggle('application-board', this.viewMode === 'board');
    list.innerHTML = this.viewMode === 'board'
      ? this.renderBoard(visibleApplications, today)
      : visibleApplications.map(application => this.renderApplicationCard(application, today)).join('');

    const emptyState = document.getElementById('dashboard-empty-state');
    emptyState?.classList.toggle('hidden', app.applications.length > 0);
    list.classList.toggle('hidden', visibleApplications.length === 0);
    if (emptyState && app.applications.length > 0 && visibleApplications.length === 0) {
      emptyState.classList.remove('hidden');
      emptyState.querySelector('h2').textContent = 'No applications in this view.';
      emptyState.querySelector('p').textContent = 'Choose a different filter to see your saved opportunities.';
      emptyState.querySelector('[data-open-new-application]')?.classList.add('hidden');
    } else if (emptyState) {
      emptyState.querySelector('h2').textContent = 'Your next chapter starts here.';
      emptyState.querySelector('p').textContent = 'Create an application workspace to keep a job post, tailored resume, notes, and deadline together.';
      emptyState.querySelector('[data-open-new-application]')?.classList.remove('hidden');
    }
    this.updateReminderButton();
    app.initLucide();
  }

  safeHttpUrl(value) {
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch {
      return '';
    }
  }

  updateReminderButton() {
    const button = document.getElementById('btn-enable-reminders');
    const available = 'Notification' in window && Notification.permission === 'granted';
    if (button) button.textContent = this.app.notificationsEnabled && available ? 'Reminders on' : 'Enable reminders';
  }

  async enableReminders() {
    const app = this.app;
    if (!('Notification' in window)) {
      app.showToast('Browser reminders are not supported here.', 'warning');
      return;
    }
    if (!window.isSecureContext) {
      app.showToast('Reminders need a secure page (HTTPS or localhost).', 'warning');
      return;
    }
    let permission = Notification.permission;
    if (permission === 'default') permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      app.notificationsEnabled = false;
      app.saveWorkspace();
      this.updateReminderButton();
      app.showToast('Notifications were not enabled. You can still track deadlines here.');
      return;
    }
    app.notificationsEnabled = true;
    if (!app.saveWorkspace()) {
      app.notificationsEnabled = false;
      return;
    }
    this.updateReminderButton();
    app.showToast('Reminders enabled while this page is open.', 'success');
    this.checkDeadlineReminders();
  }

  checkDeadlineReminders() {
    const app = this.app;
    if (!app.notificationsEnabled || !('Notification' in window) || Notification.permission !== 'granted') return;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    let changed = false;
    app.applications.forEach(application => {
      if (!application.deadline || application.stage === 'Closed' || application.lastReminderDate === todayKey) return;
      const deadline = new Date(`${application.deadline}T00:00:00`);
      const days = Math.round((deadline - today) / 86400000);
      if (days < 0 || days > 2) return;
      const when = days === 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`;
      new Notification(`Application deadline ${when}`, {
        body: `${application.role} at ${application.company}`,
        tag: application.id
      });
      application.lastReminderDate = todayKey;
      changed = true;
    });
    if (changed) app.saveWorkspace();
  }
}
