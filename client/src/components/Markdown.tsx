import type React from "react";

// ── Inline formatting (bold, italic, code) ──────────────────
function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2)
      return <em key={i}>{part.slice(1, -1)}</em>;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2)
      return <code key={i} className="md-inline-code">{part.slice(1, -1)}</code>;
    return part;
  });
}

// ── Block-level markdown renderer ───────────────────────────
export function Markdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = text.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      blocks.push(
        <pre key={blocks.length} className="md-pre">
          <code>{codeLines.join("\n")}</code>
        </pre>
      );
      i++;
      continue;
    }

    // Headings
    if (line.startsWith("### ")) {
      blocks.push(<h4 key={blocks.length} className="md-h3">{renderInline(line.slice(4))}</h4>);
    } else if (line.startsWith("## ")) {
      blocks.push(<h3 key={blocks.length} className="md-h2">{renderInline(line.slice(3))}</h3>);
    } else if (line.startsWith("# ")) {
      blocks.push(<h2 key={blocks.length} className="md-h1">{renderInline(line.slice(2))}</h2>);
    }
    // Horizontal rule
    else if (/^-{3,}$/.test(line) || /^\*{3,}$/.test(line)) {
      blocks.push(<hr key={blocks.length} className="md-hr" />);
    }
    // Blockquote
    else if (line.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      blocks.push(
        <blockquote key={blocks.length} className="md-blockquote">
          {quoteLines.map((ql, idx) => <p key={idx}>{renderInline(ql)}</p>)}
        </blockquote>
      );
      continue;
    }
    // Bullet list
    else if (/^[-*+]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s/.test(lines[i])) {
        items.push(lines[i].slice(2));
        i++;
      }
      blocks.push(
        <ul key={blocks.length} className="md-ul">
          {items.map((item, idx) => <li key={idx}>{renderInline(item)}</li>)}
        </ul>
      );
      continue;
    }
    // Numbered list
    else if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ""));
        i++;
      }
      blocks.push(
        <ol key={blocks.length} className="md-ol">
          {items.map((item, idx) => <li key={idx}>{renderInline(item)}</li>)}
        </ol>
      );
      continue;
    }
    // Empty line
    else if (line.trim() === "") {
      // spacing
    }
    // Paragraph
    else {
      blocks.push(<p key={blocks.length} className="md-p">{renderInline(line)}</p>);
    }

    i++;
  }

  return <div className="md-content">{blocks}</div>;
}
