const { Browsers } = require("baileys");
const makeWASocket = require("baileys").default;
const pino = require("pino");
const NodeCache = require("node-cache");

const groupCache = new NodeCache({ stdTTL: 5 * 60, useClones: false });

async function createSocket(state) {
  let sock;

  if (process.env.CHANGE_WEB === "true") {
    const {
      default: nodeFetch,
      Request,
      Response,
      Headers,
    } = await import("node-fetch");
    const axiosModule = await import("axios");
    const axios = axiosModule.default;

    const WA_PROXY_BASE =
      process.env.WA_PROXY_URL || "https://proxy-test.pxxl.click";

    global.fetch = async (targetUrl, options = {}) => {
      try {
        const host = new URL(targetUrl).hostname;
        const whatsappDomains = [
          "mmg.whatsapp.net",
          "pps.whatsapp.net",
          "media.whatsapp.net",
          "cdn.whatsapp.net",
          "web.whatsapp.com",
        ];
        const useProxy = whatsappDomains.some((d) => host.includes(d));
        if (!useProxy) return nodeFetch(targetUrl, options);
        const proxyUrl = `${WA_PROXY_BASE}/proxy?url=${encodeURIComponent(targetUrl)}`;
        return nodeFetch(proxyUrl, {
          ...options,
          headers: { ...(options.headers || {}), "x-wa-proxy-key": "NEXUS" },
        });
      } catch (e) {
        console.error("[fetch proxy error]", e);
        return nodeFetch(targetUrl, options);
      }
    };

    global.Request = Request;
    global.Response = Response;
    global.Headers = Headers;

    axios.interceptors.request.use(
      (cfg) => {
        try {
          if (!cfg.url) return cfg;
          const host = new URL(cfg.url).hostname;
          const whatsappDomains = [
            "mmg.whatsapp.net",
            "pps.whatsapp.net",
            "media.whatsapp.net",
            "cdn.whatsapp.net",
            "web.whatsapp.com",
          ];
          if (whatsappDomains.some((d) => host.includes(d))) {
            cfg.url = `${WA_PROXY_BASE}/proxy?url=${encodeURIComponent(cfg.url)}`;
            cfg.baseURL = undefined;
            cfg.headers = { ...(cfg.headers || {}), "x-wa-proxy-key": "NEXUS" };
            delete cfg.httpAgent;
            delete cfg.httpsAgent;
          }
        } catch (err) {
          console.warn("axios proxy rewrite failed", err.message);
        }
        return cfg;
      },
      (e) => Promise.reject(e),
    );

    sock = makeWASocket({
      auth: state,
      logger: pino({ level: "silent" }),
      printQRInTerminal: false,
      browser: Browsers.macOS("Safari"),
      version: [2, 3000, 1040677438],
      syncFullHistory: false,
      cachedGroupMetadata: async (jid) => groupCache.get(jid),
      generateHighQualityLinkPreview: true,
      waWebSocketUrl: "wss://proxy-test.pxxl.click/wa-proxy",
      markOnlineOnConnect: false,
    });
  } else {
    sock = makeWASocket({
      auth: state,
      logger: pino({ level: "silent" }),
      printQRInTerminal: false,
      browser: Browsers.macOS("Safari"),
      version: [2, 3000, 1040677438],
      syncFullHistory: false,
      cachedGroupMetadata: async (jid) => groupCache.get(jid),
      generateHighQualityLinkPreview: true,
      markOnlineOnConnect: false,
    });
  }

  return sock;
}

module.exports = { createSocket };
