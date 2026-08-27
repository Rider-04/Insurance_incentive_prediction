/* ==========================================================================
   RenewalIQ — script.js
   Communicates ONLY with the existing FastAPI backend at API_URL.
   No ML logic, no Total_late calculation, no extra fields are added here.
   ========================================================================== */

/* --------------------------- CONFIGURATION ------------------------------ */

const API_URL =
  "https://insurance-incentive-prediction.onrender.com/predict";

const FEATURE_ORDER = [
  "perc_premium_paid_by_cash_credit",
  "age_in_days",
  "Income",
  "Count_3-6_months_late",
  "Count_6-12_months_late",
  "Count_more_than_12_months_late",
  "application_underwriting_score",
  "no_of_premiums_paid",
  "sourcing_channel",
  "residence_area_type",
  "premium"
];

const SOURCING_CHANNEL_OPTIONS = ["A", "B", "C", "D", "E"];

const RESIDENCE_AREA_TYPE_OPTIONS = ["Urban", "Rural"];

// Maps each backend feature name (in FEATURE_ORDER) to the HTML input's id.
// Hyphenated feature names are not valid as HTML ids, so the ids below use
// underscores instead — the mapping is what keeps everything in sync.
const FIELD_ID_MAP = {
  "perc_premium_paid_by_cash_credit": "perc_premium_paid_by_cash_credit",
  "age_in_days": "age_in_days",
  "Income": "Income",
  "Count_3-6_months_late": "Count_3_6_months_late",
  "Count_6-12_months_late": "Count_6_12_months_late",
  "Count_more_than_12_months_late": "Count_more_than_12_months_late",
  "application_underwriting_score": "application_underwriting_score",
  "no_of_premiums_paid": "no_of_premiums_paid",
  "sourcing_channel": "sourcing_channel",
  "residence_area_type": "residence_area_type",
  "premium": "premium"
};

const CATEGORICAL_FEATURES = new Set(["sourcing_channel", "residence_area_type"]);

/* ------------------------------- DOM refs -------------------------------- */

const formEl = document.getElementById("predictionForm");
const predictBtn = document.getElementById("predictBtn");
const resetBtn = document.getElementById("resetBtn");
const loadingNote = document.getElementById("loadingNote");
const formErrorEl = document.getElementById("formError");
const resultSection = document.getElementById("resultSection");
const resultContent = document.getElementById("resultContent");
const apiStatusEl = document.getElementById("apiStatus");

let isSubmitting = false;

/* ------------------------------- Init ------------------------------------ */

document.addEventListener("DOMContentLoaded", () => {
  populateDropdowns();
  formEl.addEventListener("submit", handleSubmit);
  resetBtn.addEventListener("click", resetForm);
});

/**
 * Fills the two categorical <select> elements with their confirmed options.
 */
function populateDropdowns() {
  const channelSelect = document.getElementById("sourcing_channel");
  SOURCING_CHANNEL_OPTIONS.forEach((value) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = value;
    channelSelect.appendChild(opt);
  });

  const areaSelect = document.getElementById("residence_area_type");
  RESIDENCE_AREA_TYPE_OPTIONS.forEach((value) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = value;
    areaSelect.appendChild(opt);
  });
}

/* ----------------------------- Validation --------------------------------- */

/**
 * Validates every one of the 11 fields.
 * Returns { valid: boolean, errors: { featureName: message } }
 */
function validateForm() {
  const errors = {};

  FEATURE_ORDER.forEach((feature) => {
    const el = document.getElementById(FIELD_ID_MAP[feature]);
    const rawValue = el.value;

    if (CATEGORICAL_FEATURES.has(feature)) {
      const options =
        feature === "sourcing_channel" ? SOURCING_CHANNEL_OPTIONS : RESIDENCE_AREA_TYPE_OPTIONS;
      if (!rawValue || !options.includes(rawValue)) {
        errors[feature] = "Please select a valid option.";
      }
      return;
    }

    // Numeric field
    if (rawValue === "" || rawValue === null) {
      errors[feature] = "This field is required.";
      return;
    }

    const num = Number(rawValue);
    if (Number.isNaN(num) || !Number.isFinite(num)) {
      errors[feature] = "Enter a valid number.";
    }
  });

  clearFieldErrors();
  Object.keys(errors).forEach((feature) => showFieldError(feature, errors[feature]));

  return { valid: Object.keys(errors).length === 0, errors };
}

function showFieldError(feature, message) {
  const id = FIELD_ID_MAP[feature];
  const inputEl = document.getElementById(id);
  const errorEl = document.getElementById(`${id}-error`);
  if (inputEl) inputEl.closest(".field").classList.add("has-error");
  if (errorEl) errorEl.textContent = message;
}

function clearFieldErrors() {
  FEATURE_ORDER.forEach((feature) => {
    const id = FIELD_ID_MAP[feature];
    const inputEl = document.getElementById(id);
    const errorEl = document.getElementById(`${id}-error`);
    if (inputEl) inputEl.closest(".field").classList.remove("has-error");
    if (errorEl) errorEl.textContent = "";
  });
}

/* --------------------------- Payload construction -------------------------- */

/**
 * Reads the 11 form fields, in the exact FEATURE_ORDER, converting numeric
 * fields to JavaScript numbers and leaving categorical fields as strings.
 */
function getInputData() {
  return FEATURE_ORDER.map((feature) => {
    const el = document.getElementById(FIELD_ID_MAP[feature]);
    if (CATEGORICAL_FEATURES.has(feature)) {
      return el.value;
    }
    return Number(el.value);
  });
}

/**
 * Wraps the 11-value array in the exact payload shape the backend expects:
 * { "data": [ [ 11 values ] ] }
 */
function buildPayload(inputData) {
  return { data: [inputData] };
}

