from playwright.sync_api import sync_playwright
import time
import os

# Settings come from the environment, never from this file:
#   BASE_URL (default http://localhost:5173), MONOLITH_EMAIL, MONOLITH_PASSWORD
BASE = os.environ.get("BASE_URL", "http://localhost:5173").rstrip("/")
EMAIL = os.environ.get("MONOLITH_EMAIL", "")
PASSWORD = os.environ.get("MONOLITH_PASSWORD", "")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "output")
os.makedirs(OUT, exist_ok=True)

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
        # Capture console logs
        logs = []
        page.on("console", lambda msg: logs.append(f"[{msg.type}] {msg.text}"))
        page.on("pageerror", lambda err: logs.append(f"[ERROR] {err.message}"))

        print(f"Navigating to {BASE}/login...")
        try:
            page.goto(BASE + '/login', wait_until='networkidle')
            # Wait a bit more for potential async rendering errors
            time.sleep(5)
            
            print("\n--- Browser Console Logs ---")
            for log in logs:
                print(log)
            
            print("\n--- Page Structure ---")
            root_html = page.locator('#root').inner_html()
            print(f"Root Div Inner HTML (length: {len(root_html)}):")
            print(root_html if root_html else "(empty)")
            
            page.screenshot(path=os.path.join(OUT, 'debug_console.png'), full_page=True)
            
        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    run()
