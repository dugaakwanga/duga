import type { Module } from ".";
import { can, str } from "../helpers";

// ---------------------------------------------------------------------------
// AI assistant (OpenRouter — free tier)
//
// Server-side wrapper so the API key never leaves the server. Routes chat,
// report-card remarks and lesson drafts through a single OpenRouter call, so
// the model can be swapped freely via OPENROUTER_MODEL. The feature degrades
// gracefully: when no OPENROUTER_API_KEY is configured the actions return a
// clear message instead of crashing.
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = "deepseek/deepseek-v4-flash";

const MODEL = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
const API_KEY = process.env.OPENROUTER_API_KEY || "";

function available(): boolean {
  return API_KEY.length > 0;
}

async function generate(system: string, userText: string, temperature = 0.7, maxTokens = 1024): Promise<string> {
  if (!available()) {
    throw new Error("AI is not configured yet. Add an OPENROUTER_API_KEY to the server environment to enable the assistant.");
  }
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userText },
      ],
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
      const messages = Array.isArray(ctx.body.messages) ? (ctx.body.messages as Array<{ role?: string; content?: string }>) : [];
      if (messages.length === 0) throw new Error("A message is required");
      const last = messages[messages.length - 1];
      const prompt = String(last?.content ?? "").trim();
      if (!prompt) throw new Error("A message is required");
      // Carry a little context from previous turns to keep conversations coherent.
      const history = messages
        .slice(-6, -1)
        .map((m) => `${m.role === "assistant" ? "Assistant" : "User"}: ${String(m.content ?? "")}`)
        .join("\n");
      const userText = history ? `Previous conversation:\n${history}\n\nNew message:\n${prompt}` : prompt;
      const reply = await generate(systemFor(ctx.session.user.role), userText, 0.7, 1024);
      return { reply };
    },

    // Structured report card remark generator.
    remark: async (ctx) => {
      can(ctx, "ai:use");
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
  },
};
