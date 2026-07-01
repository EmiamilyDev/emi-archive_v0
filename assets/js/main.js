(function () {
  var STATS_REFRESH_MS = 15 * 60 * 1000;
  var yearNodes = document.querySelectorAll('[data-current-year]');
  var year = String(new Date().getFullYear());

  for (var i = 0; i < yearNodes.length; i += 1) {
    yearNodes[i].textContent = year;
  }

  function formatStatValue(value, formatType) {
    if (formatType === "compact") {
      var numberValue = Number(value);

      if (!Number.isFinite(numberValue)) {
        return String(value);
      }

      if (numberValue >= 1000000) {
        var millions = numberValue / 1000000;
        return (Number.isInteger(millions) ? String(millions) : millions.toFixed(1).replace(/\.0$/, "")) + "M+";
      }

      if (numberValue >= 1000) {
        var thousands = numberValue / 1000;
        return (Number.isInteger(thousands) ? String(thousands) : thousands.toFixed(1).replace(/\.0$/, "")) + "K+";
      }

      return String(Math.round(numberValue));
    }

    if (formatType === "plus-int") {
      var intValue = Number(value);

      if (!Number.isFinite(intValue)) {
        return String(value);
      }

      return String(Math.round(intValue)) + "+";
    }

    return String(value);
  }

  function applyStatsToDom(stats) {
    if (!stats || typeof stats !== "object") {
      return;
    }

    var statNodes = document.querySelectorAll("[data-stat]");

    for (var j = 0; j < statNodes.length; j += 1) {
      var node = statNodes[j];
      var statKey = node.getAttribute("data-stat");
      var formatType = node.getAttribute("data-format");

      if (!statKey || !(statKey in stats)) {
        continue;
      }

      node.textContent = formatStatValue(stats[statKey], formatType);
    }
  }

  function formatUpdatedAt(isoString) {
    if (!isoString) {
      return "not synced";
    }

    var dateValue = new Date(isoString);
    if (Number.isNaN(dateValue.getTime())) {
      return "not synced";
    }

    return dateValue.toLocaleString("en-GB", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function applyStatsMeta(payload) {
    var sourceNode = document.querySelector("[data-stats-source]");
    var providersNode = document.querySelector("[data-stats-providers]");
    var confidenceNode = document.querySelector("[data-stats-confidence]");
    var updatedNode = document.querySelector("[data-stats-updated]");

    if (sourceNode && payload && payload.source) {
      sourceNode.textContent = String(payload.source);
    }

    if (providersNode) {
      var providers = payload && Array.isArray(payload.providers) ? payload.providers : [];
      providersNode.textContent = providers.length > 0 ? providers.join(", ") : "none";
    }

    if (confidenceNode) {
      var rawScore = payload && Number(payload.confidenceScore);
      var normalizedScore = Number.isFinite(rawScore) ? Math.round(rawScore) : 0;
      confidenceNode.textContent = String(normalizedScore) + "%";
      confidenceNode.classList.remove("is-low", "is-medium", "is-high");

      if (normalizedScore >= 80) {
        confidenceNode.classList.add("is-high");
      } else if (normalizedScore >= 41) {
        confidenceNode.classList.add("is-medium");
      } else {
        confidenceNode.classList.add("is-low");
      }
    }

    if (updatedNode) {
      updatedNode.textContent = formatUpdatedAt(payload && payload.updatedAt);
    }
  }

  function hydrateStatsFromApi() {
    if (window.location.protocol === "file:") {
      return;
    }

    fetch("/api/stats", {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("Stats endpoint returned " + response.status);
        }

        return response.json();
      })
      .then(function (payload) {
        if (payload && payload.stats) {
          applyStatsToDom(payload.stats);
        }

        applyStatsMeta(payload);
      })
      .catch(function () {
        // Keep inline fallback values from HTML when API is unavailable.
      });
  }

  hydrateStatsFromApi();

  if (window.location.protocol !== "file:") {
    setInterval(function () {
      if (!document.hidden) {
        hydrateStatsFromApi();
      }
    }, STATS_REFRESH_MS);
  }
})();
