require('dotenv').config();

const cors = require('cors');
const express = require('express');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const Groq = require('groq-sdk');
const engTrainedData = require('@tesseract.js-data/eng');
const vieTrainedData = require('@tesseract.js-data/vie');
const Tesseract = require('tesseract.js');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const WHITEPAPER_PATH = path.join(__dirname, 'WHITEPAPER.md');
const CHANGED_README_PATH = path.join(__dirname, 'changed-readme.md');

const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 30 * 1000;
const RATE_LIMIT_FILE = path.join(__dirname, 'temp.json');

const MODELS = [
  'openai/gpt-oss-120b',
  'llama-3.3-70b-versatile',
  'groq/compound',
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) {
      cb(null, true);
      return;
    }

    cb(new Error('Only image uploads are supported.'));
  },
});

let groqClient = null;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(
  '/mathnote',
  express.static(PUBLIC_DIR, {
    etag: false,
    maxAge: 0,
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    },
  })
);

app.get('/', (_req, res) => res.redirect('/mathnote'));
app.get('/mathnote/whitepaper', (_req, res) => sendMarkdownFile(res, WHITEPAPER_PATH));
app.get('/mathnote/changed-readme', (_req, res) => sendMarkdownFile(res, CHANGED_README_PATH));

function sendMarkdownFile(res, filePath) {
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.sendFile(filePath);
}

function readTimestamps() {
  try {
    const data = fs.readFileSync(RATE_LIMIT_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    return Array.isArray(parsed.solveTimestamps) ? parsed.solveTimestamps : [];
  } catch {
    return [];
  }
}

function writeTimestamps(timestamps) {
  fs.writeFileSync(RATE_LIMIT_FILE, JSON.stringify({ solveTimestamps: timestamps }));
}

function globalSolveLimiter(_req, res, next) {
  const now = Date.now();
  const timestamps = readTimestamps().filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);

  if (timestamps.length >= RATE_LIMIT_MAX) {
    const oldest = timestamps[0];
    const retryAfter = Math.ceil((RATE_LIMIT_WINDOW_MS - (now - oldest)) / 1000);
    console.log(`[RateLimit] Blocked - ${timestamps.length} solves in last 30s`);
    res.status(429).json({
      error: 'Global rate limit reached. Too many solves - please wait a moment.',
      retryAfter,
    });
    return;
  }

  timestamps.push(now);
  writeTimestamps(timestamps);
  next();
}

function getGroqClient() {
  const apiKey = process.env.GROQ_API || process.env.GROQ_API_KEY;

  if (!apiKey) {
    return null;
  }

  if (!groqClient) {
    groqClient = new Groq({ apiKey });
  }

  return groqClient;
}

function ensureGroqConfigured() {
  if (!getGroqClient()) {
    const error = new Error('Missing GROQ_API environment variable.');
    error.statusCode = 503;
    throw error;
  }
}

async function callGroq(messages, options = {}) {
  ensureGroqConfigured();

  const groq = getGroqClient();
  const { temperature = 0.3, jsonMode = false, models = MODELS } = options;
  let lastError = null;

  for (const model of models) {
    try {
      const requestOptions = {
        model,
        messages,
        temperature,
        max_tokens: 4096,
      };

      if (jsonMode) {
        requestOptions.response_format = { type: 'json_object' };
      }

      const response = await groq.chat.completions.create(requestOptions);
      const content = response.choices[0]?.message?.content || '';
      console.log(`[Groq] Success with model: ${model}`);
      return content;
    } catch (error) {
      lastError = error;
      const status = error?.status || error?.statusCode || error?.error?.status;
      console.warn(`[Groq] Model ${model} failed (status: ${status}): ${error.message}`);

      if (status === 429 || (status >= 500 && status < 600)) {
        continue;
      }

      throw error;
    }
  }

  throw lastError || new Error('All models failed');
}

async function callGroqJSON(messages, temperature = 0.3) {
  const raw = await callGroq(messages, { temperature, jsonMode: true });

  try {
    return JSON.parse(raw);
  } catch {
    const fencedJson = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fencedJson) {
      return JSON.parse(fencedJson[1].trim());
    }

    throw new Error('Failed to parse AI response as JSON.');
  }
}

