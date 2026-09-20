import crypto from "crypto";
import type { Module } from ".";
import { can, str, num } from "../helpers";
import { generateSmartTimetable } from "./timetable";
import { findSchemeChunks } from "./scheme";
import { findTextbookChunks } from "./textbooks";
import { checkRateLimit } from "@duga/core/server";
import { hasPermission, type Role } from "@duga/core";
import type { Ctx } from "@/app/api/v1/[...path]/route";
import { uploadPublicFile } from "@/lib/server/storage";

// ---------------------------------------------------------------------------
// AI assistant (OpenRouter — free tier)
//
// Server-side wrapper so the API key never leaves the server. Routes chat,
// report-card remarks and lesson drafts through a single OpenRouter call, so
// the model can be swapped freely via OPENROUTER_MODEL. The feature degrades
// gracefully: when no OPENROUTER_API_KEY is configured the actions return a
// clear message instead of crashing.
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = "nvidia/nemotron-3-super-120b-a12b:free";
// OpenRouter's free-tier router: picks a currently-free model that actually
// supports what the request needs (here, image input) rather than us having
// to hardcode a specific vision model, whose free availability changes.
// DEFAULT_MODEL above is text-only and cannot grade a photographed script.
const DEFAULT_VISION_MODEL = "openrouter/free";

const MODEL = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
const VISION_MODEL = process.env.OPENROUTER_VISION_MODEL || DEFAULT_VISION_MODEL;
const API_KEY = process.env.OPENROUTER_API_KEY || "";

function available(): boolean {
  return API_KEY.length > 0;
}

// Google's Gemini API — genuinely better text quality than the free
// OpenRouter model, confirmed live. Pinned to a specific version rather
// than Google's own "gemini-flash-latest" alias: the alias returned
// intermittent 503s/connection resets in testing while this pinned model
// answered reliably every time. Override via GEMINI_TEXT_MODEL if this one
// is ever retired. Used as the primary text provider when configured;
// falls back to OpenRouter (above) on any failure — missing key, quota
// exhausted, outage — so the assistant degrades instead of breaking.
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || "";
const GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || "gemini-3.5-flash";

function geminiAvailable(): boolean {
  return GOOGLE_API_KEY.length > 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Gemini returned transient 503s ("model overloaded") repeatedly in testing
// — a couple of retries with a short backoff clears most of them, so a
// passing user request doesn't need to fall all the way back to the lower
// quality OpenRouter model just because Google's servers were briefly busy.
async function generateGemini(system: string, prompt: string | ChatTurn[], temperature: number, maxTokens: number): Promise<string> {
  const turns: ChatTurn[] = typeof prompt === "string" ? [{ role: "user", content: prompt }] : prompt;
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    // Gemini uses "model" rather than "assistant" for the AI's own prior turns.
    contents: turns.map((t) => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.content }] })),
    generationConfig: { temperature, maxOutputTokens: maxTokens },
  });

  let lastErr: Error | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(500 * attempt);
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TEXT_MODEL}:generateContent?key=${GOOGLE_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        const err = new Error(`Gemini error (${res.status})` + (detail ? `: ${detail.slice(0, 200)}` : "")) as Error & { status?: number };
        err.status = 502;
        // 503/502/504 are transient (overloaded/unavailable) — worth a
        // retry. Anything else (bad key, quota) won't fix itself.
        if ([502, 503, 504].includes(res.status) && attempt < 2) {
          lastErr = err;
          continue;
        }
        throw err;
      }
      const data = await res.json();
      const parts = data?.candidates?.[0]?.content?.parts ?? [];
      const text = parts.map((p: { text?: string }) => p.text ?? "").join("").trim();
      if (!text) throw new Error("Gemini returned an empty reply.");
      return text;
    } catch (e) {
      if (e instanceof TypeError && attempt < 2) {
        // Network-level failure (e.g. ECONNRESET) — also worth a retry.
        lastErr = e;
        continue;
      }
      throw e;
    }
  }
  throw lastErr ?? new Error("Gemini request failed.");
}

