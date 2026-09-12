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

const MODEL = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
const API_KEY = process.env.OPENROUTER_API_KEY || "";

function available(): boolean {
  return API_KEY.length > 0;
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
async function generate(system: string, prompt: string | ChatTurn[], temperature = 0.7, maxTokens = 1024): Promise<string> {
  if (!available()) {
    throw new Error("AI is not configured yet. Add an OPENROUTER_API_KEY to the server environment to enable the assistant.");
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
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const err = new Error(`AI provider error (${res.status})` + (detail ? `: ${detail.slice(0, 200)}` : "")) as Error & { status?: number };
    err.status = 502;
    throw err;
  }
  const data = await res.json();
  const text = String(data?.choices?.[0]?.message?.content ?? "").trim();
  if (!text) throw new Error("The AI assistant returned an empty reply. Please try again.");
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

      if (matches.length === 0) {
        const system = "You write structured lesson notes with: Objectives, Key points (bulleted), Teaching activity, and Quick assessment.";
        const prompt = `Subject: ${subject}\nTopic: ${topic ?? "(choose an appropriate topic for this subject and level)"}${level ? `\nLevel/Class: ${level}` : ""}${week ? `\nWeek: ${week}` : ""}`;
        const reply = await generate(system, prompt, 0.7, 1200);
        return { reply, grounded: false };
      }

      const excerpt = matches.map((m) => `--- ${m.subjectName}${m.levelName ? ` (${m.levelName})` : ""}${m.term ? `, ${m.term} TERM` : ""} ---\n${m.text}`).join("\n\n");
      const system =
        "You write structured lesson notes for a Nigerian school teacher, strictly grounded in the official scheme-of-work excerpt provided. " +
        "Use ONLY topics/subtopics that actually appear in the excerpt — if a specific week or topic was requested, find it in the excerpt " +
        "(the excerpt is a raw extract from a PDF, so formatting may be messy — read past that). " +
        "Output: Objectives, Key points (bulleted), Teaching activity, and Quick assessment.";
      const prompt = `Scheme of work excerpt:\n${excerpt}\n\n---\nDraft a lesson note for Subject: ${subject}${level ? `, Level/Class: ${level}` : ""}${week ? `, Week ${week}` : ""}${topic ? `, Topic: ${topic}` : " — pick the most relevant week/topic from the excerpt above"}.`;
      const reply = await generate(system, prompt, 0.6, 1400);
      return { reply, grounded: true, sections: matches.map((m) => ({ subjectName: m.subjectName, levelName: m.levelName, term: m.term })) };
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
