# ResumeCraft — Modern ATS-Friendly Resume Builder

A modern, high-performance, responsive Single-Page Resume Builder web application built with clean modular JavaScript (ES Modules), Tailwind CSS, and print-ready CSS.

---

## 🌟 Key Features

1. **Interactive Landing Page**
   - Preview the resume and try template, accent-color, and feature-demo controls before entering the editor.
   - Template and color choices carry into the editor when selected.
2. **Split-Screen Interactive Editor & Live A4 Preview**
   - Real-time instant rendering as you type.
   - Exact A4 paper aspect ratio simulation with page-break indicators.
   - Smooth zoom controls (50% to 140%, plus one-click "Fit Width").
   - Seamless mobile responsiveness (toggle between "Editor Form" and "Live Preview").

3. **36+ Curated Resume Templates**
   - Curated template variants span eight layouts: Modern Professional, Classic Executive, Executive Banner, Developer, Compact ATS, Creative Studio, Minimal Nordic, and Academic Scholar.

4. **Obsidian & Champagne Appearance and Customization**
   - Light and dark themes use ResumeCraft's Obsidian & Champagne brand palette.
   - **10+ Curated Color Palettes**, coordinated **Color Moods**, and a native Hex Color Picker.
   - **6 Curated Typography Pairings**: Inter, Roboto, Poppins, Merriweather, Playfair Display, Montserrat.
   - **Font Scaling & Layout Spacing Density**: Compact (easy 1-page fit), Balanced, or Spacious.
   - **Profile Photo Support**: Upload custom photo, toggle visibility on/off, or remove.

5. **ATS Audit, Recruiter Scan & Writing Feedback**
   - Algorithmic 100-point score evaluating contact completeness, action verbs, quantified metrics, keyword density, and section structure.
   - **Click-to-Fix ATS Audit** suggestions jump to the relevant editor field.
   - **6-Second Scan** preview emphasizes scan-friendly content; the **Weak-Phrase Detector** flags generic resume language.
   - Optional Gemini critique returns three strengths, three specific gaps, and one high-impact rewrite.
   - One-click action verb inserters ("Architected", "Spearheaded", "Optimized", "Scaled", etc.).
   - Pre-crafted domain summary templates for Software Engineers, Product Managers, Designers, and New Grads.

6. **Instant Export & Import**
   - **Direct PDF Download**: Pixel-perfect vector/canvas export using `html2pdf.js`.
   - **Native Print Dialog**: Dedicated `@media print` CSS optimized for borderless A4 printing.
   - **1-Click Resume Website Export**: Download a standalone HTML portfolio page.
   - **JSON Save & Import**: Export your resume data to a `.json` backup and restore anytime.
   - **Auto-Save**: Changes persist automatically in browser `localStorage`.

7. **Instant Pre-filled Demo Presets**
   - Senior Software Engineer
   - Principal Product Manager
   - Senior UI/UX Designer
   - AI / Data Scientist
   - Blank Slate / Start from Scratch
8. **Writing and Tailoring Tools**
   - **Undo / Redo**: Restore recent edits (up to 50 history states) using the toolbar or Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z.
   - **Job Description Match**: Compare a pasted job post against resume text, view frequently occurring matched/missing terms, and keep the comparison in local browser storage. Matching is a text heuristic, not an ATS score or hiring prediction.
   - **Optional BYOK Gemini AI**: Save your own Gemini API key to improve the professional summary or experience bullets, draft a cover letter or follow-up email, generate interview questions, and critique a resume. AI actions send selected resume details or job post content directly to Google Gemini.
9. **Application Workspace**
   - Keep a reusable Master resume and create an independent tailored copy for each role.
   - Track each opportunity through Saved, Preparing, Applied, Interview, Offer, and Closed; add job links, descriptions, deadlines, and notes.
   - Filter applications, switch between Cards and a drag-and-drop stage board, review deadline summaries, and open the correct resume copy directly from the dashboard.
   - Use application-specific Cover Letter and **Interview War Room** tools for mock questions, STAR stories, and follow-up emails; these fields are added with empty defaults when loading older workspaces.
   - Export or restore a versioned JSON backup of the full workspace. Existing saved resumes are migrated into the Master resume on first launch.
10. **Local Privacy and Appearance**
   - Resume and application data stay in this browser's local storage unless you export a backup or use optional AI Assist, which sends selected content to Google Gemini.
   - The optional Gemini key is stored separately in this browser profile and is not included in workspace backups. Browser local storage is not a secure vault; avoid saving a key on shared devices, and clear it in AI Settings whenever you no longer need it.
   - The Obsidian & Champagne light/dark appearance is remembered on this device.
   - Optional deadline notifications are best-effort while the app page is open. They require browser permission and HTTPS or localhost; they are not delivered after the browser is closed.

---

## 🚀 How to Run

### Local Python Server (Recommended)
ES modules require a local HTTP origin in modern browsers. Running the page directly with `file://` is not supported.

Run the included lightweight server script from this directory:
```bash
python start_server.py
```
This automatically starts a local HTTP server at `http://localhost:8000` and opens your browser.

---

## 📁 Project Structure

```
resume-builder/
├── index.html            # Main HTML5 application shell & modals
├── start_server.py       # Python local web server launcher
├── README.md             # Documentation & guide
├── css/
│   └── styles.css        # A4 paper simulation, themes, print queries
├── js/
│   ├── app.js            # Main reactive store & event orchestrator
│   ├── storage.js        # Workspace persistence, migration, and backups
│   ├── dashboard.js      # Application Studio and deadline reminders
│   ├── data.js           # Presets, color palettes, fonts, action verbs
│   ├── ats.js            # ATS scoring algorithm & recommendation engine
│   └── templates.js      # Eight resume layout renderers and website export
└── assets/               # Local icons and media assets
```

