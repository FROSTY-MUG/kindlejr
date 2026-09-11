import { NextRequest, NextResponse } from "next/server";
import cData from "../../../../data/questions_c.json";
import pythonData from "../../../../data/questions_python.json";

export async function GET(
  req: NextRequest,
  { params }: { params: { track: string } }
) {
  try {
    const track = params.track?.toLowerCase() || "c";
    const codingQuestions = track === "python" ? pythonData : cData;

    // Strip answers for cheat protection
    const questions = (codingQuestions as any[]).map((q) => {
      const { answer, ...clientQuestion } = q;
      return clientQuestion;
    });

    return NextResponse.json(questions);
  } catch (err: any) {
    console.error("[API questions] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

