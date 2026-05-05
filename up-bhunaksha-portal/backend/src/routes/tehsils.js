import { Router } from "express";
import { fetchLevelValues } from "../upClient.js";
import * as cache from "../cache.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const district = String(req.query.district || "").trim();
    if (!district) {
      return res.status(400).json({ error: "Missing required query param: district" });
    }

    const key = `tehsils:${district}`;
    const cached = cache.getLevels(key);
    if (cached) return res.json({ data: cached, cached: true });

    const data = await fetchLevelValues(2, district);
    cache.setLevels(key, data);
    res.json({ data, cached: false });
  } catch (err) {
    next(err);
  }
});

export default router;
