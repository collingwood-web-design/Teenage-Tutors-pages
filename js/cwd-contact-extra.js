/**
 * CWD contact form binder for Teenage Tutors.
 * Binds #contact-form and form[data-cwd-contact], consolidates checkbox
 * groups (same name) into one field so submissions stay under the API's
 * 20-field limit, supports file uploads via multipart, then POSTs to the
 * shared Railway contact service.
 *
 * Forms with data-cwd-validate are fully checked in the browser (required
 * fields, email/phone format, text length, attachment type/size) before
 * anything is sent, with inline errors beside each field.
 */
(function () {
  "use strict";

  var API_BASE = "https://web-production-54a6d.up.railway.app";

  // Must mirror resend-fastapi (app/config.py, app/services/attachment_validator.py,
  // app/routers/contact.py). Values above 2,000 chars are truncated by the API and
  // above 2,200 are rejected, so 2,000 is the safe frontend cap.
  var MAX_FIELD_LENGTH = 2000;
  var MAX_PAGE_URL_LENGTH = 500;
  var MAX_FIELDS = 50;
  var MAX_FILES = 5;
  var MAX_FILE_BYTES = 5 * 1024 * 1024;
  var MAX_TOTAL_FILE_BYTES = 10 * 1024 * 1024;
  var ALLOWED_FILE_TYPES = {
    ".pdf": ["application/pdf"],
    ".doc": ["application/msword"],
    ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ".txt": ["text/plain"],
    ".csv": ["text/csv", "application/csv", "text/plain", "application/vnd.ms-excel"],
    ".rtf": ["application/rtf", "text/rtf"],
    ".jpg": ["image/jpeg"],
    ".jpeg": ["image/jpeg"],
    ".png": ["image/png"],
    ".gif": ["image/gif"],
  };
  var ALLOWED_FILE_SUMMARY = "PDF, Word (DOC or DOCX), RTF, TXT, CSV, JPG, PNG or GIF";

  var EMAIL_PATTERN =
    /^[A-Za-z0-9!#$%&'*+\/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+\/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;
  var PHONE_CHARS = /^[0-9+().\-\s]+$/;

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

  function pageUrlForPayload() {
    var href = window.location.href;
    if (href.length <= MAX_PAGE_URL_LENGTH) {
      return href;
    }
    return (window.location.origin + window.location.pathname).slice(0, MAX_PAGE_URL_LENGTH);
  }

  function formatMegabytes(bytes) {
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function fileExtension(filename) {
    var name = String(filename || "");
    var dot = name.lastIndexOf(".");
    return dot === -1 ? "" : name.slice(dot).toLowerCase();
  }

  function validateFile(file) {
    var ext = fileExtension(file.name);
    var allowedTypes = ALLOWED_FILE_TYPES[ext];

    if (!allowedTypes) {
      if (ext === ".heic" || ext === ".heif") {
        return (
          "iPhone photos (HEIC) aren't supported. Please save the photo as a JPG or PDF " +
          "and choose it again."
        );
      }
      return "This file type isn't supported. Please choose a " + ALLOWED_FILE_SUMMARY + " file.";
    }
    if (file.size === 0) {
      return "This file is empty. Please choose a different file.";
    }
    if (file.size > MAX_FILE_BYTES) {
      return (
        "This file is larger than 5 MB. Please choose a smaller file before submitting. " +
        "(“" + file.name + "” is " + formatMegabytes(file.size) + ".)"
      );
    }

    var mime = String(file.type || "").split(";")[0].trim().toLowerCase();
    if (mime && mime !== "application/octet-stream" && allowedTypes.indexOf(mime) === -1) {
      return (
        "This file's format doesn't match its “" + ext + "” extension. Please save it as a " +
        "standard " + ALLOWED_FILE_SUMMARY + " file and choose it again."
      );
    }
    return "";
  }

  function fieldLabel(root, el) {
    var label = el.id ? root.querySelector('label[for="' + el.id + '"]') : null;
    var text = label ? label.textContent : el.getAttribute("name") || "This field";
    return text.replace(/\*/g, "").trim();
  }

  function requiredMessage(root, el, container) {
    var custom =
      (el && el.getAttribute("data-cwd-required-message")) ||
      (container && container.getAttribute("data-cwd-required-message"));
    if (custom) {
      return custom;
    }
    return el ? fieldLabel(root, el) + " is required." : "Please choose at least one option.";
  }

  function fieldMaxLength(el) {
    var attr = parseInt(el.getAttribute("maxlength"), 10);
    return attr > 0 ? Math.min(attr, MAX_FIELD_LENGTH) : MAX_FIELD_LENGTH;
  }

  function validateTextField(root, el) {
    var value = String(el.value || "");
    var trimmed = value.trim();
    var type = (el.getAttribute("type") || "").toLowerCase();

    if (!trimmed) {
      return el.required ? requiredMessage(root, el) : "";
    }

    var limit = fieldMaxLength(el);
    if (value.length > limit) {
      return (
        "This field is limited to " + limit.toLocaleString() + " characters. Please shorten it " +
        "(it's currently " + value.length.toLocaleString() + ")."
      );
    }

    if (type === "email") {
      var at = trimmed.lastIndexOf("@");
      if (trimmed.length > 254 || at > 64 || !EMAIL_PATTERN.test(trimmed)) {
        return "Please enter a valid email address, for example name@example.com.";
      }
    }

    if (type === "tel") {
      var digits = trimmed.replace(/\D/g, "").length;
      if (!PHONE_CHARS.test(trimmed) || digits < 7 || digits > 15) {
        return "Please enter a valid phone number, for example (416) 555-0123.";
      }
    }

    return "";
  }

  function fieldContainer(root, el) {
    var container = el.parentElement;
    return container && root.contains(container) ? container : root;
  }

  function validateRoot(root) {
    var items = [];
    var groupInputs = [];

    root.querySelectorAll("[data-cwd-required-group]").forEach(function (group) {
      var inputs = Array.prototype.slice.call(
        group.querySelectorAll('input[type="checkbox"], input[type="radio"]')
      );
      if (!inputs.length) {
        return;
      }
      groupInputs = groupInputs.concat(inputs);
      var anyChecked = inputs.some(function (input) {
        return input.checked;
      });
      items.push({
        container: group,
        inputs: inputs,
        message: anyChecked ? "" : requiredMessage(root, null, group),
      });
    });

    var totalFiles = 0;
    var totalBytes = 0;

    root.querySelectorAll("input, textarea, select").forEach(function (el) {
      var type = (el.getAttribute("type") || "").toLowerCase();
      if (
        el.disabled ||
        el.hasAttribute("data-cwd-honeypot") ||
        groupInputs.indexOf(el) !== -1 ||
        ["hidden", "submit", "button", "reset", "checkbox", "radio"].indexOf(type) !== -1
      ) {
        return;
      }

      var message = "";
      if (type === "file") {
        var files = el.files ? Array.prototype.slice.call(el.files) : [];
        if (!files.length) {
          message = el.required ? requiredMessage(root, el) : "";
        }
        for (var i = 0; i < files.length && !message; i++) {
          message = validateFile(files[i]);
          totalFiles += 1;
          totalBytes += files[i].size;
        }
        if (!message && totalFiles > MAX_FILES) {
          message = "Please attach no more than " + MAX_FILES + " files in total.";
        }
        if (!message && totalBytes > MAX_TOTAL_FILE_BYTES) {
          message =
            "Your attachments add up to more than 10 MB. Please choose smaller files before submitting.";
        }
      } else if (el.tagName === "SELECT") {
        message = el.required && !el.value ? requiredMessage(root, el) : "";
      } else {
        message = validateTextField(root, el);
      }

      items.push({ container: fieldContainer(root, el), inputs: [el], message: message });
    });

    return items.sort(function (a, b) {
      var position = a.inputs[0].compareDocumentPosition(b.inputs[0]);
      return position & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
  }

  function renderFieldError(item) {
    var container = item.container;
    var errorEl = container.querySelector(":scope > .field-error");
    var invalid = !!item.message;

    if (invalid && !errorEl) {
      errorEl = document.createElement("p");
      errorEl.className = "field-error";
      errorEl.id = "cwd-error-" + Math.random().toString(36).slice(2, 10);
      errorEl.innerHTML = '<i class="fas fa-exclamation-circle" aria-hidden="true"></i><span></span>';
      container.appendChild(errorEl);
    }
    if (errorEl) {
      errorEl.querySelector("span").textContent = item.message || "";
      errorEl.hidden = !invalid;
    }

    container.classList.toggle("has-error", invalid);
    item.inputs.forEach(function (input) {
      if (invalid) {
        input.setAttribute("aria-invalid", "true");
        input.setAttribute("aria-describedby", errorEl.id);
      } else {
        input.removeAttribute("aria-invalid");
        if (errorEl && input.getAttribute("aria-describedby") === errorEl.id) {
          input.removeAttribute("aria-describedby");
        }
      }
    });
  }

  function revalidateFor(root, target) {
    validateRoot(root).forEach(function (item) {
      if (item.inputs.indexOf(target) !== -1) {
        renderFieldError(item);
      }
    });
  }

  function updateCounter(el) {
    var counter = el._cwdCounter;
    if (!counter) {
      return;
    }
    var limit = fieldMaxLength(el);
    var length = String(el.value || "").length;
    counter.textContent = length.toLocaleString() + " / " + limit.toLocaleString() + " characters";
    counter.classList.toggle("is-near-limit", length >= limit * 0.9);
  }

  function clearValidation(root) {
    root.removeAttribute("data-cwd-validated-once");
    validateRoot(root).forEach(function (item) {
      renderFieldError({ container: item.container, inputs: item.inputs, message: "" });
    });
    root.querySelectorAll("textarea").forEach(updateCounter);
  }

  function setupValidation(root) {
    root.noValidate = true;

    root
      .querySelectorAll('textarea, input:not([type]), input[type="text"], input[type="email"], input[type="tel"]')
      .forEach(function (el) {
        if (el.hasAttribute("data-cwd-honeypot")) {
          return;
        }
        if (!el.hasAttribute("maxlength")) {
          el.setAttribute("maxlength", String(MAX_FIELD_LENGTH));
        }
        if (el.tagName === "TEXTAREA") {
          var counter = document.createElement("span");
          counter.className = "char-counter";
          el.insertAdjacentElement("afterend", counter);
          el._cwdCounter = counter;
          updateCounter(el);
        }
      });

    root.addEventListener("input", function (event) {
      var target = event.target;
      updateCounter(target);
      if (root.hasAttribute("data-cwd-validated-once") || target.getAttribute("aria-invalid") === "true") {
        revalidateFor(root, target);
      }
    });

    root.addEventListener("change", function (event) {
      var target = event.target;
      var type = (target.getAttribute("type") || "").toLowerCase();
      if (type === "file" || root.hasAttribute("data-cwd-validated-once") || target.getAttribute("aria-invalid") === "true") {
        revalidateFor(root, target);
      }
    });

    root.addEventListener("focusout", function (event) {
      var target = event.target;
      var type = (target.getAttribute("type") || "").toLowerCase();
      if ((type === "email" || type === "tel") && String(target.value || "").trim()) {
        revalidateFor(root, target);
      }
    });
  }

  function runValidation(root) {
    root.setAttribute("data-cwd-validated-once", "1");
    var items = validateRoot(root);
    items.forEach(renderFieldError);

    var problems = items.filter(function (item) {
      return !!item.message;
    });
    if (!problems.length) {
      return true;
    }

    var first = problems[0];
    if (first.inputs[0] && typeof first.inputs[0].focus === "function") {
      first.inputs[0].focus({ preventScroll: true });
    }
    first.container.scrollIntoView({ block: "center", behavior: "smooth" });

    reportError(
      root,
      problems.length === 1
        ? "Please fix the highlighted field before sending."
        : "Please fix the " + problems.length + " highlighted fields before sending.",
      "validation"
    );
    return false;
  }

  async function submitRoot(root, event) {
    if (event) {
      event.preventDefault();
    }
    if (root.getAttribute("data-cwd-contact-busy") === "1") {
      return;
    }

    if (root.hasAttribute("data-cwd-validate") && !runValidation(root)) {
      return;
    }

    var payloadParts = collectFields(root);
    var fileParts = collectFiles(root);

    if (!payloadParts.fields.length && !fileParts.length && !payloadParts.honeypot) {
      reportError(root, "Please fill in the form.", "validation");
      return;
    }
    if (payloadParts.fields.length > MAX_FIELDS) {
      reportError(root, "This form has too many fields to send. Please contact us by phone.", "validation");
      return;
    }

    var payload = {
      page_url: pageUrlForPayload(),
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
      if (root.hasAttribute("data-cwd-validate")) {
        clearValidation(root);
      }
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
    if (root.hasAttribute("data-cwd-validate")) {
      setupValidation(root);
    }
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