function buildSolverSystemPrompt(lang, classLevel) {
  const langInstruction =
    lang === 'vi'
      ? 'Respond entirely in Vietnamese. Use Vietnamese mathematical terminology.'
      : 'Respond entirely in English.';

  return `You are an expert math tutor. ${langInstruction}
The student is at the level: ${classLevel || 'General'}.

When solving a math problem, you MUST:
1. Break the solution into clear, numbered steps. Use as many or as few steps as the problem naturally requires.
2. For each step, explain why you are doing it and how it works.
3. Show all intermediate work clearly.
4. Use LaTeX notation for all math expressions.
5. Provide animation metadata for visual steps.

CRITICAL MATH FORMATTING RULE:
Whenever you write any mathematical expression or formula in a text field, wrap it with the markers #LATEX and #!LATEX.
Examples:
- "We solve for #LATEX x = 5 #!LATEX" (correct)
- "The quadratic formula is #LATEX x = \\\\frac{-b \\\\pm \\\\sqrt{b^2 - 4ac}}{2a} #!LATEX" (correct)
- "We solve for x = 5" (incorrect)
- "We solve for $x = 5$" (incorrect)
The "math", "result", and "finalAnswer" fields should contain only the LaTeX expression itself with no #LATEX markers.
The "explanation" and "summary" fields must use #LATEX ... #!LATEX for any math inside text.

You MUST respond with a JSON object in this exact format:
{
  "steps": [
    {
      "title": "Short title for this step",
      "explanation": "Why we do this step. Use #LATEX x + 2 = 5 #!LATEX for any math.",
      "math": "x + 2 = 5",
      "result": "x = 3",
      "animation": {
        "type": "none | add_both_sides | subtract_both_sides | multiply_both_sides | divide_both_sides | square_both_sides | root_both_sides | simplify | expand | factor | combine_like_terms",
        "value": "The value being operated with.",
        "latex": "LaTeX for the operation highlight.",
        "text": "Short instruction for the animation."
      }
    }
  ],
  "finalAnswer": "x = 3",
  "summary": "A brief plain-language summary. Use #LATEX x = 3 #!LATEX for any math."
}

Rules:
- The "steps" array must have as many entries as the problem needs.
- All LaTeX backslashes must be properly escaped for JSON.
- Always use #LATEX ... #!LATEX in explanation, summary, and any other text field that contains math.
- The "math", "result", and "finalAnswer" fields contain pure LaTeX only.
- The "math" field should be the starting state of the step, and "result" is the ending state.
- Do not include any text outside the JSON object.`;
}

function buildSolverMessages({ problem, classLevel, lang, history }) {
  return [
    { role: 'system', content: buildSolverSystemPrompt(lang, classLevel) },
    ...(Array.isArray(history) ? history : []),
    { role: 'user', content: `Solve this math problem step by step:\n${problem}` },
  ];
}

async function solveMathProblem({ problem, classLevel, lang, history }) {
  if (!problem) {
    const error = new Error('No problem provided.');
    error.statusCode = 400;
    throw error;
  }

  const parsed = await callGroqJSON(buildSolverMessages({ problem, classLevel, lang, history }));
  console.log('Parsed AI response:', JSON.stringify(parsed).slice(0, 500));

  return {
    solution: {
      steps: Array.isArray(parsed.steps) ? parsed.steps : [],
      finalAnswer: parsed.finalAnswer || parsed.final_answer || '',
      summary: parsed.summary || '',
    },
    rawResponse: JSON.stringify(parsed),
  };
}

