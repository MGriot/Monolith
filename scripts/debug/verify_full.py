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
        
        # Capture console logs and network failures
        logs = []
        page.on("console", lambda msg: logs.append(f"[{msg.type}] {msg.text}"))
        page.on("pageerror", lambda err: logs.append(f"[JS ERROR] {err.message}"))
        page.on("requestfailed", lambda req: logs.append(f"[REQ FAILED] {req.method} {req.url} - {req.failure.error_text}"))

        print(f"Navigating to {BASE}/login...")
        try:
            # Go to /login directly to avoid redirect logic noise
            page.goto(BASE + '/login')
            
            # Wait for 10 seconds to catch any delayed errors or HMR issues
            print("Waiting 10s for potential errors...")
            time.sleep(10)
            
            print("\n--- Browser Logs (Console + JS + Network) ---")
            for log in logs:
                print(log)
            
            # Check for visibility of key elements
            login_visible = page.locator('text=Login').first.is_visible()
            email_visible = page.locator('id=email').is_visible()
            
            print(f"\nLogin text visible: {login_visible}")
            print(f"Email input visible: {email_visible}")
            
            page.screenshot(path=os.path.join(OUT, 'final_verification.png'), full_page=True)
            print("Screenshot saved as final_verification.png")
            
        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    run()
