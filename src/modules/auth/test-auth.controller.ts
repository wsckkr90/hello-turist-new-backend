import { Request, Response } from "express";
import { z } from "zod";
import { registerTestDriver } from "./auth.service";

const testDriverSchema = z.object({
  name: z.string().trim().min(2).max(120),
  username: z.string().trim().min(3).max(80).regex(/^[a-zA-Z0-9_.-]+$/),
  email: z.string().email().optional(),
  password: z.string().min(8).max(128),
});

function testEndpointsEnabled(req: Request) {
  const expectedKey = process.env.TEST_API_KEY?.trim();
  return process.env.ENABLE_TEST_ENDPOINTS === "true" &&
    !!expectedKey &&
    req.header("X-Test-Api-Key") === expectedKey;
}

export async function registerTestDriverController(req: Request, res: Response) {
  if (!testEndpointsEnabled(req)) {
    return res.status(404).json({
      success: false,
      data: null,
      error: { code: "NOT_FOUND", message: "Not found" },
      requestId: req.requestId,
    });
  }

  const parsed = testDriverSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: "VALIDATION_ERROR", message: "Invalid test driver data" },
      requestId: req.requestId,
    });
  }

  try {
    const user = await registerTestDriver(parsed.data);
    return res.status(201).json({
      success: true,
      data: { user },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "USERNAME_ALREADY_EXISTS") {
        return res.status(409).json({
          success: false, data: null,
          error: { code: error.message, message: "Username is already registered" },
          requestId: req.requestId,
        });
      }
      if (error.message === "EMAIL_ALREADY_EXISTS") {
        return res.status(409).json({
          success: false, data: null,
          error: { code: error.message, message: "Email is already registered" },
          requestId: req.requestId,
        });
      }
    }

    console.error("TEST_DRIVER_REGISTER_ERROR:", error);
    return res.status(500).json({
      success: false,
      data: null,
      error: { code: "INTERNAL_SERVER_ERROR", message: "Something went wrong" },
      requestId: req.requestId,
    });
  }
}
