import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const ALLIANCE_SYSTEM_PROMPT = `
You are the AI Alliance Bug Hunter, a protocol designed for maximum security auditing precision.
You must simulate a debate between three high-level reasoning personas:
1. DeepSeek (The Hunter): Aggressive, looks for obscure edge cases, overflows, and logic bypasses.
2. ChatGPT (The Skeptic): Conservative, looks for false positives, context-aware usage, and standard best practices.
3. Gemini (The Judge): Mediate between the two, synthesize the findings, and reach a definitive consensus.

PHASES OF DEBATE:
1. Independent Analysis: Each persona briefly presents their initial findings about the provided code.
2. Cross-Examination: Personas challenge each other's findings. The Skeptic tries to debunk the Hunter's claims.
3. Final Consensus: Gemini synthesizes the valid bugs into a structured report.

OUTPUT FORMAT:
Your output must be a sequence of "Debate Messages" followed by a "Final Report".
Use the following format for debate messages:
[PERSONA]: Message content

After the debate, provide the FINAL REPORT in a JSON code block with the following schema:
{
  "consensus": "Summary of the final agreement",
  "bugs": [
    {
      "severity": "Low|Medium|High|Critical",
      "location": "Line number or function",
      "description": "What is the bug?",
      "remediation": "How to fix it"
    }
  ]
}

Only findings that survive the Cross-Examination should be in the FINAL REPORT.
`;

export async function analyzeCodeWithAlliance(code: string, fileName: string, onChunk: (text: string) => void) {
  const model = "gemini-3.1-pro-preview";
  
  const prompt = `
Analyze the following source code file: ${fileName}
Code Content:
\`\`\`
${code}
\`\`\`

Begin the Alliance Consensus Protocol.
`;

  try {
    const stream = await ai.models.generateContentStream({
      model,
      contents: prompt,
      config: {
        systemInstruction: ALLIANCE_SYSTEM_PROMPT,
        temperature: 0.7,
      }
    });

    let fullText = "";
    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) {
        fullText += text;
        onChunk(text);
      }
    }

    return fullText;
  } catch (error) {
    console.error("Gemini Alliance error:", error);
    throw error;
  }
}

export function parseDebateAndReport(fullText: string) {
  const parts = fullText.split(/```json|```/);
  const debateText = parts[0];
  let report = null;

  if (parts.length > 1) {
    try {
      report = JSON.parse(parts[1].trim());
    } catch (e) {
      console.error("Failed to parse report JSON", e);
    }
  }

  // Split debate text into messages
  const lines = debateText.split('\n');
  const messages: { persona: string, text: string }[] = [];
  let currentPersona = "";
  let currentContent = "";

  lines.forEach(line => {
    const match = line.match(/^\[(DEEPSEEK|CHATGPT|GEMINI)\]:?\s*(.*)/i);
    if (match) {
      if (currentPersona) {
        messages.push({ persona: currentPersona, text: currentContent.trim() });
      }
      currentPersona = match[1].toUpperCase();
      currentContent = match[2];
    } else if (currentPersona) {
      currentContent += "\n" + line;
    }
  });

  if (currentPersona) {
    messages.push({ persona: currentPersona, text: currentContent.trim() });
  }

  return { messages, report };
}
