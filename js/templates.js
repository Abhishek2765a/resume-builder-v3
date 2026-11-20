/**
 * ResumeCraft - Multi-Template Resume Render Engines
 */
import { FONT_OPTIONS, RESUME_TEMPLATES } from './data.js';

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const RESUME_SECTION_KEYS = ['summary', 'experience', 'skills', 'projects', 'education', 'certifications', 'languages', 'customSections'];

function renderOrderedSections(theme, sections) {
  const validKeys = new Set(RESUME_SECTION_KEYS);
  const requestedOrder = Array.isArray(theme.sectionOrder) ? theme.sectionOrder : RESUME_SECTION_KEYS;
  const order = [...new Set(requestedOrder.filter(key => validKeys.has(key)))];
  RESUME_SECTION_KEYS.forEach(key => {
    if (!order.includes(key)) order.push(key);
  });
  const hidden = new Set(Array.isArray(theme.hiddenSections) ? theme.hiddenSections : []);
  return order
    .filter(key => !hidden.has(key))
    .map(key => sections[key] || '')
    .join('');
}

function safeUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(String(value), 'https://resume.local/');
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function validThemeColor(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(value || '') ? value : fallback;
}

function safeExternalUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^mailto:/i.test(raw)) {
    const email = raw.slice(7);
    return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email) ? `mailto:${email}` : '';
  }
  if (/^tel:/i.test(raw)) {
    const phone = raw.slice(4);
    if (!/^[+()\d.\-\s]+$/.test(phone)) return '';
    const normalizedPhone = phone.replace(/[^\d+]/g, '');
    return /^\+?\d{3,15}$/.test(normalizedPhone) ? `tel:${normalizedPhone}` : '';
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    return /^https?:/i.test(raw) ? safeUrl(raw) : '';
  }
  return safeUrl(`https://${raw}`);
}

