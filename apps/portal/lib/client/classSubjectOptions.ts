// A teacher who teaches one subject across several classes (e.g. "Pre-
// vocational Studies" in Primary 1 through 6) used to see it repeated six
// times as flat, identical-looking options in every "class subject" picker.
// Groups the same list by subject name so each subject appears once, with
// its classes nested under it via <optgroup> — the picker itself doesn't
// change, just how the options are organized within it.
export interface ClassSubjectLike {
  id: string;
  subject: { name: string };
  classGroup?: { level: { name: string }; name: string } | null;
}

export function groupClassSubjectsBySubject<T extends ClassSubjectLike>(options: T[]): Array<{ subject: string; items: T[] }> {
  const order: string[] = [];
  const bySubject = new Map<string, T[]>();
  for (const o of options) {
    const key = o.subject.name;
    if (!bySubject.has(key)) {
      bySubject.set(key, []);
      order.push(key);
    }
    bySubject.get(key)!.push(o);
  }
  return order.map((subject) => ({ subject, items: bySubject.get(subject)! }));
}
