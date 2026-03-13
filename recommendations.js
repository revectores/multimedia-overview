const state = {
  entries: [],
  recommendations: [],
  profile: null,
  mediaType: "all",
  source: "all",
};

const els = {
  mediaTypeFilter: document.querySelector("#mediaTypeFilter"),
  sourceFilter: document.querySelector("#sourceFilter"),
  refreshBtn: document.querySelector("#refreshBtn"),
  recommendationMessage: document.querySelector("#recommendationMessage"),
  recommendationList: document.querySelector("#recommendationList"),
  tasteSummary: document.querySelector("#tasteSummary"),
  profileStats: document.querySelector("#profileStats"),
  recommendationCardTemplate: document.querySelector("#recommendationCardTemplate"),
};

const IMAGE_BASE = "https://image.tmdb.org/t/p/w342";

bootstrap();

async function bootstrap() {
  bindEvents();
  await refreshData();
}

function bindEvents() {
  els.mediaTypeFilter.addEventListener("change", async (event) => {
    state.mediaType = event.target.value;
    await loadRecommendations();
  });

  els.sourceFilter.addEventListener("change", (event) => {
    state.source = event.target.value;
    renderRecommendations();
  });

  els.refreshBtn.addEventListener("click", async () => {
    await loadRecommendations();
  });
}

async function refreshData() {
  setMessage("正在读取片单与推荐...");
  try {
    state.entries = await apiGet("/api/entries");
    await loadRecommendations();
  } catch (error) {
    setMessage(error.message || "加载失败。");
  }
}

async function loadRecommendations() {
  setMessage("正在生成推荐...");
  els.recommendationList.innerHTML = "";

  try {
    const payload = await apiGet(
      `/api/recommendations?mediaType=${encodeURIComponent(state.mediaType)}&limit=18`
    );
    state.profile = payload.profile || null;
    state.recommendations = payload.results || [];
    renderProfile();
    renderRecommendations();
    setMessage(state.recommendations.length ? "" : "没有生成可展示的推荐结果。");
  } catch (error) {
    state.profile = null;
    state.recommendations = [];
    renderProfile();
    renderRecommendations();
    setMessage(error.message || "推荐生成失败。");
  }
}

function renderProfile() {
  els.tasteSummary.innerHTML = "";
  els.profileStats.innerHTML = "";

  if (!state.profile) {
    els.tasteSummary.innerHTML = '<div class="empty-state">当前还没有可用的兴趣画像。</div>';
    return;
  }

  const chips = [
    ...state.profile.preferredTypes.map((item) => createTag(item, true)),
    ...state.profile.preferredGenres.map((item) => createTag(item)),
    ...state.profile.preferredCountries.map((item) => createTag(item)),
  ];

  if (chips.length) {
    els.tasteSummary.append(...chips);
  } else {
    els.tasteSummary.innerHTML = '<div class="empty-state">片单特征还不够明显。</div>';
  }

  els.profileStats.append(
    createStatPill(`片单 ${state.profile.entryCount} 项`, true),
    createStatPill(`种子 ${state.profile.seedCount}`),
    createStatPill(`题材 ${state.profile.preferredGenres.length}`),
    createStatPill(`地区 ${state.profile.preferredCountries.length}`)
  );
}

function renderRecommendations() {
  const list = state.recommendations.filter((item) => {
    return state.source === "all" || item.source === state.source;
  });

  if (!list.length) {
    els.recommendationList.innerHTML =
      '<div class="empty-state">当前筛选条件下没有推荐结果。</div>';
    return;
  }

  const fragment = document.createDocumentFragment();
  list.forEach((item) => {
    const node = els.recommendationCardTemplate.content.firstElementChild.cloneNode(true);
    const meta = node.querySelector(".result-meta");
    const title = node.querySelector("h3");
    const overview = node.querySelector(".overview");
    const poster = node.querySelector("img");
    const reason = node.querySelector(".reason-line");
    const addButton = node.querySelector(".add-result-btn");

    poster.src = getPosterUrl(item.posterPath);
    poster.alt = item.title;
    title.textContent = item.title;
    overview.textContent = item.overview || "暂无简介";
    reason.textContent = item.reason || "与你的片单兴趣相近";

    meta.append(
      createTag(item.mediaType === "movie" ? "电影" : "电视剧", true),
      createTag(item.releaseYear || "年份未知"),
      createTag(item.source === "similar" ? "相似作品" : "兴趣画像"),
      createTag(`匹配 ${Math.round(item.score)}`),
      item.voteAverage ? createTag(`TMDB ${item.voteAverage}`) : createTag("TMDB 待补充")
    );

    addButton.addEventListener("click", async () => {
      await addEntry(item);
    });

    fragment.append(node);
  });

  els.recommendationList.replaceChildren(fragment);
}

async function addEntry(item) {
  setMessage("正在加入片单...");
  try {
    await apiRequest("/api/entries", {
      method: "POST",
      body: JSON.stringify({
        mediaType: item.mediaType,
        tmdbId: item.id,
        language: item.originalLanguage || null,
      }),
    });
    state.entries = await apiGet("/api/entries");
    await loadRecommendations();
    setMessage("已加入片单，并重新生成推荐。");
  } catch (error) {
    setMessage(error.message || "加入片单失败。");
  }
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

function getPosterUrl(path) {
  return path
    ? `${IMAGE_BASE}${path}`
    : "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 480'%3E%3Crect width='320' height='480' fill='%23e9d5bf'/%3E%3Ctext x='50%25' y='50%25' font-size='24' text-anchor='middle' fill='%23765948' font-family='sans-serif'%3ENo Poster%3C/text%3E%3C/svg%3E";
}

function setMessage(text) {
  els.recommendationMessage.textContent = text;
}

async function apiGet(url) {
  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "请求失败。");
  }
  return payload;
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
    },
    ...options,
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "请求失败。");
  }
  return payload;
}
