"use client";

import { memo, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  Check,
  Clipboard,
  Clock,
  Loader2,
  Sparkles,
  User,
} from "lucide-react";

import type {
  AIFinanceChatMessageStatus,
  AIFinanceChatResponseSource,
  AIFinanceChatUsage,
  AIFinancePromptDebug,
} from "@/src/services/finance/ai-agent/aiChatTypes";

export type AIChatMessageRole = "user" | "assistant";

export type AIChatMessage = {
  id: string;
  role: AIChatMessageRole;
  status: AIFinanceChatMessageStatus;
  content: string;
  createdAt: string;
  source?: AIFinanceChatResponseSource;
  confidence?: number;
  model?: string;
  fallbackUsed?: boolean;
  fallbackReason?: string;
  latencyMs?: number;
  usage?: AIFinanceChatUsage;
  promptDebug?: AIFinancePromptDebug;
};

type AIChatMessageBubbleProps = {
  message: AIChatMessage;
};

type MarkdownBlock =
  | { type: "paragraph"; lines: string[] }
  | { type: "heading"; level: number; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "quote"; lines: string[] }
  | { type: "code"; language?: string; code: string }
  | { type: "table"; rows: string[][] };

function cn(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeMarkdown(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, "  ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isTableSeparator(line: string) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function isTableLine(line: string) {
  return line.includes("|") && line.trim().split("|").length >= 3;
}

function splitTableRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function parseMarkdown(value: string): MarkdownBlock[] {
  const text = normalizeMarkdown(value);
  if (!text) return [];

  const lines = text.split("\n");
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    const fence = trimmed.match(/^```([\w-]+)?\s*$/);
    if (fence) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({
        type: "code",
        language: fence[1],
        code: codeLines.join("\n"),
      });
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1].length,
        text: heading[2].trim(),
      });
      index += 1;
      continue;
    }

    if (/^\*\*[^*]+:\*\*\s*$/.test(trimmed)) {
      blocks.push({
        type: "heading",
        level: 3,
        text: trimmed.replace(/^\*\*|:\*\*$/g, ""),
      });
      index += 1;
      continue;
    }

    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith(">")) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push({ type: "quote", lines: quoteLines });
      continue;
    }

    if (
      isTableLine(trimmed) &&
      index + 1 < lines.length &&
      isTableSeparator(lines[index + 1] ?? "")
    ) {
      const rows: string[][] = [splitTableRow(trimmed)];
      index += 2;
      while (index < lines.length && isTableLine(lines[index] ?? "")) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      blocks.push({ type: "table", rows });
      continue;
    }

    const unordered = trimmed.match(/^[-*•]\s+(.+)$/);
    const ordered = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      const orderedList = Boolean(ordered);
      const items: string[] = [];

      while (index < lines.length) {
        const current = lines[index].trim();
        const currentUnordered = current.match(/^[-*•]\s+(.+)$/);
        const currentOrdered = current.match(/^\d+[.)]\s+(.+)$/);
        const currentMatch = orderedList ? currentOrdered : currentUnordered;
        if (!currentMatch) break;
        items.push(currentMatch[1].trim());
        index += 1;
      }

      blocks.push({ type: "list", ordered: orderedList, items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const current = lines[index] ?? "";
      const currentTrimmed = current.trim();
      if (!currentTrimmed) break;
      if (
        currentTrimmed.match(/^(#{1,4})\s+(.+)$/) ||
        currentTrimmed.match(/^[-*•]\s+(.+)$/) ||
        currentTrimmed.match(/^\d+[.)]\s+(.+)$/) ||
        currentTrimmed.startsWith(">") ||
        currentTrimmed.startsWith("```") ||
        (isTableLine(currentTrimmed) &&
          index + 1 < lines.length &&
          isTableSeparator(lines[index + 1] ?? ""))
      ) {
        break;
      }
      paragraphLines.push(currentTrimmed);
      index += 1;
    }

    blocks.push({ type: "paragraph", lines: paragraphLines });
  }

  return blocks;
}

function renderInlineMarkdown(value: string) {
  const parts: Array<{ type: "text" | "bold" | "code"; value: string }> = [];
  const regex = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(value))) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: value.slice(lastIndex, match.index) });
    }

    const token = match[0];
    if (token.startsWith("**")) {
      parts.push({ type: "bold", value: token.slice(2, -2) });
    } else {
      parts.push({ type: "code", value: token.slice(1, -1) });
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < value.length) {
    parts.push({ type: "text", value: value.slice(lastIndex) });
  }

  return parts.map((part, index) => {
    if (part.type === "bold") {
      return (
        <strong key={index} className="font-black text-slate-950">
          {part.value}
        </strong>
      );
    }

    if (part.type === "code") {
      return (
        <code
          key={index}
          className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[0.9em] font-bold text-slate-700"
        >
          {part.value}
        </code>
      );
    }

    return <span key={index}>{part.value}</span>;
  });
}

