import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { DomainError } from "../domain/sceneReducer";

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export function apiError(error: unknown, fallback = "The request could not be completed.") {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  if (error instanceof DomainError) {
    const status = error.code === "FORBIDDEN" ? 403 : error.code.endsWith("NOT_FOUND") ? 404 : 409;
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Check the highlighted values.", fields: error.flatten().fieldErrors } }, { status: 400 });
  }
  const message = error instanceof Error ? error.message : "";
  if (/DM username or password is incorrect|That DM username is already taken|That password reset code is invalid or expired/.test(message)) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message } }, { status: 400 });
  }
  return NextResponse.json({ error: { code: "REQUEST_FAILED", message: fallback } }, { status: 503 });
}
