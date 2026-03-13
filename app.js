const state = {
  mediaType: "movie",
  entries: [],
  hasToken: false,
  tokenSource: "missing",
  filters: {
    type: "all",
    status: "all",
  },
};

const els = {
  tokenStatus: document.querySelector("#tokenStatus"),
  exportJsonBtn: document.querySelector("#exportJsonBtn"),
  importJsonBtn: document.querySelector("#importJsonBtn"),
  importJsonInput: document.querySelector("#importJsonInput"),
  searchForm: document.querySelector("#searchForm"),
  searchInput: document.querySelector("#searchInput"),
  searchResults: document.querySelector("#searchResults"),
  searchMessage: document.querySelector("#searchMessage"),
  libraryList: document.querySelector("#libraryList"),
  libraryStats: document.querySelector("#libraryStats"),
  typeFilter: document.querySelector("#typeFilter"),
  statusFilter: document.querySelector("#statusFilter"),
  resultCardTemplate: document.querySelector("#resultCardTemplate"),
  libraryCardTemplate: document.querySelector("#libraryCardTemplate"),
  segmentButtons: Array.from(document.querySelectorAll(".segment")),
};

const IMAGE_BASE = "https://image.tmdb.org/t/p/w342";

bootstrap();

async function bootstrap() {
  bindEvents();

  try {
    applySettings(await apiGet("/api/settings"));
  } catch (error) {
    setSearchMessage(error.message || "初始化失败。");
  }

  await refreshLibrary();
}

function bindEvents() {
  els.exportJsonBtn.addEventListener("click", exportJson);
  els.importJsonBtn.addEventListener("click", () => els.importJsonInput.click());
  els.importJsonInput.addEventListener("change", importJson);
  els.searchForm.addEventListener("submit", handleSearch);
  els.typeFilter.addEventListener("change", (event) => {
    state.filters.type = event.target.value;
    renderLibrary();
  });
  els.statusFilter.addEventListener("change", (event) => {
    state.filters.status = event.target.value;
    renderLibrary();
  });

  els.segmentButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.mediaType = button.dataset.mediaType;
      els.segmentButtons.forEach((item) => item.classList.toggle("active", item === button));
      els.searchInput.placeholder =
        state.mediaType === "movie" ? "输入电影名搜索" : "输入剧名搜索";
      els.searchResults.innerHTML = "";
      setSearchMessage("");
    });
  });
}

async function refreshLibrary() {
  try {
    state.entries = await apiGet("/api/entries");
    renderLibrary();
  } catch (error) {
    els.libraryList.innerHTML = `<div class="empty-state">${error.message || "加载片单失败。"}</div>`;
  }
}

