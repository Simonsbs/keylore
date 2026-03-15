(function () {
  const measurementId = "G-BE06JE93C8";

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };

  window.gtag("js", new Date());
  window.gtag("config", measurementId, {
    anonymize_ip: true,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    page_title: document.title,
    page_path: window.location.pathname
  });

  const trackedScrollMarks = new Set();

  function getLinkKind(href) {
    if (!href) {
      return "unknown";
    }

    if (href.includes("npmjs.com")) {
      return "npm";
    }

    if (href.includes("github.com")) {
      return "github";
    }

    if (href.startsWith("http")) {
      return "external";
    }

    if (href.includes("/integrations/")) {
      return "integrations";
    }

    if (href.includes("/security/")) {
      return "security";
    }

    if (href.includes("/kb/")) {
      return "kb";
    }

    if (href.includes("/docs/")) {
      return "docs";
    }

    return "internal";
  }

  function getLinkLabel(link) {
    return (
      link.dataset.analyticsLabel ||
      link.textContent.trim().replace(/\s+/g, " ").slice(0, 100) ||
      link.getAttribute("href") ||
      "unknown"
    );
  }

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");
    if (!link) {
      return;
    }

    const href = link.getAttribute("href") || "";
    const kind = link.dataset.analyticsType || getLinkKind(href);
    const label = getLinkLabel(link);

    window.gtag("event", "site_link_click", {
      event_category: "engagement",
      event_label: label,
      link_type: kind,
      link_url: href,
      page_path: window.location.pathname
    });
  });

  function handleScroll() {
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    if (scrollable <= 0) {
      return;
    }

    const percent = Math.round((window.scrollY / scrollable) * 100);
    for (const mark of [50, 90]) {
      if (percent >= mark && !trackedScrollMarks.has(mark)) {
        trackedScrollMarks.add(mark);
        window.gtag("event", "scroll_depth", {
          event_category: "engagement",
          event_label: `${mark}%`,
          scroll_depth: mark,
          page_path: window.location.pathname
        });
      }
    }
  }

  window.addEventListener("scroll", handleScroll, { passive: true });
})();
