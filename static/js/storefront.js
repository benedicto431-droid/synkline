const app = document.querySelector("#app");
const FALLBACK_IMAGE = "/images/laptop-silver.jpg";
const CART_KEY = "synkline-cart";
const VISITOR_KEY = "synkline-visitor";
let accentColor = "#2469c9";

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);

const money = (value) =>
  new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

function safeImage(value) {
  const image = String(value || "");
  return image.startsWith("/images/") || image.startsWith("/uploads/") || image.startsWith("https://")
    ? image
    : FALLBACK_IMAGE;
}

function readCart() {
  try {
    const cart = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
    return Array.isArray(cart)
      ? cart.filter((item) => item && typeof item.productId === "string" && Number(item.quantity) > 0)
      : [];
  } catch {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  document.querySelectorAll("[data-cart-count]").forEach((node) => {
    const count = cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    node.textContent = String(count);
    node.hidden = count === 0;
  });
}

async function api(url, options = {}) {
  const headers = new Headers(options.headers || {});
  let body = options.body;
  if (body && !(body instanceof FormData) && typeof body !== "string") {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(body);
  }
  const response = await fetch(url, {
    ...options,
    headers,
    body,
    credentials: "same-origin",
  });
  if (response.status === 204) return null;
  const contentType = response.headers.get("content-type") || "";
  const result = contentType.includes("application/json")
    ? await response.json()
    : { error: await response.text() };
  if (!response.ok) {
    const error = new Error(result.error || `Request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return result;
}

function toast(message) {
  document.querySelector(".toast")?.remove();
  const element = document.createElement("div");
  element.className = "toast";
  element.setAttribute("role", "status");
  element.textContent = message;
  document.body.append(element);
  window.setTimeout(() => element.remove(), 3200);
}

function reportImageFailures() {
  document.querySelectorAll("img[data-fallback]").forEach((image) => {
    image.addEventListener("error", () => {
      if (image.dataset.fallbackApplied !== "true") {
        image.dataset.fallbackApplied = "true";
        image.src = FALLBACK_IMAGE;
      }
    }, { once: true });
  });
}

function getVisitorId() {
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = window.crypto?.randomUUID
        ? window.crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  }
}

function trackCurrentPage() {
  api("/api/track", {
    method: "POST",
    body: { visitorId: getVisitorId(), path: window.location.pathname },
  }).catch(() => {});
}

function shell(content, options = {}) {
  const count = readCart().reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const adminPage = options.admin === true;
  return `
    <div class="topline">A good machine changes your everyday. Find yours.</div>
    <div class="page-shell">
      <header class="site-header">
        <div class="nav-inner">
          <a class="brand" href="/" aria-label="Synkline Stores home">
            <span class="brand-icon" aria-hidden="true">S</span>
            <span>synkline<span class="brand-dot">.</span></span>
          </a>
          <nav class="nav-links" aria-label="Main navigation">
            <a href="/">Shop laptops</a>
            <a href="/#compare">Compare</a>
            <a href="/#guidance">Buying guide</a>
          </nav>
          <div class="nav-actions">
            ${adminPage ? '<a class="button button-secondary button-small" href="/">Back to shop</a>' : ""}
            <a class="bag-link" href="/checkout" aria-label="Your bag, ${count} items">
              <span>Your bag</span><span class="bag-count" data-cart-count ${count === 0 ? "hidden" : ""}>${count}</span>
            </a>
            <button class="icon-button menu-toggle" type="button" data-menu-toggle aria-label="Open navigation">Menu</button>
          </div>
        </div>
        <nav class="mobile-links" data-mobile-links aria-label="Mobile navigation">
          <a href="/">Shop laptops</a>
          <a href="/#compare">Compare models</a>
          <a href="/#guidance">Buying guide</a>
        </nav>
      </header>
      ${content}
      <footer class="site-footer">
        <div class="wrap footer-inner">
          <div>
            <a class="brand" href="/"><span>synkline<span class="brand-dot">.</span></span></a>
            <p class="footer-description">Straightforward laptop shopping, with the details you need and room to choose at your own pace.</p>
          </div>
          <nav class="footer-links" aria-label="Footer navigation">
            <a href="/#compare">Compare</a><a href="/#guidance">Buying guide</a><a href="/admin">Store access</a>
          </nav>
          <p class="privacy-note">We record anonymous page-view counts to understand which parts of the shop are useful. No names, email addresses, device fingerprints, or IP addresses are stored for this analytics feature.</p>
          <p class="copyright">© 2026 Synkline Stores · Clear specs. Confident choices.</p>
        </div>
      </footer>
    </div>`;
}

function headerActions() {
  document.querySelector("[data-menu-toggle]")?.addEventListener("click", () => {
    document.querySelector("[data-mobile-links]")?.classList.toggle("open");
  });
}

function categoryChip(name, selected) {
  return `<button class="category-chip ${selected ? "active" : ""}" type="button" data-category="${escapeHtml(name)}">${escapeHtml(name)}</button>`;
}

function productCard(product, compared) {
  const image = safeImage(product.images?.[0]);
  return `
    <article class="product-card">
      <a class="product-visual" href="/product/${encodeURIComponent(product.id)}" aria-label="View ${escapeHtml(product.name)}">
        <img src="${escapeHtml(image)}" alt="${escapeHtml(product.name)}" loading="lazy" data-fallback />
        ${product.featured ? '<span class="pill pill-pick">Staff pick</span>' : ""}
        <span class="pill pill-stock">${Number(product.stock) > 0 ? "In stock" : "Sold out"}</span>
      </a>
      <div class="product-body">
        <div class="product-meta">${escapeHtml(product.brand)} <span aria-hidden="true">/</span> ${escapeHtml(product.category)}</div>
        <h3 class="product-name"><a href="/product/${encodeURIComponent(product.id)}">${escapeHtml(product.name)}</a></h3>
        <p class="product-description">${escapeHtml(product.description)}</p>
      </div>
      <div class="product-price-row">
        <span class="price">${money(product.price)}</span><span class="price-note">one-time</span>
        <button class="button button-soft button-small" type="button" data-add="${escapeHtml(product.id)}" aria-label="Add ${escapeHtml(product.name)} to bag" ${Number(product.stock) < 1 ? "disabled" : ""}>Add</button>
      </div>
      <div class="card-controls">
        <button class="compare-toggle ${compared ? "selected" : ""}" type="button" data-compare="${escapeHtml(product.id)}">
          <span class="checkbox-mark">${compared ? "✓" : ""}</span>${compared ? "In comparison" : "Compare specs"}
        </button>
        <a class="text-link" href="/product/${encodeURIComponent(product.id)}">Details <span aria-hidden="true">→</span></a>
      </div>
    </article>`;
}

function comparisonTable(products) {
  if (!products.length) {
    return `<div class="compare-empty"><span aria-hidden="true">+</span><span>Your comparison will appear here. Add up to three laptops from the lineup.</span></div>`;
  }
  const specKeys = [...new Set(products.flatMap((product) => Object.keys(product.specs || {})))].slice(0, 6);
  const rows = [
    ["Price", (product) => money(product.price)],
    ["Category", (product) => product.category],
    ...specKeys.map((key) => [key, (product) => product.specs?.[key] || "—"]),
    ["Availability", (product) => Number(product.stock) > 0 ? `${product.stock} available` : "Unavailable"],
  ];
  return `<div class="table-scroll"><table class="data-table">
    <thead><tr><th scope="col">At a glance</th>${products.map((product) => `<th scope="col">${escapeHtml(product.name)} <button class="compare-toggle" type="button" data-compare="${escapeHtml(product.id)}" aria-label="Remove ${escapeHtml(product.name)} from comparison">Remove</button></th>`).join("")}</tr></thead>
    <tbody>${rows.map(([label, value]) => `<tr><th scope="row">${escapeHtml(label)}</th>${products.map((product) => `<td>${escapeHtml(value(product))}</td>`).join("")}</tr>`).join("")}</tbody>
  </table></div>`;
}

async function showHome() {
  app.innerHTML = shell('<main class="wrap"><div class="loading-block">Loading the laptop lineup…</div></main>');
  headerActions();
  let products;
  try {
    products = await api("/api/products");
  } catch {
    app.innerHTML = shell(`<main class="wrap section"><div class="panel"><h1 class="panel-title">The lineup is taking a moment.</h1><p class="panel-copy">We couldn’t reach the store catalogue. Check the connection and try again.</p><button class="button button-primary" type="button" data-retry>Try again</button></div></main>`);
    headerActions();
    document.querySelector("[data-retry]")?.addEventListener("click", showHome);
    return;
  }

  let category = "All laptops";
  let search = "";
  let sort = "featured";
  let compareIds = [];
  let heroIndex = 0;
  const categories = ["All laptops", ...new Set(products.map((product) => product.category).filter(Boolean))];

  const render = () => {
    const query = search.trim().toLowerCase();
    const filtered = products
      .filter((product) => category === "All laptops" || product.category === category)
      .filter((product) => `${product.name} ${product.brand} ${product.category} ${product.description} ${Object.values(product.specs || {}).join(" ")}`.toLowerCase().includes(query))
      .sort((a, b) => sort === "price-low" ? a.price - b.price
        : sort === "price-high" ? b.price - a.price
          : sort === "name" ? a.name.localeCompare(b.name)
            : Number(b.featured) - Number(a.featured));
    const compared = products.filter((product) => compareIds.includes(product.id));
    const hero = products.length ? products[heroIndex % products.length] : null;
    const slideCopy = [
      ["Your next idea deserves a great machine.", "Compare the details that matter, see every angle, and find a laptop that fits the way you work and live."],
      ["Find the fit. Then get to it.", "Clear specifications and thoughtful recommendations make it easier to choose with confidence."],
      ["More clarity. Better computing.", "Browse the collection, compare models side by side, and order as a guest when you are ready."],
    ];
    const copy = slideCopy[heroIndex % slideCopy.length];
    app.innerHTML = shell(`
      <main>
        <section class="wrap hero" aria-label="Featured laptops">
          <div class="hero-copy">
            <p class="eyebrow">A better way to choose</p>
            <h1 class="display-title" data-hero-title>${copy[0]}</h1>
            <p class="hero-subtitle" data-hero-copy>${copy[1]}</p>
            <div class="hero-actions"><a class="button button-primary" href="#catalog">Explore the lineup <span aria-hidden="true">→</span></a><a class="button button-secondary" href="#compare">Compare models</a></div>
            <div class="hero-dots" role="group" aria-label="Showcase slides">${slideCopy.map((_, index) => `<button class="hero-dot ${index === heroIndex % slideCopy.length ? "active" : ""}" type="button" data-hero-dot="${index}" aria-label="Show showcase slide ${index + 1}"></button>`).join("")}</div>
          </div>
          <div class="hero-visual"><img class="hero-image" data-hero-image src="${escapeHtml(safeImage(hero?.images?.[0] || "/images/store-hero.jpg"))}" alt="${escapeHtml(hero ? `${hero.name} laptop` : "A laptop from the Synkline collection")}" data-fallback /><span class="hero-caption" data-hero-caption>${escapeHtml(hero?.name || "A considered collection")}</span></div>
        </section>
        <section class="wrap section" id="catalog">
          <div class="section-heading"><div><p class="eyebrow">The lineup</p><h2 class="section-title">Meet your next laptop.</h2><p class="section-copy">Every pick has clear specifications, honest availability, and room to compare before you decide.</p></div><span class="guest-note">Guest checkout · No account needed</span></div>
          <div class="filterbar"><div class="category-list">${categories.map((name) => categoryChip(name, category === name)).join("")}</div><div class="filter-actions"><input class="field search-field" type="search" placeholder="Search laptops" aria-label="Search laptops" data-search value="${escapeHtml(search)}" /><select class="select-field filter-select" aria-label="Sort laptops" data-sort><option value="featured" ${sort === "featured" ? "selected" : ""}>Featured first</option><option value="price-low" ${sort === "price-low" ? "selected" : ""}>Price: low to high</option><option value="price-high" ${sort === "price-high" ? "selected" : ""}>Price: high to low</option><option value="name" ${sort === "name" ? "selected" : ""}>Name A–Z</option></select></div></div>
          ${filtered.length ? `<div class="product-grid">${filtered.map((product, index) => `<div style="animation-delay:${Math.min(index * 55, 300)}ms">${productCard(product, compareIds.includes(product.id))}</div>`).join("")}</div>` : `<div class="empty-state">No laptops match that search. Try another name or clear the filters.</div>`}
        </section>
        <section class="wrap section" id="compare"><div class="compare-panel"><div class="section-heading"><div><p class="eyebrow">Side by side</p><h2 class="section-title">A clearer comparison.</h2><p class="section-copy">Choose up to three laptops above to line up their key details.</p></div><a class="text-link" href="#catalog">Choose laptops <span aria-hidden="true">→</span></a></div><div data-compare-table>${comparisonTable(compared)}</div></div></section>
        <section class="wrap section" id="guidance"><div class="guide-grid"><div class="guide-feature"><p class="eyebrow">A little guidance</p><h2>The best laptop is the one that fits your day.</h2><p>Start with what you will do most. Then compare memory, storage, and screen details across the models that catch your eye.</p><a class="button button-secondary" href="#catalog">Browse the lineup <span aria-hidden="true">→</span></a></div><div class="guide-cards"><article class="guide-card"><span class="eyebrow">01 / Workload</span><strong>Match the performance</strong><p>Choose a processor and memory level that fits the apps you use most.</p></article><article class="guide-card"><span class="eyebrow">02 / Storage</span><strong>Make room for projects</strong><p>Storage capacity matters for large files, libraries, and creative work.</p></article><article class="guide-card"><span class="eyebrow">03 / Shopping</span><strong>Order without an account</strong><p>Share delivery details at checkout. No customer registration needed.</p></article><article class="guide-card"><span class="eyebrow">04 / Confidence</span><strong>Compare calmly</strong><p>Put up to three laptops side by side before you choose.</p></article></div></div></section>
      </main>`);
    headerActions();
    reportImageFailures();
    document.querySelectorAll("[data-category]").forEach((button) => button.addEventListener("click", () => {
      category = button.dataset.category;
      render();
    }));
    document.querySelector("[data-search]")?.addEventListener("input", (event) => {
      const input = event.currentTarget;
      const selection = input.selectionStart;
      search = input.value;
      render();
      const next = document.querySelector("[data-search]");
      next.focus();
      next.setSelectionRange(selection, selection);
    });
    document.querySelector("[data-sort]")?.addEventListener("change", (event) => {
      sort = event.currentTarget.value;
      render();
    });
    document.querySelectorAll("[data-add]").forEach((button) => button.addEventListener("click", () => {
      const id = button.dataset.add;
      const cart = readCart();
      const existing = cart.find((line) => line.productId === id);
      saveCart(existing
        ? cart.map((line) => line.productId === id ? { ...line, quantity: line.quantity + 1 } : line)
        : [...cart, { productId: id, quantity: 1 }]);
      toast("Added to your bag.");
    }));
    document.querySelectorAll("[data-compare]").forEach((button) => button.addEventListener("click", () => {
      const id = button.dataset.compare;
      if (compareIds.includes(id)) compareIds = compareIds.filter((item) => item !== id);
      else if (compareIds.length < 3) compareIds = [...compareIds, id];
      else { toast("Choose up to three laptops to compare."); return; }
      render();
      document.querySelector("[data-compare-table]")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }));
    document.querySelectorAll("[data-hero-dot]").forEach((button) => button.addEventListener("click", () => {
      heroIndex = Number(button.dataset.heroDot);
      updateHero();
    }));
  };

  const updateHero = () => {
    const slideCopy = [
      ["Your next idea deserves a great machine.", "Compare the details that matter, see every angle, and find a laptop that fits the way you work and live."],
      ["Find the fit. Then get to it.", "Clear specifications and thoughtful recommendations make it easier to choose with confidence."],
      ["More clarity. Better computing.", "Browse the collection, compare models side by side, and order as a guest when you are ready."],
    ];
    const product = products.length ? products[heroIndex % products.length] : null;
    const copy = slideCopy[heroIndex % slideCopy.length];
    const image = document.querySelector("[data-hero-image]");
    if (image) {
      image.src = safeImage(product?.images?.[0] || "/images/store-hero.jpg");
      image.alt = product ? `${product.name} laptop` : "A laptop from the Synkline collection";
    }
    const title = document.querySelector("[data-hero-title]");
    const text = document.querySelector("[data-hero-copy]");
    const caption = document.querySelector("[data-hero-caption]");
    if (title) title.textContent = copy[0];
    if (text) text.textContent = copy[1];
    if (caption) caption.textContent = product?.name || "A considered collection";
    document.querySelectorAll("[data-hero-dot]").forEach((button) => button.classList.toggle("active", Number(button.dataset.heroDot) === heroIndex % slideCopy.length));
    reportImageFailures();
  };

  render();
  window.setInterval(() => {
    heroIndex = (heroIndex + 1) % Math.max(products.length, 3);
    updateHero();
  }, 5200);
}

function specTiles(specs = {}) {
  const entries = Object.entries(specs);
  if (!entries.length) return '<div class="empty-state">Laptop specifications will be added soon.</div>';
  return entries.map(([label, value]) => `<div class="spec-tile"><span>${escapeHtml(label.replace(/([A-Z])/g, " $1"))}</span><span>${escapeHtml(value)}</span></div>`).join("");
}

async function showProduct(productId) {
  app.innerHTML = shell('<main class="wrap"><div class="loading-block">Loading laptop details…</div></main>');
  headerActions();
  try {
    const [product, similar] = await Promise.all([
      api(`/api/products/${encodeURIComponent(productId)}`),
      api(`/api/products/${encodeURIComponent(productId)}/similar`).catch(() => []),
    ]);
    const images = product.images?.length ? product.images : [FALLBACK_IMAGE];
    let imageIndex = 0;
    const renderGallery = () => {
      const mainImage = document.querySelector("[data-gallery-main]");
      if (mainImage) {
        mainImage.src = safeImage(images[imageIndex]);
        mainImage.alt = `${product.name}, view ${imageIndex + 1}`;
        document.querySelector("[data-gallery-count]").textContent = `${imageIndex + 1} / ${images.length}`;
        document.querySelectorAll("[data-gallery-thumb]").forEach((button, index) => button.classList.toggle("active", index === imageIndex));
      }
    };
    app.innerHTML = shell(`
      <main class="wrap">
        <div class="detail-layout">
          <section aria-label="Product photos">
            <a href="/" class="back-link">← Back to all laptops</a>
            <div class="gallery-main"><img data-gallery-main src="${escapeHtml(safeImage(images[0]))}" alt="${escapeHtml(product.name)}" data-fallback /><button class="gallery-arrow gallery-prev" type="button" data-gallery-prev aria-label="Previous product photo">‹</button><button class="gallery-arrow gallery-next" type="button" data-gallery-next aria-label="Next product photo">›</button><span class="gallery-count" data-gallery-count>1 / ${images.length}</span></div>
            <div class="thumb-row" role="group" aria-label="Choose product photo">${images.map((image, index) => `<button class="thumb ${index === 0 ? "active" : ""}" type="button" data-gallery-thumb="${index}" aria-label="Show product photo ${index + 1}"><img src="${escapeHtml(safeImage(image))}" alt="" data-fallback /></button>`).join("")}</div>
          </section>
          <section class="detail-copy">
            <p class="eyebrow">${escapeHtml(product.brand)} / ${escapeHtml(product.category)}</p>
            <h1 class="detail-title">${escapeHtml(product.name)}</h1>
            <p class="detail-description">${escapeHtml(product.description)}</p>
            <p class="detail-price">${money(product.price)}</p>
            <p class="stock-line"><span class="stock-dot ${Number(product.stock) > 0 ? "" : "sold"}"></span>${Number(product.stock) > 0 ? `${product.stock} available` : "Currently unavailable"}</p>
            <div class="detail-actions"><button class="button button-primary" type="button" data-add-detail ${Number(product.stock) < 1 ? "disabled" : ""}>Add to bag</button><a class="button button-secondary" href="/checkout">Go to checkout</a></div>
            <div class="service-points"><span>Guest checkout</span><span>No account required</span><span>Delivery details at checkout</span></div>
            <section class="assistant-card" aria-labelledby="assistant-heading">
              <div class="assistant-top"><div><p class="eyebrow">Cohere product guide</p><h2 id="assistant-heading" class="assistant-title">Ask about this laptop.</h2><p class="assistant-copy">Ask about its listed specifications, performance, or portability. Answers are based on this product’s details.</p></div></div>
              <div class="assistant-messages" data-chat-messages><div class="assistant-message">I’m ready to help you understand the specs. Send a question to start.</div></div>
              <form class="assistant-form" data-chat-form><textarea class="textarea-field" name="question" required maxlength="1200" placeholder="For example: Is this suitable for photo editing?" aria-label="Question about this laptop"></textarea><button class="button button-primary" type="submit" data-chat-submit>Ask Cohere</button></form>
            </section>
          </section>
        </div>
        <section class="section spec-section"><p class="eyebrow">The details</p><h2 class="section-title">Specifications.</h2><div class="spec-grid">${specTiles(product.specs)}</div></section>
        ${similar.length ? `<section class="section"><p class="eyebrow">Worth a look</p><h2 class="section-title">Similar machines.</h2><div class="similar-grid">${similar.slice(0, 3).map((item) => `<a class="similar-card" href="/product/${encodeURIComponent(item.id)}"><img src="${escapeHtml(safeImage(item.images?.[0]))}" alt="${escapeHtml(item.name)}" loading="lazy" data-fallback /><span><span class="product-meta">${escapeHtml(item.category)}</span><h3>${escapeHtml(item.name)}</h3><span class="price">${money(item.price)}</span></span></a>`).join("")}</div></section>` : ""}
      </main>`);
    headerActions();
    reportImageFailures();
    document.querySelector("[data-gallery-prev]")?.addEventListener("click", () => { imageIndex = (imageIndex + images.length - 1) % images.length; renderGallery(); });
    document.querySelector("[data-gallery-next]")?.addEventListener("click", () => { imageIndex = (imageIndex + 1) % images.length; renderGallery(); });
    document.querySelectorAll("[data-gallery-thumb]").forEach((button) => button.addEventListener("click", () => {
      imageIndex = Number(button.dataset.galleryThumb);
      renderGallery();
    }));
    document.querySelector("[data-add-detail]")?.addEventListener("click", () => {
      const cart = readCart();
      const existing = cart.find((line) => line.productId === product.id);
      saveCart(existing
        ? cart.map((line) => line.productId === product.id ? { ...line, quantity: line.quantity + 1 } : line)
        : [...cart, { productId: product.id, quantity: 1 }]);
      toast("Added to your bag.");
    });
    document.querySelector("[data-chat-form]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const input = form.elements.question;
      const message = input.value.trim();
      if (!message) return;
      const output = document.querySelector("[data-chat-messages]");
      const submit = document.querySelector("[data-chat-submit]");
      output.insertAdjacentHTML("beforeend", `<div class="assistant-message"><strong>You:</strong> ${escapeHtml(message)}</div>`);
      input.value = "";
      submit.disabled = true;
      submit.textContent = "Checking the product details…";
      try {
        const result = await api("/api/assistant/chat", { method: "POST", body: { productId: product.id, message } });
        output.insertAdjacentHTML("beforeend", `<div class="assistant-message answer"><strong>Cohere:</strong> ${escapeHtml(result.reply)}</div>`);
      } catch (error) {
        const text = error.status === 503
          ? "Cohere chat is not configured yet. Add COHERE_API_KEY through project Secrets to enable product answers."
          : error.message || "Cohere could not answer right now. Please try again.";
        output.insertAdjacentHTML("beforeend", `<div class="assistant-message error" role="status">${escapeHtml(text)}</div>`);
      } finally {
        submit.disabled = false;
        submit.textContent = "Ask Cohere";
      }
      output.scrollTop = output.scrollHeight;
    });
  } catch {
    app.innerHTML = shell(`<main class="wrap section"><a href="/" class="back-link">← Back to all laptops</a><div class="panel" style="margin-top:18px"><h1 class="panel-title">This laptop isn’t available right now.</h1><p class="panel-copy">The product details could not be loaded.</p><a class="button button-primary" href="/">Return to the lineup</a></div></main>`);
    headerActions();
  }
}

async function showCheckout() {
  app.innerHTML = shell('<main class="wrap"><div class="loading-block">Preparing your bag…</div></main>');
  headerActions();
  let products = [];
  try { products = await api("/api/products"); } catch {}
  let cart = readCart();
  let complete = null;
  const render = () => {
    const rows = cart.map((line) => ({ line, product: products.find((item) => item.id === line.productId) })).filter((row) => row.product);
    const total = rows.reduce((sum, row) => sum + Number(row.product.price) * Number(row.line.quantity), 0);
    const checkoutContent = complete
      ? `<main class="wrap checkout-layout"><section class="panel"><p class="eyebrow">Order received</p><h1 class="panel-title">Thank you. We have your request.</h1><p class="panel-copy">Your order reference is <strong>${escapeHtml(complete.reference)}</strong>. The store will contact you to confirm delivery and payment details.</p><div class="notice warning" style="margin-top:16px">Payment status: unpaid. This site records the order request but does not collect or charge card details.</div><a href="/" class="button button-primary" style="margin-top:18px">Continue shopping</a></section></main>`
      : rows.length
        ? `<main class="wrap checkout-layout">
            <section class="panel"><p class="eyebrow">Guest checkout</p><h1 class="panel-title">Delivery details.</h1><p class="panel-copy">No account required. Add a contact and delivery address so the store can follow up.</p>
              <form class="form-grid" data-checkout-form>
                <label class="form-label">Full name<input class="field" name="name" autocomplete="name" required maxlength="120" /></label>
                <label class="form-label">Email address<input class="field" type="email" name="email" autocomplete="email" required maxlength="180" /></label>
                <label class="form-label">Phone number<input class="field" type="tel" name="phone" autocomplete="tel" required maxlength="40" /></label>
                <label class="form-label full">Delivery address<textarea class="textarea-field" name="deliveryAddress" autocomplete="street-address" required maxlength="500"></textarea></label>
                <div class="notice warning full">Submitting creates an order request. No card is charged here; payment arrangements are confirmed by the store.</div>
                <button class="button button-primary full" type="submit" data-submit-order>Place order request · ${money(total)}</button>
                <p class="error-text full" data-order-error hidden></p>
              </form>
            </section>
            <aside class="panel"><h2 class="panel-title">Your bag.</h2><div>${rows.map(({ line, product }) => `<div class="order-line"><img src="${escapeHtml(safeImage(product.images?.[0]))}" alt="${escapeHtml(product.name)}" data-fallback /><div><h3>${escapeHtml(product.name)}</h3><div class="quantity-control"><button type="button" data-quantity="${escapeHtml(product.id)}" data-delta="-1" aria-label="Remove one ${escapeHtml(product.name)}">−</button><span>${line.quantity}</span><button type="button" data-quantity="${escapeHtml(product.id)}" data-delta="1" aria-label="Add one ${escapeHtml(product.name)}" ${line.quantity >= product.stock ? "disabled" : ""}>+</button><button type="button" class="text-link" data-remove="${escapeHtml(product.id)}">Remove</button></div></div><span class="price">${money(product.price * line.quantity)}</span></div>`).join("")}</div><div class="order-total"><span>Total</span><span>${money(total)}</span></div><a class="text-link" href="/" style="margin-top:15px">Continue shopping</a></aside>
          </main>`
        : `<main class="wrap checkout-layout"><section class="panel"><p class="eyebrow">Your bag</p><h1 class="panel-title">Nothing in your bag yet.</h1><p class="panel-copy">Browse the lineup and add a laptop when you find the right fit.</p><a class="button button-primary" href="/" style="margin-top:16px">Browse laptops</a></section></main>`;
    app.innerHTML = shell(checkoutContent);
    headerActions();
    reportImageFailures();
    document.querySelectorAll("[data-quantity]").forEach((button) => button.addEventListener("click", () => {
      const id = button.dataset.quantity;
      const delta = Number(button.dataset.delta);
      cart = cart.map((line) => line.productId === id ? { ...line, quantity: line.quantity + delta } : line).filter((line) => line.quantity > 0);
      saveCart(cart);
      render();
    }));
    document.querySelectorAll("[data-remove]").forEach((button) => button.addEventListener("click", () => {
      cart = cart.filter((line) => line.productId !== button.dataset.remove);
      saveCart(cart);
      render();
    }));
    document.querySelector("[data-checkout-form]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const submit = document.querySelector("[data-submit-order]");
      const error = document.querySelector("[data-order-error]");
      const values = Object.fromEntries(new FormData(form).entries());
      submit.disabled = true;
      submit.textContent = "Sending order request…";
      error.hidden = true;
      try {
        const order = await api("/api/orders", {
          method: "POST",
          body: { ...values, items: cart.map((line) => ({ productId: line.productId, quantity: Number(line.quantity) })) },
        });
        complete = order;
        cart = [];
        saveCart(cart);
        render();
      } catch (requestError) {
        error.textContent = requestError.message || "We could not submit this order. Please try again.";
        error.hidden = false;
        submit.disabled = false;
        submit.textContent = `Place order request · ${money(total)}`;
      }
    });
  };
  render();
}

function parseSpecs(text) {
  return Object.fromEntries(
    String(text || "")
      .split(/\r?\n/)
      .map((line) => line.split(":"))
      .filter((parts) => parts.length >= 2 && parts[0].trim() && parts.slice(1).join(":").trim())
      .map((parts) => [parts[0].trim(), parts.slice(1).join(":").trim()])
      .slice(0, 30),
  );
}

async function showAdmin() {
  app.innerHTML = shell('<main class="wrap admin-page"><div class="loading-block">Checking store access…</div></main>', { admin: true });
  headerActions();
  let session;
  try {
    session = await api("/api/admin/session");
  } catch (error) {
    showAdminError(error.message);
    return;
  }
  if (!session.configured) {
    showAdminLogin(null, session.error || "Add a strong ADMIN_PASSWORD through project Secrets to enable store administration.", true);
  } else if (!session.authenticated) {
    showAdminLogin(null, "", false);
  } else {
    drawAdmin("products");
  }
}

function showAdminError(message) {
  app.innerHTML = shell(`<main class="wrap admin-login-wrap"><section class="admin-login-card"><div class="admin-login-band"></div><div class="admin-login-body"><p class="eyebrow">Store access</p><h1 class="panel-title">Admin page unavailable.</h1><p class="panel-copy">${escapeHtml(message)}</p><a class="button button-secondary" href="/">Return to the store</a></div></section></main>`, { admin: true });
  headerActions();
}

function showAdminLogin(message, setupMessage = "", locked = false) {
  const notice = locked
    ? `<div class="notice warning" style="margin-top:15px">${escapeHtml(setupMessage)} The username is admin. The password is read only from the project’s Secrets and is never stored in the source code.</div>`
    : setupMessage ? `<div class="notice warning" style="margin-top:15px">${escapeHtml(setupMessage)}</div>` : "";
  app.innerHTML = shell(`
    <main class="wrap admin-login-wrap">
      <section class="admin-login-card"><div class="admin-login-band"></div><div class="admin-login-body">
        <p class="eyebrow">Synkline management</p><h1 class="panel-title">Store access.</h1>
        <p class="panel-copy">Sign in to manage laptop listings, customer orders, storefront appearance, and anonymous visit totals.</p>
        ${notice}
        ${locked ? "" : `<form class="form-grid" data-admin-login>
          <label class="form-label full">Username<input class="field" name="username" value="admin" autocomplete="username" required /></label>
          <label class="form-label full">Password<input class="field" type="password" name="password" autocomplete="current-password" required /></label>
          <p class="error-text full" data-login-error ${message ? "" : "hidden"}>${escapeHtml(message || "")}</p>
          <button class="button button-primary full" type="submit" data-login-submit>Sign in to the store</button>
        </form>`}
        <a class="text-link" href="/" style="margin-top:18px">← Return to the shop</a>
      </div></section>
    </main>`, { admin: true });
  headerActions();
  document.querySelector("[data-admin-login]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = document.querySelector("[data-login-submit]");
    const error = document.querySelector("[data-login-error]");
    const values = Object.fromEntries(new FormData(form).entries());
    submit.disabled = true;
    submit.textContent = "Signing in…";
    error.hidden = true;
    try {
      await api("/api/admin/login", { method: "POST", body: values });
      drawAdmin("products");
    } catch (loginError) {
      error.textContent = loginError.message || "Sign-in was not successful.";
      error.hidden = false;
      submit.disabled = false;
      submit.textContent = "Sign in to the store";
    }
  });
}

function adminTabs(active) {
  const tabs = [
    ["products", "Products"],
    ["orders", "Orders"],
    ["appearance", "Appearance"],
    ["analytics", "Visitor analytics"],
  ];
  return tabs.map(([id, label]) => `<button class="admin-tab ${active === id ? "active" : ""}" type="button" data-admin-tab="${id}">${label}</button>`).join("");
}

async function drawAdmin(tab, editing = null, notice = "") {
  app.innerHTML = shell(`
    <main class="wrap admin-page">
      <div class="admin-heading"><div><p class="eyebrow">Store management</p><h1>Good to see you.</h1><p class="panel-copy">Manage the catalogue and keep an eye on the store.</p></div><button type="button" class="button button-secondary" data-admin-logout>Sign out</button></div>
      <div class="admin-layout"><nav class="admin-nav" aria-label="Store administration">${adminTabs(tab)}</nav><section class="admin-content" data-admin-content><div class="loading-block">Loading store data…</div></section></div>
    </main>`, { admin: true });
  headerActions();
  document.querySelector("[data-admin-logout]")?.addEventListener("click", async () => {
    try { await api("/api/admin/logout", { method: "POST" }); } catch {}
    showAdminLogin();
  });
  document.querySelectorAll("[data-admin-tab]").forEach((button) => button.addEventListener("click", () => drawAdmin(button.dataset.adminTab, null, notice)));

  const content = document.querySelector("[data-admin-content]");
  if (tab === "products") {
    let products;
    try { products = await api("/api/admin/products"); }
    catch (error) { content.innerHTML = `<div class="panel"><p class="error-text">${escapeHtml(error.message)}</p></div>`; return; }
    content.innerHTML = `
      <div class="panel">
        <div class="admin-title-row"><div><h2>Laptop catalogue</h2><p class="panel-copy">${products.length} listed models</p></div><button class="button button-primary button-small" type="button" data-new-product>Add a laptop</button></div>
        ${notice ? `<div class="notice success" style="margin-bottom:13px">${escapeHtml(notice)}</div>` : ""}
        ${products.length ? `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Laptop</th><th>Category</th><th>Price</th><th>Stock</th><th>Actions</th></tr></thead><tbody>${products.map((product) => `<tr><td><div class="admin-product"><img src="${escapeHtml(safeImage(product.images?.[0]))}" alt="" data-fallback /><span>${escapeHtml(product.name)}</span></div></td><td>${escapeHtml(product.category)}</td><td>${money(product.price)}</td><td>${product.stock}</td><td><div class="admin-actions"><button class="button button-secondary button-small" type="button" data-edit-product="${escapeHtml(product.id)}">Edit</button><button class="button button-danger button-small" type="button" data-delete-product="${escapeHtml(product.id)}">Delete</button></div></td></tr>`).join("")}</tbody></table></div>` : '<div class="empty-state">No products yet. Add a laptop to start the catalogue.</div>'}
      </div>
      <section class="panel product-editor" id="product-editor">
        <div class="admin-title-row"><div><h2>${editing ? "Edit laptop" : "Add a laptop"}</h2><p class="panel-copy">Add clear details and at least one useful product photo.</p></div>${editing ? '<button type="button" class="button button-secondary button-small" data-cancel-edit>Cancel edit</button>' : ""}</div>
        <form class="editor-grid" data-product-form>
          <label class="form-label">Laptop name<input class="field" name="name" required maxlength="120" value="${escapeHtml(editing?.name || "")}" /></label>
          <label class="form-label">Brand<input class="field" name="brand" required maxlength="80" value="${escapeHtml(editing?.brand || "Synkline Select")}" /></label>
          <label class="form-label">Category<input class="field" name="category" required maxlength="50" value="${escapeHtml(editing?.category || "")}" /></label>
          <label class="form-label">Price in KES<input class="field" name="price" type="number" min="0" step="1" required value="${escapeHtml(editing?.price ?? "")}" /></label>
          <label class="form-label">Available stock<input class="field" name="stock" type="number" min="0" step="1" required value="${escapeHtml(editing?.stock ?? 0)}" /></label>
          <label class="form-label full">Short description<textarea class="textarea-field" name="description" maxlength="1200" required>${escapeHtml(editing?.description || "")}</textarea></label>
          <label class="form-label full">Image paths, one per line<textarea class="textarea-field" name="images" placeholder="/images/laptop-silver.jpg">${escapeHtml((editing?.images || []).join("\n"))}</textarea></label>
          <label class="form-label full">Upload a laptop photo<input class="field" type="file" accept="image/jpeg,image/png,image/webp" data-image-upload /></label>
          <p class="small-muted full" data-upload-status>Images may be JPG, PNG, or WebP, up to 8 MB. Uploaded images are saved to the app’s uploads folder.</p>
          <label class="form-label full">Specifications, one label: value per line<textarea class="textarea-field" name="specs" placeholder="Screen: 14 inch&#10;Processor: Intel Core Ultra 5&#10;Memory: 16 GB">${escapeHtml(Object.entries(editing?.specs || {}).map(([key, value]) => `${key}: ${value}`).join("\n"))}</textarea></label>
          <label class="form-label full"><span><input name="featured" type="checkbox" ${editing?.featured ? "checked" : ""} /> Feature this laptop in the showroom</span></label>
          <p class="error-text full" data-product-error hidden></p>
          <button class="button button-primary full" type="submit" data-save-product>${editing ? "Save laptop changes" : "Add laptop to the shop"}</button>
        </form>
      </section>`;
    reportImageFailures();
    document.querySelector("[data-new-product]")?.addEventListener("click", () => {
      document.querySelector("[data-product-form]")?.reset();
      document.querySelector("#product-editor")?.scrollIntoView({ behavior: "smooth" });
      document.querySelector('[name="name"]')?.focus();
    });
    document.querySelector("[data-cancel-edit]")?.addEventListener("click", () => drawAdmin("products"));
    document.querySelectorAll("[data-edit-product]").forEach((button) => button.addEventListener("click", () => {
      const product = products.find((item) => item.id === button.dataset.editProduct);
      drawAdmin("products", product);
      window.setTimeout(() => document.querySelector("#product-editor")?.scrollIntoView({ behavior: "smooth" }), 40);
    }));
    document.querySelectorAll("[data-delete-product]").forEach((button) => button.addEventListener("click", async () => {
      const product = products.find((item) => item.id === button.dataset.deleteProduct);
      if (!product || !window.confirm(`Delete ${product.name} from the catalogue?`)) return;
      try {
        await api(`/api/admin/products/${encodeURIComponent(product.id)}`, { method: "DELETE" });
        toast("Laptop removed from the catalogue.");
        drawAdmin("products");
      } catch (error) { toast(error.message); }
    }));
    document.querySelector("[data-image-upload]")?.addEventListener("change", async (event) => {
      const file = event.currentTarget.files?.[0];
      if (!file) return;
      const status = document.querySelector("[data-upload-status]");
      status.textContent = "Uploading image…";
      const data = new FormData();
      data.append("image", file);
      try {
        const result = await api("/api/admin/images", { method: "POST", body: data });
        const field = document.querySelector('[name="images"]');
        field.value = `${field.value.trim()}${field.value.trim() ? "\n" : ""}${result.url}`;
        status.textContent = "Image uploaded. Its path has been added to the laptop.";
      } catch (error) {
        status.textContent = error.message || "Image upload failed.";
      }
      event.currentTarget.value = "";
    });
    document.querySelector("[data-product-form]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const values = Object.fromEntries(new FormData(form).entries());
      const payload = {
        name: values.name,
        brand: values.brand,
        category: values.category,
        price: Number(values.price),
        description: values.description,
        stock: Number(values.stock),
        featured: form.elements.featured.checked,
        images: String(values.images || "").split(/\r?\n/).map((value) => value.trim()).filter(Boolean),
        specs: parseSpecs(values.specs),
      };
      const error = document.querySelector("[data-product-error]");
      const save = document.querySelector("[data-save-product]");
      error.hidden = true;
      save.disabled = true;
      save.textContent = "Saving laptop…";
      try {
        if (editing) {
          await api(`/api/admin/products/${encodeURIComponent(editing.id)}`, { method: "PATCH", body: payload });
        } else {
          await api("/api/admin/products", { method: "POST", body: payload });
        }
        toast(editing ? "Laptop details saved." : "Laptop added to the shop.");
        drawAdmin("products");
      } catch (saveError) {
        error.textContent = saveError.message || "The laptop could not be saved.";
        error.hidden = false;
        save.disabled = false;
        save.textContent = editing ? "Save laptop changes" : "Add laptop to the shop";
      }
    });
  } else if (tab === "orders") {
    let orders;
    try { orders = await api("/api/admin/orders"); }
    catch (error) { content.innerHTML = `<div class="panel"><p class="error-text">${escapeHtml(error.message)}</p></div>`; return; }
    content.innerHTML = `<div class="panel"><div class="admin-title-row"><div><h2>Guest orders</h2><p class="panel-copy">Order requests and contact details supplied at checkout.</p></div><button class="button button-secondary button-small" type="button" data-refresh-admin>Refresh</button></div>
      ${orders.length ? `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Reference</th><th>Customer</th><th>Contact</th><th>Items</th><th>Total</th><th>Payment</th></tr></thead><tbody>${orders.map((order) => `<tr><td><strong>${escapeHtml(order.reference)}</strong><br /><span class="small-muted">${escapeHtml(order.status)}</span></td><td>${escapeHtml(order.name)}<br /><span class="small-muted">${escapeHtml(order.deliveryAddress)}</span></td><td>${escapeHtml(order.email)}<br />${escapeHtml(order.phone)}</td><td>${(order.items || []).map((item) => `${escapeHtml(item.productId)} × ${Number(item.quantity)}`).join("<br />")}</td><td>${money(order.total)}</td><td>${escapeHtml(order.paymentStatus)}</td></tr>`).join("")}</tbody></table></div>` : '<div class="empty-state">No guest orders have been placed yet.</div>'}</div>`;
    document.querySelector("[data-refresh-admin]")?.addEventListener("click", () => drawAdmin("orders"));
  } else if (tab === "appearance") {
    let settings;
    try { settings = await api("/api/settings"); }
    catch (error) { content.innerHTML = `<div class="panel"><p class="error-text">${escapeHtml(error.message)}</p></div>`; return; }
    content.innerHTML = `<div class="panel"><h2 class="panel-title">Store appearance.</h2><p class="panel-copy">Choose the main accent used for links, primary actions, and key highlights.</p><form data-theme-form><div class="color-control"><input type="color" name="accentColor" value="${escapeHtml(settings.accentColor || accentColor)}" aria-label="Choose store accent color" /><span class="small-muted" data-color-label>${escapeHtml(settings.accentColor || accentColor)}</span></div><p class="notice" style="margin-top:17px">The current showroom palette is blue, white, and grey. This setting updates the accent color across the public storefront.</p><button class="button button-primary" type="submit" style="margin-top:16px">Save appearance</button><p class="error-text" data-theme-error hidden></p></form></div>`;
    document.querySelector('[name="accentColor"]')?.addEventListener("input", (event) => {
      accentColor = event.currentTarget.value;
      document.documentElement.style.setProperty("--accent", accentColor);
      document.documentElement.style.setProperty("--accent-dark", accentColor);
      document.querySelector("[data-color-label]").textContent = accentColor;
    });
    document.querySelector("[data-theme-form]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const error = document.querySelector("[data-theme-error]");
      try {
        const saved = await api("/api/admin/settings", { method: "PUT", body: { accentColor } });
        accentColor = saved.accentColor;
        document.documentElement.style.setProperty("--accent", accentColor);
        document.documentElement.style.setProperty("--accent-dark", accentColor);
        toast("Store appearance saved.");
      } catch (saveError) {
        error.textContent = saveError.message || "The color could not be saved.";
        error.hidden = false;
      }
    });
  } else if (tab === "analytics") {
    let analytics;
    try { analytics = await api("/api/admin/analytics"); }
    catch (error) { content.innerHTML = `<div class="panel"><p class="error-text">${escapeHtml(error.message)}</p></div>`; return; }
    const maximum = Math.max(1, ...analytics.topPages.map((page) => Number(page.views)));
    content.innerHTML = `<div class="panel"><div class="admin-title-row"><div><h2>Anonymous visitor activity</h2><p class="panel-copy">Page counts are retained for 90 days. This report does not identify people.</p></div><button class="button button-secondary button-small" type="button" data-refresh-admin>Refresh</button></div>
      <div class="analytics-cards"><div class="metric-card"><span class="metric-label">Page views</span><strong class="metric-value">${Number(analytics.totalVisits).toLocaleString()}</strong></div><div class="metric-card"><span class="metric-label">Anonymous visitors</span><strong class="metric-value">${Number(analytics.uniqueVisitors).toLocaleString()}</strong></div></div>
      <h3 class="product-meta">Most viewed pages</h3>
      ${analytics.topPages.length ? `<div class="bar-list">${analytics.topPages.map((page) => `<div class="bar-row"><span>${escapeHtml(page.path)}</span><span class="bar-track"><span class="bar-fill" style="display:block;width:${Math.max(4, Number(page.views) / maximum * 100)}%"></span></span><strong>${Number(page.views)}</strong></div>`).join("")}</div>` : '<div class="empty-state">No page visits recorded yet.</div>'}
      <h3 class="product-meta" style="margin-top:24px">Recent page views</h3>
      ${analytics.recentVisits.length ? `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Anonymous visitor</th><th>Page</th><th>Time</th></tr></thead><tbody>${analytics.recentVisits.map((visit) => `<tr><td>${escapeHtml(visit.visitor)}</td><td>${escapeHtml(visit.path)}</td><td>${escapeHtml(new Date(visit.visitedAt).toLocaleString())}</td></tr>`).join("")}</tbody></table></div>` : '<div class="empty-state">Recent visits will appear here as people browse the shop.</div>'}
      <p class="notice" style="margin-top:16px">No names, email addresses, IP addresses, or device fingerprints are collected for this analytics view.</p>
    </div>`;
    document.querySelector("[data-refresh-admin]")?.addEventListener("click", () => drawAdmin("analytics"));
  }
}

async function start() {
  try {
    const settings = await api("/api/settings");
    if (/^#[0-9a-f]{6}$/i.test(settings.accentColor || "")) {
      accentColor = settings.accentColor;
      document.documentElement.style.setProperty("--accent", accentColor);
      document.documentElement.style.setProperty("--accent-dark", accentColor);
    }
  } catch {}
  trackCurrentPage();

  const path = window.location.pathname;
  if (path === "/admin" || path === "/admin/") return showAdmin();
  if (path === "/checkout" || path === "/checkout/") return showCheckout();
  if (path.startsWith("/product/")) return showProduct(decodeURIComponent(path.slice("/product/".length)));
  return showHome();
}

start();
