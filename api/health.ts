// Health Check
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  res.status(200).json({ status: "healthy", name: "cse-predictor", version: "1.0.0", timestamp: new Date().toISOString() });
}