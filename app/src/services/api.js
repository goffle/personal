import { apiURL } from "@/config";

class Api {
  constructor() {
    this.token = localStorage.getItem("token");
  }
  setToken(token) {
    this.token = token;
    if (token) localStorage.setItem("token", token);
    else localStorage.removeItem("token");
  }
  headers(json = true) {
    const h = {};
    if (this.token) h.Authorization = `JWT ${this.token}`;
    if (json) h["Content-Type"] = "application/json";
    return h;
  }
  async get(path) {
    const r = await fetch(`${apiURL}${path}`, { method: "GET", credentials: "include", headers: this.headers() });
    return r.json();
  }
  async post(path, body) {
    const r = await fetch(`${apiURL}${path}`, { method: "POST", credentials: "include", headers: this.headers(), body: JSON.stringify(body ?? {}) });
    return r.json();
  }
  async put(path, body) {
    const r = await fetch(`${apiURL}${path}`, { method: "PUT", credentials: "include", headers: this.headers(), body: JSON.stringify(body ?? {}) });
    return r.json();
  }
  async remove(path) {
    const r = await fetch(`${apiURL}${path}`, { method: "DELETE", credentials: "include", headers: this.headers() });
    return r.json();
  }
  streamUrl(path) {
    return `${apiURL}${path}`;
  }
}

const API = new Api();
export default API;
