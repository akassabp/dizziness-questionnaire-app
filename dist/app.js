(() => {
  "use strict";
  const defaults = window.NEBULA_DATA;
  if (!defaults) throw new Error("Questionnaire data did not load.");
  const ACCESS_HASH = "0f7a4f8120712df5464758e375faf9829818369c774fcedb64ed7bd3b62f5ea1";
  const STORAGE_KEY = "nebula-complete-configuration-v2";
  const byId = (id) => document.getElementById(id);
  const clone = (value) => structuredClone(value);
  const defaultConfiguration = () => ({ version: 2, name: "Nebula workbook defaults", sourceWorkbook: defaults.sourceWorkbook, categories: clone(defaults.categories), questions: clone(defaults.questions), rules: clone(defaults.rules) });

  const accessGate = byId("access-gate"), accessForm = byId("access-form"), accessCode = byId("access-code"), accessError = byId("access-error");
  async function sha256(value) { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
  function unlockApplication() { sessionStorage.setItem("nebula-access", "granted"); document.body.classList.remove("auth-locked"); accessGate.hidden = true; }
  if (sessionStorage.getItem("nebula-access") === "granted") unlockApplication();
  accessForm.addEventListener("submit", async (event) => { event.preventDefault(); accessError.textContent = ""; if (await sha256(accessCode.value) === ACCESS_HASH) { accessCode.value = ""; unlockApplication(); } else { accessError.textContent = "Incorrect access code."; accessCode.select(); } });

  function normalizeConfiguration(value) {
    if (!value || !Array.isArray(value.questions) || !Array.isArray(value.categories) || !Array.isArray(value.rules)) throw new Error("JSON must contain questions, categories, and rules arrays.");
    const categories = [...new Set(value.categories.map((item) => String(item).trim()).filter(Boolean))];
    if (!categories.length) throw new Error("At least one class is required.");
    const ids = new Set();
    const questions = value.questions.map((question, index) => {
      const id = String(question.id || `q-${index + 1}`).trim();
      if (!id || ids.has(id)) throw new Error("Every question must have a unique ID.");
      ids.add(id);
      const prompt = String(question.prompt || "").trim();
      const options = [...new Set((question.options || []).map((item) => String(item).trim()).filter(Boolean))];
      if (!prompt || !options.length) throw new Error(`Question ${index + 1} needs a prompt and at least one answer.`);
      return { id, prompt, kind: question.kind === "multi" ? "multi" : "single", options };
    });
    if (!questions.length) throw new Error("At least one question is required.");
    const questionMap = new Map(questions.map((q) => [q.id, q]));
    const rules = value.rules.map((rule) => ({ category: String(rule.category || "").trim(), questionId: String(rule.questionId || "").trim(), answer: String(rule.answer || "").trim(), weight: Number(rule.weight), editable: true }))
      .filter((rule) => categories.includes(rule.category) && questionMap.has(rule.questionId) && questionMap.get(rule.questionId).options.includes(rule.answer) && Number.isFinite(rule.weight) && rule.weight >= 0 && rule.weight <= 100);
    return { version: 2, name: String(value.name || "Custom configuration"), sourceWorkbook: value.sourceWorkbook || null, categories, questions, rules };
  }
  function loadSavedConfiguration() { try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); return saved ? normalizeConfiguration(saved.configuration || saved) : defaultConfiguration(); } catch { return defaultConfiguration(); } }

  const saved = loadSavedConfiguration();
  const state = { currentQuestion: 0, answers: {}, active: clone(saved), draft: clone(saved), categoryFilter: "All classes", ruleSearch: "" };
  const els = {
    questionList: byId("question-list"), questionCount: byId("question-count"), questionMeta: byId("question-meta"), questionPrompt: byId("question-prompt"), answerOptions: byId("answer-options"), previous: byId("previous-question"), next: byId("next-question"), clear: byId("clear-answers"), scores: byId("score-list"), answeredCount: byId("answered-count"), configSummary: byId("configuration-summary"), categoryFilter: byId("category-filter"), ruleSearch: byId("rule-search"), configList: byId("configuration-list"), restore: byId("restore-defaults"), export: byId("export-configuration"), update: byId("update-model"), addQuestion: byId("add-question"), addCategory: byId("add-category"), import: byId("import-configuration"), file: byId("configuration-file"), toast: byId("toast")
  };
  function escapeHtml(value) { return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
  function shortPrompt(prompt) { return prompt.length > 68 ? `${prompt.slice(0, 65)}…` : prompt; }
  function isAnswered(question) { const value = state.answers[question.id]; return Array.isArray(value) ? value.length > 0 : Boolean(value); }
  function findRule(category, questionId, answer) { return state.draft.rules.find((rule) => rule.category === category && rule.questionId === questionId && rule.answer === answer); }
  function getWeight(category, questionId, answer) { return Number(findRule(category, questionId, answer)?.weight || 0); }

  function renderQuestionNavigation() {
    const questions = state.active.questions;
    els.questionCount.textContent = `${questions.length} questions`;
    els.questionList.innerHTML = questions.map((question, index) => `<button class="question-link ${index === state.currentQuestion ? "active" : ""} ${isAnswered(question) ? "answered" : ""}" data-question-index="${index}"><span class="question-number">${index + 1}</span><span class="question-title">${escapeHtml(shortPrompt(question.prompt))}</span></button>`).join("");
  }
  function renderCurrentQuestion() {
    const questions = state.active.questions;
    state.currentQuestion = Math.min(state.currentQuestion, questions.length - 1);
    const question = questions[state.currentQuestion], inputType = question.kind === "multi" ? "checkbox" : "radio", current = state.answers[question.id];
    els.questionMeta.textContent = `Question ${state.currentQuestion + 1} of ${questions.length} · ${question.kind === "multi" ? "Select all that apply" : "Select one answer"}`;
    els.questionPrompt.textContent = question.prompt;
    els.answerOptions.innerHTML = question.options.map((option) => { const checked = question.kind === "multi" ? (current || []).includes(option) : current === option; return `<label class="answer-option"><input type="${inputType}" name="question-${escapeHtml(question.id)}" value="${escapeHtml(option)}" ${checked ? "checked" : ""} /><span>${escapeHtml(option)}</span></label>`; }).join("");
    els.previous.disabled = state.currentQuestion === 0; els.next.disabled = state.currentQuestion === questions.length - 1; renderQuestionNavigation(); renderScores();
  }
  function scoreAnswers() {
    const totals = Object.fromEntries(state.active.categories.map((category) => [category, { points: 0, available: 0 }]));
    state.active.rules.forEach((rule) => { if (!totals[rule.category]) return; totals[rule.category].available += Number(rule.weight); const answer = state.answers[rule.questionId]; if (Array.isArray(answer) ? answer.includes(rule.answer) : answer === rule.answer) totals[rule.category].points += Number(rule.weight); });
    return state.active.categories.map((category) => { const item = totals[category]; return { category, percent: item.available ? Math.max(0, Math.min(100, item.points / item.available * 100)) : 0 }; }).sort((a, b) => b.percent - a.percent || a.category.localeCompare(b.category));
  }
  function renderScores() {
    const questions = state.active.questions; els.answeredCount.textContent = `${questions.filter(isAnswered).length}/${questions.length} answered`;
    els.scores.innerHTML = scoreAnswers().map((score) => `<div class="score-row"><div class="score-label"><span>${escapeHtml(score.category)}</span><strong>${score.percent.toFixed(1)}%</strong></div><div class="score-track" aria-label="${escapeHtml(score.category)} ${score.percent.toFixed(1)} percent"><div class="score-fill" style="width:${score.percent}%"></div></div></div>`).join("");
  }
  function renderCategoryFilter() {
    const available = ["All classes", ...state.draft.categories]; if (!available.includes(state.categoryFilter)) state.categoryFilter = "All classes";
    els.categoryFilter.innerHTML = available.map((category) => `<option ${category === state.categoryFilter ? "selected" : ""}>${escapeHtml(category)}</option>`).join("");
  }
  function renderConfiguration() {
    const weighted = state.draft.rules.filter((rule) => Number(rule.weight) > 0).length;
    els.configSummary.innerHTML = [[state.draft.categories.length, "Classes"], [state.draft.questions.length, "Questions"], [weighted, "Weighted answer-class pairs"]].map(([value, label]) => `<div class="summary-card"><strong>${value}</strong><span>${label}</span></div>`).join("");
    renderCategoryFilter();
    const query = state.ruleSearch.trim().toLowerCase();
    const categoryChips = state.draft.categories.map((category) => `<span class="category-chip">${escapeHtml(category)}<button type="button" data-action="remove-category" data-category="${escapeHtml(category)}" aria-label="Remove ${escapeHtml(category)}">×</button></span>`).join("");
    const cards = state.draft.questions.map((question, index) => {
      if (query && !`${question.prompt} ${question.options.join(" ")}`.toLowerCase().includes(query)) return "";
      const categories = state.categoryFilter === "All classes" ? state.draft.categories : [state.categoryFilter];
      return `<section class="question-editor" data-question-id="${escapeHtml(question.id)}"><div class="editor-heading"><span class="editor-number">${index + 1}</span><input class="prompt-input" data-field="prompt" value="${escapeHtml(question.prompt)}" aria-label="Question prompt" /><select data-field="kind" aria-label="Answer selection type"><option value="single" ${question.kind === "single" ? "selected" : ""}>Pick one</option><option value="multi" ${question.kind === "multi" ? "selected" : ""}>Check all</option></select><button class="icon-button" data-action="move-up" title="Move up" ${index === 0 ? "disabled" : ""}>↑</button><button class="icon-button" data-action="move-down" title="Move down" ${index === state.draft.questions.length - 1 ? "disabled" : ""}>↓</button><button class="icon-button danger" data-action="remove-question" title="Remove question">×</button></div><div class="answer-editor-list">${question.options.map((answer, answerIndex) => `<div class="answer-editor" data-answer-index="${answerIndex}"><input class="answer-text-input" data-field="answer" value="${escapeHtml(answer)}" aria-label="Answer text" /><div class="weight-grid">${categories.map((category) => `<label><span>${escapeHtml(category)}</span><input type="number" min="0" max="100" step="0.1" value="${getWeight(category, question.id, answer)}" data-field="weight" data-category="${escapeHtml(category)}" aria-label="${escapeHtml(category)} weight" /></label>`).join("")}</div><button class="icon-button danger" data-action="remove-answer" title="Remove answer">×</button></div>`).join("")}</div><button class="button secondary compact" data-action="add-answer">Add answer</button></section>`;
    }).join("");
    els.configList.innerHTML = `<div class="category-manager"><strong>Diagnostic classes</strong><div class="category-chips">${categoryChips}</div></div>${cards || `<div class="empty-state">No questions match this search.</div>`}`;
  }
  function setWeight(category, questionId, answer, value) {
    const numeric = Number(value); if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) return false;
    const existing = findRule(category, questionId, answer); if (existing) existing.weight = Math.round(numeric * 1000) / 1000; else state.draft.rules.push({ category, questionId, answer, weight: Math.round(numeric * 1000) / 1000, editable: true }); return true;
  }
  function updateScoringModel() {
    try { state.draft = normalizeConfiguration(state.draft); } catch (error) { showToast(error.message); return; }
    state.active = clone(state.draft); state.answers = {}; state.currentQuestion = 0; localStorage.setItem(STORAGE_KEY, JSON.stringify({ savedAt: new Date().toISOString(), configuration: state.active })); renderCurrentQuestion(); renderConfiguration(); showToast("Configuration applied and saved in this browser.");
  }
  function restoreDefaults() { state.draft = defaultConfiguration(); state.categoryFilter = "All classes"; renderConfiguration(); showToast("Workbook defaults restored in the editor. Apply to activate them."); }
  function exportConfiguration() {
    const payload = { ...clone(state.draft), exportedAt: new Date().toISOString() }, url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })), anchor = document.createElement("a");
    anchor.href = url; anchor.download = "nebula-questionnaire-configuration.json"; anchor.click(); URL.revokeObjectURL(url); showToast("Complete configuration exported.");
  }
  async function importConfiguration(file) {
    try { state.draft = normalizeConfiguration(JSON.parse(await file.text())); state.categoryFilter = "All classes"; state.ruleSearch = ""; els.ruleSearch.value = ""; renderConfiguration(); showToast("Configuration imported. Review it, then apply when ready."); } catch (error) { showToast(`Import failed: ${error.message}`); } els.file.value = "";
  }
  function addQuestion() { const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; state.draft.questions.push({ id, prompt: "New question", kind: "single", options: ["New answer"] }); renderConfiguration(); els.configList.querySelector(`[data-question-id="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }
  let toastTimer;
  function showToast(message) { clearTimeout(toastTimer); els.toast.textContent = message; els.toast.classList.add("show"); toastTimer = setTimeout(() => els.toast.classList.remove("show"), 3000); }

  document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => { document.querySelectorAll(".tab").forEach((item) => { const active = item === tab; item.classList.toggle("active", active); item.setAttribute("aria-selected", String(active)); }); document.querySelectorAll(".view").forEach((view) => view.classList.remove("active")); byId(`${tab.dataset.view}-view`).classList.add("active"); if (tab.dataset.view === "configuration") renderConfiguration(); }));
  els.questionList.addEventListener("click", (event) => { const button = event.target.closest("[data-question-index]"); if (button) { state.currentQuestion = Number(button.dataset.questionIndex); renderCurrentQuestion(); } });
  els.answerOptions.addEventListener("change", (event) => { const question = state.active.questions[state.currentQuestion]; state.answers[question.id] = question.kind === "multi" ? [...els.answerOptions.querySelectorAll("input:checked")].map((input) => input.value) : event.target.value; renderQuestionNavigation(); renderScores(); });
  els.previous.addEventListener("click", () => { state.currentQuestion--; renderCurrentQuestion(); }); els.next.addEventListener("click", () => { state.currentQuestion++; renderCurrentQuestion(); }); els.clear.addEventListener("click", () => { state.answers = {}; renderCurrentQuestion(); showToast("Questionnaire answers cleared."); });
  els.categoryFilter.addEventListener("change", (event) => { state.categoryFilter = event.target.value; renderConfiguration(); }); els.ruleSearch.addEventListener("input", (event) => { state.ruleSearch = event.target.value; renderConfiguration(); els.ruleSearch.focus(); });
  els.configList.addEventListener("change", (event) => {
    const card = event.target.closest("[data-question-id]"); if (!card) return; const question = state.draft.questions.find((item) => item.id === card.dataset.questionId); if (!question) return;
    if (event.target.dataset.field === "kind") question.kind = event.target.value;
    if (event.target.dataset.field === "prompt") question.prompt = event.target.value.trim() || "Untitled question";
    if (event.target.dataset.field === "answer") { const row = event.target.closest("[data-answer-index]"), index = Number(row.dataset.answerIndex), oldAnswer = question.options[index], newAnswer = event.target.value.trim() || "Untitled answer"; question.options[index] = newAnswer; state.draft.rules.filter((rule) => rule.questionId === question.id && rule.answer === oldAnswer).forEach((rule) => { rule.answer = newAnswer; }); }
    if (event.target.dataset.field === "weight" && !setWeight(event.target.dataset.category, question.id, question.options[Number(event.target.closest("[data-answer-index]").dataset.answerIndex)], event.target.value)) showToast("Weights must be between 0 and 100.");
    renderConfiguration();
  });
  els.configList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]"); if (!button) return; const action = button.dataset.action;
    if (action === "remove-category") { if (state.draft.categories.length === 1) return showToast("At least one class is required."); const category = button.dataset.category; state.draft.categories = state.draft.categories.filter((item) => item !== category); state.draft.rules = state.draft.rules.filter((rule) => rule.category !== category); }
    else { const card = button.closest("[data-question-id]"); if (!card) return; const index = state.draft.questions.findIndex((item) => item.id === card.dataset.questionId), question = state.draft.questions[index];
      if (action === "move-up" && index > 0) [state.draft.questions[index - 1], state.draft.questions[index]] = [state.draft.questions[index], state.draft.questions[index - 1]];
      if (action === "move-down" && index < state.draft.questions.length - 1) [state.draft.questions[index + 1], state.draft.questions[index]] = [state.draft.questions[index], state.draft.questions[index + 1]];
      if (action === "remove-question") { if (state.draft.questions.length === 1) return showToast("At least one question is required."); state.draft.questions.splice(index, 1); state.draft.rules = state.draft.rules.filter((rule) => rule.questionId !== question.id); }
      if (action === "add-answer") question.options.push("New answer");
      if (action === "remove-answer") { if (question.options.length === 1) return showToast("A question needs at least one answer."); const answerIndex = Number(button.closest("[data-answer-index]").dataset.answerIndex), answer = question.options.splice(answerIndex, 1)[0]; state.draft.rules = state.draft.rules.filter((rule) => !(rule.questionId === question.id && rule.answer === answer)); }
    } renderConfiguration();
  });
  els.addQuestion.addEventListener("click", addQuestion);
  els.addCategory.addEventListener("click", () => { const name = prompt("Name the new diagnostic class:")?.trim(); if (!name) return; if (state.draft.categories.includes(name)) return showToast("That class already exists."); state.draft.categories.push(name); renderConfiguration(); });
  els.import.addEventListener("click", () => els.file.click()); els.file.addEventListener("change", () => { if (els.file.files[0]) importConfiguration(els.file.files[0]); }); els.restore.addEventListener("click", restoreDefaults); els.export.addEventListener("click", exportConfiguration); els.update.addEventListener("click", updateScoringModel);
  renderCurrentQuestion(); renderConfiguration();
})();
