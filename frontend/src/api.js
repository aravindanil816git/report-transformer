import axios from "axios";

const API_BASE = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  ? "http://localhost:8000"
  : "https://report-transformer.onrender.com";

// 🔥 single axios instance (important)
const api = axios.create({
  baseURL: API_BASE,
});

// ================= REPORTS =================

export const listReports = () => api.get("/reports");

export const createReport = (name, type, extra = {}) => {
  const clean = Object.fromEntries(
    Object.entries({
      name,
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

// ================= FILTERS =================

export const getShops = (id) => api.get(`/shops/${id}`);

export const getWarehouses = (id) => api.get(`/warehouses/${id}`);