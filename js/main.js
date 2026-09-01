(function () {
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  var toggle = document.querySelector(".nav-toggle");
  var nav = document.querySelector(".site-nav");
  var mobileNavQuery = window.matchMedia("(max-width: 760px)");
  var label = toggle ? toggle.querySelector(".nav-toggle-label") : null;

  function setNavOpen(open) {
    if (!toggle || !nav) return;
    nav.classList.toggle("is-open", open);
    document.body.classList.toggle("nav-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    if (label) label.textContent = open ? "Close" : "Menu";
    if (!open) {
      document.querySelectorAll(".site-nav .has-sub.open").forEach(function (item) {
        item.classList.remove("open");
      });
    }
  }

  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      setNavOpen(!nav.classList.contains("is-open"));
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && nav.classList.contains("is-open")) {
        setNavOpen(false);
        toggle.focus();
      }
    });

    mobileNavQuery.addEventListener("change", function (e) {
      if (!e.matches) setNavOpen(false);
    });
  }

  document.querySelectorAll(".site-nav .has-sub > a").forEach(function (link) {
    link.addEventListener("click", function (e) {
      e.preventDefault();
      if (mobileNavQuery.matches) {
        var item = link.parentElement;
        var open = item.classList.toggle("open");
        link.setAttribute("aria-expanded", open ? "true" : "false");
      }
    });
  });

  document.querySelectorAll(".site-nav a").forEach(function (link) {
    link.addEventListener("click", function () {
      if (!mobileNavQuery.matches || !nav) return;
      if (link.parentElement.classList.contains("has-sub")) return;
      setNavOpen(false);
    });
  });

  document.querySelectorAll(".accordion-trigger").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var item = btn.closest(".accordion-item");
      if (!item) return;
      var open = item.classList.toggle("open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
  });

  function renderTutors(list, containerId) {
    var root = document.getElementById(containerId);
    if (!root || !Array.isArray(list)) return;

    var location = document.getElementById("tutor-location");
    var search = document.getElementById("tutor-search");
    var subject = document.getElementById("tutor-subject");
    var modeButtons = document.querySelectorAll(".tutor-mode-btn");
    var activeMode = "";

    function draw(items) {
      root.innerHTML = "";
      if (!items.length) {
        root.innerHTML = "<p>No tutors match your filters.</p>";
        return;
      }
      var accordion = document.createElement("div");
      accordion.className = "accordion";
      items.forEach(function (t) {
        var item = document.createElement("div");
        item.className = "accordion-item";
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "accordion-trigger";
        btn.setAttribute("aria-expanded", "false");
        var modeLabel = Array.isArray(t.modes) && t.modes.length
          ? t.modes.map(function (m) {
              return m === "in-person" ? "In-Person" : "Online";
            }).join(" · ")
          : "";
        btn.innerHTML =
          '<span class="tutor-name">' +
          escapeHtml(t.name) +
          '</span><span class="tutor-meta"><span class="subjects">' +
          escapeHtml(t.subjects || "") +
          "</span>" +
          (modeLabel ? '<span class="tutor-mode-tag">' + escapeHtml(modeLabel) + "</span>" : "") +
          "</span>";
        var panel = document.createElement("div");
        panel.className = "accordion-panel";
        var locs = Array.isArray(t.locations) && t.locations.length
          ? "<p class=\"tutor-locations\"><strong>Location:</strong> " +
            escapeHtml(t.locations.join(", ")) +
            "</p>"
          : "";
        panel.innerHTML =
          locs +
          "<p>" +
          escapeHtml(t.bio || "").replace(/\n\n/g, "</p><p>") +
          "</p>";
        btn.addEventListener("click", function () {
          var open = item.classList.toggle("open");
          btn.setAttribute("aria-expanded", open ? "true" : "false");
        });
        item.appendChild(btn);
        item.appendChild(panel);
        accordion.appendChild(item);
      });
      root.appendChild(accordion);
    }

    function filter() {
      var loc = location && location.value ? location.value : "";
      var q = search && search.value ? search.value.toLowerCase().trim() : "";
      var s = subject && subject.value ? subject.value.toLowerCase().trim() : "";
      draw(
        list.filter(function (t) {
          var modes = Array.isArray(t.modes) ? t.modes : [];
          var locs = Array.isArray(t.locations) ? t.locations : [];
          var hay = ((t.name || "") + " " + (t.subjects || "") + " " + (t.bio || "")).toLowerCase();
          var okMode = !activeMode || modes.indexOf(activeMode) !== -1;
          var okLoc = !loc || locs.indexOf(loc) !== -1;
          var okQ = !q || hay.indexOf(q) !== -1;
          var okS = !s || (t.subjects || "").toLowerCase().indexOf(s) !== -1;
          return okMode && okLoc && okQ && okS;
        })
      );
    }

    modeButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        activeMode = btn.getAttribute("data-mode") || "";
        modeButtons.forEach(function (b) {
          b.classList.toggle("is-active", b === btn);
        });
        if (activeMode === "online" && location) {
          location.value = "Online";
        } else if (activeMode === "in-person" && location && location.value === "Online") {
          location.value = "";
        }
        filter();
        var tutors = document.getElementById("tutors");
        if (tutors) tutors.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    if (location) location.addEventListener("change", filter);
    if (search) search.addEventListener("input", filter);
    if (subject) subject.addEventListener("change", filter);

    window.TT_setTutorFilters = function (opts) {
      opts = opts || {};
      if (typeof opts.mode === "string") {
        activeMode = opts.mode;
        modeButtons.forEach(function (b) {
          b.classList.toggle("is-active", (b.getAttribute("data-mode") || "") === activeMode);
        });
      }
      if (location && typeof opts.location === "string") {
        location.value = opts.location;
      }
      if (subject && typeof opts.subject === "string") {
        subject.value = opts.subject;
      }
      filter();
      var tutors = document.getElementById("tutors");
      if (tutors) tutors.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    filter();
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  if (document.getElementById("canada-tutors")) {
    renderTutors(window.TT_CANADA_TUTORS || [], "canada-tutors");
  }
  if (document.getElementById("usa-tutors")) {
    renderTutors(window.TT_USA_TUTORS || [], "usa-tutors");
  }

  document.querySelectorAll("[data-tutor-mode], [data-tutor-location]").forEach(function (el) {
    el.addEventListener("click", function (e) {
      if (!window.TT_setTutorFilters) return;
      e.preventDefault();
      window.TT_setTutorFilters({
        mode: el.getAttribute("data-tutor-mode") || undefined,
        location: el.getAttribute("data-tutor-location") || undefined
      });
    });
  });

  var sketchAnnotations = [];

  function clearSketchUnderlines() {
    sketchAnnotations.forEach(function (annotation) {
      try {
        annotation.remove();
      } catch (err) {}
    });
    sketchAnnotations = [];
    document.querySelectorAll(".section-title, .sketch-underline").forEach(function (el) {
      delete el.dataset.sketchDone;
    });
  }

  function drawSketchUnderline(el) {
    if (!window.RoughNotation || el.dataset.sketchDone) return;
    el.dataset.sketchDone = "1";
    var gold = el.classList.contains("sketch-underline-gold") || el.classList.contains("gold");
    var annotation = window.RoughNotation.annotate(el, {
      type: "underline",
      color: gold ? "#eab108" : "#0c71c3",
      strokeWidth: 3,
      padding: 3,
      iterations: 2,
      animationDuration: 900
    });
    sketchAnnotations.push(annotation);
    annotation.show();
  }

  function initSketchUnderlines() {
    var targets = document.querySelectorAll(".section-title, .sketch-underline");
    if (!targets.length || !window.RoughNotation) return;

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          drawSketchUnderline(entry.target);
          io.unobserve(entry.target);
        });
      },
      { threshold: 0.45 }
    );

    targets.forEach(function (el) {
      io.observe(el);
    });
  }

  function refreshSketchUnderlines() {
    if (!window.RoughNotation) return;
    clearSketchUnderlines();
    document.querySelectorAll(".section-title, .sketch-underline").forEach(function (el) {
      drawSketchUnderline(el);
    });
  }

  document.querySelectorAll(".become-toggle-trigger").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var box = btn.closest(".become-toggle");
      if (!box) return;
      var open = box.classList.toggle("is-open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      window.requestAnimationFrame(refreshSketchUnderlines);
    });
  });

  function loadRoughNotation(done) {
    if (window.RoughNotation) {
      done();
      return;
    }
    var script = document.createElement("script");
    script.src = "https://unpkg.com/rough-notation@0.5.1/lib/rough-notation.iife.js";
    script.onload = done;
    script.onerror = function () {};
    document.head.appendChild(script);
  }

  loadRoughNotation(initSketchUnderlines);

  function initLogoMarquee() {
    var track = document.querySelector(".logo-marquee-track");
    if (!track || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    function setDistance() {
      var items = track.querySelectorAll("li");
      if (items.length < 2) return;
      var half = items.length / 2;
      var distance = items[half].getBoundingClientRect().left - items[0].getBoundingClientRect().left;
      if (distance <= 0) return;
      track.style.setProperty("--marquee-distance", distance + "px");
      track.classList.add("is-ready");
    }

    setDistance();
    window.addEventListener("resize", setDistance);
    track.querySelectorAll("img").forEach(function (img) {
      if (!img.complete) img.addEventListener("load", setDistance, { once: true });
    });
  }

  initLogoMarquee();

  (function initFormSuccessModal() {
    var modal = null;
    var lastFocus = null;

    function ensureModal() {
      if (modal) {
        return modal;
      }

      modal = document.createElement("div");
      modal.className = "form-success-modal";
      modal.id = "form-success-modal";
      modal.hidden = true;
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.setAttribute("aria-labelledby", "form-success-title");
      modal.innerHTML =
        '<div class="form-success-modal-backdrop" data-close-modal></div>' +
        '<div class="form-success-modal-card">' +
        '<button type="button" class="form-success-modal-close" aria-label="Close">&times;</button>' +
        '<div class="form-success-modal-icon" aria-hidden="true"><i class="fas fa-check"></i></div>' +
        '<h2 id="form-success-title" class="form-success-modal-title">Message sent!</h2>' +
        '<p class="form-success-modal-message"></p>' +
        "</div>";

      document.body.appendChild(modal);

      modal.querySelector(".form-success-modal-close").addEventListener("click", closeModal);
      modal.querySelector("[data-close-modal]").addEventListener("click", closeModal);
      modal.addEventListener("click", function (e) {
        if (e.target === modal) {
          closeModal();
        }
      });

      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && modal && !modal.hidden) {
          closeModal();
        }
      });

      return modal;
    }

    function openModal(message) {
      var el = ensureModal();
      var text = el.querySelector(".form-success-modal-message");
      if (text) {
        text.textContent = message || "Thank you — your message has been sent.";
      }
      lastFocus = document.activeElement;
      el.hidden = false;
      document.body.classList.add("form-success-modal-open");
      var closeBtn = el.querySelector(".form-success-modal-close");
      if (closeBtn) {
        closeBtn.focus();
      }
    }

    function closeModal() {
      if (!modal || modal.hidden) {
        return;
      }
      modal.hidden = true;
      document.body.classList.remove("form-success-modal-open");
      if (lastFocus && typeof lastFocus.focus === "function") {
        lastFocus.focus();
      }
    }

    document.addEventListener("cwd-contact:success", function (e) {
      var detail = e.detail || {};
      openModal(detail.message);
    });
  })();
})();
