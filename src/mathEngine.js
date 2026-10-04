/**
 * Math Engine for DreamAi
 * Evaluates arithmetic, logarithms, powers, roots, trigonometry, and Minecraft unit math.
 */

// Harmful or unsafe tokens to reject in eval
const BLACKLIST = /(?:process|global|require|import|module|constructor|prototype|window|document|fetch|eval|Function|while|for|setTimeout|setInterval)/i;

/**
 * Evaluates a single math expression safely
 */
export function evaluateMath(rawExpr) {
  if (!rawExpr || typeof rawExpr !== 'string') return null;
  const trimmed = rawExpr.trim();
  if (BLACKLIST.test(trimmed)) return null;

  try {
    let clean = trimmed
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/\\times/g, '*')
      .replace(/\\cdot/g, '*')
      .replace(/\^/g, '**');

    // Strip leading zeroes from numbers so JS does not treat as octals (e.g. 02938470 -> 2938470)
    clean = clean.replace(/\b0+([1-9]\d*)\b/g, '$1');

    // Minecraft units:
    // e.g. "5 stacks" -> "5 * 64", "2 shulkers" -> "2 * 1728"
    clean = clean.replace(/(\d+)\s*(?:stacks?|stk)\b/gi, '$1 * 64');
    clean = clean.replace(/(\d+)\s*(?:shulkers?|shulker\s*boxes?)\b/gi, '$1 * 1728');
    clean = clean.replace(/(\d+)\s*(?:double\s*chests?)\b/gi, '$1 * 3456');

    // Logarithms
    clean = clean.replace(/(\d+)\s*log(?:10)?\s*\(?([0-9.]+)\)?/gi, '$1 * Math.log10($2)');
    clean = clean.replace(/(?:^|[^\w.])log(?:10)?\s*\(?([0-9.]+)\)?/gi, 'Math.log10($1)');
    clean = clean.replace(/log2\s*\(?([0-9.]+)\)?/gi, 'Math.log2($1)');
    clean = clean.replace(/ln\s*\(?([0-9.]+)\)?/gi, 'Math.log($1)');

    // Roots & powers
    clean = clean.replace(/sqrt\s*\(?([0-9.]+)\)?/gi, 'Math.sqrt($1)');
    clean = clean.replace(/cbrt\s*\(?([0-9.]+)\)?/gi, 'Math.cbrt($1)');

    // Trig
    clean = clean.replace(/sin\s*\(?([0-9.]+)\)?/gi, 'Math.sin($1)');
    clean = clean.replace(/cos\s*\(?([0-9.]+)\)?/gi, 'Math.cos($1)');
    clean = clean.replace(/tan\s*\(?([0-9.]+)\)?/gi, 'Math.tan($1)');
    clean = clean.replace(/abs\s*\(?([0-9.]+)\)?/gi, 'Math.abs($1)');

    // Constants
    clean = clean.replace(/\bpi\b/gi, 'Math.PI');
    clean = clean.replace(/\be\b/gi, 'Math.E');

    // Only allow safe math characters: digits, operators, parens, Math methods
    if (!/^[0-9+\-*/().,%\s\w]+$/.test(clean)) return null;

    const fn = new Function('Math', `"use strict"; return (${clean});`);
    const result = fn(Math);

    if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
      if (Number.isInteger(result)) {
        return { value: result, formatted: result.toLocaleString('en-US') };
      } else {
        const rounded = Math.round(result * 100000) / 100000;
        return { value: result, formatted: String(rounded) };
      }
    }
  } catch (err) {
    return null;
  }
  return null;
}

/**
 * Scans a user message for math problems and returns verified ground truth text
 */
export function analyzeMathInMessage(message) {
  if (!message) return null;
  const clean = message.trim();

  const results = [];

  // Special Check: 2log2 or log expressions with ambiguous bases
  const logMatch = clean.match(/(?:(\d+)\s*)?log(?:arithm)?(?:\s*of)?\s*\(?(\d+)\)?/i);
  if (logMatch) {
    const coeff = Number(logMatch[1] || 1);
    const arg = Number(logMatch[2]);
    if (arg > 0) {
      const base10 = Math.round(coeff * Math.log10(arg) * 100000) / 100000;
      const base2 = Math.round(coeff * Math.log2(arg) * 100000) / 100000;
      const natural = Math.round(coeff * Math.log(arg) * 100000) / 100000;

      results.push(`Expression: "${clean}"
- If common log (base 10): ${coeff > 1 ? `${coeff} × ` : ''}log₁₀(${arg}) ≈ ${base10}
- If binary log (base 2): ${coeff > 1 ? `${coeff} × ` : ''}log₂(${arg}) = ${base2}
- If natural log (ln, base e): ${coeff > 1 ? `${coeff} × ` : ''}ln(${arg}) ≈ ${natural}`);
    }
  }

  // Arithmetic Patterns (e.g. 02938470 + 9823749, 15 * 84, 500 / 25, 2^16)
  const mathCandidates = [
    // Expression with operators
    clean.match(/(?:what\s+is|what's|calculate|eval|tell\s+me\s+)?([0-9]+(?:\.[0-9]+)?\s*[\+\-\*\/×÷\^%]\s*[0-9]+(?:\.[0-9]+)?(?:\s*[\+\-\*\/×÷\^%]\s*[0-9]+(?:\.[0-9]+)?)*)/i),
    // Square root
    clean.match(/(?:sqrt|square\s+root\s+of)\s*\(?([0-9.]+)\)?/i)
  ];

  for (const match of mathCandidates) {
    if (match && match[1]) {
      const expr = match[1].trim();
      const res = evaluateMath(expr);
      if (res !== null) {
        // Also compute with BigInt if both operands are large integers
        let bigIntVal = null;
        try {
          const parts = expr.split(/\s*\+\s*/);
          if (parts.length === 2 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
            const sum = BigInt(parts[0]) + BigInt(parts[1]);
            bigIntVal = sum.toLocaleString('en-US');
          }
        } catch (e) {}

        const finalFormatted = bigIntVal || res.formatted;
        results.push(`Calculation: "${expr}" = ${finalFormatted}`);
      }
    }
  }

  if (results.length === 0) return null;
  return results.join('\n');
}

/**
 * Replaces any [CALC: ...] tags in AI response with computed values
 */
export function processCalcTags(text) {
  if (!text) return text;
  return text.replace(/\[CALC:\s*([^\]]+)\]/gi, (match, expr) => {
    const res = evaluateMath(expr);
    return res ? res.formatted : match;
  });
}
