require('dotenv').config();

const cors = require('cors');
const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const { Document, Packer, Paragraph, TextRun } = require('docx');
const mammoth = require('mammoth');
const { MongoClient, ObjectId } = require('mongodb');
const pdf = require('pdf-parse');
const PDFDocument = require('pdfkit');
const engTrainedData = require('@tesseract.js-data/eng');
const vieTrainedData = require('@tesseract.js-data/vie');
const Tesseract = require('tesseract.js');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const WHITEPAPER_PATH = path.join(__dirname, 'WHITEPAPER.md');
const CHANGED_README_PATH = path.join(__dirname, 'changed-readme.md');
const CONTENT_DIR = path.join(__dirname, 'content');
const EDITABLE_PAGES = {
  whitepaper: {
    title: 'Mathnote Whitepaper',
    sourcePath: WHITEPAPER_PATH,
    htmlPath: path.join(CONTENT_DIR, 'whitepaper.html'),
  },
  changelog: {
    title: 'Mathnote Change Log',
    sourcePath: CHANGED_README_PATH,
    htmlPath: path.join(CONTENT_DIR, 'changelog.html'),
  },
};

const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 30 * 1000;
const RATE_LIMIT_FILE = path.join(__dirname, 'temp.json');
const AUTH_COOKIE_NAME = 'mathnote_auth';
const AUTH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const CAPTCHA_TTL_MS = 5 * 60 * 1000;
const PASSWORD_ITERATIONS = 120000;
const PASSWORD_KEY_LENGTH = 64;
const PASSWORD_DIGEST = 'sha512';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mathnote';
const MONGODB_DB = process.env.MONGODB_DB || 'mathnote';
const MONGODB_TLS_ALLOW_INVALID_CERTIFICATES =
  String(process.env.MONGODB_TLS_ALLOW_INVALID_CERTIFICATES || '').toLowerCase() === 'true';

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

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

const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 12 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimeTypes = new Set([
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]);
    const ext = path.extname(file.originalname || '').toLowerCase();

    if (allowedMimeTypes.has(file.mimetype) || ext === '.pdf' || ext === '.docx') {
      cb(null, true);
      return;
    }

    cb(new Error('Only PDF and DOCX uploads are supported.'));
  },
});

let mongoClient = null;
let usersCollection = null;
let savedProblemsCollection = null;
let solveHistoryCollection = null;
const captchaStore = new Map();

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
app.get('/mathnote/whitepaper', (req, res) => sendEditablePage(req, res, 'whitepaper'));
app.get('/mathnote/changed-readme', (req, res) => sendEditablePage(req, res, 'changelog'));
app.get('/mathnote/admin', (req, res) => sendAdminDashboard(req, res));

async function getUsersCollection() {
  if (usersCollection) {
    return usersCollection;
  }

  try {
    mongoClient = new MongoClient(MONGODB_URI, getMongoClientOptions());
    await mongoClient.connect();
    const db = mongoClient.db(MONGODB_DB);
    usersCollection = db.collection('users');
    await usersCollection.createIndex({ email: 1 }, { unique: true });
    return usersCollection;
  } catch (error) {
    mongoClient = null;
    throw normalizeDatabaseError(error);
  }
}

function getMongoClientOptions() {
  const options = { serverSelectionTimeoutMS: 5000 };

  if (MONGODB_TLS_ALLOW_INVALID_CERTIFICATES) {
    options.tlsAllowInvalidCertificates = true;
  }

  return options;
}

function normalizeDatabaseError(error) {
  const message = String(error?.message || '');
  const isTlsError = /ssl|tls|certificate|openssl|alert/i.test(message);
  const isConnectionError =
    isTlsError || /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|server selection|querySrv|authentication/i.test(message);

  if (!isConnectionError) {
    return error;
  }

  const normalized = new Error(
    isTlsError
      ? 'Database TLS connection failed. Check MONGODB_URI, Atlas network access, and TLS settings.'
      : 'Database connection failed. Check MONGODB_URI and MongoDB network access.'
  );
  normalized.statusCode = 503;
  normalized.cause = error;
  return normalized;
}

async function getSavedProblemsCollection() {
  if (savedProblemsCollection) {
    return savedProblemsCollection;
  }

  if (!mongoClient) {
    await getUsersCollection();
  }

  const db = mongoClient.db(MONGODB_DB);
  savedProblemsCollection = db.collection('savedProblems');
  await savedProblemsCollection.createIndex({ userId: 1, createdAt: -1 });
  return savedProblemsCollection;
}

async function getSolveHistoryCollection() {
  if (solveHistoryCollection) {
    return solveHistoryCollection;
  }

  if (!mongoClient) {
    await getUsersCollection();
  }

  const db = mongoClient.db(MONGODB_DB);
  solveHistoryCollection = db.collection('solveHistory');
  await solveHistoryCollection.createIndex({ userId: 1, createdAt: -1 });
  return solveHistoryCollection;
}

function getAuthSecret() {
  return process.env.AUTH_SECRET || process.env.SESSION_SECRET || 'mathnote-dev-secret-change-me';
}

function parseCookies(req) {
  return String(req.headers.cookie || '')
    .split(';')
    .map((cookie) => cookie.trim())
    .filter(Boolean)
    .reduce((cookies, cookie) => {
      const separatorIndex = cookie.indexOf('=');
      if (separatorIndex === -1) {
        return cookies;
      }

      const key = decodeURIComponent(cookie.slice(0, separatorIndex));
      const value = decodeURIComponent(cookie.slice(separatorIndex + 1));
      cookies[key] = value;
      return cookies;
    }, {});
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64url');
}

