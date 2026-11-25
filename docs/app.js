const DATA_URL = './gifts.json';
const BATCH = 100;

const COIN_FILTERS = {
  all: () => true,
  one: (coin) => coin === 1,
  lt100: (coin) => coin < 100,
  mid: (coin) => coin >= 100 && coin <= 1000,
  high: (coin) => coin > 1000,
};

const SORTS = {
  'coin-asc': (a, b) => a.coin - b.coin || compareName(a, b),
  'coin-desc': (a, b) => b.coin - a.coin || compareName(a, b),
  'name-asc': (a, b) => compareName(a, b),
  'name-desc': (a, b) => compareName(b, a),
};

const COPY_FORMATS = {
  name: (gift) => gift.displayName,
  id: (gift) => gift.name,
  'name-id': (gift) => `${gift.displayName} (${gift.name})`,
  'name-id-coin': (gift) => `${gift.displayName} (${gift.name}) · ${formatCoin(gift.coin)} coin`,
};

const COPY_STORAGE_KEY = 'gift-db:copy-format';

const el = {
  grid: document.getElementById('grid'),
  search: document.getElementById('search'),
  sort: document.getElementById('sort'),
  copyFormat: document.getElementById('copy-format'),
  chips: document.getElementById('coin-chips'),
  result: document.getElementById('result'),
  empty: document.getElementById('empty'),
  loadMore: document.getElementById('load-more'),
  toast: document.getElementById('toast'),
  region: document.getElementById('region-badge'),
  updatedAt: document.getElementById('updated-at'),
  totalCount: document.getElementById('total-count'),
};

const state = {
  gifts: [],
  query: '',
  coin: 'all',
  sort: 'coin-asc',
  copyFormat: 'name-id',
  rendered: 0,
};

function copyText(gift) {
  const format = COPY_FORMATS[state.copyFormat] ?? COPY_FORMATS['name-id'];
  return format(gift);
}

function copyGift(gift) {
  copy(copyText(gift));
}

function compareName(a, b) {
  return a.displayName.localeCompare(b.displayName, 'id', { sensitivity: 'base' });
}

function formatCoin(coin) {
  return coin.toLocaleString('id-ID');
}

function currentList() {
  const query = state.query.trim().toLowerCase();
  const coinFilter = COIN_FILTERS[state.coin] ?? COIN_FILTERS.all;

  return state.gifts
    .filter((gift) => {
      if (!coinFilter(gift.coin)) return false;
      if (!query) return true;
      return gift.displayName.toLowerCase().includes(query) || gift.name.includes(query);
    })
    .sort(SORTS[state.sort] ?? SORTS['coin-asc']);
}

function createCard(gift) {
  const card = document.createElement('article');
  card.className = 'card';
  card.title = `Copy "${copyText(gift)}"`;

  const thumb = document.createElement('div');
  thumb.className = 'thumb';

  if (gift.image) {
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.alt = gift.displayName;
    img.src = gift.image;
    img.addEventListener('error', () => {
      img.remove();
      thumb.classList.add('missing');
    });
    thumb.append(img);
  } else {
    thumb.classList.add('missing');
  }

  const coin = document.createElement('span');
  coin.className = 'coin';
  coin.textContent = `🪙 ${formatCoin(gift.coin)}`;
  thumb.append(coin);

  const name = document.createElement('button');
  name.type = 'button';
  name.className = 'gift-name';
  name.textContent = gift.displayName;
  name.title = `Copy "${copyText(gift)}"`;
  name.addEventListener('click', () => copyGift(gift));

  const id = document.createElement('button');
  id.type = 'button';
  id.className = 'gift-id';
  id.textContent = `#${gift.name}`;
  id.title = `Copy id ${gift.name}`;
  id.addEventListener('click', () => copy(gift.name));

  card.append(thumb, name, id);
  card.addEventListener('click', (event) => {
    if (event.target.closest('button')) return;
    copyGift(gift);
  });

  return card;
}