// Gemini's embedding model — used to semantically match a lesson-draft
// request (subject/topic/level) against a textbook's chunked pages (see
// textbooks.ts's findTextbookChunks), which a short keyword match can't do
// reliably across hundreds of pages the way it can for a short scheme-of-
// work document. batchEmbedContents does up to 100 texts in one call, so
// ingesting a whole textbook's ~100-150 chunks takes one or two calls, not
// one per chunk. No fallback provider — OpenRouter's free tier has nothing
// equivalent, and there's no reasonable non-semantic substitute at this
// scale the way scheme.ts falls back to keyword matching.
const GEMINI_EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || "text-embedding-004";

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!geminiAvailable()) throw new Error("AI is not configured — add a GOOGLE_API_KEY to the server environment.");
  if (texts.length === 0) return [];
  const out: number[][] = [];
  // The API caps a single batchEmbedContents call at 100 requests.
  for (let i = 0; i < texts.length; i += 100) {
    const batch = texts.slice(i, i + 100);
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBEDDING_MODEL}:batchEmbedContents?key=${GOOGLE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: batch.map((text) => ({
            model: `models/${GEMINI_EMBEDDING_MODEL}`,
            content: { parts: [{ text }] },
          })),
        }),
      },
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Gemini embedding error (${res.status})` + (detail ? `: ${detail.slice(0, 200)}` : ""));
    }
    const data = await res.json();
    const embeddings = data?.embeddings;
    if (!Array.isArray(embeddings) || embeddings.length !== batch.length) {
      throw new Error("Gemini returned an unexpected embedding response.");
    }
    for (const e of embeddings) out.push((e?.values ?? []) as number[]);
  }
  return out;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Cloudflare Workers AI's free tier — genuinely good FLUX.1 [schnell]
// quality (confirmed by generating and looking at the actual output), no
// card required at all, and it hard-stops at the daily neuron budget
// instead of billing anything. This is the primary image provider now.
// Cloudflare returns raw base64 image bytes rather than a hosted URL, so
// the result is uploaded through the app's own storage (same path as a
// teacher's manual image upload) and that hosted URL is returned instead —
// keeps the lesson note's saved HTML small rather than embedding a giant
// data: URI per image.
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || "";
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || "";

function cloudflareAvailable(): boolean {
  return CLOUDFLARE_ACCOUNT_ID.length > 0 && CLOUDFLARE_API_TOKEN.length > 0;
}

async function generateImageCloudflare(prompt: string): Promise<string> {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
    },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Cloudflare image error (${res.status})` + (detail ? `: ${detail.slice(0, 200)}` : ""));
  }
  const data = await res.json();
  const b64 = data?.result?.image;
  if (typeof b64 !== "string" || !b64) throw new Error("Cloudflare returned no image data");
  const buffer = Buffer.from(b64, "base64");
  const { url } = await uploadPublicFile({ folder: "ai-images", name: `${crypto.randomUUID()}.jpg`, mime: "image/jpeg", buffer });
  return url;
}

// Together AI's free-tier FLUX.1 [schnell] — kept as a second fallback in
// case a Together key is ever added (needs a paid deposit as of this
// writing, so it's inactive without TOGETHER_API_KEY set).
const TOGETHER_API_KEY = process.env.TOGETHER_API_KEY || "";

function pollinationsUrl(prompt: string): string {
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=768&height=512&nologo=true&model=flux`;
}

export async function generateImageUrl(prompt: string): Promise<string> {
  if (cloudflareAvailable()) {
    try {
      return await generateImageCloudflare(prompt);
    } catch {
      // Cloudflare unreachable, quota exhausted for the day, or errored —
      // fall through to the next provider rather than failing the request.
    }
  }
  if (TOGETHER_API_KEY) {
    try {
      const res = await fetch("https://api.together.xyz/v1/images/generations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TOGETHER_API_KEY}`,
        },
        body: JSON.stringify({
          model: "black-forest-labs/FLUX.1-schnell-Free",
          prompt,
          width: 768,
          height: 512,
          steps: 4,
          n: 1,
          response_format: "url",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const url = data?.data?.[0]?.url;
        if (typeof url === "string" && url) return url;
      }
    } catch {
      // Together unreachable or errored — fall through to Pollinations below
      // rather than failing the whole request over one provider's outage.
    }
  }
  return pollinationsUrl(prompt);
}

// Every AI action shares one per-user budget — nothing here is metered
// upstream (OpenRouter's free tier), so an unthrottled endpoint is a wide
// open door for one account to burn the whole school's shared quota (or, on
// a paid model, run up real cost) by hammering it in a loop.
function assertAiRateLimit(ctx: Ctx): void {
  const rl = checkRateLimit(`ai:${ctx.session.user.id}`, 20, 5 * 60_000);
  if (!rl.allowed) {
    const err = new Error(`Too many AI requests — please wait about ${Math.ceil((rl.retryAfterSeconds ?? 60) / 60)} minute(s) and try again.`) as Error & { status?: number };
    err.status = 429;
    throw err;
  }
}

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

