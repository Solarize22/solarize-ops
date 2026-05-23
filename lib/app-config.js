function normalizeText(value, fallback) {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const environmentLabel = normalizeText(process.env.NEXT_PUBLIC_APP_ENV_LABEL, "");
const appName = normalizeText(process.env.NEXT_PUBLIC_APP_NAME, "Solarize Operations");

export const appConfig = {
  appName,
  companyName: normalizeText(process.env.NEXT_PUBLIC_COMPANY_NAME, "Solarize Home Energy"),
  appSubtitle: normalizeText(process.env.NEXT_PUBLIC_APP_SUBTITLE, "CRM and install workflow"),
  appDescription: normalizeText(
    process.env.NEXT_PUBLIC_APP_DESCRIPTION,
    "Solar CRM, scheduling, and workflow command center"
  ),
  signInSubtitle: normalizeText(
    process.env.NEXT_PUBLIC_SIGN_IN_SUBTITLE,
    "Operations Dashboard"
  ),
  environmentLabel,
  themeStorageKey: normalizeText(
    process.env.NEXT_PUBLIC_THEME_STORAGE_KEY,
    environmentLabel ? `solarize-theme-${slugify(environmentLabel)}` : "solarize-theme"
  ),
  calendarSourceLabel: normalizeText(process.env.NEXT_PUBLIC_CALENDAR_SOURCE_LABEL, appName),
};

