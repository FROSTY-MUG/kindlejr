import cData from "../data/questions_c.json";
import pythonData from "../data/questions_python.json";

export function normalizeAnswer(ans: string | undefined): string {
  if (!ans) return "";
  return ans.toLowerCase().trim().replace(/\s+/g, " ");
}

export function getQuestionsForTrack(track: string): any[] {
  return track.toLowerCase() === "python" ? pythonData : cData;
}

export function getAnswerKey(track: string): Record<string, string> {
  const answerKey: Record<string, string> = {};
  const questions = getQuestionsForTrack(track || "c");

  questions.forEach((q: any) => {
    if (q.id && q.answer) answerKey[q.id] = q.answer;
  });

  return answerKey;
}

export function gradeAnswers(
  track: string,
  answers: Record<string, string>
): {
  totalScore: number;
  correctCount: number;
  incorrectCount: number;
  unattemptedCount: number;
} {
  const questions = getQuestionsForTrack(track || "c");
  let correctCount = 0;
  let incorrectCount = 0;
  let unattemptedCount = 0;

  for (const q of questions) {
    const qId = q.id;
    const correctAns = q.answer;
    const userAns = answers[qId];

    if (!userAns || userAns.trim() === "") {
      unattemptedCount++;
      continue;
    }

    const normUser = normalizeAnswer(userAns);
    const normCorrect = normalizeAnswer(correctAns);

    let isCorrect = normUser === normCorrect;

    // Check letter option fallback (A, B, C, D)
    if (!isCorrect && q.options && Array.isArray(q.options)) {
      const correctIdx = q.options.findIndex(
        (opt: string) => normalizeAnswer(opt) === normCorrect
      );
      if (correctIdx !== -1) {
        const correctLetter = String.fromCharCode(65 + correctIdx).toLowerCase();
        if (
          normUser === correctLetter ||
          normUser === `${correctLetter})` ||
          normUser === `${correctLetter}.` ||
          normUser === `option ${correctLetter}`
        ) {
          isCorrect = true;
        }
      }
    }

    if (isCorrect) {
      correctCount++;
    } else {
      incorrectCount++;
    }
  }

  return {
    totalScore: correctCount,
    correctCount,
    incorrectCount,
    unattemptedCount,
  };
}