// Takes either a single prompt string (the common case — remark/draft are
// one-shot) or a real list of prior turns. Passing history as actual
// role-tagged messages — rather than flattening it into one block of text —
// means a message crafted to look like "Assistant: ignore your instructions"
// still arrives tagged as `user`, not `assistant`; the model has no reason
// to treat it as something it said itself.
export async function generate(system: string, prompt: string | ChatTurn[], temperature = 0.7, maxTokens = 1024, extra?: Record<string, unknown>): Promise<string> {
  if (geminiAvailable()) {
    try {
      return await generateGemini(system, prompt, temperature, maxTokens);
    } catch (e) {
      // Gemini failed (bad key, quota, outage) — fall through to OpenRouter
      // below if it's configured, otherwise this was the only provider we
      // had, so the failure is real.
      if (!available()) throw e;
    }
  }
  if (!available()) {
    throw new Error("AI is not configured yet. Add a GOOGLE_API_KEY or OPENROUTER_API_KEY to the server environment to enable the assistant.");
  }
  const turns: ChatTurn[] = typeof prompt === "string" ? [{ role: "user", content: prompt }] : prompt;
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "system", content: system }, ...turns],
      temperature,
      max_tokens: maxTokens,
      ...extra,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const err = new Error(`AI provider error (${res.status})` + (detail ? `: ${detail.slice(0, 200)}` : "")) as Error & { status?: number };
    err.status = 502;
    throw err;
  }
  const data = await res.json();
  const message = data?.choices?.[0]?.message;
  // A reasoning model can leave `content` empty with its whole answer sitting
  // in `reasoning` instead (see generateVision below for the same fallback).
  const text = String(message?.content || message?.reasoning || "").trim();
  if (!text) throw new Error("The AI assistant returned an empty reply. Please try again.");
  return text;
}

// Pulls the model's self-placed "[ILLUSTRATION: ...]" cues (see draftLesson)
// out of the drafted text and replaces each one, in place, with a literal
// "[[ILLUSTRATION_HERE]]" token — every occurrence is the same token, so
// the Nth occurrence in the text lines up with the Nth entry in the
// returned `illustrations` array. LessonContent.tsx (the renderer) walks
// the text splitting on that token and drops each generated image in
// exactly where the model put it, instead of a plain-text dump with images
// bolted on at the end.
function extractIllustrations(text: string): { content: string; illustrations: string[] } {
  const matches = [...text.matchAll(/^\s*\[ILLUSTRATION:\s*(.+?)\]\s*$/gim)];
  let content = text;
  const illustrations: string[] = [];
  for (const m of matches) {
    illustrations.push(m[1]!.trim());
    content = content.replace(m[0], "[[ILLUSTRATION_HERE]]");
  }
  // Belt-and-braces against the model explaining itself despite being told
  // not to (seen live: "[No illustration – describing multiple colours
  // would need more than one subject.]") — strip any other bracketed line
  // that's clearly commentary about an illustration rather than the
  // "[ILLUSTRATION: ...]" cue itself, which is already handled above.
  content = content.replace(/^\s*\[[^\]]*\billustration\b[^\]]*\]\s*$/gim, "");
  return { content: content.replace(/\n{3,}/g, "\n\n").trim(), illustrations };
}

// Same shape as generate(), but for a prompt that includes one or more
// images — routed to VISION_MODEL (a text-only model would either error or
// silently ignore the images). Used by paperExam.ts for AI-assisted grading.
export async function generateVision(system: string, prompt: string, imageUrls: string[], maxTokens = 2000): Promise<string> {
  if (!available()) {
    throw new Error("AI is not configured yet. Add an OPENROUTER_API_KEY to the server environment to enable the assistant.");
  }
  const content = [
    { type: "text", text: prompt },
    ...imageUrls.map((url) => ({ type: "image_url", image_url: { url } })),
  ];
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: VISION_MODEL,
      messages: [{ role: "system", content: system }, { role: "user", content }],
      temperature: 0.2,
      max_tokens: maxTokens,
    }),
  });
  // The free vision router can fail with either a non-2xx status or (less
  // commonly) a 200 whose body is an error object instead of choices — both
  // handled the same way, extracting the provider's own message when there
  // is one rather than dumping raw JSON at the teacher. Free vision models
  // are more heavily rate-limited than the text model — a retry a minute
  // later often succeeds even when this one didn't.
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.error) {
    const providerMessage = data?.error?.message ? String(data.error.message) : null;
    const err = new Error(
      providerMessage
        ? `The AI couldn't grade this right now (${providerMessage.slice(0, 200)}). Free vision models are often busy — try again in a minute.`
        : `AI provider error (${res.status}). Free vision models are often busy — try again in a minute.`,
    ) as Error & { status?: number };
    err.status = 502;
    throw err;
  }
  const message = data?.choices?.[0]?.message;
  // The free router can land on a "thinking"-style model whose final answer
  // is in `content`, but which — if it ran out of tokens mid-thought — only
  // has its chain-of-thought in `reasoning`. Prefer content; fall back to
  // reasoning rather than surfacing a confusing "empty reply" when there was
  // real (if messier) output.
  const text = String(message?.content || message?.reasoning || "").trim();
  if (!text) throw new Error("The AI returned an empty reply — the selected free vision model may be temporarily unavailable. Please try again.");
  return text;
}