function parseHistory(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeOcrText(text) {
  return String(text || '')
    .replace(/\r/g, '\n')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/[×✕]/g, '*')
    .replace(/[÷]/g, '/')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

async function runOcr(buffer, mimeType, lang) {
  const ocrConfig = lang === 'vi' ? vieTrainedData : engTrainedData;
  const result = await Tesseract.recognize(buffer, ocrConfig.code, {
    langPath: ocrConfig.langPath,
    gzip: ocrConfig.gzip,
    logger: (message) => {
      if (message?.status) {
        const progress = typeof message.progress === 'number' ? ` ${Math.round(message.progress * 100)}%` : '';
        console.log(`[OCR] ${message.status}${progress}`);
      }
    },
  });

  const data = result?.data || {};
  const lines = Array.isArray(data.lines)
    ? data.lines
        .map((line) => (line.text || '').trim())
        .filter(Boolean)
    : [];

  return {
    text: normalizeOcrText(data.text || lines.join('\n')),
    confidence: Number.isFinite(data.confidence) ? Number(data.confidence.toFixed(2)) : null,
    lines,
    mimeType,
    language: ocrConfig.code,
  };
}

function sendError(res, error, fallbackMessage) {
  const statusCode = error.statusCode || error.status || 500;
  res.status(statusCode).json({
    error: fallbackMessage,
    details: error.message,
  });
}

app.post('/mathnote/api/solve', globalSolveLimiter, async (req, res) => {
  try {
    const { problem, classLevel, lang, history } = req.body;
    const payload = await solveMathProblem({ problem, classLevel, lang, history });
    res.json(payload);
  } catch (error) {
    console.error('Solve error:', error);
    sendError(res, error, 'Failed to solve problem');
  }
});

app.post('/mathnote/api/ocr', async (req, res) => {
  upload.single('image')(req, res, async (uploadError) => {
    if (uploadError) {
      sendError(res, uploadError, 'Failed to process OCR upload');
      return;
    }

    try {
      if (!req.file?.buffer) {
        const error = new Error('No image provided.');
        error.statusCode = 400;
        throw error;
      }

      const lang = req.body.lang || 'en';
      const ocr = await runOcr(req.file.buffer, req.file.mimetype, lang);

      if (!ocr.text) {
        const error = new Error('The OCR engine could not detect any readable text.');
        error.statusCode = 422;
        throw error;
      }

      const autoSolve = String(req.body.autoSolve).toLowerCase() === 'true';
      if (!autoSolve) {
        res.json({ ocr });
        return;
      }

      const payload = await solveMathProblem({
        problem: ocr.text,
        classLevel: req.body.classLevel,
        lang,
        history: parseHistory(req.body.history),
      });

      res.json({
        ocr,
        ...payload,
      });
    } catch (error) {
      console.error('OCR error:', error);
      sendError(res, error, 'Failed to extract text from image');
    }
  });
});

app.post('/mathnote/api/animate', async (req, res) => {
  try {
    const { problem, steps, lang } = req.body;
    if (!Array.isArray(steps)) {
      res.status(400).json({ error: 'No steps provided' });
      return;
    }

    const langInstruction = lang === 'vi' ? 'Respond entirely in Vietnamese.' : 'Respond entirely in English.';
    const systemPrompt = `You are an animation annotator for a math step-by-step solver. ${langInstruction}
You will receive the already-solved steps of a math problem.
Your only job is to decide what visual animation each step should show.
Do not re-solve the problem. Do not change any math, equations, or explanation text.

For each step, output only the "animation" object and nothing else.

For each step, determine the operation happening. Almost every step should have a meaningful animation type.
Only use "none" if the step is purely descriptive with zero mathematical change.
If unsure, use "simplify" or "combine_like_terms".

COLOR MARKERS for the "latex" field:
  Red:    #COLOR-RED   content   #!COLOR-RED
  Blue:   #COLOR-BLUE  content   #!COLOR-BLUE
  Green:  #COLOR-GREEN content   #!COLOR-GREEN
  Orange: #COLOR-ORANGE content  #!COLOR-ORANGE
  Purple: #COLOR-PURPLE content  #!COLOR-PURPLE

Never use raw \\color or \\textcolor. Only use the #COLOR-X markers.

Return a JSON object with a "steps" array, one entry per input step, each containing only the "animation" field:
{
  "steps": [
    { "animation": { "type": "add_both_sides", "value": "5", "latex": "#COLOR-RED +5 #!COLOR-RED", "text": "Add 5 to both sides" } }
  ]
}

Animation types: none | add_both_sides | subtract_both_sides | multiply_both_sides | divide_both_sides | square_both_sides | root_both_sides | simplify | expand | factor | combine_like_terms`;

    const parsed = await callGroqJSON([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Problem: ${problem}\n\nSteps:\n${JSON.stringify(steps)}` },
    ]);

    const aiSteps = Array.isArray(parsed.steps) ? parsed.steps : [];
    const merged = steps.map((step, index) => ({
      ...step,
      animation: aiSteps[index]?.animation || { type: 'none', value: '', latex: '', text: '' },
    }));

    res.json({ steps: merged });
  } catch (error) {
    console.error('Animate API error:', error);
    sendError(res, error, 'Failed to generate animations');
  }
});

app.post('/mathnote/api/ask_step', async (req, res) => {
  try {
    const { step, problem, question, lang, stepNumber, totalSteps, slideType } = req.body;
    const langInstruction = lang === 'vi' ? 'Respond in Vietnamese.' : 'Respond in English.';

    const stepLabel =
      stepNumber && totalSteps
        ? `Step ${stepNumber} of ${totalSteps}${step?.title ? ` - "${step.title}"` : ''}`
        : step?.title || 'the current step';

    const slideContext =
      slideType === 'action'
        ? 'The student is currently viewing the operation being applied in this step.'
        : slideType === 'equation'
          ? 'The student is currently viewing the equation state for this step.'
          : 'The student is currently viewing the result of this step.';

    const response = await callGroq([
      {
        role: 'system',
        content: `You are a helpful math tutor. ${langInstruction}
The student is solving: ${problem || 'a math problem'}

They are currently on ${stepLabel}.
${slideContext}

Step details:
- Title: ${step?.title || 'N/A'}
- Explanation: ${step?.explanation || 'N/A'}
- Math: ${step?.math || 'N/A'}
- Result: ${step?.result || 'N/A'}

Answer the student's question about this specific step concisely in 1-2 sentences.
When writing any math expression, wrap it with #LATEX and #!LATEX markers. Never use dollar signs for math.`,
      },
      { role: 'user', content: question },
    ]);

    res.json({ answer: response });
  } catch (error) {
    console.error('Ask Step error:', error);
    sendError(res, error, 'Failed to answer question');
  }
});

