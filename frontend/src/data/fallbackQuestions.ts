import cData from "./cquestions.json";
import pyData from "./pythonquestions.json";
import { Question } from "../services/api";

function formatRawQuestions(raw: any, prefix: string, section: string): Question[] {
  const list = (raw as any).questions || raw;
  return list.map((q: any) => ({
    id: `${prefix}_${q.id}`,
    type: "mcq" as const,
    section,
    text: q.question || q.text,
    question: q.question || q.text,
    options: q.options,
    answer: q.answer,
  }));
}

const cQuestions: Question[] = formatRawQuestions(cData, "c", "C Language");
const pyQuestions: Question[] = formatRawQuestions(pyData, "py", "Python");

export function getFallbackQuestions(track: string): Question[] {
  return track.toLowerCase() === "python" ? pyQuestions : cQuestions;
}

