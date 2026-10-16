(() => {
  "use strict";
  const defaults = window.NEBULA_DATA;
  if (!defaults) throw new Error("Questionnaire data did not load.");
  const ACCESS_HASH = "36264baea14a8f35983ace970d1a3cea763954021ed1222546df2463a37f5899";
  const ACCESS_SESSION_KEY = "nebula-access-20261014-temp";
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
  const state = { current: 0, answers: {}, rules: clone(defaultRules), draftRules: [], selectedRule: null, editingRule: null };
  state.draftRules = clone(state.rules);

  const gate = $("access-gate"), accessForm = $("access-form"), accessCode = $("access-code"), accessError = $("access-error");
  async function sha256(value) { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
  function unlock() { sessionStorage.setItem(ACCESS_SESSION_KEY, "granted"); document.body.classList.remove("auth-locked"); gate.hidden = true; }
  if (sessionStorage.getItem(ACCESS_SESSION_KEY) === "granted") unlock();
  accessForm.addEventListener("submit", async (event) => { event.preventDefault(); accessError.textContent = ""; if (await sha256(accessCode.value) === ACCESS_HASH) { accessCode.value = ""; unlock(); } else { accessError.textContent = "Incorrect access code."; accessCode.select(); } });

  const els = {
    list: $("question-list"), meta: $("question-meta"), answerState: $("answer-state"), prompt: $("question-prompt"), options: $("answer-options"), previous: $("previous-question"), next: $("next-question"), clearAnswer: $("clear-answer"), scores: $("score-list"), patientId: $("patient-id"), visitDate: $("visit-date"), birthYear: $("birth-year"), notes: $("visit-notes"), sessionFile: $("session-file"), category: $("rule-category"), question: $("rule-question"), answer: $("rule-answer"), weight: $("rule-weight"), categoryFilter: $("category-filter"), search: $("rule-search"), tableBody: $("rule-table-body"), addUpdate: $("add-update-rule"), deleteRule: $("delete-rule"), toast: $("toast")
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
    return window.NebulaModel.score(state.rules, state.answers);
  }
  function activeRules(model='default') { return model === 'trained' ? window.NEBULA_TRAINED.rules : defaultRules; }
  function renderScores() {
    for(const model of ['default','trained']) {
    const scores = window.NebulaModel.score(activeRules(model),state.answers);
    const rankedScores = Object.entries(scores).sort(([categoryA, scoreA], [categoryB, scoreB]) =>
      scoreB.points - scoreA.points || categoryA.localeCompare(categoryB, undefined, { sensitivity: "base" })
    );
    const barScale=Math.max(100,...rankedScores.map(([,score])=>Math.abs(score.points)));
    $(model==='default'?'score-list':'trained-score-list').innerHTML = rankedScores.map(([category, score]) => `<button type="button" class="score-row score-button" data-model="${model}" data-category="${escapeHtml(category)}" aria-label="Explain ${escapeHtml(category)} ${model} score"><div class="score-label"><span class="score-class-label">${escapeHtml(category)}${state.casePatient?.recorded_labels?.includes(category) ? '<em class="recorded-badge" title="Recorded source diagnosis">✓ Recorded</em>' : ''}</span><span><b class="score-value ${score.points > 0 ? "positive" : score.points < 0 ? "negative" : "zero"}">${score.points >= 0 ? "+" : ""}${Number(score.points.toFixed(3))} pts</b></span></div><div class="score-track" aria-hidden="true"><i class="${score.points < 0 ? "negative" : "positive"}" style="width:${Math.abs(score.points)/barScale*50}%"></i></div></button>`).join("");
    }
    document.dispatchEvent(new CustomEvent('nebula:change'));
  }
  function setAnswerFromControl(target) {
    const before=JSON.stringify(state.answers);
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
    markAnswerChange(before);
    renderQuestion();
  }
  function modifiedId(id) { return /-modified$/i.test(id)?id:`${id}-modified`; }
  function markAnswerChange(before) {
    if(before===JSON.stringify(state.answers))return;
    state.modified=true;
    if(clean(els.patientId.value))els.patientId.value=modifiedId(clean(els.patientId.value));
  }
  function resetQuestionnaire() { state.answers = {}; state.modified=false; state.casePatient = null; state.caseWarnings = null; state.caseUnscored = {}; state.current = 0; els.patientId.value = ""; $("patient-age").value = ""; $("patient-age").title = ""; $("patient-sex").value = ""; renderQuestion(); document.dispatchEvent(new Event('nebula:case-reset')); }
  function downloadJson(value, filename) { const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 0); }
  function exportCase() {
    const ageInput=$("patient-age"), age=ageInput.value===''?null:Number(ageInput.value);
    if(!ageInput.checkValidity() || (age!==null && (!Number.isInteger(age)||age<0||age>120)))return showToast("Enter a whole-number age from 0 to 120, or leave it blank.",true);
    let patientId = clean(els.patientId.value) || `CASE-${Date.now()}`;
    if(state.modified)patientId=modifiedId(patientId);
    els.patientId.value=patientId;
    const now = new Date(), stamp = now.toISOString().replace(/[-:]/g, "").slice(0, 15), safeId = patientId.replace(/[^a-z0-9_-]/gi, "_");
    downloadJson({ format:"nebula-patient-case",version:1,questionnaire_revision:defaults.questionnaireRevision,patient: { anonymous_id:patientId,age,sex:$("patient-sex").value||null,recorded_labels:state.casePatient?.recorded_labels||[],age_conflict:age===null&&state.casePatient?.age_conflict===true }, import_warnings: state.caseWarnings || {}, unscored_answers:state.caseUnscored||{}, answers: clone(state.answers) }, `${safeId}_${stamp}.json`);
  }
  async function loadSession(file) {
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("File is too large (maximum 2 MB).");
      const payload = JSON.parse(await file.text());
      if (!payload || !payload.answers || typeof payload.answers !== "object" || Array.isArray(payload.answers)) throw new Error("Choose a patient or session JSON file containing answers.");
      if (payload.format && (payload.format !== "nebula-patient-case" || payload.version !== 1)) throw new Error("Unsupported patient file format.");
      const answers = {}, unscored = {}; let skipped = 0, legacyTinnitus = 0;
      for(const [id,item] of Object.entries(payload.unscored_answers||{})){
        const q=questions.find(q=>q.id===id);
        if(q&&item&&typeof item.reason==='string'&&Array.isArray(item.values))unscored[id]={reason:item.reason.slice(0,100),values:item.values.filter(v=>typeof v==='string'&&q.options?.includes(v))};
      }
      for (const [id, value] of Object.entries(payload.answers)) {
        const q = questions.find((item) => item.id === id);
        if (!q || q.kind === "text") { skipped++; continue; }
        if(id==='259416'&&![defaults.questionnaireRevision,'km2-attack-tinnitus-v1'].includes(payload.questionnaire_revision)){
          const values=(Array.isArray(value)?value:[value]).filter(v=>typeof v==='string'&&q.options.includes(v));
          unscored[id]={reason:'legacy_tinnitus_wording_requires_new_answer',values};legacyTinnitus++;skipped++;continue;
        }
        if (q.kind === "single" || q.kind === "multi") {
          const values = Array.isArray(value) ? value : [value];
          if (values.some((v) => typeof v !== "string" || !q.options.includes(v)) || (q.kind === "single" && values.length !== 1) || (values.length > 1 && values.some((v) => normalized(v) === "none of the above"))) { skipped++; continue; }
          answers[id] = q.kind === "multi" ? [...new Set(values)] : values[0];
        } else if (q.kind === "numeric" && value !== "" && ["number", "string"].includes(typeof value) && Number.isFinite(Number(value)) && Number(value) >= 0) answers[id] = value;
        else if (q.kind === "date" && typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) answers[id] = value;
        else skipped++;
      }
      if (!Object.keys(answers).length && Object.keys(payload.answers).length&&!legacyTinnitus) throw new Error("No answers match the current questionnaire.");
      resetQuestionnaire();
      // Restore duration answers quarantined by the previous single-choice importer.
      // An explicit current answer takes precedence over the historical values.
      if (!answers['259369'] && unscored['259369']?.reason === 'multiple_answers_for_single_choice' && unscored['259369'].values.length) {
        answers['259369'] = [...new Set(unscored['259369'].values)];
        delete unscored['259369'];
      }
      const patient = payload.patient && typeof payload.patient === "object" ? payload.patient : {};
      const field = (key) => typeof patient[key] === "string" ? patient[key].slice(0, 200) : "";
      const labels=Array.isArray(patient.recorded_labels)?patient.recorded_labels:[field('recorded_label')];
      state.casePatient = { age: Number.isInteger(patient.age) && patient.age >= 0 && patient.age <= 120 ? patient.age : null, sex: field("sex"), recorded_labels:[...new Set(labels.filter(v=>typeof v==='string'&&defaults.rules.some(r=>r.category===v)))],age_conflict:patient.age_conflict===true };
      state.caseWarnings = payload.import_warnings && typeof payload.import_warnings === "object" ? Object.fromEntries(Object.entries(payload.import_warnings).filter(([k,v]) => /^[a-z_]+$/.test(k) && Number.isInteger(v) && v >= 0)) : {};
      state.caseUnscored=unscored;
      if(legacyTinnitus)state.caseWarnings.legacy_tinnitus_requires_new_answer=legacyTinnitus;
      els.patientId.value = field("anonymous_id");
      $("patient-age").value = state.casePatient.age_conflict ? "" : state.casePatient.age ?? "";
      $("patient-age").title = state.casePatient.age_conflict ? "Conflicting source ages" : "";
      $("patient-sex").value = state.casePatient.sex;
      state.answers = answers;
      questions.filter((q) => !conditionMet(q)).forEach((q) => { if (Object.hasOwn(state.answers, q.id)) { delete state.answers[q.id]; skipped++; } });
      if(skipped)state.caseWarnings.browser_entries_omitted=skipped;
      renderQuestion();
    }
    catch (error) { showToast(error instanceof SyntaxError ? "Invalid JSON. Choose a patient or session JSON file." : error.message, true); }
    els.sessionFile.value = "";
  }

  let toastTimer;
  function showToast(message, error = false) { clearTimeout(toastTimer); els.toast.textContent = message; els.toast.classList.toggle("error", error); els.toast.classList.add("show"); toastTimer = setTimeout(() => els.toast.classList.remove("show"), 3200); }

  els.list.addEventListener("click", (event) => { const button = event.target.closest("[data-index]"); if (button) { state.current = Number(button.dataset.index); renderQuestion(); } });
  els.options.addEventListener("change", (event) => setAnswerFromControl(event.target));
  els.options.addEventListener("input", (event) => { if (event.target.matches(".free-answer")) setAnswerFromControl(event.target); });
  els.previous.addEventListener("click", () => { state.current = Math.max(0, state.current - 1); renderQuestion(); });
  els.next.addEventListener("click", () => { state.current = Math.min(visibleQuestions().length - 1, state.current + 1); renderQuestion(); });
  els.clearAnswer.addEventListener("click", () => { const before=JSON.stringify(state.answers); delete state.answers[currentQuestion().id]; questions.filter((item) => item.showWhen && !conditionMet(item)).forEach((item) => delete state.answers[item.id]); markAnswerChange(before); renderQuestion(); });
  $("new-questionnaire").addEventListener("click", resetQuestionnaire); $("export-json").addEventListener("click", exportCase); els.sessionFile.addEventListener("change", () => els.sessionFile.files[0] && loadSession(els.sessionFile.files[0]));
  const drop = $("patient-drop");
  drop.addEventListener("click", () => els.sessionFile.click());
  document.addEventListener("dragenter", (event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); if (gate.hidden) document.body.classList.add("file-dragging"); } });
  document.addEventListener("dragover", (event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); if (gate.hidden) document.body.classList.add("file-dragging"); } });
  document.addEventListener("dragleave", (event) => { if (!event.relatedTarget) document.body.classList.remove("file-dragging"); });
  document.addEventListener("drop", (event) => { event.preventDefault(); document.body.classList.remove("file-dragging"); if (!gate.hidden) return; const files = event.dataTransfer.files; if (files.length !== 1) return showToast("Drop one patient JSON file at a time.", true); loadSession(files[0]); });
  window.NebulaApp = {
    snapshot: (model='default') => clone({ answers:state.answers, rules:activeRules(model), configuredRules:state.rules, patient:state.casePatient, model:model==='trained'?'AI-Tuned Model':'Baseline Model' }), downloadJson
  };
  renderQuestion();
})();
