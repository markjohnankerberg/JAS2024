/*
 * Christmas Resource Catalog
 *
 * Source: ATRI Store API, GET /api/v1/products/ → { results: [...], next }. Same endpoint as the
 * Audio Bibles banner. Per product it uses sku, permalink, name, subtitle, description, kind,
 * price {current, regular, on_sale}, image {url} or gallery[0], categories (topic filters),
 * authors (people credited as Author in the CMS), tags (fallback guest names), series (pairs
 * books with TV series), items (collection contents), related.
 *
 * Author line: the product's `authors` when the CMS credits any; otherwise guessed from tags,
 * so products nobody has credited yet still show a name.
 *
 * Topic chips: GET /api/v1/categories/ → { results: [{slug, name, description}] } supplies their
 * order (sort_order, set in the CMS admin) and a tooltip. Only categories present in the current
 * tab show, and a category the CMS has retired is dropped. If that call fails, chips fall back to
 * the products' own categories in the order they are first seen, so the catalog still works.
 *
 * Samples: the product's `preview` (a PDF from the CMS, either a URL string or {url, ...} like
 * `image`). Products with one get "Read a sample", which opens a reader inside the dialog
 * (new tab on phones, where embedded PDFs scroll poorly).
 *
 * Formats (tabs): kind "collection" or ATRI Merchandise → collections; tag "books"/"booklets" or
 * SKU ending "-B" → books; everything else → TV series & DVDs. TV series bundles show in both
 * Bundles & Gifts and TV series & DVDs. Empty tabs are hidden.
 *
 * Cart: same contract as the Audio Bibles banner — dispatches a bubbling "atri:cart:add"
 * CustomEvent and, if present, calls window.ATRICart.add(item) with
 *   { type: 'product', sku, name, unit_cents, quantity, image, campaign, shippable }
 * (shippable = store type "physical"; checkout asks for a shipping address when any item has it)
 */
