const AnimationModule = (() => {
  let currentSolution = null;
  let slides = [];
  let currentSlideIndex = 0;

  let overlay;
  let stage;
  let instructionBox;
  let progressBar;
  let prevBtn;
  let nextBtn;
  let closeBtn;
  let replayBtn;
  let chatBtn;
  let chatBubble;
  let chatInput;
  let chatSend;
  let chatMessages;

  function init() {
    createOverlay();

    prevBtn.addEventListener('click', prevStep);
    nextBtn.addEventListener('click', nextStep);
    closeBtn.addEventListener('click', closeOverlay);
    replayBtn.addEventListener('click', replayStep);

    document.addEventListener('keydown', (event) => {
      if (overlay.style.display !== 'flex') {
        return;
      }

      if (event.key === 'ArrowRight') {
        nextStep();
      }
      if (event.key === 'ArrowLeft') {
        prevStep();
      }
      if (event.key === 'Escape') {
        closeOverlay();
      }
    });
  }

  function createOverlay() {
    const container = document.createElement('div');
    container.className = 'animation-overlay';
    container.style.display = 'none';
    container.innerHTML = `
      <div class="animation-header">
        <div class="animation-title">Step-by-Step Solver</div>
        <button class="btn-icon" id="animCloseBtn" type="button">x</button>
      </div>
      <div class="animation-content">
        <div class="animation-stage" id="animStage"></div>
        <div class="animation-instruction" id="animInstruction"></div>
        <div class="anim-chat-container">
          <button class="anim-chat-btn" id="animChatBtn" type="button" title="Ask a question about this step">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
          </button>
          <div class="anim-chat-bubble" id="animChatBubble" style="display: none;">
            <div class="anim-chat-messages" id="animChatMessages"></div>
            <div class="anim-chat-input-area">
              <input type="text" id="animChatInput" placeholder="Ask about this step..." />
              <button id="animChatSend" type="button">></button>
            </div>
          </div>
        </div>
      </div>
      <div class="animation-controls">
        <button class="control-btn" id="animPrevBtn" type="button" title="Previous Step"><</button>
        <button class="control-btn" id="animReplayBtn" type="button" title="Replay Step">R</button>
        <button class="control-btn" id="animNextBtn" type="button" title="Next Step">></button>
      </div>
      <div class="progress-bar" id="animProgressBar"></div>
    `;

    document.body.appendChild(container);

    overlay = container;
    stage = container.querySelector('#animStage');
    instructionBox = container.querySelector('#animInstruction');
    progressBar = container.querySelector('#animProgressBar');
    prevBtn = container.querySelector('#animPrevBtn');
    nextBtn = container.querySelector('#animNextBtn');
    closeBtn = container.querySelector('#animCloseBtn');
    replayBtn = container.querySelector('#animReplayBtn');
    chatBtn = container.querySelector('#animChatBtn');
    chatBubble = container.querySelector('#animChatBubble');
    chatInput = container.querySelector('#animChatInput');
    chatSend = container.querySelector('#animChatSend');
    chatMessages = container.querySelector('#animChatMessages');

    chatBtn.addEventListener('click', toggleChat);
    chatSend.addEventListener('click', sendQuestion);
    chatInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        sendQuestion();
      }
    });
  }

  function toggleChat() {
    if (chatBubble.style.display === 'none') {
      chatBubble.style.display = 'flex';
      chatInput.focus();
      return;
    }

    chatBubble.style.display = 'none';
  }

  async function sendQuestion() {
    const question = chatInput.value.trim();
    if (!question || !currentSolution) {
      return;
    }

    addMessage('user', question);
    chatInput.value = '';
    const loadingId = addMessage('assistant', '...');

    try {
      const currentSlide = slides[currentSlideIndex];
      const stepIndex = currentSlide ? currentSlide.stepIndex || 0 : 0;
      const step = currentSolution.steps[stepIndex];
      const totalSteps = currentSolution.steps.length;
      const problemText = window.MathnoteApp?.getCurrentProblemText?.() || '';

      const response = await fetch('/mathnote/api/ask_step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          step,
          stepNumber: stepIndex + 1,
          totalSteps,
          slideType: currentSlide ? currentSlide.type : 'equation',
          problem: problemText,
          lang: document.documentElement.getAttribute('data-lang') || 'en',
        }),
      });

      const data = await response.json();
      const loadingMessage = document.getElementById(loadingId);
      if (loadingMessage) {
        loadingMessage.remove();
      }

      addMessage('assistant', data.answer || 'No answer returned.');
    } catch (error) {
      console.error(error);
      const loadingMessage = document.getElementById(loadingId);
      if (loadingMessage) {
        loadingMessage.textContent = 'Error getting answer.';
      }
    }
  }

  function addMessage(role, text) {
    const message = document.createElement('div');
    message.className = `chat-msg ${role}`;
    if (role === 'user') {
      message.textContent = text;
    } else {
      message.innerHTML = sanitizeLatex(text);
    }
    message.id = `msg-${Date.now()}`;
    chatMessages.appendChild(message);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    renderMath(message);
    return message.id;
  }

  function start(solution) {
    if (!solution || !Array.isArray(solution.steps)) {
      return;
    }

    currentSolution = solution;
    const hasAnimation = solution.steps.some((step) => step.animation && step.animation.type !== 'none');
    if (!hasAnimation) {
      overlay.style.display = 'flex';
      showGeneratePrompt();
      return;
    }

    slides = [];
    solution.steps.forEach((step, index) => {
      slides.push({
        type: 'equation',
        content: step.math,
        explanation: step.explanation,
        title: step.title,
        stepIndex: index,
      });

      if (step.animation && step.animation.type !== 'none') {
        slides.push({
          type: 'action',
          content: step.animation.latex,
          text: step.animation.text,
          stepIndex: index,
        });
      }

      if (index === solution.steps.length - 1) {
        slides.push({
          type: 'equation',
          content: step.result,
          explanation: 'Final Answer',
          title: 'Result',
          stepIndex: index,
          isFinal: true,
        });
      }
    });

    currentSlideIndex = 0;
    overlay.style.display = 'flex';
    updateProgress();
    renderSlide(currentSlideIndex);
  }

  function showGeneratePrompt() {
    stage.innerHTML = '';
    instructionBox.classList.remove('visible');
    instructionBox.innerHTML = '';
    progressBar.style.width = '0%';

    const container = document.createElement('div');
    container.style.textAlign = 'center';
    container.innerHTML = `
      <div style="font-size: 20px; margin-bottom: 24px;">No animations found for this solution.</div>
      <p style="color: var(--text-secondary); margin-bottom: 32px;">Would you like AI to generate step-by-step animations?</p>
      <button class="btn-primary" id="genAnimBtn" type="button">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px;">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path>
        </svg>
        Generate Animations
      </button>
      <div id="genAnimLoading" style="display: none; margin-top: 20px;">
        <div class="loading-spinner small" style="margin: 0 auto;">
          <div class="spinner-ring"></div>
        </div>
        <p style="margin-top: 10px; font-size: 14px; color: var(--text-muted);">Generating animations...</p>
      </div>
    `;

    stage.appendChild(container);
    document.getElementById('genAnimBtn').addEventListener('click', generateAnimations);
  }

  async function generateAnimations() {
    const button = document.getElementById('genAnimBtn');
    const loading = document.getElementById('genAnimLoading');

    if (button) {
      button.style.display = 'none';
    }
    if (loading) {
      loading.style.display = 'block';
    }

    try {
      const response = await fetch('/mathnote/api/animate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problem: window.MathnoteApp?.getCurrentProblemText?.() || '',
          steps: currentSolution.steps,
          lang: document.documentElement.getAttribute('data-lang') || 'en',
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate animations.');
      }

      const hasAnimation = data.steps.some((step) => step.animation && step.animation.type !== 'none');
      if (hasAnimation) {
        start({ ...currentSolution, steps: data.steps });
        return;
      }

      if (loading) {
        loading.innerHTML = '<p style="color: var(--text-secondary)">AI could not animate this specific solution.</p>';
      }
      setTimeout(() => {
        if (button) {
          button.style.display = 'inline-flex';
        }
        if (loading) {
          loading.style.display = 'none';
        }
      }, 2500);
    } catch (error) {
      console.error('Generate animation error:', error);
      if (loading) {
        loading.innerHTML = '<p style="color: var(--error)">Failed to generate animations.</p>';
      }
    }
  }

  function closeOverlay() {
    overlay.style.display = 'none';
    currentSolution = null;
    stage.innerHTML = '';
    instructionBox.textContent = '';
  }

  function nextStep() {
    if (currentSlideIndex < slides.length - 1) {
      currentSlideIndex += 1;
      renderSlide(currentSlideIndex);
      updateProgress();
      return;
    }

    closeOverlay();
  }

  function prevStep() {
    if (currentSlideIndex === 0) {
      return;
    }

    currentSlideIndex -= 1;
    renderSlide(currentSlideIndex);
    updateProgress();
  }

  function replayStep() {
    renderSlide(currentSlideIndex);
  }

  function updateProgress() {
    const total = slides.length || 1;
    const progress = ((currentSlideIndex + 1) / total) * 100;
    progressBar.style.width = `${progress}%`;
    prevBtn.disabled = currentSlideIndex === 0;
    nextBtn.title = currentSlideIndex === total - 1 ? 'Finish' : 'Next';
  }

  function renderSlide(index) {
    const slide = slides[index];
    stage.innerHTML = '';
    instructionBox.classList.remove('visible');
    instructionBox.innerHTML = '';

    const element = document.createElement('div');
    element.className = 'anim-el';

    if (slide.type === 'equation') {
      element.textContent = ensureDelimiters(slide.content);
      element.style.fontSize = '32px';
      if (slide.isFinal) {
        element.style.color = 'var(--accent-primary)';
      }

      instructionBox.innerHTML = sanitizeLatex(slide.explanation || slide.title);
      renderMath(instructionBox);
      instructionBox.classList.add('visible');
      stage.appendChild(element);
      renderMath(element);
      animateElement(element);
      return;
    }

    if (slide.type === 'action') {
      const wrapper = document.createElement('div');
      wrapper.style.display = 'flex';
      wrapper.style.flexDirection = 'column';
      wrapper.style.alignItems = 'center';
      wrapper.style.justifyContent = 'center';

      const context = document.createElement('div');
      context.textContent = ensureDelimiters(currentSolution.steps[slide.stepIndex].math);
      context.style.fontSize = '24px';
      context.style.opacity = '0.5';
      context.style.marginBottom = '20px';
      wrapper.appendChild(context);
      renderMath(context);

      const action = document.createElement('div');
      action.textContent = ensureDelimiters(slide.content);
      action.style.fontSize = '48px';
      action.style.fontWeight = 'bold';
      action.style.color = 'var(--accent-secondary)';
      wrapper.appendChild(action);
      renderMath(action);

      stage.appendChild(wrapper);
      instructionBox.innerHTML = sanitizeLatex(slide.text);
      renderMath(instructionBox);
      instructionBox.classList.add('visible');
      animateElement(action, true);
    }
  }

  function animateElement(element, spring = false) {
    element.style.opacity = '0';
    element.style.transform = 'scale(0.88)';
    void element.offsetWidth;
    element.style.transition = spring ? 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)' : 'all 0.4s ease-out';
    element.style.opacity = '1';
    element.style.transform = 'scale(1)';
  }

  function renderMath(element) {
    if (!element || !window.renderMathInElement) {
      return;
    }

    renderMathInElement(element, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
      ],
      throwOnError: false,
    });
  }

  function sanitizeLatex(text) {
    if (!text) {
      return '';
    }

    const colorMap = {
      RED: 'red',
      BLUE: 'blue',
      GREEN: 'green',
      ORANGE: 'orange',
      PURPLE: 'purple',
      CYAN: 'cyan',
      TEAL: 'teal',
      PINK: 'pink',
    };

    let value = String(text);
    Object.entries(colorMap).forEach(([marker, color]) => {
      const regex = new RegExp(`#COLOR-${marker}\\s*([\\s\\S]*?)\\s*#!COLOR-${marker}`, 'g');
      value = value.replace(regex, (_match, content) => `\\textcolor{${color}}{${content.trim()}}`);
    });

    let sanitized = value.replace(/#LATEX\s*([\s\S]*?)\s*#!LATEX/g, (_match, latex) => `$${latex.trim()}$`);
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
      (trimmed.startsWith('$') && trimmed.endsWith('$')) ||
      (trimmed.startsWith('\\(') && trimmed.endsWith('\\)')) ||
      (trimmed.startsWith('\\[') && trimmed.endsWith('\\]'))
    ) {
      return trimmed;
    }

    if (trimmed.includes('\\') || trimmed.includes('^') || trimmed.includes('_') || trimmed.includes('{') || trimmed.includes('=')) {
      return `$$${trimmed.replace(/^\$+|\$+$/g, '')}$$`;
    }

    return trimmed;
  }

  return { init, start };
})();

window.AnimationModule = AnimationModule;
