/**
 * CWD contact form binder for Teenage Tutors.
 * Binds #contact-form and form[data-cwd-contact], consolidates checkbox
 * groups (same name) into one field so submissions stay under the API's
 * 20-field limit, then POSTs to the shared Railway contact service.
 */
(function () {
  "use strict";

  var API_BASE = "https://web-production-54a6d.up.railway.app";

  function ensureStatus(root) {
    var el = root.querySelector("[data-cwd-contact-status]");
    if (!el) {
      el = document.createElement("p");
      el.setAttribute("data-cwd-contact-status", "");
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      root.appendChild(el);
    }
    return el;
  }

  function setStatus(root, message, isError) {
    var el = ensureStatus(root);
    el.textContent = message || "";
    el.hidden = !message;
    el.setAttribute("data-cwd-contact-state", isError ? "error" : message ? "ok" : "");
  }

  function collectFields(root) {
    var fields = [];
    var honeypot = "";
    var elements = root.querySelectorAll("input, textarea, select");

    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      var type = (el.getAttribute("type") || "").toLowerCase();
      if (type === "submit" || type === "button" || type === "file" || type === "reset") {
        continue;
      }
      if (el.disabled) {
        continue;
      }

      var name = (el.getAttribute("name") || "").trim();
      if (!name) {
        continue;
      }

      if (el.hasAttribute("data-cwd-honeypot")) {
        if (String(el.value || "").trim()) {
          honeypot = String(el.value);
        }
        continue;
      }

      var value = "";
      if (el.tagName === "SELECT" && el.multiple) {
        var selected = [];
        for (var j = 0; j < el.options.length; j++) {
          if (el.options[j].selected) {
            selected.push(el.options[j].value);
          }
        }
        value = selected.join(", ");
      } else if (type === "checkbox") {
        if (!el.checked) {
          continue;
        }
        value = el.value || "yes";
      } else if (type === "radio") {
        if (!el.checked) {
          continue;
        }
        value = el.value || "";
      } else {
        value = el.value || "";
      }

      if (!String(value).trim()) {
        continue;
      }

      fields.push({ name: name, label: name, value: value });
    }

    return { fields: consolidateFields(fields), honeypot: honeypot };
  }

  function consolidateFields(fields) {
    var grouped = [];
    var indexByName = Object.create(null);

    for (var i = 0; i < fields.length; i++) {
      var field = fields[i];
      var key = field.name;
      if (indexByName[key] === undefined) {
        indexByName[key] = grouped.length;
        grouped.push({ name: field.name, label: field.label, value: field.value });
        continue;
      }

      var existing = grouped[indexByName[key]];
      existing.value = existing.value + ", " + field.value;
    }

    return grouped;
  }

  function resetRoot(root) {
    if (typeof root.reset === "function") {
      root.reset();
    }
  }

  async function submitRoot(root, event) {
    if (event) {
      event.preventDefault();
    }
    if (root.getAttribute("data-cwd-contact-busy") === "1") {
      return;
    }

    var payloadParts = collectFields(root);
    if (!payloadParts.fields.length && !payloadParts.honeypot) {
      setStatus(root, "Please fill in the form.", true);
      return;
    }

    var body = {
      page_url: window.location.href,
      fields: payloadParts.fields,
    };
    if (payloadParts.honeypot) {
      body.honeypot = payloadParts.honeypot;
    }

    root.setAttribute("data-cwd-contact-busy", "1");
    setStatus(root, "Sending…", false);

    var submitBtn = root.querySelector('[type="submit"], button:not([type])');
    if (submitBtn) {
      submitBtn.disabled = true;
    }

    try {
      var response = await fetch(API_BASE + "/v1/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      });

      if (response.status === 429) {
        setStatus(root, "Please wait a moment before sending again.", true);
        return;
      }
      if (!response.ok) {
        setStatus(root, "Sorry, we could not send your message. Please try again later.", true);
        return;
      }

      setStatus(root, "Thank you — your message has been sent.", false);
      resetRoot(root);
    } catch (err) {
      setStatus(root, "Network error. Please check your connection and try again.", true);
    } finally {
      root.removeAttribute("data-cwd-contact-busy");
      if (submitBtn) {
        submitBtn.disabled = false;
      }
    }
  }

  function bindRoot(root) {
    if (!root || root.getAttribute("data-cwd-contact-bound") === "1") {
      return;
    }
    root.setAttribute("data-cwd-contact-bound", "1");
    root.addEventListener("submit", function (event) {
      submitRoot(root, event);
    });
  }

  function init() {
    var primary = document.getElementById("contact-form");
    if (primary) {
      bindRoot(primary);
    }
    document.querySelectorAll("form[data-cwd-contact]").forEach(bindRoot);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
