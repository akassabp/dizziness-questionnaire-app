(() => {
  "use strict";
  const defaults = window.NEBULA_DATA;
  if (!defaults) throw new Error("Questionnaire data did not load.");
  const ACCESS_HASH = "0f7a4f8120712df5464758e375faf9829818369c774fcedb64ed7bd3b62f5ea1";
  const RULES_KEY = "nebula-desktop-compatible-rules-v2-km2";
  const $ = (id) => document.getElementById(id);
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const clean = (value) => String(value ?? "").trim().replace(/\s+/g, " ");
  const normalized = (value) => clean(value).toLocaleLowerCase().replace(/[.’]/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
  const questions = clone(defaults.questions);
  const defaultRules = clone(defaults.rules).map(normalizeRule).filter(Boolean);

  function normalizeRule(rule) {
    const category = clean(rule.category), questionId = clean(rule.questionId || rule.question_id), answer = clean(rule.answer), weight = Number(rule.weight);
    return category && questionId && answer && Number.isFinite(weight) ? { category, questionId, answer, weight, source: rule.source || "Workbook default" } : null;
  }
  function loadRules() {
    try { const value = JSON.parse(localStorage.getItem(RULES_KEY)); return Array.isArray(value?.rules) ? value.rules.map(normalizeRule).filter(Boolean) : clone(defaultRules); }
    catch { return clone(defaultRules); }
  }
  const state = { current: 0, answers: {}, rules: loadRules(), draftRules: [], selectedRule: null, editingRule: null };
  state.draftRules = clone(state.rules);

  const gate = $("access-gate"), accessForm = $("access-form"), accessCode = $("access-code"), accessError = $("access-error");
  async function sha256(value) { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
  function unlock() { sessionStorage.setItem("nebula-access", "granted"); document.body.classList.remove("auth-locked"); gate.hidden = true; }
  if (sessionStorage.getItem("nebula-access") === "granted") unlock();
  accessForm.addEventListener("submit", async (event) => { event.preventDefault(); accessError.textContent = ""; if (await sha256(accessCode.value) === ACCESS_HASH) { accessCode.value = ""; unlock(); } else { accessError.textContent = "Incorrect access code."; accessCode.select(); } });

  const els = {
    list: $("question-list"), meta: $("question-meta"), answerState: $("answer-state"), prompt: $("question-prompt"), options: $("answer-options"), previous: $("previous-question"), next: $("next-question"), clearAnswer: $("clear-answer"), scores: $("score-list"), completion: $("answered-count"), patientId: $("patient-id"), visitDate: $("visit-date"), birthYear: $("birth-year"), notes: $("visit-notes"), sessionFile: $("session-file"), category: $("rule-category"), question: $("rule-question"), answer: $("rule-answer"), weight: $("rule-weight"), categoryFilter: $("category-filter"), search: $("rule-search"), tableBody: $("rule-table-body"), addUpdate: $("add-update-rule"), deleteRule: $("delete-rule"), toast: $("toast")
  };
  const escapeHtml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const isAnswered = (question) => { const value = state.answers[question.id]; return Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null && value !== ""; };
  const categories = (rules = state.draftRules) => [...new Set(rules.map((rule) => rule.category))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  const answerValues = (value) => Array.isArray(value) ? value.map(clean).filter(Boolean) : clean(value) ? [clean(value)] : [];
  const conditionMet = (question) => !question.showWhen || answerValues(state.answers[question.showWhen.questionId]).map(normalized).includes(normalized(question.showWhen.answer));
  const visibleQuestions = () => questions.filter(conditionMet);
  const currentQuestion = () => { const visible = visibleQuestions(); state.current = Math.max(0, Math.min(state.current, visible.length - 1)); return visible[state.current]; };

  function renderQuestionList() {
    els.list.innerHTML = visibleQuestions().map((question, index) => `<button class="question-link ${index === state.current ? "active" : ""} ${isAnswered(question) ? "answered" : ""}" data-index="${index}"><span>${isAnswered(question) ? "✓" : "○"}</span><b>${String(index + 1).padStart(2, "0")}</b><em>${escapeHtml(question.prompt)}</em></button>`).join("");
    els.list.querySelector(".active")?.scrollIntoView({ block: "nearest" });
  }
  function inputMarkup(question, value) {
    if (question.kind === "single" || question.kind === "multi") {
      const type = question.kind === "multi" ? "checkbox" : "radio";
      return question.options.map((option) => { const checked = question.kind === "multi" ? (value || []).includes(option) : value === option; return `<label class="choice"><input type="${type}" name="answer-${escapeHtml(question.id)}" value="${escapeHtml(option)}" ${checked ? "checked" : ""}><span>${escapeHtml(option)}</span></label>`; }).join("");
    }
    if (question.kind === "date") return `<input class="free-answer" type="date" value="${escapeHtml(value || "")}">`;
    if (question.kind === "numeric") return `<input class="free-answer" type="number" min="0" value="${escapeHtml(value ?? "")}" placeholder="Not answered">`;
    return `<p class="text-unavailable-note">(Note from Ali: Current model cannot process text, so I removed this box.)</p>`;
  }
  function renderQuestion() {
    const visible = visibleQuestions(), question = currentQuestion(), answered = isAnswered(question);
    els.meta.textContent = `Question ${state.current + 1} of ${visible.length}  |  ID ${question.id}`;
    els.answerState.textContent = question.kind === "text" ? "No response required" : answered ? "Answered" : "Not answered";
    els.clearAnswer.disabled = question.kind === "text";
    els.prompt.textContent = question.prompt;
    els.options.innerHTML = inputMarkup(question, state.answers[question.id]);
    els.previous.disabled = state.current === 0; els.next.disabled = state.current === visible.length - 1;
    renderQuestionList(); renderScores();
  }
  function scoreAnswers() {
    const result = Object.fromEntries(categories(state.rules).map((category) => [category, { points: 0, available: 0, percent: 0 }]));
    state.rules.forEach((rule) => {
      if (!result[rule.category]) return;
      if (rule.weight > 0) result[rule.category].available += rule.weight;
      const selected = new Set(answerValues(state.answers[rule.questionId]).map(normalized));
      if (selected.has(normalized(rule.answer))) result[rule.category].points += rule.weight;
    });
    Object.values(result).forEach((item) => { item.points = Math.round(item.points * 100) / 100; item.available = Math.round(item.available * 100) / 100; item.percent = Math.round(Math.max(0, Math.min(100, item.points / Math.max(item.available, 1) * 100)) * 10) / 10; });
    return result;
  }
  function renderScores() {
    const scores = scoreAnswers();
    const rankedScores = Object.entries(scores).sort(([categoryA, scoreA], [categoryB, scoreB]) =>
      scoreB.percent - scoreA.percent || scoreB.points - scoreA.points || categoryA.localeCompare(categoryB, undefined, { sensitivity: "base" })
    );
    els.scores.innerHTML = rankedScores.map(([category, score]) => `<div class="score-row"><div class="score-label"><span>${escapeHtml(category)}</span><span><b>${score.percent.toFixed(1)}%</b><small>${score.points >= 0 ? "+" : ""}${score.points.toFixed(1)} pts</small></span></div><div class="score-track"><i class="${score.points < 0 ? "negative" : ""}" style="width:${score.percent}%"></i></div></div>`).join("");
    const visible = visibleQuestions().filter((question) => question.kind !== "text");
    els.completion.textContent = `${visible.filter(isAnswered).length} of ${visible.length} answered`;
  }
  function setAnswerFromControl(target) {
    const question = currentQuestion();
    if (question.kind === "multi") {
      const inputs = [...els.options.querySelectorAll('input[type="checkbox"]')];
      if (normalized(target.value) === "none of the above" && target.checked) inputs.forEach((input) => { if (input !== target) input.checked = false; });
      else if (target.checked) inputs.forEach((input) => { if (normalized(input.value) === "none of the above") input.checked = false; });
      state.answers[question.id] = inputs.filter((input) => input.checked).map((input) => input.value);
    }
    else state.answers[question.id] = target.value;
    if (!isAnswered(question)) delete state.answers[question.id];
    questions.filter((item) => item.showWhen && !conditionMet(item)).forEach((item) => delete state.answers[item.id]);
    renderQuestion();
  }
  function resetQuestionnaire() { state.answers = {}; state.casePatient = null; state.caseWarnings = null; $("case-summary").textContent = ""; state.current = 0; els.patientId.value = ""; els.birthYear.value = ""; els.notes.value = ""; els.visitDate.value = new Date().toISOString().slice(0, 10); renderQuestion(); }
  function downloadJson(value, filename) { const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 0); }
  function saveSession() {
    const patientId = clean(els.patientId.value); if (!patientId) return showToast("Enter an anonymous patient ID before saving.", true);
    const now = new Date(), stamp = now.toISOString().replace(/[-:]/g, "").slice(0, 15), safeId = patientId.replace(/[^a-z0-9_-]/gi, "_");
    downloadJson({ patient: { ...state.casePatient, anonymous_id: patientId, visit_date: els.visitDate.value, birth_year: els.birthYear.value ? Number(els.birthYear.value) : "", notes: clean(els.notes.value) }, import_warnings: state.caseWarnings || {}, answers: clone(state.answers), scores: scoreAnswers(), saved_at: now.toISOString().slice(0, 19) }, `${safeId}_${stamp}.json`);
    showToast("Session saved.");
  }
  async function loadSession(file) {
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("File is too large (maximum 2 MB).");
      const payload = JSON.parse(await file.text());
      if (!payload || !payload.answers || typeof payload.answers !== "object" || Array.isArray(payload.answers)) throw new Error("Choose a patient or session JSON file containing answers.");
      if (payload.format && (payload.format !== "nebula-patient-case" || payload.version !== 1)) throw new Error("Unsupported patient file format.");
      const answers = {}; let skipped = 0;
      for (const [id, value] of Object.entries(payload.answers)) {
        const q = questions.find((item) => item.id === id);
        if (!q || q.kind === "text") { skipped++; continue; }
        if (q.kind === "single" || q.kind === "multi") {
          const values = Array.isArray(value) ? value : [value];
          if (values.some((v) => typeof v !== "string" || !q.options.includes(v)) || (q.kind === "single" && values.length !== 1) || (values.length > 1 && values.some((v) => normalized(v) === "none of the above"))) { skipped++; continue; }
          answers[id] = q.kind === "multi" ? [...new Set(values)] : values[0];
        } else if (q.kind === "numeric" && value !== "" && ["number", "string"].includes(typeof value) && Number.isFinite(Number(value)) && Number(value) >= 0) answers[id] = value;
        else if (q.kind === "date" && typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) answers[id] = value;
        else skipped++;
      }
      if (!Object.keys(answers).length && Object.keys(payload.answers).length) throw new Error("No answers match the current questionnaire.");
      if (Object.keys(state.answers).length && !confirm("Replace the current questionnaire with this local file?")) return;
      resetQuestionnaire();
      const patient = payload.patient && typeof payload.patient === "object" ? payload.patient : {};
      const field = (key) => typeof patient[key] === "string" ? patient[key].slice(0, 200) : "";
      state.casePatient = { age: Number.isInteger(patient.age) && patient.age >= 0 && patient.age <= 120 ? patient.age : null, sex: field("sex"), recorded_label: field("recorded_label") };
      state.caseWarnings = payload.import_warnings && typeof payload.import_warnings === "object" ? Object.fromEntries(Object.entries(payload.import_warnings).filter(([k,v]) => /^[a-z_]+$/.test(k) && Number.isInteger(v) && v >= 0)) : {};
      els.patientId.value = field("anonymous_id"); els.visitDate.value = field("visit_date"); els.birthYear.value = Number.isInteger(patient.birth_year) ? patient.birth_year : ""; els.notes.value = field("notes");
      state.answers = answers;
      questions.filter((q) => !conditionMet(q)).forEach((q) => { if (Object.hasOwn(state.answers, q.id)) { delete state.answers[q.id]; skipped++; } });
      const omissions = Object.values(state.caseWarnings).reduce((a,b) => a+b, 0) + skipped;
      $("case-summary").textContent = `${els.patientId.value || "Local session"} · Age: ${state.casePatient.age ?? "unknown"} · Sex: ${state.casePatient.sex || "unknown"} · Recorded label: ${state.casePatient.recorded_label || "not supplied"}. Other diagnoses are not recorded. ${omissions ? `${omissions} source/import entries omitted or flagged; scores may reflect incomplete answers.` : ""} Scores use your currently applied configuration.`;
      renderQuestion(); showToast("Local file loaded. Nothing was uploaded.");
    }
    catch (error) { showToast(error instanceof SyntaxError ? "Invalid JSON. Choose a patient or session JSON file." : error.message, true); }
    els.sessionFile.value = "";
  }

  function refreshCategoryControls(preferred) {
    const values = categories(), chosen = values.includes(preferred) ? preferred : values[0] || "";
    els.category.innerHTML = values.map((value) => `<option ${value === chosen ? "selected" : ""}>${escapeHtml(value)}</option>`).join("");
    els.categoryFilter.innerHTML = values.map((value) => `<option ${value === chosen ? "selected" : ""}>${escapeHtml(value)}</option>`).join("");
  }
  function populateQuestionSelect() { els.question.innerHTML = questions.map((question) => `<option value="${escapeHtml(question.id)}">${escapeHtml(question.id)} | ${escapeHtml(question.prompt)}</option>`).join(""); populateAnswers(); }
  function populateAnswers(preferred = "") {
    const question = questions.find((item) => item.id === els.question.value), values = question?.options || [];
    if (!values.length) {
      els.answer.innerHTML = '<option value="">No configurable answers</option>';
      els.answer.disabled = true;
      return;
    }
    const selected = values.includes(preferred) ? preferred : "";
    els.answer.disabled = false;
    els.answer.innerHTML = `<option value="" ${selected ? "" : "selected"} disabled>Select an answer</option>${values.map((answer) => `<option value="${escapeHtml(answer)}" ${answer === selected ? "selected" : ""}>${escapeHtml(answer)}</option>`).join("")}`;
  }
  function filteredRules() {
    const category = els.categoryFilter.value, query = clean(els.search.value).toLocaleLowerCase();
    return state.draftRules.map((rule, index) => ({ rule, index })).filter(({ rule }) => rule.category === category && (!query || `${rule.category} ${rule.questionId} ${questions.find((q) => q.id === rule.questionId)?.prompt || "Unknown question"} ${rule.answer}`.toLocaleLowerCase().includes(query)));
  }
  function renderRuleTable() {
    const rows = filteredRules();
    if (!rows.some(({ index }) => index === state.selectedRule)) state.selectedRule = null;
    els.tableBody.innerHTML = rows.map(({ rule, index }) => `<tr data-index="${index}" class="${index === state.selectedRule ? "selected" : ""}"><td>${escapeHtml(rule.category)}</td><td>${escapeHtml(rule.questionId)}</td><td>${escapeHtml(questions.find((q) => q.id === rule.questionId)?.prompt || "Unknown question")}</td><td>${escapeHtml(rule.answer)}</td><td class="weight ${rule.weight < 0 ? "negative" : "positive"}">${rule.weight >= 0 ? "+" : ""}${Number(rule.weight).toFixed(3)}</td></tr>`).join("");
    els.deleteRule.disabled = state.selectedRule === null;
  }
  function syncCategory(category) { if ([...els.category.options].some((option) => option.value === category)) els.category.value = category; if ([...els.categoryFilter.options].some((option) => option.value === category)) els.categoryFilter.value = category; renderRuleTable(); }
  function clearEditor() { state.editingRule = null; els.addUpdate.textContent = "Add rule"; els.weight.value = "10"; populateAnswers(); }
  function editRule(index) { const rule = state.draftRules[index]; if (!rule) return; state.editingRule = index; syncCategory(rule.category); els.question.value = rule.questionId; populateAnswers(rule.answer); els.weight.value = rule.weight; els.addUpdate.textContent = "Update rule"; }
  function addOrUpdateRule() {
    const rule = normalizeRule({ category: els.category.value, questionId: els.question.value, answer: els.answer.value, weight: els.weight.value, source: "Custom" });
    if (!rule || rule.weight < -1000 || rule.weight > 1000) return showToast("Choose a category, question, answer, and weight from -1000 to 1000.", true);
    if (state.editingRule === null) state.draftRules.push(rule); else state.draftRules[state.editingRule] = rule;
    refreshCategoryControls(rule.category); clearEditor(); renderRuleTable();
  }
  function saveAndApply() { state.rules = clone(state.draftRules); localStorage.setItem(RULES_KEY, JSON.stringify({ version: 1, rules: state.rules })); renderScores(); showToast("The new scoring rules are active in the questionnaire tab."); }
  function restoreDefaults() { if (!confirm("Replace the current draft with the diagnosis-sheet defaults?")) return; state.rules = clone(defaultRules); state.draftRules = clone(defaultRules); localStorage.setItem(RULES_KEY, JSON.stringify({ version: 1, rules: state.rules })); refreshCategoryControls(); clearEditor(); renderRuleTable(); renderScores(); showToast("Workbook defaults restored."); }

  let toastTimer;
  function showToast(message, error = false) { clearTimeout(toastTimer); els.toast.textContent = message; els.toast.classList.toggle("error", error); els.toast.classList.add("show"); toastTimer = setTimeout(() => els.toast.classList.remove("show"), 3200); }

  document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => { const target = tab.dataset.view; document.querySelectorAll(".tab").forEach((item) => { const active = item.dataset.view === target; item.classList.toggle("active", active); item.setAttribute("aria-selected", active); }); document.querySelectorAll(".view").forEach((view) => view.classList.remove("active")); $(`${target}-view`).classList.add("active"); }));
  els.list.addEventListener("click", (event) => { const button = event.target.closest("[data-index]"); if (button) { state.current = Number(button.dataset.index); renderQuestion(); } });
  els.options.addEventListener("change", (event) => setAnswerFromControl(event.target));
  els.options.addEventListener("input", (event) => { if (event.target.matches(".free-answer")) setAnswerFromControl(event.target); });
  els.previous.addEventListener("click", () => { state.current = Math.max(0, state.current - 1); renderQuestion(); });
  els.next.addEventListener("click", () => { state.current = Math.min(visibleQuestions().length - 1, state.current + 1); renderQuestion(); });
  els.clearAnswer.addEventListener("click", () => { delete state.answers[currentQuestion().id]; questions.filter((item) => item.showWhen && !conditionMet(item)).forEach((item) => delete state.answers[item.id]); renderQuestion(); });
  $("new-questionnaire").addEventListener("click", resetQuestionnaire); $("save-session").addEventListener("click", saveSession); $("load-session").addEventListener("click", () => els.sessionFile.click()); els.sessionFile.addEventListener("change", () => els.sessionFile.files[0] && loadSession(els.sessionFile.files[0]));
  const drop = $("patient-drop");
  drop.addEventListener("click", () => els.sessionFile.click());
  drop.addEventListener("keydown", (event) => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); els.sessionFile.click(); } });
  document.addEventListener("dragover", (event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); if (!gate.hidden) return; drop.classList.add("dragging"); } });
  document.addEventListener("dragleave", (event) => { if (!event.relatedTarget) drop.classList.remove("dragging"); });
  document.addEventListener("drop", (event) => { event.preventDefault(); drop.classList.remove("dragging"); if (!gate.hidden) return; const files = event.dataTransfer.files; if (files.length !== 1) return showToast("Drop one patient JSON file at a time.", true); document.querySelector('.tab[data-view="questionnaire"]').click(); loadSession(files[0]); });
  els.category.addEventListener("change", () => syncCategory(els.category.value)); els.categoryFilter.addEventListener("change", () => { syncCategory(els.categoryFilter.value); clearEditor(); }); els.question.addEventListener("change", () => populateAnswers()); els.search.addEventListener("input", renderRuleTable);
  els.addUpdate.addEventListener("click", addOrUpdateRule); $("clear-editor").addEventListener("click", clearEditor);
  els.tableBody.addEventListener("click", (event) => { const row = event.target.closest("tr[data-index]"); if (!row) return; state.selectedRule = Number(row.dataset.index); els.tableBody.querySelectorAll("tr").forEach((item) => item.classList.toggle("selected", item === row)); els.deleteRule.disabled = false; });
  els.tableBody.addEventListener("dblclick", (event) => { const row = event.target.closest("tr[data-index]"); if (row) editRule(Number(row.dataset.index)); });
  els.deleteRule.addEventListener("click", () => { if (state.selectedRule === null) return; state.draftRules.splice(state.selectedRule, 1); state.selectedRule = null; refreshCategoryControls(els.categoryFilter.value); clearEditor(); renderRuleTable(); });
  $("save-apply").addEventListener("click", saveAndApply); $("restore-defaults").addEventListener("click", restoreDefaults);

  els.visitDate.value = new Date().toISOString().slice(0, 10); refreshCategoryControls(); populateQuestionSelect(); renderRuleTable(); renderQuestion();
})();
