import { Router } from "express";
import { fetchLevelValues } from "../upClient.js";
import * as cache from "../cache.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const district = String(req.query.district || "").trim();
    const tehsil = String(req.query.tehsil || "").trim();
    if (!district || !tehsil) {
      return res
        .status(400)
        .json({ error: "Missing required query params: district, tehsil" });
    }

    const key = `villages:${district}:${tehsil}`;
    const cached = cache.getLevels(key);
    if (cached) return res.json({ data: cached, cached: true });

    const data = await fetchLevelValues(3, `${district},${tehsil}`);
    cache.setLevels(key, data);
    res.json({ data, cached: false });
  } catch (err) {
    next(err);
  }
});

export default router;