function base64UrlDecode(value) {
  return Buffer.from(value, 'base64url').toString('utf-8');
}

function sign(value) {
  return crypto.createHmac('sha256', getAuthSecret()).update(value).digest('base64url');
}

function createAuthToken(user) {
  const payload = base64UrlEncode(
    JSON.stringify({
      sub: String(user._id),
      email: user.email,
      name: user.name,
      role: user.role || 'user',
      exp: Date.now() + AUTH_MAX_AGE_MS,
    })
  );
  return `${payload}.${sign(payload)}`;
}

function verifyAuthToken(token) {
  if (!token || !token.includes('.')) {
    return null;
  }

  const [payload, signature] = token.split('.');
  if (!payload || !signature || signature !== sign(payload)) {
    return null;
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(payload));
    if (!parsed.sub || !parsed.exp || parsed.exp < Date.now()) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function setAuthCookie(res, user) {
  const token = createAuthToken(user);
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/mathnote; Max-Age=${Math.floor(
      AUTH_MAX_AGE_MS / 1000
    )}${secure}`
  );
}

function clearAuthCookie(res) {
  res.setHeader('Set-Cookie', `${AUTH_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/mathnote; Max-Age=0`);
}

function getAuthUser(req) {
  const token = parseCookies(req)[AUTH_COOKIE_NAME];
  return verifyAuthToken(token);
}

function requireAuth(req, res, next) {
  const user = getAuthUser(req);
  if (!user) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  const user = getAuthUser(req);
  if (!user) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  if (user.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required.' });
    return;
  }

  req.user = user;
  next();
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function validatePassword(password) {
  return typeof password === 'string' && password.length >= 8;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('base64url')) {
  const hash = crypto
    .pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, PASSWORD_KEY_LENGTH, PASSWORD_DIGEST)
    .toString('base64url');
  return `${PASSWORD_ITERATIONS}:${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [iterationsRaw, salt, hash] = String(storedHash || '').split(':');
  const iterations = Number(iterationsRaw);
  if (!iterations || !salt || !hash) {
    return false;
  }

  const candidate = crypto.pbkdf2Sync(password, salt, iterations, PASSWORD_KEY_LENGTH, PASSWORD_DIGEST);
  const expected = Buffer.from(hash, 'base64url');
  return expected.length === candidate.length && crypto.timingSafeEqual(expected, candidate);
}

function pruneCaptchas() {
  const now = Date.now();
  for (const [id, captcha] of captchaStore.entries()) {
    if (captcha.expiresAt < now) {
      captchaStore.delete(id);
    }
  }
}

function createCaptcha() {
  pruneCaptchas();
  const left = crypto.randomInt(2, 10);
  const right = crypto.randomInt(2, 10);
  const operations = [
    { symbol: '+', answer: left + right },
    { symbol: 'x', answer: left * right },
    { symbol: '-', answer: Math.max(left, right) - Math.min(left, right), left: Math.max(left, right), right: Math.min(left, right) },
  ];
  const selected = operations[crypto.randomInt(0, operations.length)];
  const id = crypto.randomUUID();
  captchaStore.set(id, {
    answer: String(selected.answer),
    expiresAt: Date.now() + CAPTCHA_TTL_MS,
  });

  return {
    id,
    question: `${selected.left || left} ${selected.symbol} ${selected.right || right} = ?`,
  };
}

function verifyCaptcha(captchaId, captchaAnswer) {
  pruneCaptchas();
  const captcha = captchaStore.get(String(captchaId || ''));
  captchaStore.delete(String(captchaId || ''));
  return Boolean(captcha && captcha.answer === String(captchaAnswer || '').trim());
}

app.get('/mathnote/api/captcha', (_req, res) => {
  res.json({ captcha: createCaptcha() });
});

app.get('/mathnote/api/me', (req, res) => {
  const user = getAuthUser(req);
  res.json({
    authenticated: Boolean(user),
    user: user ? { id: user.sub, email: user.email, name: user.name, role: user.role || 'user' } : null,
  });
});

app.post('/mathnote/api/signup', async (req, res) => {
  try {
    const { name, email, password, captchaId, captchaAnswer } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!verifyCaptcha(captchaId, captchaAnswer)) {
      res.status(400).json({ error: 'Invalid captcha.' });
      return;
    }

    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      res.status(400).json({ error: 'Please enter a valid email.' });
      return;
    }

    if (!validatePassword(password)) {
      res.status(400).json({ error: 'Password must be at least 8 characters.' });
      return;
    }

    const users = await getUsersCollection();
    const user = {
      name: String(name || '').trim() || normalizedEmail.split('@')[0],
      email: normalizedEmail,
      passwordHash: hashPassword(password),
      role: 'user',
      createdAt: new Date(),
    };

    const result = await users.insertOne(user);
    user._id = result.insertedId;
    setAuthCookie(res, user);
    res.status(201).json({ user: { id: String(user._id), email: user.email, name: user.name, role: user.role } });
  } catch (error) {
    if (error.code === 11000) {
      res.status(409).json({ error: 'This email is already registered.' });
      return;
    }

    console.error('Signup error:', error);
    sendError(res, error, 'Failed to create account');
  }
});

app.post('/mathnote/api/login', async (req, res) => {
  try {
    const { email, password, captchaId, captchaAnswer } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!verifyCaptcha(captchaId, captchaAnswer)) {
      res.status(400).json({ error: 'Invalid captcha.' });
      return;
    }

    const users = await getUsersCollection();
    const user = await users.findOne({ email: normalizedEmail });

    if (!user || !verifyPassword(password, user.passwordHash)) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    setAuthCookie(res, user);
    res.json({ user: { id: String(user._id), email: user.email, name: user.name, role: user.role || 'user' } });
  } catch (error) {
    console.error('Login error:', error);
    sendError(res, error, 'Failed to log in');
  }
});

