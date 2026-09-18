(() => {
  "use strict";

  const data = window.NEBULA_DATA;
  if (!data) throw new Error("Questionnaire data did not load.");

  const ACCESS_HASH = "0f7a4f8120712df5464758e375faf9829818369c774fcedb64ed7bd3b62f5ea1";
  const accessGate = document.getElementById("access-gate");
  const accessForm = document.getElementById("access-form");
  const accessCode = document.getElementById("access-code");
  const accessError = document.getElementById("access-error");

  async function sha256(value) {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function unlockApplication() {
    sessionStorage.setItem("nebula-access", "granted");
    document.body.classList.remove("auth-locked");
    accessGate.hidden = true;
  }

  if (sessionStorage.getItem("nebula-access") === "granted") unlockApplication();

  accessForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    accessError.textContent = "";
    if (await sha256(accessCode.value) === ACCESS_HASH) {
      accessCode.value = "";
      unlockApplication();
    } else {
      accessError.textContent = "Incorrect access code.";
      accessCode.select();
    }
  });

  const STORAGE_KEY = "nebula-expert-weights-v1";
  const state = {
    currentQuestion: 0,
    answers: {},
    draftRules: structuredClone(data.rules),
    activeRules: loadSavedRules(),
    categoryFilter: "All classes",
    ruleSearch: "",
  };

  const byId = (id) => document.getElementById(id);
  const els = {
    questionList: byId("question-list"),
    questionCount: byId("question-count"),
    questionMeta: byId("question-meta"),
    questionPrompt: byId("question-prompt"),
    answerOptions: byId("answer-options"),
    previous: byId("previous-question"),
    next: byId("next-question"),
    clear: byId("clear-answers"),
    scores: byId("score-list"),
    answeredCount: byId("answered-count"),
    configSummary: byId("configuration-summary"),
    categoryFilter: byId("category-filter"),
    ruleSearch: byId("rule-search"),
    configList: byId("configuration-list"),
    restore: byId("restore-defaults"),
    export: byId("export-configuration"),
    update: byId("update-model"),
    toast: byId("toast"),
  };

  function loadSavedRules() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved?.rules || saved.version !== data.version) return structuredClone(data.rules);
      const savedWeights = new Map(saved.rules.map((rule) => [ruleKey(rule), Number(rule.weight)]));
      return data.rules.map((rule) => ({
        ...rule,
        weight: rule.editable && savedWeights.has(ruleKey(rule)) ? savedWeights.get(ruleKey(rule)) : rule.weight,
      }));
    } catch {
      return structuredClone(data.rules);
    }
  }

  function ruleKey(rule) {
    return `${rule.category}::${rule.questionId}::${rule.answer}`;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function shortPrompt(prompt) {
    return prompt.length > 68 ? `${prompt.slice(0, 65)}…` : prompt;
  }

  function isAnswered(question) {
    const value = state.answers[question.id];
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  }

  function renderQuestionNavigation() {
    els.questionCount.textContent = `${data.questions.length} questions`;
    els.questionList.innerHTML = data.questions.map((question, index) => `
      <button class="question-link ${index === state.currentQuestion ? "active" : ""} ${isAnswered(question) ? "answered" : ""}" data-question-index="${index}">
        <span class="question-number">${index + 1}</span>
        <span class="question-title">${escapeHtml(shortPrompt(question.prompt))}</span>
      </button>
    `).join("");
  }

  function renderCurrentQuestion() {
    const question = data.questions[state.currentQuestion];
    const inputType = question.kind === "multi" ? "checkbox" : "radio";
    const current = state.answers[question.id];
    els.questionMeta.textContent = `Question ${state.currentQuestion + 1} of ${data.questions.length} · ${question.kind === "multi" ? "Select all that apply" : "Select one answer"}`;
    els.questionPrompt.textContent = question.prompt;
    els.answerOptions.innerHTML = question.options.map((option) => {
      const checked = question.kind === "multi" ? (current || []).includes(option) : current === option;
      return `
        <label class="answer-option">
          <input type="${inputType}" name="question-${escapeHtml(question.id)}" value="${escapeHtml(option)}" ${checked ? "checked" : ""} />
          <span>${escapeHtml(option)}</span>
        </label>
      `;
    }).join("");
    els.previous.disabled = state.currentQuestion === 0;
    els.next.disabled = state.currentQuestion === data.questions.length - 1;
    renderQuestionNavigation();
    renderScores();
  }

  function scoreAnswers() {
    const totals = Object.fromEntries(data.categories.map((category) => [category, { points: 0, available: 0 }]));
    state.activeRules.forEach((rule) => {
      totals[rule.category].available += Number(rule.weight);
      const answer = state.answers[rule.questionId];
      const selected = Array.isArray(answer) ? answer.includes(rule.answer) : answer === rule.answer;
      if (selected) totals[rule.category].points += Number(rule.weight);
    });
    return data.categories.map((category) => {
      const item = totals[category];
      const percent = item.available > 0 ? Math.max(0, Math.min(100, item.points / item.available * 100)) : 0;
      return { category, points: item.points, available: item.available, percent };
    }).sort((a, b) => b.percent - a.percent || a.category.localeCompare(b.category));
  }

  function renderScores() {
    const answered = data.questions.filter(isAnswered).length;
    els.answeredCount.textContent = `${answered}/${data.questions.length} answered`;
    els.scores.innerHTML = scoreAnswers().map((score) => `
      <div class="score-row">
        <div class="score-label"><span>${escapeHtml(score.category)}</span><strong>${score.percent.toFixed(1)}%</strong></div>
        <div class="score-track" aria-label="${escapeHtml(score.category)} ${score.percent.toFixed(1)} percent"><div class="score-fill" style="width:${score.percent}%"></div></div>
      </div>
    `).join("");
  }

  function renderConfiguration() {
    const editable = data.rules.filter((rule) => rule.editable).length;
    els.configSummary.innerHTML = [
      [data.categories.length, "Diagnostic classes"],
      [data.questions.length, "Restricted questions"],
      [editable, "Configurable single-choice weights"],
    ].map(([value, label]) => `<div class="summary-card"><strong>${value}</strong><span>${label}</span></div>`).join("");

    if (!els.categoryFilter.options.length) {
      els.categoryFilter.innerHTML = ["All classes", ...data.categories].map((category) => `<option>${escapeHtml(category)}</option>`).join("");
    }

    const query = state.ruleSearch.trim().toLowerCase();
    const filteredRules = state.draftRules.filter((rule) => {
      const question = data.questions.find((item) => item.id === rule.questionId);
      const classMatch = state.categoryFilter === "All classes" || rule.category === state.categoryFilter;
      const textMatch = !query || `${rule.category} ${question?.prompt || ""} ${rule.answer}`.toLowerCase().includes(query);
      return rule.editable && classMatch && textMatch;
    });

    const grouped = new Map();
    filteredRules.forEach((rule) => {
      const key = `${rule.questionId}::${data.questions.find((item) => item.id === rule.questionId)?.prompt || ""}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(rule);
    });

    els.configList.innerHTML = grouped.size ? [...grouped.entries()].map(([key, rules]) => {
      const [questionId, prompt] = key.split("::");
      return `
        <section class="rule-group">
          <div class="rule-group-header">
            <strong>Question ${escapeHtml(questionId)}</strong>
            <span>${escapeHtml(prompt)}</span>
            <span class="rule-badge">Editable</span>
          </div>
          ${rules.map((rule) => `
            <div class="rule-row">
              <span class="rule-category">${escapeHtml(rule.category)}</span>
              <span class="rule-answer">${escapeHtml(rule.answer)}</span>
              <label class="weight-control">
                <input type="number" min="0" max="100" step="0.1" value="${Number(rule.weight).toFixed(3)}" data-rule-key="${escapeHtml(ruleKey(rule))}" ${rule.editable ? "" : "disabled"} aria-label="Weight for ${escapeHtml(rule.category)}: ${escapeHtml(rule.answer)}" />
                <span>points</span>
              </label>
            </div>
          `).join("")}
        </section>
      `;
    }).join("") : `<div class="empty-state">No weighted answers match this filter.</div>`;
  }

  function updateDraftWeight(key, value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) return false;
    const rule = state.draftRules.find((item) => ruleKey(item) === key);
    if (!rule?.editable) return false;
    rule.weight = Math.round(numeric * 1000) / 1000;
    return true;
  }

  function updateScoringModel() {
    state.activeRules = structuredClone(state.draftRules);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: data.version,
      updatedAt: new Date().toISOString(),
      rules: state.activeRules.map(({ category, questionId, answer, weight, editable }) => ({ category, questionId, answer, weight, editable })),
    }));
    renderScores();
    showToast("Expert weights applied to the scoring model.");
    return { updatedRules: state.activeRules.filter((rule) => rule.editable).length };
  }

  function restoreDefaults() {
    state.draftRules = structuredClone(data.rules);
    renderConfiguration();
    showToast("Default workbook weights restored in the editor.");
  }

  function exportConfiguration() {
    const payload = {
      version: data.version,
      exportedAt: new Date().toISOString(),
      sourceWorkbook: data.sourceWorkbook,
      policy: data.policy,
      rules: state.draftRules,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "nebula-expert-weight-configuration.json";
    anchor.click();
    URL.revokeObjectURL(url);
    showToast("Configuration exported.");
  }

  let toastTimer;
  function showToast(message) {
    clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add("show");
    toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2400);
  }

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((item) => {
        const active = item === tab;
        item.classList.toggle("active", active);
        item.setAttribute("aria-selected", String(active));
      });
      document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
      byId(`${tab.dataset.view}-view`).classList.add("active");
      if (tab.dataset.view === "configuration") renderConfiguration();
    });
  });

  els.questionList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-question-index]");
    if (!button) return;
    state.currentQuestion = Number(button.dataset.questionIndex);
    renderCurrentQuestion();
  });

  els.answerOptions.addEventListener("change", (event) => {
    const question = data.questions[state.currentQuestion];
    if (question.kind === "multi") {
      state.answers[question.id] = [...els.answerOptions.querySelectorAll("input:checked")].map((input) => input.value);
    } else {
      state.answers[question.id] = event.target.value;
    }
    renderQuestionNavigation();
    renderScores();
  });

  els.previous.addEventListener("click", () => { state.currentQuestion -= 1; renderCurrentQuestion(); });
  els.next.addEventListener("click", () => { state.currentQuestion += 1; renderCurrentQuestion(); });
  els.clear.addEventListener("click", () => { state.answers = {}; renderCurrentQuestion(); showToast("Questionnaire answers cleared."); });
  els.categoryFilter.addEventListener("change", (event) => { state.categoryFilter = event.target.value; renderConfiguration(); });
  els.ruleSearch.addEventListener("input", (event) => { state.ruleSearch = event.target.value; renderConfiguration(); els.ruleSearch.focus(); els.ruleSearch.setSelectionRange(state.ruleSearch.length, state.ruleSearch.length); });
  els.configList.addEventListener("input", (event) => {
    const input = event.target.closest("[data-rule-key]");
    if (!input) return;
    if (!updateDraftWeight(input.dataset.ruleKey, input.value)) {
      showToast("Weights must be between 0 and 100.");
      renderConfiguration();
    }
  });
  els.restore.addEventListener("click", restoreDefaults);
  els.export.addEventListener("click", exportConfiguration);
  els.update.addEventListener("click", updateScoringModel);

  function registerWebMcpTools() {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const register = (tool) => Promise.resolve(context.registerTool(tool)).catch(() => {});
    register({
      name: "read_nebula_scores",
      title: "Read questionnaire scores",
      description: "Read the currently displayed category support scores from the questionnaire.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: () => ({ answeredQuestions: data.questions.filter(isAnswered).length, scores: scoreAnswers() }),
    });
    register({
      name: "stage_nebula_weights",
      title: "Stage expert weights",
      description: "Stage one or more editable expert weights without applying them to questionnaire scoring.",
      inputSchema: {
        type: "object",
        properties: {
          weights: {
            type: "array",
            items: {
              type: "object",
              properties: { category: { type: "string" }, questionId: { type: "string" }, answer: { type: "string" }, weight: { type: "number", minimum: 0, maximum: 100 } },
              required: ["category", "questionId", "answer", "weight"],
              additionalProperties: false,
            },
          },
        },
        required: ["weights"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: ({ weights }) => {
        const failures = [];
        weights.forEach((item) => {
          if (!updateDraftWeight(ruleKey(item), item.weight)) failures.push(item);
        });
        renderConfiguration();
        if (failures.length) throw new Error(`${failures.length} weight entries were invalid or not editable.`);
        return { staged: weights.length };
      },
    });
    register({
      name: "apply_nebula_weights",
      title: "Apply expert weights",
      description: "Apply the currently staged expert weights to the questionnaire scoring model and save them in this browser.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: updateScoringModel,
    });
  }

  renderCurrentQuestion();
  renderConfiguration();
  registerWebMcpTools();
})();
