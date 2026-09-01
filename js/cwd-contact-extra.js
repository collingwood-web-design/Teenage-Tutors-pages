/**
 * CWD contact form binder for Teenage Tutors.
 * Binds #contact-form and form[data-cwd-contact], consolidates checkbox
 * groups (same name) into one field so submissions stay under the API's
 * 20-field limit, supports file uploads via multipart, then POSTs to the
 * shared Railway contact service.
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

  function dispatchContactEvent(root, type, detail) {
    if (!root || typeof CustomEvent !== "function") {
      return;
    }
    root.dispatchEvent(
      new CustomEvent(type, {
        bubbles: true,
        detail: detail || {},
      })
    );
  }

  function reportError(root, message, reason) {
    setStatus(root, message, true);
    dispatchContactEvent(root, "cwd-contact:error", {
      message: message,
      reason: reason || "server",
    });
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

  function collectFiles(root) {
    var files = [];
    var elements = root.querySelectorAll('input[type="file"]');

    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      if (el.disabled || el.hasAttribute("data-cwd-honeypot")) {
        continue;
      }
      var name = (el.getAttribute("name") || "").trim() || "Attachment";
      if (!el.files || !el.files.length) {
        continue;
      }
      for (var j = 0; j < el.files.length; j++) {
        files.push({ label: name, file: el.files[j] });
      }
    }

    return files;
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
      return;
    }

    var elements = root.querySelectorAll("input, textarea, select");
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      var type = (el.getAttribute("type") || "").toLowerCase();
      if (el.hasAttribute("data-cwd-honeypot")) {
        el.value = "";
        continue;
      }
      if (type === "file") {
        el.value = "";
        continue;
      }
      if (type === "checkbox" || type === "radio") {
        el.checked = false;
      } else if (el.tagName === "SELECT") {
        el.selectedIndex = 0;
      } else if (type !== "submit" && type !== "button") {
        el.value = "";
      }
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
    var fileParts = collectFiles(root);

    if (!payloadParts.fields.length && !fileParts.length && !payloadParts.honeypot) {
      reportError(root, "Please fill in the form.", "validation");
      return;
    }

    var payload = {
      page_url: window.location.href,
      fields: payloadParts.fields,
    };
    if (payloadParts.honeypot) {
      payload.honeypot = payloadParts.honeypot;
    }

    root.setAttribute("data-cwd-contact-busy", "1");
    setStatus(root, "Sending…", false);

    var submitBtn = root.querySelector('[type="submit"], button:not([type])');
    if (submitBtn) {
      submitBtn.disabled = true;
    }

    try {
      var fetchOptions = {
        method: "POST",
        headers: { Accept: "application/json" },
      };

      if (fileParts.length) {
        var formData = new FormData();
        formData.append("payload", JSON.stringify(payload));
        for (var f = 0; f < fileParts.length; f++) {
          formData.append(fileParts[f].label, fileParts[f].file, fileParts[f].file.name);
        }
        fetchOptions.body = formData;
      } else {
        fetchOptions.headers["Content-Type"] = "application/json";
        fetchOptions.body = JSON.stringify(payload);
      }

      var response = await fetch(API_BASE + "/v1/contact", fetchOptions);

      if (response.status === 429) {
        reportError(root, "Please wait a moment before sending again.", "rate_limit");
        return;
      }
      if (!response.ok) {
        reportError(
          root,
          "Sorry, we could not send your message. Please try again later.",
          "server"
        );
        return;
      }

      var successMessage = "Thank you — your message has been sent.";
      setStatus(root, "", false);
      dispatchContactEvent(root, "cwd-contact:success", {
        ok: true,
        message: successMessage,
      });
      resetRoot(root);
    } catch (err) {
      reportError(
        root,
        "Network error. Please check your connection and try again.",
        "network"
      );
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