function renderContactDetails(person, className = '') {
  const contacts = [
    person.email ? escapeHtml(person.email) : '',
    person.phone ? escapeHtml(person.phone) : '',
    person.location ? escapeHtml(person.location) : '',
    ...['website', 'linkedin', 'github'].map(key => {
      if (!person[key]) return '';
      const url = safeExternalUrl(person[key]);
      return url
        ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(person[key].replace(/^https?:\/\//i, ''))}</a>`
        : escapeHtml(person[key]);
    })
  ].filter(Boolean);
  return `<div class="${className}">${contacts.join('<span aria-hidden="true">·</span>')}</div>`;
}

function templateSectionHeading(title, primary, variant) {
  if (variant === 'developer') {
    return `<h2 class="developer-section-heading"><span style="color:${primary}">//</span> ${escapeHtml(title)}</h2>`;
  }
  const className = variant === 'compact-ats' ? 'compact-ats-heading' : 'custom-template-heading';
  return `<h2 class="${className}" style="--template-accent:${primary}">${escapeHtml(title)}</h2>`;
}

function createCustomTemplateSections(data, primary, variant) {
  const p = data.personal || {};
  const heading = title => templateSectionHeading(title, primary, variant);
  return {
    summary: p.summary ? `
      <section class="custom-resume-section section-summary">
        ${heading('Professional Summary')}
        <p>${escapeHtml(p.summary)}</p>
      </section>
    ` : '',
    experience: data.experiences?.length ? `
      <section class="custom-resume-section section-experience">
        ${heading('Experience')}
        <div class="custom-template-items">
          ${data.experiences.map(exp => `
            <article>
              <div class="custom-template-item-heading">
                <strong>${escapeHtml(exp.role)}</strong>
                <span>${formatDate(exp.startDate)} – ${exp.current ? 'Present' : formatDate(exp.endDate)}</span>
              </div>
              <div class="custom-template-item-meta">${escapeHtml(exp.company)}${exp.location ? ` · ${escapeHtml(exp.location)}` : ''}</div>
              ${renderBullets(exp.description)}
            </article>
          `).join('')}
        </div>
      </section>
    ` : '',
    skills: data.skills?.length ? `
      <section class="custom-resume-section section-skills">
        ${heading('Skills')}
        <div class="custom-template-items">
          ${data.skills.map(group => `
            <div class="custom-template-skill-group">
              <strong>${escapeHtml(group.category)}</strong>
              <span>${(group.items || []).map(escapeHtml).join(' · ')}</span>
            </div>
          `).join('')}
        </div>
      </section>
    ` : '',
    projects: data.projects?.length ? `
      <section class="custom-resume-section section-projects">
        ${heading('Projects')}
        <div class="custom-template-items">
          ${data.projects.map(project => {
            const url = safeExternalUrl(project.link);
            return `
              <article>
                <div class="custom-template-item-heading">
                  <strong>${escapeHtml(project.title)}</strong>
                  ${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Project ↗</a>` : ''}
                </div>
                ${project.tech ? `<div class="custom-template-item-meta">${escapeHtml(project.tech)}</div>` : ''}
                <p>${escapeHtml(project.description)}</p>
              </article>
            `;
          }).join('')}
        </div>
      </section>
    ` : '',
    education: data.education?.length ? `
      <section class="custom-resume-section section-education">
        ${heading('Education')}
        <div class="custom-template-items">
          ${data.education.map(education => `
            <article>
              <div class="custom-template-item-heading">
                <strong>${escapeHtml(education.degree)}</strong>
                <span>${formatDate(education.startDate)} – ${formatDate(education.endDate)}</span>
              </div>
              <div class="custom-template-item-meta">${escapeHtml(education.school)}${education.location ? ` · ${escapeHtml(education.location)}` : ''}</div>
              ${education.grade || education.honors ? `<p>${escapeHtml(education.grade || '')}${education.grade && education.honors ? ' · ' : ''}${escapeHtml(education.honors || '')}</p>` : ''}
            </article>
          `).join('')}
        </div>
      </section>
    ` : '',
    certifications: data.certifications?.length ? `
      <section class="custom-resume-section section-certifications">
        ${heading('Certifications')}
        <div class="custom-template-items">
          ${data.certifications.map(certification => `<p><strong>${escapeHtml(certification.name)}</strong>${certification.issuer ? ` · ${escapeHtml(certification.issuer)}` : ''}${certification.date ? ` · ${escapeHtml(certification.date)}` : ''}</p>`).join('')}
        </div>
      </section>
    ` : '',
    languages: data.languages?.length ? `
      <section class="custom-resume-section section-languages">
        ${heading('Languages')}
        <p>${data.languages.map(language => `<span><strong>${escapeHtml(language.language)}:</strong> ${escapeHtml(language.fluency)}</span>`).join(' · ')}</p>
      </section>
    ` : '',
    customSections: data.customSections?.length ? data.customSections.map(custom => `
      <section class="custom-resume-section section-custom">
        ${heading(custom.title)}
        <div class="custom-template-items">
          ${(custom.items || []).map(item => `
            <p><strong>${escapeHtml(item.title)}</strong>${item.subtitle ? ` · ${escapeHtml(item.subtitle)}` : ''}${item.date ? ` · ${escapeHtml(item.date)}` : ''}</p>
          `).join('')}
        </div>
      </section>
    `).join('') : ''
  };
}

function renderBullets(text) {
  if (!text) return '';
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return '';
  
  const listItems = lines.map(line => {
    // Strip leading bullet symbols or hyphens if present
    const clean = line.replace(/^[•\-\*]\s*/, '');
    return `<li class="relative pl-4 mb-1 text-slate-700 leading-relaxed before:content-['•'] before:absolute before:left-0 before:text-primary before:font-bold">${escapeHtml(clean)}</li>`;
  }).join('');
  
  return `<ul class="list-none my-1.5">${listItems}</ul>`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const safeDate = String(dateStr);
  if (safeDate.toLowerCase() === 'present') return 'Present';
  const parts = safeDate.split('-');
  if (parts.length === 2) {
    const year = parts[0];
    const month = parseInt(parts[1], 10);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (month >= 1 && month <= 12) {
      return `${months[month - 1]} ${escapeHtml(year)}`;
    }
  }
  return escapeHtml(safeDate);
}

// ----------------------------------------------------
// Template 1: Modern Tech
// ----------------------------------------------------
export function renderModernTemplate(data) {
  const p = data.personal || {};
  const theme = data.theme || {};
  const primary = /^#[0-9a-f]{6}$/i.test(theme.primaryColor || '') ? theme.primaryColor : '#2563eb';
  const sections = {
    summary: p.summary ? `
      <section>
        <h2 class="text-sm font-bold uppercase tracking-wider mb-2 flex items-center gap-2" style="color: ${primary};">
          <span class="w-2.5 h-2.5 rounded-full" style="background-color: ${primary};"></span>
          Professional Summary
        </h2>
        <p class="text-sm text-slate-700 leading-relaxed">${escapeHtml(p.summary)}</p>
      </section>
    ` : '',
    experience: data.experiences?.length ? `
      <section>
        <h2 class="text-sm font-bold uppercase tracking-wider mb-3 flex items-center gap-2" style="color: ${primary};">
          <span class="w-2.5 h-2.5 rounded-full" style="background-color: ${primary};"></span>
          Work Experience
        </h2>
        <div class="space-y-4">
          ${data.experiences.map(exp => `
            <div class="relative pl-4 border-l-2 border-slate-200">
              <div class="flex flex-col sm:flex-row sm:items-baseline justify-between mb-0.5">
                <h3 class="text-base font-bold text-slate-900">${escapeHtml(exp.role || 'Role')}</h3>
                <span class="text-xs font-semibold text-slate-500">${formatDate(exp.startDate)} – ${exp.current ? 'Present' : formatDate(exp.endDate)}</span>
              </div>
              <div class="flex items-center gap-2 text-xs font-medium text-slate-600 mb-1.5">
                <span class="font-semibold" style="color: ${primary};">${escapeHtml(exp.company || 'Company')}</span>
                ${exp.location ? `<span>• ${escapeHtml(exp.location)}</span>` : ''}
              </div>
              <div class="text-xs sm:text-sm">${renderBullets(exp.description)}</div>
            </div>
          `).join('')}
        </div>
      </section>
    ` : '',
    skills: data.skills?.length ? `
      <section>
        <h2 class="text-sm font-bold uppercase tracking-wider mb-2.5 flex items-center gap-2" style="color: ${primary};">
          <span class="w-2.5 h-2.5 rounded-full" style="background-color: ${primary};"></span>
          Skills & Expertise
        </h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm">
          ${data.skills.map(skillGroup => `
            <div class="bg-slate-50 p-3 rounded-lg border border-slate-200/80">
              <div class="font-bold text-slate-900 mb-1.5">${escapeHtml(skillGroup.category)}</div>
              <div class="flex flex-wrap gap-1.5">
                ${(skillGroup.items || []).map(skill => `<span class="px-2 py-0.5 rounded-md bg-white text-slate-700 font-medium text-xs border border-slate-200 shadow-2xs">${escapeHtml(skill)}</span>`).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      </section>
    ` : '',
    projects: data.projects?.length ? `
      <section>
        <h2 class="text-sm font-bold uppercase tracking-wider mb-3 flex items-center gap-2" style="color: ${primary};">
          <span class="w-2.5 h-2.5 rounded-full" style="background-color: ${primary};"></span>
          Featured Projects
        </h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          ${data.projects.map(proj => `
            <div class="p-3.5 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors">
              <div class="flex items-baseline justify-between mb-1">
                <h3 class="text-sm font-bold text-slate-900">${escapeHtml(proj.title)}</h3>
                ${safeUrl(proj.link) ? `<a href="${escapeHtml(safeUrl(proj.link))}" target="_blank" rel="noopener noreferrer" class="text-xs font-semibold hover:underline" style="color: ${primary};">Link ↗</a>` : ''}
              </div>
              ${proj.tech ? `<div class="text-xs font-medium text-slate-500 mb-1.5">${escapeHtml(proj.tech)}</div>` : ''}
              <p class="text-xs text-slate-700 leading-relaxed">${escapeHtml(proj.description)}</p>
            </div>
          `).join('')}
        </div>
      </section>
    ` : '',
    education: data.education?.length ? `
      <section>
        <h2 class="text-sm font-bold uppercase tracking-wider mb-2.5 flex items-center gap-2" style="color: ${primary};">
          <span class="w-2.5 h-2.5 rounded-full" style="background-color: ${primary};"></span>
          Education
        </h2>
        <div class="space-y-3">
          ${data.education.map(edu => `
            <div>
              <div class="text-sm font-bold text-slate-900">${escapeHtml(edu.degree)}</div>
              <div class="text-xs font-semibold" style="color: ${primary};">${escapeHtml(edu.school)}</div>
              <div class="flex justify-between text-xs text-slate-500 mt-0.5">
                <span>${escapeHtml(edu.location || '')}</span>
                <span>${formatDate(edu.startDate)} – ${formatDate(edu.endDate)}</span>
              </div>
              ${edu.grade || edu.honors ? `<div class="text-xs text-slate-600 mt-0.5">${escapeHtml(edu.grade || '')}${edu.grade && edu.honors ? ' • ' : ''}${escapeHtml(edu.honors || '')}</div>` : ''}
            </div>
          `).join('')}
        </div>
      </section>
    ` : '',
    certifications: data.certifications?.length ? `
      <section>
        <h2 class="text-sm font-bold uppercase tracking-wider mb-2 flex items-center gap-2" style="color: ${primary};">
          <span class="w-2.5 h-2.5 rounded-full" style="background-color: ${primary};"></span>
          Certifications
        </h2>
        <div class="space-y-2 text-xs">
          ${data.certifications.map(cert => `
            <div>
              <span class="font-bold text-slate-800">${escapeHtml(cert.name)}</span>
              <div class="text-slate-500">${escapeHtml(cert.issuer)} ${cert.date ? `(${escapeHtml(cert.date)})` : ''}</div>
            </div>
          `).join('')}
        </div>
      </section>
    ` : '',
    languages: data.languages?.length ? `
      <section>
        <h2 class="text-sm font-bold uppercase tracking-wider mb-2 flex items-center gap-2" style="color: ${primary};">
          <span class="w-2.5 h-2.5 rounded-full" style="background-color: ${primary};"></span>
          Languages
        </h2>
        <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          ${data.languages.map(lang => `<span class="text-slate-700"><strong class="text-slate-900">${escapeHtml(lang.language)}:</strong> ${escapeHtml(lang.fluency)}</span>`).join('')}
        </div>
      </section>
    ` : '',
    customSections: data.customSections?.length ? data.customSections.map(cSec => `
      <section>
        <h2 class="text-sm font-bold uppercase tracking-wider mb-2 flex items-center gap-2" style="color: ${primary};">
          <span class="w-2.5 h-2.5 rounded-full" style="background-color: ${primary};"></span>
          ${escapeHtml(cSec.title)}
        </h2>
        <div class="space-y-2">
          ${(cSec.items || []).map(item => `
            <div class="text-xs sm:text-sm">
              <div class="font-bold text-slate-800">${escapeHtml(item.title)}</div>
              <div class="text-slate-600">${escapeHtml(item.subtitle || '')} ${item.date ? `(${escapeHtml(item.date)})` : ''}</div>
            </div>
          `).join('')}
        </div>
      </section>
    `).join('') : ''
  };

  return `
    <div class="resume-sheet modern-template p-8 sm:p-10 font-sans text-slate-800" style="--primary: ${primary};">
      <!-- Header -->
      <header class="flex flex-col sm:flex-row items-center gap-6 pb-6 border-b-2 border-slate-200">
        ${theme.showPhoto && p.photo ? `
          <div class="relative w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden shadow-md flex-shrink-0 border-2" style="border-color: ${primary};">
            <img src="${escapeHtml(p.photo)}" alt="${escapeHtml(p.fullName)}" class="w-full h-full object-cover">
          </div>
        ` : ''}
        <div class="flex-1 text-center sm:text-left">
          <h1 class="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 mb-1">${escapeHtml(p.fullName || 'Your Name')}</h1>
          <p class="text-lg font-semibold mb-3" style="color: ${primary};">${escapeHtml(p.jobTitle || 'Professional Title')}</p>
          
          <div class="flex flex-wrap items-center justify-center sm:justify-start gap-y-1.5 gap-x-4 text-xs sm:text-sm text-slate-600">
            ${p.email ? `<span class="inline-flex items-center gap-1.5"><svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>${escapeHtml(p.email)}</span>` : ''}
            ${p.phone ? `<span class="inline-flex items-center gap-1.5"><svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>${escapeHtml(p.phone)}</span>` : ''}
            ${p.location ? `<span class="inline-flex items-center gap-1.5"><svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>${escapeHtml(p.location)}</span>` : ''}
            ${p.website ? `<span class="inline-flex items-center gap-1.5"><svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"/></svg>${escapeHtml(p.website.replace(/^https?:\/\//, ''))}</span>` : ''}
            ${p.linkedin ? `<span class="inline-flex items-center gap-1.5"><svg class="w-4 h-4 text-slate-400" fill="currentColor" viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>${escapeHtml(p.linkedin)}</span>` : ''}
            ${p.github ? `<span class="inline-flex items-center gap-1.5"><svg class="w-4 h-4 text-slate-400" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>${escapeHtml(p.github)}</span>` : ''}
          </div>
        </div>
      </header>

      <div class="mt-6 space-y-6">${renderOrderedSections(theme, sections)}</div>
    </div>
  `;
}

// ----------------------------------------------------
// Template 2: Classic Executive
// ----------------------------------------------------
export function renderClassicTemplate(data) {
  const p = data.personal || {};
  const theme = data.theme || {};
  const primary = /^#[0-9a-f]{6}$/i.test(theme.primaryColor || '') ? theme.primaryColor : '#1e3a8a';
  const sections = {
    summary: p.summary ? `
      <section>
        <h2 class="text-xs font-bold uppercase tracking-widest text-slate-800 pb-1 border-b border-slate-300 mb-2 font-sans">Professional Summary</h2>
        <p class="text-xs sm:text-sm text-slate-700 leading-relaxed font-sans">${escapeHtml(p.summary)}</p>
      </section>
    ` : '',
    experience: data.experiences?.length ? `
      <section>
        <h2 class="text-xs font-bold uppercase tracking-widest text-slate-800 pb-1 border-b border-slate-300 mb-3 font-sans">Professional Experience</h2>
        <div class="space-y-4 font-sans">
          ${data.experiences.map(exp => `
            <div>
              <div class="flex flex-col sm:flex-row justify-between sm:items-baseline">
                <span class="text-sm font-bold text-slate-900">${escapeHtml(exp.role)}</span>
                <span class="text-xs font-medium text-slate-600">${formatDate(exp.startDate)} – ${exp.current ? 'Present' : formatDate(exp.endDate)}</span>
              </div>
              <div class="flex justify-between text-xs italic text-slate-700 mb-1.5">
                <span>${escapeHtml(exp.company)}</span>
                <span>${escapeHtml(exp.location || '')}</span>
              </div>
              <div class="text-xs sm:text-sm">${renderBullets(exp.description)}</div>
            </div>
          `).join('')}
        </div>
      </section>
    ` : '',
    skills: data.skills?.length ? `
      <section>
        <h2 class="text-xs font-bold uppercase tracking-widest text-slate-800 pb-1 border-b border-slate-300 mb-2 font-sans">Core Competencies & Skills</h2>
        <div class="space-y-1.5 text-xs sm:text-sm font-sans">
          ${data.skills.map(skillGroup => `
            <div><strong class="text-slate-900">${escapeHtml(skillGroup.category)}:</strong><span class="text-slate-700"> ${(skillGroup.items || []).map(escapeHtml).join(', ')}</span></div>
          `).join('')}
        </div>
      </section>
    ` : '',
    projects: data.projects?.length ? `
      <section>
        <h2 class="text-xs font-bold uppercase tracking-widest text-slate-800 pb-1 border-b border-slate-300 mb-2 font-sans">Key Projects</h2>
        <div class="space-y-2 text-xs font-sans">
          ${data.projects.map(proj => `
            <div>
              <div class="flex items-center justify-between gap-2">
                <span class="font-bold text-slate-900">${escapeHtml(proj.title)}</span>
                ${safeUrl(proj.link) ? `<a href="${escapeHtml(safeUrl(proj.link))}" target="_blank" rel="noopener noreferrer" class="font-semibold hover:underline" style="color: ${primary};">Link ↗</a>` : ''}
              </div>
              <p class="text-slate-700 mt-0.5">${escapeHtml(proj.description)}</p>
            </div>
          `).join('')}
        </div>
      </section>
    ` : '',
    education: data.education?.length ? `
      <section>
        <h2 class="text-xs font-bold uppercase tracking-widest text-slate-800 pb-1 border-b border-slate-300 mb-2 font-sans">Education</h2>
        <div class="space-y-2 font-sans">
          ${data.education.map(edu => `
            <div class="flex flex-col sm:flex-row justify-between text-xs sm:text-sm">
              <div>
                <span class="font-bold text-slate-900">${escapeHtml(edu.degree)}</span> — <span class="italic text-slate-700">${escapeHtml(edu.school)}</span>
                ${edu.grade ? `<span class="text-slate-500"> (${escapeHtml(edu.grade)})</span>` : ''}
              </div>
              <span class="text-slate-600 text-xs">${formatDate(edu.startDate)} – ${formatDate(edu.endDate)}</span>
            </div>
          `).join('')}
        </div>
      </section>
    ` : '',
    certifications: data.certifications?.length ? `
      <section>
        <h2 class="text-xs font-bold uppercase tracking-widest text-slate-800 pb-1 border-b border-slate-300 mb-2 font-sans">Certifications</h2>
        <div class="space-y-1.5 text-xs font-sans">
          ${data.certifications.map(cert => `<div><strong class="text-slate-900">${escapeHtml(cert.name)}</strong><div class="text-slate-600">${escapeHtml(cert.issuer)} ${cert.date ? `(${escapeHtml(cert.date)})` : ''}</div></div>`).join('')}
        </div>
      </section>
    ` : '',
    languages: data.languages?.length ? `
      <section>
        <h2 class="text-xs font-bold uppercase tracking-widest text-slate-800 pb-1 border-b border-slate-300 mb-2 font-sans">Languages</h2>
        <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs font-sans">
          ${data.languages.map(lang => `<span><strong>${escapeHtml(lang.language)}:</strong> ${escapeHtml(lang.fluency)}</span>`).join('')}
        </div>
      </section>
    ` : '',
    customSections: data.customSections?.length ? data.customSections.map(cSec => `
      <section>
        <h2 class="text-xs font-bold uppercase tracking-widest text-slate-800 pb-1 border-b border-slate-300 mb-2 font-sans">${escapeHtml(cSec.title)}</h2>
        <div class="space-y-2 text-xs font-sans">
          ${(cSec.items || []).map(item => `<div><strong>${escapeHtml(item.title)}</strong><div class="text-slate-600">${escapeHtml(item.subtitle || '')} ${item.date ? `(${escapeHtml(item.date)})` : ''}</div></div>`).join('')}
        </div>
      </section>
    `).join('') : ''
  };

  return `
    <div class="resume-sheet classic-template p-8 sm:p-12 font-serif text-slate-900" style="--primary: ${primary};">
      <!-- Centered Header -->
      <header class="text-center pb-5 border-b-2" style="border-color: ${primary};">
        <h1 class="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 mb-1 font-serif">${escapeHtml(p.fullName || 'Your Name')}</h1>
        <p class="text-base sm:text-lg font-medium italic mb-3 font-sans" style="color: ${primary};">${escapeHtml(p.jobTitle || 'Professional Title')}</p>
        
        <div class="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs sm:text-sm font-sans text-slate-600">
          ${p.location ? `<span>${escapeHtml(p.location)}</span>` : ''}
          ${p.phone ? `<span>• ${escapeHtml(p.phone)}</span>` : ''}
          ${p.email ? `<span>• ${escapeHtml(p.email)}</span>` : ''}
          ${p.linkedin ? `<span>• ${escapeHtml(p.linkedin)}</span>` : ''}
          ${p.website ? `<span>• ${escapeHtml(p.website.replace(/^https?:\/\//, ''))}</span>` : ''}
        </div>
      </header>

      <div class="mt-6 space-y-6 font-sans">${renderOrderedSections(theme, sections)}</div>
    </div>
  `;
}

// ----------------------------------------------------
// Template 3: Minimalist Nordic
// ----------------------------------------------------
export function renderMinimalTemplate(data) {
  const p = data.personal || {};
  const theme = data.theme || {};
  const primary = /^#[0-9a-f]{6}$/i.test(theme.primaryColor || '') ? theme.primaryColor : '#0369a1';
  const sections = {
    summary: p.summary ? `
      <section class="text-sm text-slate-600 leading-relaxed font-normal">${escapeHtml(p.summary)}</section>
    ` : '',
    experience: data.experiences?.length ? `
      <section>
        <div class="text-xs font-mono tracking-widest text-slate-400 uppercase mb-4">// EXPERIENCE</div>
        <div class="space-y-5">
          ${data.experiences.map(exp => `
            <div class="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <div class="sm:col-span-1 text-xs text-slate-400 font-mono">${formatDate(exp.startDate)} — ${exp.current ? 'Present' : formatDate(exp.endDate)}</div>
              <div class="sm:col-span-3">
                <h3 class="text-sm font-semibold text-slate-900">${escapeHtml(exp.role)}</h3>
                <div class="text-xs text-slate-500 mb-1.5 font-medium">${escapeHtml(exp.company)} ${exp.location ? `• ${escapeHtml(exp.location)}` : ''}</div>
                <div class="text-xs text-slate-600">${renderBullets(exp.description)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </section>
    ` : '',
    skills: data.skills?.length ? `
      <section>
        <div class="text-xs font-mono tracking-widest text-slate-400 uppercase mb-3">// SKILLS</div>
        <div class="space-y-2">
          ${data.skills.map(sg => `
            <div class="grid grid-cols-1 sm:grid-cols-4 gap-1 text-xs">
              <span class="text-slate-400 font-mono">${escapeHtml(sg.category)}</span>
              <span class="sm:col-span-3 text-slate-700">${(sg.items || []).map(escapeHtml).join('  •  ')}</span>
            </div>
          `).join('')}
        </div>
      </section>
    ` : '',
    projects: data.projects?.length ? `
      <section>
        <div class="text-xs font-mono tracking-widest text-slate-400 uppercase mb-3">// PROJECTS</div>
        <div class="space-y-3">
          ${data.projects.map(proj => `
            <div class="text-xs">
              <div class="flex items-center justify-between gap-2">
                <h3 class="font-semibold text-slate-900">${escapeHtml(proj.title)}</h3>
                ${safeUrl(proj.link) ? `<a href="${escapeHtml(safeUrl(proj.link))}" target="_blank" rel="noopener noreferrer" class="font-semibold hover:underline" style="color: ${primary};">Link ↗</a>` : ''}
              </div>
              ${proj.tech ? `<div class="text-slate-500 mb-1 font-mono">${escapeHtml(proj.tech)}</div>` : ''}
              <p class="text-slate-600 leading-relaxed">${escapeHtml(proj.description)}</p>
            </div>
          `).join('')}
        </div>
      </section>
    ` : '',
    education: data.education?.length ? `
      <section>
        <div class="text-xs font-mono tracking-widest text-slate-400 uppercase mb-3">// EDUCATION</div>
        <div class="space-y-3">
          ${data.education.map(edu => `
            <div class="grid grid-cols-1 sm:grid-cols-4 gap-1 text-xs">
              <span class="text-slate-400 font-mono">${formatDate(edu.startDate)} — ${formatDate(edu.endDate)}</span>
              <div class="sm:col-span-3">
                <span class="font-semibold text-slate-900">${escapeHtml(edu.degree)}</span>
                <span class="text-slate-500">, ${escapeHtml(edu.school)}</span>
                ${edu.grade ? `<span class="text-slate-400 block sm:inline"> (${escapeHtml(edu.grade)})</span>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </section>
    ` : '',
    certifications: data.certifications?.length ? `
      <section>
        <div class="text-xs font-mono tracking-widest text-slate-400 uppercase mb-3">// CERTIFICATIONS</div>
        <div class="space-y-2 text-xs">
          ${data.certifications.map(cert => `<div><strong class="text-slate-900">${escapeHtml(cert.name)}</strong><span class="text-slate-500"> — ${escapeHtml(cert.issuer)} ${cert.date ? `(${escapeHtml(cert.date)})` : ''}</span></div>`).join('')}
        </div>
      </section>
    ` : '',
    languages: data.languages?.length ? `
      <section>
        <div class="text-xs font-mono tracking-widest text-slate-400 uppercase mb-3">// LANGUAGES</div>
        <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          ${data.languages.map(lang => `<span class="text-slate-700"><strong>${escapeHtml(lang.language)}:</strong> ${escapeHtml(lang.fluency)}</span>`).join('')}
        </div>
      </section>
    ` : '',
    customSections: data.customSections?.length ? data.customSections.map(cSec => `
      <section>
        <div class="text-xs font-mono tracking-widest text-slate-400 uppercase mb-3">// ${escapeHtml(cSec.title)}</div>
        <div class="space-y-2 text-xs">
          ${(cSec.items || []).map(item => `<div><strong class="text-slate-900">${escapeHtml(item.title)}</strong><div class="text-slate-600">${escapeHtml(item.subtitle || '')} ${item.date ? `(${escapeHtml(item.date)})` : ''}</div></div>`).join('')}
        </div>
      </section>
    `).join('') : ''
  };

  return `
    <div class="resume-sheet minimal-template p-8 sm:p-12 font-sans text-slate-800" style="--primary: ${primary};">
      <!-- Minimal Header -->
      <header class="mb-8">
        <h1 class="text-4xl font-light tracking-tight text-slate-900 mb-1">${escapeHtml(p.fullName || 'Your Name')}</h1>
        <p class="text-sm uppercase tracking-widest font-semibold" style="color: ${primary};">${escapeHtml(p.jobTitle || 'Professional Title')}</p>
        
        <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 mt-3 font-mono">
          ${p.email ? `<span>${escapeHtml(p.email)}</span>` : ''}
          ${p.phone ? `<span>/ ${escapeHtml(p.phone)}</span>` : ''}
          ${p.location ? `<span>/ ${escapeHtml(p.location)}</span>` : ''}
          ${p.website ? `<span>/ ${escapeHtml(p.website.replace(/^https?:\/\//, ''))}</span>` : ''}
        </div>
      </header>

      <div class="space-y-6">${renderOrderedSections(theme, sections)}</div>
    </div>
  `;
}

// ----------------------------------------------------
// Template 4: Creative Sidebar (Two Column)
// ----------------------------------------------------
export function renderCreativeTemplate(data) {
  const p = data.personal || {};
  const theme = data.theme || {};
  const primary = /^#[0-9a-f]{6}$/i.test(theme.primaryColor || '') ? theme.primaryColor : '#7c3aed';
  const secondary = validThemeColor(theme.secondaryColor, '#0f172a');
  const sections = {
    summary: p.summary ? `
      <section>
        <h2 class="text-xs font-bold uppercase tracking-widest mb-2 font-mono" style="color: ${primary};">Profile Summary</h2>
        <p class="text-xs sm:text-sm text-slate-700 leading-relaxed">${escapeHtml(p.summary)}</p>
      </section>
    ` : '',
    experience: data.experiences?.length ? `
      <section>
        <h2 class="text-xs font-bold uppercase tracking-widest mb-3 font-mono" style="color: ${primary};">Experience History</h2>
        <div class="space-y-4">
          ${data.experiences.map(exp => `
            <div>
              <div class="flex justify-between items-baseline mb-0.5">
                <h3 class="text-sm font-bold text-slate-900">${escapeHtml(exp.role)}</h3>
                <span class="text-xs text-slate-500">${formatDate(exp.startDate)} – ${exp.current ? 'Present' : formatDate(exp.endDate)}</span>
              </div>
              <div class="text-xs font-semibold mb-1" style="color: ${primary};">${escapeHtml(exp.company)}</div>
              <div class="text-xs sm:text-sm">${renderBullets(exp.description)}</div>
            </div>
          `).join('')}
        </div>
      </section>
    ` : '',
    skills: data.skills?.length ? `
      <section>
        <h2 class="text-xs font-bold uppercase tracking-widest mb-3 font-mono" style="color: ${primary};">Skills & Expertise</h2>
        <div class="grid grid-cols-1 gap-3">
          ${data.skills.map(sg => `
            <div>
              <div class="text-xs font-semibold text-slate-100 mb-1.5">${escapeHtml(sg.category)}</div>
              <div class="flex flex-wrap gap-1.5">
                ${(sg.items || []).map(skill => `<span class="px-2 py-0.5 rounded text-2xs bg-slate-100 text-slate-700 border border-slate-200 font-medium">${escapeHtml(skill)}</span>`).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      </section>
    ` : '',
    projects: data.projects?.length ? `
      <section>
        <h2 class="text-xs font-bold uppercase tracking-widest mb-2.5 font-mono" style="color: ${primary};">Key Projects</h2>
        <div class="space-y-3">
          ${data.projects.map(proj => `
            <div class="text-xs">
              <div class="font-bold text-slate-900 flex justify-between gap-2">
                <span>${escapeHtml(proj.title)}</span>
                ${safeUrl(proj.link) ? `<a href="${escapeHtml(safeUrl(proj.link))}" target="_blank" rel="noopener noreferrer" class="hover:underline" style="color: ${primary};">View ↗</a>` : ''}
              </div>
              ${proj.tech ? `<div class="text-slate-500 text-2xs mb-1 font-mono">${escapeHtml(proj.tech)}</div>` : ''}
              <p class="text-slate-700 leading-relaxed">${escapeHtml(proj.description)}</p>
            </div>
          `).join('')}
        </div>
      </section>
    ` : '',
    education: data.education?.length ? `
      <section>
        <h2 class="text-xs font-bold uppercase tracking-widest mb-2.5 font-mono" style="color: ${primary};">Education</h2>
        <div class="space-y-3 text-xs">
          ${data.education.map(edu => `
            <div>
              <div class="font-bold text-slate-900">${escapeHtml(edu.degree)}</div>
              <div class="text-slate-700">${escapeHtml(edu.school)}</div>
              <div class="text-slate-500 text-2xs">${formatDate(edu.startDate)} – ${formatDate(edu.endDate)}</div>
              ${edu.grade || edu.honors ? `<div class="text-slate-500 text-2xs">${escapeHtml(edu.grade || '')}${edu.grade && edu.honors ? ' • ' : ''}${escapeHtml(edu.honors || '')}</div>` : ''}
            </div>
          `).join('')}
        </div>
      </section>
    ` : '',
    certifications: data.certifications?.length ? `
      <section>
        <h2 class="text-xs font-bold uppercase tracking-widest mb-2 font-mono" style="color: ${primary};">Certifications</h2>
        <div class="space-y-1 text-xs">
          ${data.certifications.map(cert => `<div><span class="font-bold text-slate-900">${escapeHtml(cert.name)}</span><span class="text-slate-500"> — ${escapeHtml(cert.issuer)} ${cert.date ? `(${escapeHtml(cert.date)})` : ''}</span></div>`).join('')}
        </div>
      </section>
    ` : '',
    languages: data.languages?.length ? `
      <section>
        <h2 class="text-xs font-bold uppercase tracking-widest mb-2 font-mono" style="color: ${primary};">Languages</h2>
        <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          ${data.languages.map(lang => `<span class="text-slate-300"><strong class="text-white">${escapeHtml(lang.language)}:</strong> ${escapeHtml(lang.fluency)}</span>`).join('')}
        </div>
      </section>
    ` : '',
    customSections: data.customSections?.length ? data.customSections.map(cSec => `
      <section>
        <h2 class="text-xs font-bold uppercase tracking-widest mb-2 font-mono" style="color: ${primary};">${escapeHtml(cSec.title)}</h2>
        <div class="space-y-2 text-xs">
          ${(cSec.items || []).map(item => `<div><strong class="text-slate-900">${escapeHtml(item.title)}</strong><div class="text-slate-600">${escapeHtml(item.subtitle || '')} ${item.date ? `(${escapeHtml(item.date)})` : ''}</div></div>`).join('')}
        </div>
      </section>
    `).join('') : ''
  };
  const sidebarSections = { skills: sections.skills, languages: sections.languages };
  const mainSections = { ...sections, skills: '', languages: '' };

  return `
    <div class="resume-sheet creative-template flex flex-col md:flex-row min-h-full font-sans text-slate-800" style="--primary: ${primary}; --secondary: ${secondary};">
      <!-- Left Sidebar (Accent Tint) -->
      <aside class="w-full md:w-5/12 text-slate-100 p-8 flex flex-col justify-between" style="background-color: ${secondary};">
        <div>
          <!-- Photo & Intro -->
          ${theme.showPhoto && p.photo ? `
            <div class="w-28 h-28 mx-auto md:mx-0 rounded-full overflow-hidden border-3 border-white/30 shadow-lg mb-5">
              <img src="${escapeHtml(p.photo)}" alt="${escapeHtml(p.fullName)}" class="w-full h-full object-cover">
            </div>
          ` : ''}

          <h1 class="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mb-1">${escapeHtml(p.fullName || 'Your Name')}</h1>
          <p class="text-sm font-medium text-slate-300 mb-6" style="color: ${primary};">${escapeHtml(p.jobTitle || 'Professional Title')}</p>

          <!-- Contact Details -->
          <div class="space-y-2.5 text-xs text-slate-300 mb-8 border-t border-slate-700/80 pt-5">
            ${p.email ? `<div class="flex items-center gap-2"><svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg><span class="break-all">${escapeHtml(p.email)}</span></div>` : ''}
            ${p.phone ? `<div class="flex items-center gap-2"><svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>${escapeHtml(p.phone)}</div>` : ''}
            ${p.location ? `<div class="flex items-center gap-2"><svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>${escapeHtml(p.location)}</div>` : ''}
            ${p.website ? `<div class="flex items-center gap-2"><svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"/></svg>${escapeHtml(p.website.replace(/^https?:\/\//, ''))}</div>` : ''}
            ${p.linkedin ? `<div class="flex items-center gap-2"><svg class="w-3.5 h-3.5 text-slate-400" fill="currentColor" viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>${escapeHtml(p.linkedin)}</div>` : ''}
          </div>
          <div class="space-y-6">${renderOrderedSections(theme, sidebarSections)}</div>
        </div>
      </aside>

      <!-- Right Main Column -->
      <main class="w-full md:w-7/12 p-8 bg-white">
        <div class="space-y-6">${renderOrderedSections(theme, mainSections)}</div>
      </main>
    </div>
  `;
}

// ----------------------------------------------------
// Template 5: Ivy League / Academic
// ----------------------------------------------------
export function renderAcademicTemplate(data) {
  const p = data.personal || {};
  const theme = data.theme || {};
  const primary = /^#[0-9a-f]{6}$/i.test(theme.primaryColor || '') ? theme.primaryColor : '#09090b';
  const sections = {
    summary: p.summary ? `
      <section>
        <h2 class="text-xs font-serif font-bold uppercase tracking-wider text-slate-900 pb-0.5 border-b border-slate-400 mb-1.5">Research Interests & Summary</h2>
        <p class="text-xs sm:text-sm text-slate-800 leading-relaxed">${escapeHtml(p.summary)}</p>
      </section>
    ` : '',
    experience: data.experiences?.length ? `
      <section>
        <h2 class="text-xs font-serif font-bold uppercase tracking-wider text-slate-900 pb-0.5 border-b border-slate-400 mb-2">Research & Professional Experience</h2>
        <div class="space-y-3.5">
          ${data.experiences.map(exp => `
            <div>
              <div class="flex justify-between text-xs sm:text-sm font-bold text-slate-950">
                <span>${escapeHtml(exp.company)}</span>
                <span class="font-normal italic">${formatDate(exp.startDate)} – ${exp.current ? 'Present' : formatDate(exp.endDate)}</span>
              </div>
              <div class="flex justify-between text-xs text-slate-800 italic mb-1">
                <span>${escapeHtml(exp.role)}</span>
                <span>${escapeHtml(exp.location || '')}</span>
              </div>
              <div class="text-xs">${renderBullets(exp.description)}</div>
            </div>
          `).join('')}
        </div>
      </section>
    ` : '',
    skills: data.skills?.length ? `
      <section>
        <h2 class="text-xs font-serif font-bold uppercase tracking-wider text-slate-900 pb-0.5 border-b border-slate-400 mb-1.5">Technical Skills & Methodologies</h2>
        <div class="space-y-1 text-xs">
          ${data.skills.map(sg => `<div><strong class="font-bold text-slate-950">${escapeHtml(sg.category)}:</strong><span class="text-slate-800"> ${(sg.items || []).map(escapeHtml).join(', ')}</span></div>`).join('')}
        </div>
      </section>
    ` : '',
    projects: data.projects?.length ? `
      <section>
        <h2 class="text-xs font-serif font-bold uppercase tracking-wider text-slate-900 pb-0.5 border-b border-slate-400 mb-2">Selected Projects</h2>
        <div class="space-y-2 text-xs">
          ${data.projects.map(proj => `
            <div>
              <div class="flex justify-between gap-2">
                <strong class="text-slate-950">${escapeHtml(proj.title)}</strong>
                ${safeUrl(proj.link) ? `<a href="${escapeHtml(safeUrl(proj.link))}" target="_blank" rel="noopener noreferrer" class="hover:underline">${escapeHtml(proj.link)}</a>` : ''}
              </div>
              ${proj.tech ? `<div class="text-slate-600">${escapeHtml(proj.tech)}</div>` : ''}
              <p class="text-slate-800">${escapeHtml(proj.description)}</p>
            </div>
          `).join('')}
        </div>
      </section>
    ` : '',
    education: data.education?.length ? `
      <section>
        <h2 class="text-xs font-serif font-bold uppercase tracking-wider text-slate-900 pb-0.5 border-b border-slate-400 mb-2">Education</h2>
        <div class="space-y-2">
          ${data.education.map(edu => `
            <div>
              <div class="flex justify-between text-xs sm:text-sm font-bold text-slate-950">
                <span>${escapeHtml(edu.school)}</span>
                <span class="font-normal italic">${formatDate(edu.startDate)} – ${formatDate(edu.endDate)}</span>
              </div>
              <div class="flex justify-between text-xs text-slate-800 italic">
                <span>${escapeHtml(edu.degree)}</span>
                <span>${escapeHtml(edu.location || '')}</span>
              </div>
              ${edu.grade || edu.honors ? `<div class="text-xs text-slate-700 mt-0.5">${escapeHtml(edu.grade || '')} ${edu.honors ? `• ${escapeHtml(edu.honors)}` : ''}</div>` : ''}
            </div>
          `).join('')}
        </div>
      </section>
    ` : '',
    certifications: data.certifications?.length ? `
      <section>
        <h2 class="text-xs font-serif font-bold uppercase tracking-wider text-slate-900 pb-0.5 border-b border-slate-400 mb-2">Certifications</h2>
        <div class="space-y-1.5 text-xs">
          ${data.certifications.map(cert => `<div><strong class="text-slate-950">${escapeHtml(cert.name)}</strong><span class="text-slate-700"> — ${escapeHtml(cert.issuer)} ${cert.date ? `(${escapeHtml(cert.date)})` : ''}</span></div>`).join('')}
        </div>
      </section>
    ` : '',
    languages: data.languages?.length ? `
      <section>
        <h2 class="text-xs font-serif font-bold uppercase tracking-wider text-slate-900 pb-0.5 border-b border-slate-400 mb-2">Languages</h2>
        <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          ${data.languages.map(lang => `<span><strong class="text-slate-950">${escapeHtml(lang.language)}:</strong> ${escapeHtml(lang.fluency)}</span>`).join('')}
        </div>
      </section>
    ` : '',
    customSections: data.customSections?.length ? data.customSections.map(cSec => `
      <section>
        <h2 class="text-xs font-serif font-bold uppercase tracking-wider text-slate-900 pb-0.5 border-b border-slate-400 mb-2">${escapeHtml(cSec.title)}</h2>
        <div class="space-y-1.5 text-xs">
          ${(cSec.items || []).map(item => `
            <div>
              <span class="font-bold text-slate-950">${escapeHtml(item.title)}</span>
              ${item.subtitle ? `<span class="italic text-slate-700">, ${escapeHtml(item.subtitle)}</span>` : ''}
              ${item.date ? `<span class="text-slate-500"> (${escapeHtml(item.date)})</span>` : ''}
            </div>
          `).join('')}
        </div>
      </section>
    `).join('') : ''
  };

  return `
    <div class="resume-sheet academic-template p-8 sm:p-12 font-serif text-slate-900 leading-normal" style="--primary: ${primary};">
      <header class="text-center pb-4 mb-4 border-b border-slate-900">
        <h1 class="text-3xl font-serif tracking-normal uppercase font-bold text-slate-950 mb-1">${escapeHtml(p.fullName || 'Your Name')}</h1>
        <div class="text-xs font-serif text-slate-700 flex flex-wrap justify-center gap-x-2">
          ${p.location ? `<span>${escapeHtml(p.location)}</span>` : ''}
          ${p.phone ? `<span>|</span><span>${escapeHtml(p.phone)}</span>` : ''}
          ${p.email ? `<span>|</span><span>${escapeHtml(p.email)}</span>` : ''}
          ${p.website ? `<span>|</span><span>${escapeHtml(p.website.replace(/^https?:\/\//, ''))}</span>` : ''}
          ${p.linkedin ? `<span>|</span><span>${escapeHtml(p.linkedin)}</span>` : ''}
        </div>
      </header>

      <div class="space-y-5">${renderOrderedSections(theme, sections)}</div>
    </div>
  `;
}

export function renderExecutiveBannerTemplate(data) {
  const person = data.personal || {};
  const theme = data.theme || {};
  const primary = validThemeColor(theme.primaryColor, '#2563eb');
  const secondary = validThemeColor(theme.secondaryColor, '#1e293b');
  const sections = createCustomTemplateSections(data, primary, 'executive-banner');
  const standardSections = { ...sections, skills: '', education: '' };
  const pairedSections = { skills: sections.skills, education: sections.education };
  const photoUrl = safeUrl(person.photo);

  return `
    <div class="resume-sheet executive-banner-template" style="--template-accent:${primary}; --template-secondary:${secondary}">
      <header class="executive-banner-header">
        <div>
          <p class="executive-banner-kicker">CAREER PROFILE</p>
          <h1>${escapeHtml(person.fullName || 'Your Name')}</h1>
          <p class="executive-banner-title">${escapeHtml(person.jobTitle || 'Professional Title')}</p>
          ${renderContactDetails(person, 'executive-banner-contacts')}
        </div>
        ${theme.showPhoto && photoUrl ? `<img class="executive-banner-photo" src="${escapeHtml(photoUrl)}" alt="${escapeHtml(person.fullName || 'Profile photo')}">` : ''}
      </header>
      <div class="executive-banner-content">
        ${renderOrderedSections(theme, standardSections)}
        <div class="executive-banner-columns">${renderOrderedSections(theme, pairedSections)}</div>
      </div>
    </div>
  `;
}

export function renderDeveloperTemplate(data) {
  const person = data.personal || {};
  const theme = data.theme || {};
  const primary = validThemeColor(theme.primaryColor, '#0f766e');
  const secondary = validThemeColor(theme.secondaryColor, '#172b35');
  const sections = createCustomTemplateSections(data, primary, 'developer');
  const photoUrl = safeUrl(person.photo);

  return `
    <div class="resume-sheet developer-template" style="--template-accent:${primary}; --template-secondary:${secondary}">
      <header class="developer-header">
        <div>
          <p class="developer-meta">${escapeHtml(person.location || 'Location')} <span>·</span> TECHNICAL PROFILE</p>
          <h1>${escapeHtml(person.fullName || 'Your Name')}</h1>
          <p class="developer-title"><span>&gt;</span> ${escapeHtml(person.jobTitle || 'Software Developer')}</p>
          ${renderContactDetails(person, 'developer-links')}
        </div>
        ${theme.showPhoto && photoUrl ? `<img class="developer-photo" src="${escapeHtml(photoUrl)}" alt="${escapeHtml(person.fullName || 'Profile photo')}">` : ''}
      </header>
      <div class="developer-content">${renderOrderedSections(theme, sections)}</div>
    </div>
  `;
}

export function renderCompactAtsTemplate(data) {
  const person = data.personal || {};
  const theme = data.theme || {};
  const primary = validThemeColor(theme.primaryColor, '#334155');
  const secondary = validThemeColor(theme.secondaryColor, '#1e293b');
  const sections = createCustomTemplateSections(data, primary, 'compact-ats');

  return `
    <div class="resume-sheet compact-ats-template" style="--template-accent:${primary}; --template-secondary:${secondary}">
      <header class="compact-ats-header">
        <h1>${escapeHtml(person.fullName || 'Your Name')}</h1>
        <p>${escapeHtml(person.jobTitle || 'Professional Title')}</p>
        ${renderContactDetails(person, 'compact-ats-contacts')}
      </header>
      <div class="compact-ats-content">${renderOrderedSections(theme, sections)}</div>
    </div>
  `;
}

function formatCoverLetterDate(value) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return escapeHtml(date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }));
}

export function renderCoverLetter(coverLetter, resume) {
  const letter = coverLetter || {};
  const personal = resume.personal || {};
  const theme = resume.theme || {};
  const primary = /^#[0-9a-f]{6}$/i.test(theme.primaryColor || '') ? theme.primaryColor : '#2563eb';
  const contacts = [personal.email, personal.phone, personal.location, personal.website, personal.linkedin]
    .filter(Boolean)
    .map(value => `<span>${escapeHtml(value)}</span>`)
    .join('<span aria-hidden="true">•</span>');

  return `
    <div class="resume-sheet cover-letter-sheet p-10 sm:p-14 text-slate-800" style="--primary: ${primary}; font-family: inherit;">
      <header class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 pb-6 border-b-2" style="border-color: ${primary};">
        <div>
          <h1 class="text-2xl font-bold tracking-tight text-slate-900">${escapeHtml(personal.fullName || 'Your Name')}</h1>
          ${personal.jobTitle ? `<p class="mt-1 text-sm font-medium" style="color: ${primary};">${escapeHtml(personal.jobTitle)}</p>` : ''}
        </div>
        <div class="flex flex-wrap sm:justify-end gap-x-3 gap-y-1 text-xs text-slate-500">${contacts}</div>
      </header>

      <div class="flex justify-between items-start gap-6 mt-10 text-sm">
        ${letter.recipient ? `<p class="font-semibold text-slate-900">${escapeHtml(letter.recipient)}</p>` : '<span></span>'}
        ${letter.date ? `<time class="shrink-0 text-slate-600">${formatCoverLetterDate(letter.date)}</time>` : ''}
      </div>

      ${letter.body
        ? `<div class="mt-8 whitespace-pre-wrap text-sm leading-7 text-slate-800">${escapeHtml(letter.body)}</div>`
        : '<p class="no-print mt-8 text-sm italic text-slate-400">Your cover letter will appear here as you write.</p>'}
    </div>
  `;
}

// Master Render Function
export function renderResume(data) {
  const templateId = data.theme?.template || 'modern';
  const template = RESUME_TEMPLATES.find(item => item.id === templateId)?.layout || templateId;
  switch (template) {
    case 'classic':
      return renderClassicTemplate(data);
    case 'minimal':
      return renderMinimalTemplate(data);
    case 'creative':
      return renderCreativeTemplate(data);
    case 'academic':
      return renderAcademicTemplate(data);
    case 'executive-banner':
      return renderExecutiveBannerTemplate(data);
    case 'developer':
      return renderDeveloperTemplate(data);
    case 'compact-ats':
      return renderCompactAtsTemplate(data);
    case 'modern':
    default:
      return renderModernTemplate(data);
  }
}

function portfolioLink(label, href, className = '') {
  return href
    ? `<a class="${className}" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`
    : '';
}

function portfolioBullets(value) {
  const items = String(value || '')
    .split(/\r?\n/)
    .map(line => line.replace(/^\s*[•●▪◦*–—-]+\s*/, '').trim())
    .filter(Boolean);
  return items.length
    ? `<ul class="portfolio-bullets">${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
    : '<p class="portfolio-empty">No details added yet.</p>';
}

export function generateResumeWebsiteHtml(data = {}) {
  const source = data && typeof data === 'object' ? data : {};
  const person = source.personal && typeof source.personal === 'object' ? source.personal : {};
  const theme = source.theme && typeof source.theme === 'object' ? source.theme : {};
  const primaryColor = validThemeColor(theme.primaryColor, '#2563eb');
  const secondaryColor = validThemeColor(theme.secondaryColor, '#1e293b');
  const fontFamily = FONT_OPTIONS.find(option => option.id === theme.fontFamily)?.family || FONT_OPTIONS[0].family;
  const name = escapeHtml(person.fullName || 'Your Name');
  const title = escapeHtml(person.jobTitle || 'Professional Portfolio');
  const summary = escapeHtml(person.summary || 'Add a professional summary to introduce your experience and focus.');
  const entries = key => Array.isArray(source[key]) ? source[key].filter(item => item && typeof item === 'object') : [];

  const contactLinks = [
    portfolioLink(person.email || '', safeExternalUrl(`mailto:${person.email || ''}`), 'portfolio-contact-link'),
    portfolioLink(person.phone || '', safeExternalUrl(`tel:${person.phone || ''}`), 'portfolio-contact-link'),
    ...[
      ['Portfolio', person.website],
      ['LinkedIn', person.linkedin],
      ['GitHub', person.github]
    ].map(([label, value]) => portfolioLink(label, safeExternalUrl(value), 'portfolio-contact-link'))
  ].filter(Boolean).join('');

  const experiences = entries('experiences').map(experience => {
    const dates = [experience.startDate, experience.current ? 'Present' : experience.endDate].filter(Boolean).join(' — ');
    const company = escapeHtml(experience.company || '');
    const location = escapeHtml(experience.location || '');
    return `
      <article class="portfolio-timeline-item">
        <div class="portfolio-item-heading">
          <div><h3>${escapeHtml(experience.role || 'Position')}</h3>${company ? `<p class="portfolio-subtitle">${company}${location ? ` · ${location}` : ''}</p>` : ''}</div>
          ${dates ? `<p class="portfolio-date">${escapeHtml(dates)}</p>` : ''}
        </div>
        ${portfolioBullets(experience.description)}
      </article>
    `;
  }).join('') || '<p class="portfolio-empty">Add experience details in ResumeCraft.</p>';

  const skills = entries('skills').map(group => {
    const items = Array.isArray(group.items) ? group.items.filter(Boolean) : [];
    return `
      <article class="portfolio-skill-group">
        <h3>${escapeHtml(group.category || 'Skills')}</h3>
        <ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
      </article>
    `;
  }).join('') || '<p class="portfolio-empty">Add skills in ResumeCraft.</p>';

  const projects = entries('projects').map(project => {
    const link = safeExternalUrl(project.link);
    const tech = escapeHtml(project.tech || '');
    return `
      <article class="portfolio-project-card">
        <div class="portfolio-item-heading">
          <h3>${escapeHtml(project.title || 'Featured Project')}</h3>
          ${portfolioLink('View project ↗', link, 'portfolio-project-link')}
        </div>
        ${tech ? `<p class="portfolio-subtitle">${tech}</p>` : ''}
        ${project.description ? `<p class="portfolio-copy">${escapeHtml(project.description)}</p>` : ''}
      </article>
    `;
  }).join('') || '<p class="portfolio-empty">Add featured projects in ResumeCraft.</p>';

  const education = entries('education').map(item => {
    const dates = [item.startDate, item.endDate].filter(Boolean).join(' — ');
    const details = [item.location, dates, item.grade, item.honors].filter(Boolean).map(escapeHtml);
    return `
      <article class="portfolio-simple-card">
        <h3>${escapeHtml(item.degree || 'Education')}</h3>
        <p class="portfolio-subtitle">${escapeHtml(item.school || '')}</p>
        ${details.length ? `<p class="portfolio-copy">${details.join(' · ')}</p>` : ''}
      </article>
    `;
  }).join('') || '<p class="portfolio-empty">Add education in ResumeCraft.</p>';

  const certifications = entries('certifications').map(item => {
    const url = safeExternalUrl(item.link);
    const label = escapeHtml(item.name || 'Certification');
    const titleMarkup = url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${label}</a>` : label;
    const details = [item.issuer, item.date].filter(Boolean).map(escapeHtml);
    return `
      <article class="portfolio-simple-card">
        <h3>${titleMarkup}</h3>
        ${details.length ? `<p class="portfolio-copy">${details.join(' · ')}</p>` : ''}
      </article>
    `;
  }).join('') || '<p class="portfolio-empty">Add certifications in ResumeCraft.</p>';

  const location = escapeHtml(person.location || '');
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeHtml(person.summary || `${person.fullName || 'Professional'} — ${person.jobTitle || 'resume and portfolio'}`)}">
  <title>${name} | Portfolio</title>
  <style>
    :root {
      color-scheme: light;
      --portfolio-primary: ${primaryColor};
      --portfolio-secondary: ${secondaryColor};
      --portfolio-font: ${fontFamily};
      --portfolio-ink: #18212f;
      --portfolio-muted: #647084;
      --portfolio-paper: #ffffff;
      --portfolio-canvas: #f4f6f8;
      --portfolio-line: #e2e7ee;
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body { margin: 0; background: var(--portfolio-canvas); color: var(--portfolio-ink); font-family: var(--portfolio-font); line-height: 1.65; }
    a { color: var(--portfolio-primary); text-decoration-thickness: 1px; text-underline-offset: 3px; }
    a:focus-visible { outline: 3px solid var(--portfolio-primary); outline-offset: 3px; }
    .portfolio-wrap { width: min(1080px, calc(100% - 40px)); margin: 0 auto; }
    .portfolio-hero { position: relative; overflow: hidden; background: var(--portfolio-secondary); color: #fff; padding: 28px 0 76px; }
    .portfolio-hero::after { position: absolute; right: -9rem; bottom: -16rem; width: 34rem; height: 34rem; border: 1px solid rgba(255,255,255,.16); border-radius: 50%; box-shadow: 0 0 0 48px rgba(255,255,255,.045), 0 0 0 96px rgba(255,255,255,.03); content: ""; pointer-events: none; }
    .portfolio-nav { position: relative; z-index: 1; display: flex; align-items: center; justify-content: space-between; gap: 20px; }
    .portfolio-brand { color: #fff; font-weight: 750; text-decoration: none; }
    .portfolio-nav-links { display: flex; flex-wrap: wrap; gap: 18px; }
    .portfolio-nav-links a { color: rgba(255,255,255,.82); font-size: .88rem; text-decoration: none; }
    .portfolio-hero-content { position: relative; z-index: 1; max-width: 760px; padding-top: 92px; }
    .portfolio-eyebrow { margin: 0 0 14px; color: var(--portfolio-primary); font-size: .76rem; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; }
    .portfolio-hero h1 { margin: 0; font-size: clamp(2.6rem, 8vw, 5.2rem); letter-spacing: -.055em; line-height: 1.03; }
    .portfolio-title { margin: 18px 0 0; color: rgba(255,255,255,.82); font-size: clamp(1.05rem, 2.6vw, 1.42rem); }
    .portfolio-contact-links { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 30px; }
    .portfolio-contact-link { display: inline-flex; min-height: 38px; align-items: center; border: 1px solid rgba(255,255,255,.23); border-radius: 999px; padding: 7px 13px; color: #fff; font-size: .8rem; text-decoration: none; transition: background .18s ease, border-color .18s ease; }
    .portfolio-contact-link:hover { border-color: var(--portfolio-primary); background: rgba(255,255,255,.1); }
    .portfolio-location { margin: 17px 0 0; color: rgba(255,255,255,.65); font-size: .88rem; }
    main { padding: 30px 0 60px; }
    .portfolio-section { margin: 18px 0; border: 1px solid var(--portfolio-line); border-radius: 18px; padding: clamp(22px, 4vw, 38px); background: var(--portfolio-paper); box-shadow: 0 12px 32px rgba(20,30,45,.045); }
    .portfolio-section-heading { display: flex; align-items: baseline; gap: 12px; margin: 0 0 22px; border-bottom: 1px solid var(--portfolio-line); padding-bottom: 13px; }
    .portfolio-section-heading span { color: var(--portfolio-primary); font-size: .72rem; font-weight: 800; letter-spacing: .12em; }
    .portfolio-section-heading h2 { margin: 0; font-size: 1.35rem; letter-spacing: -.025em; }
    .portfolio-copy { margin: 8px 0 0; color: var(--portfolio-muted); white-space: pre-line; }
    .portfolio-timeline { display: grid; gap: 22px; }
    .portfolio-timeline-item { position: relative; border-left: 2px solid var(--portfolio-primary); padding: 0 0 0 20px; }
    .portfolio-timeline-item::before { position: absolute; top: 5px; left: -6px; width: 10px; height: 10px; border: 2px solid var(--portfolio-paper); border-radius: 50%; background: var(--portfolio-primary); content: ""; }
    .portfolio-item-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
    .portfolio-item-heading h3, .portfolio-skill-group h3, .portfolio-simple-card h3 { margin: 0; font-size: 1rem; line-height: 1.35; }
    .portfolio-subtitle, .portfolio-date { margin: 5px 0 0; color: var(--portfolio-muted); font-size: .86rem; }
    .portfolio-date { flex: 0 0 auto; text-align: right; }
    .portfolio-bullets { display: grid; gap: 7px; margin: 13px 0 0; padding-left: 19px; color: var(--portfolio-muted); }
    .portfolio-bullets li::marker { color: var(--portfolio-primary); }
    .portfolio-skills-grid, .portfolio-projects-grid, .portfolio-simple-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 230px), 1fr)); gap: 14px; }
    .portfolio-skill-group, .portfolio-project-card, .portfolio-simple-card { min-width: 0; border: 1px solid var(--portfolio-line); border-radius: 13px; padding: 17px; background: #fff; }
    .portfolio-skill-group { border-top: 3px solid var(--portfolio-primary); }
    .portfolio-skill-group ul { display: flex; flex-wrap: wrap; gap: 7px; margin: 13px 0 0; padding: 0; list-style: none; }
    .portfolio-skill-group li { border-radius: 999px; padding: 5px 9px; background: var(--portfolio-canvas); color: var(--portfolio-muted); font-size: .78rem; }
    .portfolio-project-link { flex: 0 0 auto; font-size: .8rem; font-weight: 700; }
    .portfolio-empty { margin: 0; color: var(--portfolio-muted); font-size: .9rem; }
    .portfolio-footer { border-top: 1px solid var(--portfolio-line); padding: 24px 0 34px; color: var(--portfolio-muted); font-size: .82rem; text-align: center; }
    @media (max-width: 640px) {
      .portfolio-wrap { width: min(100% - 28px, 1080px); }
      .portfolio-hero { padding-top: 20px; }
      .portfolio-hero-content { padding-top: 68px; }
      .portfolio-nav { align-items: flex-start; }
      .portfolio-nav-links { justify-content: flex-end; gap: 8px 12px; font-size: .78rem; }
      .portfolio-item-heading { display: block; }
      .portfolio-date { text-align: left; }
    }
    @media (prefers-reduced-motion: reduce) {
      html { scroll-behavior: auto; }
      *, *::before, *::after { transition-duration: .01ms !important; }
    }
  </style>
</head>
<body>
  <header class="portfolio-hero" id="top">
    <div class="portfolio-wrap">
      <div class="portfolio-nav">
        <a class="portfolio-brand" href="#top">${name}</a>
        <nav class="portfolio-nav-links" aria-label="Portfolio sections">
          <a href="#about">About</a><a href="#experience">Experience</a><a href="#skills">Skills</a><a href="#projects">Projects</a>
        </nav>
      </div>
      <div class="portfolio-hero-content">
        <p class="portfolio-eyebrow">Portfolio</p>
        <h1>${name}</h1>
        <p class="portfolio-title">${title}</p>
        ${contactLinks ? `<div class="portfolio-contact-links">${contactLinks}</div>` : ''}
        ${location ? `<p class="portfolio-location">${location}</p>` : ''}
      </div>
    </div>
  </header>
  <main class="portfolio-wrap">
    <section class="portfolio-section" id="about">
      <div class="portfolio-section-heading"><span>01</span><h2>About</h2></div>
      <p class="portfolio-copy">${summary}</p>
    </section>
    <section class="portfolio-section" id="experience">
      <div class="portfolio-section-heading"><span>02</span><h2>Experience</h2></div>
      <div class="portfolio-timeline">${experiences}</div>
    </section>
    <section class="portfolio-section" id="skills">
      <div class="portfolio-section-heading"><span>03</span><h2>Skills</h2></div>
      <div class="portfolio-skills-grid">${skills}</div>
    </section>
    <section class="portfolio-section" id="projects">
      <div class="portfolio-section-heading"><span>04</span><h2>Featured Projects</h2></div>
      <div class="portfolio-projects-grid">${projects}</div>
    </section>
    <section class="portfolio-section" id="education">
      <div class="portfolio-section-heading"><span>05</span><h2>Education</h2></div>
      <div class="portfolio-simple-grid">${education}</div>
    </section>
    <section class="portfolio-section" id="certifications">
      <div class="portfolio-section-heading"><span>06</span><h2>Certifications</h2></div>
      <div class="portfolio-simple-grid">${certifications}</div>
    </section>
  </main>
  <footer class="portfolio-footer"><div class="portfolio-wrap">© ${year} ${name}. All rights reserved.</div></footer>
</body>
</html>`;
}
