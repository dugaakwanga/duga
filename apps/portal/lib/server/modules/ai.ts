import type { Module } from ".";
import { can, str, num } from "../helpers";
import { generateSmartTimetable } from "./timetable";
import { findSchemeChunks } from "./scheme";
import { checkRateLimit } from "@duga/core/server";
import { hasPermission, type Role } from "@duga/core";
import type { Ctx } from "@/app/api/v1/[...path]/route";

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

async function generateGemini(system: string, prompt: string | ChatTurn[], temperature: number, maxTokens: number): Promise<string> {
  const turns: ChatTurn[] = typeof prompt === "string" ? [{ role: "user", content: prompt }] : prompt;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TEXT_MODEL}:generateContent?key=${GOOGLE_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      // Gemini uses "model" rather than "assistant" for the AI's own prior turns.
      contents: turns.map((t) => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.content }] })),
      generationConfig: { temperature, maxOutputTokens: maxTokens },
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const err = new Error(`Gemini error (${res.status})` + (detail ? `: ${detail.slice(0, 200)}` : "")) as Error & { status?: number };
    err.status = 502;
    throw err;
  }
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p: { text?: string }) => p.text ?? "").join("").trim();
  if (!text) throw new Error("Gemini returned an empty reply.");
  return text;
}

// Together AI's free-tier FLUX.1 [schnell] — genuinely good image quality,
// unlike Pollinations.ai's degraded serving of the same underlying model
// family (confirmed by generating and comparing both directly: the same
// prompt came back sharp and legible from Together, blurry/low-res from
// Pollinations). Requires a free Together AI account (no card) and its API
// key in TOGETHER_API_KEY; without one configured this falls back to
// Pollinations so image generation keeps working, just at lower quality.
const TOGETHER_API_KEY = process.env.TOGETHER_API_KEY || "";

