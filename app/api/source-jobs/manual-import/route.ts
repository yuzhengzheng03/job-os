import { NextResponse } from "next/server";
import { manualImportService } from "@/src/services/manual-import-service";

export async function POST(request: Request) {
  const body = await request.json();

  if (!body.userId || !body.sourceId || !body.url || !body.rawText) {
    return NextResponse.json(
      {
        error: "userId, sourceId, url, and rawText are required"
      },
      { status: 400 }
    );
  }

  const result = await manualImportService.import({
    userId: body.userId,
    sourceId: body.sourceId,
    url: body.url,
    rawText: body.rawText,
    companyName: body.companyName,
    title: body.title,
    location: body.location
  });

  return NextResponse.json(result, { status: 201 });
}

