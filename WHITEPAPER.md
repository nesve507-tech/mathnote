# Mathnote Whitepaper

[Main Mathnote](/mathnote) | [Problem Statement](#problem-statement) | [Solution Overview](#solution-overview) | [Architecture](#architecture) | [OCR Pipeline](#ocr-pipeline) | [API Surface](#api-surface) | [Security And Operations](#security-and-operations) | [Roadmap](#roadmap)

## Executive Summary

Mathnote is a lightweight mathematics workspace that combines three capabilities in a single web application:

1. AI-assisted, step-by-step problem solving.
2. Interactive graph analysis for equations and point-fitted curves.
3. OCR-assisted problem capture from worksheets, screenshots, and handwritten notes.

The original repository already supported solver, explanation, verification, graph analysis, saved notes, and animation playback. This implementation extends the platform with an OCR subsystem based on `tesseract.js`, rewires the frontend so image-to-solver is a first-class workflow, and adds documentation endpoints so product and engineering stakeholders can review the architecture directly from the running app.

The design goal is pragmatic: reduce the friction between "I have a math problem in an image" and "I have a verified, explainable solution." The OCR capability is therefore not a side utility. It is integrated into the primary solving pipeline and shares the same backend reasoning path used by manual text entry.

## Problem Statement

Modern students and self-learners often start from non-editable inputs:

1. Phone photos of notebook pages.
2. Screenshots from online homework systems.
3. Scanned worksheets or classroom handouts.
4. Mixed symbolic and natural-language questions.

Traditional calculator-style interfaces assume the user can retype the full problem. That assumption is frequently false. For many real workflows, the transcription step is the most error-prone and highest-friction part of the experience.

The repository prior to this implementation solved typed problems well, but it lacked a bridge from image content into the existing solve and verify path. This produced three gaps:

1. No native OCR ingestion.
2. No backend API for image extraction.
3. No product surface that connected captured text to the solver without manual re-entry.

## Solution Overview

The updated system introduces an OCR capture workflow with four properties:

1. **Backend OCR extraction** using `tesseract.js` and `multer` memory uploads.
2. **Integrated solve reuse** through a shared backend solve function rather than a second, separate AI path.
3. **Frontend OCR review controls** so users can inspect extracted text before solving or inject it into either the math solver tab or the word-problem tab.
4. **Bundled language data** so OCR does not depend on a runtime download for the supported languages in this project.
5. **Operational documentation** via a whitepaper route and a repository-level change log.

The result is a tighter workflow:

1. User uploads an image.
2. Backend extracts text through OCR.
3. User either reviews and edits extracted text or invokes "Extract and Solve."
4. The existing solver pipeline generates structured steps, summary, and final answer.
5. Verification, explanation, animation, and save features continue to work on the OCR-derived solution.

## Product Objectives

The implementation is aligned around six product objectives:

1. Preserve the existing `/mathnote` experience.
2. Add OCR without breaking the current solve, verify, animate, or graph paths.
3. Keep the backend small and dependency-light.
4. Keep startup reliable even when the Groq API key is not configured.
5. Make the OCR workflow visible and understandable to non-technical users.
6. Document the resulting architecture in a form suitable for engineering review.

## Architecture

### System Shape

The application remains a monolithic Express server serving a static frontend:

1. `server.js` serves static assets under `/mathnote`.
2. Browser JavaScript drives UI state, graphing, OCR interaction, and solution rendering.
3. Groq-backed AI endpoints perform solve, verify, explain, animation annotation, and graph analysis.
4. `tesseract.js` performs OCR on uploaded image buffers.

This architecture is intentionally conservative. The repository is small, and the added OCR feature does not justify a full backend split or a new service boundary.

### Reusable Solve Core

The most important backend change is not the OCR route by itself. It is the introduction of a shared solve function:

1. Manual solver requests call the shared solve path.
2. OCR auto-solve requests call the same shared solve path.
3. Graph analysis reuses the same solver prompt format for consistency.

This reduces drift across entry points and ensures the OCR path inherits the same output schema:

1. `steps`
2. `finalAnswer`
3. `summary`

### Documentation Surface

The server exposes documentation routes:

1. `/mathnote/whitepaper`
2. `/mathnote/changed-readme`

These routes allow engineering stakeholders to review implementation details directly from the deployed application without requiring repository access.

## OCR Pipeline

### Upload Handling

The OCR flow uses `multer` with in-memory storage:

1. The frontend posts an image via `FormData`.
2. The backend validates the file as an image.
3. The backend enforces an 8 MB file limit.
4. The image is passed to `tesseract.js` for recognition.

In-memory storage is appropriate here because the images are transient request payloads rather than durable assets. This avoids persistence complexity and reduces local disk clutter.

### Recognition

Recognition is performed using `tesseract.js`, with language selection tied to the UI language:

1. English mode uses local `eng` trained data.
2. Vietnamese mode uses local `vie` trained data.

The OCR subsystem normalizes common text artifacts after extraction:

1. Smart quotes are normalized.
2. Long dashes are normalized to hyphens.
3. Multiplication and division glyphs are normalized into more solver-friendly symbols.
4. Repeated whitespace and empty lines are collapsed.

This normalization is intentionally light. The goal is to improve solver ingestion without over-mutating the original problem statement.

### OCR Interaction Modes

The OCR endpoint supports two modes:

1. **Extract only**
2. **Extract and solve**

This distinction matters because OCR is probabilistic. A review-first mode is useful when the problem is dense or handwriting quality is low, while the one-click solve path is better for clean screenshots and typed worksheets.

### Frontend UX

The updated frontend adds:

1. Image selection.
2. Live preview.
3. OCR status messaging.
4. Confidence metadata display.
5. Extracted text textarea for correction or reuse.
6. Direct insertion into the active solve surface.
7. One-click OCR-to-solver execution.

This is the correct UX boundary. OCR systems should not silently overwrite user input. They should produce editable output and a clear next action.

## API Surface

### `POST /mathnote/api/solve`

Purpose:

1. Solve a typed or programmatically supplied problem through the main AI path.

Inputs:

1. `problem`
2. `classLevel`
3. `lang`
4. `history`

Outputs:

1. `solution`
2. `rawResponse`

### `POST /mathnote/api/ocr`

Purpose:

1. Extract text from an uploaded image.
2. Optionally pass that text directly into the shared solver flow.

Inputs:

1. Multipart `image`
2. `lang`
3. `classLevel`
4. `history`
5. `autoSolve`

Outputs:

1. `ocr.text`
2. `ocr.confidence`
3. `ocr.lines`
4. `ocr.language`
5. Optional `solution`
6. Optional `rawResponse`

### `POST /mathnote/api/verify`

Purpose:

1. Evaluate the quality and correctness of a generated solution.

### `POST /mathnote/api/explain`

Purpose:

1. Expand a single step for students who need a simpler explanation.

### `POST /mathnote/api/animate`

Purpose:

1. Generate animation metadata per step without altering the mathematical source content.

### `POST /mathnote/api/graph-solve`

Purpose:

1. Route equation or point-based graph questions through the same structured reasoning pipeline.

## Frontend Design Decisions

### Navigation

The header now includes explicit navigation to:

1. The main Mathnote app.
2. The whitepaper.
3. The implementation change log.

This is useful for demos, reviews, and QA handoff because it makes product, implementation, and documentation discoverable in one place.

### Visual Direction

The interface uses a distinct visual language rather than a generic utility-panel layout:

1. Space Grotesk for product identity.
2. A blue-green-gold atmospheric palette.
3. Layered card depth with restrained glass effects.
4. OCR controls placed ahead of solver entry to reflect the new product priority.

### State Handling

The updated client controller tracks shared solve state:

1. Current problem text.
2. Current display problem.
3. Current class level.
4. Current solution.
5. Current source type.

This fixes a pre-existing product weakness where some secondary features assumed every solve came from the math input only.

## Security And Operations

### Runtime Safety

The backend now avoids failing at startup if the Groq key is absent. Instead:

1. The server boots normally.
2. OCR can still execute.
3. AI-backed routes return a clear configuration error until `GROQ_API` is provided.

This is an operational improvement because deployment, front-end QA, and static route validation no longer depend on the presence of production credentials.

### Upload Safety

Upload safety controls include:

1. Image-only file acceptance.
2. An explicit size limit.
3. No persistent storage of uploaded images.

These are not enterprise-grade controls on their own, but they are the correct baseline for the current repository shape.

### Rate Limiting

The pre-existing global solve limiter is preserved for AI solve paths. That remains useful because OCR auto-solve still consumes the same expensive model-backed reasoning path.

## Reliability Considerations

### OCR Accuracy Limits

OCR for mathematics has inherent limitations:

1. Handwritten notation is harder than typed notation.
2. Dense expressions with stacked fractions are harder than linear text.
3. Ambiguous symbols such as `x`, `*`, `×`, and `+` can be misread.

The UI therefore retains an editable OCR text area instead of treating OCR output as immutable truth.

### Dependency Model

The new dependency footprint remains small:

1. Existing Express, Groq, CORS, and Multer dependencies remain.
2. `multer` is moved to the current major line.
3. `tesseract.js` is added for OCR.
4. Local trained data packages are added for English and Vietnamese OCR.

No database, queue, cache, or storage system was introduced. That is appropriate for the current deployment profile.

## Expected Deployment Flow

1. Copy `.env.example` to `.env`.
2. Set `GROQ_API`.
3. Run `npm install`.
4. Run `npm start`.
5. Visit `/mathnote`.

The whitepaper and change log can be reviewed through the same server process.

## Roadmap

The next sensible improvements are:

1. Local caching of OCR language assets for more predictable cold-start behavior.
2. Handwriting-focused OCR preprocessing such as grayscale normalization and contrast boosting.
3. Problem-type detection to route OCR output into symbolic or word-problem experiences automatically.
4. Better saved-solution metadata, including OCR confidence and solve provenance.
5. Test coverage for OCR route behavior and client-side OCR state transitions.

## Conclusion

This implementation upgrades Mathnote from a text-entry solver into a broader math intake workspace. The key value is not merely that OCR exists, but that OCR is productized: it is integrated with the existing solver, exposed in the interface, documented for review, and implemented with small-system discipline.

The result is a more credible end-to-end learning tool for real classroom and self-study workflows.