function pollinationsUrl(prompt: string): string {
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=768&height=512&nologo=true&model=flux`;
}

export async function generateImageUrl(prompt: string): Promise<string> {
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
  if (matches.length === 0) return { content: text.trim(), illustrations: [] };
  let content = text;
  const illustrations: string[] = [];
  for (const m of matches) {
    illustrations.push(m[1]!.trim());
    content = content.replace(m[0], "[[ILLUSTRATION_HERE]]");
  }
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
      const full = `a clear, simple, colorful illustration of ${prompt}, flat vector children's textbook art style, plain white background, no text, no words, no logo, no watermark, no signature`;
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
      const illustrationInstruction =
        " Wherever ONE single concrete object or scene would genuinely help students picture a SPECIFIC point in the note, insert a line by itself " +
        "right after that point: '[ILLUSTRATION: <description>]'. <description> must be exactly one clear subject only — e.g. 'a wheat field ready " +
        "for harvest', 'a cotton plant', 'a hen sitting on eggs'. It must NEVER be a labeled diagram, a chart, a collage, several items shown " +
        "together, or anything containing text/words/labels/numbers — image generation cannot render legible text or lay out multiple items " +
        "correctly, and describing more than one subject produces a garbled, unusable image every time. If the point you want to illustrate would " +
        "need multiple items or labels to make sense, skip the illustration there entirely rather than attempting it. Use up to 3 such lines at " +
        "genuinely different points — most notes need 1 or 2; use 0 if nothing in the note has a single clear visual subject (e.g. a grammar rule). " +
        "Never describe the same picture twice.";

      // The reply is converted into real HTML client-side (lessonHtml.ts),
      // which understands **bold**, a "Label:" line as a heading, and a
      // leading "- " as a bullet — so ask for exactly that lightweight
      // shape rather than fighting the model's own natural tendency to
      // reach for **bold** anyway (asking it not to was unreliable).
      const formatInstruction =
        " Formatting: write ONLY the section labels given above as headings, each on its own line ending with a colon (e.g. 'Objectives:'), a " +
        "blank line, then the section's content, then a blank line before the next section. Do not add any other headings or sub-headings inside " +
        "a section — write that content as normal paragraphs and bullets instead. Use '- ' at the start of a line for a bullet point, and " +
        "**word** to bold a term worth emphasizing. Never use '#' characters or markdown heading syntax, '---'/'===' dividers, tables, or code " +
        "blocks/backticks/ASCII diagrams — plain paragraphs with the '- ' bullets and **bold** described above are the ONLY formatting allowed.";

      // A short outline isn't usable as the actual material a student
      // reads to learn from — force real depth per section.
      const lengthInstruction =
        " Write a THOROUGH, complete note, not a one-line outline. The explanation needs 2-4 full sentences per point of real teaching in plain " +
        "language a child can follow, not just a phrase — actually teach the topic, don't just list its subtopics. The practice section needs " +
        "concrete steps the student can actually try. The quick check needs at least 4 real questions. Aim for genuine depth over brevity.";

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

      const sectionLabels = "What you'll learn:, Explanation:, Try it yourself:, and Quick check:";

      // Without this, the model tends to just restate the topic name across
      // sections rather than teaching toward a specific, checkable outcome —
      // "well-written" filler instead of content actually designed around
      // what the student should walk away able to do.
      const objectiveInstruction =
        " Before writing, decide the ONE specific, concrete objective this lesson should achieve for the student — something they should be able to DO " +
        "or explain by the end, based on the exact topic/subtopic given (not a vague restatement of the subject name). Every section must visibly serve " +
        "that objective: 'What you'll learn:' states it in plain terms, 'Explanation:' actually teaches toward it rather than listing loosely related " +
        "facts, 'Try it yourself:' is a task that requires using it, and 'Quick check:' tests whether the student actually met it. Do not pad with " +
        "generic or tangential content that doesn't serve that specific objective — depth means teaching the objective thoroughly, not adding " +
        "unrelated background.";

      if (matches.length === 0) {
        const system = `You write lesson notes for students, structured as: ${sectionLabels}` + audienceInstruction + objectiveInstruction + lengthInstruction + illustrationInstruction + formatInstruction;
        const prompt = `Subject: ${subject}\nTopic: ${topic ?? "(choose an appropriate topic for this subject and level)"}${level ? `\nLevel/Class: ${level}` : ""}${week ? `\nWeek: ${week}` : ""}`;
        const reply = await generate(system, prompt, 0.7, 3500);
        const { content, illustrations } = extractIllustrations(reply);
        return { reply: content, grounded: false, illustrations };
      }

      const excerpt = matches.map((m) => `--- ${m.subjectName}${m.levelName ? ` (${m.levelName})` : ""}${m.term ? `, ${m.term} TERM` : ""} ---\n${m.text}`).join("\n\n");
      const system =
        "You write lesson notes for a Nigerian school student, strictly grounded in the official scheme-of-work excerpt provided (that's the " +
        "syllabus your teacher follows, not what you show the student — it tells you WHAT to teach). " +
        "Use ONLY topics/subtopics that actually appear in the excerpt — if a specific week or topic was requested, find it in the excerpt " +
        "(the excerpt is a raw extract from a PDF, so formatting may be messy — read past that). Expand each subtopic named in the excerpt into " +
        "real, taught content — the excerpt itself is just a syllabus line, not the lesson. " +
        `Structure: ${sectionLabels}` + audienceInstruction + objectiveInstruction + lengthInstruction + illustrationInstruction + formatInstruction;
      const prompt = `Scheme of work excerpt (syllabus — do not show this to the student, teach FROM it):\n${excerpt}\n\n---\nWrite a student-facing lesson note for Subject: ${subject}${level ? `, Level/Class: ${level}` : ""}${week ? `, Week ${week}` : ""}${topic ? `, Topic: ${topic}` : " — pick the most relevant week/topic from the excerpt above"}.`;
      const reply = await generate(system, prompt, 0.6, 3500);
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
