import {
  CODE_DATA,
  KEYWORDS,
  SYMBOL_LINKS,
  FILE_PRIMARY_TYPES,
  TYPE_METHOD_LINKS,
  TYPE_MEMBER_TYPES,
  TYPE_CONTEXTS
} from "./data.js";

export function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderLink(className, label, fileName, anchor) {
  const anchorAttr = anchor ? ` data-anchor="${anchor}"` : "";
  return `<span class="${className}" data-file="${fileName}"${anchorAttr}>${label}</span>`;
}

export function isMethodDeclaration(line, methodName) {
  const trimmedLine = line.trim();
  if (!trimmedLine.includes(`${methodName}(`)) {
    return false;
  }

  if (/^(return|if|for|while|switch|catch|throw|new)\b/.test(trimmedLine)) {
    return false;
  }

  if (trimmedLine.includes(`.${methodName}(`)) {
    return false;
  }

  const declarationPattern = new RegExp(
    `^\\s*(?:@\\w+\\s+)?(?:public|private|protected)?(?:\\s+(?:static|final|synchronized|abstract|default|native|strictfp))*\\s*(?:<[\\w\\s,?]+>\\s+)?(?:[\\w.<>\\[\\],?]+\\s+)+${methodName}\\s*\\(`
  );
  return declarationPattern.test(line);
}

function findReceiverExpression(prefix) {
  const match = prefix.match(/([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*\.\s*$/);
  return match?.[1] || null;
}

function resolveExpressionType(fileName, expression) {
  const parts = expression.split(".");
  let currentType = TYPE_CONTEXTS[fileName]?.[parts[0]];

  if (!currentType) {
    return null;
  }

  for (let index = 1; index < parts.length; index += 1) {
    currentType = TYPE_MEMBER_TYPES[currentType]?.[parts[index]];
    if (!currentType) {
      return null;
    }
  }

  return currentType;
}

function resolveMethodTarget(fileName, line, lineIndex, methodName, offset) {
  const receiverExpression = findReceiverExpression(line.slice(0, offset));
  if (receiverExpression) {
    const receiverType = resolveExpressionType(fileName, receiverExpression);
    return receiverType ? TYPE_METHOD_LINKS[receiverType]?.[methodName] || null : null;
  }

  if (isMethodDeclaration(line, methodName)) {
    return null;
  }

  const nextLocalOccurrence = getMethodOccurrences(fileName).find((item) =>
    item.name === methodName && item.lineIndex > lineIndex
  );
  if (nextLocalOccurrence) {
    return { file: fileName, anchor: nextLocalOccurrence.anchor };
  }

  const currentType = FILE_PRIMARY_TYPES[fileName];
  return TYPE_METHOD_LINKS[currentType]?.[methodName] || null;
}

export function getMethodOccurrences(fileName) {
  const file = CODE_DATA[fileName];
  const counts = {};

  return file.code.split("\n").flatMap((line, lineIndex) =>
    file.methods.flatMap((method) => {
      if (!isMethodDeclaration(line, method.name)) {
        return [];
      }

      counts[method.name] = (counts[method.name] || 0) + 1;
      const occurrenceIndex = counts[method.name];

      return [{
        name: method.name,
        lineIndex,
        anchor: occurrenceIndex === 1 ? method.id : `${method.id}-${occurrenceIndex}`
      }];
    })
  );
}

export function highlightLine(line, fileName, lineIndex) {
  let codePart = line;
  let commentPart = "";
  const commentIdx = line.indexOf("//");
  const blockCommentIdx = line.indexOf("/*");
  const finalCommentIdx = commentIdx !== -1 ? commentIdx : blockCommentIdx;

  if (finalCommentIdx !== -1) {
    codePart = line.slice(0, finalCommentIdx);
    commentPart = `<span class="comment">${escapeHtml(line.slice(finalCommentIdx))}</span>`;
  }

  const classNames = Object.keys(CODE_DATA).map((name) => name.replace(".java", ""));
  const tokenRegex = /(@\w+)|(\b\w+\b)(?=\s*\()|(\b\w+\b)|([^\w\s]+)|(\s+)/g;

  function formatCodeSegment(segment, baseOffset) {
    return segment.replace(
      tokenRegex,
      (match, annotation, methodWord, word, operator, space, offset) => {
        const absoluteOffset = baseOffset + offset;
        if (annotation) return `<span class="anno">${escapeHtml(annotation)}</span>`;
        if (methodWord) {
          if (SYMBOL_LINKS[methodWord]) {
            const { file, anchor } = SYMBOL_LINKS[methodWord];
            return renderLink("class-link", methodWord, file, anchor);
          }
          if (classNames.includes(methodWord)) {
            return renderLink("class-link", methodWord, `${methodWord}.java`);
          }

          const methodTarget = resolveMethodTarget(fileName, codePart, lineIndex, methodWord, absoluteOffset);
          if (methodTarget) {
            return renderLink("method-link", methodWord, methodTarget.file, methodTarget.anchor);
          }

          if (/^[A-Z]/.test(methodWord)) return `<span class="type">${methodWord}</span>`;
          return methodWord;
        }
        if (word) {
          if (KEYWORDS.has(word)) return `<span class="kw">${word}</span>`;
          if (SYMBOL_LINKS[word]) {
            const { file, anchor } = SYMBOL_LINKS[word];
            return renderLink("class-link", word, file, anchor);
          }
          if (classNames.includes(word)) {
            return renderLink("class-link", word, `${word}.java`);
          }
          if (/^[A-Z]/.test(word)) return `<span class="type">${word}</span>`;
          return word;
        }
        if (operator) return `<span class="op">${escapeHtml(operator)}</span>`;
        return space || match;
      }
    );
  }

  const stringRegex = /"(?:\\.|[^"\\])*"/g;
  let formattedCode = "";
  let cursor = 0;

  for (const match of codePart.matchAll(stringRegex)) {
    const stringStart = match.index ?? 0;
    const stringValue = match[0];

    formattedCode += formatCodeSegment(codePart.slice(cursor, stringStart), cursor);
    formattedCode += `<span class="string">${escapeHtml(stringValue)}</span>`;
    cursor = stringStart + stringValue.length;
  }

  formattedCode += formatCodeSegment(codePart.slice(cursor), cursor);

  return formattedCode + commentPart;
}