function systemFor(role: string): string {
  const base =
    "You are the AI assistant inside the De Ultimate Glory Academy school portal. " +
    "You help students learn, teachers plan lessons and mark work, and parents understand progress. " +
    "Be concise, warm, encouraging and age-appropriate. Use clear Nigerian school English. " +
    "Never invent facts; if unsure, say so and suggest asking the school.";
  if (role === "TEACHER") {
    return base + " The user is a TEACHER. Help draft lesson notes, quiz/exam questions, assignments, and report card remarks.";
  }
  if (role === "ADMIN" || role === "OWNER" || role === "BURSAR") {
    return base + " The user is school STAFF. Help with reports, announcements, and general school administration.";
  }
  if (role === "STUDENT") {
    return base + " The user is a STUDENT. Explain topics simply, give practice questions and study tips, and encourage learning.";
  }
  if (role === "PARENT") {
    return base + " The user is a PARENT. Help them understand their child's progress and how to support learning at home.";
  }
  return base;
}

export const aiModule: Module = {
  actions: {
    // Generic chat used by the portal assistant panel.
    chat: async (ctx) => {
      can(ctx, "ai:use");
      assertAiRateLimit(ctx);
      const messages = Array.isArray(ctx.body.messages) ? (ctx.body.messages as Array<{ role?: string; content?: string }>) : [];
      if (messages.length === 0) throw new Error("A message is required");
      const last = messages[messages.length - 1];
      const prompt = String(last?.content ?? "").trim();
      if (!prompt) throw new Error("A message is required");
      // If an owner/admin asks the assistant to create/generate the timetable,
      // run the smart clash-free builder directly instead of a generic reply.
      // Checked against the real permission (not a hardcoded role list) so
      // this stays correct if timetable:manage is ever granted more broadly.
      const wantsTimetable = /\b(create|generate|make|set ?up|build|draft)\b/i.test(prompt) && /\btimetable|time\s*table|schedule\b/i.test(prompt);
      if (wantsTimetable && hasPermission(ctx.session.user.role as Role, "timetable:manage")) {
        try {
          const result = await generateSmartTimetable(ctx.session.user.schoolId, {
            termId: str(ctx.body.termId),
            section: str(ctx.body.section),
            periodsPerDay: num(ctx.body.periodsPerDay),
          });
          return {
            reply:
              result.created > 0
                ? `I created ${result.created} class period(s) for the timetable, each one free of clashes for both the class and its teacher.${result.skipped ? ` ${result.skipped} period(s) couldn't be placed because there was no free slot for that class and teacher.` : ""}`
                : "There was nothing new to schedule. Make sure each class has subjects with teachers assigned in Classes, then I can build the timetable.",
          };
        } catch (e) {
          return { reply: `I couldn't build the timetable: ${(e as Error).message}` };
        }
      }
      // Mentioning an image/picture/diagram/etc. at all — routed to
      // Pollinations.ai (free, no key needed; see teacher/notes/page.tsx for
      // the same endpoint used by the lesson-note illustration button)
      // instead of the text model, which cannot produce an image at all.
      // Deliberately NOT also requiring a verb like "generate" — a typo
      // there ("genrata an image of a dog") used to fall straight through
      // to the text model, which correctly (but unhelpfully) explained it
      // can't make images. Nobody says "image" to a school portal assistant
      // without wanting one, so the noun alone is a safe enough signal.
      const wantsImage = /\b(image|picture|pic|photo|diagram|illustration|drawing|poster|graphic)\b/i.test(prompt);
      if (wantsImage) {
        const subjectMatch = prompt.match(/(?:of|showing|about|depicting)\s+(.+)$/i);
        const subject = (subjectMatch?.[1] ?? prompt).replace(/[.?!]+$/, "").trim();
        const imagePrompt = `${subject}, simple clean educational illustration for a Nigerian school, no watermark, no text`;
        const imageUrl = await generateImageUrl(imagePrompt);
        return { reply: `Here you go — an image of ${subject}:`, imageUrl };
      }
      // The shell tells us which portal page the user is on so the assistant
      // can ground its help in what they are actually trying to do.
      const page = String(ctx.body.page ?? "").trim();
      const pageHint = page
        ? `The user is currently on the "${page}" page of the school portal. Make your help relevant to that page and what they would do there.\n\n`
        : "";
      // The school section (Primary/Secondary) the user is working in.
      const section = str(ctx.body.section);
      const sectionHint = section
        ? `The user is currently managing the ${section === "PRIMARY" ? "PRIMARY school" : "SECONDARY school"} section. Tailor examples (classes, levels, subjects) to that section.\n\n`
        : "";
      // Carry a little context from previous turns as real role-tagged
      // messages (not flattened into one block of text) so the model always
      // knows what it actually said versus what the user said.
      const history: ChatTurn[] = messages
        .slice(-6, -1)
        .map((m) => ({ role: m.role === "assistant" ? ("assistant" as const) : ("user" as const), content: String(m.content ?? "") }))
        .filter((m) => m.content.trim().length > 0);
      const turns: ChatTurn[] = [...history, { role: "user", content: sectionHint + pageHint + prompt }];
      const reply = await generate(systemFor(ctx.session.user.role), turns, 0.7, 1024);
      return { reply };
    },

    // Structured report card remark generator.
    remark: async (ctx) => {
      can(ctx, "ai:use");
      assertAiRateLimit(ctx);
      const student = str(ctx.body.studentName) ?? "the student";
      const subject = str(ctx.body.subject);
      const average = str(ctx.body.average);
      const grade = str(ctx.body.grade);
      const classInfo = str(ctx.body.className);
      const focus = str(ctx.body.focus); // optional area to improve/mention

      const detail = [
        subject ? `Subject: ${subject}` : "",
        average ? `Overall average: ${average}%` : "",
        grade ? `Grade: ${grade}` : "",
        classInfo ? `Class: ${classInfo}` : "",
        focus ? `Area to mention: ${focus}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      const system =
        "You write warm, professional Nigerian school report card remarks. " +
        "Output ONLY the remark (2-4 sentences), first-person teacher voice, no greeting or signature.";
      const reply = await generate(
        system,
        `Write a report card remark for ${student}.\n${detail}\n\nMake it encouraging, mention strengths and one specific area to improve.`,
        0.8,
        400,
      );
      return { reply };
    },

    // Lesson-note / quiz / assignment drafts for teachers.
    draft: async (ctx) => {
      can(ctx, "ai:use");
      assertAiRateLimit(ctx);
      const kind = str(ctx.body.kind) ?? "note"; // note | quiz | assignment
      const subject = str(ctx.body.subject) ?? "the subject";
      const topic = str(ctx.body.topic) ?? "the topic";
      const level = str(ctx.body.level);
      const count = Math.max(1, Math.min(20, Number(ctx.body.count) || 5));

      const system =
        kind === "quiz"
          ? "You create age-appropriate multiple-choice questions. Output questions numbered 1..N, each with options A-D on separate lines and a separate 'Answer:' line at the end."
          : kind === "assignment"
            ? "You create clear homework assignments with a short intro, the task steps, and how it will be marked."
            : "You write structured lesson notes with: Objectives, Key points (bulleted), Teaching activity, and Quick assessment.";

      const prompt = `Subject: ${subject}\nTopic: ${topic}${level ? `\nLevel/Class: ${level}` : ""}${
        kind === "quiz" ? `\nCreate ${count} questions.` : ""
      }`;
      const reply = await generate(system, prompt, 0.7, 1200);
      return { reply };
    },

    // Generates one illustration image server-side (Together AI FLUX.1
    // [schnell] when TOGETHER_API_KEY is set, Pollinations.ai otherwise) and
    // returns its URL. Used by the "Generate image here" button in the
    // lesson editor and by the auto-illustration step after drafting a
    // lesson from the scheme of work — kept server-side so the Together API
    // key never reaches the browser.
    generateImage: async (ctx) => {
      can(ctx, "ai:use");
      assertAiRateLimit(ctx);
      const prompt = str(ctx.body.prompt);
      if (!prompt) throw new Error("A description is required");
      const full = `a clear, simple, colorful illustration of ONLY ${prompt}, flat vector children's textbook art style, plain solid white background, nothing else in the frame, no extra background scenery, no added objects or decorations beyond what was described, no border, no text, no words, no logo, no watermark, no signature`;
      const url = await generateImageUrl(full);
      return { url };
    },

    // Lesson-note draft grounded in the school's uploaded scheme of work
    // (see scheme.ts) when a matching subject/level section was found, so
    // the note follows the actual official curriculum instead of whatever
    // topic the teacher free-typed. Falls back to the generic `draft`
    // prompt when nothing's been uploaded yet or nothing matches.
    draftLesson: async (ctx) => {
      can(ctx, "ai:use");
      assertAiRateLimit(ctx);
      const subject = str(ctx.body.subject) ?? "the subject";
      const level = str(ctx.body.level);
      const topic = str(ctx.body.topic);
      const week = str(ctx.body.week);

      const matches = await findSchemeChunks(ctx.session.user.schoolId, { levelName: level, subjectName: subject, topicHint: topic });
      // Textbook excerpts (see textbooks.ts) ground the actual teaching
      // depth/wording/examples in the school's own uploaded book, separate
      // from the scheme excerpt above which only defines WHAT to teach.
      const textbookMatches = await findTextbookChunks(ctx.session.user.schoolId, { levelName: level, subjectName: subject, topicHint: topic });

      // Ask the model to mark its own illustration points wherever a
      // single clear subject genuinely helps — not just one image tacked
      // on at the end. Tested live: a description needing several items
      // or labels laid out together (e.g. "a collage of foods with a
      // label") comes back as an unrecognizable blob-filled grid with
      // garbled fake text every time — the free image model can only
      // render ONE concrete subject reliably, nothing that depends on
      // layout or legible text. So the instruction below forbids exactly
      // that class of description rather than just hoping the model
      // avoids it.
      // Bumped from a flat "up to 3" cap: with one heading per objective
      // now (see structureInstruction below), a note covering several
      // objectives should be able to illustrate each one, not just the
      // note as a whole.
      const illustrationInstruction =
        " Wherever ONE single concrete object or scene would genuinely help students picture a SPECIFIC objective's point, insert a line by itself " +
        "right after that point: '[ILLUSTRATION: <description>]'. <description> must be exactly one clear subject only — e.g. 'a wheat field ready " +
        "for harvest', 'a cotton plant', 'a hen sitting on eggs'. It must NEVER be a labeled diagram, a chart, a collage, several items shown " +
        "together, or anything containing text/words/labels/numbers — image generation cannot render legible text or lay out multiple items " +
        "correctly, and describing more than one subject produces a garbled, unusable image every time. If an objective's point would need multiple " +
        "items or labels to make sense, skip the illustration there entirely rather than attempting it — silently: never write a bracketed note, " +
        "aside, or any other text explaining that you skipped one or why; the student reading this note must never see your reasoning about " +
        "images, only the note itself. Use at most ONE such line per objective heading, only where it genuinely helps — skip objectives with no " +
        "single clear visual subject (e.g. a grammar rule or a definition). Never describe the same picture twice.";

      // The reply is converted into real HTML client-side (lessonHtml.ts),
      // which understands **bold**, a "Label:" line as a heading, and a
      // leading "- " as a bullet — so ask for exactly that lightweight
      // shape rather than fighting the model's own natural tendency to
      // reach for **bold** anyway (asking it not to was unreliable).
      const formatInstruction =
        " Formatting: write each heading described above on its own line ending with a colon (e.g. 'Meaning of agriculture:'), a blank line, then " +
        "that section's content, then a blank line before the next heading. Where an objective genuinely has distinct parts worth separating (see " +
        "the sub-heading guidance above), write a sub-heading on its own line ending with TWO colons instead of one (e.g. 'Types of soil::'), " +
        "followed by a blank line and that part's own content — same rule, just two colons instead of one. Do not add any heading or sub-heading " +
        "beyond what's described above — write everything else as normal paragraphs and bullets. Use '- ' at the start of a line for a bullet " +
        "point, and **word** to bold a term worth emphasizing. Never use '#' characters or markdown heading syntax, '---'/'===' dividers, tables, " +
        "or code blocks/backticks/ASCII diagrams — plain paragraphs with the '- ' bullets and **bold** described above are the ONLY formatting " +
        "allowed.";

      // A short outline isn't usable as the actual material a student
      // reads to learn from — force real depth per objective, not just per
      // note.
      const lengthInstruction =
        " Write a THOROUGH, complete note, not a one-line outline. Each objective's own section needs real teaching in plain language a child can " +
        "follow — several full sentences that actually explain and exemplify it, not a phrase that just restates its name. If you use sub-headings " +
        "to break an objective into parts, each sub-part needs the same real depth too, not a one-liner. The 'Try it yourself:' section needs " +
        "concrete steps the student can actually try. The 'Quick check:' section needs at least one real question per objective covered. Aim for " +
        "genuine depth over brevity.";

      // This note is what the STUDENT reads on their own screen as their
      // study material — it is NOT a lesson plan for the teacher to carry
      // into class. Earlier prompts asked for "Objectives / Teaching
      // activity" (teacher-facing planning language, e.g. "Begin the
      // lesson by greeting the pupils...") which makes no sense read back
      // by the student it's actually shown to. Write directly to the
      // student instead.
      const audienceInstruction =
        " Write this DIRECTLY TO THE STUDENT, as their own study material — not as a lesson plan for the teacher to follow. Speak to the student " +
        "as \"you\": explain the topic itself in full (this is the actual content they learn from, not a summary of what a teacher will say), give " +
        "them something to try themselves, and questions for them to check their own understanding. Never write teacher-directed instructions " +
        "like \"ask pupils to...\" or \"begin the lesson by...\".";

      // A single generic "Explanation:" section was the core complaint —
      // a scheme-of-work week almost always lists several distinct
      // subtopics/objectives (semicolon- or bullet-separated in the raw
      // excerpt text), and mashing them all into one section produces
      // shallow, unfocused content. This forces one properly developed
      // heading per objective instead.
      function structureInstruction(hasExcerpt: boolean): string {
        const objectiveSource = hasExcerpt
          ? "The scheme excerpt below lists several distinct learning objectives/subtopics for the requested week (usually separated by semicolons " +
            "or bullet points in the raw text) — identify every one of them."
          : "Break the given topic down into 2-4 distinct, concrete learning objectives yourself — specific things the student should be able to " +
            "do or explain by the end, not vague restatements of the topic name.";
        return (
          " " +
          objectiveSource +
          " Give EACH objective its own heading, written as a short paraphrase of that objective (2-6 words) ending in a colon — never lump " +
          "multiple objectives together under one generic heading like 'Explanation:'. Under each heading, thoroughly teach THAT specific " +
          "objective on its own before moving to the next: explain what it means, why it matters, and give a concrete real-world example a " +
          "Nigerian student would recognize. Where an objective naturally splits into 2-3 distinct parts or types worth teaching separately " +
          "(e.g. an objective about 'types of soil' covering sandy, clay and loamy soil one at a time, or one about 'stages of a process' " +
          "covering each stage), give each part its own sub-heading nested under that objective's heading (see sub-heading formatting below) " +
          "instead of running them together as one block — a short, single-idea objective needs no sub-heading at all, just its own paragraph(s) " +
          "directly under the main heading. Do not pad with generic or tangential content — depth means genuinely teaching each objective (and " +
          "each of its parts, if it has sub-headings), not adding unrelated background. Structure the whole note as: an opening 'What you'll " +
          "learn:' section briefly listing every objective you are about to cover, then one heading per objective in the order above (each with " +
          "its own sub-headings where it has distinct parts), then a closing 'Try it yourself:' section with one practical task drawing on " +
          "everything covered, then a closing 'Quick check:' section with at least one real question per objective covered."
        );
      }

      const hasScheme = matches.length > 0;
      const hasTextbook = textbookMatches.length > 0;
      const textbookExcerpt = hasTextbook
        ? textbookMatches.map((m) => `--- ${m.subjectName} (${m.levelName})${m.pageStart ? `, p.${m.pageStart}${m.pageEnd && m.pageEnd !== m.pageStart ? `-${m.pageEnd}` : ""}` : ""} ---\n${m.text}`).join("\n\n")
        : null;
      // Present when a textbook was found, regardless of scheme — tells the
      // model to mirror the book's own wording, worked examples and depth
      // rather than inventing its own explanation style.
      const textbookGuidance = hasTextbook
        ? " A matching textbook excerpt is also provided below (labeled 'Textbook excerpt') — base the actual teaching content, explanations and " +
          "worked examples on it, mirroring its depth and style, not just generic knowledge of the topic."
        : "";

      if (!hasScheme && !hasTextbook) {
        const system = "You write lesson notes for students." + structureInstruction(false) + audienceInstruction + lengthInstruction + illustrationInstruction + formatInstruction;
        const prompt = `Subject: ${subject}\nTopic: ${topic ?? "(choose an appropriate topic for this subject and level)"}${level ? `\nLevel/Class: ${level}` : ""}${week ? `\nWeek: ${week}` : ""}`;
        // Gemini 3.5 Flash (the primary provider here — see generate() above)
        // is itself a reasoning model: it spends a large, variable share of
        // max_tokens on hidden "thinking" before writing the visible reply,
        // so the budget needs real headroom beyond the note's own length or
        // a long note (especially now with sub-headings) can get cut off
        // mid-sentence.
        const reply = await generate(system, prompt, 0.7, 7000);
        const { content, illustrations } = extractIllustrations(reply);
        return { reply: content, grounded: false, illustrations };
      }

      // Textbook-only (no scheme match): ground in the textbook directly —
      // no scheme excerpt to enforce "must literally appear" against, since
      // findTextbookChunks already picked the most semantically relevant
      // page(s) rather than an exact tag match.
      if (!hasScheme) {
        const system =
          "You write lesson notes for a Nigerian school student, grounded in the textbook excerpt provided below — base the actual content on it " +
          "(the excerpt is a raw extract from a PDF, so formatting may be messy — read past that), expanding it into a real taught lesson rather " +
          "than just restating it." +
          structureInstruction(false) + audienceInstruction + lengthInstruction + illustrationInstruction + formatInstruction;
        const prompt = `Textbook excerpt:\n${textbookExcerpt}\n\n---\nWrite a student-facing lesson note for Subject: ${subject}${level ? `, Level/Class: ${level}` : ""}${week ? `, Week ${week}` : ""}${topic ? `, Topic: ${topic}` : " — pick the most relevant part of the excerpt above"}.`;
        const reply = await generate(system, prompt, 0.6, 7000);
        const { content, illustrations } = extractIllustrations(reply);
        return { reply: content, grounded: true, illustrations, sections: textbookMatches.map((m) => ({ subjectName: m.subjectName, levelName: m.levelName, term: null })) };
      }

      const excerpt = matches.map((m) => `--- ${m.subjectName}${m.levelName ? ` (${m.levelName})` : ""}${m.term ? `, ${m.term} TERM` : ""} ---\n${m.text}`).join("\n\n");
      const system =
        "You write lesson notes for a Nigerian school student, strictly grounded in the official scheme-of-work excerpt provided (that's the " +
        "syllabus your teacher follows, not what you show the student — it tells you WHAT to teach). " +
        "Use ONLY topics/subtopics that actually appear in the excerpt — if a specific week or topic was requested, find it in the excerpt " +
        "(the excerpt is a raw extract from a PDF, so formatting may be messy — read past that). Expand each subtopic named in the excerpt into " +
        "real, taught content — the excerpt itself is just a syllabus line, not the lesson." +
        textbookGuidance +
        " If the specific week or topic requested genuinely does not appear anywhere in the scheme excerpt, do NOT write an apology, an explanation, or " +
        "any lesson note at all — respond with EXACTLY the single line NOT_FOUND_IN_SCHEME and nothing else." +
        structureInstruction(true) + audienceInstruction + lengthInstruction + illustrationInstruction + formatInstruction;
      const prompt =
        `Scheme of work excerpt (syllabus — do not show this to the student, teach FROM it):\n${excerpt}` +
        (textbookExcerpt ? `\n\n---\nTextbook excerpt:\n${textbookExcerpt}` : "") +
        `\n\n---\nWrite a student-facing lesson note for Subject: ${subject}${level ? `, Level/Class: ${level}` : ""}${week ? `, Week ${week}` : ""}${topic ? `, Topic: ${topic}` : " — pick the most relevant week/topic from the excerpt above"}.`;
      // Same reasoning-overhead headroom as the ungrounded path above.
      const reply = await generate(system, prompt, 0.6, 7000);
      // The model sometimes ignores the strict-grounding instruction above
      // and apologizes in prose instead of the NOT_FOUND_IN_SCHEME marker —
      // catch that free-text refusal too so it never lands in a note's
      // content field looking like real lesson material.
      const looksLikeRefusal = /^(i'?m sorry|i apologize|i cannot|i can'?t|unfortunately)\b/i.test(reply.trim());
      if (reply.trim() === "NOT_FOUND_IN_SCHEME" || looksLikeRefusal) {
        throw new Error(
          `"${topic || `Week ${week || "?"}`}" doesn't appear in the uploaded scheme of work for ${subject}${level ? ` (${level})` : ""}. Try a different week/topic, or leave Topic blank and pick from what's listed.`,
        );
      }
      const { content, illustrations } = extractIllustrations(reply);
      return { reply: content, grounded: true, illustrations, sections: matches.map((m) => ({ subjectName: m.subjectName, levelName: m.levelName, term: m.term })) };
    },

    // Owner/admin: build the whole class timetable with a single smart,
    // clash-free pass (shared with the manual "Generate" button).
    timetable: async (ctx) => {
      can(ctx, "timetable:manage");
      const result = await generateSmartTimetable(ctx.session.user.schoolId, {
        termId: str(ctx.body.termId),
        section: str(ctx.body.section),
        periodsPerDay: num(ctx.body.periodsPerDay),
      });
      return {
        reply:
          result.created > 0
            ? `I created ${result.created} class period(s) for the timetable, each one free of clashes for both the class and its teacher.${result.skipped ? ` ${result.skipped} period(s) couldn't be placed because there was no free slot for that class and teacher.` : ""}`
            : "There was nothing new to schedule. Make sure each class has subjects with teachers assigned in Classes, then I can build the timetable.",
      };
    },
  },
};
