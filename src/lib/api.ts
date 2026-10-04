import "server-only";
import mongoose from "mongoose";
import { MissingDatabaseConfigError } from "./db";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

/** Wraps a route handler: converts thrown errors into `{ error: { code, message } }` JSON. */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof ApiError) {
        return Response.json({ error: { code: err.code, message: err.message, ...err.details } }, { status: err.status });
      }
      if (err instanceof MissingDatabaseConfigError) {
        return Response.json({ error: { code: "DB_NOT_CONFIGURED", message: err.message } }, { status: 503 });
      }
      if ((err as { code?: number })?.code === 11000) {
        // A unique index caught a concurrent duplicate (double tap, two tabs, scripted race).
        return Response.json(
          { error: { code: "CONFLICT", message: "That clashes with something already in progress. Refresh and try again." } },
          { status: 409 },
        );
      }
      if (err instanceof mongoose.Error.CastError) {
        return Response.json({ error: { code: "NOT_FOUND", message: "Not found." } }, { status: 404 });
      }
      console.error(err);
      return Response.json(
        { error: { code: "SERVER_ERROR", message: "Something went wrong. Please try again." } },
        { status: 500 },
      );
    }
  };
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ApiError(400, "BAD_JSON", "Invalid request body.");
  }
}

export function str(v: unknown, max = 200): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export function int(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.round(n) : NaN;
}
