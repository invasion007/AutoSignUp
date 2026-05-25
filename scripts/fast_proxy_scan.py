#!/usr/bin/env python3
"""
Fast parallel proxy scan - find residential SOCKS5 proxies for ChatGPT.
Uses concurrent workers to check many proxies quickly.
"""

import subprocess
import json
import sys
import urllib.request
import concurrent.futures
import threading

DC_KEYWORDS = [
    "hosting", "cloud", "server", "data center", "datacenter", "vps",
    "digital ocean", "digitalocean", "amazon", "aws", "google", "microsoft",
    "azure", "linode", "vultr", "hetzner", "ovh", "leaseweb", "choopa",
    "cogent", "m247", "hostwinds", "hostgator", "contabo", "kamatera",
    "godaddy", "rackspace", "softlayer", "ibm", "oracle", "alibaba",
    "tencent", "servermania", "hostroyale", "quadranet", "psychz",
    "colocrossing", "buyvm", "ramnode", "dreamhost", "namecheap",
    "webshare", "brightdata", "luminati", "oxylabs", "smartproxy",
    "new dream", "constant company", "xnnet", "stark industries",
    "tzulo", "peg tech", "datacamp", "private layer", "sharktech",
    "zenlayer", "multacom", "net.com", "wholesail", "fdcservers",
]

lock = threading.Lock()
results = []
checked_count = [0]
total_count = [0]

def check_one_proxy(proxy):
    """Check a single proxy: IP info + HTTPS test"""
    try:
        # Step 1: Check IP info via HTTP
        r = subprocess.run(
            ["timeout", "8", "curl", "-s", "-x", f"socks5://{proxy}", "http://ip-api.com/json"],
            capture_output=True, text=True, timeout=10
        )
        if r.returncode != 0 or not r.stdout.strip():
            with lock:
                checked_count[0] += 1
            return None
        
        info = json.loads(r.stdout)
        isp_org = ((info.get("isp", "") + " " + info.get("org", "")).lower())
        
        # Skip datacenter IPs
        for kw in DC_KEYWORDS:
            if kw in isp_org:
                with lock:
                    checked_count[0] += 1
                return None
        
        country = info.get("countryCode", "?")
        isp = info.get("isp", "?")
        city = info.get("city", "?")
        region = info.get("regionName", "?")
        
        with lock:
            checked_count[0] += 1
            print(f"  [{checked_count[0]}/{total_count[0]}] {proxy:25s} — RESIDENTIAL: {isp} ({city}, {region}, {country})")
        
        # Step 2: Test HTTPS support (generic)
        r2 = subprocess.run(
            ["timeout", "12", "curl", "-s", "-x", f"socks5h://{proxy}",
             "-o", "/dev/null", "-w", "%{http_code}",
             "https://httpbin.org/ip"],
            capture_output=True, text=True, timeout=15
        )
        https_status = r2.stdout.strip() if r2.returncode == 0 else "fail"
        
        # Step 3: If HTTPS works, test ChatGPT
        chatgpt_status = "skip"
        if https_status == "200":
            r3 = subprocess.run(
                ["timeout", "15", "curl", "-s", "-x", f"socks5h://{proxy}",
                 "-o", "/dev/null", "-w", "%{http_code}",
                 "-H", "User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
                 "https://chatgpt.com/"],
                capture_output=True, text=True, timeout=20
            )
            chatgpt_status = r3.stdout.strip() if r3.returncode == 0 else "fail"
        
        result = {
            "proxy": proxy,
            "isp": isp,
            "city": city,
            "region": region,
            "country": country,
            "https": https_status,
            "chatgpt": chatgpt_status,
        }
        
        with lock:
            results.append(result)
            status_str = f"HTTPS={https_status}"
            if https_status == "200":
                status_str += f", ChatGPT={chatgpt_status}"
            print(f"    → {proxy}: {status_str}")
        
        return result
    except Exception as e:
        with lock:
            checked_count[0] += 1
        return None

def main():
    print("=" * 60)
    print("FAST PARALLEL PROXY SCAN")
    print("=" * 60)
    
    # Fetch proxies
    print("\n[Step 1] Fetching proxy lists...")
    all_proxies = set()
    
    sources = [
        ("ProxyScrape US SOCKS5", "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks5&timeout=10000&country=US"),
        ("ProxyScrape All SOCKS5 (global)", "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks5&timeout=10000"),
    ]
    
    for name, url in sources:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=15) as resp:
                text = resp.read().decode("utf-8", errors="ignore")
            for line in text.split("\n"):
                line = line.strip()
                if line and ":" in line and not line.startswith("#"):
                    all_proxies.add(line)
            print(f"  {name}: OK, total unique: {len(all_proxies)}")
        except Exception as e:
            print(f"  {name}: FAILED ({e})")
    
    # Prioritize likely residential IP ranges
    residential_prefixes = [
        "24.", "50.", "66.", "67.", "68.", "70.", "71.", "72.", "73.", "74.", "75.", "76.",
        "96.", "97.", "98.", "99.", "107.", "108.", "174.", "184.",
    ]
    
    proxies_list = list(all_proxies)
    likely_residential = [p for p in proxies_list if any(p.startswith(pfx) for pfx in residential_prefixes)]
    others = [p for p in proxies_list if not any(p.startswith(pfx) for pfx in residential_prefixes)]
    
    # Check residential-looking IPs first, then a sample of others
    # Limit others to 500 to keep total manageable
    to_check = likely_residential + others[:500]
    
    total_count[0] = len(to_check)
    print(f"\nTotal proxies to check: {len(to_check)} (likely residential: {len(likely_residential)}, others sample: {min(500, len(others))})")
    
    # Parallel check with 30 workers
    print(f"\n[Step 2] Checking with 30 parallel workers...")
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=30) as executor:
        futures = {executor.submit(check_one_proxy, p): p for p in to_check}
        concurrent.futures.wait(futures)
    
    # Results
    print("\n" + "=" * 60)
    print("FINAL RESULTS")
    print("=" * 60)
    
    if not results:
        print("\nNo residential proxies found at all.")
        return
    
    print(f"\nResidential proxies found: {len(results)}")
    
    https_ok = [r for r in results if r["https"] == "200"]
    chatgpt_ok = [r for r in results if r["chatgpt"] in ("200", "403")]
    
    print(f"With HTTPS support: {len(https_ok)}")
    print(f"ChatGPT accessible: {len(chatgpt_ok)}")
    
    print("\n--- All residential proxies ---")
    for r in sorted(results, key=lambda x: (x["chatgpt"] not in ("200", "403"), x["https"] != "200")):
        marker = "★" if r["chatgpt"] in ("200", "403") else ("◆" if r["https"] == "200" else " ")
        print(f"  {marker} socks5://{r['proxy']:25s} | {r['isp']:30s} | {r['city']}, {r['region']}, {r['country']} | HTTPS={r['https']} ChatGPT={r['chatgpt']}")
    
    if chatgpt_ok:
        print("\n★ BEST PROXIES (can access ChatGPT):")
        for r in chatgpt_ok:
            print(f"  PROXY=socks5://{r['proxy']}  # {r['isp']} ({r['city']}, {r['region']})")
    elif https_ok:
        print("\n◆ PROXIES WITH HTTPS (ChatGPT may work via Playwright):")
        for r in https_ok:
            print(f"  PROXY=socks5://{r['proxy']}  # {r['isp']} ({r['city']}, {r['region']}) — ChatGPT curl status: {r['chatgpt']}")

if __name__ == "__main__":
    main()
