import { z } from "zod";

export const HAZARDS = ['flood', 'cyclone', 'landslide', 'heatwave', 'thunderstorm', 'tsunami'];

const district = z.string().trim().max(100, 'District name must be less than 100 characters');

export const createAlertSchema = z.strictObject({
    district,
    hazard: z.enum(HAZARDS, 'Invalid hazard type'),
    severity: z.number().int().min(1, 'Severity must be at least 1').max(5, 'Severity must be at most 5'),
    title: z.string().trim().min(3, 'Title must be at least 3 characters').max(200, 'Title must be less than 200 characters'),
    message: z.string().trim().min(10, 'Message must be at least 10 characters').max(1000, 'Message must be less than 1000 characters'),
    // without an explicit error, a missing value reads "expected date, received Date"
    expiresAt: z.coerce
        .date({ error: 'expiresAt must be an ISO 8601 date-time' })
        .refine((d) => d > new Date(), 'expiresAt must be in the future'),
});

export const listQuerySchema = z.object({
    district: district.optional(),
    hazard: z.enum(HAZARDS).optional(),
    minSeverity: z.coerce.number().int().min(1).max(5).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().regex(/^\d{1,18}$/, 'cursor must be numeric').optional(),
});

export const idParamsSchema = z.object({
    id: z.string().regex(/^\d{1,18}$/, 'id must be numeric'),
});