/**
 * Extra safety net before the request ever leaves the browser.
 */
function isPayloadValid(inputData) {
  if (!Array.isArray(inputData) || inputData.length !== 11) return false;
  return inputData.every((value) => {
    if (typeof value === "number") {
      return !Number.isNaN(value) && Number.isFinite(value);
    }
    return typeof value === "string" && value.length > 0;
  });
}

/* ------------------------------- Submission -------------------------------- */

async function handleSubmit(event) {
  event.preventDefault();
  if (isSubmitting) return;

  hideFormError();
  hideResult();

  const { valid } = validateForm();
  if (!valid) {
    showFormError("Please correct the highlighted fields before submitting.");
    return;
  }

  const inputData = getInputData();

  if (!isPayloadValid(inputData)) {
    showFormError("The prepared data did not pass validation. Please review your inputs.");
    console.error("Payload validation failed:", inputData);
    return;
  }

  const payload = buildPayload(inputData);
  await submitPrediction(payload);
}

async function submitPrediction(payload) {
  setLoadingState(true);
  setApiStatus("pending", "API Status: Contacting service…");

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      await handleHttpError(response);
      setApiStatus("error", "API Status: Request failed");
      return;
    }

    const responseData = await response.json();
    setApiStatus("ready", "API Status: Ready");
    displayResults(responseData);
  } catch (err) {
    console.error("Network or unexpected error while calling the prediction API:", err);
    setApiStatus("error", "API Status: Unreachable");
    showFormError(
      "Could not reach the prediction service. This can happen if the connection dropped, " +
      "or if the hosted service (Render) is still waking up from a cold start — please wait a " +
      "few seconds and try again."
    );
  } finally {
    setLoadingState(false);
  }
}

async function handleHttpError(response) {
  let bodyText = "";
  try {
    bodyText = await response.text();
  } catch (_) {
    /* ignore */
  }

  console.error(`API returned HTTP ${response.status}:`, bodyText);

  switch (response.status) {
    case 400:
      showFormError("The prediction service rejected this request as invalid. Please check your inputs and try again.");
      break;
    case 422:
      showFormError("The submitted input format was rejected by the API. Please verify all 11 fields are filled in correctly.");
      break;
    case 500:
      showFormError("The prediction service encountered an internal error. Please check your inputs and try again.");
      break;
    default:
      showFormError(`The prediction service returned an unexpected status (${response.status}). Please try again shortly.`);
  }
}

/* -------------------------------- UI state --------------------------------- */

function setLoadingState(isLoading) {
  isSubmitting = isLoading;
  predictBtn.disabled = isLoading;
  resetBtn.disabled = isLoading;
  predictBtn.classList.toggle("is-loading", isLoading);
  loadingNote.hidden = !isLoading;
}

function setApiStatus(kind, text) {
  apiStatusEl.classList.remove("status-ready", "status-pending", "status-error");
  if (kind === "pending") apiStatusEl.classList.add("status-pending");
  if (kind === "error") apiStatusEl.classList.add("status-error");
  apiStatusEl.querySelector(".status-text").textContent = text;
}

function showFormError(message) {
  formErrorEl.textContent = message;
  formErrorEl.hidden = false;
}

function hideFormError() {
  formErrorEl.textContent = "";
  formErrorEl.hidden = true;
}

function hideResult() {
  resultSection.hidden = true;
  resultContent.innerHTML = "";
}

/* ------------------------------ Result display ------------------------------ */

function formatCurrency(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return String(value);
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2
    }).format(value);
  } catch (_) {
    return `₹${value}`;
  }
}

function displayResults(responseData) {
  resultContent.innerHTML = "";

  const results = responseData && responseData.Result;

  if (!Array.isArray(results) && !(results && typeof results === "object")) {
    displayUnexpectedResponse(responseData);
    return;
  }

  const resultList = Array.isArray(results) ? results : [results];

  resultList.forEach((item) => {
    resultContent.appendChild(buildResultSetElement(item));
  });

  resultSection.hidden = false;
  resultSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function buildResultSetElement(item) {
  const wrap = document.createElement("div");
  wrap.className = "result-set";

  const premium = item ? item.premium : undefined;
  const revenue = item ? item.revenue : undefined;
  const incentive = item ? item.incentive : undefined;

  wrap.appendChild(buildResultRow("Premium", premium, false));
  wrap.appendChild(buildResultRow("Revenue", revenue, false));
  wrap.appendChild(buildResultRow("Recommended Incentive", incentive, true));

  return wrap;
}

function buildResultRow(label, value, emphasis) {
  const row = document.createElement("div");
  row.className = emphasis ? "result-row emphasis" : "result-row";

  const labelEl = document.createElement("span");
  labelEl.className = "r-label";
  labelEl.textContent = label;

  const valueEl = document.createElement("span");
  valueEl.className = "r-value";
  valueEl.textContent = typeof value === "number" ? formatCurrency(value) : (value ?? "—");

  row.appendChild(labelEl);
  row.appendChild(valueEl);
  return row;
}

function displayUnexpectedResponse(responseData) {
  console.error("Unexpected API response shape — missing 'Result':", responseData);

  const note = document.createElement("p");
  note.className = "result-note";
  note.textContent =
    "The response did not contain the expected \"Result\" field. Raw response below:";

  const pre = document.createElement("pre");
  pre.className = "result-raw";
  pre.textContent = JSON.stringify(responseData, null, 2);

  resultContent.appendChild(note);
  resultContent.appendChild(pre);
  resultSection.hidden = false;
}

/* --------------------------------- Reset ------------------------------------ */

function resetForm() {
  formEl.reset();
  clearFieldErrors();
  hideFormError();
  hideResult();
  setLoadingState(false);
  setApiStatus("ready", "API Status: Ready");
}