function MarkdownContent({ content }: { content: string }) {
  const blocks = useMemo(() => parseMarkdown(content), [content]);

  if (!content.trim()) return null;

  return (
    <div className="ai-chat-markdown space-y-3 text-[15px] leading-7 text-slate-700">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          const isLarge = block.level <= 2;
          return (
            <h3
              key={index}
              className={cn(
                "font-black tracking-tight text-slate-950",
                isLarge ? "pt-1 text-lg" : "pt-0.5 text-[15px]",
              )}
            >
              {renderInlineMarkdown(block.text)}
            </h3>
          );
        }

        if (block.type === "paragraph") {
          return (
            <p key={index} className="whitespace-pre-wrap">
              {renderInlineMarkdown(block.lines.join(" "))}
            </p>
          );
        }

        if (block.type === "list") {
          const ListTag = block.ordered ? "ol" : "ul";
          return (
            <ListTag
              key={index}
              className={cn(
                "space-y-2 pl-5",
                block.ordered ? "list-decimal" : "list-disc",
              )}
            >
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex} className="pl-1 marker:text-slate-300">
                  {renderInlineMarkdown(item)}
                </li>
              ))}
            </ListTag>
          );
        }

        if (block.type === "quote") {
          return (
            <blockquote
              key={index}
              className="rounded-2xl border-l-4 border-blue-300 bg-blue-50/70 px-4 py-3 text-sm font-semibold text-slate-600"
            >
              {block.lines.map((line, lineIndex) => (
                <p key={lineIndex}>{renderInlineMarkdown(line)}</p>
              ))}
            </blockquote>
          );
        }

        if (block.type === "code") {
          return (
            <pre
              key={index}
              className="overflow-x-auto rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-slate-100"
            >
              <code
                dangerouslySetInnerHTML={{ __html: escapeHtml(block.code) }}
              />
            </pre>
          );
        }

        if (block.type === "table") {
          const [head, ...body] = block.rows;
          return (
            <div
              key={index}
              className="overflow-x-auto rounded-2xl border border-slate-100"
            >
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {head.map((cell, cellIndex) => (
                      <th
                        key={cellIndex}
                        className="px-3 py-2 text-left text-xs font-black uppercase tracking-wide text-slate-500"
                      >
                        {renderInlineMarkdown(cell)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {body.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, cellIndex) => (
                        <td
                          key={cellIndex}
                          className="px-3 py-2 font-semibold text-slate-600"
                        >
                          {renderInlineMarkdown(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}

function MessageMeta({ message }: { message: AIChatMessage }) {
  if (message.role !== "assistant") return null;

  const sourceLabel =
    message.source === "openai"
      ? (message.model ?? "OpenAI")
      : message.source === "fallback"
        ? "Fallback"
        : message.source === "local"
          ? "Local AI"
          : message.model;

  const confidenceLabel =
    typeof message.confidence === "number"
      ? `${Math.round(message.confidence * 100)}%`
      : null;

  const latencyLabel =
    typeof message.latencyMs === "number"
      ? message.latencyMs >= 1000
        ? `${(message.latencyMs / 1000).toFixed(1)}s`
        : `${message.latencyMs}ms`
      : null;

  const items = [sourceLabel, confidenceLabel, latencyLabel].filter(Boolean);
  if (items.length === 0 && !message.fallbackUsed) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-400">
      {items.map((item) => (
        <span
          key={item}
          className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1"
        >
          {item}
        </span>
      ))}
      {message.fallbackUsed && (
        <span
          className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-amber-600"
          title={message.fallbackReason}
        >
          <AlertTriangle size={12} /> Fallback
        </span>
      )}
    </div>
  );
}

function PendingAnswer() {
  return (
    <div className="flex items-center gap-3 rounded-3xl bg-white px-4 py-3 text-sm font-bold text-slate-500 shadow-sm ring-1 ring-slate-100">
      <Loader2 size={16} className="animate-spin text-blue-600" />
      Đang đọc dữ liệu tài chính và phân tích...
    </div>
  );
}

function AIChatMessageBubble({ message }: AIChatMessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";
  const isPending = message.status === "pending" && !message.content.trim();

  async function handleCopy() {
    if (!message.content.trim()) return;
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  if (isUser) {
    return (
      <article className="flex justify-end">
        <div className="max-w-[86%] rounded-[1.5rem] rounded-br-md bg-blue-600 px-4 py-3 text-white shadow-lg shadow-blue-100">
          <p className="whitespace-pre-wrap text-sm font-bold leading-6">
            {message.content}
          </p>
          <div className="mt-2 flex justify-end text-[10px] font-black text-blue-100">
            {message.createdAt}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="group flex items-start gap-3">
      <div className="mt-1 flex size-9 shrink-0 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm ring-1 ring-slate-100">
        <Sparkles size={17} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-[11px] font-black uppercase tracking-[0.18em] text-blue-600">
              MyFinance AI
            </p>
            {message.status === "streaming" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-600">
                <span className="size-1.5 rounded-full bg-emerald-500" />{" "}
                Streaming
              </span>
            )}
            {message.status === "stopped" && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-600">
                Stopped
              </span>
            )}
            {message.status === "error" && (
              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-black text-rose-600">
                Error
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleCopy}
            className="flex size-8 shrink-0 items-center justify-center rounded-xl text-slate-300 opacity-0 transition hover:bg-slate-100 hover:text-slate-600 group-hover:opacity-100"
            aria-label="Copy AI answer"
            title="Copy"
          >
            {copied ? <Check size={15} /> : <Clipboard size={15} />}
          </button>
        </div>

        {isPending ? (
          <PendingAnswer />
        ) : (
          <div className="rounded-[1.75rem] bg-white px-5 py-4 shadow-sm ring-1 ring-slate-100">
            <MarkdownContent content={message.content} />
            <MessageMeta message={message} />
          </div>
        )}
      </div>
    </article>
  );
}

export default memo(AIChatMessageBubble);