async function exportJson() {
  try {
    const payload = await apiGet("/api/export");
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `watch-data-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setSearchMessage("已导出 JSON。");
  } catch (error) {
    setSearchMessage(error.message || "导出失败。");
  }
}

async function importJson(event) {
  const [file] = event.target.files || [];
  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    await apiRequest("/api/import", {
      method: "POST",
      body: text,
    });
    applySettings(await apiGet("/api/settings"));
    await refreshLibrary();
    setSearchMessage("JSON 导入完成，已覆盖当前数据。");
  } catch (error) {
    setSearchMessage(error.message || "导入失败。");
  } finally {
    event.target.value = "";
  }
}

async function handleSearch(event) {
  event.preventDefault();

  if (!state.hasToken) {
    setSearchMessage("请先通过环境变量 TMDB_TOKEN 启动后端服务。");
    return;
  }

  const query = els.searchInput.value.trim();
  if (!query) {
    return;
  }

  setSearchMessage("搜索中...");
  els.searchResults.innerHTML = "";

  try {
    const results = await apiGet(
      `/api/search?mediaType=${encodeURIComponent(state.mediaType)}&query=${encodeURIComponent(query)}`
    );
    renderSearchResults(results);
    setSearchMessage(results.length ? "" : "没有找到匹配结果。");
  } catch (error) {
    setSearchMessage(error.message || "搜索失败。");
  }
}

function renderSearchResults(results) {
  const fragment = document.createDocumentFragment();

  results.slice(0, 8).forEach((item) => {
    const node = els.resultCardTemplate.content.firstElementChild.cloneNode(true);
    const title = item.title || item.name;
    const releaseDate = item.release_date || item.first_air_date || "";

    node.querySelector("img").src = getPosterUrl(item.poster_path);
    node.querySelector("img").alt = title;
    node.querySelector("h3").textContent = title;
    node.querySelector(".overview").textContent = item.overview || "暂无简介";
    node.querySelector(".result-meta").append(
      createTag(state.mediaType === "movie" ? "电影" : "电视剧", true),
      createTag(extractYear(releaseDate) || "年份未知")
    );
    node.querySelector(".add-result-btn").addEventListener("click", () => addEntry(item.id));
    fragment.append(node);
  });

  els.searchResults.replaceChildren(fragment);
}

async function addEntry(tmdbId) {
  setSearchMessage("正在拉取详细信息...");

  try {
    await apiRequest("/api/entries", {
      method: "POST",
      body: JSON.stringify({ mediaType: state.mediaType, tmdbId }),
    });
    await refreshLibrary();
    setSearchMessage("条目已加入片单。");
  } catch (error) {
    setSearchMessage(error.message || "添加失败。");
  }
}

function renderLibrary() {
  const filtered = state.entries.filter(matchesFilters);
  renderStats(filtered);

  if (!filtered.length) {
    els.libraryList.innerHTML =
      '<div class="empty-state">片单为空，先去左侧搜索并添加一部电影或电视剧。</div>';
    return;
  }

  const fragment = document.createDocumentFragment();
  filtered.forEach((entry) => {
    const node = els.libraryCardTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector("img").src = getPosterUrl(entry.posterPath);
    node.querySelector("img").alt = entry.title;
    node.querySelector("h3").textContent = entry.title;
    node.querySelector(".meta-line").textContent = formatMeta(entry);
    node.querySelector(".overview").textContent = entry.overview;
    node.querySelector(".tag-row").append(
      createTag(entry.mediaType === "movie" ? "电影" : "电视剧", true),
      createTag(resolveStatusLabel(entry.status)),
      ...entry.genres.slice(0, 3).map((genre) => createTag(genre))
    );
    node.querySelector(".remove-btn").addEventListener("click", () => removeEntry(entry.id));
    node.querySelector(".progress-block").append(renderProgressBlock(entry));
    fragment.append(node);
  });

  els.libraryList.replaceChildren(fragment);
}

function renderStats(entries) {
  const movieCount = entries.filter((entry) => entry.mediaType === "movie").length;
  const tvCount = entries.filter((entry) => entry.mediaType === "tv").length;
  const completedCount = entries.filter((entry) => entry.status === "completed").length;

  els.libraryStats.replaceChildren(
    createStatPill(`共 ${entries.length} 项`, true),
    createStatPill(`电影 ${movieCount}`),
    createStatPill(`电视剧 ${tvCount}`),
    createStatPill(`已完成 ${completedCount}`)
  );
}

function renderProgressBlock(entry) {
  return entry.mediaType === "movie" ? renderMovieProgress(entry) : renderTvProgress(entry);
}

function renderMovieProgress(entry) {
  const wrapper = document.createElement("div");
  const percent = Number(entry.progress?.percent || 0);

  const statusRow = document.createElement("div");
  statusRow.className = "movie-actions";
  ["planned", "in_progress", "completed"].forEach((value) => {
    const button = document.createElement("button");
    button.className = `status-chip ${entry.status === value ? "active" : ""}`;
    button.textContent = resolveStatusLabel(value);
    button.addEventListener("click", async () => {
      const nextPercent = value === "planned" ? 0 : value === "completed" ? 100 : Math.max(percent, 1);
      await updateEntry(entry.id, {
        kind: "movie_progress",
        status: value,
        percent: nextPercent,
      });
    });
    statusRow.append(button);
  });

  const progressText = document.createElement("p");
  progressText.className = "meta-line";
  const watchedMinutes = Math.round((entry.runtimeMinutes || 0) * (percent / 100));
  progressText.textContent = `已观看 ${percent}%${entry.runtimeMinutes ? `，约 ${watchedMinutes} / ${entry.runtimeMinutes} 分钟` : ""}`;

  const slider = document.createElement("input");
  slider.className = "range-input";
  slider.type = "range";
  slider.min = "0";
  slider.max = "100";
  slider.value = String(percent);
  slider.addEventListener("change", async (event) => {
    const nextPercent = Number(event.target.value);
    const nextStatus = nextPercent === 0 ? "planned" : nextPercent === 100 ? "completed" : "in_progress";
    await updateEntry(entry.id, {
      kind: "movie_progress",
      status: nextStatus,
      percent: nextPercent,
    });
  });

  wrapper.append(statusRow, progressText, slider);
  return wrapper;
}

function renderTvProgress(entry) {
  const wrapper = document.createElement("div");
  const totals = getTvTotals(entry);

  const header = document.createElement("div");
  header.className = "progress-inline";

  const summary = document.createElement("p");
  summary.className = "meta-line";
  summary.textContent = `已完成 ${totals.watchedEpisodes} / ${totals.totalEpisodes} 集，进度 ${totals.percent}%`;

  const markAllButton = document.createElement("button");
  markAllButton.className = "secondary-btn";
  markAllButton.textContent = totals.percent === 100 ? "全部取消" : "全部看完";
  markAllButton.addEventListener("click", async () => {
    await updateEntry(entry.id, { kind: "toggle_all", watched: totals.percent !== 100 });
  });
  header.append(summary, markAllButton);

  const grid = document.createElement("div");
  grid.className = "episode-grid";

  entry.seasons.forEach((season) => {
    const seasonCard = document.createElement("section");
    seasonCard.className = "season-card";

    const seasonHead = document.createElement("div");
    seasonHead.className = "season-head";

    const title = document.createElement("h3");
    title.textContent = season.name || `第 ${season.seasonNumber} 季`;

    const stat = document.createElement("span");
    const watchedCount = season.episodes.filter((episode) => episode.watched).length;
    stat.className = "tag";
    stat.textContent = `${watchedCount} / ${season.episodeCount} 集`;

    const toggleSeasonBtn = document.createElement("button");
    toggleSeasonBtn.className = "ghost-btn";
    toggleSeasonBtn.textContent = watchedCount === season.episodeCount ? "本季取消" : "本季看完";
    toggleSeasonBtn.addEventListener("click", async () => {
      await updateEntry(entry.id, {
        kind: "toggle_season",
        seasonNumber: season.seasonNumber,
        watched: watchedCount !== season.episodeCount,
      });
    });

    seasonHead.append(title, stat, toggleSeasonBtn);

    const episodeList = document.createElement("div");
    episodeList.className = "episode-list";
    season.episodes.forEach((episode) => {
      const label = document.createElement("label");
      label.className = "episode-toggle";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = episode.watched;
      checkbox.addEventListener("change", async () => {
        await updateEntry(entry.id, {
          kind: "toggle_episode",
          seasonNumber: season.seasonNumber,
          episodeNumber: episode.episodeNumber,
          watched: checkbox.checked,
        });
      });

      const text = document.createElement("span");
      text.textContent = `E${episode.episodeNumber} ${episode.name}`;
      text.title = `${episode.name}${episode.runtime ? ` · ${episode.runtime} 分钟` : ""}`;

      label.append(checkbox, text);
      episodeList.append(label);
    });

    seasonCard.append(seasonHead, episodeList);
    grid.append(seasonCard);
  });

  wrapper.append(header, grid);
  return wrapper;
}

async function updateEntry(entryId, payload) {
  try {
    const updated = await apiRequest(`/api/entries/${entryId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    state.entries = state.entries.map((entry) => (entry.id === updated.id ? updated : entry));
    renderLibrary();
  } catch (error) {
    setSearchMessage(error.message || "更新失败。");
  }
}

async function removeEntry(entryId) {
  try {
    await apiRequest(`/api/entries/${entryId}`, { method: "DELETE" });
    state.entries = state.entries.filter((entry) => entry.id !== entryId);
    renderLibrary();
  } catch (error) {
    setSearchMessage(error.message || "删除失败。");
  }
}

function matchesFilters(entry) {
  const typeMatch = state.filters.type === "all" || entry.mediaType === state.filters.type;
  const statusMatch = state.filters.status === "all" || entry.status === state.filters.status;
  return typeMatch && statusMatch;
}

function getTvTotals(entry) {
  const totalEpisodes = entry.seasons.reduce((sum, season) => sum + season.episodeCount, 0);
  const watchedEpisodes = entry.seasons.reduce(
    (sum, season) => sum + season.episodes.filter((episode) => episode.watched).length,
    0
  );

  return {
    totalEpisodes,
    watchedEpisodes,
    percent: totalEpisodes ? Math.round((watchedEpisodes / totalEpisodes) * 100) : 0,
  };
}

function formatMeta(entry) {
  const runtimeLabel =
    entry.mediaType === "movie"
      ? `${entry.runtimeMinutes || "未知"} 分钟`
      : `${entry.seasons.length} 季 / ${getTvTotals(entry).totalEpisodes} 集`;

  return `${entry.country} · ${entry.releaseYear} · ${runtimeLabel}`;
}

function resolveStatusLabel(status) {
  return (
    {
      planned: "想看",
      in_progress: "进行中",
      completed: "已完成",
    }[status] || "想看"
  );
}

function createTag(text, strong = false) {
  const tag = document.createElement("span");
  tag.className = `tag${strong ? " strong" : ""}`;
  tag.textContent = text;
  return tag;
}

function createStatPill(text, strong = false) {
  const tag = document.createElement("span");
  tag.className = `stat-pill${strong ? " strong" : ""}`;
  tag.textContent = text;
  return tag;
}

function extractYear(dateString) {
  return dateString ? String(dateString).slice(0, 4) : "";
}

function getPosterUrl(path) {
  return path
    ? `${IMAGE_BASE}${path}`
    : "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 480'%3E%3Crect width='320' height='480' fill='%23e9d5bf'/%3E%3Ctext x='50%25' y='50%25' font-size='24' text-anchor='middle' fill='%23765948' font-family='sans-serif'%3ENo Poster%3C/text%3E%3C/svg%3E";
}

function setSearchMessage(text) {
  els.searchMessage.textContent = text;
}

function applySettings(settings) {
  state.hasToken = Boolean(settings.hasToken);
  state.tokenSource = settings.tokenSource || "missing";
  els.tokenStatus.textContent = resolveTokenStatusText();
}

function resolveTokenStatusText() {
  if (state.tokenSource === "environment") {
    return "当前使用服务端环境变量 TMDB_TOKEN。";
  }
  return "当前未配置 Token。请在启动服务时设置 TMDB_TOKEN。";
}

async function apiGet(url) {
  return apiRequest(url, { method: "GET" });
}

async function apiRequest(url, options) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "请求失败。");
  }

  return data;
}
