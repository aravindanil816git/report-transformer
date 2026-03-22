
import axios from "axios";
const API = "http://localhost:8000";

export const listReports = () => axios.get(`${API}/reports`);
export const createReport = (name) =>
  axios.post(`${API}/reports?name=${name}`);

export const uploadFile = (id, file, from, to) => {
  const fd = new FormData();
  fd.append("file", file);
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
