"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

const API = "http://localhost:8000";

export default function Home() {
  const [sessionId] = useState(() => crypto.randomUUID());
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([]);
  const [input, setInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    if (!input.trim() && !file) return;
    setMessages((m) => [...m, { role: "user", text: input || "[image attached]" }]);
    setLoading(true);

    const form = new FormData();
    form.append("session_id", sessionId);
    form.append("message", input);
    form.append("conversation_history", messages.slice(-10).map((m) => `${m.role}: ${m.text}`).join("\n"));
    if (file) form.append("file", file);

    const res = await fetch(`${API}/api/chat`, { method: "POST", body: form });
    const result = await res.json();

    setMessages((m) => [...m, { role: "assistant", text: result.response }]);
    setInput("");
    setFile(null);
    setLoading(false);
  }

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto p-4">
      <h1 className="text-xl font-semibold mb-4">Socratic STEM Tutor</h1>

      <div className="flex-1 overflow-y-auto space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
            <span className={`inline-block px-4 py-2 rounded-lg max-w-[85%] text-left ${
              m.role === "user" ? "bg-blue-600 text-white" : "bg-gray-100"
            }`}>
              <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{m.text}</ReactMarkdown>
            </span>
          </div>
        ))}
        {loading && <div className="text-gray-400 text-sm">Thinking...</div>}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-center gap-2 mt-4 border-t pt-4">
        <button onClick={() => fileRef.current?.click()} className="px-2">📎</button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <input value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask a question..."
          className="flex-1 border rounded-full px-4 py-2" />
        <button onClick={send} disabled={loading} className="bg-blue-600 text-white rounded-full px-4 py-2">
          Send
        </button>
      </div>
    </div>
  );
}