(function () {
    'use strict';

    var CART_EVENT = 'atri:cart:add';
    var PICKS_KEY = 'atri-christmas-2026-picks';
    // Name / image / price for each saved pick, so the cart drawer can show them on any page.
    var PICKS_DETAILS_KEY = 'atri-christmas-2026-picks-details';
    var PICKS_EVENT = 'atri:picks';
    var COLORS = ['sage', 'blue', 'sand', 'rose'];
    var FORMATS = ['books', 'media', 'collections'];
    var COVER_LABELS = { books: 'GUEST BOOK', media: 'TV SERIES', collections: 'BUNDLE' };
    var usdWhole = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
    var usdCents = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

    function money(n) { return (n % 1 ? usdCents : usdWhole).format(n); }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function list(s) {
        return String(s || '').split(',').map(function (x) { return x.trim().toLowerCase(); }).filter(Boolean);
    }

    function fold(text) {
        return String(text == null ? '' : text).normalize('NFKD')
            .replace(/[̀-ͯ]/g, '').replace(/[‘’]/g, "'").toLowerCase();
    }

    // Some store categories are all lower case ("apologetics").
    function niceName(s) {
        s = String(s || '').trim();
        return s === s.toLowerCase() ? s.charAt(0).toUpperCase() + s.slice(1) : s;
    }

    function hash(s) {
        var h = 0;
        for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
        return Math.abs(h);
    }

    function joinNames(names) {
        if (names.length < 3) return names.join(' & ');
        return names.slice(0, -1).join(', ') + ' & ' + names[names.length - 1];
    }

    function paragraphs(text) {
        return String(text || '').split(/\r?\n/).map(function (p) { return p.trim(); }).filter(Boolean);
    }

    // Absolute or site-relative (/hubfs/...) links; only http(s) is allowed.
    function safeUrl(url) {
        if (!url) return '';
        try {
            var u = new URL(url, window.location.href);
            return /^https?:$/.test(u.protocol) ? u.href : '';
        } catch (e) { return ''; }
    }

    // ATRI Merchandise (mugs, totes) shares the Bundles & Gifts tab with collections.
    var GIFT_CATEGORY = 'atri-merchandise';
    function isGift(raw) {
        return (raw.categories || []).some(function (c) { return c.slug === GIFT_CATEGORY; });
    }

    // Product series that get their own filter chip (and #<key> link), shown first after
    // "All topics". Facts On booklets are tagged facts-on in the store; a few aren't, so the
    // "Facts on/of ..." title also counts ("Fast Facts" is a different series).
    var SERIES_FILTERS = [
        { key: 'facts-on', name: 'The Facts On Series', test: function (raw) {
            return (raw.tags || []).some(function (t) { return t.slug === 'facts-on'; }) ||
                /^facts o[nf]\b/i.test(raw.name || '');
        } }
    ];
    function seriesOf(raw) {
        return SERIES_FILTERS.filter(function (f) { return f.test(raw); })
            .map(function (f) { return 'series:' + f.key; });
    }
    function hasTopic(p, slug) {
        return p.seriesTopics.indexOf(slug) > -1 || p.topics.some(function (t) { return t.slug === slug; });
    }

    function hasTag(raw, slug) {
        return (raw.tags || []).some(function (t) { return t.slug === slug; });
    }

    // Main tab: bundles and ATRI merch → Bundles & Gifts; books and booklets (tag "books" or
    // "booklets", or a SKU ending -B) → Books & guides; everything else → TV series & DVDs.
    function formatOf(raw) {
        if (raw.kind === 'collection' || isGift(raw)) return 'collections';
        return hasTag(raw, 'books') || hasTag(raw, 'booklets') || /-B$/i.test(raw.sku || '') ? 'books' : 'media';
    }

    // TV series bundles (tag tv-series-package, or "TV Series Bundle" in the name, since not
    // every one is tagged) also show under TV series & DVDs, as well as Bundles & Gifts.
    function isTvPackage(raw) {
        return raw.kind === 'collection' && (hasTag(raw, 'tv-series-package') || /tv series bundle/i.test(raw.name || ''));
    }

    // Every tab a product shows in; the first is its main one (labels, #product links).
    function formatsOf(raw) {
        var main = formatOf(raw);
        return isTvPackage(raw) ? [main, 'media'] : [main];
    }
    function inTab(p, tab) { return p.formats.indexOf(tab) > -1; }

    function normalize(raw, index, cfg) {
        var price = raw.price && typeof raw.price === 'object' ? raw.price : {};
        var current = price.current != null ? parseFloat(price.current) : NaN;
        var regular = price.on_sale && price.regular != null ? parseFloat(price.regular) : NaN;
        var img = raw.image && raw.image.url ? raw.image : (raw.gallery || [])[0] || null;
        var topics = (raw.categories || []).map(function (c) { return { slug: c.slug, name: niceName(c.name) }; });
        var topicSlugs = topics.map(function (t) { return t.slug; });
        var series = raw.series ? raw.series.slug : null;
        // Authors credited in the CMS win. Without them, fall back to tags, which mix guests
        // with topics and series codes: multi-word or initialled names that aren't a category,
        // the series, or an ignored slug are treated as guests.
        var authors = (raw.authors || []).filter(function (n) { return typeof n === 'string' && n.trim(); });
        var people = authors.length ? authors : (raw.tags || []).filter(function (t) {
            return /[\s.]/.test(t.name) && topicSlugs.indexOf(t.slug) < 0 &&
                t.slug !== series && cfg.hideTags.indexOf(t.slug) < 0 &&
                cfg.labelTags.indexOf(t.slug) < 0;
        }).map(function (t) { return t.name; });
        // Merchandising labels ("Limited Supply") are CMS tags named in the module's label_tags.
        var labels = (raw.tags || []).filter(function (t) {
            return cfg.labelTags.indexOf(String(t.slug || '').toLowerCase()) > -1;
        }).map(function (t) { return t.name; });
        var text = paragraphs(raw.description);
        var preview = raw.preview;
        var sample = typeof preview === 'string' ? preview : (preview && (preview.url || preview.file)) || '';

        var item = {
            id: raw.sku,
            permalink: raw.permalink || '',
            name: raw.name || raw.sku,
            subtitle: raw.subtitle || '',
            paragraphs: text,
            summary: text.slice(0, 2).join(' '),
            format: formatOf(raw),
            formats: formatsOf(raw),
            gift: isGift(raw),
            seriesTopics: seriesOf(raw),
            shippable: raw.type === 'physical',
            topics: topics,
            labels: labels,
            tag: topics[0] ? topics[0].name : '',
            author: joinNames(people),
            series: series,
            price: current,
            regular: regular > current ? regular : NaN,
            image: img ? img.url : '',
            color: COLORS[hash(topicSlugs[0] || raw.sku || '') % COLORS.length],
            includes: (raw.items || []).map(function (x) { return x.name; }),
            related: (raw.related || []).map(function (x) { return x.sku; }),
            sample: safeUrl(sample),
            order: index
        };
        item.search = fold([item.name, item.subtitle, item.author, item.summary,
            topics.map(function (t) { return t.name; }).join(' '),
            (raw.tags || []).map(function (t) { return t.name; }).join(' ')].join(' '));
        return item;
    }

    // ── Fetch (follows `next` pages) with a short sessionStorage cache ──
    function readCache(url, minutes) {
        if (!minutes) return null;
        try {
            var hit = JSON.parse(sessionStorage.getItem('apc:' + url) || 'null');
            if (hit && Date.now() - hit.t < minutes * 60000) return hit.d;
        } catch (e) { /* storage unavailable */ }
        return null;
    }

    function writeCache(url, data) {
        try { sessionStorage.setItem('apc:' + url, JSON.stringify({ t: Date.now(), d: data })); } catch (e) {}
    }

    function fetchPage(url) {
        var ctrl = 'AbortController' in window ? new AbortController() : null;
        var timer = ctrl && setTimeout(function () { ctrl.abort(); }, 10000);
        return fetch(url, { headers: { Accept: 'application/json' }, signal: ctrl && ctrl.signal })
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .finally(function () { if (timer) clearTimeout(timer); });
    }

    function fetchProducts(url, minutes) {
        var cached = readCache(url, minutes);
        if (cached) return Promise.resolve(cached);
        var all = [];
        function step(next, pages) {
            return fetchPage(next).then(function (json) {
                var items = Array.isArray(json) ? json : (json.results || json.items || []);
                all = all.concat(items);
                if (json && json.next && pages < 10) return step(json.next, pages + 1);
                writeCache(url, all);
                return all;
            });
        }
        return step(url, 1);
    }

    // Categories for the topic chips, keyed by slug. Never fatal: null means "use the products'".
    function fetchCategories(url, minutes) {
        if (!url) return Promise.resolve(null);
        var cached = readCache(url, minutes);
        var load = cached ? Promise.resolve(cached) : fetchPage(url).then(function (json) {
            var rows = Array.isArray(json) ? json : (json && json.results) || [];
            writeCache(url, rows);
            return rows;
        });
        return load.then(function (rows) {
            var bySlug = {};
            rows.forEach(function (c, i) {
                if (c && c.slug) bySlug[c.slug] = { order: i, name: niceName(c.name), description: c.description || '' };
            });
            return rows.length ? bySlug : null;
        }).catch(function (err) {
            console.warn('[Resource catalog] categories unavailable, using product categories:', err);
            return null;
        });
    }

    // ── Saved picks (per browser) ──
    function loadPicks() {
        try {
            var ids = JSON.parse(localStorage.getItem(PICKS_KEY) || '[]');
            return Array.isArray(ids) ? ids.filter(function (id) { return typeof id === 'string'; }) : [];
        } catch (e) { return []; }
    }

    function pickDetails(item) {
        return {
            sku: item.id, name: item.name, image: item.image,
            unit_cents: isFinite(item.price) ? Math.round(item.price * 100) : null,
            shippable: item.shippable
        };
    }

    // catalog (optional): byId map used to refresh the stored details for the saved ids.
    function writePicks(ids, catalog, source) {
        try {
            localStorage.setItem(PICKS_KEY, JSON.stringify(ids));
            if (catalog) {
                var old = {};
                try { old = JSON.parse(localStorage.getItem(PICKS_DETAILS_KEY) || '{}') || {}; } catch (e) {}
                var details = {};
                ids.forEach(function (id) {
                    if (catalog[id]) details[id] = pickDetails(catalog[id]);
                    else if (old[id]) details[id] = old[id];
                });
                localStorage.setItem(PICKS_DETAILS_KEY, JSON.stringify(details));
            }
        } catch (e) {}
        window.dispatchEvent(new CustomEvent(PICKS_EVENT, { detail: { ids: ids, source: source || null } }));
    }

    function isPdf(url) { return /\.pdf($|[?#])/i.test(url); }

    function init(root) {
        if (root.__apcInit) return;
        root.__apcInit = true;

        var ds = root.dataset;
        var uid = root.id;
        var phone = window.matchMedia('(max-width: 700px), (pointer: coarse)');
        var cfg = {
            url: ds.apiUrl,
            categoriesUrl: ds.categoriesUrl || '',
            excludeCategories: list(ds.excludeCategories),
            hideTags: list(ds.hideTags),
            labelTags: list(ds.labelTags),
            productUrl: ds.productUrl || '',
            pageSize: Number(ds.pageSize) || 6,
            cacheMinutes: Number(ds.cacheMinutes) || 0,
            campaign: ds.campaign || '',
            buttonText: ds.buttonText || 'Add to Cart',
            sampleText: ds.sampleText || 'Read a sample',
            tabLabels: {
                books: ds.tabBooks || 'Books & guides',
                media: ds.tabMedia || 'TV series & DVDs',
                collections: ds.tabCollections || 'Bundles & Gifts'
            }
        };

        function part(key) { return root.querySelector('[data-c="' + key + '"]'); }
        var el = {
            tabs: part('tabs'), form: part('search-form'), search: part('search'), clear: part('clear'), sort: part('sort'),
            topics: part('topics'), count: part('count'), reset: part('reset'), panel: part('panel'),
            grid: part('grid'), empty: part('empty'), error: part('error'), more: part('more'),
            moreCount: part('more-count'), dialog: part('dialog'), detail: part('detail'), toast: part('toast')
        };

        var products = [];
        var categories = null; // slug → { order, name, description } from the categories endpoint
        var byId = {};
        var tabs = [];
        var state = {
            tab: 'books', query: '', topic: 'all', sort: 'featured',
            limit: cfg.pageSize, saved: loadPicks(), detailId: null
        };

        // ── Toast ──
        var toastTimer;
        function toast(message) {
            el.toast.textContent = message;
            el.toast.classList.add('visible');
            clearTimeout(toastTimer);
            toastTimer = setTimeout(function () { el.toast.classList.remove('visible'); }, 3200);
        }

        // ── Markup helpers ──
        function typography(item) {
            return '<span class="typographic-media"><span class="type-label">' + (item.gift ? 'ATRI GIFT' : COVER_LABELS[item.format]) + '</span>' +
                '<span class="type-title">' + esc(item.name) + '</span>' +
                (item.author ? '<span class="type-author">' + esc(item.author) + '</span>' : '') +
                '<span class="type-mark" aria-hidden="true">✦</span></span>';
        }

        function imageMarkup(item) {
            if (!item.image) return typography(item);
            return '<img src="' + esc(item.image) + '" alt="' + esc(item.name) + ' cover" loading="lazy" data-cover="' + esc(item.id) + '">';
        }

        function priceMarkup(item) {
            if (!isFinite(item.price)) return '';
            return (isFinite(item.regular) ? '<s>' + money(item.regular) + '</s> ' : '') + money(item.price);
        }

        function labelsMarkup(item) {
            if (!item.labels.length) return '';
            return '<p class="product-labels">' + item.labels.map(function (name) {
                return '<span class="product-label">' + esc(name) + '</span>';
            }).join(' ') + '</p>';
        }

        function isSaved(id) { return state.saved.indexOf(id) > -1; }

        function card(item) {
            var saved = isSaved(item.id);
            return '<article class="resource-card" data-card="' + esc(item.id) + '">' +
                '<button type="button" class="save-button" data-save="' + esc(item.id) + '" aria-pressed="' + saved + '" ' +
                'aria-label="' + (saved ? 'Remove ' : 'Save ') + esc(item.name) + (saved ? ' from' : ' to') + ' my picks">' +
                '<span aria-hidden="true">' + (saved ? '♥' : '♡') + '</span></button>' +
                (item.sample ? '<button type="button" class="sample-badge" data-sample="' + esc(item.id) + '" ' +
                    'aria-label="' + esc(cfg.sampleText + ': ' + item.name) + '"><span aria-hidden="true">❧</span> ' + esc(cfg.sampleText) + '</button>' : '') +
                '<button type="button" class="resource-media ' + item.color + '" data-open="' + esc(item.id) + '" ' +
                'aria-label="Explore ' + esc(item.name) + '" tabindex="-1">' + imageMarkup(item) + '</button>' +
                '<div class="resource-info">' + labelsMarkup(item) +
                '<p class="eyebrow">' + esc(item.subtitle || item.tag || cfg.tabLabels[item.format]) + '</p>' +
                '<h3><button type="button" class="title-button" data-open="' + esc(item.id) + '">' + esc(item.name) + '</button></h3>' +
                '<p class="resource-author">' + esc(item.author) + '</p>' +
                '<p class="resource-summary">' + esc(item.summary) + '</p>' +
                (item.summary ? '<button type="button" class="text-link explore-more" data-open="' + esc(item.id) + '" ' +
                    'aria-label="Explore more about ' + esc(item.name) + '">Explore more <span aria-hidden="true">↗</span></button>' : '') +
                '<div class="resource-actions">' +
                '<span class="resource-price">' + priceMarkup(item) + '</span>' +
                (isFinite(item.price)
                    ? '<button type="button" data-add="' + esc(item.id) + '" aria-label="' + esc(cfg.buttonText + ': ' + item.name + ', ' + money(item.price)) + '">' +
                        esc(cfg.buttonText) + ' <span aria-hidden="true">↗</span></button>'
                    : '<button type="button" data-open="' + esc(item.id) + '">Explore <span aria-hidden="true">↗</span></button>') +
                '</div></div></article>';
        }

        // ── Browse ──
        function topicsFor(tab) {
            var series = SERIES_FILTERS.filter(function (f) {
                return products.some(function (p) { return inTab(p, tab) && p.seriesTopics.indexOf('series:' + f.key) > -1; });
            }).map(function (f) { return { slug: 'series:' + f.key, name: f.name }; });
            return series.concat(categoryTopicsFor(tab));
        }
        function categoryTopicsFor(tab) {
            var seen = {};
            var out = [];
            products.forEach(function (p) {
                if (!inTab(p, tab)) return;
                p.topics.forEach(function (t) {
                    if (!seen[t.slug]) { seen[t.slug] = true; out.push(t); }
                });
            });
            if (!categories) return out;
            return out
                .filter(function (t) { return categories[t.slug]; })
                .map(function (t) {
                    var c = categories[t.slug];
                    return { slug: t.slug, name: c.name, description: c.description, order: c.order };
                })
                .sort(function (a, b) { return a.order - b.order; });
        }

        function browse() {
            var tokens = fold(state.query).trim().split(/\s+/).filter(Boolean);
            var result = products.filter(function (p) {
                return inTab(p, state.tab) &&
                    (state.topic === 'all' || hasTopic(p, state.topic)) &&
                    tokens.every(function (t) { return p.search.indexOf(t) > -1; });
            });
            var byPrice = function (dir) {
                return function (a, b) {
                    var x = isFinite(a.price) ? a.price : Infinity * dir;
                    var y = isFinite(b.price) ? b.price : Infinity * dir;
                    return (x - y) * dir || a.order - b.order;
                };
            };
            if (state.sort === 'title') result.sort(function (a, b) { return a.name.localeCompare(b.name); });
            else if (state.sort === 'price-asc') result.sort(byPrice(1));
            else if (state.sort === 'price-desc') result.sort(byPrice(-1));
            else result.sort(function (a, b) { return a.order - b.order; });
            return result;
        }

        function renderTabs() {
            var counts = {};
            products.forEach(function (p) { p.formats.forEach(function (f) { counts[f] = (counts[f] || 0) + 1; }); });
            tabs = FORMATS.filter(function (f) { return counts[f]; });
            el.tabs.innerHTML = tabs.map(function (f) {
                return '<button type="button" role="tab" id="' + uid + '-tab-' + f + '" aria-controls="' + el.panel.id + '" ' +
                    'data-tab="' + f + '">' + esc(cfg.tabLabels[f]) +
                    '<span class="tab-count" aria-label="' + counts[f] + ' items">' + counts[f] + '</span></button>';
            }).join('');
            el.tabs.hidden = tabs.length < 2;
            if (tabs.length > 1) el.panel.setAttribute('role', 'tabpanel');
            state.tab = tabs[0] || 'books';
        }

        function render() {
            el.tabs.querySelectorAll('[data-tab]').forEach(function (button) {
                var selected = button.dataset.tab === state.tab;
                button.setAttribute('aria-selected', String(selected));
                button.tabIndex = selected ? 0 : -1;
            });
            if (tabs.length > 1) el.panel.setAttribute('aria-labelledby', uid + '-tab-' + state.tab);

            var topics = topicsFor(state.tab);
            if (state.topic !== 'all' && !topics.some(function (t) { return t.slug === state.topic; })) state.topic = 'all';
            el.topics.innerHTML = [{ slug: 'all', name: 'All topics' }].concat(topics).map(function (t) {
                return '<button type="button" data-topic="' + esc(t.slug) + '" aria-pressed="' + (t.slug === state.topic) + '"' +
                    (t.description ? ' title="' + esc(t.description) + '"' : '') + '>' + esc(t.name) + '</button>';
            }).join('');
            el.topics.hidden = topics.length < 2;

            var matches = browse();
            var visible = matches.slice(0, state.limit);
            el.grid.innerHTML = visible.map(card).join('');

            var topicName = '';
            topics.forEach(function (t) { if (t.slug === state.topic) topicName = t.name; });
            el.count.textContent = matches.length
                ? 'Showing ' + visible.length + ' of ' + matches.length + ' · ' + cfg.tabLabels[state.tab] + (topicName ? ' · ' + topicName : '')
                : 'No matching resources';
            el.empty.hidden = !!matches.length;
            el.more.hidden = state.limit >= matches.length;
            el.more.innerHTML = (state.tab === 'collections' ? 'Explore more bundles &amp; gifts'
                : state.tab === 'media' ? 'Explore more series' : 'Find more gifts') + ' <span aria-hidden="true">↓</span>';
            el.moreCount.textContent = state.limit < matches.length ? (matches.length - visible.length) + ' more to explore' : '';
            el.reset.hidden = !(state.query || state.topic !== 'all' || state.sort !== 'featured');
            el.clear.hidden = !state.query;
        }

        // Re-rendering replaces buttons; put focus back on the equivalent one.
        function refocus(attr, value) {
            var target = root.querySelector('[' + attr + '="' + CSS.escape(value) + '"]');
            if (target) target.focus({ preventScroll: true });
        }

        function reset() {
            state.query = '';
            state.topic = 'all';
            state.sort = 'featured';
            state.limit = cfg.pageSize;
            el.search.value = '';
            el.sort.value = 'featured';
            render();
        }

        function switchTab(tab, focus) {
            if (tabs.indexOf(tab) < 0) return;
            state.tab = tab;
            state.limit = cfg.pageSize;
            render();
            if (focus) document.getElementById(uid + '-tab-' + tab).focus();
        }

        // ── Detail dialog ──
        function productUrl(item) {
            if (!cfg.productUrl) return '';
            return cfg.productUrl
                .replace('{permalink}', encodeURIComponent(item.permalink))
                .replace('{sku}', encodeURIComponent(item.id));
        }

        function relatives(item) {
            return products.filter(function (p) {
                return p.id !== item.id && ((item.series && p.series === item.series) ||
                    item.related.indexOf(p.id) > -1 || p.related.indexOf(item.id) > -1);
            });
        }

        function relatedBox(item) {
            var others = relatives(item);
            if (!others.length) return '';
            var wants = item.format === 'books' ? 'media' : item.format === 'media' ? 'books' : null;
            var pair = null;
            others.forEach(function (p) { if (!pair && p.format === wants) pair = p; });
            var rest = others.filter(function (p) { return p !== pair; });
            var chips = rest.length
                ? '<div class="detail-books">' + rest.map(function (p) {
                return '<button type="button" data-open="' + esc(p.id) + '">' + esc(p.name) + ' →</button>';
            }).join('') + '</div>'
                : '';

            if (pair) {
                var book = item.format === 'books';
                return '<div class="related-box"><p class="eyebrow">' + (book ? 'PAIR THE BOOK WITH THE TV SERIES' : 'PAIR THE SERIES WITH THE BOOK') + '</p>' +
                    '<h3>' + esc(pair.name) + '</h3>' +
                    '<p>' + (book
                        ? 'Make your gift a resource to return to. Explore the related conversations on The John Ankerberg Show, for personal study or to share with someone you love.'
                        : 'Give the conversation a companion. The related book lets someone keep exploring long after the program ends.') + '</p>' +
                    '<button type="button" class="text-link" data-open="' + esc(pair.id) + '">' + (book ? 'Explore the related TV series' : 'Explore the related book') +
                    ' <span aria-hidden="true">→</span></button>' +
                    (rest.length ? '<p class="includes-title">More from this series</p>' + chips : '') +
                    '</div>';
            }
            return '<div class="related-box"><p class="eyebrow">MORE FROM THIS SERIES</p><h3>Explore related resources.</h3>' +
                '<p>These resources share the same guest or program. Give them together or on their own.</p>' + chips + '</div>';
        }

        function detail(item) {
            var saved = isSaved(item.id);
            var url = productUrl(item);
            var eyebrow = item.gift ? 'ATRI GIFT' : item.format === 'collections' ? 'BUNDLE' : item.format === 'media' ? 'TV SERIES' : 'A GIFT WITH A LASTING IMPACT';
            var byline = [item.author, item.subtitle].filter(Boolean).join(' · ');
            var price = priceMarkup(item);

            el.dialog.classList.remove('is-reading');
            el.detail.innerHTML =
                '<div class="detail-main"><div class="detail-image">' + imageMarkup(item) + '</div><div class="detail-info">' +
                labelsMarkup(item) +
                '<p class="eyebrow">' + eyebrow + '</p>' +
                '<h2 id="' + uid + '-detail-title">' + esc(item.name) + '</h2>' +
                (byline ? '<p class="detail-author">' + esc(byline) + '</p>' : '') +
                (price ? '<p class="detail-price">' + price + '</p>' : '') +
                '<div class="detail-description">' + item.paragraphs.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') + '</div>' +
                (item.includes.length ? '<p class="includes-title">Includes</p><ul class="includes-list">' +
                    item.includes.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') +
                (price
                    ? '<button type="button" class="button button-green" data-add="' + esc(item.id) + '">' + esc(cfg.buttonText) + ' · ' + money(item.price) + ' <span aria-hidden="true">→</span></button>'
                    : '') +
                (item.sample ? '<button type="button" class="button button-outline" data-sample="' + esc(item.id) + '">' + esc(cfg.sampleText) + ' <span aria-hidden="true">❧</span></button>' : '') +
                (url ? '<a class="button button-outline" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">View full details <span aria-hidden="true">↗</span></a>' : '') +
                '<button type="button" class="save-inline" data-save="' + esc(item.id) + '" aria-pressed="' + saved + '">' +
                (saved ? '♥ Saved to my picks · Remove' : '♡ Save to my Christmas picks') + '</button>' +
                '<p class="fine">Prices and availability are confirmed at checkout.</p>' +
                '</div></div>' + relatedBox(item);
        }

        // Reader view inside the dialog. Phones get a new tab instead: embedded PDFs
        // there often show only the first page and can't be scrolled.
        function openSample(id) {
            var item = byId[id];
            if (!item || !item.sample) return;
            if (phone.matches) { window.open(item.sample, '_blank', 'noopener'); return; }

            var src = isPdf(item.sample) && item.sample.indexOf('#') < 0 ? item.sample + '#view=FitH&navpanes=0' : item.sample;
            var price = priceMarkup(item);
            state.detailId = id;
            el.dialog.classList.add('is-reading');
            el.detail.innerHTML =
                '<div class="sample-view">' +
                '<div class="sample-bar">' +
                '<button type="button" class="text-link" data-open="' + esc(item.id) + '"><span aria-hidden="true">←</span> Back to details</button>' +
                '<p class="sample-title" id="' + uid + '-detail-title">' + esc(item.name) + ' <span>· Sample</span></p>' +
                '<a class="text-link" href="' + esc(item.sample) + '" target="_blank" rel="noopener noreferrer">Open in new tab <span aria-hidden="true">↗</span></a>' +
                '</div>' +
                '<iframe class="sample-frame" src="' + esc(src) + '" title="' + esc('Sample of ' + item.name) + '" loading="lazy"></iframe>' +
                (price ? '<div class="sample-footer"><p>Enjoying it? <strong>' + esc(item.name) + '</strong></p>' +
                    '<button type="button" class="button button-green" data-add="' + esc(item.id) + '">' + esc(cfg.buttonText) + ' · ' + money(item.price) +
                    ' <span aria-hidden="true">→</span></button></div>' : '') +
                '</div>';
            if (!el.dialog.open) el.dialog.showModal();
            el.dialog.querySelector('.sample-bar [data-open]').focus();
            el.dialog.scrollTop = 0;
        }

        function openItem(id) {
            var item = byId[id];
            if (!item) return;
            var wasOpen = el.dialog.open;
            state.detailId = id;
            detail(item);
            if (!wasOpen) el.dialog.showModal();
            else el.dialog.querySelector('[data-close]').focus();
            el.dialog.scrollTop = 0;
        }

        function save(id) {
            if (!byId[id]) return;
            var wasSaved = isSaved(id);
            state.saved = wasSaved
                ? state.saved.filter(function (x) { return x !== id; })
                : state.saved.concat(id);
            writePicks(state.saved, byId, root);
            var inDialog = el.dialog.contains(document.activeElement);
            render();
            if (state.detailId) {
                var scroll = el.dialog.scrollTop;
                detail(byId[state.detailId]);
                el.dialog.scrollTop = scroll;
            }
            if (inDialog) { var b = el.detail.querySelector('[data-save]'); if (b) b.focus({ preventScroll: true }); }
            else refocus('data-save', id);
            toast((wasSaved ? 'Removed from' : 'Saved to') + ' my picks.');
        }

        // Keep the hearts in sync when picks change elsewhere (cart drawer, another tab).
        function syncPicks() {
            state.saved = loadPicks();
            if (products.length) render();
        }
        window.addEventListener(PICKS_EVENT, function (e) {
            if (!e.detail || e.detail.source !== root) syncPicks();
        });
        window.addEventListener('storage', function (e) {
            if (e.key === PICKS_KEY) syncPicks();
        });

        function addToCart(btn, item) {
            var payload = {
                type: 'product', sku: item.id, name: item.name, unit_cents: Math.round(item.price * 100),
                quantity: 1, image: item.image, campaign: cfg.campaign, shippable: item.shippable
            };
            btn.dispatchEvent(new CustomEvent(CART_EVENT, { bubbles: true, cancelable: true, detail: payload }));
            if (window.ATRICart && typeof window.ATRICart.add === 'function') window.ATRICart.add(payload);

            var original = btn.innerHTML;
            btn.classList.add('is-added');
            btn.textContent = 'Added to cart ✓';
            toast(item.name + ' added to cart.');
            setTimeout(function () {
                btn.classList.remove('is-added');
                btn.innerHTML = original;
            }, 1800);
        }

        // ── Events ──
        el.search.addEventListener('input', function () {
            state.query = el.search.value;
            state.limit = cfg.pageSize;
            render();
        });
        // Results already update as you type; the Search button just commits and jumps to them.
        el.form.addEventListener('submit', function (event) {
            event.preventDefault();
            state.query = el.search.value;
            state.limit = cfg.pageSize;
            render();
            el.count.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
        el.sort.addEventListener('change', function () {
            state.sort = el.sort.value;
            state.limit = cfg.pageSize;
            render();
        });
        el.clear.addEventListener('click', function () {
            state.query = '';
            state.limit = cfg.pageSize;
            el.search.value = '';
            render();
            el.search.focus();
        });
        el.more.addEventListener('click', function () {
            var oldCount = state.limit;
            state.limit += cfg.pageSize;
            render();
            var next = el.grid.querySelectorAll('[data-card]')[oldCount];
            var target = next && next.querySelector('.title-button');
            if (target) target.focus({ preventScroll: true });
        });

        root.addEventListener('click', function (event) {
            var target = event.target.closest('button');
            if (!target || !root.contains(target)) return;
            var d = target.dataset;
            if (d.save) { save(d.save); return; }
            if (d.add) { addToCart(target, byId[d.add]); return; }
            if (d.sample) { openSample(d.sample); return; }
            if (d.open) { openItem(d.open); return; }
            if (d.tab) { switchTab(d.tab); return; }
            if (d.topic) {
                state.topic = d.topic;
                state.limit = cfg.pageSize;
                render();
                refocus('data-topic', d.topic);
                return;
            }
            if (target.hasAttribute('data-close')) { el.dialog.close(); return; }
            if (target.hasAttribute('data-reset')) { reset(); el.search.focus(); }
        });

        el.tabs.addEventListener('keydown', function (event) {
            if (!event.target.dataset.tab) return;
            var i = tabs.indexOf(state.tab);
            var next;
            if (event.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
            else if (event.key === 'ArrowLeft') next = tabs[(i + tabs.length - 1) % tabs.length];
            else if (event.key === 'Home') next = tabs[0];
            else if (event.key === 'End') next = tabs[tabs.length - 1];
            if (next) { event.preventDefault(); switchTab(next, true); }
        });

        // Close on backdrop click
        el.dialog.addEventListener('click', function (event) {
            if (event.target !== el.dialog) return;
            var rect = el.dialog.getBoundingClientRect();
            if (event.clientX < rect.left || event.clientX > rect.right ||
                event.clientY < rect.top || event.clientY > rect.bottom) el.dialog.close();
        });
        el.dialog.addEventListener('close', function () {
            state.detailId = null;
            el.dialog.classList.remove('is-reading');
            el.detail.innerHTML = ''; // unloads the sample iframe
        });

        // Broken cover → typographic cover
        root.addEventListener('error', function (event) {
            var img = event.target;
            if (img && img.dataset && img.dataset.cover && byId[img.dataset.cover]) {
                img.parentElement.innerHTML = typography(byId[img.dataset.cover]);
            }
        }, true);

        // ── Load ──
        function fail(err) {
            console.error('[Resource catalog] failed to load products:', err);
            el.grid.innerHTML = '';
            el.count.textContent = '';
            el.error.hidden = false;
        }

        if (!cfg.url) { fail(new Error('No products endpoint configured')); return; }

        Promise.all([
            fetchProducts(cfg.url, cfg.cacheMinutes),
            fetchCategories(cfg.categoriesUrl, cfg.cacheMinutes)
        ])
            .then(function (loaded) {
                var items = loaded[0];
                categories = loaded[1];
                products = items
                    .filter(function (raw) {
                        return raw && raw.sku && !(raw.categories || []).some(function (c) {
                            return cfg.excludeCategories.indexOf(String(c.slug).toLowerCase()) > -1;
                        });
                    })
                    .map(function (raw, i) { return normalize(raw, i, cfg); });
                products.forEach(function (p) { byId[p.id] = p; });
                if (!products.length) { fail(new Error('No products returned')); return; }
                // Backfill name/image/price for picks saved before details were stored.
                if (state.saved.length) writePicks(state.saved, byId, root);
                renderTabs();
                render();
                followHash();
            })
            .catch(fail);

        /* Quick links: #books, #tv-collections, #study-resources and #gifts jump to this catalog
           (and #product-<SKU> opens one product; #store, #catalog and #resources just scroll here)
           and open the matching view. Product sections have no fixed ids, so the hash is handled
           here; html scroll-padding (hero module) keeps it clear of the fixed header.
           A view is a tab, or a topic (category slug) whose tab is found from the products. */
        var HASH_VIEWS = {
            books: { tab: 'books' },
            'tv-collections': { tab: 'media' }, tv: { tab: 'media' }, media: { tab: 'media' },
            'study-resources': { tab: 'collections' }, collections: { tab: 'collections' },
            gifts: { topic: 'atri-merchandise' }, merchandise: { topic: 'atri-merchandise' },
            'facts-on': { topic: 'series:facts-on' },
            catalog: {}, resources: {}, store: {}
        };
        function tabWithTopic(slug) {
            var counts = {};
            products.forEach(function (p) {
                if (hasTopic(p, slug)) p.formats.forEach(function (f) { counts[f] = (counts[f] || 0) + 1; });
            });
            var best = null;
            tabs.forEach(function (t) { if (counts[t] && (!best || counts[t] > counts[best])) best = t; });
            return best;
        }
        // #product-<SKU> (e.g. #product-ATRI-WHT-MUG) shows that product's tab and opens its details.
        function productFromHash(key) {
            var m = /^product-(.+)$/.exec(key);
            if (!m) return null;
            var sku = decodeURIComponent(m[1]).toLowerCase();
            for (var i = 0; i < products.length; i++) if (String(products[i].id).toLowerCase() === sku) return products[i];
            return null;
        }
        function followHash(hashText) {
            var key = (hashText || window.location.hash).replace(/^#/, '').toLowerCase();
            if (!products.length) return;
            var product = productFromHash(key);
            if (!product && !Object.prototype.hasOwnProperty.call(HASH_VIEWS, key)) return;
            var view = product ? { tab: product.format } : HASH_VIEWS[key];
            var tab = view.topic ? tabWithTopic(view.topic) : view.tab;
            if (view.tab || view.topic) {
                // Start from a clean view so nothing typed or picked earlier hides the products.
                state.query = '';
                if (el.search) el.search.value = '';
                state.topic = view.topic && tab ? view.topic : 'all';
                if (tab && tabs.indexOf(tab) > -1) switchTab(tab); else render();
            }
            var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            root.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
            if (product) openItem(product.id);
        }
        window.addEventListener('hashchange', function () { followHash(); });
        // Clicking the same quick link twice doesn't fire hashchange, so catch the click too.
        document.addEventListener('click', function (e) {
            // Also full links to this page, like the nav's https://atriresearch.org/#store.
            var a = e.target.closest && e.target.closest('a[href*="#"]');
            if (!a || !a.hash || a.hash !== window.location.hash) return;
            if (a.origin !== window.location.origin || a.pathname !== window.location.pathname) return;
            followHash(a.hash);
        });
    }

    function boot() { document.querySelectorAll('.atri-catalog').forEach(init); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