app.post('/mathnote/api/verify', async (req, res) => {
  try {
    const { problem, solution, lang } = req.body;
    const langInstruction = lang === 'vi' ? 'Respond entirely in Vietnamese.' : 'Respond entirely in English.';

    const parsed = await callGroqJSON(
      [
        {
          role: 'system',
          content: `You are a math verification expert. ${langInstruction}
Your job is to carefully check if a given solution to a math problem is correct.
Go through each step and verify the logic and calculations.

Respond in valid JSON format:
{
  "isCorrect": true,
  "confidence": "high | medium | low",
  "issues": ["list of any issues found"],
  "correctedAnswer": "the correct answer if the original is wrong (in LaTeX)",
  "explanation": "brief explanation of your verification"
}

Do not include any text outside the JSON object.`,
        },
        {
          role: 'user',
          content: `Problem: ${problem}\n\nProposed Solution:\n${JSON.stringify(solution)}\n\nPlease verify if this solution is correct.`,
        },
      ],
      0.1
    );

    res.json({ verification: parsed });
  } catch (error) {
    console.error('Verify error:', error);
    sendError(res, error, 'Failed to verify solution');
  }
});

app.post('/mathnote/api/explain', async (req, res) => {
  try {
    const { step, history, lang, classLevel } = req.body;
    const langInstruction =
      lang === 'vi'
        ? 'Respond entirely in Vietnamese. Use simple Vietnamese.'
        : 'Respond entirely in English. Use simple, clear language.';

    const explanation = await callGroq([
      {
        role: 'system',
        content: `You are a patient math tutor explaining a concept to a ${classLevel || 'general'} level student. ${langInstruction}
Explain the given step in the simplest possible terms. Use analogies and examples if helpful.
When writing any math expression, wrap it with #LATEX and #!LATEX markers. Never use dollar signs for math.
Keep it concise but thorough.`,
      },
      ...(Array.isArray(history) ? history : []),
      {
        role: 'user',
        content: `Please explain this step in simple terms so I can understand:\n\n${JSON.stringify(step)}`,
      },
    ]);

    res.json({ explanation });
  } catch (error) {
    console.error('Explain error:', error);
    sendError(res, error, 'Failed to explain step');
  }
});

app.post('/mathnote/api/graph-solve', globalSolveLimiter, async (req, res) => {
  try {
    const { equation, points, degree, question, graphContext, lang, classLevel } = req.body;
    let problemText = '';

    if (graphContext) {
      problemText += `Current graph state:\n${graphContext}\n\n`;
    }

    if (question) {
      problemText += `User question: ${question}`;
    } else if (equation) {
      problemText += `Analyze this equation for graphing: ${equation}
Find key features like intercepts, vertex or critical points, domain, range, and asymptotes if applicable.`;
    } else if (Array.isArray(points) && points.length > 0) {
      const pointsString = points.map((point) => `(${point.x}, ${point.y})`).join(', ');
      problemText += `Given these points: ${pointsString}
The polynomial degree is ${degree || 'to be determined'}.
Find the equation that fits these points and analyze its key features.`;
    } else {
      res.status(400).json({ error: 'No equation, points, or question provided' });
      return;
    }

    const parsed = await callGroqJSON(buildSolverMessages({ problem: problemText, classLevel, lang, history: [] }));
    res.json({
      graphAnalysis: {
        steps: Array.isArray(parsed.steps) ? parsed.steps : [],
        finalAnswer: parsed.finalAnswer || parsed.final_answer || '',
        summary: parsed.summary || '',
      },
    });
  } catch (error) {
    console.error('Graph solve error:', error);
    sendError(res, error, 'Failed to analyze graph');
  }
});

app.listen(PORT, () => {
  console.log(`Mathnote server running on http://localhost:${PORT}/mathnote`);
});
