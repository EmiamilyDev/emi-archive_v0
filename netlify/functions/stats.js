const fs = require("node:fs/promises");
const path = require("node:path");

const CACHE_WINDOW_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 5000;
const LIVE_METRIC_KEYS = ["instagramFollowers", "youtubeSubscribers"];
const MANUAL_ENV_MAP = {
  instagramFollowers: "MANUAL_INSTAGRAM_FOLLOWERS",
  youtubeSubscribers: "MANUAL_YOUTUBE_SUBSCRIBERS",
  actingProjects: "MANUAL_ACTING_PROJECTS",
  musicReleases: "MANUAL_MUSIC_RELEASES",
  awardsAndNominations: "MANUAL_AWARDS_AND_NOMINATIONS",
  reachAndImpact: "MANUAL_REACH_AND_IMPACT",
};

let cache = {
  expiresAt: 0,
  payload: null,
};

const DEFAULT_FALLBACK_STATS = {
  instagramFollowers: 3000000,
  youtubeSubscribers: 1200000,
  actingProjects: 15,
  musicReleases: 8,
  awardsAndNominations: 10,
  reachAndImpact: "Global",
};

async function readFallbackStats() {
  const fallbackPath = path.join(process.cwd(), "data", "stats-fallback.json");
  try {
    const raw = await fs.readFile(fallbackPath, "utf8");
    return JSON.parse(raw);
  } catch (_error) {
    return DEFAULT_FALLBACK_STATS;
  }
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(function () {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      throw new Error("Upstream request failed with status " + response.status);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function getYouTubeSubscribers() {
  const apiKey = process.env.YOUTUBE_API_KEY;
  const channelId = process.env.YOUTUBE_CHANNEL_ID;

  if (!apiKey || !channelId) {
    return null;
  }

  const url =
    "https://www.googleapis.com/youtube/v3/channels" +
    "?part=statistics" +
    "&id=" +
    encodeURIComponent(channelId) +
    "&key=" +
    encodeURIComponent(apiKey);

  const data = await fetchJson(url);
  const first = data && data.items && data.items[0];
  const raw = first && first.statistics && first.statistics.subscriberCount;
  const parsed = Number(raw);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("Invalid YouTube subscriber payload");
  }

  return Math.round(parsed);
}

async function getInstagramFollowers() {
  const accessToken = process.env.INSTAGRAM_GRAPH_ACCESS_TOKEN;
  const businessId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;

  if (!accessToken || !businessId) {
    return null;
  }

  const url =
    "https://graph.facebook.com/v20.0/" +
    encodeURIComponent(businessId) +
    "?fields=followers_count" +
    "&access_token=" +
    encodeURIComponent(accessToken);

  const data = await fetchJson(url);
  const parsed = Number(data && data.followers_count);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("Invalid Instagram followers payload");
  }

  return Math.round(parsed);
}

function normalizePayload(rawStats, source) {
  return {
    source,
    updatedAt: new Date().toISOString(),
    stats: {
      instagramFollowers: Number(rawStats.instagramFollowers) || 0,
      youtubeSubscribers: Number(rawStats.youtubeSubscribers) || 0,
      actingProjects: Number(rawStats.actingProjects) || 0,
      musicReleases: Number(rawStats.musicReleases) || 0,
      awardsAndNominations: Number(rawStats.awardsAndNominations) || 0,
      reachAndImpact: String(rawStats.reachAndImpact || "Global"),
    },
  };
}

function mergeStats(baseStats, overrideStats) {
  return {
    instagramFollowers:
      Number.isFinite(Number(overrideStats.instagramFollowers)) && Number(overrideStats.instagramFollowers) > 0
        ? Number(overrideStats.instagramFollowers)
        : Number(baseStats.instagramFollowers) || 0,
    youtubeSubscribers:
      Number.isFinite(Number(overrideStats.youtubeSubscribers)) && Number(overrideStats.youtubeSubscribers) > 0
        ? Number(overrideStats.youtubeSubscribers)
        : Number(baseStats.youtubeSubscribers) || 0,
    actingProjects: Number(baseStats.actingProjects) || 0,
    musicReleases: Number(baseStats.musicReleases) || 0,
    awardsAndNominations: Number(baseStats.awardsAndNominations) || 0,
    reachAndImpact: String(baseStats.reachAndImpact || "Global"),
  };
}

function readManualOverrideStats() {
  const overrides = {};
  const providedKeys = [];

  Object.keys(MANUAL_ENV_MAP).forEach(function (statKey) {
    const envKey = MANUAL_ENV_MAP[statKey];
    const rawValue = process.env[envKey];

    if (typeof rawValue !== "string" || rawValue.trim() === "") {
      return;
    }

    if (statKey === "reachAndImpact") {
      overrides[statKey] = rawValue.trim();
      providedKeys.push(statKey);
      return;
    }

    const parsed = Number(rawValue);
    if (Number.isFinite(parsed) && parsed >= 0) {
      overrides[statKey] = Math.round(parsed);
      providedKeys.push(statKey);
    }
  });

  return {
    overrides,
    providedKeys,
  };
}

async function readLiveProviderStats() {
  const providers = [];
  const live = {};
  const meta = {};

  try {
    const instagramFollowers = await getInstagramFollowers();
    if (Number.isFinite(instagramFollowers)) {
      live.instagramFollowers = instagramFollowers;
      providers.push("instagram-graph");
    }
  } catch (error) {
    console.warn("Instagram fetch failed", error instanceof Error ? error.message : error);
  }

  try {
    const youtubeSubscribers = await getYouTubeSubscribers();
    if (Number.isFinite(youtubeSubscribers)) {
      live.youtubeSubscribers = youtubeSubscribers;
      meta.youtubeSubscribers = youtubeSubscribers;
      providers.push("youtube-api");
    }
  } catch (error) {
    console.warn("YouTube fetch failed", error instanceof Error ? error.message : error);
  }

  return {
    live,
    meta,
    providers,
  };
}

async function getStats() {
  if (cache.payload && cache.expiresAt > Date.now()) {
    return cache.payload;
  }

  const fallback = await readFallbackStats();
  const providerPayload = await readLiveProviderStats();
  const manualPayload = readManualOverrideStats();
  const liveMergedStats = mergeStats(fallback, providerPayload.live);
  const mergedStats = mergeStats(liveMergedStats, manualPayload.overrides);

  const providers = providerPayload.providers.slice();
  if (manualPayload.providedKeys.length > 0) {
    providers.push("manual-env");
  }

  const payload = normalizePayload(
    mergedStats,
    manualPayload.providedKeys.length > 0
      ? "manual-env"
      : providerPayload.providers.length > 0
        ? "live+fallback"
        : "fallback-json"
  );
  const liveOrManualCoverage = LIVE_METRIC_KEYS.reduce(function (count, key) {
    return key in providerPayload.live || key in manualPayload.overrides ? count + 1 : count;
  }, 0);

  payload.providers = providers;
  payload.meta = providerPayload.meta;
  payload.meta.manualOverrides = manualPayload.providedKeys;
  payload.liveCoverage = {
    available: liveOrManualCoverage,
    total: LIVE_METRIC_KEYS.length,
  };
  payload.confidenceScore = Math.round((liveOrManualCoverage / LIVE_METRIC_KEYS.length) * 100);

  cache = {
    payload,
    expiresAt: Date.now() + CACHE_WINDOW_MS,
  };

  return payload;
}

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers: {
        Allow: "GET",
      },
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  try {
    const payload = await getStats();
    return {
      statusCode: 200,
      headers: {
        "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600",
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(payload),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        error: "Failed to load stats",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
    };
  }
};