app.post('/mathnote/api/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

app.post('/mathnote/api/account/password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!validatePassword(newPassword)) {
      res.status(400).json({ error: 'New password must be at least 8 characters.' });
      return;
    }

    const users = await getUsersCollection();
    const user = await users.findOne({ _id: new ObjectId(req.user.sub) });
    if (!user || !verifyPassword(currentPassword, user.passwordHash)) {
      res.status(401).json({ error: 'Current password is incorrect.' });
      return;
    }

    await users.updateOne(
      { _id: user._id },
      {
        $set: {
          passwordHash: hashPassword(newPassword),
          updatedAt: new Date(),
        },
      }
    );

    res.json({ ok: true });
  } catch (error) {
    console.error('Change password error:', error);
    sendError(res, error, 'Failed to change password');
  }
});

app.get('/mathnote/api/admin/users', requireAdmin, async (_req, res) => {
  try {
    const users = await getUsersCollection();
    const items = await users
      .find({}, { projection: { passwordHash: 0 } })
      .sort({ createdAt: -1 })
      .limit(500)
      .toArray();

    res.json({
      users: items.map((user) => ({
        id: String(user._id),
        name: user.name || '',
        email: user.email || '',
        role: user.role || 'user',
        createdAt: user.createdAt ? user.createdAt.toLocaleString() : '',
        updatedAt: user.updatedAt ? user.updatedAt.toLocaleString() : '',
      })),
    });
  } catch (error) {
    console.error('Admin users error:', error);
    sendError(res, error, 'Failed to load users');
  }
});

