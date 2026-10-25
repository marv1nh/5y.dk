"use strict";

const SITE_TITLE = "Marv1nh";
const SITE_TAGLINE = "CTF writeups and other projects";

const WRITEUPS = [
    { slug: "doctor-bye-bye", file: "doctor-bye-bye.md", date: "2026-10-19", readTime: 5 },
  { slug: "corsica", file: "corsica.md", date: "2026-10-19", readTime: 7 },
  { slug: "squeaky-clean-1", file: "squeaky-clean-1.md", date: "2026-10-19", readTime: 5 },
  { slug: "iot-gateway", file: "iot-gateway.md", date: "2026-10-19", readTime: 6 },
];

const main = document.querySelector("#main-content");
const description = document.querySelector('meta[name="description"]');
document.querySelector("#copyright-year").textContent = new Date().getFullYear();

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#039;",
    '"': "&quot;",
  })[character]);
}

function slugify(value) {
  const slug = value.trim().toLocaleLowerCase().replace(/[^\p{L}\d]+/gu, "-").replace(/^-+|-+$/g, "");
  return slug || "section";
}

function parseFrontMatter(markdown) {
  const normalized = markdown.replace(/\r\n?/g, "\n");
  if (!normalized.startsWith("---\n")) return [{}, normalized];
  const end = normalized.indexOf("\n---\n", 4);
  if (end === -1) return [{}, normalized];

  const metadata = {};
  normalized.slice(4, end).split("\n").forEach((line) => {
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (match) metadata[match[1].toLowerCase()] = match[2].trim().replace(/^["']|["']$/g, "");
  });
  return [metadata, normalized.slice(end + 5)];
}

function markdownTitle(markdown, fallback) {
  return markdown.match(/^#\s+(.+?)\s*#*\s*$/m)?.[1].trim() || fallback;
}

function stripLeadingTitle(markdown) {
  return markdown.replace(/^\s*#\s+.+?\s*#*\s*(?:\n+|$)/, "");
}

function markdownExcerpt(markdown, limit = 170) {
  const plain = stripLeadingTitle(markdown)
    .replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, " ")
    .replace(/^\s*(?:#{1,6}|>|[-*+] |\d+[.)] ).*$/gm, " ")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_~|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return "Technical writeup.";
  return plain.length <= limit ? plain : `${plain.slice(0, limit - 1).trimEnd()}…`;
}

function safeUrl(value, image = false) {
  const external = /^https?:\/\/[^\s]+$/i.test(value);
  const local = /^(?:\/|\.\.?\/|#)[^\s]*$/.test(value);
  return external || (!image && local) ? value : null;
}

function inlineMarkdown(source) {
  const placeholders = [];
  const hold = (html) => {
    const token = `\u001a${placeholders.length}\u001a`;
    placeholders.push(html);
    return token;
  };

  let text = source.replace(/`([^`\n]+)`/g, (_, code) => hold(`<code>${escapeHtml(code)}</code>`));
  text = text.replace(/!\[([^\]]*)\]\((\S+?)(?:\s+["']([^"']*)["'])?\)/g, (whole, alt, value, title) => {
    const url = safeUrl(value, true);
    if (!url) return whole;
    const titleAttribute = title ? ` title="${escapeHtml(title)}"` : "";
    return hold(`<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" loading="lazy"${titleAttribute}>`);
  });
  text = text.replace(/\[([^\]]+)\]\((\S+?)(?:\s+["']([^"']*)["'])?\)/g, (whole, label, value, title) => {
    const url = safeUrl(value);
    if (!url) return whole;
    const titleAttribute = title ? ` title="${escapeHtml(title)}"` : "";
    const external = /^https?:\/\//i.test(url) ? ' target="_blank" rel="noopener noreferrer"' : "";
    return hold(`<a href="${escapeHtml(url)}"${titleAttribute}${external}>${escapeHtml(label)}</a>`);
  });
  text = text.replace(/(^|[^\w"'=\u001a])(https?:\/\/[^\s<>\u001a]+)/giu, (_, prefix, value) => {
    const url = value.replace(/[.,!?;:]+$/, "");
    return `${prefix}${hold(`<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`)}${value.slice(url.length)}`;
  });

  text = escapeHtml(text)
    .replace(/~~(.+?)~~/g, "<del>$1</del>")
    .replace(/\*\*(.+?)\*\*|__(.+?)__/g, (_, a, b) => `<strong>${a || b}</strong>`)
    .replace(/(^|[^*])\*([^\s*](?:.*?[^\s*])?)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/(^|[^\w_])_([^\s_](?:.*?[^\s_])?)_(?![\w_])/g, "$1<em>$2</em>");

  placeholders.forEach((html, index) => {
    text = text.replaceAll(escapeHtml(`\u001a${index}\u001a`), html);
  });
  return text;
}

function splitTableRow(row) {
  return row.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

function isTableDivider(line) {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function isBlockStart(lines, index) {
  const line = lines[index] || "";
  const next = lines[index + 1] || "";
  return !line.trim()
    || /^\s*(?:#{1,6}\s+|>|(`{3,}|~{3,})|(?:[-*_]\s*){3,}$|[-+*]\s+|\d+[.)]\s+)/.test(line)
    || /^\s*(?:={3,}|-{3,})\s*$/.test(next)
    || (line.includes("|") && isTableDivider(next));
}

function markdownToHtml(markdown) {
  const lines = markdown.replace(/\r\n?/g, "\n").trim().split("\n");
  const html = [];
  const headingCounts = new Map();
  const headingId = (label) => {
    const base = slugify(label.replace(/<[^>]*>/g, ""));
    const count = (headingCounts.get(base) || 0) + 1;
    headingCounts.set(base, count);
    return `${base}${count > 1 ? `-${count}` : ""}`;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;

    let match = line.match(/^\s*(`{3,}|~{3,})\s*([A-Za-z0-9_.+-]*)\s*$/);
    if (match) {
      const fence = match[1][0];
      const minimum = match[1].length;
      const language = match[2];
      const code = [];
      index += 1;
      while (index < lines.length && !(new RegExp(`^\\s*${fence}{${minimum},}\\s*$`)).test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      const label = language || "text";
      const className = language ? ` class="language-${escapeHtml(language)}"` : "";
      html.push(`<div class="code-block"><div class="code-toolbar"><span>${escapeHtml(label)}</span><button type="button" class="copy-code" aria-label="Copy code">Copy</button></div><pre><code${className}>${escapeHtml(code.join("\n"))}</code></pre></div>`);
      continue;
    }

    match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (match) {
      const level = match[1].length;
      const label = match[2].trim();
      const id = headingId(inlineMarkdown(label));
      html.push(`<h${level} id="${escapeHtml(id)}"><a class="heading-anchor" href="#${escapeHtml(id)}" aria-label="Link to this section">#</a>${inlineMarkdown(label)}</h${level}>`);
      continue;
    }

    match = lines[index + 1]?.match(/^\s*(={3,}|-{3,})\s*$/);
    if (match) {
      const level = match[1][0] === "=" ? 1 : 2;
      const label = line.trim();
      const id = headingId(inlineMarkdown(label));
      html.push(`<h${level} id="${escapeHtml(id)}"><a class="heading-anchor" href="#${escapeHtml(id)}" aria-label="Link to this section">#</a>${inlineMarkdown(label)}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      html.push("<hr>");
      continue;
    }

    if (line.includes("|") && isTableDivider(lines[index + 1] || "")) {
      const headers = splitTableRow(line);
      const alignments = splitTableRow(lines[index + 1]);
      index += 1;
      const align = (cell) => cell.startsWith(":") && cell.endsWith(":") ? "center" : cell.endsWith(":") ? "right" : "left";
      let table = `<div class="table-wrap"><table><thead><tr>${headers.map((header, cell) => `<th style="text-align:${align(alignments[cell] || "---")}">${inlineMarkdown(header)}</th>`).join("")}</tr></thead><tbody>`;
      while (lines[index + 1]?.trim() && lines[index + 1].includes("|")) {
        const cells = splitTableRow(lines[index + 1]);
        index += 1;
        table += `<tr>${headers.map((_, cell) => `<td style="text-align:${align(alignments[cell] || "---")}">${inlineMarkdown(cells[cell] || "")}</td>`).join("")}</tr>`;
      }
      html.push(`${table}</tbody></table></div>`);
      continue;
    }

    match = line.match(/^\s*>\s?(.*)$/);
    if (match) {
      const quote = [match[1]];
      while (lines[index + 1]?.match(/^\s*>\s?(.*)$/)) {
        quote.push(lines[index + 1].match(/^\s*>\s?(.*)$/)[1]);
        index += 1;
      }
      html.push(`<blockquote>${markdownToHtml(quote.join("\n"))}</blockquote>`);
      continue;
    }

    match = line.match(/^\s*([-+*]|\d+[.)])\s+(.+)$/);
    if (match) {
      const ordered = /^\d/.test(match[1]);
      const tag = ordered ? "ol" : "ul";
      const items = [];
      while (index < lines.length) {
        const itemMatch = lines[index].match(/^\s*([-+*]|\d+[.)])\s+(.+)$/);
        if (!itemMatch || /^\d/.test(itemMatch[1]) !== ordered) break;
        let item = itemMatch[2].trim();
        let className = "";
        const task = item.match(/^\[([ xX])\]\s+(.+)$/);
        if (task) {
          className = ' class="task-item"';
          item = `<input type="checkbox" disabled${task[1].toLowerCase() === "x" ? " checked" : ""}> ${inlineMarkdown(task[2])}`;
        } else {
          item = inlineMarkdown(item);
        }
        items.push(`<li${className}>${item}</li>`);
        index += 1;
      }
      index -= 1;
      const listClass = tag === "ul" && items.some((item) => item.includes("task-item")) ? ' class="task-list"' : "";
      html.push(`<${tag}${listClass}>${items.join("")}</${tag}>`);
      continue;
    }

    const paragraph = [line];
    while (index + 1 < lines.length && !isBlockStart(lines, index + 1)) paragraph.push(lines[++index]);
    html.push(`<p>${paragraph.map((part) => `${inlineMarkdown(part.trimEnd())}${part.endsWith("  ") ? "<br>" : ""}`).join(" ")}</p>`);
  }
  return html.join("\n");
}

function extractHeadings(markdown) {
  const headings = [];
  const counts = new Map();
  let fence = null;
  markdown.split("\n").forEach((line) => {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
    if (fenceMatch) {
      fence = fence ? null : fenceMatch[1][0];
      return;
    }
    if (fence) return;
    const match = line.match(/^(#{2,3})\s+(.+?)\s*#*\s*$/);
    if (!match) return;
    const label = match[2].replace(/[`*_~]/g, "").trim();
    const base = slugify(label);
    const count = (counts.get(base) || 0) + 1;
    counts.set(base, count);
    headings.push({ level: match[1].length, label, id: `${base}${count > 1 ? `-${count}` : ""}` });
  });
  return headings;
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

async function loadWriteups() {
  return Promise.all(WRITEUPS.map(async (entry) => {
    const response = await fetch(`writeups/${encodeURIComponent(entry.file)}`);
    if (!response.ok) throw new Error(`Could not load ${entry.file}`);
    const [metadata, content] = parseFrontMatter(await response.text());
    const title = metadata.title || markdownTitle(content, entry.slug);
    return {
      ...entry,
      title,
      excerpt: metadata.description || metadata.summary || markdownExcerpt(content),
      date: metadata.date || entry.date,
      content: stripLeadingTitle(content),
    };
  }));
}

function homeMarkup(posts) {
  const cards = posts.map((post, index) => `
    <article class="post-card reveal" data-search="${escapeHtml(`${post.title} ${post.excerpt}`.toLowerCase())}" style="--delay: ${index * 70}ms">
      <a class="card-link" href="?p=${encodeURIComponent(post.slug)}" aria-label="Read ${escapeHtml(post.title)}"></a>
      <div class="card-number">${String(index + 1).padStart(2, "0")}</div>
      <div class="card-content">
        <div class="post-meta"><time datetime="${escapeHtml(post.date)}">${escapeHtml(formatDate(post.date))}</time><span>${post.readTime} min read</span></div>
        <h3>${escapeHtml(post.title)}</h3>
        <p>${escapeHtml(post.excerpt)}</p>
        <span class="read-link">Read writeup <span aria-hidden="true">→</span></span>
      </div>
    </article>`).join("");

  return `
    <section class="hero" aria-labelledby="hero-title">
      <div class="hero-glow" aria-hidden="true"></div>
      <div class="eyebrow reveal"><span class="status-dot"></span> Danish CTF player</div>
      <p class="hero-copy reveal">${SITE_TAGLINE}</p>
      <div class="hero-actions reveal">
        <a class="button button-primary" href="#writeups">Explore writeups <span aria-hidden="true">↓</span></a>
        <a class="text-link" href="#about">More about me <span aria-hidden="true">↗</span></a>
      </div>
      <div class="terminal-card reveal" aria-label="Terminal introduction">
        <div class="terminal-top"><small>About</small></div>
        <div class="terminal-body">
          <p class="card-label">Focus</p>
          <p class="terminal-output">Danish CTF player &amp; Challenge developer</p>
          <p class="card-label">Contact</p>
          <p class="terminal-output">marv1nh@5y.dk - <a href="https://www.linkedin.com/in/marvin-hald-b284b3380/">LinkedIn</a> - <a href="https://github.com/marv1nh">GitHub</a></p>
        </div>
      </div>
    </section>

    <section class="about section reveal" id="about" aria-labelledby="about-title">
      <div class="section-label"><span>01</span> About</div>
      <div class="about-grid">
        <h2 id="about-title">Marvin Hald</h2>
        <div class="about-copy">
          <p>I am a Danish CTF player. This site contains my CTF writeups and technical projects.</p>
          <div class="focus-list" aria-label="Areas of interest"><span>Web security</span><span>Linux</span><span>Forensics</span><span>Reverse engineering</span><span>CTFs</span></div>
        </div>
      </div>
    </section>

    <section class="experience section" id="experience" aria-labelledby="experience-title">
      <div class="section-heading reveal"><div><div class="section-label"><span>02</span> Resume</div><h2 id="experience-title">Experience &amp; education</h2></div></div>
      <div class="resume-grid">
        <div class="resume-column reveal">
          <h3>Experience</h3>
          <div class="timeline">
            <article class="timeline-item"><div class="timeline-marker" aria-hidden="true">CS</div><div><div class="timeline-topline"><h4>Student Assistant · Challenge Developer</h4><time datetime="2025-11">Nov 2025 — Present</time></div><p class="timeline-organization">Campfire Security · Part-time</p><p class="timeline-location">Copenhagen, Capital Region of Denmark</p><ul class="skill-list" aria-label="Skills used at Campfire Security"><li>Cybersecurity</li><li>Programming</li></ul></div></article>
            <article class="timeline-item"><div class="timeline-marker timeline-marker-denmark" aria-hidden="true">CP</div><div><div class="timeline-topline"><h4>Frivillig på hackerholdet</h4><time datetime="2026-06">Jun 2026 — present</time></div><p class="timeline-organization">Coding Pirates Lyngby</p><ul class="skill-list" aria-label="Skills used at Coding Pirates"><li>Cybersecurity</li><li>Programming</li></ul></div></article>
            <article class="timeline-item"><div class="timeline-marker timeline-marker-denmark" aria-hidden="true">DK</div><div><div class="timeline-topline"><h4>Cyberlandsholdet</h4><time datetime="2025-06">Jun 2025 — Jun 2026</time></div><p class="timeline-organization">De Danske Cybermesterskaber</p><ul class="skill-list" aria-label="Skills used with Cyberlandsholdet"><li>Cybersecurity</li><li>Teamwork</li></ul></div></article>
          </div>
        </div>
        <div class="resume-column reveal" style="--delay: 90ms"><h3>Education</h3><div class="timeline"><article class="timeline-item"><div class="timeline-marker timeline-marker-school" aria-hidden="true">NAG</div><div><div class="timeline-topline"><h4>Nærum Gymnasium</h4><time datetime="2025">2025 — 2028</time></div><p class="timeline-organization">Upper secondary education</p></div></article></div></div>
      </div>
    </section>

    <section class="writeups section" id="writeups" aria-labelledby="writeups-title">
      <div class="section-heading reveal"><div><div class="section-label"><span>03</span> Writeups</div><h2 id="writeups-title">Latest writeups</h2></div><p>${posts.length} ${posts.length === 1 ? "article" : "articles"}</p></div>
      <label class="search-wrap reveal" for="search"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m21 21-4.35-4.35m2.35-5.65a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"/></svg><input type="search" id="search" placeholder="Search by title or topic…" autocomplete="off"><kbd>/</kbd></label>
      <div class="post-grid" id="cards">${cards}</div>
      <p class="no-results" id="no-results" hidden>No writeups match that search. Try a different term.</p>
    </section>`;
}

function articleMarkup(post) {
  const headings = extractHeadings(post.content);
  const toc = headings.length ? `<aside class="toc reveal" aria-label="Table of contents"><p>On this page</p><ol>${headings.map((heading) => `<li class="toc-level-${heading.level}"><a href="#${escapeHtml(heading.id)}">${escapeHtml(heading.label)}</a></li>`).join("")}</ol></aside>` : "";
  return `<article class="article-shell">
    <header class="article-header reveal">
      <a class="back-link" href="index.html#writeups"><span aria-hidden="true">←</span> All writeups</a>
      <div class="eyebrow">CTF writeup</div>
      <h1>${escapeHtml(post.title)}</h1>
      <p>${escapeHtml(post.excerpt)}</p>
      <div class="article-meta"><time datetime="${escapeHtml(post.date)}">${escapeHtml(formatDate(post.date))}</time><span>${post.readTime} minute read</span></div>
    </header>
    <div class="article-layout">${toc}<div class="prose reveal">${markdownToHtml(post.content)}</div></div>
    <footer class="article-footer reveal"><a class="button button-primary" href="index.html#writeups">Browse all writeups <span aria-hidden="true">→</span></a></footer>
  </article>`;
}

function notFoundMarkup(message = "The writeup does not exist or the URL is incorrect.") {
  return `<section class="not-found"><div class="eyebrow">404 · Writeup not found</div><h1>Page not found</h1><p>${escapeHtml(message)}</p><a class="button button-primary" href="index.html">Return home</a></section>`;
}

function initializeInteractions() {
  const search = document.querySelector("#search");
  const cards = [...document.querySelectorAll(".post-card")];
  const noResults = document.querySelector("#no-results");
  if (search) {
    const filterCards = () => {
      const query = search.value.trim().toLowerCase();
      let visible = 0;
      cards.forEach((card) => {
        const matches = card.dataset.search.includes(query);
        card.hidden = !matches;
        if (matches) visible += 1;
      });
      noResults.hidden = visible !== 0;
    };
    search.addEventListener("input", filterCards);
    document.addEventListener("keydown", (event) => {
      if (event.key === "/" && document.activeElement !== search && !/input|textarea/i.test(document.activeElement.tagName)) {
        event.preventDefault();
        search.focus();
      }
    });
  }

  document.querySelectorAll(".copy-code").forEach((button) => {
    button.addEventListener("click", async () => {
      const code = button.closest(".code-block").querySelector("code").textContent;
      try {
        await navigator.clipboard.writeText(code);
        button.textContent = "Copied";
        setTimeout(() => { button.textContent = "Copy"; }, 1500);
      } catch (_) {
        button.textContent = "Select & copy";
      }
    });
  });

  const revealItems = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -30px" });
    revealItems.forEach((item) => observer.observe(item));
  } else {
    revealItems.forEach((item) => item.classList.add("is-visible"));
  }
}

async function start() {
  const requestedSlug = new URLSearchParams(window.location.search).get("p");
  try {
    const posts = await loadWriteups();
    if (requestedSlug === null) {
      main.innerHTML = homeMarkup(posts);
      document.title = `${SITE_TITLE} · Security writeups`;
      description.content = SITE_TAGLINE;
    } else {
      const post = posts.find((candidate) => candidate.slug === slugify(requestedSlug));
      if (!post) {
        main.innerHTML = notFoundMarkup();
        document.title = `Page not found · ${SITE_TITLE}`;
      } else {
        main.innerHTML = articleMarkup(post);
        document.title = `${post.title} · ${SITE_TITLE}`;
        description.content = post.excerpt;
      }
    }
    initializeInteractions();
  } catch (error) {
    console.error(error);
    main.innerHTML = notFoundMarkup("The writeups could not be loaded.");
    document.title = `Unable to load · ${SITE_TITLE}`;
  }
}

start();
