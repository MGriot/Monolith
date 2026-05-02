from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
        # Capture console logs and network failures
        logs = []
        page.on("console", lambda msg: logs.append(f"[{msg.type}] {msg.text}"))
        page.on("pageerror", lambda err: logs.append(f"[JS ERROR] {err.message}"))
        page.on("requestfailed", lambda req: logs.append(f"[REQ FAILED] {req.method} {req.url} - {req.failure.error_text}"))

        print("Navigating to http://localhost:5173/login...")
        try:
            # Go to /login directly to avoid redirect logic noise
            page.goto('http://localhost:5173/login')
            
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
            
            page.screenshot(path='final_verification.png', full_page=True)
            print("Screenshot saved as final_verification.png")
            
        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    run()
