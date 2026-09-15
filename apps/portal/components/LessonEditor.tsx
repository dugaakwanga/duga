"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import "react-quill-new/dist/quill.snow.css";
import "@enzedonline/quill-blot-formatter2/dist/css/quill-blot-formatter2.css";
import type ReactQuillType from "react-quill-new";
import { Modal, Field, Input, Button } from "@duga/ui";
import { api } from "@/lib/client/api";

// next/dynamic's wrapper type drops the ref prop that react-quill-new's real
// component (a forwardRef component) actually supports — cast back to the
// real type so `ref={quillRef}` below type-checks.
//
// The blot-formatter module (image/iframe resize + drag-to-reposition) has to be
// registered on the SAME Quill class react-quill-new uses internally, before the
// editor mounts — done here, inside the dynamic loader, so it only ever runs
// client-side and only once, right before the editor component resolves.
const ReactQuill = dynamic(async () => {
  const [{ default: RQ }, { default: Quill }, { default: BlotFormatter }] = await Promise.all([
    import("react-quill-new"),
    import("quill"),
    import("@enzedonline/quill-blot-formatter2"),
  ]);
  Quill.register("modules/blotFormatter", BlotFormatter);
  return RQ;
}, { ssr: false }) as unknown as typeof ReactQuillType;

const TOOLBAR = [
  [{ header: [1, 2, 3, 4, false] }],
  ["bold", "italic", "underline"],
  [{ list: "ordered" }, { list: "bullet" }],
  ["clean"],
];

export default function LessonEditor({
  value,
  onChange,
  imageContext,
  placeholder,
}: {
  value: string;
  onChange: (html: string) => void;
  imageContext?: string;
  placeholder?: string;
}) {
  const quillRef = useRef<ReactQuillType | null>(null);
  const savedRangeRef = useRef<{ index: number; length: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [imageDesc, setImageDesc] = useState("");
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  function captureCursor() {
    const editor = quillRef.current?.getEditor();
    const range = editor?.getSelection(true);
    savedRangeRef.current = range ?? { index: editor?.getLength() ?? 0, length: 0 };
  }

  function insertImageAtCursor(url: string) {
    const editor = quillRef.current?.getEditor();
    if (!editor) return;
    const range = savedRangeRef.current ?? { index: editor.getLength(), length: 0 };
    editor.insertEmbed(range.index, "image", url, "user");
    // Cloudflare's generator only ever outputs a fixed 1024x1024 image —
    // much bigger and squarer than the 768x512 illustrations this editor
    // was designed around, so it would otherwise land at a dominating
    // native size. Give it a sane starting width; the blot-formatter resize
    // handles (drag a corner) still let a teacher make it bigger or smaller
    // afterward — this only sets where a freshly inserted image starts.
    const [imgBlot] = editor.getLeaf(range.index);
    const node = imgBlot?.domNode as HTMLElement | undefined;
    if (node && node.tagName === "IMG") node.style.width = "360px";
    editor.setSelection(range.index + 1, 0, "user");
  }

  function openImagePrompt() {
    captureCursor();
    setImageDesc("");
    setImageModalOpen(true);
  }

  async function generateAndInsert() {
    if (!imageDesc.trim()) return;
    setGenerating(true);
    try {
      const prompt = imageContext ? `${imageDesc.trim()}, ${imageContext}` : imageDesc.trim();
      const res = await api<{ url: string }>("ai/generateImage", { method: "POST", body: { prompt } });
      insertImageAtCursor(res.url);
      setImageModalOpen(false);
    } catch (e) {
      alert((e as Error).message || "Couldn't generate that image right now — the free image service may be busy. Try again.");
    } finally {
      setGenerating(false);
    }
  }

  async function uploadAtCursor(file: File | undefined) {
    if (!file) return;
    captureCursor();
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload?purpose=lesson-note", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Upload failed");
      insertImageAtCursor(json.data.url);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function insertLinkAtCursor(text: string, url: string) {
    const editor = quillRef.current?.getEditor();
    if (!editor) return;
    const range = savedRangeRef.current ?? { index: editor.getLength(), length: 0 };
    editor.insertText(range.index, text, { link: url }, "user");
    editor.insertText(range.index + text.length, "\n", "user");
    editor.setSelection(range.index + text.length + 1, 0, "user");
  }

  async function uploadDocAtCursor(file: File | undefined) {
    if (!file) return;
    captureCursor();
    setUploadingDoc(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload?purpose=lesson-doc", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Upload failed");
      insertLinkAtCursor(`📄 ${file.name}`, json.data.url);
      if (docRef.current) docRef.current.value = "";
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setUploadingDoc(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <Button type="button" variant="outline" size="sm" onClick={openImagePrompt}>
          ✨ Generate image here
        </Button>
        <Button type="button" variant="outline" size="sm" loading={uploading} onClick={() => { captureCursor(); fileRef.current?.click(); }}>
          📎 Upload image here
        </Button>
        <Button type="button" variant="outline" size="sm" loading={uploadingDoc} onClick={() => { captureCursor(); docRef.current?.click(); }}>
          📄 Attach a PDF/Word note
        </Button>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => uploadAtCursor(e.target.files?.[0])} />
        <input ref={docRef} type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" style={{ display: "none" }} onChange={(e) => uploadDocAtCursor(e.target.files?.[0])} />
      </div>
      <div className="lesson-editor" style={{ background: "#fff", borderRadius: 10, border: "1px solid var(--duga-border)" }}>
        <ReactQuill
          ref={quillRef}
          theme="snow"
          value={value}
          onChange={onChange}
          modules={{ toolbar: TOOLBAR, blotFormatter: {} }}
          placeholder={placeholder}
        />
      </div>

      <Modal open={imageModalOpen} onClose={() => setImageModalOpen(false)} title="Generate an image">
        <Field label="What should the image show?" hint='Describe ONE clear subject only, e.g. "a dog" or "a wheat field" — not a labeled diagram, chart, or several items together (image generation can&apos;t render text/labels or lay out multiple items, and comes out as an unusable blob if you ask for that). It will be inserted right where your cursor was.'>
          <Input value={imageDesc} onChange={(e) => setImageDesc(e.target.value)} placeholder="e.g. a dog" />
        </Field>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
          <Button variant="ghost" onClick={() => setImageModalOpen(false)}>Cancel</Button>
          <Button loading={generating} onClick={generateAndInsert}>Generate &amp; insert</Button>
        </div>
      </Modal>
    </div>
  );
}
