/*
 * Minimal Markdown renderer. No deps. Designed for the corpus our chat agent emits:
 * headings, paragraphs, bold/italic/inline code, links, hr, unordered lists,
 * GFM tables, fenced code blocks. Not a spec-compliant CommonMark parser —
 * known limitations: no nested lists, no ordered lists, no images, no blockquotes,
 * tables with `|` inside a cell will mis-split.
 */

import { Fragment } from "react";

function renderInline(text, keyPrefix = "i") {
  if (!text) return null;
  // Tokenize on (in order of priority): code, bold, italic, link. Greedy left-to-right.
  // Regexes are non-overlapping by construction because we slice as we match.
  const out = [];
  let i = 0;
  let key = 0;
  const push = (node) => out.push(<Fragment key={`${keyPrefix}-${key++}`}>{node}</Fragment>);
  while (i < text.length) {
    const rest = text.slice(i);
    let m;
    if ((m = rest.match(/^`([^`]+)`/))) {
      push(<code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.85em] text-slate-800">{m[1]}</code>);
      i += m[0].length;
    } else if ((m = rest.match(/^\*\*([^*]+?)\*\*/))) {
      push(<strong className="font-semibold">{m[1]}</strong>);
      i += m[0].length;
    } else if ((m = rest.match(/^\*([^*]+?)\*/))) {
      push(<em>{m[1]}</em>);
      i += m[0].length;
    } else if ((m = rest.match(/^\[([^\]]+)\]\(([^)\s]+)\)/))) {
      push(
        <a href={m[2]} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline hover:text-blue-700">
          {m[1]}
        </a>,
      );
      i += m[0].length;
    } else {
      // Eat up to the next potential token char or end
      const next = rest.search(/[`*[]/);
      const chunk = next === -1 ? rest : rest.slice(0, next || 1);
      push(chunk);
      i += chunk.length;
    }
  }
  return out;
}

function renderTable(rows, key) {
  // rows: array of raw lines like "| a | b |". First row = header, second = separator, rest = body.
  const split = (line) => line.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
  const header = split(rows[0]);
  const body = rows.slice(2).map(split);
  return (
    <div key={key} className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {header.map((h, i) => (
              <th key={i} className="border-b border-slate-200 px-2 py-1.5 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                {renderInline(h, `th-${i}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri} className="border-b border-slate-100 last:border-0">
              {row.map((cell, ci) => (
                <td key={ci} className="px-2 py-1.5 align-top text-slate-700">
                  {renderInline(cell, `td-${ri}-${ci}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function parseBlocks(src) {
  const lines = src.split("\n");
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (/^```/.test(line)) {
      const lang = line.slice(3).trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // consume closing ```
      blocks.push({ type: "code", lang, text: codeLines.join("\n") });
      continue;
    }

    // Heading
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      blocks.push({ type: "heading", level: h[1].length, text: h[2] });
      i++;
      continue;
    }

    // Horizontal rule
    if (/^---+\s*$/.test(line)) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    // GFM table — header row + separator row (---) + body rows. Need at least 2 lines.
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const rows = [line, lines[i + 1]];
      i += 2;
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        rows.push(lines[i]);
        i++;
      }
      blocks.push({ type: "table", rows });
      continue;
    }

    // Unordered list
    if (/^\s*-\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*-\s+/, ""));
        i++;
      }
      blocks.push({ type: "list", items });
      continue;
    }

    // Blank line → skip (paragraph break)
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph: accumulate consecutive non-blank, non-special lines
    const para = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^#{1,6}\s+/.test(lines[i]) &&
      !/^---+\s*$/.test(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !/^\s*-\s+/.test(lines[i]) &&
      !/^\s*\|.*\|\s*$/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push({ type: "paragraph", text: para.join("\n") });
  }
  return blocks;
}

export default function Markdown({ content, className = "" }) {
  if (!content) return null;
  const blocks = parseBlocks(content);
  return (
    <div className={`space-y-2 text-sm leading-relaxed text-slate-800 ${className}`}>
      {blocks.map((b, idx) => {
        switch (b.type) {
          case "heading": {
            const sizes = ["text-xl", "text-lg", "text-base", "text-sm", "text-sm", "text-sm"];
            const cls = `font-semibold text-slate-900 ${sizes[b.level - 1]}`;
            const Tag = `h${Math.min(b.level, 6)}`;
            return <Tag key={idx} className={cls}>{renderInline(b.text, `h-${idx}`)}</Tag>;
          }
          case "paragraph":
            return (
              <p key={idx} className="whitespace-pre-wrap">
                {renderInline(b.text, `p-${idx}`)}
              </p>
            );
          case "hr":
            return <hr key={idx} className="my-2 border-slate-200" />;
          case "list":
            return (
              <ul key={idx} className="list-disc space-y-1 pl-5">
                {b.items.map((it, ii) => (
                  <li key={ii}>{renderInline(it, `li-${idx}-${ii}`)}</li>
                ))}
              </ul>
            );
          case "code":
            return (
              <pre key={idx} className="overflow-x-auto rounded-md bg-slate-900 px-3 py-2 text-xs text-slate-100">
                <code>{b.text}</code>
              </pre>
            );
          case "table":
            return renderTable(b.rows, idx);
          default:
            return null;
        }
      })}
    </div>
  );
}
