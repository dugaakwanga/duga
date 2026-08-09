export function jitsiRoomLink(
  schoolTag: string,
  title: string,
): string {
  const host = process.env.JITSI_HOST || "meet.jit.si";
  const slug = `${schoolTag}-${title}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  const room = `duga-${slug}-${Date.now().toString(36)}`;
  return `https://${host}/${room}`;
}
