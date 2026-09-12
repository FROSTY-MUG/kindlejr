import cRaw from "../data/cquestions.json";
import pyRaw from "../data/pythonquestions.json";

export function normalizeAnswer(ans: string | undefined): string {
  if (!ans) return "";
  return ans.toLowerCase().trim().replace(/\s+/g, " ");
}

export function getQuestionsForTrack(track: string): any[] {
  const raw = track.toLowerCase() === "python" ? pyRaw : cRaw;
  const list = (raw as any).questions || raw;
  const prefix = track.toLowerCase() === "python" ? "py" : "c";

  return (list as any[]).map((q: any) => {
    let correctText = "";
    const optionsArr: string[] = [];
    if (q.options && typeof q.options === "object" && !Array.isArray(q.options)) {
      for (const [key, val] of Object.entries(q.options)) {
        optionsArr.push(String(val));
        if (key.toUpperCase() === String(q.answer).toUpperCase()) {
          correctText = String(val);
        }
      }
    } else if (Array.isArray(q.options)) {
      optionsArr.push(...q.options);
    }

    return {
      id: `${prefix}_${q.id}`,
      text: q.question || q.text,
      options: optionsArr,
      answer: correctText || q.answer,
      rawLetterAnswer: q.answer,
    };
  });
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
      if (!isCorrect && q.rawLetterAnswer) {
        const rawLetter = String(q.rawLetterAnswer).toLowerCase();
        if (
          normUser === rawLetter ||
          normUser === `${rawLetter})` ||
          normUser === `${rawLetter}.` ||
          normUser === `option ${rawLetter}`
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

