import { unified } from "unified";
import remarkParse from "remark-parse";

/**
 * Convert Markdown text to ClickUp's structured comment format
 * https://developer.clickup.com/docs/comment-formatting
 */
export function markdownToClickUpComment(
  markdown: string
): Array<{ text: string; attributes?: any }> {
  // Parse the markdown
  const parser = unified().use(remarkParse);
  const tree = parser.parse(markdown);

  const result: Array<{ text: string; attributes?: any }> = [];

  // Simple visitor function to convert AST to ClickUp format
  function visit(node: any) {
    switch (node.type) {
      case "text":
        result.push({ text: node.value });
        break;

      case "strong":
      case "emphasis":
        const children: Array<{ text: string; attributes?: any }> = [];
        node.children.forEach((child: any) => {
          if (child.type === "text") {
            children.push({ text: child.value });
          }
        });
        if (children.length > 0 && children[0].text) {
          result.push({
            text: children[0].text,
            attributes:
              node.type === "strong" ? { bold: true } : { italic: true },
          });
        }
        break;

      case "inlineCode":
        result.push({
          text: node.value,
          attributes: { code: true },
        });
        break;

      case "paragraph":
        node.children.forEach(visit);
        break;

      case "heading":
      case "list":
      case "listItem":
        // For now, convert to plain text
        if (node.children) {
          node.children.forEach(visit);
        }
        result.push({ text: " " }); // Add space for readability
        break;

      default:
        if (node.children) {
          node.children.forEach(visit);
        }
        break;
    }
  }

  // Process the tree
  (tree as any).children.forEach(visit);

  // If no structured content was produced, just return the original text
  if (result.length === 0) {
    return [{ text: markdown }];
  }

  return result;
}

/**
 * Simplified version that handles common markdown patterns
 * More reliable for basic use cases
 */
export function simpleMarkdownToClickUp(
  markdown: string
): Array<{ text: string; attributes?: any }> {
  const result: Array<{ text: string; attributes?: any }> = [];
  let i = 0;
  let currentText = "";
  let inBold = false;
  let inItalic = false;
  let inCode = false;

  const flushText = () => {
    if (currentText) {
      const attributes: any = {};
      if (inBold) attributes.bold = true;
      if (inItalic) attributes.italic = true;
      if (inCode) attributes.code = true;

      result.push({
        text: currentText,
        attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
      });
      currentText = "";
    }
  };

  while (i < markdown.length) {
    const char = markdown[i];
    const nextChar = markdown[i + 1];

    // Code blocks (inline)
    if (char === "`") {
      flushText();
      inCode = !inCode;
      i++;
      continue;
    }

    // Bold (double asterisk)
    if (char === "*" && nextChar === "*") {
      flushText();
      inBold = !inBold;
      i += 2;
      continue;
    }

    // Italic (single asterisk or underscore)
    if ((char === "*" || char === "_") && nextChar !== "*") {
      flushText();
      inItalic = !inItalic;
      i++;
      continue;
    }

    // Collect regular characters
    currentText += char;
    i++;
  }

  // Flush any remaining text
  flushText();

  // If nothing was added, return plain text
  if (result.length === 0) {
    return [{ text: markdown }];
  }

  return result;
}
