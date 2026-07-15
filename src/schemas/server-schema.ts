import { z } from 'zod';

export const requestMessageSchema = z.object({
    requestType: z.enum(['HTTP']),
    headers: z.any(),
    body: z.any(),
    url: z.string(),
    requestIP: z.string(),
    requestPort: z.number()
})

export type RequestMessageSchema = z.infer<typeof requestMessageSchema>

export const responseMessageSchema = z.object({
    responseType: z.enum(['HTTP']),
    headers: z.any(),
    body: z.any(),
    statusCode: z.number(),
    statusMessage: z.string()
})

export type ResponseMessageSchema = z.infer<typeof responseMessageSchema>