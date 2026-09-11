import cQuestions from "./questions_c.json";
import pyQuestions from "./questions_python.json";
import { Question } from "../services/api";

export function getFallbackQuestions(track: string): Question[] {
  const coding = (track.toLowerCase() === "python" ? pyQuestions : cQuestions) as Question[];
  return coding;
}

