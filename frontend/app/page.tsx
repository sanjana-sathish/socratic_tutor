"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

const API = "http://localhost:8000";

type Message = {
  role: "user" | "assistant";
  text: string;
};

export default function Home() {
  const [sessionId] = useState(() => crypto.randomUUID());
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages, loading]);

  async function send() {
    if ((!input.trim() && !file) || loading) return;

    const userMessage: Message = {
      role: "user",
      text: input.trim() || "[Image attached]",
    };

    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    const form = new FormData();

    form.append("session_id", sessionId);
    form.append("message", input);

    form.append(
      "conversation_history",
      messages
        .slice(-10)
        .map((m) => `${m.role}: ${m.text}`)
        .join("\n")
    );

    if (file) {
      form.append("file", file);
    }

    try {
      const res = await fetch(`${API}/api/chat`, {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        throw new Error("Request failed");
      }

      const result = await res.json();

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: result.response,
        },
      ]);

      setInput("");
      setFile(null);

      if (fileRef.current) {
        fileRef.current.value = "";
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "Something went wrong while contacting the tutor.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function newChat() {
    setMessages([]);
    setInput("");
    setFile(null);
  }

  return (
    <div className="flex h-screen bg-[#ffffff] text-[#0d0d0d]">
      {/* Sidebar */}
      <aside className="hidden md:flex w-[260px] bg-[#f9f9f9] border-r border-[#e5e5e5] flex-col p-3">
        <button
          onClick={newChat}
          className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-[#ececec] transition text-sm font-medium"
        >
          <span className="text-xl">＋</span>
          New chat
        </button>

        <div className="mt-6 px-3 text-xs text-gray-500">
          Socratic STEM Tutor
        </div>

        <div className="flex-1" />

        <div className="px-3 py-3 text-sm text-gray-500 border-t border-[#e5e5e5]">
          AI STEM Tutor
        </div>
      </aside>

      {/* Main */}
      <main className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <header className="h-14 flex items-center px-4 border-b border-[#ececec] md:border-none">
          <button className="md:hidden mr-3 text-xl">
            ☰
          </button>

          <div className="font-medium">
            Socratic STEM Tutor
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center px-4">
              <div className="max-w-xl w-full text-center">
                <div className="w-12 h-12 mx-auto mb-5 rounded-full bg-black text-white flex items-center justify-center text-xl">
                  ✦
                </div>

                <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
                  What are you working on?
                </h1>

                <p className="text-gray-500 mt-3 text-sm md:text-base">
                  Ask a STEM question, upload a diagram, or work through a
                  problem step by step.
                </p>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-4 md:px-6 py-6">
              <div className="space-y-8">
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={
                      message.role === "user"
                        ? "flex justify-end"
                        : "flex justify-start"
                    }
                  >
                    {message.role === "user" ? (
                      <div className="max-w-[80%] bg-[#f4f4f4] px-4 py-3 rounded-3xl rounded-br-lg text-[15px] leading-6">
                        <ReactMarkdown
                          remarkPlugins={[remarkMath]}
                          rehypePlugins={[rehypeKatex]}
                        >
                          {message.text}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <div className="w-full flex gap-4">
                        <div className="w-7 h-7 shrink-0 rounded-full bg-black text-white flex items-center justify-center text-xs mt-1">
                          ✦
                        </div>

                        <div
                          className="
                            prose prose-neutral
                            max-w-none
                            text-[15px]
                            leading-7
                            prose-p:my-2
                            prose-headings:mt-5
                            prose-headings:mb-2
                            prose-ul:my-2
                            prose-ol:my-2
                            prose-pre:bg-[#f6f6f6]
                            prose-pre:text-[#1f1f1f]
                            prose-pre:rounded-xl
                          "
                        >
                          <ReactMarkdown
                            remarkPlugins={[remarkMath]}
                            rehypePlugins={[rehypeKatex]}
                          >
                            {message.text}
                          </ReactMarkdown>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {loading && (
                  <div className="flex gap-4">
                    <div className="w-7 h-7 rounded-full bg-black text-white flex items-center justify-center text-xs">
                      ✦
                    </div>

                    <div className="flex items-center gap-1 pt-2">
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
                    </div>
                  </div>
                )}

                <div ref={bottomRef} />
              </div>
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="px-3 md:px-6 pb-3 md:pb-5">
          <div className="max-w-3xl mx-auto">
            {file && (
              <div className="mb-2 inline-flex items-center gap-2 bg-[#f4f4f4] px-3 py-2 rounded-xl text-sm">
                <span>🖼️</span>

                <span className="max-w-[220px] truncate">
                  {file.name}
                </span>

                <button
                  onClick={() => setFile(null)}
                  className="text-gray-500 hover:text-black"
                >
                  ×
                </button>
              </div>
            )}

            <div className="border border-[#d9d9d9] rounded-[26px] shadow-sm bg-white px-3 py-2">
              <div className="flex items-end gap-2">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-9 h-9 shrink-0 rounded-full hover:bg-[#f1f1f1] flex items-center justify-center text-xl transition"
                  title="Attach image"
                >
                  +
                </button>

                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    setFile(e.target.files?.[0] || null);
                  }}
                />

                <textarea
                  value={input}
                  rows={1}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder="Ask anything"
                  className="
                    flex-1
                    resize-none
                    max-h-40
                    min-h-[36px]
                    py-2
                    outline-none
                    bg-transparent
                    text-[15px]
                    leading-5
                  "
                />

                <button
                  onClick={send}
                  disabled={
                    loading ||
                    (!input.trim() && !file)
                  }
                  className="
                    w-9 h-9
                    shrink-0
                    rounded-full
                    bg-black
                    text-white
                    flex
                    items-center
                    justify-center
                    disabled:bg-[#d7d7d7]
                    transition
                  "
                >
                  ↑
                </button>
              </div>
            </div>

            <div className="text-center text-[11px] text-gray-400 mt-2">
              AI can make mistakes. Check important answers.
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}