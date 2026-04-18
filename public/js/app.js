document.addEventListener('DOMContentLoaded', () => {
  let conversationHistory = [];
  let currentSolution = null;
  let currentProblemText = '';
  let currentDisplayProblem = '';
  let currentClassLevel = '';
  let currentSource = 'solver';
  let currentOcrStatusKey = 'ocrStatusIdle';
  let currentOcrResult = null;
  let currentOcrFile = null;
  let currentOcrPreviewUrl = '';

  const mathInput = document.getElementById('mathInput');
  const classLevelInput = document.getElementById('classLevel');
  const instructionInput = document.getElementById('instructionInput');
  const solveBtn = document.getElementById('solveBtn');

  const wordProblemInput = document.getElementById('wordProblemInput');
  const wordClassLevelInput = document.getElementById('wordClassLevel');
  const solveWordBtn = document.getElementById('solveWordBtn');

  const ocrImageInput = document.getElementById('ocrImageInput');
  const ocrSelectBtn = document.getElementById('ocrSelectBtn');
  const ocrExtractBtn = document.getElementById('ocrExtractBtn');
  const ocrSolveBtn = document.getElementById('ocrSolveBtn');
  const ocrUseTextBtn = document.getElementById('ocrUseTextBtn');
  const ocrClearBtn = document.getElementById('ocrClearBtn');
  const ocrPreviewImage = document.getElementById('ocrPreviewImage');
  const ocrPreviewEmpty = document.getElementById('ocrPreviewEmpty');
  const ocrTextOutput = document.getElementById('ocrTextOutput');
  const ocrStatus = document.getElementById('ocrStatus');
  const ocrMeta = document.getElementById('ocrMeta');

  const sharedSolutionArea = document.getElementById('sharedSolutionArea');
  const loadingContainer = document.getElementById('loadingContainer');
  const solutionSection = document.getElementById('solutionSection');
  const stepsContainer = document.getElementById('stepsContainer');
  const finalAnswerElement = document.getElementById('finalAnswer');
  const answerContent = document.getElementById('answerContent');
  const answerSummary = document.getElementById('answerSummary');
  const verificationBadge = document.getElementById('verificationBadge');
  const verificationDetail = document.getElementById('verificationDetail');
  const saveBtn = document.getElementById('saveBtn');

  const keyboardToggle = document.getElementById('keyboardToggle');
  const mathKeyboard = document.getElementById('mathKeyboard');
  const langToggle = document.getElementById('langToggle');
  const themeToggle = document.getElementById('themeToggle');

  const savedProblemsBtn = document.getElementById('savedProblemsBtn');
  const savedModal = document.getElementById('savedModal');
  const closeSavedModal = document.getElementById('closeSavedModal');
  const savedList = document.getElementById('savedList');

  const explainModal = document.getElementById('explainModal');
  const closeExplainModal = document.getElementById('closeExplainModal');
  const explainContent = document.getElementById('explainContent');

  const equationModeBtn = document.getElementById('equationModeBtn');
  const pointModeBtn = document.getElementById('pointModeBtn');
  const equationInput = document.getElementById('equationInput');
  const pointInput = document.getElementById('pointInput');
  const equationField = document.getElementById('equationField');
  const plotBtn = document.getElementById('plotBtn');
  const clearPointsBtn = document.getElementById('clearPointsBtn');
  const fitCurveBtn = document.getElementById('fitCurveBtn');
  const polyDegree = document.getElementById('polyDegree');
  const graphAnalysis = document.getElementById('graphAnalysis');
  const graphAnalysisContent = document.getElementById('graphAnalysisContent');
  const askAIBtn = document.getElementById('askAIBtn');
  const graphAskAI = document.getElementById('graphAskAI');
  const addPointBtn = document.getElementById('addPointBtn');
  const manualPointX = document.getElementById('manualPointX');
  const manualPointY = document.getElementById('manualPointY');

  applyTranslations();
  initTheme();
  setOcrStatus('ocrStatusIdle');
  updateOcrMeta(null);

  if (window.AnimationModule) {
    AnimationModule.init();
  }

  if (window.GraphModule && GraphModule.updatePointsList) {
    GraphModule.updatePointsList();
  }

  window.MathnoteApp = {
    getCurrentProblemText: () => currentProblemText || getActiveProblemFromInputs(),
    getCurrentLanguage: () => currentLang,
  };

  document.querySelectorAll('.tab').forEach((tabButton) => {
    tabButton.addEventListener('click', () => switchTab(tabButton.getAttribute('data-tab')));
  });

  langToggle.addEventListener('click', () => {
    toggleLanguage();
    setOcrStatus(currentOcrStatusKey, ocrStatus.dataset.tone || 'info');
    updateOcrMeta(currentOcrResult);
  });

  themeToggle.addEventListener('click', () => {
    const isLight = document.body.getAttribute('data-theme') === 'light';
    if (isLight) {
      document.body.removeAttribute('data-theme');
      localStorage.setItem('mathnote-theme', 'dark');
    } else {
      document.body.setAttribute('data-theme', 'light');
      localStorage.setItem('mathnote-theme', 'light');
    }
  });

  keyboardToggle.addEventListener('click', () => {
    const isVisible = mathKeyboard.style.display !== 'none';
    mathKeyboard.style.display = isVisible ? 'none' : 'block';
  });

  document.querySelectorAll('.key[data-cmd]').forEach((key) => {
    key.addEventListener('click', () => {
      const command = key.getAttribute('data-cmd');
      if (mathInput?.executeCommand) {
        mathInput.executeCommand(['insert', command]);
        mathInput.focus();
      }
    });
  });

  document.querySelectorAll('.key[data-insert]').forEach((key) => {
    key.addEventListener('click', () => {
      const value = key.getAttribute('data-insert');
      if (mathInput?.executeCommand) {
        mathInput.executeCommand(['insert', value]);
        mathInput.focus();
      }
    });
  });

  solveBtn.addEventListener('click', async () => {
    const latex = getMathInputValue();
    const instruction = instructionInput.value.trim();
    const fullProblem = instruction ? `${latex}\n\nInstructions: ${instruction}` : latex;
    await solveGeneric(fullProblem, classLevelInput.value.trim(), latex, 'solver');
  });

  solveWordBtn.addEventListener('click', async () => {
    const problem = wordProblemInput.value.trim();
    await solveGeneric(problem, wordClassLevelInput.value.trim(), problem, 'word');
  });

  ocrSelectBtn.addEventListener('click', () => ocrImageInput.click());

  ocrImageInput.addEventListener('change', () => {
    const file = ocrImageInput.files?.[0];
    if (!file) {
      return;
    }

    setOcrFile(file);
  });

  ocrExtractBtn.addEventListener('click', async () => {
    await runOcr(false);
  });

  ocrSolveBtn.addEventListener('click', async () => {
    await runOcr(true);
  });

  ocrUseTextBtn.addEventListener('click', () => {
    const extractedText = ocrTextOutput.value.trim();
    if (!extractedText) {
      showToast(t('errorUseOcrText'), 'error');
      return;
    }

    if (getActiveTab() === 'word') {
      wordProblemInput.value = extractedText;
      showToast(t('ocrImportedToWord'), 'success');
      return;
    }

    setMathInputValue(extractedText);
    showToast(t('ocrImportedToSolver'), 'success');
  });

  ocrClearBtn.addEventListener('click', clearOcrState);

  verificationBadge.style.cursor = 'pointer';
  verificationBadge.addEventListener('click', () => {
    const isVisible = verificationDetail.style.display !== 'none';
    verificationDetail.style.display = isVisible ? 'none' : 'block';
    const chevron = verificationBadge.querySelector('.badge-chevron');
    if (chevron) {
      chevron.textContent = isVisible ? 'v' : '^';
    }
  });

  saveBtn.addEventListener('click', () => {
    if (!currentSolution || !currentDisplayProblem) {
      return;
    }

    const saved = JSON.parse(localStorage.getItem('mathnote-saved') || '[]');
    saved.unshift({
      id: Date.now(),
      problem: currentDisplayProblem,
      problemText: currentProblemText,
      solution: currentSolution,
      classLevel: currentClassLevel,
      source: currentSource,
      date: new Date().toLocaleString(),
      lang: currentLang,
    });

    localStorage.setItem('mathnote-saved', JSON.stringify(saved));
    showToast(t('savedSuccess'), 'success');
  });

  savedProblemsBtn.addEventListener('click', () => {
    renderSavedList();
    savedModal.style.display = 'flex';
  });

  closeSavedModal.addEventListener('click', () => {
    savedModal.style.display = 'none';
  });

  savedModal.addEventListener('click', (event) => {
    if (event.target === savedModal) {
      savedModal.style.display = 'none';
    }
  });

  closeExplainModal.addEventListener('click', () => {
    explainModal.style.display = 'none';
  });

  explainModal.addEventListener('click', (event) => {
    if (event.target === explainModal) {
      explainModal.style.display = 'none';
    }
  });

  equationModeBtn.addEventListener('click', () => {
    equationModeBtn.classList.add('active');
    pointModeBtn.classList.remove('active');
    equationInput.style.display = 'block';
    pointInput.style.display = 'none';
    GraphModule.initGraph();
    GraphModule.disablePointMode();
  });

  pointModeBtn.addEventListener('click', () => {
    pointModeBtn.classList.add('active');
    equationModeBtn.classList.remove('active');
    equationInput.style.display = 'none';
    pointInput.style.display = 'block';
    GraphModule.initGraph();
    GraphModule.enablePointMode();
  });

  addPointBtn.addEventListener('click', () => {
    const x = parseFloat(manualPointX.value);
    const y = parseFloat(manualPointY.value);

    if (Number.isNaN(x) || Number.isNaN(y)) {
      showToast(t('errorCoordinates'), 'error');
      return;
    }

    GraphModule.addPoint(Math.round(x * 10) / 10, Math.round(y * 10) / 10);
    manualPointX.value = '';
    manualPointY.value = '';
    manualPointX.focus();
  });

  plotBtn.addEventListener('click', () => {
    const latex = equationField.value;
    if (!latex || !latex.trim()) {
      showToast(t('errorNoProblem'), 'error');
      return;
    }

    let success = GraphModule.plotLatexEquation(latex);
    if (!success) {
      success = GraphModule.plotEquation(latex);
    }

    if (!success) {
      showToast(t('errorPlotting'), 'error');
    }
  });

  clearPointsBtn.addEventListener('click', () => {
    GraphModule.clearPoints();
  });

  fitCurveBtn.addEventListener('click', () => {
    const degree = parseInt(polyDegree.value, 10);
    const equation = GraphModule.fitCurve(degree);
    if (equation) {
      showToast(equation, 'success');
    }
  });

  askAIBtn.addEventListener('click', async () => {
    const question = graphAskAI.value.trim();
    if (!question) {
      showToast(t('errorAIQuestion'), 'error');
      return;
    }

    const points = GraphModule.getPoints();
    const expressions = GraphModule.getExpressions();

    graphAnalysis.style.display = 'block';
    graphAnalysisContent.innerHTML = loadingMarkup();

    let graphContext = '';
    if (expressions.length > 0) {
      graphContext += `Equations on graph: ${expressions.join(', ')}\n`;
    }
    if (points.length > 0) {
      graphContext += `Points on graph: ${points.map((point) => `(${point.x}, ${point.y})`).join(', ')}\n`;
    }

    const degree = parseInt(polyDegree.value, 10);
    if (points.length >= degree + 1) {
      const fittedEquation = GraphModule.fitCurve(degree);
      if (fittedEquation) {
        graphContext += `Fitted polynomial (degree ${degree}): y = ${fittedEquation}\n`;
      }
    }

    try {
      const response = await fetch('/mathnote/api/graph-solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          equation: expressions.length > 0 ? expressions.join('; ') : undefined,
          points: points.length > 0 ? points : undefined,
          degree,
          question,
          graphContext,
          lang: currentLang,
          classLevel: getActiveClassLevel(),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw buildResponseError(response.status, data);
      }

      renderGraphAnalysis(data.graphAnalysis);
    } catch (error) {
      console.error('Graph AI error:', error);
      graphAnalysisContent.innerHTML = `<p style="color: var(--error);">${resolveApiErrorMessage(error)}</p>`;
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      savedModal.style.display = 'none';
      explainModal.style.display = 'none';
    }

    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      if (getActiveTab() === 'word') {
        solveWordBtn.click();
      } else {
        solveBtn.click();
      }
    }
  });

  function initTheme() {
    const savedTheme = localStorage.getItem('mathnote-theme');
    if (savedTheme === 'light') {
      document.body.setAttribute('data-theme', 'light');
    }
  }

  function getActiveTab() {
    return document.querySelector('.tab.active')?.getAttribute('data-tab') || 'solver';
  }

  function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach((tab) => {
      tab.classList.toggle('active', tab.getAttribute('data-tab') === tabName);
    });

    document.querySelectorAll('.tab-content').forEach((content) => {
      content.classList.toggle('active', content.id === `${tabName}Tab`);
    });

    if (tabName === 'graph') {
      sharedSolutionArea.style.display = 'none';
      GraphModule.initGraph();
      return;
    }

    sharedSolutionArea.style.display = 'block';
  }

  function getMathInputValue() {
    if (typeof mathInput?.getValue === 'function') {
      return mathInput.getValue();
    }

    return mathInput?.value || '';
  }

  function setMathInputValue(value) {
    if (typeof mathInput?.setValue === 'function') {
      mathInput.setValue(value);
      return;
    }

    if (mathInput) {
      mathInput.value = value;
    }
  }

  function getActiveClassLevel() {
    return getActiveTab() === 'word' ? wordClassLevelInput.value.trim() : classLevelInput.value.trim();
  }

  function getActiveProblemFromInputs() {
    return getActiveTab() === 'word' ? wordProblemInput.value.trim() : getMathInputValue().trim();
  }

  function setOcrFile(file) {
    currentOcrFile = file;
    currentOcrResult = null;
    ocrTextOutput.value = '';
    updateOcrMeta(null);
    setOcrStatus('ocrStatusSelected', 'info');

    if (currentOcrPreviewUrl) {
      URL.revokeObjectURL(currentOcrPreviewUrl);
    }

    currentOcrPreviewUrl = URL.createObjectURL(file);
    ocrPreviewImage.src = currentOcrPreviewUrl;
    ocrPreviewImage.style.display = 'block';
    ocrPreviewEmpty.style.display = 'none';
  }

  function clearOcrState() {
    currentOcrFile = null;
    currentOcrResult = null;
    ocrImageInput.value = '';
    ocrTextOutput.value = '';
    updateOcrMeta(null);
    setOcrStatus('ocrStatusCleared', 'info');

    if (currentOcrPreviewUrl) {
      URL.revokeObjectURL(currentOcrPreviewUrl);
      currentOcrPreviewUrl = '';
    }

    ocrPreviewImage.removeAttribute('src');
    ocrPreviewImage.style.display = 'none';
    ocrPreviewEmpty.style.display = 'block';
  }

  function setOcrStatus(key, tone = 'info') {
    currentOcrStatusKey = key;
    ocrStatus.dataset.tone = tone;
    ocrStatus.textContent = t(key);
  }

  function updateOcrMeta(result) {
    currentOcrResult = result || null;

    if (!result) {
      ocrMeta.innerHTML = '';
      return;
    }

    const items = [];
    if (typeof result.confidence === 'number') {
      items.push(`${t('ocrConfidence')}: ${result.confidence}%`);
    }
    if (result.language) {
      items.push(`Lang: ${escapeHtml(result.language)}`);
    }
    if (Array.isArray(result.lines) && result.lines.length > 0) {
      items.push(`Lines: ${result.lines.length}`);
    }

    ocrMeta.innerHTML = items.map((item) => `<span class="ocr-chip">${item}</span>`).join('');
  }

  async function runOcr(autoSolve) {
    if (!currentOcrFile) {
      showToast(t('errorNoImage'), 'error');
      return;
    }

    setOcrStatus('ocrStatusRunning', 'info');
    toggleOcrButtons(true);

    if (autoSolve) {
      showLoading(true);
      showSolution(false);
    }

    try {
      const formData = new FormData();
      formData.append('image', currentOcrFile);
      formData.append('lang', currentLang);
      formData.append('classLevel', getActiveClassLevel());
      formData.append('autoSolve', String(autoSolve));
      formData.append('history', JSON.stringify(conversationHistory));

      const response = await fetch('/mathnote/api/ocr', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw buildResponseError(response.status, data);
      }

      if (!data.ocr?.text) {
        throw new Error(t('errorEmptyOcr'));
      }

      ocrTextOutput.value = data.ocr.text;
      updateOcrMeta(data.ocr);

      if (!autoSolve) {
        setOcrStatus('ocrStatusSuccess', 'success');
        return;
      }

      currentProblemText = data.ocr.text;
      currentDisplayProblem = data.ocr.text;
      currentClassLevel = getActiveClassLevel();
      currentSource = 'ocr';
      currentSolution = data.solution;
      conversationHistory = [
        { role: 'user', content: `Solve: ${data.ocr.text}` },
        { role: 'assistant', content: data.rawResponse },
      ];

      renderSolution(data.solution);
      afterSolveSuccess(data.ocr.text, data.solution);
      setOcrStatus('ocrStatusSolved', 'success');
    } catch (error) {
      console.error('OCR error:', error);
      if (autoSolve) {
        showLoading(false);
        showSolution(false);
      }
      showToast(resolveApiErrorMessage(error), 'error');
      setOcrStatus('errorOcr', 'error');
    } finally {
      toggleOcrButtons(false);
    }
  }

  function toggleOcrButtons(isBusy) {
    [ocrSelectBtn, ocrExtractBtn, ocrSolveBtn, ocrUseTextBtn, ocrClearBtn].forEach((button) => {
      button.disabled = isBusy;
    });
  }

  async function solveGeneric(problemText, level, rawDisplayProblem, source) {
    if (!problemText || !problemText.trim()) {
      showToast(t('errorNoProblem'), 'error');
      return;
    }

    currentProblemText = problemText;
    currentDisplayProblem = rawDisplayProblem || problemText;
    currentClassLevel = level || '';
    currentSource = source;
    conversationHistory = [];

    showLoading(true);
    showSolution(false);

    try {
      const response = await fetch('/mathnote/api/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problem: problemText,
          classLevel: level,
          lang: currentLang,
          history: conversationHistory,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw buildResponseError(response.status, data);
      }

      currentSolution = data.solution;
      conversationHistory.push(
        { role: 'user', content: `Solve: ${problemText}` },
        { role: 'assistant', content: data.rawResponse }
      );

      renderSolution(data.solution);
      afterSolveSuccess(problemText, data.solution);
    } catch (error) {
      console.error('Solve error:', error);
      showLoading(false);
      showSolution(false);
      showToast(resolveApiErrorMessage(error), 'error');
    }
  }

  function afterSolveSuccess(problemText, solution) {
    if (solution.steps?.length > 0) {
      showAnimationButton(solution);
      generateAnimationsInBackground(problemText, solution);
    } else {
      hideAnimationButton();
    }

    showLoading(false);
    showSolution(true);
    verifySolution(problemText, solution);
  }

  async function verifySolution(problem, solution) {
    verificationBadge.style.display = 'inline-flex';
    verificationBadge.className = 'verification-badge';
    verificationBadge.querySelector('.badge-icon').textContent = '';
    verificationBadge.querySelector('.badge-text').textContent = t('verifying');

    if (!verificationBadge.querySelector('.badge-chevron')) {
      const chevron = document.createElement('span');
      chevron.className = 'badge-chevron';
      chevron.textContent = 'v';
      verificationBadge.appendChild(chevron);
    }

    verificationDetail.style.display = 'none';
    verificationDetail.innerHTML = '';

    try {
      const response = await fetch('/mathnote/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problem, solution, lang: currentLang }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw buildResponseError(response.status, data);
      }

      const verification = data.verification;
      const badgeIcon = verificationBadge.querySelector('.badge-icon');
      const badgeText = verificationBadge.querySelector('.badge-text');

      if (verification.isCorrect) {
        verificationBadge.classList.add('verified');
        badgeIcon.textContent = 'OK';
        badgeText.textContent = t('verified');
      } else if (verification.confidence === 'low') {
        verificationBadge.classList.add('unverified');
        badgeIcon.textContent = '!';
        badgeText.textContent = t('unverified');
      } else {
        verificationBadge.classList.add('incorrect');
        badgeIcon.textContent = 'X';
        badgeText.textContent = t('incorrect');
      }

      let detailHtml = '';
      if (verification.explanation) {
        detailHtml += `<p class="verify-explanation">${sanitizeLatex(verification.explanation)}</p>`;
      }

      if (Array.isArray(verification.issues) && verification.issues.length > 0) {
        detailHtml += '<ul class="verify-issues">';
        verification.issues.forEach((issue) => {
          detailHtml += `<li>${sanitizeLatex(issue)}</li>`;
        });
        detailHtml += '</ul>';
      }

      if (!verification.isCorrect && verification.correctedAnswer) {
        detailHtml += `
          <div class="verify-corrected">
            <span class="verify-corrected-label">${currentLang === 'vi' ? 'Dap an dung' : 'Correct Answer'}:</span>
            <span class="verify-corrected-math">\\(${verification.correctedAnswer}\\)</span>
          </div>
        `;
      }

      if (detailHtml) {
        verificationDetail.innerHTML = `
          <div class="verify-detail-inner ${verification.isCorrect ? 'verified' : verification.confidence === 'low' ? 'unverified' : 'incorrect'}">
            ${detailHtml}
          </div>
        `;
        renderMath(verificationDetail);
      }
    } catch (error) {
      console.error('Verify error:', error);
      verificationBadge.style.display = 'none';
    }
  }

  function renderSolution(solution) {
    stepsContainer.innerHTML = '';

    if (!solution || !Array.isArray(solution.steps)) {
      finalAnswerElement.style.display = 'none';
      return;
    }

    solution.steps.forEach((step, index) => {
      const card = document.createElement('div');
      card.className = 'step-card';
      card.style.animationDelay = `${index * 0.12}s`;

      const header = document.createElement('div');
      header.className = 'step-header';
      header.innerHTML = `
        <span class="step-number">${index + 1}</span>
        <span class="step-title">${escapeHtml(step.title || `Step ${index + 1}`)}</span>
      `;
      card.appendChild(header);

      if (step.explanation) {
        const explanation = document.createElement('p');
        explanation.className = 'step-explanation';
        explanation.innerHTML = sanitizeLatex(step.explanation);
        card.appendChild(explanation);
        renderMath(explanation);
      }

      if (step.math) {
        const math = document.createElement('div');
        math.className = 'step-math';
        math.textContent = ensureDelimiters(step.math);
        card.appendChild(math);
        renderMath(math);
      }

      if (step.result) {
        const result = document.createElement('p');
        result.className = 'step-result';
        result.textContent = ensureDelimiters(step.result);
        card.appendChild(result);
        renderMath(result);
      }

      const actions = document.createElement('div');
      actions.className = 'step-actions';

      const explainButton = document.createElement('button');
      explainButton.className = 'explain-btn';
      explainButton.type = 'button';
      explainButton.textContent = t('explainStep');
      explainButton.addEventListener('click', () => explainStep(step, index));
      actions.appendChild(explainButton);

      card.appendChild(actions);
      stepsContainer.appendChild(card);
    });

    if (solution.finalAnswer) {
      finalAnswerElement.style.display = 'block';
      answerContent.textContent = ensureDelimiters(solution.finalAnswer);
      answerSummary.innerHTML = sanitizeLatex(solution.summary || '');
      renderMath(answerContent);
      renderMath(answerSummary);
    } else {
      finalAnswerElement.style.display = 'none';
    }
  }

  async function explainStep(step, stepIndex) {
    explainModal.style.display = 'flex';
    explainContent.innerHTML = loadingMarkup();

    try {
      const response = await fetch('/mathnote/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step,
          history: conversationHistory,
          lang: currentLang,
          classLevel: currentClassLevel || getActiveClassLevel(),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw buildResponseError(response.status, data);
      }

      const explanation = document.createElement('div');
      explanation.className = 'explanation-text';
      explanation.innerHTML = sanitizeLatex(data.explanation);
      explainContent.innerHTML = '';
      explainContent.appendChild(explanation);
      renderMath(explanation);

      conversationHistory.push(
        { role: 'user', content: `Explain step ${stepIndex + 1}: ${JSON.stringify(step)}` },
        { role: 'assistant', content: data.explanation }
      );
    } catch (error) {
      console.error('Explain error:', error);
      explainContent.innerHTML = `<p style="color: var(--error);">${resolveApiErrorMessage(error)}</p>`;
    }
  }

  function renderSavedList() {
    const saved = JSON.parse(localStorage.getItem('mathnote-saved') || '[]');

    if (saved.length === 0) {
      savedList.innerHTML = `<p class="empty-state">${t('noSavedProblems')}</p>`;
      return;
    }

    savedList.innerHTML = saved
      .map((item) => {
        const label = item.source === 'word' ? t('wordProblem') : 'Mathnote';
        return `
          <div class="saved-item" data-id="${item.id}">
            <div class="saved-item-problem">${sanitizeLatex(item.problem)}</div>
            <div class="saved-item-date">${escapeHtml(item.date)} · ${escapeHtml(item.classLevel || 'General')} · ${escapeHtml(label)}</div>
            <div class="saved-item-actions">
              <button class="btn-secondary load-saved-btn" type="button" data-id="${item.id}">${t('load')}</button>
              <button class="btn-secondary delete-saved-btn" type="button" data-id="${item.id}" style="color: var(--error);">${t('delete')}</button>
            </div>
          </div>
        `;
      })
      .join('');

    savedList.querySelectorAll('.saved-item-problem').forEach((element) => renderMath(element));

    savedList.querySelectorAll('.load-saved-btn').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const id = Number(button.getAttribute('data-id'));
        const item = saved.find((entry) => entry.id === id);
        if (!item) {
          return;
        }

        if (item.source === 'word') {
          switchTab('word');
          wordProblemInput.value = item.problem;
          wordClassLevelInput.value = item.classLevel || '';
        } else {
          switchTab('solver');
          setMathInputValue(item.problem);
          classLevelInput.value = item.classLevel || '';
        }

        currentProblemText = item.problemText || item.problem;
        currentDisplayProblem = item.problem;
        currentClassLevel = item.classLevel || '';
        currentSource = item.source || 'solver';
        currentSolution = item.solution;
        renderSolution(item.solution);
        showSolution(true);
        savedModal.style.display = 'none';
      });
    });

    savedList.querySelectorAll('.delete-saved-btn').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const id = Number(button.getAttribute('data-id'));
        const nextSaved = saved.filter((entry) => entry.id !== id);
        localStorage.setItem('mathnote-saved', JSON.stringify(nextSaved));
        renderSavedList();
        showToast(t('deletedSuccess'), 'success');
      });
    });
  }

  function renderGraphAnalysis(result) {
    graphAnalysisContent.innerHTML = '';
    const container = document.createElement('div');

    if (result?.summary) {
      const summary = document.createElement('p');
      summary.innerHTML = sanitizeLatex(result.summary);
      container.appendChild(summary);
      renderMath(summary);
    }

    if (Array.isArray(result?.steps)) {
      result.steps.forEach((step, index) => {
        const card = document.createElement('div');
        card.className = 'step-card';
        card.style.animationDelay = `${index * 0.1}s`;
        card.innerHTML = `
          <div class="step-header">
            <span class="step-number">${index + 1}</span>
            <span class="step-title">${escapeHtml(step.title || `Step ${index + 1}`)}</span>
          </div>
        `;

        if (step.explanation) {
          const explanation = document.createElement('p');
          explanation.className = 'step-explanation';
          explanation.innerHTML = sanitizeLatex(step.explanation);
          card.appendChild(explanation);
          renderMath(explanation);
        }

        if (step.math) {
          const math = document.createElement('div');
          math.className = 'step-math';
          math.textContent = ensureDelimiters(step.math);
          card.appendChild(math);
          renderMath(math);
        }

        if (step.result) {
          const resultText = document.createElement('p');
          resultText.className = 'step-result';
          resultText.textContent = ensureDelimiters(step.result);
          card.appendChild(resultText);
          renderMath(resultText);
        }

        container.appendChild(card);
      });
    }

    if (result?.finalAnswer) {
      const finalBlock = document.createElement('div');
      finalBlock.className = 'step-math';
      finalBlock.textContent = ensureDelimiters(result.finalAnswer);
      container.appendChild(finalBlock);
      renderMath(finalBlock);
    }

    graphAnalysisContent.appendChild(container);
  }

  function showLoading(show) {
    loadingContainer.style.display = show ? 'block' : 'none';
    if (show) {
      hideAnimationButton();
    }
  }

  function showSolution(show) {
    solutionSection.style.display = show ? 'block' : 'none';
  }

  function showAnimationButton(solution) {
    let button = document.getElementById('animateSolutionBtn');
    if (!button) {
      button = document.createElement('button');
      button.id = 'animateSolutionBtn';
      button.className = 'btn-primary';
      button.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <polygon points="10 8 16 12 10 16 10 8"></polygon>
        </svg>
        ${t('animate')}
      `;

      const actions = document.querySelector('.solution-actions');
      actions?.insertBefore(button, actions.firstChild);
    }

    button.style.display = 'inline-flex';
    button.onclick = () => {
      if (window.AnimationModule) {
        AnimationModule.start(solution);
      }
    };
  }

  function hideAnimationButton() {
    const button = document.getElementById('animateSolutionBtn');
    if (button) {
      button.style.display = 'none';
    }
  }

  async function generateAnimationsInBackground(problemText, solution) {
    try {
      const response = await fetch('/mathnote/api/animate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problem: problemText,
          steps: solution.steps,
          lang: currentLang,
        }),
      });

      if (!response.ok) {
        return;
      }

      const data = await response.json();
      if (!Array.isArray(data.steps)) {
        return;
      }

      const hasAnimation = data.steps.some((step) => step.animation && step.animation.type !== 'none');
      if (!hasAnimation) {
        return;
      }

      const animatedSolution = { ...solution, steps: data.steps };
      currentSolution = animatedSolution;
      showAnimationButton(animatedSolution);
    } catch (error) {
      console.warn('[AnimBg] Failed to pre-generate animations:', error.message);
    }
  }

  function sanitizeLatex(text) {
    if (!text) {
      return '';
    }

    let hasMarkers = false;
    let sanitized = String(text).replace(/#LATEX\s*([\s\S]*?)\s*#!LATEX/g, (_match, latex) => {
      hasMarkers = true;
      return `$${latex.trim()}$`;
    });

    const mathBlocks = [];
    sanitized = sanitized.replace(/(\$\$[\s\S]+?\$\$|\$[^\$]+?\$)/g, (match) => {
      mathBlocks.push(match);
      return `\u0000MATH${mathBlocks.length - 1}\u0000`;
    });

    sanitized = escapeHtml(sanitized);
    sanitized = sanitized.replace(/\u0000MATH(\d+)\u0000/g, (_match, index) => mathBlocks[Number(index)]);

    if (hasMarkers) {
      return sanitized;
    }

    const commands = [
      'frac',
      'sqrt',
      'alpha',
      'beta',
      'gamma',
      'delta',
      'theta',
      'lambda',
      'pi',
      'sigma',
      'phi',
      'omega',
      'sum',
      'int',
      'log',
      'ln',
      'sin',
      'cos',
      'tan',
      'text',
      'times',
      'div',
      'cdot',
      'pm',
      'mp',
      'leq',
      'geq',
      'neq',
      'approx',
      'infty',
      'partial',
      'nabla',
      'begin',
      'end',
      'left',
      'right',
      'circ',
      'parallel',
    ];

    commands.forEach((command) => {
      const regex = new RegExp(`(?<![\\\\a-zA-Z])${command}(?=[\\{\\s\\(\\^_]|$)`, 'g');
      sanitized = sanitized.replace(regex, `\\${command}`);
    });

    sanitized = sanitized.replace(/\\\\/g, '\\');
    sanitized = sanitized.replace(/([^\\])end\{/g, '$1\\end{');
    sanitized = sanitized.replace(/([^\\])begin\{/g, '$1\\begin{');

    return sanitized;
  }

  function ensureDelimiters(text) {
    if (!text) {
      return '';
    }

    const trimmed = String(text).trim();
    if (!trimmed) {
      return '';
    }

    if (
      (trimmed.startsWith('$$') && trimmed.endsWith('$$')) ||
      (trimmed.startsWith('\\[') && trimmed.endsWith('\\]')) ||
      (trimmed.startsWith('\\(') && trimmed.endsWith('\\)'))
    ) {
      return trimmed;
    }

    if (/[\\^_={}><]/.test(trimmed)) {
      const clean = trimmed.replace(/^\$+|\$+$/g, '');
      return `$$${clean}$$`;
    }

    return trimmed;
  }

  function renderMath(element) {
    if (!element || !window.renderMathInElement) {
      return;
    }

    try {
      renderMathInElement(element, {
        delimiters: [
          { left: '\\[', right: '\\]', display: true },
          { left: '\\(', right: '\\)', display: false },
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
        ],
        throwOnError: false,
      });
    } catch (error) {
      console.warn('KaTeX rendering failed:', error);
    }
  }

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function showToast(message, type = 'info') {
    const existing = document.querySelector('.toast');
    if (existing) {
      existing.remove();
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      padding: 12px 24px;
      border-radius: 12px;
      font-family: var(--font-primary);
      font-size: 14px;
      font-weight: 500;
      z-index: 300;
      animation: fadeIn 0.3s ease;
      max-width: 420px;
      ${type === 'success' ? 'background: var(--success-bg); color: var(--success); border: 1px solid rgba(73, 222, 128, 0.35);' : ''}
      ${type === 'error' ? 'background: var(--error-bg); color: var(--error); border: 1px solid rgba(248, 113, 113, 0.35);' : ''}
      ${type === 'info' ? 'background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border-color);' : ''}
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  function loadingMarkup() {
    return `
      <div style="display: flex; justify-content: center; padding: 2rem;">
        <div class="loading-spinner small">
          <div class="spinner-ring"></div>
          <div class="spinner-ring"></div>
        </div>
      </div>
    `;
  }

  function buildResponseError(status, data) {
    const error = new Error(data?.details || data?.error || 'Request failed');
    error.status = status;
    error.retryAfter = data?.retryAfter;
    error.apiError = data?.error;
    return error;
  }

  function resolveApiErrorMessage(error) {
    if (error?.status === 429 || error?.retryAfter) {
      return t('rateLimit').replace('{secs}', error.retryAfter || 30);
    }

    if (error?.status === 503) {
      return t('errorConfig');
    }

    if (error?.message && error.message !== 'Request failed') {
      return error.message;
    }

    return t('errorSolving');
  }
});
