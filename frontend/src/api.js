import axios from "axios";

const API_BASE = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  ? "http://localhost:8000"
  : "https://report-transformer.onrender.com";

// 🔥 single axios instance (important)
const api = axios.create({
  baseURL: API_BASE,
});

// ================= REPORTS =================

export const listReports = (params = {}) => api.get("/reports", { params });

export const deleteReport = (id) => api.delete(`/reports/${id}`);

export const createReport = (name, type, extra = {}) => {
  // Ultimate safety fallback for name to prevent FastAPI 422 crashes
  const safeName = name && name.trim() !== "" ? name : `${type} Report`;
  const clean = Object.fromEntries(
    Object.entries({
      name: safeName,
      type,
      ...extra,
    }).filter(([_, v]) => v !== undefined && v !== null && v !== "")
  );

  return api.post("/reports", null, { params: clean });
};

// ================= UPLOAD =================

export const uploadFile = (
  id,
  file,
  from = null,
  to = null,
  key = null
) => {
  const form = new FormData();
  form.append("file", file);

  const params = {};

  if (from) params.from_date = from;
  if (to) params.to_date = to;
  if (key) params.key = key; // 🔥 CRITICAL (warehouse)

  return api.post(`/upload/${id}`, form, { params });
};

// ================= PROCESS =================

export const processReport = (id) => {
  return api.post(`/process/${id}`);
};

// ================= GET REPORT =================

export const getReport = (id, shop = null, view = null, extra = {}) => {
  return api.get(`/report/${id}`, {
    params: {
      shop_code: shop,
      view,
      ...extra,
    },
  });
};

export const updateReportConfig = (id, payload) => api.put(`/reports/${id}/config`, payload);

// ================= FILTERS =================

export const getShops = (id) => api.get(`/shops/${id}`);

export const getAllWarehouses = () => api.get("/warehouses/all");

export const getWarehouses = (id) => api.get(`/warehouses/${id}`);

export const getFilters = (id) => api.get(`/filters/${id}`);

export const compareLive = (date1, date2) => api.get("/compare-live", { params: { date1, date2 } });

export const downloadRaw = (id, key = null) => {
  const url = `${api.defaults.baseURL}/download-raw/${id}${key ? `?key=${encodeURIComponent(key)}` : ""}`;
  window.open(url, "_blank");
};

// ================= JSON CRUD =================
export const getJson = (name) => api.get(`/json/${name}`);
export const replaceJson = (name, payload) => api.put(`/json/${name}`, payload);
export const updateJsonKey = (name, key, payload) => api.put(`/json/${name}/${key}`, payload);
export const deleteJsonKey = (name, key) => api.delete(`/json/${name}/${key}`);
