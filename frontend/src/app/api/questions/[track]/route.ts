import { NextRequest, NextResponse } from "next/server";
import cData from "../../../../data/cquestions.json";
import pythonData from "../../../../data/pythonquestions.json";

export async function GET(
  req: NextRequest,
  { params }: { params: { track: string } }
) {
  try {
    const track = params.track?.toLowerCase() || "c";
    const rawData = track === "python" ? pythonData : cData;
    const list = (rawData as any).questions || rawData;
    const prefix = track === "python" ? "py" : "c";
    const section = track === "python" ? "Python" : "C Language";

    // Strip answers for cheat protection and normalize Question shape
    const questions = (list as any[]).map((q) => {
      const optionsArr = [];
      if (q.options && typeof q.options === "object" && !Array.isArray(q.options)) {
        for (const letter of ["A", "B", "C", "D"]) {
          if (q.options[letter]) {
            optionsArr.push(q.options[letter]);
          }
        }
      } else if (Array.isArray(q.options)) {
        optionsArr.push(...q.options);
      }

      return {
        id: `${prefix}_${q.id}`,
        type: "mcq",
        section,
        text: q.question || q.text,
        question: q.question || q.text,
        options: optionsArr.length > 0 ? optionsArr : q.options,
      };
    });

    return NextResponse.json(questions);
  } catch (err: any) {
    console.error("[API questions] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

