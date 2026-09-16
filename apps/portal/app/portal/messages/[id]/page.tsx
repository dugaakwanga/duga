import { redirect } from "next/navigation";

// A "new message" push/email notification links here (see the `link` built
// in messaging.ts's send action) — but the messages page itself is a single
// route that opens a conversation via a query param, not a path segment.
// Without this, following the link 404s outright; the portal layout above
// this route already sends a signed-out visitor to /login, so an
// authenticated one just lands straight in the right conversation.
export default async function MessageRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/portal/messages?conversation=${encodeURIComponent(id)}`);
}
