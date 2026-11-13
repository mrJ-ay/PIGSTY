window.ONEID_API_URL =
  window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://127.0.0.1:8000"
    : "https://oneid-ruddy.vercel.app";
window.ONEID_CLIENT_ID = "pigsty";
