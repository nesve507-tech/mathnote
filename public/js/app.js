document.addEventListener('DOMContentLoaded', async () => {
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
  let currentDocumentFile = null;
  let currentDocumentStatusKey = 'documentStatusIdle';
  let currentDocumentQuestions = [];
  let currentUser = null;
  const captchaState = {
    login: null,
    signup: null,
  };

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

  const documentInput = document.getElementById('documentInput');
  const documentSelectBtn = document.getElementById('documentSelectBtn');
  const documentExtractBtn = document.getElementById('documentExtractBtn');
  const documentSolveBtn = document.getElementById('documentSolveBtn');
  const documentClearBtn = document.getElementById('documentClearBtn');
  const documentFileName = document.getElementById('documentFileName');
  const documentStatus = document.getElementById('documentStatus');
  const documentTextOutput = document.getElementById('documentTextOutput');
  const documentQuestions = document.getElementById('documentQuestions');

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
  const exportPdfBtn = document.getElementById('exportPdfBtn');
  const exportWordBtn = document.getElementById('exportWordBtn');

  const keyboardToggle = document.getElementById('keyboardToggle');
  const mathKeyboard = document.getElementById('mathKeyboard');
  const langToggle = document.getElementById('langToggle');
  const themeToggle = document.getElementById('themeToggle');
  const logoutBtn = document.getElementById('logoutBtn');
  const historyBtn = document.getElementById('historyBtn');
  const adminBtn = document.getElementById('adminBtn');
  const passwordBtn = document.getElementById('passwordBtn');

  const authGate = document.getElementById('authGate');
  const authStatus = document.getElementById('authStatus');
  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  const loginCaptchaQuestion = document.getElementById('loginCaptchaQuestion');
  const signupCaptchaQuestion = document.getElementById('signupCaptchaQuestion');
  const loginCaptchaAnswer = document.getElementById('loginCaptchaAnswer');
  const signupCaptchaAnswer = document.getElementById('signupCaptchaAnswer');

  const savedProblemsBtn = document.getElementById('savedProblemsBtn');
  const savedModal = document.getElementById('savedModal');
  const closeSavedModal = document.getElementById('closeSavedModal');
  const savedList = document.getElementById('savedList');

  const historyModal = document.getElementById('historyModal');
  const closeHistoryModal = document.getElementById('closeHistoryModal');
  const historyList = document.getElementById('historyList');

  const passwordModal = document.getElementById('passwordModal');
  const closePasswordModal = document.getElementById('closePasswordModal');
  const passwordForm = document.getElementById('passwordForm');
  const passwordStatus = document.getElementById('passwordStatus');

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
  setupAuthHandlers();
  await initAuthGate();
  setOcrStatus('ocrStatusIdle');
  setDocumentStatus('documentStatusIdle');
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
    setDocumentStatus(currentDocumentStatusKey, documentStatus.dataset.tone || 'info');
    if (!currentDocumentFile) {
      documentFileName.textContent = t('documentNoFile');
    }
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

  logoutBtn.addEventListener('click', async () => {
    try {
      await fetch('/mathnote/api/logout', { method: 'POST' });
    } catch (error) {
      console.warn('Logout request failed:', error);
    }

    currentUser = null;
    showAuthGate();
    showToast(t('loggedOut'), 'success');
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

  documentSelectBtn.addEventListener('click', () => documentInput.click());

  documentInput.addEventListener('change', () => {
    const file = documentInput.files?.[0];
    if (!file) {
      return;
    }

    setDocumentFile(file);
  });

  documentSolveBtn.addEventListener('click', runDocumentSolve);
  documentClearBtn.addEventListener('click', clearDocumentState);
  documentExtractBtn.addEventListener('click', runDocumentExtract);

  verificationBadge.style.cursor = 'pointer';
  verificationBadge.addEventListener('click', () => {
    const isVisible = verificationDetail.style.display !== 'none';
    verificationDetail.style.display = isVisible ? 'none' : 'block';
    const chevron = verificationBadge.querySelector('.badge-chevron');
    if (chevron) {
      chevron.textContent = isVisible ? 'v' : '^';
    }
  });

  saveBtn.addEventListener('click', async () => {
    if (!currentSolution || !currentDisplayProblem) {
      return;
    }

    saveBtn.disabled = true;
    try {
      const response = await fetch('/mathnote/api/saved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problem: currentDisplayProblem,
          problemText: currentProblemText,
          solution: currentSolution,
          classLevel: currentClassLevel,
          source: currentSource,
          lang: currentLang,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw buildResponseError(response.status, data);
      }

      showToast(t('savedSuccess'), 'success');
    } catch (error) {
      console.error('Save error:', error);
      showToast(resolveApiErrorMessage(error), 'error');
    } finally {
      saveBtn.disabled = false;
    }
  });

  exportPdfBtn.addEventListener('click', () => exportSolution('pdf'));
  exportWordBtn.addEventListener('click', () => exportSolution('docx'));

  savedProblemsBtn.addEventListener('click', async () => {
    savedModal.style.display = 'flex';
    await renderSavedList();
  });

  historyBtn.addEventListener('click', async () => {
    historyModal.style.display = 'flex';
    await renderHistoryList();
  });

  passwordBtn.addEventListener('click', () => {
    passwordForm.reset();
    passwordStatus.textContent = '';
    passwordModal.style.display = 'flex';
  });

  passwordForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await changePassword();
  });

  closeSavedModal.addEventListener('click', () => {
    savedModal.style.display = 'none';
  });

  closeHistoryModal.addEventListener('click', () => {
    historyModal.style.display = 'none';
  });

  closePasswordModal.addEventListener('click', () => {
    passwordModal.style.display = 'none';
  });

  savedModal.addEventListener('click', (event) => {
    if (event.target === savedModal) {
      savedModal.style.display = 'none';
    }
  });

  historyModal.addEventListener('click', (event) => {
    if (event.target === historyModal) {
      historyModal.style.display = 'none';
    }
  });

  passwordModal.addEventListener('click', (event) => {
    if (event.target === passwordModal) {
      passwordModal.style.display = 'none';
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

  function setupAuthHandlers() {
    document.querySelectorAll('.auth-tab').forEach((button) => {
      button.addEventListener('click', () => switchAuthTab(button.getAttribute('data-auth-tab')));
    });

    document.querySelectorAll('.captcha-refresh').forEach((button) => {
      button.addEventListener('click', () => loadCaptcha(button.getAttribute('data-captcha-target')));
    });

    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      await submitAuthForm('login');
    });

    signupForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      await submitAuthForm('signup');
    });
  }

  async function initAuthGate() {
    try {
      const response = await fetch('/mathnote/api/me');
      const data = await response.json();
      if (response.ok && data.authenticated) {
        setAuthenticatedUser(data.user);
        return;
      }
    } catch (error) {
      console.warn('Auth check failed:', error);
    }

    showAuthGate();
  }

  function setAuthenticatedUser(user) {
    currentUser = user;
    authGate.style.display = 'none';
    logoutBtn.style.display = 'inline-flex';
    adminBtn.style.display = user?.role === 'admin' ? 'inline-flex' : 'none';
    authStatus.textContent = '';
    authStatus.removeAttribute('data-tone');
  }

  async function showAuthGate() {
    authGate.style.display = 'grid';
    logoutBtn.style.display = 'none';
    adminBtn.style.display = 'none';
    switchAuthTab('login');
    await Promise.all([loadCaptcha('login'), loadCaptcha('signup')]);
  }

  function switchAuthTab(tabName) {
    document.querySelectorAll('.auth-tab').forEach((button) => {
      button.classList.toggle('active', button.getAttribute('data-auth-tab') === tabName);
    });

    loginForm.classList.toggle('active', tabName === 'login');
    signupForm.classList.toggle('active', tabName === 'signup');
    authStatus.textContent = '';
    authStatus.removeAttribute('data-tone');
  }

  async function loadCaptcha(type) {
    const target = type === 'signup' ? 'signup' : 'login';
    const questionElement = target === 'signup' ? signupCaptchaQuestion : loginCaptchaQuestion;
    const answerElement = target === 'signup' ? signupCaptchaAnswer : loginCaptchaAnswer;

    questionElement.textContent = '...';
    answerElement.value = '';

    try {
      const response = await fetch('/mathnote/api/captcha');
      const data = await response.json();
      if (!response.ok || !data.captcha) {
        throw buildResponseError(response.status, data);
      }

      captchaState[target] = data.captcha;
      questionElement.textContent = data.captcha.question;
    } catch (error) {
      console.error('Captcha error:', error);
      captchaState[target] = null;
      questionElement.textContent = t('captchaUnavailable');
    }
  }

  async function submitAuthForm(type) {
    const isSignup = type === 'signup';
    const form = isSignup ? signupForm : loginForm;
    const captcha = captchaState[type];
    const formData = new FormData(form);
    const submitButton = form.querySelector('.auth-submit');

    if (!captcha) {
      setAuthStatus(t('captchaUnavailable'), 'error');
      await loadCaptcha(type);
      return;
    }

    submitButton.disabled = true;
    setAuthStatus(isSignup ? t('creatingAccount') : t('loggingIn'), 'success');

    try {
      const response = await fetch(`/mathnote/api/${isSignup ? 'signup' : 'login'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.get('name'),
          email: formData.get('email'),
          password: formData.get('password'),
          captchaId: captcha.id,
          captchaAnswer: formData.get('captchaAnswer'),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw buildResponseError(response.status, data);
      }

      form.reset();
      setAuthenticatedUser(data.user);
      showToast(isSignup ? t('signupSuccess') : t('loginSuccess'), 'success');
    } catch (error) {
      console.error('Auth error:', error);
      setAuthStatus(error.message || t('authFailed'), 'error');
      await loadCaptcha(type);
    } finally {
      submitButton.disabled = false;
    }
  }

  function setAuthStatus(message, tone) {
    authStatus.textContent = message;
    authStatus.dataset.tone = tone;
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

  function setDocumentFile(file) {
    currentDocumentFile = file;
    currentDocumentQuestions = [];
    documentTextOutput.value = '';
    documentQuestions.innerHTML = '';
    documentFileName.textContent = file.name;
    setDocumentStatus('documentStatusSelected', 'info');
  }

  function clearDocumentState() {
    currentDocumentFile = null;
    currentDocumentQuestions = [];
    documentInput.value = '';
    documentTextOutput.value = '';
    documentQuestions.innerHTML = '';
    documentFileName.textContent = t('documentNoFile');
    setDocumentStatus('documentStatusIdle', 'info');
  }

  function setDocumentStatus(key, tone = 'info') {
    currentDocumentStatusKey = key;
    documentStatus.dataset.tone = tone;
    documentStatus.textContent = t(key);
  }

  async function runDocumentSolve() {
    if (!currentDocumentFile) {
      showToast(t('errorNoDocument'), 'error');
      return;
    }

    setDocumentStatus('documentStatusRunning', 'info');
    toggleDocumentButtons(true);
    showLoading(true);
    showSolution(false);

    try {
      const formData = new FormData();
      formData.append('document', currentDocumentFile);
      formData.append('lang', currentLang);
      formData.append('classLevel', getActiveClassLevel());
      formData.append('history', JSON.stringify(conversationHistory));

      const response = await fetch('/mathnote/api/document-solve', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw buildResponseError(response.status, data);
      }

      const extractedText = data.document?.text || '';
      currentDocumentQuestions = Array.isArray(data.document?.questions) ? data.document.questions : [];
      documentTextOutput.value = extractedText;
      renderDocumentQuestions();

      currentProblemText = extractedText;
      currentDisplayProblem = data.document?.fileName || extractedText;
      currentClassLevel = getActiveClassLevel();
      currentSource = 'document';
      currentSolution = data.solution;
      conversationHistory = [
        { role: 'user', content: `Solve document: ${extractedText}` },
        { role: 'assistant', content: data.rawResponse },
      ];

      renderSolution(data.solution);
      afterSolveSuccess(extractedText, data.solution);
      setDocumentStatus('documentStatusSolved', 'success');
    } catch (error) {
      console.error('Document solve error:', error);
      showLoading(false);
      showSolution(false);
      showToast(resolveApiErrorMessage(error), 'error');
      setDocumentStatus('documentStatusError', 'error');
    } finally {
      toggleDocumentButtons(false);
    }
  }

  async function runDocumentExtract() {
    if (!currentDocumentFile) {
      showToast(t('errorNoDocument'), 'error');
      return;
    }

    setDocumentStatus('documentStatusExtracting', 'info');
    toggleDocumentButtons(true);

    try {
      const formData = new FormData();
      formData.append('document', currentDocumentFile);

      const response = await fetch('/mathnote/api/document-extract', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw buildResponseError(response.status, data);
      }

      documentTextOutput.value = data.document?.text || '';
      currentDocumentQuestions = Array.isArray(data.document?.questions) ? data.document.questions : [];
      renderDocumentQuestions();
      setDocumentStatus('documentStatusExtracted', 'success');
    } catch (error) {
      console.error('Document extract error:', error);
      showToast(resolveApiErrorMessage(error), 'error');
      setDocumentStatus('documentStatusError', 'error');
    } finally {
      toggleDocumentButtons(false);
    }
  }

  function renderDocumentQuestions() {
    if (!currentDocumentQuestions.length) {
      documentQuestions.innerHTML = '';
      return;
    }

    documentQuestions.innerHTML = currentDocumentQuestions
      .map(
        (question, index) => `
          <div class="document-question">
            <div class="document-question-text"><strong>${t('question')} ${index + 1}</strong><br>${escapeHtml(question)}</div>
            <button class="btn-secondary solve-document-question" type="button" data-index="${index}">${t('solve')}</button>
          </div>
        `
      )
      .join('');

    documentQuestions.querySelectorAll('.solve-document-question').forEach((button) => {
      button.addEventListener('click', async () => {
        const question = currentDocumentQuestions[Number(button.getAttribute('data-index'))];
        if (!question) {
          return;
        }

        await solveGeneric(question, getActiveClassLevel(), question, 'document-question');
      });
    });
  }

  function toggleDocumentButtons(isBusy) {
    [documentSelectBtn, documentExtractBtn, documentSolveBtn, documentClearBtn].forEach((button) => {
      button.disabled = isBusy;
    });
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
          source,
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

  async function exportSolution(format) {
    if (!currentSolution) {
      showToast(t('errorNoSolution'), 'error');
      return;
    }

    const isPdf = format === 'pdf';
    const button = isPdf ? exportPdfBtn : exportWordBtn;
    button.disabled = true;

    try {
      const response = await fetch('/mathnote/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problem: currentProblemText || currentDisplayProblem,
          solution: currentSolution,
          format,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw buildResponseError(response.status, data);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = isPdf ? 'mathnote-solution.pdf' : 'mathnote-solution.docx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showToast(isPdf ? t('exportPdfSuccess') : t('exportWordSuccess'), 'success');
    } catch (error) {
      console.error('Export error:', error);
      showToast(resolveApiErrorMessage(error), 'error');
    } finally {
      button.disabled = false;
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
            <span class="verify-corrected-label">${currentLang === 'vi' ? 'Đáp án đúng' : 'Correct Answer'}:</span>
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

  async function renderSavedList() {
    savedList.innerHTML = loadingMarkup();

    let saved = [];
    try {
      const response = await fetch('/mathnote/api/saved');
      const data = await response.json();
      if (!response.ok) {
        throw buildResponseError(response.status, data);
      }

      saved = Array.isArray(data.saved) ? data.saved : [];
    } catch (error) {
      console.error('Load saved error:', error);
      savedList.innerHTML = `<p class="empty-state" style="color: var(--error);">${resolveApiErrorMessage(error)}</p>`;
      return;
    }

    if (saved.length === 0) {
      savedList.innerHTML = `<p class="empty-state">${t('noSavedProblems')}</p>`;
      return;
    }

    savedList.innerHTML = saved
      .map((item) => {
        const label = item.source === 'word' ? t('wordProblem') : item.source === 'document' ? t('document') : 'Mathnote';
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
        const id = button.getAttribute('data-id');
        const item = saved.find((entry) => entry.id === id);
        if (!item) {
          return;
        }

        if (item.source === 'word') {
          switchTab('word');
          wordProblemInput.value = item.problem;
          wordClassLevelInput.value = item.classLevel || '';
        } else if (item.source === 'document') {
          switchTab('solver');
          documentTextOutput.value = item.problemText || item.problem;
          documentFileName.textContent = item.problem;
          setDocumentStatus('documentStatusSolved', 'success');
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
      button.addEventListener('click', async (event) => {
        event.stopPropagation();
        const id = button.getAttribute('data-id');
        button.disabled = true;

        try {
          const response = await fetch(`/mathnote/api/saved/${encodeURIComponent(id)}`, {
            method: 'DELETE',
          });
          const data = await response.json();
          if (!response.ok) {
            throw buildResponseError(response.status, data);
          }

          await renderSavedList();
          showToast(t('deletedSuccess'), 'success');
        } catch (error) {
          console.error('Delete saved error:', error);
          showToast(resolveApiErrorMessage(error), 'error');
          button.disabled = false;
        }
      });
    });
  }

  async function renderHistoryList() {
    historyList.innerHTML = loadingMarkup();

    let history = [];
    try {
      const response = await fetch('/mathnote/api/history');
      const data = await response.json();
      if (!response.ok) {
        throw buildResponseError(response.status, data);
      }

      history = Array.isArray(data.history) ? data.history : [];
    } catch (error) {
      console.error('Load history error:', error);
      historyList.innerHTML = `<p class="empty-state" style="color: var(--error);">${resolveApiErrorMessage(error)}</p>`;
      return;
    }

    if (history.length === 0) {
      historyList.innerHTML = `<p class="empty-state">${t('noHistory')}</p>`;
      return;
    }

    historyList.innerHTML = history
      .map((item) => {
        const label =
          item.source === 'word'
            ? t('wordProblem')
            : item.source === 'document' || item.source === 'document-question'
              ? t('document')
              : item.source === 'graph'
                ? t('graphing')
                : item.source === 'ocr'
                  ? 'OCR'
                  : 'Mathnote';
        return `
          <div class="saved-item" data-id="${item.id}">
            <div class="saved-item-problem">${sanitizeLatex(item.problem)}</div>
            <div class="saved-item-date">${escapeHtml(item.date)} · ${escapeHtml(item.classLevel || 'General')} · ${escapeHtml(label)}</div>
            <div class="saved-item-actions">
              <button class="btn-secondary load-history-btn" type="button" data-id="${item.id}">${t('load')}</button>
              <button class="btn-secondary delete-history-btn" type="button" data-id="${item.id}" style="color: var(--error);">${t('delete')}</button>
            </div>
          </div>
        `;
      })
      .join('');

    historyList.querySelectorAll('.saved-item-problem').forEach((element) => renderMath(element));

    historyList.querySelectorAll('.load-history-btn').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const id = button.getAttribute('data-id');
        const item = history.find((entry) => entry.id === id);
        if (!item) {
          return;
        }

        loadSolvedItem(item);
        historyModal.style.display = 'none';
      });
    });

    historyList.querySelectorAll('.delete-history-btn').forEach((button) => {
      button.addEventListener('click', async (event) => {
        event.stopPropagation();
        const id = button.getAttribute('data-id');
        button.disabled = true;

        try {
          const response = await fetch(`/mathnote/api/history/${encodeURIComponent(id)}`, {
            method: 'DELETE',
          });
          const data = await response.json();
          if (!response.ok) {
            throw buildResponseError(response.status, data);
          }

          await renderHistoryList();
          showToast(t('deletedSuccess'), 'success');
        } catch (error) {
          console.error('Delete history error:', error);
          showToast(resolveApiErrorMessage(error), 'error');
          button.disabled = false;
        }
      });
    });
  }

  function loadSolvedItem(item) {
    if (item.source === 'word') {
      switchTab('word');
      wordProblemInput.value = item.problemText || item.problem;
      wordClassLevelInput.value = item.classLevel || '';
    } else {
      switchTab('solver');
      setMathInputValue(item.problemText || item.problem);
      classLevelInput.value = item.classLevel || '';
    }

    currentProblemText = item.problemText || item.problem;
    currentDisplayProblem = item.problem;
    currentClassLevel = item.classLevel || '';
    currentSource = item.source || 'solver';
    currentSolution = item.solution;
    renderSolution(item.solution);
    showSolution(true);
  }

  async function changePassword() {
    const formData = new FormData(passwordForm);
    const submitButton = passwordForm.querySelector('.auth-submit');
    submitButton.disabled = true;
    passwordStatus.textContent = t('changingPassword');
    passwordStatus.dataset.tone = 'success';

    try {
      const response = await fetch('/mathnote/api/account/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: formData.get('currentPassword'),
          newPassword: formData.get('newPassword'),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw buildResponseError(response.status, data);
      }

      passwordForm.reset();
      passwordStatus.textContent = t('passwordChanged');
      showToast(t('passwordChanged'), 'success');
    } catch (error) {
      console.error('Change password error:', error);
      passwordStatus.dataset.tone = 'error';
      passwordStatus.textContent = resolveApiErrorMessage(error);
    } finally {
      submitButton.disabled = false;
    }
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
    if (error?.status === 401) {
      showAuthGate();
      return t('authRequired');
    }

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
