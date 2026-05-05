import { Router } from "express";
import { fetchLevelValues } from "../upClient.js";
import * as cache from "../cache.js";

const router = Router();

router.get("/", async (_req, res, next) => {
  try {
    const cached = cache.getLevels("districts");
    if (cached) return res.json({ data: cached, cached: true });

    const data = await fetchLevelValues(1, "");
    cache.setLevels("districts", data);
    res.json({ data, cached: false });
  } catch (err) {
    next(err);
  }
});

export default router;
