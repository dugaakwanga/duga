"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import "react-quill-new/dist/quill.snow.css";
import type ReactQuillType from "react-quill-new";
import { Modal, Field, Input, Button } from "@duga/ui";

// next/dynamic's wrapper type drops the ref prop that react-quill-new's real
// component (a forwardRef component) actually supports — cast back to the
// real type so `ref={quillRef}` below type-checks.
const ReactQuill = dynamic(() => import("react-quill-new"), { ssr: false }) as unknown as typeof ReactQuillType;

// Pollinations.ai: free, no-key, no-signup image generation — the image is
// generated on request and served directly from this URL. Diffusion models
// (this one included) can't reliably render legible text inside an image,
// so this asks for a clear illustration of the subject rather than a
// "labeled diagram" (tested live: the latter came back unlabeled and
// photorealistic instead of a simple diagram).
function illustrationUrl(prompt: string): string {
  const full = `a clear, simple, colorful illustration of ${prompt}, flat vector children's textbook art style, plain white background, no text, no words, no logo, no watermark, no signature`;
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(full)}?width=768&height=512&nologo=true&model=flux`;
}

const TOOLBAR = [
  [{ header: [1, 2, 3, false] }],
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
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [imageDesc, setImageDesc] = useState("");
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);

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
      const url = illustrationUrl(imageContext ? `${imageDesc.trim()}, ${imageContext}` : imageDesc.trim());
      await new Promise<void>((resolve, reject) => {
        const probe = new Image();
        probe.onload = () => resolve();
        probe.onerror = () => reject(new Error("image failed"));
        probe.src = url;
      });
      insertImageAtCursor(url);
      setImageModalOpen(false);
    } catch {
      alert("Couldn't generate that image right now — the free image service may be busy. Try again.");
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
      const res = await fetch("/api/upload?purpose=gallery", { method: "POST", body: fd });
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

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <Button type="button" variant="outline" size="sm" onClick={openImagePrompt}>
          ✨ Generate image here
        </Button>
        <Button type="button" variant="outline" size="sm" loading={uploading} onClick={() => { captureCursor(); fileRef.current?.click(); }}>
          📎 Upload image here
        </Button>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => uploadAtCursor(e.target.files?.[0])} />
      </div>
      <div className="lesson-editor" style={{ background: "#fff", borderRadius: 10, border: "1px solid var(--duga-border)" }}>
        <ReactQuill
          ref={quillRef}
          theme="snow"
          value={value}
          onChange={onChange}
          modules={{ toolbar: TOOLBAR }}
          placeholder={placeholder}
        />
      </div>

      <Modal open={imageModalOpen} onClose={() => setImageModalOpen(false)} title="Generate an image">
        <Field label="What should the image show?" hint='e.g. "a dog showing its body parts" — describe it like you&apos;re talking to an illustrator. It will be inserted right where your cursor was.'>
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
