# Mathnote

Mathnote is an Express + static frontend app for step-by-step math solving, graph analysis, OCR, PDF/Word homework solving, saved questions, account-based history, and admin-editable documentation.

## Features

- Login and signup with captcha
- MongoDB account storage
- Saved questions per account
- Solve history per account
- Gemini-powered math solving
- Image OCR with Tesseract.js
- PDF and Word `.docx` extraction
- Split PDF/Word documents into separate questions
- Export detailed solutions to PDF or Word
- Admin dashboard for users, password reset, Whitepaper, and Change Log editing

## Requirements

- Node.js 18+
- npm
- MongoDB Atlas or local MongoDB
- Gemini API key

## Environment Setup

Create a `.env` file from `.env.example`:

```bash
copy .env.example .env
```

Fill in:

```env
PORT=3000
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-1.5-flash
MONGODB_URI=your_mongodb_connection_string
MONGODB_DB=mathnote
MONGODB_TLS_ALLOW_INVALID_CERTIFICATES=false
AUTH_SECRET=replace_with_a_long_random_secret
ADMIN_EMAIL=admin@mathnote.local
ADMIN_PASSWORD=Admin@123456
ADMIN_NAME=Admin
```

Do not commit `.env`. It contains secrets and is already ignored by git.

## MongoDB Atlas

In MongoDB Atlas:

1. Go to `Database > Clusters`.
2. Click `Connect`.
3. Choose `Drivers`.
4. Copy the connection string.
5. Replace the username and password.
6. Add `/mathnote` before the query string.

Example:

```env
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@cluster0.xxxxx.mongodb.net/mathnote?retryWrites=true&w=majority
```

If `mongodb+srv` DNS fails on your machine, use the standard non-SRV connection string from Atlas.

Also make sure Atlas allows your IP:

`Security > Database & Network Access > Network Access`

For quick testing only, you can allow `0.0.0.0/0`.

If signup/login shows a database TLS error, first verify that `MONGODB_URI` is the exact Drivers
connection string from Atlas and does not force `tls=false`. For a local development database with a
self-signed certificate only, set `MONGODB_TLS_ALLOW_INVALID_CERTIFICATES=true`; do not use that in
production.

## Install

```bash
npm install
```

## Create Admin Account

After MongoDB is configured, run:

```bash
npm run create-admin
```

Default admin from `.env.example`:

```text
Email: admin@mathnote.local
Password: Admin@123456
```

## Run Locally

```bash
npm start
```

Open:

```text
http://localhost:3000/mathnote
```

Admin dashboard:

```text
http://localhost:3000/mathnote/admin
```

## Useful Scripts

```bash
npm start
npm run dev
npm run create-admin
```

## Main Routes

- App: `/mathnote`
- Admin dashboard: `/mathnote/admin`
- Whitepaper: `/mathnote/whitepaper`
- Change Log: `/mathnote/changed-readme`

## API Notes

Most app APIs require login. Admin APIs require an account with:

```json
{ "role": "admin" }
```

Important API groups:

- Auth: `/mathnote/api/login`, `/mathnote/api/signup`, `/mathnote/api/logout`
- Saved questions: `/mathnote/api/saved`
- History: `/mathnote/api/history`
- Admin users: `/mathnote/api/admin/users`
- Editable pages: `/mathnote/api/pages/:page`
- Solver/OCR/document: `/mathnote/api/solve`, `/mathnote/api/ocr`, `/mathnote/api/document-solve`, `/mathnote/api/document-extract`

## Deployment Checklist

Before deploying:

1. Set real environment variables on the host.
2. Use a strong `AUTH_SECRET`.
3. Set `GEMINI_API_KEY`.
4. Set `MONGODB_URI`.
5. Run `npm install`.
6. Run `npm run create-admin` once.
7. Start with `npm start`.

## Git Push

```bash
git status
git add .
git commit -m "Add Mathnote auth, admin, history, documents, and editable docs"
git push origin main
```

If your branch is not `main`, check it:

```bash
git branch
```
