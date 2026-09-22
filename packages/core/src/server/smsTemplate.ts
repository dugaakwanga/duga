import { formatNaira } from "../utils";

// A single GSM-7 SMS segment is 160 characters — everything past that
// splits into a second segment (a second charge). The weekly school-fee
// reminder is deliberately kept to one segment for the common case (one or
// two owing children); a parent with several owing children only spills
// into a second segment when the full list genuinely doesn't fit, rather
// than ever being silently truncated mid-sentence.
export const SMS_SEGMENT_LENGTH = 160;

export interface SmsFeeReminderCopy {
  // e.g. "Hello {parent}, reminder from {school}:" — the Sender ID already
  // shows the school's name to the recipient, so the default deliberately
  // doesn't repeat it in the body to save characters.
  greeting: string;
  // e.g. "Kindly settle before {dueDate}. Thank you."
  closing: string;
}

export const DEFAULT_SMS_FEE_REMINDER_COPY: SmsFeeReminderCopy = {
  greeting: "Hello {parent}, reminder that {children} in school fees.",
  closing: "Kindly settle before {dueDate}. Thank you.",
};

export interface OwingChild {
  name: string;
  owing: number;
}

// Renders "John owes ₦45,000" / "John owes ₦45,000, Grace owes ₦30,000" /
// "John owes ₦45,000, Grace owes ₦30,000 and 2 others owe fees" — degrading
// the LIST (never the surrounding sentence) when it would push the message
// past the target length, so the message always reads as a complete
// sentence instead of getting cut off mid-word.
function renderChildList(children: OwingChild[], budget: number): string {
  const verb = (n: number) => (n === 1 ? "owes" : "owe");
  const full = children.map((c) => `${c.name} ${verb(1)} ${formatNaira(c.owing)}`).join(", ");
  if (full.length <= budget || children.length === 1) return full;
  for (let shown = children.length - 1; shown >= 1; shown--) {
    const remaining = children.length - shown;
    const candidate = `${children
      .slice(0, shown)
      .map((c) => `${c.name} ${verb(1)} ${formatNaira(c.owing)}`)
      .join(", ")} and ${remaining} other${remaining === 1 ? "" : "s"} ${verb(remaining)} fees`;
    if (candidate.length <= budget) return candidate;
  }
  return `${children.length} children owe fees`;
}

export function renderSmsFeeReminder(
  copy: SmsFeeReminderCopy,
  vars: { parentName: string; schoolName: string; children: OwingChild[]; dueDate: string | null },
): string {
  const dueDate = vars.dueDate ?? "the school's due date";
  // Budget the child list against everything else in the message so the
  // whole thing (not just the list in isolation) targets one SMS segment.
  const scaffold = `${copy.greeting} ${copy.closing}`
    .replace("{parent}", vars.parentName)
    .replace("{school}", vars.schoolName)
    .replace("{dueDate}", dueDate)
    .replace("{children}", "");
  const budget = Math.max(20, SMS_SEGMENT_LENGTH - scaffold.length);
  const childList = renderChildList(vars.children, budget);
  return `${copy.greeting} ${copy.closing}`
    .replace("{parent}", vars.parentName)
    .replace("{school}", vars.schoolName)
    .replace("{dueDate}", dueDate)
    .replace("{children}", childList);
}
