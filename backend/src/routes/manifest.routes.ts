/**
 * Manifest Routes – request validation schemas and route definitions.
 *
 * Endpoints:
 *   GET /api/v1/manifests?ownerPublicKey=G...&limit=20&skip=0
 *     Returns a paginated list of manifests owned by the given Stellar address.
 *
 * All Zod schemas are co-located with the routes that use them.
 * Regex constants follow the same Stellar address specifications used across
 * the rest of the codebase.
 */
import { Router } from "express";
import { z } from "zod";
import type { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import { verifyJWT } from '../middlewares/jwt.middleware';
import { manifestController } from "../controllers/manifest.controller";

// ---------------------------------------------------------------------------
// Validation patterns
// ---------------------------------------------------------------------------
const STELLAR_PUBLIC_KEY_REGEX = /^G[A-Z2-7]{55}$/;

// ---------------------------------------------------------------------------
// Zod schema – query parameters for the manifest list endpoint
// ---------------------------------------------------------------------------
const listManifestsQuerySchema = z.object({
  ownerPublicKey: z
    .string()
    .regex(STELLAR_PUBLIC_KEY_REGEX, "Invalid Stellar public key (G...)"),
  limit: z
    .string()
    .optional()
    .default("20")
    .transform(Number)
    .pipe(
      z
        .number()
        .int("limit must be an integer")
        .min(1, "limit must be at least 1")
        .max(100, "limit must be at most 100")
    ),
  skip: z
    .string()
    .optional()
    .default("0")
    .transform(Number)
    .pipe(
      z
        .number()
        .int("skip must be an integer")
        .min(0, "skip must be a non-negative integer")
    ),
});

const createManifestBodySchema = z.object({
  contentHash: z.string().min(1, "contentHash is required"),
  creator: z
    .string()
    .regex(STELLAR_PUBLIC_KEY_REGEX, "Invalid Stellar public key (G...)")
    .optional(),
  timestamp: z
    .preprocess((value) => {
      if (typeof value === "string") {
        return new Date(value);
      }
      return value;
    }, z.date().refine((date) => !Number.isNaN(date.getTime()), {
      message: "Invalid timestamp",
    }))
    .optional(),
  metadata: z.record(z.unknown()).optional(),
}).strict();

// ---------------------------------------------------------------------------
// Query validation middleware
// ---------------------------------------------------------------------------

function validateListManifestsQuery(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const result = listManifestsQuerySchema.safeParse(req.query);
  if (!result.success) {
    res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      error: "Invalid query parameters",
      details: result.error.flatten().fieldErrors,
    });
    return;
  }
  req.query = result.data as unknown as typeof req.query;
  next();
}

function validateCreateManifestBody(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const result = createManifestBodySchema.safeParse(req.body);
  if (!result.success) {
    res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      error: "Invalid manifest payload",
      details: result.error.flatten().fieldErrors,
    });
    return;
  }

  req.body = result.data as unknown as typeof req.body;
  next();
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const router = Router();

/**
 * GET /api/v1/manifests?ownerPublicKey=G...&limit=20&skip=0
 * Returns a paginated list of manifests for the given owner, newest-first.
 */
router.get(
  "/",
  validateListManifestsQuery,
  manifestController.listManifests.bind(manifestController)
);

/**
 * POST /api/v1/manifests
 * Authenticated endpoint for saving a generated manifest.
 */
router.post(
  "/",
  verifyJWT,
  validateCreateManifestBody,
  manifestController.createManifest.bind(manifestController)
);

export default router;
