
import axios from "axios";
const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

export const listReports = () => axios.get(`${API}/reports`);
export const createReport = (name, type, extra = {}) => {
  const clean = Object.fromEntries(
    Object.entries({
      name,
      type,
      ...extra
    }).filter(([_, v]) => v !== undefined && v !== null && v !== "")
  );

  const params = new URLSearchParams(clean);

  return axios.post(`${API}/reports?${params.toString()}`);
};

export const uploadFile = (id, file, from, to = null) => {
  const fd = new FormData();
  fd.append("file", file);

  // ✅ cumulative case (single date)
  if (from && !to) {
    return axios.post(`${API}/upload/${id}?date=${from}`, fd);
  }

  // ✅ normal case (range)
  return axios.post(`${API}/upload/${id}?from_date=${from}&to_date=${to}`, fd);
};

export const processReport = (id) =>
  axios.post(`${API}/process/${id}`);

export const getReport = (id, shop, view) =>
  axios.get(`${API}/report/${id}`, {
    params: { shop_code: shop, view }
  });

export const getShops = (id) =>
  axios.get(`${API}/shops/${id}`);