app.post('/mathnote/api/admin/users/:id/password', requireAdmin, async (req, res) => {
  try {
    const { password } = req.body;
    if (!validatePassword(password)) {
      res.status(400).json({ error: 'Password must be at least 8 characters.' });
      return;
    }

    let userId;
    try {
      userId = new ObjectId(req.params.id);
    } catch {
      res.status(400).json({ error: 'Invalid user id.' });
      return;
    }

    const users = await getUsersCollection();
    const result = await users.updateOne(
      { _id: userId },
      {
        $set: {
          passwordHash: hashPassword(password),
          updatedAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Admin reset password error:', error);
    sendError(res, error, 'Failed to reset password');
  }
});

app.get('/mathnote/api/history', requireAuth, async (req, res) => {
  try {
    const history = await getSolveHistoryCollection();
    const items = await history
      .find({ userId: req.user.sub })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();

    res.json({
      history: items.map((item) => ({
        id: String(item._id),
        problem: item.problem,
        problemText: item.problemText,
        solution: item.solution,
        classLevel: item.classLevel || '',
        source: item.source || 'solver',
        date: item.createdAt ? item.createdAt.toLocaleString() : '',
        lang: item.lang || 'en',
      })),
    });
  } catch (error) {
    console.error('History error:', error);
    sendError(res, error, 'Failed to load history');
  }
});

app.delete('/mathnote/api/history/:id', requireAuth, async (req, res) => {
  try {
    let id;
    try {
      id = new ObjectId(req.params.id);
    } catch {
      res.status(400).json({ error: 'Invalid history id.' });
      return;
    }

    const history = await getSolveHistoryCollection();
    const result = await history.deleteOne({ _id: id, userId: req.user.sub });
    if (result.deletedCount === 0) {
      res.status(404).json({ error: 'History item not found.' });
      return;
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Delete history error:', error);
    sendError(res, error, 'Failed to delete history item');
  }
});

app.get('/mathnote/api/saved', requireAuth, async (req, res) => {
  try {
    const savedProblems = await getSavedProblemsCollection();
    const items = await savedProblems
      .find({ userId: req.user.sub })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();

    res.json({
      saved: items.map((item) => ({
        id: String(item._id),
        problem: item.problem,
        problemText: item.problemText,
        solution: item.solution,
        classLevel: item.classLevel || '',
        source: item.source || 'solver',
        date: item.createdAt ? item.createdAt.toLocaleString() : '',
        lang: item.lang || 'en',
      })),
    });
  } catch (error) {
    console.error('List saved error:', error);
    sendError(res, error, 'Failed to load saved problems');
  }
});

app.post('/mathnote/api/saved', requireAuth, async (req, res) => {
  try {
    const { problem, problemText, solution, classLevel, source, lang } = req.body;
    if (!problem || !solution) {
      res.status(400).json({ error: 'A problem and solution are required.' });
      return;
    }

    const savedProblems = await getSavedProblemsCollection();
    const item = {
      userId: req.user.sub,
      problem: String(problem).slice(0, 12000),
      problemText: String(problemText || problem).slice(0, 30000),
      solution,
      classLevel: String(classLevel || '').slice(0, 120),
      source: String(source || 'solver').slice(0, 40),
      lang: String(lang || 'en').slice(0, 12),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await savedProblems.insertOne(item);
    res.status(201).json({
      saved: {
        id: String(result.insertedId),
        problem: item.problem,
        problemText: item.problemText,
        solution: item.solution,
        classLevel: item.classLevel,
        source: item.source,
        date: item.createdAt.toLocaleString(),
        lang: item.lang,
      },
    });
  } catch (error) {
    console.error('Save problem error:', error);
    sendError(res, error, 'Failed to save problem');
  }
});

app.delete('/mathnote/api/saved/:id', requireAuth, async (req, res) => {
  try {
    let id;
    try {
      id = new ObjectId(req.params.id);
    } catch {
      res.status(400).json({ error: 'Invalid saved problem id.' });
      return;
    }

    const savedProblems = await getSavedProblemsCollection();
    const result = await savedProblems.deleteOne({ _id: id, userId: req.user.sub });
    if (result.deletedCount === 0) {
      res.status(404).json({ error: 'Saved problem not found.' });
      return;
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Delete saved error:', error);
    sendError(res, error, 'Failed to delete saved problem');
  }
});

app.put('/mathnote/api/pages/:page', requireAdmin, (req, res) => {
  try {
    const page = getEditablePage(req.params.page);
    if (!page) {
      res.status(404).json({ error: 'Editable page not found.' });
      return;
    }

    const html = String(req.body?.html || '').trim();
    if (!html) {
      res.status(400).json({ error: 'HTML content is required.' });
      return;
    }

    if (Buffer.byteLength(html, 'utf-8') > 500 * 1024) {
      res.status(413).json({ error: 'Page content is too large.' });
      return;
    }

    ensureContentDir();
    fs.writeFileSync(page.htmlPath, html, 'utf-8');
    res.json({ ok: true });
  } catch (error) {
    console.error('Save editable page error:', error);
    sendError(res, error, 'Failed to save page');
  }
});

app.get('/mathnote/api/pages/:page', requireAdmin, (req, res) => {
  try {
    const page = getEditablePage(req.params.page);
    if (!page) {
      res.status(404).json({ error: 'Editable page not found.' });
      return;
    }

    res.json({
      title: page.title,
      html: readEditablePageHtml(page),
    });
  } catch (error) {
    console.error('Read editable page error:', error);
    sendError(res, error, 'Failed to load page');
  }
});

function ensureContentDir() {
  if (!fs.existsSync(CONTENT_DIR)) {
    fs.mkdirSync(CONTENT_DIR, { recursive: true });
  }
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function inlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

function markdownToHtml(markdown) {
  const lines = String(markdown || '').split(/\r?\n/);
  const html = [];
  let listOpen = false;
  let paragraph = [];

  function flushParagraph() {
    if (paragraph.length > 0) {
      html.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`);
      paragraph = [];
    }
  }

  function closeList() {
    if (listOpen) {
      html.push('</ol>');
      listOpen = false;
    }
  }

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      closeList();
      return;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = Math.min(heading[1].length, 4);
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      return;
    }

    const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      if (!listOpen) {
        html.push('<ol>');
        listOpen = true;
      }
      html.push(`<li>${inlineMarkdown(ordered[1])}</li>`);
      return;
    }

    paragraph.push(trimmed);
  });

  flushParagraph();
  closeList();
  return html.join('\n');
}

function getEditablePage(pageName) {
  if (pageName === 'changed-readme') {
    return EDITABLE_PAGES.changelog;
  }

  return EDITABLE_PAGES[pageName] || null;
}

function readEditablePageHtml(page) {
  ensureContentDir();

  if (!fs.existsSync(page.htmlPath)) {
    const markdown = fs.existsSync(page.sourcePath) ? fs.readFileSync(page.sourcePath, 'utf-8') : `# ${page.title}`;
    fs.writeFileSync(page.htmlPath, markdownToHtml(markdown), 'utf-8');
  }

  return fs.readFileSync(page.htmlPath, 'utf-8');
}

function sendEditablePage(req, res, pageName) {
  const page = getEditablePage(pageName);
  if (!page) {
    res.status(404).send('Page not found');
    return;
  }

  const viewer = getAuthUser(req);
  const isAdmin = viewer?.role === 'admin';
  const content = readEditablePageHtml(page);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(page.title)} | Mathnote</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #08111f;
        --panel: rgba(11, 25, 46, 0.82);
        --border: rgba(122, 174, 255, 0.18);
        --text: #f4f7fb;
        --muted: #b7c8dd;
        --accent: #58a6ff;
        --accent-2: #49dea0;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Arial, sans-serif;
        background:
          radial-gradient(circle at top left, rgba(88, 166, 255, 0.16), transparent 32%),
          radial-gradient(circle at 82% 20%, rgba(73, 222, 160, 0.13), transparent 28%),
          var(--bg);
        color: var(--text);
        line-height: 1.65;
      }
      .topbar {
        position: sticky;
        top: 0;
        z-index: 10;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 16px clamp(18px, 4vw, 48px);
        background: rgba(7, 17, 31, 0.86);
        border-bottom: 1px solid var(--border);
        backdrop-filter: blur(16px);
      }
      .brand { display: flex; align-items: center; gap: 12px; font-weight: 800; font-size: 22px; }
      .brand-icon {
        display: inline-grid;
        place-items: center;
        width: 42px;
        height: 42px;
        border-radius: 12px;
        color: #08111f;
        background: linear-gradient(135deg, #58a6ff, #5de4c7 52%, #ffd166);
      }
      .nav { display: flex; gap: 10px; flex-wrap: wrap; }
      .nav a, .toolbar button {
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 10px 14px;
        color: var(--text);
        background: rgba(88, 166, 255, 0.08);
        text-decoration: none;
        cursor: pointer;
        font: inherit;
      }
      .toolbar button.primary {
        color: #08111f;
        background: linear-gradient(135deg, #58a6ff, #5de4c7 52%, #ffd166);
        font-weight: 700;
      }
      .toolbar button:disabled { opacity: 0.6; cursor: not-allowed; }
      .wrap {
        width: min(920px, calc(100% - 32px));
        margin: 32px auto 72px;
      }
      .doc {
        padding: clamp(22px, 4vw, 42px);
        border: 1px solid var(--border);
        border-radius: 20px;
        background: var(--panel);
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.28);
      }
      .doc[contenteditable="true"] {
        outline: 3px solid rgba(73, 222, 160, 0.25);
        background: rgba(13, 32, 57, 0.94);
      }
      h1, h2, h3 { line-height: 1.2; }
      h1 { font-size: clamp(2rem, 5vw, 3.3rem); }
      h2 { margin-top: 2rem; color: var(--accent-2); }
      h3 { margin-top: 1.5rem; color: var(--accent); }
      a { color: #7cc2ff; }
      code {
        padding: 2px 5px;
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.08);
      }
      li { margin: 6px 0; }
      .status { min-height: 24px; color: var(--muted); }
      @media (max-width: 700px) {
        .topbar { align-items: flex-start; flex-direction: column; }
      }
    </style>
  </head>
  <body>
    <header class="topbar">
      <div class="brand"><span class="brand-icon">Σ</span><span>${escapeHtml(page.title)}</span></div>
      <nav class="nav">
        <a href="/mathnote">Mathnote</a>
        <a href="/mathnote/whitepaper">Whitepaper</a>
        <a href="/mathnote/changed-readme">Change Log</a>
      </nav>
      ${
        isAdmin
          ? `<div class="toolbar">
              <button id="editBtn" type="button">Edit</button>
              <button id="saveBtn" class="primary" type="button" disabled>Save</button>
            </div>`
          : ''
      }
    </header>
    <main class="wrap">
      <article class="doc" id="editableDoc">${content}</article>
      <p class="status" id="status">${isAdmin ? 'Admin mode: click Edit to update this HTML page.' : ''}</p>
    </main>
    ${
      isAdmin
        ? `<script>
            const doc = document.getElementById('editableDoc');
            const editBtn = document.getElementById('editBtn');
            const saveBtn = document.getElementById('saveBtn');
            const statusEl = document.getElementById('status');
            let editing = false;

            editBtn.addEventListener('click', () => {
              editing = !editing;
              doc.contentEditable = editing ? 'true' : 'false';
              editBtn.textContent = editing ? 'Stop editing' : 'Edit';
              saveBtn.disabled = !editing;
              statusEl.textContent = editing ? 'Editing enabled. Save when you are done.' : 'Editing paused.';
              if (editing) doc.focus();
            });

            saveBtn.addEventListener('click', async () => {
              saveBtn.disabled = true;
              statusEl.textContent = 'Saving...';
              try {
                const response = await fetch('/mathnote/api/pages/${pageName}', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ html: doc.innerHTML }),
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.details || data.error || 'Save failed');
                statusEl.textContent = 'Saved.';
              } catch (error) {
                statusEl.textContent = error.message;
              } finally {
                saveBtn.disabled = !editing;
              }
            });
          </script>`
        : ''
    }
  </body>
</html>`);
}

function sendAdminDashboard(req, res) {
  const viewer = getAuthUser(req);
  if (!viewer) {
    res.redirect('/mathnote');
    return;
  }

  if (viewer.role !== 'admin') {
    res.status(403).send('Admin access required.');
    return;
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Admin Dashboard | Mathnote</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #08111f;
        --panel: rgba(11, 25, 46, 0.86);
        --border: rgba(122, 174, 255, 0.2);
        --text: #f4f7fb;
        --muted: #b7c8dd;
        --accent: #58a6ff;
        --accent-2: #49dea0;
        --danger: #ff7a7a;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Arial, sans-serif;
        background:
          radial-gradient(circle at top left, rgba(88, 166, 255, 0.16), transparent 32%),
          radial-gradient(circle at 80% 20%, rgba(73, 222, 160, 0.14), transparent 28%),
          var(--bg);
        color: var(--text);
      }
      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 18px clamp(18px, 4vw, 48px);
        background: rgba(7, 17, 31, 0.88);
        border-bottom: 1px solid var(--border);
        position: sticky;
        top: 0;
        z-index: 2;
      }
      a, button, select {
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 10px 14px;
        color: var(--text);
        background: rgba(88, 166, 255, 0.08);
        text-decoration: none;
        font: inherit;
      }
      button { cursor: pointer; }
      button.primary {
        color: #08111f;
        background: linear-gradient(135deg, #58a6ff, #5de4c7 52%, #ffd166);
        font-weight: 700;
      }
      main {
        width: min(1180px, calc(100% - 32px));
        margin: 28px auto 64px;
        display: grid;
        gap: 20px;
      }
      .grid {
        display: grid;
        grid-template-columns: minmax(320px, 0.8fr) minmax(360px, 1.2fr);
        gap: 20px;
      }
      section {
        padding: 22px;
        border: 1px solid var(--border);
        border-radius: 18px;
        background: var(--panel);
      }
      h1, h2 { margin-top: 0; }
      .muted { color: var(--muted); }
      table { width: 100%; border-collapse: collapse; }
      th, td { padding: 10px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; }
      input, textarea {
        width: 100%;
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 12px;
        color: var(--text);
        background: rgba(7, 18, 35, 0.94);
        font: inherit;
      }
      textarea {
        min-height: 520px;
        resize: vertical;
        font-family: Consolas, monospace;
      }
      .row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
      .status { min-height: 24px; color: var(--muted); }
      .danger { color: var(--danger); }
      @media (max-width: 900px) {
        header, .grid { grid-template-columns: 1fr; flex-direction: column; align-items: flex-start; }
      }
    </style>
  </head>
  <body>
    <header>
      <div>
        <h1>Mathnote Admin</h1>
        <div class="muted">${escapeHtml(viewer.email)} · ${escapeHtml(viewer.role)}</div>
      </div>
      <nav class="row">
        <a href="/mathnote">App</a>
        <a href="/mathnote/whitepaper">Whitepaper</a>
        <a href="/mathnote/changed-readme">Change Log</a>
      </nav>
    </header>
    <main>
      <div class="grid">
        <section>
          <h2>Users</h2>
          <p class="muted">View accounts and reset passwords.</p>
          <div id="usersStatus" class="status">Loading users...</div>
          <table>
            <thead>
              <tr><th>User</th><th>Role</th><th>Action</th></tr>
            </thead>
            <tbody id="usersBody"></tbody>
          </table>
        </section>
        <section>
          <h2>Editable Pages</h2>
          <div class="row">
            <select id="pageSelect">
              <option value="whitepaper">Whitepaper</option>
              <option value="changelog">Change Log</option>
            </select>
            <button id="loadPageBtn" type="button">Load</button>
            <button id="savePageBtn" class="primary" type="button">Save</button>
          </div>
          <p class="muted">Edit page HTML directly. This is the same content shown in the top navigation links.</p>
          <textarea id="pageEditor" spellcheck="false"></textarea>
          <div id="pageStatus" class="status"></div>
        </section>
      </div>
    </main>
    <script>
      const usersBody = document.getElementById('usersBody');
      const usersStatus = document.getElementById('usersStatus');
      const pageSelect = document.getElementById('pageSelect');
      const pageEditor = document.getElementById('pageEditor');
      const pageStatus = document.getElementById('pageStatus');

      async function loadUsers() {
        usersStatus.textContent = 'Loading users...';
        const response = await fetch('/mathnote/api/admin/users');
        const data = await response.json();
        if (!response.ok) throw new Error(data.details || data.error || 'Failed to load users');
        usersBody.innerHTML = data.users.map((user) => \`
          <tr>
            <td><strong>\${escapeHtml(user.name || user.email)}</strong><br><span class="muted">\${escapeHtml(user.email)}</span><br><span class="muted">\${escapeHtml(user.createdAt || '')}</span></td>
            <td>\${escapeHtml(user.role)}</td>
            <td><button type="button" data-reset="\${user.id}">Reset password</button></td>
          </tr>
        \`).join('');
        usersStatus.textContent = \`\${data.users.length} users\`;
        usersBody.querySelectorAll('[data-reset]').forEach((button) => {
          button.addEventListener('click', async () => {
            const password = prompt('New password (min 8 characters):');
            if (!password) return;
            const response = await fetch(\`/mathnote/api/admin/users/\${button.dataset.reset}/password\`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ password }),
            });
            const data = await response.json();
            if (!response.ok) {
              alert(data.details || data.error || 'Reset failed');
              return;
            }
            alert('Password reset.');
          });
        });
      }

      async function loadPage() {
        pageStatus.textContent = 'Loading page...';
        const response = await fetch(\`/mathnote/api/pages/\${pageSelect.value}\`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.details || data.error || 'Failed to load page');
        pageEditor.value = data.html;
        pageStatus.textContent = \`Loaded \${data.title}\`;
      }

      async function savePage() {
        pageStatus.textContent = 'Saving...';
        const response = await fetch(\`/mathnote/api/pages/\${pageSelect.value}\`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ html: pageEditor.value }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.details || data.error || 'Failed to save page');
        pageStatus.textContent = 'Saved.';
      }

      function escapeHtml(value) {
        return String(value || '').replace(/[&<>"']/g, (char) => ({
          '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        }[char]));
      }

      document.getElementById('loadPageBtn').addEventListener('click', () => loadPage().catch((error) => pageStatus.textContent = error.message));
      document.getElementById('savePageBtn').addEventListener('click', () => savePage().catch((error) => pageStatus.textContent = error.message));
      pageSelect.addEventListener('change', () => loadPage().catch((error) => pageStatus.textContent = error.message));
      loadUsers().catch((error) => usersStatus.textContent = error.message);
      loadPage().catch((error) => pageStatus.textContent = error.message);
    </script>
  </body>
</html>`);
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

function getGeminiApiKey() {
  return process.env.GEMINI_API_KEY || process.env.GEMINI_API;
}

function ensureGeminiConfigured() {
  if (!getGeminiApiKey()) {
    const error = new Error('Missing GEMINI_API_KEY environment variable.');
    error.statusCode = 503;
    throw error;
  }
}

function toGeminiContents(messages) {
  const systemParts = [];
  const contents = [];

  messages.forEach((message) => {
    if (message.role === 'system') {
      systemParts.push({ text: message.content });
      return;
    }

    contents.push({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(message.content || '') }],
    });
  });

  return { systemParts, contents };
}

async function callGemini(messages, options = {}) {
  ensureGeminiConfigured();

  const { temperature = 0.3, jsonMode = false, model = GEMINI_MODEL } = options;
  const { systemParts, contents } = toGeminiContents(messages);
  const url = `${GEMINI_API_BASE_URL}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(
    getGeminiApiKey()
  )}`;

  const requestBody = {
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens: 4096,
      ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
    },
  };

  if (systemParts.length > 0) {
    requestBody.systemInstruction = { parts: systemParts };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error?.message || 'Gemini API request failed.');
    error.status = response.status;
    throw error;
  }

  const content =
    data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || '')
      .join('')
      .trim() || '';

  if (!content) {
    throw new Error('Gemini returned an empty response.');
  }

  console.log(`[Gemini] Success with model: ${model}`);
  return content;
}

async function callGeminiJSON(messages, temperature = 0.3) {
  const raw = await callGemini(messages, { temperature, jsonMode: true });

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

  const parsed = await callGeminiJSON(buildSolverMessages({ problem, classLevel, lang, history }));
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

function normalizeDocumentText(text) {
  return String(text || '')
    .replace(/\r/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

async function extractDocumentText(file) {
  const ext = path.extname(file.originalname || '').toLowerCase();

  if (file.mimetype === 'application/pdf' || ext === '.pdf') {
    const result = await pdf(file.buffer);
    return normalizeDocumentText(result.text);
  }

  if (
    file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext === '.docx'
  ) {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return normalizeDocumentText(result.value);
  }

  const error = new Error('Only PDF and DOCX uploads are supported.');
  error.statusCode = 400;
  throw error;
}

function stripSolutionMarkers(text) {
  return String(text || '')
    .replace(/#LATEX\s*([\s\S]*?)\s*#!LATEX/g, '$1')
    .replace(/#COLOR-[A-Z]+\s*([\s\S]*?)\s*#!COLOR-[A-Z]+/g, '$1')
    .replace(/\$\$?([^$]+)\$\$?/g, '$1')
    .trim();
}

function solutionToLines(problem, solution) {
  const lines = ['Mathnote detailed solution', ''];

  if (problem) {
    lines.push('Problem');
    lines.push(stripSolutionMarkers(problem));
    lines.push('');
  }

  if (Array.isArray(solution?.steps)) {
    solution.steps.forEach((step, index) => {
      lines.push(`Step ${index + 1}: ${stripSolutionMarkers(step.title || '') || `Step ${index + 1}`}`);
      if (step.explanation) {
        lines.push(stripSolutionMarkers(step.explanation));
      }
      if (step.math) {
        lines.push(`Math: ${stripSolutionMarkers(step.math)}`);
      }
      if (step.result) {
        lines.push(`Result: ${stripSolutionMarkers(step.result)}`);
      }
      lines.push('');
    });
  }

  if (solution?.finalAnswer) {
    lines.push('Final answer');
    lines.push(stripSolutionMarkers(solution.finalAnswer));
  }

  if (solution?.summary) {
    lines.push('');
    lines.push('Summary');
    lines.push(stripSolutionMarkers(solution.summary));
  }

  return lines.filter((line, index, allLines) => !(line === '' && allLines[index - 1] === ''));
}

async function recordSolveHistory(req, { problem, problemText, solution, classLevel, source, lang }) {
  try {
    if (!req.user?.sub || !solution) {
      return;
    }

    const history = await getSolveHistoryCollection();
    await history.insertOne({
      userId: req.user.sub,
      problem: String(problem || problemText || '').slice(0, 12000),
      problemText: String(problemText || problem || '').slice(0, 30000),
      solution,
      classLevel: String(classLevel || '').slice(0, 120),
      source: String(source || 'solver').slice(0, 40),
      lang: String(lang || 'en').slice(0, 12),
      createdAt: new Date(),
    });
  } catch (error) {
    console.warn('Failed to record solve history:', error.message);
  }
}

function splitDocumentQuestions(text) {
  const normalized = normalizeDocumentText(text);
  if (!normalized) {
    return [];
  }

  const numberedParts = normalized
    .split(/\n(?=\s*(?:\d+[\).]|câu\s+\d+|bài\s+\d+)\s+)/i)
    .map((part) => part.trim())
    .filter((part) => part.length >= 8);

  if (numberedParts.length > 1) {
    return numberedParts.slice(0, 50);
  }

  const paragraphParts = normalized
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 12);

  if (paragraphParts.length > 1) {
    return paragraphParts.slice(0, 50);
  }

  return [normalized];
}

function sendSolutionPdf(res, lines) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="mathnote-solution.pdf"');

  const doc = new PDFDocument({ margin: 48, size: 'A4' });
  doc.pipe(res);
  doc.font('Helvetica');

  lines.forEach((line, index) => {
    if (index === 0) {
      doc.fontSize(20).text(line, { underline: true });
      doc.moveDown(0.8);
      doc.fontSize(11);
      return;
    }

    if (!line) {
      doc.moveDown(0.6);
      return;
    }

    if (['Problem', 'Final answer', 'Summary'].includes(line) || line.startsWith('Step ')) {
      doc.moveDown(0.3).font('Helvetica-Bold').fontSize(13).text(line);
      doc.font('Helvetica').fontSize(11);
      return;
    }

    doc.text(line, { width: 500 });
  });

  doc.end();
}

async function sendSolutionDocx(res, lines) {
  const children = lines.map((line, index) => {
    const isHeading =
      index === 0 || ['Problem', 'Final answer', 'Summary'].includes(line) || String(line).startsWith('Step ');

    return new Paragraph({
      spacing: { after: line ? 160 : 80 },
      children: [
        new TextRun({
          text: line || ' ',
          bold: isHeading,
          size: index === 0 ? 32 : isHeading ? 26 : 22,
        }),
      ],
    });
  });

  const document = new Document({
    sections: [{ children }],
  });
  const buffer = await Packer.toBuffer(document);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', 'attachment; filename="mathnote-solution.docx"');
  res.send(buffer);
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

app.post('/mathnote/api/solve', requireAuth, globalSolveLimiter, async (req, res) => {
  try {
    const { problem, classLevel, lang, history, source } = req.body;
    const payload = await solveMathProblem({ problem, classLevel, lang, history });
    await recordSolveHistory(req, {
      problem,
      problemText: problem,
      solution: payload.solution,
      classLevel,
      source: source || 'solver',
      lang,
    });
    res.json(payload);
  } catch (error) {
    console.error('Solve error:', error);
    sendError(res, error, 'Failed to solve problem');
  }
});

app.post('/mathnote/api/ocr', requireAuth, async (req, res) => {
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
      await recordSolveHistory(req, {
        problem: ocr.text,
        problemText: ocr.text,
        solution: payload.solution,
        classLevel: req.body.classLevel,
        source: 'ocr',
        lang,
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

app.post('/mathnote/api/document-solve', requireAuth, globalSolveLimiter, async (req, res) => {
  documentUpload.single('document')(req, res, async (uploadError) => {
    if (uploadError) {
      sendError(res, uploadError, 'Failed to process document upload');
      return;
    }

    try {
      if (!req.file?.buffer) {
        const error = new Error('No document provided.');
        error.statusCode = 400;
        throw error;
      }

      const documentText = await extractDocumentText(req.file);
      const questions = splitDocumentQuestions(documentText);
      if (!documentText) {
        const error = new Error('The document did not contain readable text.');
        error.statusCode = 422;
        throw error;
      }

      const payload = await solveMathProblem({
        problem: req.body.problemText || documentText,
        classLevel: req.body.classLevel,
        lang: req.body.lang || 'en',
        history: parseHistory(req.body.history),
      });
      await recordSolveHistory(req, {
        problem: req.file.originalname,
        problemText: req.body.problemText || documentText,
        solution: payload.solution,
        classLevel: req.body.classLevel,
        source: 'document',
        lang: req.body.lang || 'en',
      });

      res.json({
        document: {
          fileName: req.file.originalname,
          mimeType: req.file.mimetype,
          text: documentText,
          questions,
        },
        ...payload,
      });
    } catch (error) {
      console.error('Document solve error:', error);
      sendError(res, error, 'Failed to solve document');
    }
  });
});

app.post('/mathnote/api/document-extract', requireAuth, async (req, res) => {
  documentUpload.single('document')(req, res, async (uploadError) => {
    if (uploadError) {
      sendError(res, uploadError, 'Failed to process document upload');
      return;
    }

    try {
      if (!req.file?.buffer) {
        const error = new Error('No document provided.');
        error.statusCode = 400;
        throw error;
      }

      const documentText = await extractDocumentText(req.file);
      if (!documentText) {
        const error = new Error('The document did not contain readable text.');
        error.statusCode = 422;
        throw error;
      }

      res.json({
        document: {
          fileName: req.file.originalname,
          mimeType: req.file.mimetype,
          text: documentText,
          questions: splitDocumentQuestions(documentText),
        },
      });
    } catch (error) {
      console.error('Document extract error:', error);
      sendError(res, error, 'Failed to extract document');
    }
  });
});

app.post('/mathnote/api/export', requireAuth, async (req, res) => {
  try {
    const { problem, solution, format } = req.body;
    if (!solution || !['pdf', 'docx'].includes(format)) {
      res.status(400).json({ error: 'A solution and export format are required.' });
      return;
    }

    const lines = solutionToLines(problem, solution);
    if (format === 'pdf') {
      sendSolutionPdf(res, lines);
      return;
    }

    await sendSolutionDocx(res, lines);
  } catch (error) {
    console.error('Export error:', error);
    sendError(res, error, 'Failed to export solution');
  }
});

app.post('/mathnote/api/animate', requireAuth, async (req, res) => {
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

    const parsed = await callGeminiJSON([
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

app.post('/mathnote/api/ask_step', requireAuth, async (req, res) => {
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

    const response = await callGemini([
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

app.post('/mathnote/api/verify', requireAuth, async (req, res) => {
  try {
    const { problem, solution, lang } = req.body;
    const langInstruction = lang === 'vi' ? 'Respond entirely in Vietnamese.' : 'Respond entirely in English.';

    const parsed = await callGeminiJSON(
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

app.post('/mathnote/api/explain', requireAuth, async (req, res) => {
  try {
    const { step, history, lang, classLevel } = req.body;
    const langInstruction =
      lang === 'vi'
        ? 'Respond entirely in Vietnamese. Use simple Vietnamese.'
        : 'Respond entirely in English. Use simple, clear language.';

    const explanation = await callGemini([
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

app.post('/mathnote/api/graph-solve', requireAuth, globalSolveLimiter, async (req, res) => {
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

    const parsed = await callGeminiJSON(buildSolverMessages({ problem: problemText, classLevel, lang, history: [] }));
    const graphAnalysis = {
      steps: Array.isArray(parsed.steps) ? parsed.steps : [],
      finalAnswer: parsed.finalAnswer || parsed.final_answer || '',
      summary: parsed.summary || '',
    };
    await recordSolveHistory(req, {
      problem: question || equation || 'Graph analysis',
      problemText,
      solution: graphAnalysis,
      classLevel,
      source: 'graph',
      lang,
    });
    res.json({
      graphAnalysis,
    });
  } catch (error) {
    console.error('Graph solve error:', error);
    sendError(res, error, 'Failed to analyze graph');
  }
});

app.listen(PORT, () => {
  console.log(`Mathnote server running on http://localhost:${PORT}/mathnote`);
});
