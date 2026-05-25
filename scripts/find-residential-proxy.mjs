/**
 * 住宅 IP 代理发现工具
 *
 * 从 ProxyScrape 获取免费 SOCKS5 代理并筛选住宅 IP。
 * 输出可直接用于注册脚本的 PROXY 环境变量。
 *
 * 用法:
 *   node scripts/find-residential-proxy.mjs
 *   node scripts/find-residential-proxy.mjs --max 50       # 最多检查 50 个
 *   node scripts/find-residential-proxy.mjs --all          # 检查所有
 */

import { execSync } from "child_process";
import https from "https";
import http from "http";

const MAX_CHECK = process.argv.includes("--all")
  ? 999
  : parseInt(process.argv[process.argv.indexOf("--max") + 1] || "30", 10);

const DC_KEYWORDS = [
  "hosting", "cloud", "server", "data center", "datacenter", "vps",
  "digital ocean", "amazon", "aws", "google", "microsoft", "azure",
  "linode", "vultr", "hetzner", "ovh", "leaseweb", "choopa",
  "cogent", "m247", "hostwinds", "hostgator",
];

function httpGet(url) {
  const mod = url.startsWith("https") ? https : http;
  return new Promise((resolve, reject) => {
    const req = mod.get(url, { timeout: 10000 }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => resolve(d));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
  });
}

async function main() {
  console.log("=== Residential Proxy Finder ===\n");

  const raw = await httpGet(
    "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks5&timeout=10000&country=US"
  );
  const proxies = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  console.log(`Found ${proxies.length} US SOCKS5 proxies. Checking up to ${MAX_CHECK}...\n`);

  const residential_pat = /^(98|68|72|174|184|67|76|71|75|73|24|50|66|70|99|96|107|108)\./;
  const sorted = [
    ...proxies.filter((p) => residential_pat.test(p)),
    ...proxies.filter((p) => !residential_pat.test(p)),
  ].slice(0, MAX_CHECK);

  const found = [];

  for (const proxy of sorted) {
    process.stdout.write(`  ${proxy} ... `);
    try {
      const result = execSync(
        `timeout 8 curl -s -x socks5://${proxy} http://ip-api.com/json`,
        { encoding: "utf-8", timeout: 10000 }
      );
      const info = JSON.parse(result);
      const ispLower = ((info.isp || "") + " " + (info.org || "")).toLowerCase();
      const isDC = DC_KEYWORDS.some((kw) => ispLower.includes(kw));

      if (isDC) {
        console.log(`DC (${info.isp})`);
      } else {
        console.log(`RESIDENTIAL — ${info.isp} | ${info.city}, ${info.regionName}`);
        found.push({ proxy, isp: info.isp, city: info.city, region: info.regionName });
      }
    } catch {
      console.log("TIMEOUT/FAIL");
    }
  }

  console.log(`\n=== Results: ${found.length} residential proxies found ===\n`);
  for (const r of found) {
    console.log(`  PROXY=socks5://${r.proxy}   # ${r.isp} (${r.city}, ${r.region})`);
  }

  if (found.length === 0) {
    console.log("  No residential proxies found. Try again later or increase --max.\n");
    console.log("  Tip: The previously verified proxy was 98.182.147.97:4145 (Cox, Las Vegas).");
  }
}

main().catch(console.error);