function render({ reset = true } = {}) {
  const list = currentList();

  if (reset) {
    el.grid.replaceChildren();
    state.rendered = 0;
  }

  const slice = list.slice(state.rendered, state.rendered + BATCH);
  if (slice.length) {
    const fragment = document.createDocumentFragment();
    for (const gift of slice) fragment.append(createCard(gift));
    el.grid.append(fragment);
    state.rendered += slice.length;
  }

  el.result.textContent = `${list.length} gift cocok · menampilkan ${Math.min(state.rendered, list.length)}`;
  el.empty.hidden = list.length > 0;
  el.loadMore.hidden = state.rendered >= list.length;
  syncHash();
}

function showToast(message) {
  el.toast.textContent = message;
  el.toast.classList.add('is-visible');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => el.toast.classList.remove('is-visible'), 1600);
}

async function copy(text) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    try {
      document.execCommand('copy');
    } catch {
      showToast('Gagal copy, salin manual: ' + text);
      area.remove();
      return;
    }
    area.remove();
  }
  showToast(`Copied: ${text}`);
}

function syncHash() {
  const params = new URLSearchParams();
  if (state.query) params.set('q', state.query);
  if (state.coin !== 'all') params.set('coin', state.coin);
  if (state.sort !== 'coin-asc') params.set('sort', state.sort);
  const hash = params.toString();
  const url = hash ? `#${hash}` : location.pathname + location.search;
  history.replaceState(null, '', url);
}

function readHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  const query = params.get('q') ?? '';
  const coin = params.get('coin') ?? 'all';
  const sort = params.get('sort') ?? 'coin-asc';
  if (query) state.query = query;
  if (COIN_FILTERS[coin]) state.coin = coin;
  if (SORTS[sort]) state.sort = sort;
}

function bindControls() {
  let timer;
  el.search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.query = el.search.value;
      render();
    }, 120);
  });

  el.sort.addEventListener('change', () => {
    state.sort = el.sort.value;
    render();
  });

  el.copyFormat.addEventListener('change', () => {
    const value = el.copyFormat.value;
    state.copyFormat = COPY_FORMATS[value] ? value : 'name-id';
    try {
      localStorage.setItem(COPY_STORAGE_KEY, state.copyFormat);
    } catch {
      /* localStorage bisa diblokir di mode privat */
    }
    render();
  });

  el.chips.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-coin]');
    if (!button) return;
    state.coin = button.dataset.coin;
    for (const chip of el.chips.querySelectorAll('.chip')) {
      chip.classList.toggle('is-active', chip === button);
    }
    render();
  });

  el.loadMore.addEventListener('click', () => render({ reset: false }));
}

function applyStateToControls() {
  el.search.value = state.query;
  el.sort.value = state.sort;
  el.copyFormat.value = state.copyFormat;
  for (const chip of el.chips.querySelectorAll('.chip')) {
    chip.classList.toggle('is-active', chip.dataset.coin === state.coin);
  }
}

async function init() {
  bindControls();
  readHash();
  try {
    const saved = localStorage.getItem(COPY_STORAGE_KEY);
    if (saved && COPY_FORMATS[saved]) state.copyFormat = saved;
  } catch {
    /* localStorage bisa diblokir di mode privat */
  }
  applyStateToControls();

  try {
    const response = await fetch(DATA_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    state.gifts = Array.isArray(data.gifts) ? data.gifts : [];
    const region = data.region ?? '—';
    el.region.textContent = region;
    el.totalCount.textContent = `${state.gifts.length.toLocaleString('id-ID')} gift`;
    el.updatedAt.textContent = data.updatedAt
      ? new Date(data.updatedAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
      : 'belum ada data';
    document.title = `TikTok Gift DB ${region} — ${state.gifts.length} gift`;

    render();
  } catch (error) {
    el.result.textContent = '';
    el.empty.hidden = false;
    el.empty.textContent = `Gagal memuat data gift (${error.message}). Jalankan "npm run build:web" dulu.`;
  }
}

init();
