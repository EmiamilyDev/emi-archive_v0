# emi-archive

## Stats Endpoint

This project now includes a serverless endpoint for homepage stats:

- Route: `/api/stats`
- Method: `GET`
- Runtime target: Netlify Function (`/.netlify/functions/stats`) via redirect

### Response Shape

```json
{
	"source": "fallback-json",
	"updatedAt": "2026-07-01T00:00:00.000Z",
	"providers": [],
	"confidenceScore": 0,
	"liveCoverage": {
		"available": 0,
		"total": 2
	},
	"stats": {
		"instagramFollowers": 3000000,
		"youtubeSubscribers": 1200000,
		"actingProjects": 15,
		"musicReleases": 8,
		"awardsAndNominations": 10,
		"reachAndImpact": "Global"
	},
	"meta": {}
}
```

### Data Source

Fallback values are read from `data/stats-fallback.json`.

### Optional Live Providers

`/api/stats` can pull live values when environment variables are configured.

- Instagram Graph API (for `instagramFollowers`)
	- `INSTAGRAM_GRAPH_ACCESS_TOKEN`
	- `INSTAGRAM_BUSINESS_ACCOUNT_ID`
- YouTube Data API v3 (for `youtubeSubscribers`)
	- `YOUTUBE_API_KEY`
	- `YOUTUBE_CHANNEL_ID`

When provider calls fail or env vars are missing, the endpoint automatically falls back to `data/stats-fallback.json`.

### Netlify Routing

The repo includes `netlify.toml` with:

- Redirect `/api/stats` -> `/.netlify/functions/stats`
- Function source at `netlify/functions/stats.js`

## Homepage Integration

Homepage stats in `index.html` are wired to `assets/js/main.js` via `data-stat` attributes.

- When served over HTTP(S), the script requests `/api/stats` and updates the stat values.
- When opened via `file:///`, API requests are skipped and inline fallback values remain visible.
- The stats strip also displays source, providers, confidence, and last update time from the API payload.
- Confidence has a color badge: `0-40` low, `41-79` medium, `80-100` high.
- Homepage auto-refreshes stats every 15 minutes while the tab is visible.
